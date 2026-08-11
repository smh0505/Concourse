# Überblick über die Plugin-Architektur

Concourse führt Spiele aus vielen Quellen in einer Bibliothek zusammen und gestaltet sich selbst
neu, alles über ein einziges Plugin-System mit fünf Arten. Jede Art teilt sich ein
Manifestformat und einen Loader; was sich unterscheidet, ist der Vertrag, den ein Plugin dieser
Art implementiert.

## Die fünf Plugin-Arten

| Art | Aufgabe | Auswahl |
|---|---|---|
| `source` | Eine Plattform (Steam, GOG, Epic, ...) nach installierten Spielen durchsuchen, diese starten | mehrfach aktivierbar |
| `theme` | Farben/Schriftarten/Karten-Visuals neu gestalten | exklusiv (jeweils eines aktiv) |
| `metadata` | Beschreibung/Erscheinungsdatum/Artwork für ein Spiel aus einer externen Datenbank abrufen | mehrfach aktivierbar |
| `controller` | Physische Gamepad-Tasten/-Achsen für die Big-Picture-Navigation zuordnen | exklusiv |
| `wrapper` | Ein Spiel über eine selbst verwaltete Kompatibilitätsschicht starten (z. B. einen Locale-Emulator) | mehrfach aktivierbar |

Source- und Metadata-Provider-Plugins sind unabhängig voneinander **mehrfach aktivierbar**
(Checkboxen in Settings) - du kannst mehrere Source-Plugins und mehrere Metadata-Provider
gleichzeitig ausführen, jeder trägt Spiele/Felder bei, die die anderen nicht liefern. Theme- und
Controller-Mapping-Plugins sind **exklusiv einfach wählbar** (Radiobutton) - du durchstöberst
die Bibliothek immer mit genau einem Skin und einem physischen Eingabeschema gleichzeitig.

## Zwei Wege, ein Plugin auszuliefern

1. **WASM-Plugin** - eine separat installierte `.wasm`-Komponente, zur Laufzeit per URL (oder
   über das kuratierte Registry) heruntergeladen, die in einer sandboxed
   [wasmtime](https://wasmtime.dev/)-Component-Model-Instanz läuft. Das ist heute der Weg für
   Drittanbieter-`source`-/`wrapper`-/`metadata`-Plugins - siehe
   [Erste Schritte](./getting-started) und die Referenz [WIT-Schnittstelle](./wit-interface).
2. **Reines Daten-Theme-Manifest** - für `theme`-Plugins speziell kann ein Manifest reines JSON
   sein (`cssVariables`/`cardVisual`/`fontFaces`, überhaupt kein Code), wenn es die volle
   WASM-Plugin-Maschinerie nicht braucht. Siehe [Theme-Manifeste](./theme-manifests).

WASM-Plugins existieren nur für die drei Arten, für die bisher eine
[WIT-World](https://component-model.bytecodealliance.org/design/wit.html) definiert wurde:
`source`, `wrapper`, `metadata`. Ein Drittanbieter-`theme`-Plugin zu bauen bedeutet heute den
Weg über das reine Daten-Manifest oben. Für `controller`-Mapping-Plugins gibt es derzeit keinen
Drittanbieter-Weg - Concourses integrierte Gamepad-Mappings sind direkt in die App kompiliert,
und ein neues hinzuzufügen bedeutet heute, zu Concourse selbst beizutragen, statt ein separates
Plugin auszuliefern.

## Warum WASM, nicht nativer Code oder Scripting

Concourse hat früher herunterladbare native ausführbare Dateien und eine Skriptsprache für
Drittanbieter-Plugins in Erwägung gezogen. Beide wurden aus demselben Grund verworfen: Ein
Plugin braucht echten Datei-/Registry-/Netzwerk-/Prozesszugriff, um seine Aufgabe zu erfüllen
(eine Steam-Installation scannen, ein Spiel über einen Wrapper starten), und keine der beiden
Optionen kann *begrenzten* Zugriff gewähren - eine native Binärdatei oder ein nicht
sandboxed Skript erhält dieselben Rechte wie die gesamte App. WASM über das Component Model
bietet stattdessen echtes capability-basiertes Sandboxing: Ein Plugin erhält eine
`host`-Schnittstellenfunktion nur, wenn Concourses Rust-Seite sie implementiert und gewährt, und
selbst dann sind die meisten Funktionen zusätzlich pro Plugin begrenzt (siehe
[Sicherheitsmodell](./security-model)).

## Weiter

- [Erste Schritte](./getting-started) - ein minimales WASM-Source-Plugin von Anfang bis Ende bauen
- [Manifest-Referenz](./manifest-reference) - jedes Feld von `plugin.json`
- [Theme-Manifeste](./theme-manifests) - `cssVariables`/`cardVisual`/`fontFaces` für Theme-Plugins
- [WIT-Schnittstelle](./wit-interface) - die tatsächliche Host-Capability-Oberfläche und Plugin-Worlds
- [Sicherheitsmodell](./security-model) - Pfad-Scopes, Capability-Gating, Signierung
- [Veröffentlichung](./publishing) - Einreichung beim kuratierten Plugin-Registry
