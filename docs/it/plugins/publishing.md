# Pubblicazione

## Installazione via URL libera (sempre disponibile)

Chiunque può installare il tuo plugin oggi senza essere elencato da nessuna parte - la finestra
di dialogo "Add Plugin" di Concourse accetta un URL diretto a un manifest `plugin.json`.
Pubblica una release GitHub con il tuo `.wasm` compilato e il manifest come asset della release,
condividi l'URL dell'asset del manifest, fatto. Questo è un percorso di installazione reale e di
prima classe, non un ripiego - un autore di plugin non ha bisogno di essere in alcun registro per
essere installabile.

Perché il controllo aggiornamenti funzioni bene contro un URL libero, pubblica le release nel modo
normale (versioni taggate, ad es. `v0.2.0`) e punta le persone verso l'URL dell'asset di quel
tag specifico piuttosto che verso un link `.../releases/latest/...`, così un'installazione
specifica resta ancorata a ciò da cui è stata effettivamente installata.

### Firma del codice (consigliata)

Se la CI del repo del tuo plugin attesta la provenienza della build per i propri artefatti di
release (ad es. [`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
Concourse mostra questo come verifica consultiva nell'interfaccia di conferma installazione -
prova che il `.wasm` che un utente sta per installare proviene davvero dalla CI del tuo repo, non
da una copia manomessa. Questo non è obbligatorio, ma è l'unica cosa che un'installazione via URL
libero non può altrimenti ottenere che una voce di registro può (vedi
[Modello di Sicurezza](./security-model)).

## Il registro curato

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) è una lista
curata a mano e con hash fissato che ottiene una verifica rigida del contenuto al momento
dell'installazione (un mismatch viene rigettato del tutto, non solo segnalato) - una garanzia
significativamente più forte di un'installazione via URL libero. Onestamente, al momento in cui
scrivo questo si autodefinisce come revisionata da una sola persona (`smh0505`, lo stesso
manutentore di Concourse stesso) piuttosto che un processo di sottomissione della community
aperto - "revisionato" significa che qualcuno ha effettivamente letto il codice sorgente di
quella specifica versione fissata, il che non scala fino ad accettare pull request arbitrarie di
terze parti senza cambiare prima quella policy. Se vuoi che il tuo plugin venga considerato per
l'inclusione, apri una issue su quel repo invece di presumere che una PR che aggiunge la tua
voce venga accettata così com'è.

### Cosa fissa effettivamente una voce

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin",
  "kind": "source",
  "repo": "you/your-plugin-repo",
  "manifestUrl": "https://github.com/you/your-plugin-repo/releases/download/v0.2.0/plugin.json",
  "wasmSha256": "<sha256 of the pinned .wasm, computed by the reviewer>"
}
```

`manifestUrl` punta sempre a un asset di release specifico e immutabile - mai a `.../latest/...` -
dato che l'intero senso di una voce curata è che ciò che viene installato oggi è esattamente ciò
che è stato revisionato, non qualsiasi cosa tu pubblichi dopo. `wasmSha256` viene calcolato dal
vero artefatto della tua release da chiunque lo revisioni, poi verificato contro i byte
effettivamente scaricati a ogni installazione tramite questo registro.

### Mantenere aggiornata una voce

Se il tuo plugin viene effettivamente elencato, la CI del registro stesso può rilevare
automaticamente le tue nuove release (tramite un `repository_dispatch` che il tuo workflow di
release invia) e aprire automaticamente una PR di aggiornamento versione contro il registro -
ri-recuperando, ri-calcolando l'hash, e ri-fissando l'asset della tua nuova release per la
revisione, invece che qualcuno debba accorgersi che hai distribuito un aggiornamento. Quella PR
richiede comunque una fusione umana, con lo stesso livello di revisione di una voce iniziale.
