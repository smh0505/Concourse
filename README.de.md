# Concourse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[简体中文](README.zh-Hans.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*Diese Übersetzung ist eine maschinelle Übersetzung (derselbe offengelegte Ansatz wie bei den
eigenen UI-Sprachen der App - siehe [Localization](#funktionen) unten), noch nicht von
Muttersprachlern geprüft.*

Eine Desktop-App, die Spiele aus mehreren Quellen (Steam, Epic, GOG, manuelle Einträge und über
Plugins noch mehr) in einer einzigen, vereinheitlichten Bibliothek zusammenführt, mit einem
konsolenartigen, controller-first "Big Picture"-Modus - vom Geist her ähnlich wie Playnite oder
Steams eigene Bibliothek.

Die Kern-App bleibt schlank; fast alles, was über die Basisbibliothek hinausgeht
(Quellen-Scanner, Themes, Metadaten-Anbieter, Controller-Mappings, Kompatibilitäts-Wrapper),
ist ein Plugin.

## Funktionen

- **Bibliothekskern** - manuelles "Spiel hinzufügen", SQLite-basierte Speicherung, Raster- und
  Listenansichten, Tagging, Suche/Filterung
- **Metadaten & Medien** - Cover-Art über SteamGridDB, Beschreibung/Genre/Erscheinungsdatum
  über IGDB, manuelle Überschreibung
- **Starten & Spielzeiterfassung** - einheitliches Starten unabhängig von der Quelle (direkte
  exe, Steam-`steam://`-URIs, Epic/GOG-Protokoll-Handler, über Kompatibilitäts-Wrapper
  gestartete Spiele), mit Spielzeiterfassung basierend auf Prozessende oder Ordner, je nachdem,
  wie ein Spiel gestartet wurde
- **Big-Picture-Modus** - vollbildschirmfüllende, mit Gamepad navigierbare Oberfläche mit einem
  Kachelraster und einer Coverflow-Diashow-Ansicht, Überblendung des Hintergrundbilds,
  Umschalter für automatisches Starten beim Hochfahren
- **Kompatibilitäts-Wrapper** - Locale-Remulator-/Locale-Emulator-Profile pro Spiel für Titel,
  die eine nicht standardmäßige Sprache/Region zum Laufen benötigen
- **Plugin-System** - fünf Plugin-Arten (Quelle, Theme, Metadaten-Anbieter,
  Controller-Mapping, Kompatibilitäts-Wrapper), entweder zur Build-Zeit geladen (gebündelte
  TypeScript-Plugins unter `src/plugins/`) oder zur Laufzeit (herunterladbare
  WebAssembly-Plugins - siehe unten)
- **Lokalisierung** - Benutzeroberfläche in 10 Sprachen verfügbar (Englisch plus 9 maschinell
  übersetzte Sprachen), eine über das Theme einstellbare `--font-family` für ein komplettes
  Re-Skinning der App, sowie eine reine Daten-Theme-Stufe (`cssVariables` + eine optionale
  `cardVisual`-JSON-AST-Überschreibung für den Cover-Art-Bereich, kein Code erforderlich)
- **Offline-Übersetzung** - Titel/Beschreibung eines Spiels können vollständig auf dem Gerät
  (kein externer Dienst) in Ihre aktuelle UI-Sprache übersetzt werden: Laden Sie einmalig die
  vorgefertigte Server-Binärdatei von llama.cpp herunter, wählen Sie ein Modell (mehrere
  CPU-freundliche Stufen, eine unzensierte für NSFW-Spielbeschreibungen), und
  übersetzen/umschalten/verwerfen Sie dann Titel und Inhalt unabhängig voneinander auf der
  Detailseite eines Spiels. Übersetzungen werden pro Spiel und pro Feld gespeichert und bei
  einem Sprachwechsel oder einer Bearbeitung des Originals automatisch ungültig
- **Automatische Updates** - sowohl die App selbst als auch jedes installierte Plugin/Theme
  prüfen automatisch auf Updates und wenden sie an

## Tech-Stack

- **Tauri 2** (Rust-Backend) + **Vue 3** (`<script setup>`, TypeScript) Frontend
- **SQLite** über `tauri-plugin-sql`, Schema entwickelt sich über versionierte Migrationen
- **Pinia** für den Frontend-State, ein Store pro Domäne
- **wasmtime** (Wasm Component Model) für das zur Laufzeit herunterladbare Plugin-System

## Entwicklung

Dieses Repository verwendet [`bun`](https://bun.sh), nicht npm/yarn/pnpm.

```sh
bun install          # JS-Abhängigkeiten installieren
bun run dev           # nur Vite-Dev-Server (Frontend)
bunx tauri dev         # vollständige App (Frontend + Rust-Backend), mit Hot-Reloading
bunx tauri build        # Produktions-Desktop-Binärdatei
```

Von `src-tauri/` aus: `cargo check` für eine schnelle Rust-Kompilierungsprüfung ohne
vollständigen Build.

## Plugin-Architektur

Jedes Plugin besitzt ein `plugin.json`-Manifest (`{ id, name, version, kind, entry }`) und
implementiert je nach `kind` eine von fünf Schnittstellen:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, für Integrationen von
  Spielquellen (mehrfach aktivierbar)
- `theme` - CSS-Variablen (Farben, Schriften, Rahmen/Radien) plus eine optionale
  JSON-AST-`cardVisual`-Überschreibung für den Cover-Art-Bereich (einzeln aktiv); ein
  Manifest, das nur `cssVariables` enthält, benötigt überhaupt keinen Code.
  Component-Slot-Überschreibungen (das komplette Ersetzen einer eigenen Vue-Komponente) wurden
  anfangs unterstützt, aber zugunsten dieser AST-Stufe mit geschlossenem Vokabular
  ausgemustert - es gibt für ein Theme keinen eval-/ausführbaren Codepfad zum Injizieren
- `metadata` - `fetchMetadata(title)`, für Cover-Art-/Beschreibungs-/Genre-Anbieter (mehrfach
  aktivierbar)
- `controller` - ein `GamepadMapping` (Tasten-/Achsenindizes) für ein bestimmtes physisches
  Controller-Layout (einzeln aktiv)
- `wrapper` - Kompatibilitäts-Wrapper (z. B. Locale Remulator/Emulator), die ihre eigene
  Installation verwalten und eine Ziel-ausführbare Datei über ein Sprachprofil starten

Build-Zeit-Plugins liegen unter `src/plugins/<id>/` und werden über Vites `import.meta.glob`
erkannt. Laufzeit-Plugins sind WebAssembly-Komponenten (Arten `source`/`wrapper`/`metadata`),
die von einer Manifest-URL installiert werden (Einstellungen → der passende Tab → Plugin
hinzufügen) oder manuell in das Datenverzeichnis der App heruntergeladen/entpackt und über
einen im Rust-Backend eingebetteten `wasmtime`-Host geladen werden. Reine Daten-Themes (nur
`cssVariables`, kein Code) sind eine separate, codefreie URL-Installationsstufe, die überhaupt
kein WASM-Sandboxing benötigt.

### Offizielle Plugins

Die vollständige Liste (Repo-Links, Download-Links für die neueste Version,
Installationsanleitungen) findest du unter
**[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)** auf der
Dokumentationsseite.

**Sicherheitshinweis (Milestone 12, abgeschlossen):** Die Component-Model-Sandbox von
wasmtime garantiert Speichersicherheit (ein Plugin kann den Host-Speicher nicht beschädigen
oder aus seiner eigenen Ausführung entkommen), und jede Host-Funktion, die Plugins ausgesetzt
ist und echten Schaden anrichten könnte, ist nun abgesichert:
- `spawn-process`/`run-and-wait` benötigen eine explizite, sichtbare, plugin-spezifische
  Freigabe - ein Plugin muss `capabilities: ["run-programs"]` in seinem Manifest deklarieren,
  und die App weigert sich, in seinem Namen irgendetwas auszuführen, bis Sie es tatsächlich
  freigegeben haben (eine Checkbox im Installationsbestätigungsdialog bei Installation per URL,
  oder eine Zeile "Berechtigung erforderlich" mit einer Schaltfläche "Gewähren" in den
  Einstellungen für ein bereits installiertes Plugin).
- `write-file`/`remove-dir` sind strikt und ausnahmslos auf das eigene Verzeichnis des Plugins
  beschränkt. `read-file`/`list-dir`/`path-exists`/Registry-Zugriff sind auf eine im Manifest
  deklarierte Erlaubnisliste (`pathScopes`) beschränkt, plus - für das einzige Plugin, dessen
  Installationsort wirklich nicht im Voraus bekannt sein kann (Steam) - eine verifizierte
  Laufzeit-Bereichsanfrage: Der Host prüft eine echte strukturelle Signatur (ein
  `steamapps`-Unterverzeichnis), bevor Zugriff gewährt wird, und lehnt jede Plugin-ID, für die
  er keinen Validator hat, rundweg ab.
- `http-get`/`http-request`/`download-bytes` sind auf eine im Manifest deklarierte
  Hostnamen-Erlaubnisliste (`httpScopes`) beschränkt - ein Plugin kann nur die Hosts erreichen,
  die es deklariert (exakte Übereinstimmung oder Subdomain), keine beliebige, von einem
  Angreifer kontrollierte URL.

Installieren Sie trotzdem nur Plugins aus Quellen, denen Sie voll vertrauen - dies schließt
"ein Plugin kann heimlich überall auf Ihrem System oder Netzwerk zugreifen", ist aber kein
vollständiges Vertrauensmodell auf App-Store-Niveau.

**Vertrauensmodell (Milestone 13, abgeschlossen):** zwei sich ergänzende, unabhängige Schichten.
- **Signierung** - jede offizielle Plugin-Veröffentlichung wird mit einer
  Build-Provenienz-Attestierung von [Sigstore](https://www.sigstore.dev/) signiert, die die
  veröffentlichte `.wasm` an den exakten Commit und CI-Lauf bindet, der sie erstellt hat.
  Concourse prüft dies bei der Installation und zeigt das Ergebnis an - **nur informativ,
  keine harte Sperre**. Es bestätigt, dass ein Artefakt wirklich aus der eigenen CI dieses
  Repositorys stammt, seitdem unverändert (erkennt Manipulation, ein kompromittiertes
  Release-Token, ein gekapertes Repository, das einen betrügerischen Build einschleust) - es
  bürgt **nicht** für die Absichten des Repository-Autors. Der eigene Code eines böswilligen
  Autors erhält ebenfalls eine vollkommen gültige Signatur, da dessen eigene CI genau das
  gebaut und signiert hat, was er selbst committet hat.
- **Kuratierte Registry** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry), eine
  von Hand gepflegte Liste von Plugins, deren fixierte Version tatsächlich gelesen wurde, jeder
  Eintrag an eine bestimmte Veröffentlichung und deren echten SHA256 gebunden. Der Dialog
  "Plugin hinzufügen" listet diese neben dem freien URL-Feld auf; die Installation aus der
  Registry führt bei Hash-Abweichung zu einer **harten Ablehnung**, anders als die informative
  Prüfung der Signatur - dieser Hash wurde nach einer Überprüfung von Hand gewählt, eine
  Abweichung ist also ein echtes Signal von "das ist nicht das, was überprüft wurde". Das
  Entfernen eines Eintrags aus der Registry *ist* ein Widerruf für zukünftige Installationen
  (noch nicht rückwirkend gegen bereits installierte Kopien). Die Installation per freier URL
  funktioniert in jedem Fall weiterhin genau wie zuvor - die Registry ist ein zusätzlicher,
  vertrauenswürdigerer Weg, kein Pflichttor.

## Dokumentation

Vollständige Dokumentation für Plugin-Entwickler und Nutzer wird unter
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** veröffentlicht
(Quelle in [`docs/`](docs/), gebaut mit VitePress) - ein Benutzerhandbuch (Installation,
Bibliotheksverwaltung, Big-Picture-Modus) und eine Referenz für Plugin-Entwickler
(Architekturüberblick, ein Einstiegs-Walkthrough, die vollständige Manifest-/WIT-Schnittstellen-
Referenz, das Sicherheitsmodell und wie man ein Plugin veröffentlicht).

## Status

Aktiv entwickelt, Meilenstein für Meilenstein. Siehe
[`.claude/proposal.md`](.claude/proposal.md) für den ursprünglichen Designvorschlag,
[`.claude/milestones.md`](.claude/milestones.md) für die aktuelle Fortschrittsverfolgung dazu
und [`.claude/devlog.md`](.claude/devlog.md) für die Implementierungshistorie/Begründung
hinter jedem Meilenstein-Punkt.

Stand jetzt: Kernbibliothek, Metadaten-/Spielzeiterfassung, Big-Picture-Modus, das Plugin-System
(einschließlich der WebAssembly-Laufzeit-Plugin-Pipeline und der verwalteten Installation der
Kompatibilitäts-Wrapper), WASM-Plugin-Berechtigungs-Sandboxing (Milestone 12), ein
Plugin-Vertrauens-/Signiermodell (Milestone 13), ein fortlaufender Politur-Durchgang der
Desktop-UI (Milestone 14), die JSON-AST-Theme-Stufe, die das Component-Swap-Theming ersetzt
(Milestones 17/19), ein Durchgang zur gemeinsamen Style-Konvention (Milestone 18), automatische
Updates für App + Plugins/Themes (Milestone 20), 10-sprachige Lokalisierung sowie
Offline-Übersetzung von Spieltiteln/-beschreibungen auf dem Gerät (Milestone 21), und diese
Dokumentationsseite (Milestone 22) sind alle abgeschlossen. Alle oben aufgeführten offiziellen
Plugins sind live. Zu den offenen Arbeiten gehören ein Emulator-/ROM-Scanner-Plugin und
weitere Quell-Plugins (Xbox/EA/Ubisoft, Milestone 16).

## Lizenz

MIT - siehe [`LICENSE`](LICENSE).

### Hinweise zu Drittanbietern

Der eigene Quellcode von Concourse ist MIT-lizenziert; im Repository oder in der gebauten
Binärdatei ist nichts von Drittanbietern gebündelt. Die Offline-Übersetzungsfunktion
(Milestone 21) lädt zur Laufzeit zwei Arten von Drittanbieter-Inhalten direkt auf Ihren
Rechner herunter, jeweils unter deren eigenen, separaten Bedingungen - hier aus Gründen der
Transparenz aufgeführt, nicht weil Concourse irgendetwas davon weiterverbreitet:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - die Übersetzungs-Engine
  selbst. Concourse lädt deren offizielle vorgefertigte Windows-Release-Binärdatei von GitHub
  herunter und führt sie als Subprozess aus; kein llama.cpp-Code wird in Concourse
  hineinkompiliert oder mit Concourse ausgeliefert.
- **Modellgewichte**, die entsprechend Ihrer eigenen Auswahl in den Einstellungen von
  Hugging Face heruntergeladen werden, jeweils unter der Lizenz der eigenen Modellkarte -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` stehen alle unter Apache 2.0 (Gemma 4 wechselte
  im April 2026 speziell zu Apache 2.0 und ersetzte damit die restriktivere Lizenz, unter der
  frühere Gemma-Generationen ausgeliefert wurden). Die beiden unzensierten Stufen
  (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) erben die Lizenz ihres jeweiligen
  Basismodells; prüfen Sie die jeweilige Hugging-Face-Modellkarte, bevor Sie sich für eine
  kommerzielle Nutzung darauf verlassen.
