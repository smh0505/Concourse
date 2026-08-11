# Panoramica dell'Architettura dei Plugin

Concourse aggrega giochi da molte fonti in un'unica libreria, e si ridecora, attraverso un unico
sistema di plugin con cinque tipi. Ogni tipo condivide un unico formato di manifest e loader; ciò
che cambia è il contratto che un plugin di quel tipo implementa.

## I cinque tipi di plugin

| Tipo | Compito | Selezione |
|---|---|---|
| `source` | Esegue la scansione di una piattaforma (Steam, GOG, Epic, ...) per giochi installati, li avvia | multi-abilitato |
| `theme` | Ridecora colori/font/visual delle card | esclusivo (uno attivo alla volta) |
| `metadata` | Recupera descrizione/data di rilascio/artwork per un gioco da un database esterno | multi-abilitato |
| `controller` | Mappa i tasti/assi fisici del gamepad per la navigazione in Big Picture | esclusivo |
| `wrapper` | Avvia un gioco tramite un layer di compatibilità gestito da sé stesso (ad es. un emulatore di locale) | multi-abilitato |

I plugin source e metadata-provider sono abilitabili in modo indipendente e **multiplo**
(checkbox in Settings) — puoi eseguire più plugin sorgente e più provider di metadati
contemporaneamente, ciascuno contribuendo con giochi/campi che gli altri non forniscono. I
plugin theme e controller-mapping sono **esclusivi a selezione singola** (radio) — stai sempre
navigando con una sola skin e uno schema di input fisico alla volta.

## Due modi per distribuire un plugin

1. **Plugin WASM** — un componente `.wasm` installato separatamente, scaricato tramite URL (o
   attraverso il registro curato) a runtime, eseguito in un'istanza sandboxed del Component Model
   [wasmtime](https://wasmtime.dev/). Questo è oggi il percorso per i plugin di terze parti
   `source`/`wrapper`/`metadata` — vedi [Per Iniziare](./getting-started) e il riferimento
   [Interfaccia WIT](./wit-interface).
2. **Manifest tema puramente basato su dati** — per i plugin `theme` in particolare, un manifest
   può essere puro JSON (`cssVariables`/`cardVisual`/`fontFaces`, nessun codice) se non ha
   bisogno dell'intero apparato dei plugin WASM. Vedi [Manifest dei Temi](./theme-manifests).

I plugin WASM esistono solo per i tre tipi per cui è stato definito un
[WIT world](https://component-model.bytecodealliance.org/design/wit.html) finora: `source`,
`wrapper`, `metadata`. Costruire un plugin `theme` di terze parti oggi significa usare il percorso
del manifest puramente basato su dati sopra descritto. Al momento non esiste un percorso di terze
parti per i plugin di mappatura `controller` - le mappature gamepad integrate di Concourse sono
compilate direttamente nell'app, e aggiungerne una nuova oggi significa contribuire a Concourse
stesso invece di distribuire un plugin separato.

## Perché WASM, non codice nativo o scripting

Concourse in passato ha considerato eseguibili nativi scaricabili e un linguaggio di scripting per
i plugin di terze parti. Entrambi sono stati respinti per lo stesso motivo: un plugin ha bisogno
di un accesso reale a filesystem/registro/rete/processi per svolgere il proprio compito
(eseguire la scansione di un'installazione Steam, avviare un gioco tramite un wrapper), e nessuna
delle due opzioni può concedere un accesso *scoped* — un binario nativo o uno script non
sandboxed ottiene gli stessi privilegi dell'intera app. WASM tramite il Component Model offre
invece una vera sandboxing basata su capability: un plugin ottiene una funzione dell'interfaccia
`host` solo se il lato Rust di Concourse la implementa e la concede, e anche in quel caso, la
maggior parte delle funzioni è ulteriormente delimitata per singolo plugin (vedi
[Modello di Sicurezza](./security-model)).

## Prossimi passi

- [Per Iniziare](./getting-started) — costruisci un plugin sorgente WASM minimo end-to-end
- [Riferimento del Manifest](./manifest-reference) — ogni campo di `plugin.json`
- [Manifest dei Temi](./theme-manifests) — `cssVariables`/`cardVisual`/`fontFaces` per i plugin tema
- [Interfaccia WIT](./wit-interface) — la superficie effettiva delle capability dell'host e i mondi dei plugin
- [Modello di Sicurezza](./security-model) — scope dei percorsi, gating delle capability, firma
- [Pubblicazione](./publishing) — sottomissione al registro curato dei plugin
