# Bibliothek & Spiele

## Spiele hinzufügen

**Manuell**: Der Button "Add Game" nimmt einen Titel und einen Pfad zur ausführbaren Datei
entgegen (oder eine Launcher-URI wie `steam://run/<appid>` - siehe
[unten](#uri-launches-vs-direct-executables)). Nutze dies für alles, was ein Source-Plugin noch
nicht abdeckt.

**Über ein Source-Plugin**: Sobald du ein Source-Plugin installiert und aktiviert hast
(Settings → Source), bietet Settings einen "Scan Now"-Button, der jedes Spiel findet, das dieses
Plugin kennt, und es zu deiner Bibliothek hinzufügt. Ein späterer erneuter Scan erfasst neu
installierte Spiele, ohne bereits vorhandene zu duplizieren (siehe Deduplizierung unten).

## Ein Spiel bearbeiten

Öffne die Detailseite eines beliebigen Spiels (klicke auf Cover/Titel oder das Bearbeiten-Symbol)
und wechsle in den Bearbeitungsmodus. Du kannst Titel, URLs für Cover-/Hintergrundbild,
Beschreibung (Markdown wird unterstützt), Erscheinungsdatum und Plattform überschreiben. Ein
"Fetch Metadata"-Button führt deine aktivierten Metadata-Provider (Settings → Metadata Provider)
erneut gegen den aktuellen Titel aus und füllt aus, was gefunden wird - nützlich, wenn der
automatische Abruf etwas übersehen hat oder sich die Daten eines Providers geändert haben, seit
du das Spiel hinzugefügt hast.

## Tags & Collections

- **Tags** sind frei vergebbare Labels ("Co-op", "Backlog", "Completed") - erstellen/umbenennen/
  löschen über den Tags-Tab in der Seitenleiste, Zuweisung pro Spiel von dessen Detailseite aus.
- **Collections** gruppieren eine Serie/ein Franchise ("Final Fantasy") - ein von Tags getrenntes
  Konzept, verwaltet auf dieselbe Weise über ihren eigenen Tab in der Seitenleiste.

Beide unterstützen Suche/Filterung der Bibliotheksansicht zusätzlich zur einfachen Titelsuche.

## Deduplizierung über Quellen hinweg {#deduplication-across-sources}

Wenn dasselbe Spiel sowohl manuell hinzugefügt als auch später durch den Scan eines
Source-Plugins gefunden wird (oder von zwei verschiedenen Source-Plugins gefunden wird), führt
Concourse sie zu einem einzigen Eintrag zusammen, statt Duplikate anzuzeigen - abgeglichen nach
Titel. Wenn mehr als eine Quelle denselben Titel gefunden hat, gewinnt für Launch-Pfad/Plattform
das Plugin, das in der Prioritätsreihenfolge deines Source-Tabs weiter unten steht (dort Plugins
neu anordnen, wenn ein anderes Vorrang haben soll).

Wenn du wirklich zwei gleichnamige Einträge getrennt halten möchtest (z. B. zwei verschiedene
Versionen desselben Spiels), hat das Bearbeitungsformular eines Spiels ein Kontrollkästchen
"Keep separate from plugin scans" (`skip_dedup`) - aktiviere es, um diesen bestimmten Eintrag von
der Zusammenführungslogik auszuschließen.

## Offline-Übersetzung {#offline-translation}

Titel und Beschreibung eines Spiels können vollständig offline in deine aktuelle UI-Sprache
übersetzt werden - kein externer Übersetzungsdienst, nichts verlässt deinen Rechner. Von der
Detailseite eines Spiels aus öffnet der "Translate"-Button ein Menü mit drei Gruppen (scrollen
oder mit den Pfeiltasten zwischen ihnen wechseln):

- **Translate** - übersetzt nur den Titel, nur die Beschreibung oder beides. Ein erneuter
  Durchlauf mit einem anderen ausgewählten Modell überschreibt die vorherige Übersetzung für
  dieses Feld.
- **Show** - wechselt zwischen übersetztem und Originaltext, pro Feld oder für beide zusammen.
  Diese Wahl wird pro Spiel gespeichert, sodass das erneute Öffnen eines Spiels später zeigt, was
  zuletzt speziell dafür gewählt wurde.
- **Remove** - löscht eine zwischengespeicherte Übersetzung für ein Feld (oder beide) und stellt
  das Original wieder her, ohne dass etwas im Cache verbleibt.

**Einmalige Einrichtung** (Settings): Lade die Übersetzungs-Engine einmalig herunter (ein
kleiner, einmaliger Download), wähle dann ein Modell aus dem Dropdown und lade auch dieses
herunter. Es werden einige Modellstufen angeboten, die Größe/RAM gegen Qualität abwägen - alle
laufen vollständig auf der CPU, sodass eine kleinere Stufe schneller übersetzt und weniger
Arbeitsspeicher verbraucht, während ein Spiel parallel läuft. Eine Stufe ist unzensiert, gedacht
für das Übersetzen der eigenen Beschreibungen von NSFW-Spielen, ohne dass ein
sicherheitsoptimiertes Modell die Übersetzung legitimer Texte Dritter verweigert.

Eine zwischengespeicherte Übersetzung ist an die UI-Sprache gebunden, für die sie erstellt wurde
- ein Wechsel deiner UI-Sprache oder das Bearbeiten des Originaltitels/der Originalbeschreibung
eines Spiels macht sie automatisch ungültig (erneut übersetzen, um eine frische Version für die
neue Sprache oder den bearbeiteten Text zu erhalten).

## URI-Starts vs. direkte ausführbare Dateien {#uri-launches-vs-direct-executables}

Manche Source-Plugins (Steam, Epic) starten ein Spiel über eine Plattform-URI
(`steam://run/...`, `com.epicgames.launcher://...`) statt über einen direkten `.exe`-Pfad, da die
Plattform selbst so erwartet, zum Starten eines Spiels aufgefordert zu werden. Die
Spielzeiterfassung funktioniert dafür anders - siehe [Spielzeiterfassung](#playtime-tracking)
unten.

## Spielzeiterfassung {#playtime-tracking}

Bei einem direkten Pfad zur ausführbaren Datei wartet Concourse auf den tatsächlichen Prozess und
protokolliert nach dessen Beendigung eine echte Sitzung (Start/Ende/Dauer). Bei einem über eine
URI gestarteten Spiel gibt es kein Prozess-Handle, auf das auf dieselbe Weise gewartet werden
könnte, sodass eine Sitzung nicht auf dieselbe Weise protokolliert wird - die Werte für
"Recently Played"/Gesamtstunden im Stats-Tab spiegeln wider, was pro Startmethode tatsächlich
erfassbar ist.
