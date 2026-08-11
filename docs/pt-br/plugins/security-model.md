# Modelo de Segurança

Instalação por URL de um plugin WASM ainda executa código arbitrário que você não escreveu - o
mesmo risco real de executar qualquer `.exe` baixado. O Concourse não finge que o sandbox WASM
sozinho resolve isso; esta página é o que ele de fato faz a respeito, e o que não faz.

## O sandbox do wasmtime em si

Todo plugin WASM roda dentro de uma instância do Component Model do
[wasmtime](https://wasmtime.dev/) sem nenhum acesso ambiente a nada - sem sistema de arquivos,
sem rede, sem gerar processos, nada, a menos que uma função `host` específica conceda isso. Esta
é a base: um plugin só pode fazer o que a interface `host` expõe (veja
[Interface WIT](./wit-interface)), nunca nada além disso, não importa o que o próprio código do
plugin tente.

## Escopo de caminho {#path-scoping}

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) é sempre implicitamente
legível/gravável - todo plugin recebe um diretório sandbox privado de graça. Qualquer coisa além
disso precisa de um dos seguintes:

- **Um escopo estático declarado** - um prefixo fixo de hive+chave de registro ou caminho de
  sistema de arquivos que um plugin genuinamente precisa em um local conhecido (ex.: chaves de
  registro fixas de fornecedor de uma plataforma, ou um diretório fixo de manifestos). Declarado
  uma vez, verificado pelo host a cada chamada de arquivo/registro.
- **Um escopo solicitado em tempo de execução** (`request-read-scope`) - para um diretório apenas
  descobrível em tempo de execução (onde a instalação do Steam do usuário realmente colocou suas
  pastas de biblioteca). O host só concede isso se reconhecer o id do plugin *e* o caminho
  solicitado passar por uma verificação estrutural real para aquele fornecedor (ex.: exigir um
  subdiretório `steamapps`) - um id de plugin não reconhecido é rejeitado de imediato, nunca
  confiado silenciosamente.

De qualquer forma, os escopos declarados no manifesto (ou exibidos na confirmação de instalação)
de um plugin são mostrados ao usuário antes de instalá-lo, então "o que isso pode realmente tocar
no meu disco" é visível de antemão, não apenas imposto silenciosamente.

## Controle de geração de processos

`spawn-process`/`run-and-wait` são controlados por trás de uma concessão explícita de capacidade
`"run-programs"` - um plugin declarando isso no campo `capabilities` de seu manifesto aciona um
prompt real de "este plugin executa outros programas no seu sistema" na UI de confirmação de
instalação, que o usuário precisa aceitar afirmativamente. O host impõe o controle
independentemente do que o manifesto declara (um plugin não pode simplesmente omitir o campo para
pular o prompt e ainda chamar a função) - o campo `capabilities` apenas controla se a UI pede a
concessão.

## Escopo de rede

`http-get`/`http-request`/`download-bytes` têm lista de permissões/limite de taxa por plugin, não
uma concessão geral de "pode alcançar toda a internet".

## O que isso *não* resolve: confiança, não apenas sandboxing

Escopo de caminho/processo/rede limita *o que* um plugin pode alcançar, mas não diz nada sobre se
o próprio código faz algo malicioso dentro daquele escopo (um plugin de source genuinamente
precisa de `spawn-process` para iniciar jogos - isso não é algo que um sandbox consiga distinguir
de iniciar outra coisa). Duas camadas adicionais tratam disso:

### Assinatura de código (consultiva)

Releases publicadas de plugins podem carregar uma atestação [Sigstore](https://www.sigstore.dev/)
- prova verificável de qual build de CI produziu um determinado binário `.wasm` e a partir de
qual commit de origem. Isso é **consultivo, não um portão obrigatório em tempo de instalação** - o
Concourse não recusa instalar um plugin não assinado, já que isso bloquearia igualmente um autor
de plugin que ainda não configurou a assinatura. A revisão consultiva aparece na UI de
confirmação de instalação, e *é* imposta de forma obrigatória para o registro curado abaixo.

### Registro curado (obrigatório)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) é uma lista
revisada e fixada por hash de plugins - cada entrada fixa o manifesto/WASM de um plugin a um SHA
de commit exato e hash de conteúdo. Instalar pelo registro (em vez de uma URL colada livremente)
**rejeita obrigatoriamente em caso de incompatibilidade de hash** - se o que é realmente servido
não corresponde mais ao que foi revisado, a instalação falha completamente em vez de avisar e
continuar. Remover uma entrada do registro *é* o mecanismo de revogação (apenas em tempo de
instalação - não alcança cópias já instaladas).

**Em resumo**: plugins instalados pelo registro recebem garantias de integridade reais e
impostas. Plugins instalados por URL livre recebem sandboxing e escopos declarados visíveis, mas
a decisão real de confiança ainda é sua - veja [Publicação](./publishing) se você quiser que seu
próprio plugin alcance o nível mais forte e revisado.
