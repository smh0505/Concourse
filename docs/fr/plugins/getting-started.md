# Prise en main : un plugin de source minimal

Ceci parcourt la construction d'un vrai plugin WASM `source` fonctionnel — un scanner qui trouve
les fichiers `.exe` dans un dossier et propose chacun d'eux comme un jeu. Il reflète le plugin de
référence de Concourse lui-même,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
dans le dépôt principal.

## Prérequis

```sh
rustup target add wasm32-wasip1   # une fois
cargo install cargo-component     # une fois
```

Les plugins de source sont des crates Rust ordinaires compilées en composant WASM via
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) — aucune chaîne d'outils
spécifique à Concourse au-delà de ça.

## 1. Générer le squelette de la crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Copiez `wit/plugin.wit` depuis la page [Interface WIT](./wit-interface) (ou directement depuis
`src-tauri/wit/plugin.wit` dans le dépôt principal) dans le dossier `wit/` de votre nouvelle
crate — c'est le contrat que votre plugin implémente et les fonctions hôtes qu'il peut appeler.

## 2. Implémenter le monde `source-plugin`

Un plugin de source implémente trois fonctions face au trait `Guest` que `cargo-component`
génère à partir de `world source-plugin-world` : `scan`, `launch`, `get-install-status`. Voici
l'implémentation complète du plugin de référence :

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

Remarquez que tout ce qu'un plugin peut *faire* passe par des fonctions `host::*`
(`settings_get`, `list_dir`, `spawn_process`, `path_exists`, ...) — il n'y a aucun accès direct au
système de fichiers/processus. Voir la référence [Interface WIT](./wit-interface) pour la liste
complète des fonctions, et [Modèle de sécurité](./security-model) pour ce qui est délimité et
comment.

## 3. Compiler

```sh
cargo component build
```

Résultat : `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Écrire un manifeste

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Voir la [Référence du manifeste](./manifest-reference) pour tous les champs qu'un manifeste peut
déclarer (capacités, portées de chemins, schéma de réglages, ...).

## 5. Essayer en local

Copiez le `.wasm` compilé et `plugin.json` dans :

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(Sous Windows, `<app data dir>` est `%APPDATA%\com.bloppy.concourse\`.) Ouvrez ensuite l'onglet
Settings → Source de Concourse — votre plugin devrait apparaître dans la liste, prêt à être
activé et utilisé pour l'analyse.

## Suite

- [Référence du manifeste](./manifest-reference) pour tous les champs de `plugin.json`
- [Modèle de sécurité](./security-model) pour comprendre le contrôle des portées
  chemin/réseau/processus avant que votre plugin n'ait besoin de plus que
  `list_dir`/`spawn_process`
- [Publication](./publishing) une fois prêt à le distribuer
