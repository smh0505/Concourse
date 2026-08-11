# Prise en main

Concourse est une application de bureau qui rassemble des jeux provenant de nombreuses sources
dans une seule bibliothèque, avec un mode « Big Picture » plein écran façon console pour une
navigation pensée d'abord pour la manette. Ce guide couvre l'usage quotidien de l'application. Si
vous construisez plutôt un plugin, consultez la
[documentation des plugins](/fr/plugins/).

## Installation

Téléchargez le dernier installeur depuis la
[page des Releases](https://github.com/smh0505/Concourse/releases/latest) (Windows uniquement
pour l'instant). Concourse recherche et installe automatiquement ses propres mises à jour une
fois lancée - inutile de retélécharger manuellement après la première installation.

## Premier lancement

Au premier lancement, votre bibliothèque est vide. Vous pouvez la peupler de deux façons, et la
plupart des gens finissent par utiliser les deux :

1. **Ajouter un jeu manuellement** - le bouton « Add Game » (barre latérale) demande un titre et
   un chemin d'exécutable, pour tout ce qu'un plugin de source ne couvre pas déjà (un émulateur,
   un téléchargement itch.io, ...).
2. **Installer un plugin de source** - l'onglet Settings → Source permet d'installer un plugin
   qui analyse une plateforme existante (Steam, GOG, Epic, ...) à la recherche des jeux que vous
   possédez déjà, et garde cette liste synchronisée lors des analyses ultérieures. Voir
   [Bibliothèque & jeux](./library) pour comprendre le fonctionnement de l'analyse/dédoublonnage,
   et [Plugins & thèmes](./plugins-and-themes) pour savoir comment en installer un concrètement.

## Où trouver les choses

- **Library** (barre latérale) - votre grille/liste de jeux, la vue par défaut.
- **Stats** - total des jeux/heures, Most Played, Recently Played.
- **Tags** / **Collections** - deux notions d'organisation distinctes : les tags sont des
  étiquettes libres (« Co-op », « Backlog ») ; les collections regroupent une série/franchise
  (« Final Fantasy »). Gérez les deux depuis leurs propres onglets de la barre latérale, ou
  assignez-les par jeu depuis la page de détail d'un jeu.
- **Settings** - tout ce qui concerne les plugins/thèmes/préférences de l'application, voir
  [Plugins & thèmes](./plugins-and-themes) ; c'est aussi là que vous configurez la traduction
  hors ligne - voir [Bibliothèque & jeux](./library#offline-translation).
