# Interfaccia WIT

Questo è l'effettivo contratto [WIT](https://component-model.bytecodealliance.org/design/wit.html)
contro cui ogni plugin WASM viene costruito — la fonte di verità è `src-tauri/wit/plugin.wit` nel
repo principale; questa pagina lo spiega, ma quel file è autorevole se i due dovessero mai
divergere.

## L'interfaccia `host`

Ogni funzione host sotto è una capability che il lato host in Rust implementa ed espone al tuo
plugin - primitivi deliberatamente generici (registro/file/processo/rete/storage con scope)
invece di funzioni semantiche per singola integrazione. Un plugin sorgente compone questi da sé
(ad es. parsando il formato VDF/XML proprio di un vendor) invece che Concourse scriva un modulo
su misura per ogni fonte.

### Registro (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` è `"HKLM"` o `"HKCU"`. Una chiave/valore mancante restituisce `none`/una lista vuota, non
un errore - "non esiste" è un esito normale e atteso (ad es. verificare se una piattaforma è
installata affatto).

### Filesystem

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` restituisce la directory scrivibile propria di questo plugin
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - sempre implicitamente leggibile/scrivibile.
Ogni altro percorso deve rientrare in uno scope dichiarato dal tuo manifest, o essere richiesto a
runtime (vedi [Modello di Sicurezza](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Per una directory scoperta a runtime piuttosto che nota staticamente (ad es. dove l'utente ha
effettivamente installato Steam) - l'host concede questo solo se riconosce l'id del tuo plugin *e*
il percorso supera un controllo strutturale reale per quel vendor.

### Processo

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` è fire-and-forget (nessuna attesa/codice di uscita) - corrisponde a come
`launch()` viene usato altrove; il tracciamento del tempo di gioco basato su cartelle di Concourse
copre separatamente la durata della sessione. `run-and-wait` blocca finché il processo non
termina, per i casi che ne hanno davvero bisogno (ad es. una finestra di installer visibile di
terze parti che il tuo plugin deve sapere essersi chiusa prima di continuare). Entrambi richiedono
la concessione della capability `"run-programs"` - vedi [Modello di Sicurezza](./security-model).

### Rete

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` serve per tutto ciò che `http-get` non può esprimere - header personalizzati (un
token bearer `Authorization`) o un metodo non-GET con un body (ad es. un'API di query basata su
POST). Usa `download-bytes` invece di `http-get`/`http-request` per risposte binarie.

### Archivi zip

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Insieme, questi coprono il comune flusso "scarica uno zip di release, estrailo, e installalo"
(usato dai plugin `wrapper` per le proprie installazioni gestite). `unwrap-single-subdir` gestisce
il caso comune in cui uno zip di release racchiude i propri contenuti in una cartella di primo
livello che corrisponde al nome dell'archivio.

### Storage con scope

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Entrambi automaticamente namespaced dall'host per id di plugin - il tuo plugin non può mai
leggere o scrivere le impostazioni di un altro plugin o i dati per-gioco di un altro plugin, né
raggiungere direttamente una tabella dell'app core.

## I tre mondi di plugin

Ogni `kind` che un plugin WASM può implementare esporta uno di questi mondi:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Rispecchia l'interfaccia TypeScript `SourcePlugin` integrata - un plugin sorgente WASM è
un'implementazione alternativa drop-in dello stesso contratto. Vedi [Per Iniziare](./getting-started)
per un percorso completo su come implementarne uno.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

Un wrapper di compatibilità (ad es. un emulatore di locale) - completamente autonomo. `install()`
scarica l'ultima release, la estrae, semina una configurazione di profilo predefinita se non ne
esiste una, ed esegue il vero installer del vendor per qualsiasi passaggio di registrazione che
solo lui può fare. A differenza dei plugin sorgente, non esiste un percorso posseduto dall'host da
passare da nessuna parte - il plugin si installa sempre nella (e risolve) la stessa posizione
deterministica sotto il proprio `plugin-dir()`.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` restituisce ogni corrispondenza plausibile - di solito 0 o 1, ma può essere di
più quando gli elenchi del tuo provider sono genuinamente ambigui (ad es. un duplicato/riedizione
che condivide lo stesso titolo). L'host sceglie automaticamente l'unico candidato quando ne torna
esattamente uno, mostra all'utente un selettore quando ne tornano più di uno, e salta del tutto il
tuo provider quando non ne torna nessuno. `fetch-metadata-by-id` poi recupera i metadati completi
per uno specifico candidato tramite il suo `id`.

## `game-entry` e `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
