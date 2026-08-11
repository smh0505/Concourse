# WIT-Schnittstelle

Dies ist der tatsächliche
[WIT](https://component-model.bytecodealliance.org/design/wit.html)-Vertrag, gegen den jedes
WASM-Plugin gebaut wird - die Quelle der Wahrheit ist `src-tauri/wit/plugin.wit` im Hauptrepo;
diese Seite erklärt ihn, aber diese Datei ist maßgeblich, falls beide je voneinander abweichen.

## Die `host`-Schnittstelle

Jede Host-Funktion unten ist eine Fähigkeit, die die Rust-Seite implementiert und deinem Plugin
zur Verfügung stellt - bewusst generische Primitive (Registry/Datei/Prozess/Netzwerk/
skalierter Speicher) statt semantischer, integrationsspezifischer Funktionen. Ein Source-Plugin
setzt diese selbst zusammen (z. B. das Parsen des eigenen VDF-/XML-Formats eines Anbieters),
statt dass Concourse ein maßgeschneidertes Modul pro Quelle schreibt.

### Registry (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` ist `"HKLM"` oder `"HKCU"`. Ein fehlender Schlüssel/Wert liefert `none`/eine leere Liste,
keinen Fehler - "existiert nicht" ist ein normales, erwartetes Ergebnis (z. B. beim Prüfen, ob
eine Plattform überhaupt installiert ist).

### Dateisystem

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` liefert das eigene beschreibbare Verzeichnis dieses Plugins
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - immer implizit lesbar/beschreibbar. Jeder
andere Pfad muss innerhalb eines Scopes liegen, den dein Manifest deklariert, oder zur Laufzeit
angefordert werden (siehe [Sicherheitsmodell](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Für ein Verzeichnis, das erst zur Laufzeit entdeckt wird statt statisch bekannt zu sein (z. B.
wo der Nutzer Steam tatsächlich installiert hat) - der Host gewährt dies nur, wenn er sowohl
deine Plugin-ID erkennt *als auch* der angeforderte Pfad eine echte strukturelle Prüfung für
diesen Anbieter besteht.

### Prozess

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` ist Fire-and-Forget (kein Warten/Exit-Code) - entspricht, wie `launch()` an
anderer Stelle verwendet wird; Concourses eigene ordnerbasierte Spielzeiterfassung deckt die
Sitzungsdauer separat ab. `run-and-wait` blockiert, bis der Prozess beendet ist, für Fälle, die
das wirklich müssen (z. B. ein sichtbares Drittanbieter-Installationsfenster, von dem dein
Plugin wissen muss, dass es geschlossen wurde, bevor es fortfährt). Beide erfordern die
`"run-programs"`-Capability-Freigabe - siehe [Sicherheitsmodell](./security-model).

### Netzwerk

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` ist für alles, was `http-get` nicht ausdrücken kann - benutzerdefinierte Header
(ein `Authorization`-Bearer-Token) oder eine Nicht-GET-Methode mit Body (z. B. eine
POST-basierte Abfrage-API). Verwende `download-bytes` statt `http-get`/`http-request` für
binäre Antworten.

### Zip-Archive

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Zusammen decken diese den üblichen Ablauf "ein Release-Zip herunterladen, extrahieren und
installieren" ab (von `wrapper`-Plugins für ihre eigenen verwalteten Installationen genutzt).
`unwrap-single-subdir` behandelt den häufigen Fall, dass ein Release-Zip seinen Inhalt in einem
einzigen Top-Level-Ordner verpackt, der dem Archivnamen entspricht.

### Skalierter Speicher

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Beide werden vom Host automatisch pro Plugin-ID isoliert - dein Plugin kann nie die Settings
oder spielbezogenen Daten eines anderen Plugins lesen oder schreiben, noch direkt eine
Kerntabelle der App erreichen.

## Die drei Plugin-Worlds

Jede `kind`, die ein WASM-Plugin implementieren kann, exportiert eine dieser Worlds:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Spiegelt das integrierte TypeScript-Interface `SourcePlugin` wider - ein WASM-Source-Plugin ist
eine austauschbare alternative Implementierung desselben Vertrags. Siehe
[Erste Schritte](./getting-started) für eine vollständige Anleitung zur Implementierung eines
solchen.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

Ein Kompatibilitäts-Wrapper (z. B. ein Locale-Emulator) - vollständig eigenständig.
`install()` lädt das neueste Release herunter, extrahiert es, sät bei Bedarf eine
Standard-Profilkonfiguration und führt den echten Anbieter-Installer für den
Registrierungsschritt aus, den nur dieser leisten kann. Anders als bei Source-Plugins gibt es
hier keinen vom Host verwalteten Pfad, der irgendwo übergeben wird - das Plugin installiert
immer an denselben deterministischen Ort unter seinem eigenen `plugin-dir()` und löst diesen
auch selbst auf.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` liefert jeden plausiblen Treffer - meist 0 oder 1, kann aber mehr sein, wenn
die Einträge deines Providers selbst wirklich mehrdeutig sind (z. B. eine Wiederveröffentlichung/
ein Duplikat mit demselben Titel). Der Host wählt automatisch den einzigen Kandidaten, wenn
genau einer zurückkommt, zeigt dem Nutzer eine Auswahl, wenn mehr als einer zurückkommt, und
überspringt deinen Provider ganz, wenn keiner zurückkommt. `fetch-metadata-by-id` ruft dann
vollständige Metadaten für einen bestimmten Kandidaten anhand seiner `id` ab.

## `game-entry` und `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
