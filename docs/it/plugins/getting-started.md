# Per Iniziare: Un Plugin Sorgente Minimo

Questo percorso guida attraverso la costruzione di un vero plugin WASM `source` funzionante — uno
scanner che trova file `.exe` in una cartella e offre ciascuno come un gioco. Rispecchia il plugin
di riferimento di Concourse stesso,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
nel repo principale.

## Prerequisiti

```sh
rustup target add wasm32-wasip1   # una volta
cargo install cargo-component     # una volta
```

I plugin sorgente sono normali crate Rust compilati in un componente WASM tramite
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) — nessuna toolchain
specifica di Concourse oltre a questa.

## 1. Crea lo scaffold del crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Copia `wit/plugin.wit` dalla pagina [Interfaccia WIT](./wit-interface) (o direttamente da
`src-tauri/wit/plugin.wit` nel repo principale) nella cartella `wit/` del tuo nuovo crate — questo
è il contratto che il tuo plugin implementa e le funzioni host che può chiamare.

## 2. Implementa il mondo `source-plugin`

Un plugin sorgente implementa tre funzioni contro il trait `Guest` che `cargo-component` genera
da `world source-plugin-world`: `scan`, `launch`, `get-install-status`. Ecco l'implementazione
completa del plugin di riferimento:

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

Nota come tutto ciò che un plugin può *fare* passa attraverso funzioni `host::*`
(`settings_get`, `list_dir`, `spawn_process`, `path_exists`, ...) — non c'è alcun accesso diretto
a filesystem/processi. Vedi il riferimento [Interfaccia WIT](./wit-interface) per l'elenco
completo delle funzioni, e [Modello di Sicurezza](./security-model) per cosa è delimitato e come.

## 3. Compilalo

```sh
cargo component build
```

Output: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Scrivi un manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Vedi il [Riferimento del Manifest](./manifest-reference) per ogni campo che un manifest può
dichiarare (capability, scope dei percorsi, schema delle impostazioni, ...).

## 5. Provalo in locale

Copia il `.wasm` compilato e `plugin.json` in:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(Su Windows, `<app data dir>` è `%APPDATA%\com.bloppy.concourse\`.) Poi apri la scheda Settings →
Source di Concourse — il tuo plugin dovrebbe apparire nella lista, pronto per essere abilitato e
scansionato.

## Prossimi passi

- [Riferimento del Manifest](./manifest-reference) per ogni campo di `plugin.json`
- [Modello di Sicurezza](./security-model) per capire lo scoping di percorsi/rete/processi prima
  che il tuo plugin abbia bisogno di più di `list_dir`/`spawn_process`
- [Pubblicazione](./publishing) una volta pronto a distribuirlo
