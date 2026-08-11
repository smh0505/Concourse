# Plugins e Temas

Settings tem um painel com abas cobrindo todo tipo de plugin: **Source**, **Theme**, **Metadata
Provider**, **Controller** e **Wrapper**. Se você está construindo um plugin em vez de instalar
um, veja a [Documentação de Plugins](/pt-br/plugins/) - esta página é o lado voltado ao usuário.
Veja [Plugins Oficiais](./official-plugins) para a lista atual de plugins/temas mantidos.

## Instalando um plugin

Clique em "Add Plugin" em qualquer aba. Você tem duas opções:

- **Registro curado** - uma lista revisada e verificada por hash de plugins confiáveis. Escolha
  um e clique em Install; o Concourse verifica o conteúdo dele contra um hash fixado antes de
  instalar, então o que você recebe é exatamente o que foi revisado.
- **Colar uma URL de manifesto** - instale qualquer outra coisa colando um link direto para seu
  `plugin.json`. Isso funciona para qualquer plugin, listado no registro ou não, mas pula a
  verificação de hash que o caminho do registro oferece - você está confiando diretamente em
  quem publicou aquela URL. O Concourse ainda mostra o que o plugin declara precisar (acesso a
  arquivos/registro/rede, se pode executar outros programas) antes de você confirmar.

## Habilitando/desabilitando e ordenando

- Plugins de **Source** e **Metadata Provider** são independentemente multi-habilitados (caixas
  de seleção) - execute vários plugins de fonte e vários provedores de metadados ao mesmo tempo.
  A ordem deles importa: para plugins de fonte, decide qual vence quando o mesmo jogo é
  encontrado por mais de um (veja [deduplicação](./library#deduplication-across-sources)); para
  provedores de metadados, decide qual resposta vence por campo (descrição, data de lançamento,
  arte de capa/fundo) quando mais de um tem algo a dizer. Reordene qualquer uma das listas com as
  setas ao lado de cada entrada.
- Plugins de **Theme** e **Controller** são exclusivos (rádio) - você está sempre navegando com
  uma skin e usando um mapeamento de controle físico por vez.
- Plugins de **Wrapper** (camadas de compatibilidade, ex.: um emulador de localidade) são
  multi-habilitados, cada um instalável/gerenciável independentemente, e selecionáveis por jogo a
  partir do formulário de edição daquele jogo.

## Atualizações

O Concourse verifica atualizações de plugins/temas automaticamente (início do app, foco na janela
do app, e sempre que você abre Settings ou o diálogo Add Plugin) e mostra um selo "Update to
vX.Y.Z" ao lado de qualquer coisa com uma versão mais nova disponível. Clique nele para atualizar
no local.

## Desinstalando

Todo plugin/tema instalado (não embutido) tem uma ação Remove/Uninstall em sua própria linha.
Temas e plugins de fonte/metadados/wrapper que gerenciam seus próprios arquivos baixados (ex.: o
runtime instalado de um wrapper) também limpam esses arquivos, não apenas a entrada do manifesto.
