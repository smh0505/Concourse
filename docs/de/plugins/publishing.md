# Veröffentlichung

## Freie Installation per URL (immer verfügbar)

Jeder kann dein Plugin heute installieren, ohne dass es irgendwo gelistet ist - der
"Add Plugin"-Dialog von Concourse akzeptiert eine direkte URL zu einem `plugin.json`-Manifest.
Veröffentliche ein GitHub-Release mit deiner kompilierten `.wasm`-Datei und dem Manifest als
Release-Assets, teile die Release-Asset-URL des Manifests, fertig. Dies ist ein echter,
vollwertiger Installationsweg, kein Fallback - ein Plugin-Autor muss in keinem Registry gelistet
sein, um installierbar zu sein.

Damit die Update-Prüfung gegen eine frei eingefügte URL gut funktioniert, veröffentliche
Releases auf die übliche Weise (getaggte Versionen, z. B. `v0.2.0`) und verweise Leute auf die
Asset-URL genau dieses Tags, statt auf einen `.../releases/latest/...`-Link, damit eine
bestimmte Installation an das gebunden bleibt, wovon sie tatsächlich installiert wurde.

### Code-Signierung (empfohlen)

Wenn die CI deines Plugin-Repos die Build-Herkunft für seine Release-Artefakte attestiert (z. B.
über
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
zeigt Concourse dies als beratende Verifizierung in der Installationsbestätigungs-UI an - Beweis,
dass die `.wasm`-Datei, die ein Nutzer installieren will, wirklich aus der CI deines eigenen
Repos stammt und keine manipulierte Kopie ist. Das ist nicht erforderlich, aber das Einzige, was
eine frei eingefügte URL-Installation sonst nicht bekommen kann, was ein Registry-Eintrag kann
(siehe [Sicherheitsmodell](./security-model)).

## Das kuratierte Registry

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) ist eine
handkuratierte, hash-fixierte Liste, die zur Installationszeit eine harte Inhaltsverifizierung
erhält (eine Abweichung wird rundweg abgelehnt, nicht nur markiert) - eine deutlich stärkere
Garantie als eine frei eingefügte URL-Installation. Ehrlich gesagt dokumentiert es sich zum
Zeitpunkt dieses Schreibens selbst als von-einer-Person-geprüft (`smh0505`, derselbe Maintainer
wie Concourse selbst) statt als offener Community-Einreichungsprozess - "geprüft" bedeutet, dass
jemand den Quellcode genau dieser fixierten Version tatsächlich gelesen hat, was nicht skaliert,
um beliebige Drittanbieter-Pull-Requests anzunehmen, ohne diese Richtlinie vorher zu ändern.
Wenn du möchtest, dass dein Plugin für die Aufnahme in Betracht gezogen wird, eröffne ein Issue
in diesem Repo, statt anzunehmen, dass ein PR, der deinen eigenen Eintrag hinzufügt, so wie er
ist akzeptiert wird.

### Was ein Eintrag tatsächlich fixiert

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

`manifestUrl` verweist immer auf ein bestimmtes, unveränderliches Release-Asset - nie auf
`.../latest/...` - da der ganze Sinn eines kuratierten Eintrags darin besteht, dass das, was
heute installiert wird, genau das ist, was geprüft wurde, nicht was auch immer du als Nächstes
veröffentlichst. `wasmSha256` wird von demjenigen, der prüft, aus deinem tatsächlichen
Release-Artefakt berechnet und dann bei jeder Installation über dieses Registry gegen die
tatsächlich heruntergeladenen Bytes geprüft.

### Einen Eintrag aktuell halten

Wenn dein Plugin tatsächlich gelistet ist, kann die eigene CI des Registrys deine neuen Releases
automatisch erkennen (über einen `repository_dispatch`, den dein Release-Workflow sendet) und
automatisch einen Versions-Update-PR gegen das Registry eröffnen - der das Asset deines neuen
Releases erneut abruft, neu hasht und für die Prüfung neu fixiert, statt dass jemand bemerken
muss, dass du ein Update ausgeliefert hast. Dieser PR braucht trotzdem ein menschliches Merge,
dieselbe Prüfschwelle wie bei einer Erstlistung.
