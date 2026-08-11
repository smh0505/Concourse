# Erste Schritte: Ein minimales Source-Plugin

Dies führt durch den Bau eines echten, funktionierenden WASM-`source`-Plugins - eines Scanners,
der `.exe`-Dateien in einem Ordner findet und jede als Spiel anbietet. Es spiegelt Concourses
eigenes Referenz-Plugin wider,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
im Hauptrepo.

## Voraussetzungen

```sh
rustup target add wasm32-wasip1   # einmalig
cargo install cargo-component     # einmalig
```

Source-Plugins sind gewöhnliche Rust-Crates, die über
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) zu einer
WASM-Komponente kompiliert werden - kein Concourse-spezifisches Toolchain darüber hinaus.

## 1. Das Crate anlegen

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Kopiere `wit/plugin.wit` von der Seite [WIT-Schnittstelle](./wit-interface) (oder direkt aus
`src-tauri/wit/plugin.wit` im Hauptrepo) in den `wit/`-Ordner deines neuen Crates - dies ist der
Vertrag, den dein Plugin implementiert, und die Host-Funktionen, die es aufrufen kann.

## 2. Die `source-plugin`-World implementieren

Ein Source-Plugin implementiert drei Funktionen gegen den `Guest`-Trait, den `cargo-component`
aus `world source-plugin-world` generiert: `scan`, `launch`, `get-install-status`. Hier ist die
komplette Implementierung des Referenz-Plugins:

```rust
#[allow(warnings)]
mod bindings;

use bindings::exports::gamelib::plugin::source_plugin::{GameEntry, Guest};
use bindings::gamelib::plugin::host;

struct ExeScannerPlugin;

impl Guest for ExeScannerPlugin {
    fn scan() -> Result<Vec<GameEntry>, String> {
        let dir = host::settings_get("scan_dir").ok_or_else(|| {
            "Set the 'scan_dir' setting to a folder to scan for .exe files".to_string()
        })?;

        let paths = host::list_dir(&dir)?;
        let entries = paths
            .into_iter()
            .filter(|path| path.to_lowercase().ends_with(".exe"))
            .map(|path| {
                let file_name = path.rsplit(['\\', '/']).next().unwrap_or(&path);
                let title = file_name
                    .strip_suffix(".exe")
                    .or_else(|| file_name.strip_suffix(".EXE"))
                    .unwrap_or(file_name)
                    .to_string();

                GameEntry {
                    id: format!("exe-scanner-{}", title),
                    title,
                    executable_path: path,
                    platform: "exe-scanner".to_string(),
                    cover_art_url: None,
                    install_dir: Some(dir.clone()),
                }
            })
            .collect();

        Ok(entries)
    }

    fn launch(entry: GameEntry) -> Result<(), String> {
        host::spawn_process(&entry.executable_path, &[])
    }

    fn get_install_status(entry: GameEntry) -> Result<bool, String> {
        Ok(host::path_exists(&entry.executable_path))
    }
}

bindings::export!(ExeScannerPlugin with_types_in bindings);
```

Beachte, dass alles, was ein Plugin *tun* kann, über `host::*`-Funktionen läuft (`settings_get`,
`list_dir`, `spawn_process`, `path_exists`, ...) - es gibt überhaupt keinen direkten Datei-/
Prozesszugriff. Siehe die Referenz [WIT-Schnittstelle](./wit-interface) für die vollständige
Funktionsliste und [Sicherheitsmodell](./security-model) dafür, was begrenzt ist und wie.

## 3. Bauen

```sh
cargo component build
```

Ausgabe: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Ein Manifest schreiben

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Siehe die [Manifest-Referenz](./manifest-reference) für jedes Feld, das ein Manifest deklarieren
kann (Capabilities, Pfad-Scopes, Settings-Schema, ...).

## 5. Lokal ausprobieren

Kopiere die kompilierte `.wasm`-Datei und `plugin.json` nach:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(Unter Windows ist `<app data dir>` gleich `%APPDATA%\com.bloppy.concourse\`.) Öffne dann in
Concourse Settings → Tab Source - dein Plugin sollte in der Liste erscheinen, bereit zum
Aktivieren und Scannen.

## Weiter

- [Manifest-Referenz](./manifest-reference) für jedes Feld von `plugin.json`
- [Sicherheitsmodell](./security-model), um Pfad-/Netzwerk-/Prozess-Scoping zu verstehen, bevor
  dein Plugin mehr als `list_dir`/`spawn_process` benötigt
- [Veröffentlichung](./publishing), sobald du bereit bist, es zu verteilen
