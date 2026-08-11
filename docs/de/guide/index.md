# Erste Schritte

Concourse ist eine Desktop-App, die Spiele aus vielen Quellen in einer Bibliothek zusammenführt,
mit einem konsolenartigen Vollbild-"Big Picture"-Modus für controller-orientierte Navigation.
Dieser Leitfaden behandelt die tägliche Nutzung der App. Wenn du stattdessen ein Plugin baust,
sieh dir die [Plugin-Dokumentation](/de/plugins/) an.

## Installation

Lade das neueste Installationsprogramm von der
[Releases-Seite](https://github.com/smh0505/Concourse/releases/latest) herunter (vorerst nur
Windows). Concourse prüft automatisch auf Updates und installiert sie selbst, sobald es läuft -
nach der ersten Installation ist kein manueller erneuter Download nötig.

## Erster Start

Beim ersten Start ist deine Bibliothek leer. Du kannst sie auf zwei Arten füllen, und die
meisten Nutzer verwenden am Ende beide:

1. **Ein Spiel manuell hinzufügen** - der Button "Add Game" (Seitenleiste) nimmt einen Titel und
   einen Pfad zur ausführbaren Datei entgegen, für alles, was ein Source-Plugin noch nicht
   abdeckt (ein Emulator, ein itch.io-Download, ...).
2. **Ein Source-Plugin installieren** - Settings → Tab "Source" ermöglicht die Installation eines
   Plugins, das eine vorhandene Plattform (Steam, GOG, Epic, ...) nach bereits besessenen Spielen
   durchsucht und diese Liste bei späteren Scans synchron hält. Siehe
   [Bibliothek & Spiele](./library) dafür, wie Scannen/Deduplizierung funktioniert, und
   [Plugins & Themes](./plugins-and-themes) dafür, wie man tatsächlich eines installiert.

## Wo sich was befindet

- **Library** (Seitenleiste) - dein Raster/deine Liste der Spiele, die Standardansicht.
- **Stats** - Gesamtzahl der Spiele/Stunden, Meistgespielt, Zuletzt gespielt.
- **Tags** / **Collections** - zwei getrennte Organisationskonzepte: Tags sind frei vergebbare
  Labels ("Co-op", "Backlog"); Collections gruppieren eine Serie/ein Franchise ("Final Fantasy").
  Beide werden über ihre eigenen Tabs in der Seitenleiste verwaltet oder pro Spiel von der
  Detailseite eines Spiels aus zugewiesen.
- **Settings** - alles rund um Plugins/Themes/App-Einstellungen, siehe
  [Plugins & Themes](./plugins-and-themes); dort richtest du auch die Offline-Übersetzung ein -
  siehe [Bibliothek & Spiele](./library#offline-translation).
