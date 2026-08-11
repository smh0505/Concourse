# Aperçu de l'architecture des plugins

Concourse rassemble des jeux provenant de nombreuses sources dans une seule bibliothèque, et se
personnalise elle-même, via un système de plugins unique comportant cinq types. Chaque type
partage un même format de manifeste et un même chargeur ; ce qui diffère, c'est le contrat
qu'implémente un plugin de ce type.

## Les cinq types de plugins

| Type | Rôle | Sélection |
|---|---|---|
| `source` | Analyser une plateforme (Steam, GOG, Epic, ...) à la recherche de jeux installés, les lancer | multi-activé |
| `theme` | Personnaliser les couleurs/polices/visuels des cartes | exclusif (un seul actif à la fois) |
| `metadata` | Récupérer description/date de sortie/visuels d'un jeu depuis une base de données externe | multi-activé |
| `controller` | Faire correspondre les boutons/axes physiques de la manette pour la navigation en Big Picture | exclusif |
| `wrapper` | Lancer un jeu via une couche de compatibilité qu'il gère lui-même (par ex. un émulateur de locale) | multi-activé |

Les plugins source et fournisseur de métadonnées sont activés indépendamment et de façon
**multiple** (cases à cocher dans Settings) — vous pouvez exécuter plusieurs plugins de source et
plusieurs fournisseurs de métadonnées à la fois, chacun apportant des jeux/champs que les autres
n'apportent pas. Les plugins de thème et de correspondance de manette sont en **sélection unique
exclusive** (boutons radio) — vous naviguez toujours avec un seul skin et un seul schéma d'entrée
physique à la fois.

## Deux façons de distribuer un plugin

1. **Plugin WASM** — un composant `.wasm` installé séparément, téléchargé par URL (ou via le
   registre organisé) à l'exécution, s'exécutant dans une instance sandboxée du Component Model
   [wasmtime](https://wasmtime.dev/). C'est aujourd'hui la voie pour les plugins tiers
   `source`/`wrapper`/`metadata` — voir [Prise en main](./getting-started) et la référence
   [Interface WIT](./wit-interface).
2. **Manifeste de thème purement déclaratif** — pour les plugins `theme` spécifiquement, un
   manifeste peut être du JSON pur (`cssVariables`/`cardVisual`/`fontFaces`, aucun code) s'il n'a
   pas besoin de toute la machinerie des plugins WASM. Voir
   [Manifestes de thème](./theme-manifests).

Les plugins WASM n'existent que pour les trois types pour lesquels un
[monde WIT](https://component-model.bytecodealliance.org/design/wit.html) a été défini jusqu'à
présent : `source`, `wrapper`, `metadata`. Construire un plugin `theme` tiers aujourd'hui signifie
passer par la voie du manifeste purement déclaratif ci-dessus. Il n'existe actuellement aucune
voie tierce pour les plugins de correspondance `controller` - les correspondances de manette
intégrées de Concourse sont compilées directement dans l'application, et en ajouter une nouvelle
aujourd'hui signifie contribuer à Concourse lui-même plutôt que distribuer un plugin séparé.

## Pourquoi WASM, ni du code natif ni un langage de script

Concourse a autrefois envisagé des exécutables natifs téléchargeables et un langage de script pour
les plugins tiers. Les deux ont été rejetés pour la même raison : un plugin a besoin d'un accès
réel au système de fichiers/registre/réseau/processus pour faire son travail (analyser une
installation Steam, lancer un jeu via un wrapper), et aucune des deux options ne peut accorder un
accès *délimité* — un binaire natif ou un script non sandboxé obtient les mêmes privilèges que
l'application entière. WASM via le Component Model offre à la place un véritable sandboxing basé
sur les capacités : un plugin n'obtient une fonction de l'interface `host` que si le côté Rust de
Concourse l'implémente et l'accorde, et même alors, la plupart des fonctions sont en plus
délimitées par plugin (voir [Modèle de sécurité](./security-model)).

## Suite

- [Prise en main](./getting-started) — construire un plugin de source WASM minimal de bout en bout
- [Référence du manifeste](./manifest-reference) — chaque champ de `plugin.json`
- [Manifestes de thème](./theme-manifests) — `cssVariables`/`cardVisual`/`fontFaces` pour les plugins de thème
- [Interface WIT](./wit-interface) — la surface de capacités réelle de l'hôte et les mondes de plugins
- [Modèle de sécurité](./security-model) — portées de chemins, contrôle des capacités, signature
- [Publication](./publishing) — soumettre au registre organisé de plugins
