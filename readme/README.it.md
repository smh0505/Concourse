# Concourse

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[简体中文](README.zh-Hans.md) | [Español](README.es.md) | [Français](README.fr.md) |
[Deutsch](README.de.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md)

*Questa traduzione è automatica (lo stesso approccio dichiarato usato per le lingue
dell'interfaccia dell'app stessa - vedi [Localization](#funzionalità) più sotto), non ancora
rivista da madrelingua.*

Un'applicazione desktop che aggrega giochi da più fonti (Steam, Epic, GOG, aggiunte manuali e
altro tramite plugin) in un'unica libreria unificata, con una modalità "Big Picture" in stile
console pensata prima di tutto per il controller - nello stesso spirito di Playnite o della
libreria di Steam stessa.

L'app principale resta leggera; quasi tutto ciò che va oltre la libreria di base (scanner delle
fonti, temi, provider di metadati, mappature del controller, wrapper di compatibilità) è un
plugin.

## Funzionalità

- **Nucleo della libreria** - "aggiungi gioco" manuale, archiviazione basata su SQLite, viste a
  griglia e a elenco, tag, ricerca/filtri
- **Metadati e media** - copertina tramite SteamGridDB, descrizione/genere/data di uscita
  tramite IGDB, override manuale
- **Avvio e tracciamento del tempo di gioco** - avvio unificato indipendentemente dalla fonte
  (exe diretto, URI `steam://` di Steam, gestori di protocollo Epic/GOG, giochi avviati tramite
  wrapper di compatibilità), con tracciamento del tempo di gioco basato sull'uscita del
  processo o sulla cartella, a seconda di come è stato avviato il gioco
- **Modalità Big Picture** - interfaccia a schermo intero navigabile con gamepad, con una
  griglia di riquadri e una vista slideshow in stile coverflow, dissolvenza incrociata
  dell'immagine di sfondo, interruttore per l'avvio automatico all'accensione
- **Wrapper di compatibilità** - profili Locale Remulator / Locale Emulator per singolo gioco,
  per i titoli che necessitano di una lingua/regione non predefinita per funzionare
- **Sistema di plugin** - cinque tipi di plugin (fonte, tema, provider di metadati, mappatura
  del controller, wrapper di compatibilità), caricati sia in fase di build (plugin TypeScript
  inclusi sotto `src/plugins/`) sia in fase di esecuzione (plugin WebAssembly scaricabili -
  vedi sotto)
