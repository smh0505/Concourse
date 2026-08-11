# Referência de Manifesto

Todo plugin - TypeScript embutido, WASM, ou um tema somente-dados - é descrito por um manifesto
`plugin.json`. Esta página documenta todos os campos que o loader do Concourse entende (fonte:
a interface `PluginManifest` de `src/plugins/manifest.ts`).

## Campos principais (todo plugin)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id` | `string` | sim | Identificador único. Usado como o nome do diretório de instalação para plugins WASM - mantenha-o seguro para nomes de arquivo. |
| `name` | `string` | sim | Nome de exibição mostrado em Settings. |
| `version` | `string` | sim | SemVer simples, independente da versão do próprio aplicativo. Veja [versionamento](#versioning) abaixo. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | sim | Qual capacidade este plugin fornece - determina o que seu módulo/componente de entrada deve exportar. |
| `entry` | `string` | sim | Caminho para o arquivo `.wasm` compilado, relativo à própria pasta do plugin. |
| `runtime` | `"wasm" \| "data"` | não | Defina `"wasm"` para um plugin WASM, ou `"data"` para um manifesto de tema sem código (sem `entry` a carregar - `cssVariables` *é* o plugin inteiro). Um manifesto de terceiros deve sempre definir um destes dois. (`"ts"`/ausente é um terceiro valor que o loader também reconhece, mas significa um módulo TypeScript de tempo de build empacotado no próprio aplicativo - somente interno, nunca algo que você definiria em um manifesto que está distribuindo.) |
| `installable` | `boolean` | não | Verdadeiro se este plugin implementa o ciclo de vida de instalação/desinstalação (`install()`/`uninstall()`/`isInstalled()`) - determina se a UI genérica do botão "Install" é mostrada automaticamente. |

Manifestos de tema têm seu próprio conjunto dedicado de campos (`cssVariables`/`cardVisual`/
`fontFaces`) - veja [Manifestos de Tema](./theme-manifests) em vez desta página para esses.

## Campos de plugin WASM

| Campo | Tipo | Notas |
|---|---|---|
| `settingsSchema` | array de `{ key, label, type? }` | Declara configurações personalizáveis pelo usuário (ex.: uma chave de API) - o host renderiza um formulário de configurações genérico a partir disso, em vez de seu plugin precisar de sua própria UI de configurações personalizada. `type: "password"` mascara a entrada. |
| `capabilities` | `string[]` | Quais capacidades de host controladas este plugin realmente chama. Hoje apenas `"run-programs"` (controla `spawn-process`/`run-and-wait`) - veja [Modelo de Segurança](./security-model). O host impõe isso independentemente do que você declarar aqui; este campo apenas determina se a UI de confirmação de instalação pede uma concessão explícita ao usuário. |

`pathScopes`/`httpScopes` (acesso de leitura declarado além do seu próprio diretório de plugin, e
hosts de rede permitidos) são exibidos no diálogo de confirmação de instalação para visibilidade
do usuário, mas são calculados pelo host a partir das requisições reais do seu plugin em nível
WIT, não declarados diretamente em `plugin.json` - veja [Modelo de Segurança](./security-model)
para como o escopo realmente funciona.

## Campos adicionados pelo host (nunca defina estes você mesmo)

| Campo | Tipo | Notas |
|---|---|---|
| `sourceUrl` | `string` | A URL exata de onde isso foi instalado - adicionada pelo host no momento da instalação para que uma verificação de atualização posterior possa buscar novamente e comparar versões. |
| `installedViaRegistry` | `boolean` | Verdadeiro se instalado pelo registro curado com hash fixado em vez de uma URL colada livremente - muda como funciona a verificação de atualização (um `sourceUrl` fixado pelo registro tem SHA de commit e é congelado para sempre; verificar uma atualização significa buscar novamente a entrada *atual* do registro para este id, não buscar novamente `sourceUrl`). |

## Exemplo: um manifesto mínimo de plugin de source

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Veja [Manifestos de Tema](./theme-manifests) para um exemplo de manifesto de tema.

## Versionamento {#versioning}

Versões de plugins são SemVer simples, rastreadas independentemente da versão do próprio
aplicativo:

- **Patch**: correção de bug, sem mudança de manifesto/comportamento.
- **Minor**: nova capacidade, retrocompatível - ainda funciona contra a mesma interface WIT do
  host (plugins WASM) ou a forma de `PluginBase` (plugins TS).
- **Major**: mudança incompatível - a forma do manifesto muda, ou (plugins WASM) o plugin agora
  requer uma versão de interface `wit/plugin.wit` que uma build mais antiga do Concourse não tem.
  Este é o sinal de "não instale isso em uma build de aplicativo mais antiga."

Plugins WASM instalados separadamente e manifestos de tema somente-dados convencionalmente
começam em `0.1.0`/`1.0.0` respectivamente - um manifesto de tema somente-conteúdo é estável o
suficiente para começar em `1.0.0`, enquanto um plugin WASM com lógica real de
instalação/inicialização geralmente começa em `0.1.0` até ser comprovado em uso real.
