# Libreria e Giochi

## Aggiungere giochi

**Manualmente**: il pulsante "Add Game" richiede un titolo e un percorso dell'eseguibile (o un
URI del launcher come `steam://run/<appid>` - vedi [sotto](#uri-launches-vs-direct-executables)).
Usalo per tutto ciò che un plugin sorgente non copre già.

**Tramite un plugin sorgente**: una volta installato e abilitato un plugin sorgente (Settings →
Source), Settings ha un pulsante "Scan Now" che trova ogni gioco conosciuto da quel plugin e lo
aggiunge alla tua libreria. Rieseguire una scansione più tardi rileva i giochi appena installati
senza duplicare quelli già presenti nella tua libreria (vedi la deduplicazione sotto).

## Modificare un gioco

Apri la pagina di dettaglio di un gioco qualsiasi (clicca sulla sua copertina/titolo, o
sull'icona Edit) e passa alla modalità di modifica. Puoi sovrascrivere il titolo, gli URL
dell'artwork di copertina/sfondo, la descrizione (supporta Markdown), la data di rilascio e la
piattaforma. Un pulsante "Fetch Metadata" riesegue i tuoi provider di metadati abilitati
(Settings → Metadata Provider) sul titolo attuale e compila ciò che trova - utile se il recupero
automatico ha tralasciato qualcosa, o se i dati di un provider sono cambiati da quando hai
aggiunto il gioco.

## Tag e Collezioni

- I **Tag** sono etichette libere ("Co-op", "Backlog", "Completato") - creale/rinominale/
  eliminale dalla scheda Tags nella barra laterale, assegnale per singolo gioco dalla pagina di
  dettaglio di quel gioco.
- Le **Collezioni** raggruppano una serie/franchise ("Final Fantasy") - un concetto distinto dai
  tag, gestito allo stesso modo dalla propria scheda nella barra laterale.

## Ricerca, filtri e ordinamento

La barra di ricerca accetta testo di titolo semplice più tre token speciali, tutti combinabili in un'unica
query: `platform:steam`, `tag:coop`, `collection:"final fantasy"` (racchiudi tra virgolette un valore che
contiene spazi). Digitare `platform:steam zelda` cerca "zelda" nei titoli solo tra i giochi Steam.

Sotto la barra di ricerca, dei pill cliccabili rispecchiano le stesse piattaforme/tag/collezioni -
cliccandone uno si aggiunge o rimuove il relativo token dalla barra di ricerca, così che barra di ricerca e
pill siano sempre coerenti tra loro. Più pill dello stesso tipo si combinano con **OR** (corrisponde
qualsiasi valore selezionato - predefinito) oppure **AND** (deve corrispondere a ogni valore selezionato);
cambia quale modalità usa una categoria dal pill "browse all filters" (la riga ha un limite, e quel pill apre
una modale che elenca tutto senza limiti, raggruppato per piattaforma/tag/collezioni). Un gioco aggiunto
manualmente senza la piattaforma di un plugin sorgente compare sotto un pill piattaforma `manual`.

Un menu a tendina di ordinamento separato, accanto al selettore di modalità di visualizzazione, offre Titolo
(A-Z), Giocato di recente, Più giocato e Aggiunto di recente - la tua scelta persiste tra i riavvii, come la
modalità griglia/elenco.

## Operazioni collettive

Clicca sull'interruttore in stile checkbox accanto al menu di ordinamento per entrare in modalità selezione:
ogni scheda/riga diventa un bersaglio selezionabile con un solo clic, con un piccolo badge a forma di
checkbox che mostra cosa è attualmente selezionato. Appare una barra "N selezionati" con i pulsanti Seleziona
tutto (rispetta qualsiasi filtro/ricerca attualmente attivo) e Cancella, oltre ad azioni collettive:
aggiungere un tag, aggiungere a una collezione, oppure rimuovere l'intera selezione dalla tua libreria. Esci
dalla modalità selezione con il pulsante X per tornare alla navigazione normale.

## Deduplicazione tra fonti {#deduplication-across-sources}

Se lo stesso gioco viene sia aggiunto manualmente che successivamente trovato da una scansione di
un plugin sorgente (o trovato da due plugin sorgente diversi), Concourse li unisce in una singola
voce invece di mostrare duplicati - l'abbinamento avviene per titolo. Quando più di una fonte
trova lo stesso titolo, il plugin che si trova più in basso nell'ordine di priorità della scheda
Source vince per il percorso di avvio/piattaforma (riordina i plugin lì se vuoi che un altro
abbia la priorità).

Se vuoi davvero mantenere separate due voci con lo stesso titolo (ad es. due versioni diverse
dello stesso gioco), il modulo di modifica di un gioco ha una checkbox "Keep separate from plugin
scans" (`skip_dedup`) - selezionala per escludere quella specifica voce dalla logica di
unione.

## Traduzione offline {#offline-translation}

Il titolo e la descrizione di un gioco possono essere tradotti nella tua lingua UI attuale
interamente offline - nessun servizio di traduzione esterno, nulla lascia la tua macchina. Dalla
pagina di dettaglio di un gioco, il pulsante "Translate" apre un menu con tre gruppi (scorri o usa
le frecce per spostarti tra di essi):

- **Translate** - traduce solo il titolo, solo la descrizione, o entrambi. Rieseguire questa
  opzione con un modello diverso selezionato sovrascrive la traduzione precedente per quel campo.
- **Show** - alterna tra il testo tradotto e quello originale, per singolo campo o per entrambi
  insieme. Questa scelta viene ricordata per ogni gioco, quindi riaprire un gioco più tardi mostra
  qualunque cosa tu abbia scelto per ultima specificamente per esso.
- **Remove** - cancella una traduzione memorizzata nella cache per un campo (o entrambi),
  ripristinando l'originale senza nulla rimasto in cache.

**Configurazione una tantum** (Settings): scarica il motore di traduzione una volta (un download
piccolo, una tantum), poi scegli un modello dal menu a tendina e scaricalo a sua volta. Vengono
offerti alcuni livelli di modello, con un compromesso tra dimensione/RAM e qualità - girano tutti
interamente su CPU, quindi un livello più piccolo traduce più velocemente e usa meno memoria
mentre un gioco è in esecuzione insieme ad esso. Un livello è non censurato, pensato per tradurre
le descrizioni di giochi NSFW senza che un modello con tuning di sicurezza rifiuti di tradurre
testo di terze parti legittimo.

Una traduzione in cache è legata alla lingua UI per cui è stata creata - cambiare la tua lingua
UI, o modificare il titolo/descrizione originale di un gioco, la invalida automaticamente
(traduci di nuovo per ottenerne una fresca per la nuova lingua o il testo modificato).

## Avvii tramite URI vs. eseguibili diretti {#uri-launches-vs-direct-executables}

Alcuni plugin sorgente (Steam, Epic) avviano un gioco tramite un URI della piattaforma
(`steam://run/...`, `com.epicgames.launcher://...`) invece di un percorso `.exe` diretto, poiché
è così che la piattaforma stessa si aspetta di ricevere l'istruzione di avviare un gioco. Il
tracciamento del tempo di gioco funziona diversamente per questi casi - vedi
[Tracciamento del Tempo di Gioco](#playtime-tracking) sotto.

## Tracciamento del Tempo di Gioco {#playtime-tracking}

Per un percorso di eseguibile diretto, Concourse attende il processo effettivo e registra una
sessione reale (inizio/fine/durata) una volta che termina. Per un gioco avviato tramite URI, non
esiste un handle di processo da attendere allo stesso modo, quindi una sessione non viene
registrata allo stesso modo - le cifre di "Recently Played"/ore totali nella scheda Stats
riflettono ciò che è effettivamente tracciabile per metodo di avvio.