- **Localizzazione** - interfaccia disponibile in 10 lingue (inglese più 9 lingue tradotte
  automaticamente), un `--font-family` impostabile dal tema per un re-skin completo dell'app,
  e un livello di tema basato solo su dati (`cssVariables` + un override opzionale in
  JSON-AST di `cardVisual` per l'area della copertina, senza bisogno di codice)
- **Traduzione offline** - il titolo/la descrizione di un gioco possono essere tradotti nella
  lingua corrente dell'interfaccia interamente sul dispositivo (nessun servizio esterno):
  scarica una volta il binario server precompilato di llama.cpp, scegli un modello (diversi
  livelli adatti alla CPU, uno senza censura per le descrizioni di giochi NSFW), quindi
  traduci/alterna la visualizzazione/revoca il titolo e il contenuto in modo indipendente
  dalla pagina di dettaglio del gioco. Le traduzioni vengono conservate per gioco e per campo,
  e vengono invalidate automaticamente al cambio di lingua o alla modifica dell'originale
- **Aggiornamento automatico** - sia l'app stessa che ogni plugin/tema installato controllano
  e applicano automaticamente gli aggiornamenti

## Stack tecnologico

- **Tauri 2** (backend Rust) + frontend **Vue 3** (`<script setup>`, TypeScript)
- **SQLite** tramite `tauri-plugin-sql`, schema evoluto tramite migrazioni versionate
- **Pinia** per lo stato del frontend, uno store per dominio
- **wasmtime** (Wasm Component Model) per il sistema di plugin scaricabili a runtime

## Sviluppo

Questo repository usa [`bun`](https://bun.sh), non npm/yarn/pnpm.

```sh
bun install          # installare le dipendenze JS
bun run dev           # solo il server di sviluppo Vite (frontend)
bunx tauri dev         # app completa (frontend + backend Rust), con hot-reload
bunx tauri build        # binario desktop di produzione
```

Da `src-tauri/`: `cargo check` per un controllo rapido della compilazione Rust senza una build
completa.

## Architettura dei plugin

Ogni plugin ha un manifesto `plugin.json` (`{ id, name, version, kind, entry }`) e implementa
una delle cinque interfacce a seconda di `kind`:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, per le integrazioni con fonti di
  giochi (attivazione multipla)
- `theme` - variabili CSS (colori, font, bordi/raggi) più un override opzionale in JSON-AST di
  `cardVisual` per l'area della copertina (attivazione singola); un manifesto che contiene
  solo `cssVariables` non richiede alcun codice. Gli override degli slot dei componenti
  (sostituire un intero componente Vue personalizzato) erano supportati inizialmente ma sono
  stati ritirati a favore di questo livello AST a vocabolario chiuso - non esiste alcun
  percorso di codice eval/eseguibile che un tema possa iniettare
- `metadata` - `fetchMetadata(title)`, per i provider di copertina / descrizione / genere
  (attivazione multipla)
- `controller` - un `GamepadMapping` (indici di pulsanti/assi) per un layout fisico specifico
  del controller (attivazione singola)
- `wrapper` - wrapper di compatibilità (ad es. Locale Remulator/Emulator) che gestiscono la
  propria installazione e avviano un eseguibile di destinazione tramite un profilo di
  lingua/regione

I plugin in fase di build si trovano sotto `src/plugins/<id>/` e vengono scoperti tramite
`import.meta.glob` di Vite. I plugin a runtime sono componenti WebAssembly (tipi
`source`/`wrapper`/`metadata`) installati da un URL di manifesto (Impostazioni → la scheda
corrispondente → Aggiungi plugin) oppure scaricati/estratti manualmente nella directory dati
dell'app, caricati tramite un host `wasmtime` incorporato nel backend Rust. I temi basati solo
su dati (solo `cssVariables`, senza codice) sono un livello di installazione via URL separato e
privo di codice, che non richiede alcun sandboxing WASM.

### Plugin ufficiali

Consulta **[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)**
sul sito di documentazione per l'elenco completo (link ai repository, link di download
dell'ultima versione, istruzioni di installazione).

**Nota sulla sicurezza (Milestone 12, chiusa):** la sandbox del Component Model di wasmtime
garantisce la sicurezza della memoria (un plugin non può corrompere la memoria dell'host né
sfuggire alla propria esecuzione), e ogni funzione host esposta ai plugin che potrebbe causare
danni reali è ora sottoposta a controllo dei permessi:
- `spawn-process`/`run-and-wait` richiedono una concessione esplicita e visibile per singolo
  plugin - un plugin deve dichiarare `capabilities: ["run-programs"]` nel proprio manifesto, e
  l'app si rifiuta di eseguire qualsiasi cosa per suo conto finché non gliel'hai effettivamente
  concesso (una casella di controllo nella finestra di conferma dell'installazione per
  l'installazione via URL, oppure una riga "Permesso necessario" con un pulsante Concedi nelle
  Impostazioni per un plugin già installato).
- `write-file`/`remove-dir` sono confinati in modo rigido e incondizionato alla directory del
  plugin stesso, senza eccezioni. `read-file`/`list-dir`/`path-exists`/accesso al registro sono
  limitati a una lista consentita dichiarata nel manifesto (`pathScopes`), più, per l'unico
  plugin la cui posizione di installazione non può davvero essere nota in anticipo (Steam),
  una richiesta di ambito a runtime verificata - l'host controlla una vera firma strutturale
  (una sottodirectory `steamapps`) prima di concedere l'accesso, e rifiuta categoricamente
  qualsiasi id di plugin per cui non ha un validatore.
- `http-get`/`http-request`/`download-bytes` sono limitati a una lista consentita di nomi host
  dichiarata nel manifesto (`httpScopes`) - un plugin può raggiungere solo gli host che
  dichiara (corrispondenza esatta o sottodominio), non un URL arbitrario controllato da un
  attaccante.

Installa comunque solo plugin da fonti di cui ti fidi pienamente - questo chiude la falla per
cui "un plugin può raggiungere silenziosamente qualsiasi punto del tuo sistema o della tua
rete", non è un modello di fiducia completo a livello di app store.

**Modello di fiducia (Milestone 13, chiuso):** due livelli complementari e indipendenti.
- **Firma** - ogni release ufficiale di un plugin è firmata con un'attestazione di provenienza
  della build di [Sigstore](https://www.sigstore.dev/), che vincola il `.wasm` pubblicato al
  commit esatto e all'esecuzione CI che lo ha costruito. Concourse verifica questo
  all'installazione e mostra il risultato - **solo a scopo informativo, non un blocco rigido**.
  Conferma che un artefatto proviene realmente dalla CI di quel repository, non modificato da
  allora (rileva manomissioni, un token di release compromesso, un repository dirottato che
  inserisce di nascosto una build malevola) - **non** garantisce le intenzioni dell'autore del
  repository. Anche il codice di un autore malintenzionato ottiene una firma perfettamente
  valida, poiché la sua stessa CI ha effettivamente costruito e firmato esattamente ciò che ha
  committato.
- **Registro curato** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry), un
  elenco mantenuto manualmente di plugin la cui versione fissata è stata effettivamente letta,
  con ogni voce bloccata su una release specifica e il suo vero SHA256. La finestra di dialogo
  "Aggiungi plugin" elenca queste voci accanto al campo URL libero; installare dal registro
  comporta un **rifiuto rigido** in caso di mancata corrispondenza dell'hash, a differenza del
  controllo informativo della firma - questo hash è stato scelto a mano dopo una revisione,
  quindi una mancata corrispondenza è un segnale reale che "questo non è ciò che è stato
  revisionato". Rimuovere una voce dal registro *equivale* a una revoca per le installazioni
  future (non ancora retroattiva per le copie già installate). L'installazione via URL libero
  continua comunque a funzionare esattamente come prima - il registro è un percorso aggiuntivo
  e più affidabile, non un passaggio obbligato.

## Documentazione

La documentazione completa per sviluppatori di plugin e utenti è pubblicata su
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** (sorgente in
[`docs/`](../docs/), costruita con VitePress) - una guida utente (installazione, gestione della
libreria, modalità Big Picture) e un riferimento per sviluppatori di plugin (panoramica
dell'architettura, una guida introduttiva, il riferimento completo di manifesto/interfaccia
WIT, il modello di sicurezza e come pubblicare un plugin).

## Stato

Sviluppato attivamente, un traguardo alla volta. Vedi
[`.claude/proposal.md`](../.claude/proposal.md) per la proposta di design originale,
[`.claude/milestones.md`](../.claude/milestones.md) per il tracciamento aggiornato dei progressi
rispetto ad essa, e [`.claude/devlog.md`](../.claude/devlog.md) per la storia
dell'implementazione/il ragionamento dietro ogni voce dei traguardi.

Ad oggi: la libreria principale, il tracciamento di metadati/tempo di gioco, la modalità Big
Picture, il sistema di plugin (inclusa la pipeline di plugin a runtime WebAssembly e
l'installazione gestita dei wrapper di compatibilità), il sandboxing dei permessi dei plugin
WASM (Milestone 12), un modello di fiducia/firma dei plugin (Milestone 13), un lavoro continuo
di rifinitura dell'interfaccia desktop (Milestone 14), il livello di tema JSON-AST che
sostituisce la tematizzazione tramite sostituzione di componenti (Milestones 17/19), un
lavoro di convenzione degli stili condivisi (Milestone 18), l'aggiornamento automatico
dell'app + plugin/temi (Milestone 20), la localizzazione in 10 lingue insieme alla traduzione
offline sul dispositivo di titoli/descrizioni dei giochi (Milestone 21), e questo sito di
documentazione (Milestone 22) sono tutti completati. Tutti i plugin ufficiali elencati sopra
sono attivi. Il lavoro ancora aperto comprende un plugin scanner per emulatori/ROM e ulteriori
plugin sorgente (Xbox/EA/Ubisoft, Milestone 16).

## Licenza

MIT - vedi [`LICENSE`](../LICENSE).

### Avvisi di terze parti

Il codice sorgente di Concourse è concesso in licenza MIT; nessun contenuto di terze parti è
incluso nel repository o nel binario compilato. La funzione di traduzione offline
(Milestone 21) scarica due tipi di contenuto di terze parti direttamente sul tuo computer a
runtime, ciascuno secondo i propri termini separati - descritto qui per trasparenza, non
perché Concourse ne ridistribuisca alcuno:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - il motore di traduzione
  stesso. Concourse scarica da GitHub il suo binario di release ufficiale precompilato per
  Windows e lo esegue come sottoprocesso; nessun codice di llama.cpp viene compilato in
  Concourse o distribuito con esso.
- **I pesi dei modelli**, scaricati da Hugging Face in base alla tua selezione nelle
  Impostazioni, ciascuno sotto la licenza della propria scheda modello -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` sono tutti Apache 2.0 (Gemma 4 è passato
  specificamente ad Apache 2.0 nell'aprile 2026, sostituendo la licenza più restrittiva sotto
  cui venivano distribuite le generazioni precedenti di Gemma). I due livelli senza censura
  (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) ereditano la licenza del proprio modello
  di base; verifica la scheda modello Hugging Face di ciascuno prima di affidarti ad esso
  commercialmente.
