# Riferimento del Manifest

Ogni plugin — TypeScript integrato, WASM, o un tema puramente basato su dati — è descritto da un
manifest `plugin.json`. Questa pagina documenta ogni campo che il loader di Concourse riconosce
(sorgente: l'interfaccia `PluginManifest` in `src/plugins/manifest.ts`).

## Campi principali (ogni plugin)

| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `id` | `string` | sì | Identificatore univoco. Usato come nome della directory di installazione per i plugin WASM - mantienilo compatibile con i filesystem. |
| `name` | `string` | sì | Nome visualizzato mostrato in Settings. |
| `version` | `string` | sì | SemVer semplice, indipendente dalla versione dell'app stessa. Vedi [versioning](#versioning) sotto. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | sì | Quale capability fornisce questo plugin - determina cosa deve esportare il suo modulo/componente entry. |
| `entry` | `string` | sì | Percorso del file `.wasm` compilato, relativo alla cartella del plugin stesso. |
| `runtime` | `"wasm" \| "data"` | no | Imposta `"wasm"` per un plugin WASM, o `"data"` per un manifest tema privo di codice (nessun `entry` da caricare - `cssVariables` *è* l'intero plugin). Un manifest di terze parti dovrebbe sempre impostare uno di questi due valori. (`"ts"`/assente è un terzo valore che il loader riconosce comunque, ma significa un modulo TypeScript compilato al build-time e integrato nell'app stessa - solo interno, mai qualcosa da impostare in un manifest che distribuisci.) |
| `installable` | `boolean` | no | True se questo plugin implementa il ciclo di vita install/uninstall (`install()`/`uninstall()`/`isInstalled()`) - determina se l'interfaccia generica del pulsante "Install" viene mostrata automaticamente. |

I manifest dei temi hanno il proprio set dedicato di campi (`cssVariables`/`cardVisual`/
`fontFaces`) - vedi [Manifest dei Temi](./theme-manifests) invece di questa pagina per quelli.

## Campi per plugin WASM

| Campo | Tipo | Note |
|---|---|---|
| `settingsSchema` | array di `{ key, label, type? }` | Dichiara le impostazioni configurabili dall'utente (ad es. una chiave API) - l'host genera un modulo di impostazioni generico da questo invece che il tuo plugin abbia bisogno di una propria interfaccia di impostazioni personalizzata. `type: "password"` maschera l'input. |
| `capabilities` | `string[]` | Quali capability dell'host soggette a gating questo plugin effettivamente chiama. Oggi solo `"run-programs"` (regola `spawn-process`/`run-and-wait`) - vedi [Modello di Sicurezza](./security-model). L'host applica il gate indipendentemente da ciò che dichiari qui; questo campo determina solo se l'interfaccia di conferma installazione chiede all'utente un consenso esplicito. |

`pathScopes`/`httpScopes` (accesso in lettura dichiarato oltre la propria directory del plugin, e
host di rete consentiti) vengono mostrati nella finestra di dialogo di conferma installazione per
visibilità dell'utente, ma sono calcolati dall'host in base alle richieste effettive a livello WIT
del tuo plugin, non dichiarati direttamente in `plugin.json` - vedi
[Modello di Sicurezza](./security-model) per come funziona effettivamente lo scoping.

## Campi aggiunti dall'host (non impostarli mai tu stesso)

| Campo | Tipo | Note |
|---|---|---|
| `sourceUrl` | `string` | L'URL esatto da cui è stato installato - aggiunto dall'host al momento dell'installazione così un successivo controllo aggiornamenti può ri-recuperare e confrontare le versioni. |
| `installedViaRegistry` | `boolean` | True se installato tramite la voce a hash fissato del registro curato invece di un URL incollato liberamente - cambia il modo in cui funziona il controllo aggiornamenti (un `sourceUrl` fissato dal registro è ancorato a uno SHA di commit e congelato per sempre; controllare un aggiornamento significa ri-recuperare la voce *attuale* del registro per questo id, non ri-recuperare di nuovo `sourceUrl`). |

## Esempio: un manifest minimo per un plugin sorgente

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Vedi [Manifest dei Temi](./theme-manifests) per un esempio di manifest tema.

## Versioning

Le versioni dei plugin sono SemVer semplice, tracciate indipendentemente dalla versione dell'app
stessa:

- **Patch**: correzione di bug, nessun cambiamento al manifest/comportamento.
- **Minor**: nuova capability, retrocompatibile - funziona ancora contro la stessa interfaccia
  WIT dell'host (plugin WASM) o la stessa forma di `PluginBase` (plugin TS).
- **Major**: cambiamento incompatibile - la forma del manifest cambia, oppure (per i plugin WASM)
  il plugin ora richiede una versione dell'interfaccia `wit/plugin.wit` che una build meno recente
  di Concourse non ha. Questo è il segnale "non installare questo su una build dell'app più
  vecchia."

I plugin WASM installati separatamente e i manifest tema puramente basati su dati partono
convenzionalmente rispettivamente da `0.1.0`/`1.0.0` - un manifest tema solo contenuto è
abbastanza stabile da partire da `1.0.0`, mentre un plugin WASM con vera logica di
installazione/avvio di solito parte da `0.1.0` finché non è provato nell'uso reale.
