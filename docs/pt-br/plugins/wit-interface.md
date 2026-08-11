# Interface WIT

Este é o contrato [WIT](https://component-model.bytecodealliance.org/design/wit.html) real contra
o qual todo plugin WASM é construído - a fonte da verdade é `src-tauri/wit/plugin.wit` no
repositório principal; esta página o explica, mas esse arquivo é a autoridade caso os dois algum
dia divirjam.

## A interface `host`

Toda função de host abaixo é uma capacidade que o host Rust implementa e expõe ao seu plugin -
primitivas deliberadamente genéricas (registro/arquivo/processo/rede/armazenamento com escopo)
em vez de funções semânticas específicas de integração. Um plugin de source compõe essas por
conta própria (ex.: parseando o próprio formato VDF/XML de um fornecedor) em vez de o Concourse
escrever um módulo sob medida por fonte.

### Registro (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` é `"HKLM"` ou `"HKCU"`. Uma chave/valor ausente retorna `none`/uma lista vazia, não um
erro - "não existe" é um resultado normal e esperado (ex.: verificar se uma plataforma está
instalada de fato).

### Sistema de arquivos

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` retorna o próprio diretório gravável deste plugin
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - sempre implicitamente legível/gravável. Todo
outro caminho precisa cair dentro de um escopo declarado pelo seu manifesto, ou ser solicitado em
tempo de execução (veja [Modelo de Segurança](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Para um diretório descoberto apenas em tempo de execução (ex.: onde o usuário realmente instalou
o Steam) - o host só concede isso se reconhecer o id do seu plugin *e* o caminho passar por uma
verificação estrutural real para aquele fornecedor.

### Processo

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` é fire-and-forget (sem espera/código de saída) - corresponde a como `launch()` é
usado em outros lugares; o rastreamento de tempo de jogo baseado em pasta do próprio Concourse
cobre a duração da sessão separadamente. `run-and-wait` bloqueia até o processo encerrar, para
casos que genuinamente precisam disso (ex.: uma janela de instalador visível de terceiros que seu
plugin precisa saber que fechou antes de continuar). Ambos exigem a concessão de capacidade
`"run-programs"` - veja [Modelo de Segurança](./security-model).

### Rede

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` é para tudo que `http-get` não consegue expressar - cabeçalhos personalizados (um
token bearer de `Authorization`) ou um método não-GET com corpo (ex.: uma API de consulta baseada
em POST). Use `download-bytes` em vez de `http-get`/`http-request` para respostas binárias.

### Arquivos zip

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Juntas, essas cobrem o fluxo comum de "baixar um zip de release, extrair, e instalar" (usado por
plugins `wrapper` para suas próprias instalações gerenciadas). `unwrap-single-subdir` trata o
caso comum em que um zip de release envolve seu conteúdo em uma pasta de nível superior
correspondente ao nome do arquivo.

### Armazenamento com escopo

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Ambos automaticamente namespaced pelo host por id de plugin - seu plugin nunca pode ler ou
escrever as configurações de outro plugin ou dados por jogo de outro plugin, nem alcançar uma
tabela central do aplicativo diretamente.

## Os três worlds de plugin

Cada `kind` que um plugin WASM pode implementar exporta um destes worlds:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Espelha a interface `SourcePlugin` embutida em TypeScript - um plugin de source WASM é uma
implementação alternativa "plug-and-play" do mesmo contrato. Veja
[Primeiros Passos](./getting-started) para um passo a passo completo de implementação de um.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

Um wrapper de compatibilidade (ex.: um emulador de localidade) - totalmente autocontido.
`install()` baixa a última release, extrai, semeia uma configuração de perfil padrão se nenhuma
existir, e executa o instalador real do fornecedor para qualquer etapa de registro que só ele
pode fazer. Diferente de plugins de source, não há caminho de propriedade do host para passar em
lugar nenhum - o plugin sempre instala em (e resolve) o mesmo local determinístico sob seu
próprio `plugin-dir()`.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` retorna toda correspondência plausível - geralmente 0 ou 1, mas pode ser mais
quando as próprias listagens do seu provedor são genuinamente ambíguas (ex.: uma
duplicata/reedição compartilhando o mesmo título). O host escolhe automaticamente o único
candidato quando exatamente um retorna, mostra ao usuário um seletor quando mais de um retorna, e
pula seu provedor inteiramente quando nenhum retorna. `fetch-metadata-by-id` então busca os
metadados completos de um candidato específico pelo seu `id`.

## `game-entry` e `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
