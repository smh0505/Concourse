# Manifest-Referenz

Jedes Plugin - integriertes TypeScript, WASM oder ein reines Daten-Theme - wird durch ein
`plugin.json`-Manifest beschrieben. Diese Seite dokumentiert jedes Feld, das der Loader von
Concourse versteht (Quelle: `src/plugins/manifest.ts`'s `PluginManifest`-Interface).

## Kernfelder (jedes Plugin)

| Feld | Typ | Erforderlich | Hinweise |
|---|---|---|---|
| `id` | `string` | ja | Eindeutiger Bezeichner. Wird als Name des Installationsverzeichnisses für WASM-Plugins verwendet - filesystem-sicher halten. |
| `name` | `string` | ja | Anzeigename in Settings. |
| `version` | `string` | ja | Reines SemVer, unabhängig von der Version der App selbst. Siehe [Versionierung](#versioning) unten. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | ja | Welche Capability dieses Plugin bereitstellt - bestimmt, was sein Entry-Modul/seine Komponente exportieren muss. |
| `entry` | `string` | ja | Pfad zur kompilierten `.wasm`-Datei, relativ zum eigenen Ordner des Plugins. |
| `runtime` | `"wasm" \| "data"` | nein | Setze `"wasm"` für ein WASM-Plugin, oder `"data"` für ein codefreies Theme-Manifest (kein `entry` zum Laden überhaupt - `cssVariables` *ist* das gesamte Plugin). Ein Drittanbieter-Manifest sollte immer eines dieser beiden setzen. (`"ts"`/kein Wert ist ein dritter Wert, den der Loader ebenfalls erkennt, bedeutet aber ein zur Build-Zeit gebundenes TypeScript-Modul, das in die App selbst eingebunden ist - nur intern, nie etwas, das du in einem Manifest setzen würdest, das du verteilst.) |
| `installable` | `boolean` | nein | True, wenn dieses Plugin den Install-/Uninstall-Lifecycle implementiert (`install()`/`uninstall()`/`isInstalled()`) - steuert, ob die generische "Install"-Button-UI automatisch angezeigt wird. |

Theme-Manifeste haben ihren eigenen dedizierten Satz an Feldern (`cssVariables`/`cardVisual`/
`fontFaces`) - siehe [Theme-Manifeste](./theme-manifests) statt dieser Seite dafür.

## WASM-Plugin-Felder

| Feld | Typ | Hinweise |
|---|---|---|
| `settingsSchema` | Array von `{ key, label, type? }` | Deklariert benutzerkonfigurierbare Settings (z. B. einen API-Key) - der Host rendert daraus ein generisches Settings-Formular, statt dass dein Plugin eine eigene, benutzerdefinierte Settings-UI braucht. `type: "password"` maskiert die Eingabe. |
| `capabilities` | `string[]` | Welche gated Host-Capabilities dieses Plugin tatsächlich aufruft. Heute nur `"run-programs"` (schaltet `spawn-process`/`run-and-wait` frei) - siehe [Sicherheitsmodell](./security-model). Der Host erzwingt dies unabhängig davon, was hier deklariert wird; dieses Feld steuert nur, ob die Installationsbestätigungs-UI eine explizite Freigabe vom Nutzer verlangt. |

`pathScopes`/`httpScopes` (deklarierter Lesezugriff über das eigene Plugin-Verzeichnis hinaus,
und erlaubte Netzwerk-Hosts) werden im Installationsbestätigungsdialog zur Sichtbarkeit für den
Nutzer angezeigt, werden aber vom Host aus den tatsächlichen WIT-Level-Anfragen deines Plugins
berechnet, nicht direkt in `plugin.json` deklariert - siehe [Sicherheitsmodell](./security-model)
dafür, wie Scoping tatsächlich funktioniert.

## Vom Host hinzugefügte Felder (diese nie selbst setzen)

| Feld | Typ | Hinweise |
|---|---|---|
| `sourceUrl` | `string` | Die exakte URL, von der aus dies installiert wurde - vom Host zur Installationszeit hinzugefügt, damit eine spätere Update-Prüfung erneut abrufen und Versionen vergleichen kann. |
| `installedViaRegistry` | `boolean` | True, wenn über das kuratierte Registry-Eintrag mit fixiertem Hash installiert, statt über eine frei eingefügte URL - ändert, wie die Update-Prüfung funktioniert (ein registry-fixierter `sourceUrl` ist auf einen Commit-SHA festgelegt und für immer eingefroren; eine Update-Prüfung bedeutet, den *aktuellen* Registry-Eintrag für diese ID erneut abzurufen, nicht `sourceUrl` erneut abzurufen). |

## Beispiel: ein minimales Source-Plugin-Manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Siehe [Theme-Manifeste](./theme-manifests) für ein Beispiel eines Theme-Manifests.

## Versionierung {#versioning}

Plugin-Versionen sind reines SemVer, unabhängig von der Version der App selbst verfolgt:

- **Patch**: Bugfix, keine Änderung an Manifest/Verhalten.
- **Minor**: neue Fähigkeit, abwärtskompatibel - funktioniert weiterhin gegen dieselbe Host-WIT-
  Schnittstelle (WASM-Plugins) oder dieselbe `PluginBase`-Form (TS-Plugins).
- **Major**: Breaking Change - Manifestform ändert sich, oder (WASM-Plugins) das Plugin benötigt
  jetzt eine `wit/plugin.wit`-Schnittstellenversion, die ein älterer Concourse-Build nicht hat.
  Das ist das Signal "dies nicht auf einem älteren App-Build installieren."

Separat installierte WASM-Plugins und reine Daten-Theme-Manifeste starten üblicherweise bei
`0.1.0`/`1.0.0` - ein reines Inhalts-Theme-Manifest ist stabil genug, um bei `1.0.0` zu starten,
während ein WASM-Plugin mit echter Install-/Launch-Logik meist bei `0.1.0` startet, bis es sich
im echten Einsatz bewährt hat.
