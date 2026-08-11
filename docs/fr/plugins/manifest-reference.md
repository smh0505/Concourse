# Référence du manifeste

Chaque plugin — TypeScript intégré, WASM, ou thème purement déclaratif — est décrit par un
manifeste `plugin.json`. Cette page documente chaque champ que le chargeur de Concourse comprend
(source : l'interface `PluginManifest` de `src/plugins/manifest.ts`).

## Champs de base (tous les plugins)

| Champ | Type | Requis | Notes |
|---|---|---|---|
| `id` | `string` | oui | Identifiant unique. Utilisé comme nom de répertoire d'installation pour les plugins WASM - gardez-le compatible avec le système de fichiers. |
| `name` | `string` | oui | Nom affiché dans Settings. |
| `version` | `string` | oui | SemVer classique, indépendant de la version de l'application elle-même. Voir [versionnage](#versioning) ci-dessous. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | oui | Quelle capacité ce plugin fournit - détermine ce que son module/composant d'entrée doit exporter. |
| `entry` | `string` | oui | Chemin vers le fichier `.wasm` compilé, relatif au propre dossier du plugin. |
| `runtime` | `"wasm" \| "data"` | non | Définissez `"wasm"` pour un plugin WASM, ou `"data"` pour un manifeste de thème sans code (aucun `entry` à charger du tout - `cssVariables` *est* la totalité du plugin). Un manifeste tiers devrait toujours définir l'un des deux. (`"ts"`/absent est une troisième valeur également reconnue par le chargeur, mais elle signifie un module TypeScript compilé au moment du build et intégré à l'application elle-même - usage interne uniquement, jamais quelque chose que vous définiriez dans un manifeste que vous distribuez.) |
| `installable` | `boolean` | non | Vrai si ce plugin implémente le cycle de vie install/uninstall (`install()`/`uninstall()`/`isInstalled()`) - détermine si le bouton générique « Install » est affiché automatiquement. |

Les manifestes de thème ont leur propre ensemble dédié de champs (`cssVariables`/`cardVisual`/
`fontFaces`) - voir [Manifestes de thème](./theme-manifests) plutôt que cette page pour ceux-là.

## Champs pour plugin WASM

| Champ | Type | Notes |
|---|---|---|
| `settingsSchema` | tableau de `{ key, label, type? }` | Déclare des réglages configurables par l'utilisateur (par ex. une clé API) - l'hôte génère un formulaire de réglages générique à partir de ceci au lieu que votre plugin ait besoin de sa propre interface de réglages personnalisée. `type: "password"` masque la saisie. |
| `capabilities` | `string[]` | Quelles capacités hôtes contrôlées ce plugin appelle réellement. Aujourd'hui seulement `"run-programs"` (contrôle `spawn-process`/`run-and-wait`) - voir [Modèle de sécurité](./security-model). L'hôte impose ce contrôle indépendamment de ce que vous déclarez ici ; ce champ ne détermine que si l'interface de confirmation d'installation demande une autorisation explicite à l'utilisateur. |

`pathScopes`/`httpScopes` (accès en lecture déclaré au-delà de votre propre dossier de plugin, et
hôtes réseau autorisés) sont affichés dans la boîte de dialogue de confirmation d'installation
pour la visibilité de l'utilisateur, mais sont calculés par l'hôte à partir des requêtes réelles
au niveau WIT de votre plugin, pas déclarés directement dans `plugin.json` - voir
[Modèle de sécurité](./security-model) pour comprendre comment fonctionne réellement le contrôle
des portées.

## Champs ajoutés par l'hôte (ne jamais les définir vous-même)

| Champ | Type | Notes |
|---|---|---|
| `sourceUrl` | `string` | L'URL exacte depuis laquelle ceci a été installé - ajoutée par l'hôte au moment de l'installation afin qu'une vérification de mise à jour ultérieure puisse la récupérer à nouveau et comparer les versions. |
| `installedViaRegistry` | `boolean` | Vrai si installé via l'entrée à hash épinglé du registre organisé plutôt que via une URL collée librement - change le fonctionnement de la vérification des mises à jour (un `sourceUrl` épinglé par le registre est figé pour toujours par SHA de commit ; vérifier une mise à jour signifie récupérer à nouveau l'entrée *actuelle* du registre pour cet id, pas récupérer `sourceUrl` à nouveau). |

## Exemple : un manifeste de plugin de source minimal

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Voir [Manifestes de thème](./theme-manifests) pour un exemple de manifeste de thème.

## Versionnage {#versioning}

Les versions de plugin suivent un SemVer classique, suivi indépendamment de la version de
l'application elle-même :

- **Patch** : correction de bug, aucun changement de manifeste/comportement.
- **Minor** : nouvelle capacité, rétrocompatible - fonctionne toujours avec la même interface WIT
  hôte (plugins WASM) ou la même forme `PluginBase` (plugins TS).
- **Major** : changement cassant - la forme du manifeste change, ou (plugins WASM) le plugin
  requiert désormais une version de l'interface `wit/plugin.wit` qu'une ancienne version de
  Concourse ne possède pas. C'est le signal « ne pas installer ceci sur une ancienne version de
  l'application ».

Les plugins WASM installés séparément et les manifestes de thème purement déclaratifs commencent
conventionnellement à `0.1.0`/`1.0.0` respectivement - un manifeste de thème purement déclaratif
est assez stable pour commencer à `1.0.0`, tandis qu'un plugin WASM avec une vraie logique
d'installation/lancement commence généralement à `0.1.0` jusqu'à faire ses preuves en usage réel.
