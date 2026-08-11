# Visão Geral da Arquitetura de Plugins

O Concourse reúne jogos de várias fontes em uma única biblioteca, e se re-personaliza, através de
um único sistema de plugins com cinco tipos. Todo tipo compartilha um formato de manifesto e um
loader; o que difere é o contrato que um plugin daquele tipo implementa.

## Os cinco tipos de plugin

| Tipo | Função | Seleção |
|---|---|---|
| `source` | Escaneia uma plataforma (Steam, GOG, Epic, ...) em busca de jogos instalados, os inicia | multi-habilitado |
| `theme` | Personaliza cores/fontes/visuais de card | exclusivo (um ativo por vez) |
| `metadata` | Busca descrição/data de lançamento/arte de um jogo em um banco de dados externo | multi-habilitado |
| `controller` | Mapeia botões/eixos físicos do gamepad para navegação no Big Picture | exclusivo |
| `wrapper` | Inicia um jogo através de uma camada de compatibilidade que ele mesmo gerencia (ex.: um emulador de localidade) | multi-habilitado |

Plugins de source e provedor de metadados são independentemente **multi-habilitados** (caixas de
seleção em Settings) - você pode executar vários plugins de fonte e vários provedores de
metadados ao mesmo tempo, cada um contribuindo com jogos/campos que os outros não têm. Plugins de
tema e mapeamento de controle são **exclusivos de seleção única** (rádio) - você está sempre
navegando com uma skin e um esquema de entrada física por vez.

## Duas formas de distribuir um plugin

1. **Plugin WASM** - um componente `.wasm` instalado separadamente, baixado por URL (ou pelo
   registro curado) em tempo de execução, rodando em uma instância sandboxed do Component Model
   do [wasmtime](https://wasmtime.dev/). Este é o caminho hoje para plugins de terceiros
   `source`/`wrapper`/`metadata` - veja [Primeiros Passos](./getting-started) e a referência de
   [Interface WIT](./wit-interface).
2. **Manifesto de tema somente-dados** - para plugins do tipo `theme` especificamente, um
   manifesto pode ser JSON puro (`cssVariables`/`cardVisual`/`fontFaces`, sem nenhum código) se
   não precisar da maquinaria completa de plugin WASM. Veja
   [Manifestos de Tema](./theme-manifests).

Plugins WASM existem apenas para os três tipos para os quais um
[WIT world](https://component-model.bytecodealliance.org/design/wit.html) já foi definido até
agora: `source`, `wrapper`, `metadata`. Construir um plugin `theme` de terceiros hoje significa
usar o caminho do manifesto somente-dados acima. Atualmente não há caminho de terceiros para
plugins de mapeamento de `controller` - os mapeamentos de gamepad embutidos do Concourse são
compilados diretamente no aplicativo, e adicionar um novo hoje significa contribuir com o próprio
Concourse em vez de distribuir um plugin separado.

## Por que WASM, e não código nativo ou scripting

O Concourse já considerou executáveis nativos baixáveis e uma linguagem de script para plugins de
terceiros. Ambos foram rejeitados pelo mesmo motivo: um plugin precisa de acesso real a
sistema de arquivos/registro/rede/processo para fazer seu trabalho (escanear uma instalação do
Steam, iniciar um jogo através de um wrapper), e nenhuma das opções consegue conceder acesso
*com escopo definido* - um binário nativo ou um script sem sandbox recebe os mesmos privilégios
que o aplicativo inteiro. WASM via Component Model oferece um sandboxing genuíno baseado em
capacidades: um plugin só recebe uma função de interface `host` se o lado Rust do Concourse a
implementar e conceder, e mesmo assim, a maioria das funções tem escopo ainda mais restrito por
plugin (veja [Modelo de Segurança](./security-model)).

## A seguir

- [Primeiros Passos](./getting-started) - construa um plugin de source WASM mínimo do início ao fim
- [Referência de Manifesto](./manifest-reference) - todos os campos de `plugin.json`
- [Manifestos de Tema](./theme-manifests) - `cssVariables`/`cardVisual`/`fontFaces` para plugins de tema
- [Interface WIT](./wit-interface) - a superfície real de capacidades do host e os worlds de plugin
- [Modelo de Segurança](./security-model) - escopos de caminho, controle de capacidades, assinatura
- [Publicação](./publishing) - submetendo ao registro curado de plugins
