# Publication

## Installation libre par URL (toujours disponible)

N'importe qui peut installer votre plugin dès aujourd'hui sans être listé nulle part - la boîte de
dialogue « Add Plugin » de Concourse accepte une URL directe vers un manifeste `plugin.json`.
Publiez une release GitHub avec votre `.wasm` compilé et votre manifeste comme assets de release,
partagez l'URL de l'asset de release du manifeste, et voilà. C'est une voie d'installation réelle
et de premier ordre, pas un repli - un auteur de plugin n'a pas besoin d'être dans un quelconque
registre pour être installable.

Pour que la vérification des mises à jour fonctionne correctement contre une URL libre, publiez
les releases de façon normale (versions taguées, par ex. `v0.2.0`) et pointez les gens vers l'URL
d'asset propre à ce tag plutôt qu'un lien `.../releases/latest/...`, afin qu'une installation
spécifique reste épinglée à ce depuis quoi elle a réellement été installée.

### Signature de code (recommandée)

Si le CI du dépôt de votre plugin atteste la provenance de build pour ses artefacts de release
(par ex. [`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
Concourse affiche cela comme vérification indicative dans l'interface de confirmation
d'installation - une preuve que le `.wasm` qu'un utilisateur est sur le point d'installer provient
réellement du CI de votre dépôt, et non d'une copie altérée. Ce n'est pas requis, mais c'est la
seule chose qu'une installation par URL libre ne peut pas obtenir autrement et qu'une entrée de
registre peut apporter (voir [Modèle de sécurité](./security-model)).

## Le registre organisé

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) est une liste
organisée manuellement, épinglée par hash, qui bénéficie d'une vérification stricte du contenu au
moment de l'installation (un désaccord est rejeté purement et simplement, pas seulement signalé) -
une garantie significativement plus forte qu'une installation par URL libre. Honnêtement, au
moment de la rédaction, ce dépôt se décrit lui-même comme revu par une seule personne (`smh0505`,
le même mainteneur que Concourse lui-même) plutôt que comme un processus de soumission communautaire
ouvert - « revu » signifie que quelqu'un a réellement lu le code source de cette version épinglée
spécifique, ce qui ne s'adapte pas à l'acceptation de pull requests tierces arbitraires sans
changer d'abord cette politique. Si vous voulez que votre plugin soit considéré pour inclusion,
ouvrez une issue sur ce dépôt plutôt que de supposer qu'une PR ajoutant votre propre entrée sera
acceptée telle quelle.

### Ce qu'un listing épingle réellement

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

`manifestUrl` pointe toujours vers un asset de release spécifique et immuable - jamais
`.../latest/...` - puisque tout l'intérêt d'une entrée organisée est que ce qui est installé
aujourd'hui soit exactement ce qui a été revu, pas n'importe quoi que vous publiez ensuite.
`wasmSha256` est calculé à partir de votre artefact de release réel par la personne qui le revoit,
puis vérifié par rapport aux octets réellement téléchargés à chaque installation via ce registre.

### Garder un listing à jour

Si votre plugin est effectivement listé, le propre CI du registre peut détecter automatiquement
vos nouvelles releases (via un `repository_dispatch` envoyé par votre workflow de release) et
ouvrir automatiquement une PR de mise à jour de version contre le registre - récupérant,
recalculant le hash et réépinglant à nouveau votre nouvelle release pour révision, plutôt que
quelqu'un ait besoin de remarquer que vous avez publié une mise à jour. Cette PR nécessite quand
même une fusion humaine, le même niveau d'exigence de revue qu'un listing initial.
