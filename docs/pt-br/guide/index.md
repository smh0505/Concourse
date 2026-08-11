# Primeiros Passos

Concourse é um aplicativo desktop que reúne jogos de várias fontes em uma única biblioteca, com um
modo "Big Picture" em tela cheia ao estilo console para navegação com foco em controle. Este guia
cobre o uso do aplicativo no dia a dia. Se você está construindo um plugin, veja a
[Documentação de Plugins](/pt-br/plugins/).

## Instalando

Baixe o instalador mais recente na
[página de Releases](https://github.com/smh0505/Concourse/releases/latest) (por enquanto, apenas
Windows). O Concourse verifica e instala suas próprias atualizações automaticamente uma vez em
execução - não é necessário baixar manualmente novamente após a primeira instalação.

## Primeira execução

Na primeira inicialização, sua biblioteca está vazia. Você pode populá-la de duas formas, e a
maioria das pessoas acaba usando ambas:

1. **Adicionar um jogo manualmente** - o botão "Add Game" (barra lateral) pede um título e um
   caminho de executável, para qualquer coisa que um plugin de fonte ainda não cubra (um
   emulador, um download do itch.io, ...).
2. **Instalar um plugin de fonte** - Settings → aba Source permite instalar um plugin que escaneia
   uma plataforma existente (Steam, GOG, Epic, ...) em busca de jogos que você já possui, e
   mantém essa lista sincronizada em escaneamentos posteriores. Veja [Biblioteca e Jogos](./library)
   para como funcionam o escaneamento/deduplicação, e [Plugins e Temas](./plugins-and-themes)
   para como de fato instalar um.

## Onde as coisas ficam

- **Library** (barra lateral) - sua grade/lista de jogos, a visão padrão.
- **Stats** - total de jogos/horas, Mais Jogados, Jogados Recentemente.
- **Tags** / **Collections** - dois conceitos de organização separados: tags são rótulos livres
  ("Co-op", "Backlog"); collections agrupam uma série/franquia ("Final Fantasy"). Gerencie ambos
  a partir de suas próprias abas na barra lateral, ou atribua-os por jogo a partir da página de
  detalhes de um jogo.
- **Settings** - tudo relacionado a plugins/temas/preferências do aplicativo, veja
  [Plugins e Temas](./plugins-and-themes); também é onde você configura a tradução offline - veja
  [Biblioteca e Jogos](./library#offline-translation).
