# Plugins & thèmes

Settings propose un panneau à onglets couvrant chaque type de plugin : **Source**, **Theme**,
**Metadata Provider**, **Controller** et **Wrapper**. Si vous construisez un plugin plutôt que
d'en installer un, consultez plutôt la [documentation des plugins](/fr/plugins/) - cette page
concerne le point de vue utilisateur. Voir [Plugins officiels](./official-plugins) pour la liste
actuelle des plugins/thèmes maintenus.

## Installer un plugin

Cliquez sur « Add Plugin » depuis n'importe quel onglet. Vous avez deux options :

- **Registre organisé (curated registry)** - une liste revue, vérifiée par hash, de plugins
  connus comme fiables. Choisissez-en un et cliquez sur Install ; Concourse vérifie son contenu
  par rapport à un hash épinglé avant l'installation, donc ce que vous obtenez est exactement ce
  qui a été revu.
- **Coller une URL de manifeste** - installez n'importe quoi d'autre en collant un lien direct
  vers son `plugin.json`. Cela fonctionne pour n'importe quel plugin, listé dans le registre ou
  non, mais saute la vérification par hash offerte par le registre - vous faites confiance
  directement à celui qui a publié cette URL. Concourse vous montre quand même ce que le plugin
  déclare avoir besoin (accès fichier/registre/réseau, s'il peut exécuter d'autres programmes)
  avant que vous ne confirmiez.

## Activer/désactiver et ordonner

- Les plugins **Source** et **Metadata Provider** sont activés indépendamment et de façon
  multiple (cases à cocher) - vous pouvez exécuter plusieurs plugins de source et plusieurs
  fournisseurs de métadonnées à la fois. Leur ordre compte : pour les plugins de source, il
  détermine lequel l'emporte quand le même jeu est trouvé par plus d'un (voir
  [dédoublonnage](./library#deduplication-across-sources)) ; pour les fournisseurs de métadonnées,
  il détermine la réponse de quel fournisseur l'emporte par champ (description, date de sortie,
  jaquette/arrière-plan) quand plus d'un a quelque chose à dire. Réordonnez l'une ou l'autre liste
  avec les flèches à côté de chaque entrée.
- Les plugins **Theme** et **Controller** sont exclusifs (boutons radio) - vous naviguez toujours
  avec un seul skin et utilisez une seule correspondance de manette physique à la fois.
- Les plugins **Wrapper** (couches de compatibilité, par ex. un émulateur de locale) sont activés
  de façon multiple, chacun installable/gérable indépendamment, et sélectionnable par jeu depuis
  le formulaire d'édition de ce jeu.

## Mises à jour

Concourse vérifie automatiquement les mises à jour des plugins/thèmes (au démarrage de
l'application, quand la fenêtre reprend le focus, et chaque fois que vous ouvrez Settings ou la
boîte de dialogue Add Plugin) et affiche un badge « Update to vX.Y.Z » à côté de tout ce qui a une
nouvelle version disponible. Cliquez dessus pour mettre à jour sur place.

## Désinstallation

Chaque plugin/thème installé (non intégré) possède une action Remove/Uninstall dans sa propre
ligne. Les thèmes et les plugins source/metadata/wrapper qui gèrent leurs propres fichiers
téléchargés (par ex. le runtime installé d'un wrapper) les nettoient aussi, pas seulement
l'entrée du manifeste.
