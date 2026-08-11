# Biblioteca e Jogos

## Adicionando jogos

**Manualmente**: o botão "Add Game" pede um título e um caminho de executável (ou uma URI de
launcher como `steam://run/<appid>` - veja [abaixo](#uri-launches-vs-direct-executables)). Use
isso para qualquer coisa que um plugin de fonte ainda não cubra.

**Via um plugin de fonte**: depois de instalar e habilitar um plugin de fonte (Settings →
Source), Settings tem um botão "Scan Now" que encontra todo jogo que aquele plugin conhece e os
adiciona à sua biblioteca. Executar um escaneamento novamente mais tarde encontra jogos
recém-instalados sem duplicar os que já estão na sua biblioteca (veja deduplicação abaixo).

## Editando um jogo

Abra a página de detalhes de qualquer jogo (clique na capa/título, ou no ícone de Edit) e alterne
para o modo de edição. Você pode sobrescrever o título, URLs de arte de capa/fundo, descrição
(com suporte a Markdown), data de lançamento e plataforma. Um botão "Fetch Metadata" executa
novamente seus provedores de metadados habilitados (Settings → Metadata Provider) contra o título
atual e preenche o que encontrar - útil se a busca automática perdeu algo, ou se os dados de um
provedor mudaram desde que você adicionou o jogo pela primeira vez.

## Tags e Collections

- **Tags** são rótulos livres ("Co-op", "Backlog", "Completed") - crie/renomeie/exclua na aba
  Tags da barra lateral, atribua por jogo a partir da página de detalhes daquele jogo.
- **Collections** agrupam uma série/franquia ("Final Fantasy") - um conceito distinto de tags,
  gerenciado da mesma forma a partir de sua própria aba na barra lateral.

Ambos suportam busca/filtragem da visão da biblioteca junto com a busca simples por título.

## Deduplicação entre fontes {#deduplication-across-sources}

Se o mesmo jogo for adicionado manualmente e depois encontrado por um escaneamento de plugin de
fonte (ou encontrado por dois plugins de fonte diferentes), o Concourse os mescla em uma única
entrada em vez de mostrar duplicatas - correspondência feita pelo título. Quando mais de uma
fonte encontra o mesmo título, o plugin que está mais adiante na ordem de prioridade da sua aba
Source vence para o caminho de inicialização/plataforma (reordene os plugins lá se quiser que
outro tenha prioridade).

Se você realmente quer que duas entradas com o mesmo título permaneçam separadas (ex.: duas
versões diferentes do mesmo jogo), o formulário de edição de um jogo tem uma caixa de seleção
"Keep separate from plugin scans" (`skip_dedup`) - marque-a para excluir aquela entrada específica
da lógica de mesclagem.

## Tradução offline {#offline-translation}

O título e a descrição de um jogo podem ser traduzidos para o idioma atual da interface
inteiramente offline - sem serviço de tradução externo, nada sai da sua máquina. Na página de
detalhes de um jogo, o botão "Translate" abre um menu com três grupos (role ou use as setas do
teclado para mover entre eles):

- **Translate** - traduz apenas o título, apenas a descrição, ou ambos. Executar isso novamente
  com um modelo diferente selecionado sobrescreve a tradução anterior daquele campo.
- **Show** - alterna entre o texto traduzido e o original, por campo ou ambos juntos. Essa escolha
  é lembrada por jogo, então reabrir um jogo mais tarde mostra o que você escolheu por último
  especificamente para ele.
- **Remove** - limpa uma tradução em cache de um campo (ou ambos), revertendo para o original sem
  nada em cache.

**Configuração única** (Settings): baixe o mecanismo de tradução uma vez (um download pequeno e
único), depois escolha um modelo no menu suspenso e baixe-o também. Alguns níveis de modelo são
oferecidos, trocando tamanho/RAM por qualidade - todos rodam inteiramente na CPU, então um nível
menor traduz mais rápido e usa menos memória enquanto um jogo roda ao lado dele. Um nível é
sem censura, destinado a traduzir as próprias descrições de jogos NSFW sem que um modelo ajustado
para segurança recuse traduzir texto legítimo de terceiros.

Uma tradução em cache está vinculada ao idioma da interface para o qual foi feita - trocar o
idioma da interface, ou editar o título/descrição original de um jogo, a invalida automaticamente
(traduza novamente para obter uma nova para o novo idioma ou texto editado).

## Inicializações via URI vs. executáveis diretos {#uri-launches-vs-direct-executables}

Alguns plugins de fonte (Steam, Epic) iniciam um jogo através de uma URI de plataforma
(`steam://run/...`, `com.epicgames.launcher://...`) em vez de um caminho `.exe` direto, já que é
assim que a própria plataforma espera ser instruída a iniciar um jogo. O rastreamento de tempo de
jogo funciona de forma diferente para esses casos - veja
[Rastreamento de Tempo de Jogo](#playtime-tracking) abaixo.

## Rastreamento de Tempo de Jogo {#playtime-tracking}

Para um caminho de executável direto, o Concourse aguarda o processo real e registra uma sessão
verdadeira (início/fim/duração) assim que ele é encerrado. Para um jogo iniciado via URI, não há
um identificador de processo para aguardar da mesma forma, então uma sessão não é registrada da
mesma maneira - os números de "Recently Played"/horas totais na aba Stats refletem o que é
realmente rastreável por método de inicialização.
