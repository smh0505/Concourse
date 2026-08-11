# Plugins & Themes

Settings enthält ein Tab-Panel, das jede Art von Plugin abdeckt: **Source**, **Theme**,
**Metadata Provider**, **Controller** und **Wrapper**. Wenn du ein Plugin baust statt eines zu
installieren, sieh dir stattdessen die [Plugin-Dokumentation](/de/plugins/) an - diese Seite ist
die benutzerseitige Ansicht. Siehe [Offizielle Plugins](./official-plugins) für die aktuelle
Liste der gepflegten Plugins/Themes.

## Ein Plugin installieren

Klicke in einem beliebigen Tab auf "Add Plugin". Du hast zwei Möglichkeiten:

- **Kuratiertes Registry** - eine geprüfte, hash-verifizierte Liste bekannt guter Plugins. Wähle
  eines aus und klicke auf Install; Concourse verifiziert dessen Inhalt vor der Installation
  gegen einen fixierten Hash, sodass du genau das bekommst, was geprüft wurde.
- **Manifest-URL einfügen** - installiere alles andere, indem du einen direkten Link zu dessen
  `plugin.json` einfügst. Das funktioniert für jedes Plugin, ob im Registry gelistet oder nicht,
  überspringt aber die Hash-Verifizierung des Registry-Pfads - du vertraust direkt demjenigen,
  der diese URL veröffentlicht hat. Concourse zeigt dir trotzdem, was das Plugin laut eigener
  Angabe benötigt (Datei-/Registry-/Netzwerkzugriff, ob es andere Programme ausführen kann),
  bevor du bestätigst.

## Aktivieren/Deaktivieren und Reihenfolge

- **Source**- und **Metadata Provider**-Plugins sind unabhängig voneinander mehrfach aktivierbar
  (Checkboxen) - führe mehrere Source-Plugins und mehrere Metadata-Provider gleichzeitig aus.
  Ihre Reihenfolge ist wichtig: Bei Source-Plugins entscheidet sie, welches gewinnt, wenn dasselbe
  Spiel von mehr als einem gefunden wird (siehe
  [Deduplizierung](./library#deduplication-across-sources)); bei Metadata-Providern entscheidet
  sie, welche Antwort pro Feld gewinnt (Beschreibung, Erscheinungsdatum, Cover-/Hintergrundbild),
  wenn mehr als einer etwas dazu zu sagen hat. Ordne beide Listen mit den Pfeilen neben jedem
  Eintrag neu an.
- **Theme**- und **Controller**-Plugins sind exklusiv (Radiobutton) - du durchstöberst die
  Bibliothek immer mit genau einem Skin und nutzt genau ein physisches
  Controller-Mapping gleichzeitig.
- **Wrapper**-Plugins (Kompatibilitätsschichten, z. B. ein Locale-Emulator) sind mehrfach
  aktivierbar, jeweils unabhängig installier-/verwaltbar und pro Spiel über dessen
  Bearbeitungsformular auswählbar.

## Updates

Concourse prüft automatisch auf Plugin-/Theme-Updates (App-Start, Fokussieren des App-Fensters
und jedes Mal, wenn du Settings oder den Add-Plugin-Dialog öffnest) und zeigt ein
"Update to vX.Y.Z"-Badge neben allem an, wofür eine neuere Version verfügbar ist. Klicke darauf,
um an Ort und Stelle zu aktualisieren.

## Deinstallation

Jedes installierte (nicht integrierte) Plugin/Theme hat eine Remove/Uninstall-Aktion in seiner
eigenen Zeile. Themes und Source-/Metadata-/Wrapper-Plugins, die ihre eigenen heruntergeladenen
Dateien verwalten (z. B. die installierte Laufzeitumgebung eines Wrappers), räumen diese
ebenfalls auf, nicht nur den Manifest-Eintrag.
