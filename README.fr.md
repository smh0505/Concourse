# Concourse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[简体中文](README.zh-Hans.md) | [Español](README.es.md) | [Deutsch](README.de.md) |
[Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*Cette traduction est une traduction automatique (la même approche assumée que pour les
locales de l'interface de l'appli elle-même - voir [Localization](#fonctionnalités)
ci-dessous), pas encore relue par des locuteurs natifs.*

Une application de bureau qui agrège des jeux provenant de plusieurs sources (Steam, Epic,
GOG, ajouts manuels, et bien d'autres via des plugins) en une bibliothèque unifiée, avec un
mode "Big Picture" façon console, pensé pour la manette - dans le même esprit que Playnite ou
la bibliothèque de Steam elle-même.

L'application principale reste légère ; presque tout ce qui dépasse la bibliothèque de base
(scanners de sources, thèmes, fournisseurs de métadonnées, mappages de manette, wrappers de
compatibilité) est un plugin.

## Fonctionnalités

- **Cœur de bibliothèque** - "ajouter un jeu" manuel, stockage sur SQLite, vues en grille et
  en liste, tags, recherche/filtrage
- **Métadonnées et médias** - jaquette via SteamGridDB, description/genre/date de sortie via
  IGDB, surcharge manuelle
- **Lancement et suivi du temps de jeu** - lancement unifié quelle que soit la source
  (exécutable direct, URI `steam://` de Steam, gestionnaires de protocole Epic/GOG, jeux
  lancés via un wrapper de compatibilité), avec un suivi du temps de jeu basé sur la fin du
  processus ou sur le dossier selon la méthode de lancement du jeu
- **Mode Big Picture** - interface plein écran navigable à la manette avec une grille de
  tuiles et une vue diaporama façon coverflow, fondu enchaîné du fond d'écran, option de
  lancement automatique au démarrage
- **Wrappers de compatibilité** - profils Locale Remulator / Locale Emulator par jeu pour les
  titres nécessitant une langue/région non par défaut pour fonctionner
- **Système de plugins** - cinq types de plugins (source, thème, fournisseur de métadonnées,
  mappage de manette, wrapper de compatibilité), chargés soit à la compilation (plugins
  TypeScript embarqués sous `src/plugins/`), soit à l'exécution (plugins WebAssembly
  téléchargeables - voir plus bas)
- **Localisation** - interface disponible en 10 langues (anglais plus 9 locales traduites
  automatiquement), un `--font-family` réglable par le thème pour reskinner toute
  l'application, et un niveau de thème purement basé sur des données (`cssVariables` + une
  surcharge JSON-AST optionnelle de `cardVisual` pour la zone de jaquette, sans code requis)
- **Traduction hors ligne** - le titre/la description d'un jeu peuvent être traduits vers votre
  langue d'interface actuelle entièrement sur l'appareil (sans service externe) : téléchargez
  une fois le binaire serveur précompilé de llama.cpp, choisissez un modèle (plusieurs niveaux
  adaptés au CPU, dont un sans censure pour les descriptions de jeux NSFW), puis
  traduisez/basculez l'affichage/annulez le titre et le contenu indépendamment depuis la page
  de détail d'un jeu. Les traductions sont conservées par jeu et par champ, et sont invalidées
  automatiquement lors d'un changement de langue ou d'une modification de l'original
- **Mise à jour automatique** - l'application elle-même ainsi que chaque plugin/thème installé
  vérifient et appliquent automatiquement les mises à jour

## Stack technique

- **Tauri 2** (backend Rust) + frontend **Vue 3** (`<script setup>`, TypeScript)
- **SQLite** via `tauri-plugin-sql`, schéma évoluant via des migrations versionnées
- **Pinia** pour l'état du frontend, un store par domaine
- **wasmtime** (Wasm Component Model) pour le système de plugins téléchargeables à l'exécution

## Développement

Ce dépôt utilise [`bun`](https://bun.sh), pas npm/yarn/pnpm.

```sh
bun install          # installer les dépendances JS
bun run dev           # serveur de développement Vite uniquement (frontend)
bunx tauri dev         # application complète (frontend + backend Rust), rechargement à chaud
bunx tauri build        # binaire de bureau de production
```

Depuis `src-tauri/` : `cargo check` pour une vérification rapide de la compilation Rust sans
build complète.

## Architecture des plugins

Chaque plugin possède un manifeste `plugin.json` (`{ id, name, version, kind, entry }`) et
implémente l'une des cinq interfaces selon `kind` :

- `source` - `scan()` / `launch()` / `getInstallStatus()`, pour les intégrations de sources de
  jeux (activation multiple)
- `theme` - variables CSS (couleurs, polices, bordures/rayons) plus une surcharge JSON-AST
  optionnelle de `cardVisual` pour la zone de jaquette (activation unique) ; un manifeste
  contenant uniquement `cssVariables` ne nécessite aucun code. Les surcharges de slot de
  composant (remplacer tout un composant Vue personnalisé) étaient supportées au début mais
  ont été retirées au profit de ce niveau AST à vocabulaire fermé - aucun chemin de code
  eval/exécutable n'existe permettant à un thème d'injecter du code
- `metadata` - `fetchMetadata(title)`, pour les fournisseurs de jaquette / description / genre
  (activation multiple)
- `controller` - un `GamepadMapping` (indices de boutons/axes) pour une disposition physique
  de manette spécifique (activation unique)
- `wrapper` - wrappers de compatibilité (par ex. Locale Remulator/Emulator) qui gèrent leur
  propre installation et lancent un exécutable cible via un profil de langue/région

Les plugins à la compilation se trouvent sous `src/plugins/<id>/` et sont découverts via
`import.meta.glob` de Vite. Les plugins à l'exécution sont des composants WebAssembly (types
`source`/`wrapper`/`metadata`) installés depuis une URL de manifeste (Réglages → l'onglet
correspondant → Ajouter un plugin) ou téléchargés/extraits manuellement dans le répertoire de
données de l'application, chargés via un hôte `wasmtime` embarqué dans le backend Rust. Les
thèmes purement basés sur des données (`cssVariables` uniquement, sans code) constituent un
niveau d'installation par URL séparé, sans code, ne nécessitant aucun sandboxing WASM.

### Plugins officiels

Consultez **[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)**
sur le site de documentation pour la liste complète (liens vers les dépôts, liens de
téléchargement de la dernière version, instructions d'installation).

**Note de sécurité (Milestone 12, clos) :** le sandbox du Component Model de wasmtime garantit
la sécurité mémoire (un plugin ne peut pas corrompre la mémoire de l'hôte ni s'échapper de sa
propre exécution), et chaque fonction hôte exposée aux plugins pouvant causer un dommage réel
est désormais soumise à des permissions :
- `spawn-process`/`run-and-wait` nécessitent une autorisation explicite et visible, par
  plugin - un plugin doit déclarer `capabilities: ["run-programs"]` dans son manifeste, et
  l'application refuse d'exécuter quoi que ce soit en son nom tant que vous ne l'avez pas
  réellement autorisé (une case à cocher dans la boîte de dialogue de confirmation
  d'installation pour une installation par URL, ou une ligne "Permission requise" avec un
  bouton Autoriser dans les Réglages pour un plugin déjà installé).
- `write-file`/`remove-dir` sont confinés de manière stricte et inconditionnelle au propre
  répertoire du plugin, sans exception. `read-file`/`list-dir`/`path-exists`/l'accès au
  registre sont limités à une liste blanche déclarée dans le manifeste (`pathScopes`), plus,
  pour le seul plugin dont l'emplacement d'installation ne peut véritablement pas être connu à
  l'avance (Steam), une demande de portée à l'exécution vérifiée - l'hôte vérifie une réelle
  signature structurelle (un sous-répertoire `steamapps`) avant d'accorder l'accès, et rejette
  purement et simplement tout id de plugin pour lequel il n'a pas de validateur.
- `http-get`/`http-request`/`download-bytes` sont limités à une liste blanche de noms d'hôtes
  déclarée dans le manifeste (`httpScopes`) - un plugin ne peut atteindre que les hôtes qu'il
  déclare (correspondance exacte ou sous-domaine), pas une URL arbitraire contrôlée par un
  attaquant.

Installez tout de même uniquement des plugins provenant de sources en lesquelles vous avez
pleinement confiance - ceci referme la faille "un plugin peut atteindre silencieusement
n'importe quel endroit de votre système ou réseau", ce n'est pas un modèle de confiance complet
de niveau app store.

**Modèle de confiance (Milestone 13, clos) :** deux couches complémentaires et indépendantes.
- **Signature** - chaque version officielle de plugin est signée avec une attestation de
  provenance de build [Sigstore](https://www.sigstore.dev/), liant le `.wasm` publié au commit
  exact et à l'exécution CI qui l'a construit. Concourse vérifie cela à l'installation et
  affiche le résultat - **à titre indicatif uniquement, ce n'est pas un blocage strict**. Cela
  confirme qu'un artefact provient réellement de la propre CI de ce dépôt, non modifié depuis
  (détecte une altération, un jeton de publication compromis, un dépôt piraté glissant une
  build malveillante) - cela ne garantit **pas** les intentions de l'auteur du dépôt. Le code
  d'un auteur malveillant obtient lui aussi une signature parfaitement valide, puisque sa
  propre CI a effectivement construit et signé exactement ce qu'il a commité.
- **Registre curé** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry), une
  liste maintenue à la main de plugins dont la version figée a réellement été relue, chaque
  entrée étant verrouillée sur une version précise et son véritable SHA256. La boîte de
  dialogue "Ajouter un plugin" affiche ces entrées à côté du champ URL libre ; installer depuis
  le registre entraîne un **rejet strict** en cas de non-correspondance du hash, contrairement
  à la vérification indicative de la signature - ce hash a été choisi à la main après revue,
  donc une non-correspondance est un signal réel de "ceci n'est pas ce qui a été relu". Retirer
  une entrée du registre *équivaut* à une révocation pour les futures installations (pas encore
  rétroactive sur les copies déjà installées). L'installation par URL libre continue de
  fonctionner exactement comme avant dans tous les cas - le registre est un chemin
  supplémentaire, plus fiable, pas un passage obligé.

## Documentation

La documentation complète pour les développeurs de plugins et les utilisateurs est publiée sur
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** (source dans
[`docs/`](docs/), construite avec VitePress) - un guide utilisateur (installation, gestion de
la bibliothèque, mode Big Picture) et une référence pour les développeurs de plugins (aperçu de
l'architecture, un guide de démarrage, la référence complète du manifeste/interface WIT, le
modèle de sécurité, et comment publier un plugin).

## État

Développé activement, jalon après jalon. Voir
[`.claude/proposal.md`](.claude/proposal.md) pour la proposition de conception originale,
[`.claude/milestones.md`](.claude/milestones.md) pour le suivi de progression à jour par
rapport à celle-ci, et [`.claude/devlog.md`](.claude/devlog.md) pour l'historique
d'implémentation/le raisonnement derrière chaque élément de jalon.

À ce jour : la bibliothèque principale, le suivi des métadonnées/du temps de jeu, le mode Big
Picture, le système de plugins (y compris le pipeline de plugins à l'exécution WebAssembly et
l'installation gérée des wrappers de compatibilité), le sandboxing des permissions des plugins
WASM (Milestone 12), un modèle de confiance/signature des plugins (Milestone 13), un travail
continu de polissage de l'interface bureau (Milestone 14), le niveau de thème JSON-AST
remplaçant le theming par échange de composants (Milestones 17/19), un travail de convention
de styles partagés (Milestone 18), la mise à jour automatique de l'application + des
plugins/thèmes (Milestone 20), la localisation en 10 langues ainsi que la traduction hors
ligne sur l'appareil des titres/descriptions de jeux (Milestone 21), et ce site de
documentation (Milestone 22) sont tous terminés. Tous les plugins officiels listés ci-dessus
sont en production. Le travail restant comprend un plugin de scanner d'émulateurs/ROM et des
plugins de source supplémentaires (Xbox/EA/Ubisoft, Milestone 16).

## Licence

MIT - voir [`LICENSE`](LICENSE).

### Mentions tierces

Le code source de Concourse lui-même est sous licence MIT ; aucun contenu tiers n'est embarqué
dans le dépôt ou le binaire compilé. La fonctionnalité de traduction hors ligne (Milestone 21)
télécharge deux types de contenu tiers directement sur votre machine à l'exécution, chacun
sous ses propres conditions séparées - mentionné ici par souci de transparence, non parce que
Concourse redistribue quoi que ce soit :

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - le moteur de traduction
  lui-même. Concourse télécharge son binaire de release officiel précompilé pour Windows
  depuis GitHub et l'exécute en tant que sous-processus ; aucun code de llama.cpp n'est
  compilé dans Concourse ni distribué avec.
- **Les poids des modèles**, téléchargés depuis Hugging Face selon votre propre sélection dans
  les Réglages, chacun sous la licence de sa propre fiche de modèle -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` sont tous en Apache 2.0 (Gemma 4 est
  spécifiquement passé à Apache 2.0 en avril 2026, remplaçant la licence plus restrictive sous
  laquelle les générations Gemma antérieures étaient distribuées). Les deux niveaux non
  censurés (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) héritent de la licence de leur
  modèle de base ; vérifiez la fiche de modèle Hugging Face de chacun avant de vous y fier à
  des fins commerciales.
