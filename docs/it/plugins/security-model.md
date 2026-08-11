# Modello di Sicurezza

L'installazione via URL di un plugin WASM esegue comunque codice arbitrario che non hai scritto tu
- lo stesso rischio reale di eseguire qualsiasi `.exe` scaricato. Concourse non pretende che la
sola sandbox WASM risolva questo problema; questa pagina descrive cosa fa effettivamente al
riguardo, e cosa non fa.

## La sandbox wasmtime stessa

Ogni plugin WASM viene eseguito dentro un'istanza del Component Model
[wasmtime](https://wasmtime.dev/) senza alcun accesso ambientale a nulla - nessun filesystem,
nessuna rete, nessuna generazione di processi, niente, a meno che una specifica funzione `host`
non lo conceda. Questa è la base di partenza: un plugin può fare solo ciò che l'interfaccia
`host` espone (vedi [Interfaccia WIT](./wit-interface)), mai nulla al di là di essa, non importa
cosa provi a fare il codice del plugin stesso.

## Scoping dei percorsi {#path-scoping}

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) è sempre implicitamente
leggibile/scrivibile - ogni plugin ottiene gratuitamente una directory sandbox privata. Qualsiasi
cosa oltre a quella richiede uno di questi:

- **Uno scope statico dichiarato** - un hive di registro+prefisso di chiave fisso, o un prefisso
  di percorso filesystem fisso, di cui un plugin ha genuinamente bisogno in una posizione nota
  (ad es. le chiavi di registro vendor fisse di una piattaforma, o una directory manifest fissa).
  Dichiarato una volta, verificato dall'host a ogni chiamata a file/registro.
- **Uno scope richiesto a runtime** (`request-read-scope`) - per una directory scopribile solo a
  runtime (ovunque l'installazione Steam dell'utente abbia effettivamente messo le proprie
  cartelle libreria). L'host concede questo solo se riconosce l'id del plugin *e* il percorso
  richiesto supera un controllo strutturale reale per quel vendor (ad es. richiedendo una
  sottodirectory `steamapps`) - un id di plugin non riconosciuto viene rigettato del tutto, mai
  fidato silenziosamente.

In entrambi i casi, gli scope dichiarati nel manifest (o mostrati nella conferma installazione) di
un plugin vengono mostrati all'utente prima che lo installi, così "cosa può effettivamente toccare
questo sul mio disco" è visibile in anticipo, non solo applicato silenziosamente.

## Gate per la generazione di processi

`spawn-process`/`run-and-wait` sono sottoposti a gate dietro una concessione esplicita della
capability `"run-programs"` - un plugin che la dichiara nel campo `capabilities` del proprio
manifest fa scattare un vero prompt "questo plugin esegue altri programmi sul tuo sistema"
nell'interfaccia di conferma installazione, che l'utente deve accettare affermativamente. L'host
applica il gate indipendentemente da ciò che il manifest dichiara (un plugin non può semplicemente
omettere il campo per saltare il prompt e comunque chiamare la funzione) - il campo `capabilities`
controlla solo se l'interfaccia chiede affatto la concessione.

## Scoping di rete

`http-get`/`http-request`/`download-bytes` sono soggetti a lista di consentiti/rate-limit per
singolo plugin, non una concessione generica "può raggiungere tutto internet".

## Cosa questo *non* risolve: fiducia, non solo sandboxing

Lo scoping di percorsi/processi/rete limita *cosa* un plugin può raggiungere, ma non dice nulla
sul fatto che il codice stesso faccia qualcosa di malevolo all'interno di quello scope (un plugin
sorgente ha genuinamente bisogno di `spawn-process` per avviare i giochi - non è qualcosa che una
sandbox possa distinguere dall'avviare qualcos'altro). Altri due livelli affrontano questo
problema:

### Firma del codice (consultiva)

Le release pubblicate dei plugin possono portare un'attestazione [Sigstore](https://www.sigstore.dev/)
- prova verificabile di quale build CI ha prodotto un dato binario `.wasm` e da quale commit
sorgente. Questo è **consultivo, non un gate rigido al momento dell'installazione** - Concourse
non rifiuta di installare un plugin non firmato, dato che questo bloccherebbe altrettanto
facilmente un autore di plugin che non ha ancora configurato la firma. La revisione consultiva
compare nell'interfaccia di conferma installazione, ed *è* applicata rigidamente per il registro
curato sotto.

### Registro curato (con gate rigido)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) è una lista
revisionata e con hash fissato di plugin - ogni voce fissa il manifest/WASM di un plugin a uno
SHA di commit esatto e un hash del contenuto. Installare tramite il registro (invece di un URL
incollato liberamente) **rigetta rigidamente in caso di mismatch dell'hash** - se ciò che viene
effettivamente servito non corrisponde più a ciò che è stato revisionato, l'installazione fallisce
del tutto invece di avvertire e continuare. Rimuovere una voce dal registro *è* il meccanismo di
revoca (solo al momento dell'installazione - non raggiunge le copie già installate).

**In breve**: i plugin installati tramite registro ottengono garanzie di integrità reali e
applicate. I plugin installati via URL liberamente ottengono sandboxing e scope dichiarati
visibili, ma la decisione di fiducia effettiva resta comunque tua - vedi [Pubblicazione](./publishing)
se vuoi che il tuo plugin raggiunga il livello più forte e revisionato.
