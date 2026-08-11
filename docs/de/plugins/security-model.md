# Sicherheitsmodell

Die Installation eines WASM-Plugins per URL führt trotzdem beliebigen Code aus, den du nicht
selbst geschrieben hast - dasselbe reale Risiko wie das Ausführen jeder heruntergeladenen
`.exe`. Concourse tut nicht so, als würde die WASM-Sandbox allein das lösen - diese Seite zeigt,
was tatsächlich dagegen unternommen wird, und was nicht.

## Die wasmtime-Sandbox selbst

Jedes WASM-Plugin läuft innerhalb einer [wasmtime](https://wasmtime.dev/)-Component-Model-
Instanz ohne jeglichen ambienten Zugriff auf irgendetwas - kein Dateisystem, kein Netzwerk, kein
Prozess-Spawning, nichts, sofern nicht eine bestimmte `host`-Funktion es gewährt. Das ist die
Grundlage: Ein Plugin kann nur das tun, was die `host`-Schnittstelle bereitstellt (siehe
[WIT-Schnittstelle](./wit-interface)), niemals mehr, egal was der eigene Code des Plugins
versucht.

## Pfad-Scoping {#path-scoping}

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) ist immer implizit lesbar/
beschreibbar - jedes Plugin erhält kostenlos ein privates Sandbox-Verzeichnis. Alles darüber
hinaus braucht eines von:

- **Einen deklarierten statischen Scope** - eine feste Registry-Hive+Key-Vorsilbe oder ein
  fester Dateisystempfad-Präfix, den ein Plugin an einer bekannten Stelle wirklich braucht (z. B.
  die festen Vendor-Registry-Keys einer Plattform, oder ein festes Manifest-Verzeichnis). Einmal
  deklariert, bei jedem Datei-/Registry-Aufruf vom Host geprüft.
- **Einen zur Laufzeit angeforderten Scope** (`request-read-scope`) - für ein Verzeichnis, das
  erst zur Laufzeit auffindbar ist (wo auch immer der Nutzer die Steam-Installation tatsächlich
  mit ihren Bibliotheksordnern platziert hat). Der Host gewährt dies nur, wenn er sowohl die
  Plugin-ID erkennt *als auch* der angeforderte Pfad eine echte strukturelle Prüfung für diesen
  Anbieter besteht (z. B. das Erfordernis eines `steamapps`-Unterverzeichnisses) - eine
  unbekannte Plugin-ID wird rundweg abgelehnt, nie stillschweigend vertraut.

So oder so werden die im Manifest deklarierten (oder im Installationsbestätigungsdialog
angezeigten) Scopes eines Plugins dem Nutzer vor der Installation gezeigt, sodass "was kann das
tatsächlich auf meiner Festplatte anfassen" von Anfang an sichtbar ist, nicht nur still im
Hintergrund durchgesetzt wird.

## Prozess-Spawning-Sperre

`spawn-process`/`run-and-wait` sind hinter einer expliziten `"run-programs"`-Capability-Freigabe
gated - ein Plugin, das dies im `capabilities`-Feld seines Manifests deklariert, löst in der
Installationsbestätigungs-UI eine echte Aufforderung aus ("dieses Plugin führt andere Programme
auf deinem System aus"), die der Nutzer aktiv bestätigen muss. Der Host erzwingt die Sperre
unabhängig davon, was das Manifest deklariert (ein Plugin kann das Feld nicht einfach weglassen,
um die Aufforderung zu umgehen und die Funktion trotzdem aufzurufen) - das `capabilities`-Feld
steuert nur, ob die UI überhaupt nach der Freigabe fragt.

## Netzwerk-Scoping

`http-get`/`http-request`/`download-bytes` sind pro Plugin auf einer Zulassungsliste geführt/
ratenbegrenzt, keine pauschale "kann das gesamte Internet erreichen"-Freigabe.

## Was dies *nicht* löst: Vertrauen, nicht nur Sandboxing

Pfad-/Prozess-/Netzwerk-Scoping begrenzt, *was* ein Plugin erreichen kann, sagt aber nichts
darüber, ob der Code selbst innerhalb dieses Scopes etwas Bösartiges tut (ein Source-Plugin
braucht wirklich `spawn-process`, um Spiele zu starten - das ist nichts, was eine Sandbox von
"etwas anderem starten" unterscheiden könnte). Zwei weitere Ebenen adressieren das:

### Code-Signierung (beratend)

Veröffentlichte Plugin-Releases können ein [Sigstore](https://www.sigstore.dev/)-Attestat
tragen - verifizierbarer Nachweis, welcher CI-Build eine gegebene `.wasm`-Binärdatei aus welchem
Quell-Commit erzeugt hat. Dies ist **beratend, kein hartes Installations-Gate** - Concourse
verweigert nicht die Installation eines unsignierten Plugins, da das genauso leicht einen
Plugin-Autor blockieren würde, der noch keine Signierung eingerichtet hat. Die beratende
Überprüfung erscheint in der Installationsbestätigungs-UI und wird für das kuratierte Registry
unten hart erzwungen.

### Kuratiertes Registry (hart gated)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) ist eine
geprüfte, hash-fixierte Liste von Plugins - jeder Eintrag fixiert das Manifest/WASM eines
Plugins auf einen exakten Commit-SHA und Inhalts-Hash. Die Installation über das Registry (statt
über eine frei eingefügte URL) **lehnt bei Hash-Abweichung hart ab** - wenn das tatsächlich
Ausgelieferte nicht mehr mit dem übereinstimmt, was geprüft wurde, schlägt die Installation
rundweg fehl, statt nur zu warnen und fortzufahren. Das Entfernen eines Eintrags aus dem
Registry *ist* der Widerrufsmechanismus (nur zur Installationszeit wirksam - er erreicht bereits
installierte Kopien nicht rückwirkend).

**Kurz gesagt**: Über das Registry installierte Plugins erhalten echte, durchgesetzte
Integritätsgarantien. Über frei eingefügte URLs installierte Plugins erhalten Sandboxing und
sichtbare deklarierte Scopes, aber die eigentliche Vertrauensentscheidung liegt trotzdem bei
dir - siehe [Veröffentlichung](./publishing), wenn du möchtest, dass dein eigenes Plugin die
stärkere, geprüfte Stufe erreicht.
