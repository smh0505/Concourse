# Interface WIT

Voici le véritable contrat [WIT](https://component-model.bytecodealliance.org/design/wit.html)
sur lequel se construit chaque plugin WASM — la source de vérité est
`src-tauri/wit/plugin.wit` dans le dépôt principal ; cette page l'explique, mais ce fichier fait
autorité si les deux venaient à diverger.

## L'interface `host`

Chaque fonction hôte ci-dessous est une capacité que le côté Rust implémente et expose à votre
plugin - des primitives délibérément génériques (registre/fichier/processus/réseau/stockage
délimité) plutôt que des fonctions sémantiques propres à chaque intégration. Un plugin de source
compose lui-même ces primitives (par ex. en analysant le format VDF/XML propre à un éditeur) au
lieu que Concourse écrive un module sur mesure par source.

### Registre (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` vaut `"HKLM"` ou `"HKCU"`. Une clé/valeur manquante renvoie `none`/une liste vide, pas une
erreur - « n'existe pas » est un résultat normal et attendu (par ex. vérifier si une plateforme
est installée du tout).

### Système de fichiers

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` retourne le propre répertoire accessible en écriture de ce plugin
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - toujours implicitement lisible/accessible en
écriture. Tout autre chemin doit entrer dans une portée déclarée par votre manifeste, ou être
demandé à l'exécution (voir [Modèle de sécurité](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Pour un répertoire découvert à l'exécution plutôt que connu statiquement (par ex. l'endroit où
l'utilisateur a réellement installé Steam) - l'hôte n'accorde ceci que s'il reconnaît l'id de
votre plugin *et* que le chemin passe un vrai contrôle structurel pour ce fournisseur.

### Processus

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` est du type « tire et oublie » (fire-and-forget, aucune attente/code de sortie) -
correspond à la façon dont `launch()` est utilisé ailleurs ; le suivi du temps de jeu basé sur les
dossiers propre à Concourse couvre séparément la durée de session. `run-and-wait` bloque jusqu'à
ce que le processus se termine, pour les cas qui en ont réellement besoin (par ex. une fenêtre
d'installeur tiers visible dont votre plugin doit savoir qu'elle s'est fermée avant de continuer).
Les deux requièrent l'octroi de la capacité `"run-programs"` - voir
[Modèle de sécurité](./security-model).

### Réseau

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` sert à tout ce que `http-get` ne peut pas exprimer - des en-têtes personnalisés
(un jeton porteur `Authorization`) ou une méthode autre que GET avec un corps (par ex. une API de
requête basée sur POST). Utilisez `download-bytes` plutôt que `http-get`/`http-request` pour les
réponses binaires.

### Archives zip

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Ensemble, elles couvrent le flux courant « télécharger un zip de release, l'extraire, l'installer »
(utilisé par les plugins `wrapper` pour leurs propres installations gérées). `unwrap-single-subdir`
gère le cas courant où un zip de release enveloppe son contenu dans un dossier de premier niveau
correspondant au nom de l'archive.

### Stockage délimité

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Les deux sont automatiquement isolés par espace de nom par l'hôte selon l'id du plugin - votre
plugin ne peut jamais lire ou écrire les réglages d'un autre plugin ou les données par jeu d'un
autre plugin, ni atteindre directement une table centrale de l'application.

## Les trois mondes de plugins

Chaque `kind` qu'un plugin WASM peut implémenter exporte l'un de ces mondes :

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Reflète l'interface TypeScript intégrée `SourcePlugin` - un plugin de source WASM est une
implémentation alternative directement interchangeable du même contrat. Voir
[Prise en main](./getting-started) pour un parcours complet de son implémentation.

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

Un wrapper de compatibilité (par ex. un émulateur de locale) - entièrement autonome. `install()`
télécharge la dernière release, l'extrait, initialise une configuration de profil par défaut si
aucune n'existe, et lance le véritable installeur du fournisseur pour l'étape d'enregistrement que
lui seul peut effectuer. Contrairement aux plugins de source, il n'y a aucun chemin détenu par
l'hôte à passer où que ce soit - le plugin s'installe toujours (et se résout) au même emplacement
déterministe sous son propre `plugin-dir()`.

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

`search-candidates` retourne toute correspondance plausible - généralement 0 ou 1, mais peut en
retourner davantage quand les propres listings de votre fournisseur sont réellement ambigus (par
ex. un doublon/une réédition partageant le même titre). L'hôte choisit automatiquement l'unique
candidat quand exactement un seul est retourné, affiche un sélecteur à l'utilisateur quand
plusieurs le sont, et ignore complètement votre fournisseur quand aucun ne l'est.
`fetch-metadata-by-id` récupère ensuite les métadonnées complètes pour un candidat spécifique par
son `id`.

## `game-entry` et `locale-profile`

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
