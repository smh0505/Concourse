# Concourse

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[简体中文](README.zh-Hans.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*Esta tradução é uma tradução automática (a mesma abordagem divulgada usada nos próprios
idiomas da interface do app - veja [Localization](#funcionalidades) abaixo), ainda não
revisada por falantes nativos.*

Um aplicativo de desktop que reúne jogos de várias fontes (Steam, Epic, GOG, entradas manuais
e mais via plugins) em uma única biblioteca unificada, com um modo "Big Picture" ao estilo de
console, pensado primeiro para controle - no mesmo espírito do Playnite ou da própria
biblioteca da Steam.

O app principal se mantém enxuto; quase tudo além da biblioteca básica (scanners de fontes,
temas, provedores de metadados, mapeamentos de controle, wrappers de compatibilidade) é um
plugin.

## Funcionalidades

- **Núcleo da biblioteca** - "adicionar jogo" manual, armazenamento em SQLite, visualizações
  em grade e lista, marcação com tags, busca/filtragem
- **Metadados e mídia** - capa via SteamGridDB, descrição/gênero/data de lançamento via IGDB,
  substituição manual
- **Inicialização e rastreamento de tempo de jogo** - inicialização unificada
  independentemente da fonte (exe direto, URIs `steam://` da Steam, manipuladores de protocolo
  Epic/GOG, jogos iniciados via wrapper de compatibilidade), com rastreamento de tempo de jogo
  baseado no encerramento do processo ou em pasta, dependendo de como o jogo foi iniciado
- **Modo Big Picture** - interface em tela cheia navegável por controle, com grade de blocos e
  uma visualização em slideshow estilo coverflow, transição suave da arte de fundo, alternador
  de inicialização automática ao ligar
- **Wrappers de compatibilidade** - perfis Locale Remulator / Locale Emulator por jogo, para
  títulos que precisam de um idioma/região não padrão para funcionar
- **Sistema de plugins** - cinco tipos de plugin (fonte, tema, provedor de metadados,
  mapeamento de controle, wrapper de compatibilidade), carregados em tempo de build (plugins
  TypeScript empacotados em `src/plugins/`) ou em tempo de execução (plugins WebAssembly
  baixáveis - veja abaixo)
- **Localização** - interface disponível em 10 idiomas (inglês mais 9 idiomas traduzidos por
  máquina), um `--font-family` configurável pelo tema para re-skin de todo o app, e uma
  camada de tema somente de dados (`cssVariables` + uma substituição opcional de `cardVisual`
  em JSON-AST para a região da capa, sem necessidade de código)
- **Tradução offline** - o título/descrição de um jogo podem ser traduzidos para o idioma
  atual da interface inteiramente no próprio dispositivo (sem serviço externo): baixe uma vez
  o binário de servidor pré-compilado do llama.cpp, escolha um modelo (vários níveis
  amigáveis à CPU, um sem censura para descrições de jogos NSFW), e então
  traduza/alterne a exibição/revogue o título e o conteúdo de forma independente a partir da
  página de detalhes do jogo. As traduções são mantidas por jogo e por campo, e são
  invalidadas automaticamente ao trocar de idioma ou editar o original
- **Atualização automática** - tanto o app em si quanto cada plugin/tema instalado verificam e
  aplicam atualizações automaticamente

## Stack tecnológica

- **Tauri 2** (backend em Rust) + frontend **Vue 3** (`<script setup>`, TypeScript)
- **SQLite** via `tauri-plugin-sql`, com o esquema evoluindo por meio de migrações versionadas
- **Pinia** para o estado do frontend, um store por domínio
- **wasmtime** (Wasm Component Model) para o sistema de plugins baixáveis em tempo de execução

## Desenvolvimento

Este repositório usa [`bun`](https://bun.sh), não npm/yarn/pnpm.

```sh
bun install          # instalar dependências JS
bun run dev           # apenas o servidor de desenvolvimento Vite (frontend)
bunx tauri dev         # app completo (frontend + backend Rust), com hot-reload
bunx tauri build        # binário de desktop de produção
```

A partir de `src-tauri/`: `cargo check` para uma verificação rápida de compilação do Rust sem
um build completo.

## Arquitetura de plugins

Cada plugin possui um manifesto `plugin.json` (`{ id, name, version, kind, entry }`) e
implementa uma de cinco interfaces conforme o `kind`:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, para integrações de fontes de jogos
  (ativação múltipla)
- `theme` - variáveis CSS (cores, fontes, bordas/raios) mais uma substituição opcional de
  `cardVisual` em JSON-AST para a região da capa (ativação única); um manifesto contendo
  apenas `cssVariables` não precisa de nenhum código. Substituições de slot de componente
  (trocar por um componente Vue personalizado inteiro) foram suportadas no início, mas foram
  descontinuadas em favor dessa camada de AST de vocabulário fechado - não existe nenhum
  caminho de código eval/executável para um tema injetar
- `metadata` - `fetchMetadata(title)`, para provedores de capa / descrição / gênero (ativação
  múltipla)
- `controller` - um `GamepadMapping` (índices de botões/eixos) para um layout físico de
  controle específico (ativação única)
- `wrapper` - wrappers de compatibilidade (ex.: Locale Remulator/Emulator) que gerenciam sua
  própria instalação e iniciam um executável alvo através de um perfil de idioma/região

Plugins de tempo de build ficam em `src/plugins/<id>/` e são descobertos via `import.meta.glob`
do Vite. Plugins de tempo de execução são componentes WebAssembly (tipos
`source`/`wrapper`/`metadata`) instalados a partir de uma URL de manifesto (Configurações →
a aba correspondente → Adicionar plugin) ou baixados/extraídos manualmente no diretório de
dados do app, carregados via um host `wasmtime` embutido no backend Rust. Temas somente de
dados (apenas `cssVariables`, sem código) são uma camada separada e sem código de instalação
por URL, que não precisa de nenhum sandboxing WASM.

### Plugins oficiais

Veja **[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)** no
site de documentação para a lista completa (links de repositório, links de download da versão
mais recente, instruções de instalação).

**Nota de segurança (Milestone 12, concluída):** o sandbox do Component Model do wasmtime
garante segurança de memória (um plugin não pode corromper a memória do host nem escapar de
sua própria execução), e toda função de host exposta a plugins que poderia causar dano real
agora tem controle de acesso:
- `spawn-process`/`run-and-wait` exigem uma concessão explícita e visível por plugin - um
  plugin precisa declarar `capabilities: ["run-programs"]` em seu manifesto, e o app se recusa
  a executar qualquer coisa em nome dele até que você realmente conceda a permissão (uma caixa
  de seleção na caixa de diálogo de confirmação de instalação para instalação por URL, ou uma
  linha "Permissão necessária" com um botão Conceder nas Configurações para um plugin já
  instalado).
- `write-file`/`remove-dir` são estritamente e incondicionalmente confinados ao próprio
  diretório do plugin, sem exceções. `read-file`/`list-dir`/`path-exists`/acesso ao registro
  são limitados a uma lista de permissões declarada no manifesto (`pathScopes`), mais, para o
  único plugin cujo local de instalação genuinamente não pode ser conhecido de antemão
  (Steam), uma solicitação de escopo em tempo de execução verificada - o host verifica uma
  assinatura estrutural real (um subdiretório `steamapps`) antes de conceder acesso, e rejeita
  de imediato qualquer id de plugin para o qual não tenha um validador.
- `http-get`/`http-request`/`download-bytes` são limitados a uma lista de permissões de nomes
  de host declarada no manifesto (`httpScopes`) - um plugin só pode alcançar os hosts que
  declara (correspondência exata ou subdomínio), não uma URL arbitrária controlada por um
  atacante.

Ainda assim, instale apenas plugins de fontes em que você confia plenamente - isso fecha "um
plugin pode alcançar silenciosamente qualquer lugar do seu sistema ou rede", não é um modelo
de confiança completo no nível de uma app store.

**Modelo de confiança (Milestone 13, concluído):** duas camadas complementares e
independentes.
- **Assinatura** - cada versão oficial de plugin é assinada com uma atestação de proveniência
  de build do [Sigstore](https://www.sigstore.dev/), vinculando o `.wasm` publicado ao commit
  exato e à execução de CI que o construiu. O Concourse verifica isso na instalação e mostra o
  resultado - **apenas informativo, não um bloqueio rígido**. Isso confirma que um artefato
  realmente veio da própria CI daquele repositório, sem modificações desde então (detecta
  adulteração, um token de release comprometido, um repositório sequestrado inserindo um build
  malicioso) - **não** garante as intenções do autor do repositório. O próprio código de um
  autor malicioso também recebe uma assinatura perfeitamente válida, já que sua própria CI
  realmente construiu e assinou exatamente o que ele mesmo commitou.
- **Registro curado** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry), uma
  lista mantida manualmente de plugins cuja versão fixada foi realmente lida, cada entrada
  travada em uma release específica e seu SHA256 real. A caixa de diálogo "Adicionar plugin"
  lista essas entradas ao lado do campo de URL livre; instalar a partir do registro é uma
  **rejeição rígida** em caso de divergência de hash, ao contrário da verificação informativa
  da assinatura - esse hash foi escolhido manualmente após revisão, então uma divergência é um
  sinal real de "isto não é o que foi revisado". Remover uma entrada do registro *é* uma
  revogação para instalações futuras (ainda não retroativa contra cópias já instaladas). A
  instalação por URL livre continua funcionando exatamente como antes de qualquer forma - o
  registro é um caminho adicional, mais confiável, não uma barreira obrigatória.

## Documentação

A documentação completa para desenvolvedores de plugins e usuários é publicada em
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** (código-fonte em
[`docs/`](../docs/), construído com VitePress) - um guia do usuário (instalação, gerenciamento da
biblioteca, modo Big Picture) e uma referência para desenvolvedores de plugins (visão geral da
arquitetura, um passo a passo inicial, a referência completa de manifesto/interface WIT, o
modelo de segurança, e como publicar um plugin).

## Status

Em desenvolvimento ativo, marco a marco. Veja
[`.claude/proposal.md`](../.claude/proposal.md) para a proposta de design original,
[`.claude/milestones.md`](../.claude/milestones.md) para o acompanhamento atualizado do progresso
em relação a ela, e [`.claude/devlog.md`](../.claude/devlog.md) para o histórico de
implementação/raciocínio por trás de cada item de marco.

Até o momento: a biblioteca principal, rastreamento de metadados/tempo de jogo, modo Big
Picture, o sistema de plugins (incluindo o pipeline de plugins de tempo de execução
WebAssembly e a instalação gerenciada dos wrappers de compatibilidade), sandboxing de
permissões de plugins WASM (Milestone 12), um modelo de confiança/assinatura de plugins
(Milestone 13), um trabalho contínuo de polimento da UI de desktop (Milestone 14), a camada de
tema JSON-AST substituindo a temática por troca de componentes (Milestones 17/19), um trabalho
de convenção de estilos compartilhados (Milestone 18), atualização automática do app +
plugins/temas (Milestone 20), localização em 10 idiomas mais tradução offline no próprio
dispositivo de títulos/descrições de jogos (Milestone 21), e este site de documentação
(Milestone 22) estão todos concluídos. Todos os plugins oficiais listados acima estão em
produção. O trabalho em aberto inclui um plugin de scanner de emulador/ROM e plugins de fonte
adicionais (Xbox/EA/Ubisoft, Milestone 16).

## Licença

MIT - veja [`LICENSE`](../LICENSE).

### Avisos de terceiros

O próprio código-fonte do Concourse é licenciado sob MIT; nenhum conteúdo de terceiros é
empacotado no repositório ou no binário compilado. O recurso de tradução offline
(Milestone 21) baixa dois tipos de conteúdo de terceiros diretamente para a sua máquina em
tempo de execução, cada um sob seus próprios termos separados - descrito aqui por
transparência, não porque o Concourse redistribua nada disso:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - o próprio mecanismo de
  tradução. O Concourse baixa o binário de release oficial pré-compilado para Windows a partir
  do GitHub e o executa como um subprocesso; nenhum código do llama.cpp é compilado no
  Concourse ou distribuído com ele.
- **Os pesos dos modelos**, baixados do Hugging Face conforme sua própria seleção em
  Configurações, cada um sob a licença de sua própria ficha de modelo -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` são todos Apache 2.0 (o Gemma 4 mudou
  especificamente para Apache 2.0 em abril de 2026, substituindo a licença mais restritiva
  sob a qual gerações anteriores do Gemma eram distribuídas). Os dois níveis sem censura
  (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) herdam a licença de seu modelo base;
  verifique a ficha de modelo do Hugging Face de cada um antes de usá-lo comercialmente.
