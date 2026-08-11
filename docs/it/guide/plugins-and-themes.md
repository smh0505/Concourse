# Plugin e Temi

Settings ha un unico pannello a schede che copre ogni tipo di plugin: **Source**, **Theme**,
**Metadata Provider**, **Controller** e **Wrapper**. Se stai costruendo un plugin invece di
installarne uno, vedi la [Documentazione Plugin](/it/plugins/) - questa pagina è il lato rivolto
all'utente. Vedi [Plugin Ufficiali](./official-plugins) per l'elenco attuale dei plugin/temi
mantenuti.

## Installare un plugin

Clicca "Add Plugin" da qualsiasi scheda. Hai due opzioni:

- **Registro curato** - una lista revisionata e verificata tramite hash di plugin noti come
  affidabili. Scegline uno e clicca Install; Concourse verifica il suo contenuto rispetto a un
  hash fissato prima di installare, così ciò che ottieni è esattamente ciò che è stato revisionato.
- **Incolla un URL del manifest** - installa qualsiasi altra cosa incollando un link diretto al
  suo `plugin.json`. Questo funziona per qualsiasi plugin, elencato nel registro o meno, ma salta
  la verifica hash che offre il percorso del registro - ti stai fidando direttamente di chi ha
  pubblicato quell'URL. Concourse ti mostra comunque cosa il plugin dichiara di aver bisogno
  (accesso a file/registro/rete, se può eseguire altri programmi) prima di confermare.

## Abilitare/disabilitare e ordinamento

- I plugin **Source** e **Metadata Provider** sono abilitabili in modo indipendente e multiplo
  (checkbox) - esegui più plugin sorgente e più provider di metadati contemporaneamente. Il loro
  ordine conta: per i plugin sorgente, decide quale vince quando lo stesso gioco viene trovato da
  più di uno (vedi [deduplicazione](./library#deduplication-across-sources)); per i provider di
  metadati, decide quale risposta del provider vince per ogni campo (descrizione, data di
  rilascio, artwork di copertina/sfondo) quando più di uno ha qualcosa da dire. Riordina entrambe
  le liste con le frecce accanto a ogni voce.
- I plugin **Theme** e **Controller** sono esclusivi (radio) - stai sempre navigando con una sola
  skin e usando una sola mappatura fisica del controller alla volta.
- I plugin **Wrapper** (layer di compatibilità, ad es. un emulatore di locale) sono abilitabili
  in modo multiplo, ciascuno installabile/gestibile in modo indipendente, e selezionabile per
  singolo gioco dal modulo di modifica di quel gioco.

## Aggiornamenti

Concourse controlla automaticamente gli aggiornamenti di plugin/temi (avvio dell'app, focus della
finestra dell'app, e ogni volta che apri Settings o la finestra di dialogo Add Plugin) e mostra un
badge "Update to vX.Y.Z" accanto a qualsiasi cosa abbia una nuova versione disponibile. Cliccaci
sopra per aggiornare sul posto.

## Disinstallazione

Ogni plugin/tema installato (non integrato) ha un'azione Remove/Uninstall nella propria riga. I
temi e i plugin source/metadata/wrapper che gestiscono i propri file scaricati (ad es. il runtime
installato di un wrapper) puliscono anche quelli, non solo la voce del manifest.
