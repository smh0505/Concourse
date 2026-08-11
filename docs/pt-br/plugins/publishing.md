# Publicação

## Instalação livre por URL (sempre disponível)

Qualquer pessoa pode instalar seu plugin hoje sem estar listada em lugar nenhum - o diálogo "Add
Plugin" do Concourse aceita uma URL direta para um manifesto `plugin.json`. Publique uma release
no GitHub com seu `.wasm` compilado e o manifesto como assets da release, compartilhe a URL do
asset do manifesto, pronto. Este é um caminho de instalação real e de primeira classe, não um
substituto - um autor de plugin não precisa estar em nenhum registro para ser instalável.

Para que a verificação de atualização funcione bem contra uma URL livre, publique releases da
forma normal (versões marcadas, ex.: `v0.2.0`) e aponte as pessoas para a URL do asset daquela tag
específica em vez de um link `.../releases/latest/...`, para que uma instalação específica
permaneça fixada ao que ela realmente foi instalada a partir de.

### Assinatura de código (recomendado)

Se o CI do repositório do seu plugin atesta a procedência da build de seus artefatos de release
(ex.: [`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)), o
Concourse exibe isso como verificação consultiva na UI de confirmação de instalação - prova de
que o `.wasm` que um usuário está prestes a instalar realmente veio do CI do seu próprio
repositório, não de uma cópia adulterada. Isso não é obrigatório, mas é a única coisa que uma
instalação por URL livre não consegue obter de outra forma e que uma entrada de registro consegue
(veja [Modelo de Segurança](./security-model)).

## O registro curado

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) é uma lista
curada manualmente e fixada por hash que recebe verificação de conteúdo obrigatória em tempo de
instalação (uma incompatibilidade é rejeitada de imediato, não apenas sinalizada) - uma garantia
significativamente mais forte que uma instalação por URL livre. Honestamente, no momento em que
isto foi escrito, ele se documenta como revisado por uma única pessoa (`smh0505`, o mesmo
mantenedor do próprio Concourse) em vez de um processo aberto de submissão pela comunidade -
"revisado" significa que alguém realmente leu o código-fonte daquela versão específica fixada, o
que não escala para aceitar pull requests arbitrários de terceiros sem antes mudar essa política.
Se você quiser que seu plugin seja considerado para inclusão, abra uma issue naquele repositório
em vez de presumir que um PR adicionando sua própria entrada será aceito como está.

### O que uma listagem realmente fixa

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin",
  "kind": "source",
  "repo": "you/your-plugin-repo",
  "manifestUrl": "https://github.com/you/your-plugin-repo/releases/download/v0.2.0/plugin.json",
  "wasmSha256": "<sha256 of the pinned .wasm, computed by the reviewer>"
}
```

`manifestUrl` sempre aponta para um asset de release específico e imutável - nunca
`.../latest/...` - já que todo o propósito de uma entrada curada é que o que é instalado hoje seja
exatamente o que foi revisado, não o que quer que você publique em seguida. `wasmSha256` é
calculado a partir do artefato real da sua release por quem quer que o revise, depois verificado
contra os bytes realmente baixados a cada instalação através deste registro.

### Mantendo uma listagem atualizada

Se seu plugin de fato entrar na lista, o próprio CI do registro pode detectar automaticamente
suas novas releases (via um `repository_dispatch` que seu workflow de release envia) e abrir um
PR de atualização de versão contra o registro automaticamente - buscando novamente, recalculando
o hash e refixando o asset da sua nova release para revisão, em vez de alguém precisar notar que
você lançou uma atualização. Esse PR ainda precisa de uma fusão humana, com o mesmo padrão de
revisão de uma listagem inicial.
