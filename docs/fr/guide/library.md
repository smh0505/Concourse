# Bibliothèque & jeux

## Ajouter des jeux

**Manuellement** : le bouton « Add Game » demande un titre et un chemin d'exécutable (ou un URI
de lanceur comme `steam://run/<appid>` - voir [ci-dessous](#uri-launches-vs-direct-executables)).
Utilisez ceci pour tout ce qu'un plugin de source ne couvre pas déjà.

**Via un plugin de source** : une fois qu'un plugin de source est installé et activé
(Settings → Source), Settings propose un bouton « Scan Now » qui trouve tous les jeux que ce
plugin connaît et les ajoute à votre bibliothèque. Relancer une analyse plus tard récupère les
jeux nouvellement installés sans dupliquer ceux déjà présents dans votre bibliothèque (voir le
dédoublonnage ci-dessous).

## Modifier un jeu

Ouvrez la page de détail d'un jeu (cliquez sur sa jaquette/son titre, ou l'icône Edit) et passez
en mode édition. Vous pouvez remplacer le titre, les URL de jaquette/arrière-plan, la description
(Markdown pris en charge), la date de sortie et la plateforme. Un bouton « Fetch Metadata »
relance vos fournisseurs de métadonnées activés (Settings → Metadata Provider) sur le titre
actuel et remplit ce qu'il trouve - utile si la récupération automatique a manqué quelque chose,
ou si les données d'un fournisseur ont changé depuis l'ajout initial du jeu.

## Tags & Collections

- Les **Tags** sont des étiquettes libres (« Co-op », « Backlog », « Completed ») - créez/
  renommez/supprimez-les depuis l'onglet Tags de la barre latérale, assignez-les par jeu depuis
  la page de détail de ce jeu.
- Les **Collections** regroupent une série/franchise (« Final Fantasy ») - une notion distincte
  des tags, gérée de la même façon depuis son propre onglet de la barre latérale.

## Recherche, filtrage & tri

La barre de recherche accepte du texte de titre simple plus trois tokens spéciaux, tous combinables dans une
seule requête : `platform:steam`, `tag:coop`, `collection:"final fantasy"` (mettez entre guillemets une valeur
contenant des espaces). Saisir `platform:steam zelda` recherche « zelda » dans les titres uniquement parmi
les jeux Steam.

Sous la barre de recherche, des pastilles cliquables reflètent les mêmes plateformes/tags/collections -
cliquer sur l'une d'elles ajoute ou retire son token de la barre de recherche, de sorte que la barre de
recherche et les pastilles concordent toujours entre elles. Plusieurs pastilles de même type se combinent
soit en **OR** (n'importe quelle valeur sélectionnée correspond - par défaut), soit en **AND** (doit
correspondre à chaque valeur sélectionnée) ; basculez le mode utilisé par une catégorie depuis la pastille
« browse all filters » (la ligne est plafonnée, et cette pastille ouvre une fenêtre modale listant tout sans
plafond, groupé par plateforme/tags/collections). Un jeu ajouté manuellement sans plateforme d'un plugin de
source apparaît sous une pastille de plateforme `manual`.

Un menu déroulant de tri séparé, à côté du bouton de bascule du mode d'affichage, propose Titre (A-Z), Joué
récemment, Le plus joué et Ajouté récemment - votre choix persiste entre les redémarrages, comme le mode
d'affichage grille/liste.

## Opérations en lot

Cliquez sur le bouton de type case à cocher à côté du menu déroulant de tri pour entrer en mode sélection :
chaque carte/ligne devient une cible sélectionnable en un clic, avec un petit badge case à cocher indiquant ce
qui est actuellement sélectionné. Une barre « N sélectionné(s) » apparaît avec les boutons Tout sélectionner
(respecte le filtre/la recherche actuellement actifs) et Effacer, ainsi que des actions en lot : ajouter un
tag, ajouter à une collection, ou retirer toute la sélection de votre bibliothèque. Quittez le mode sélection
avec le bouton X pour revenir à la navigation normale.

## Dédoublonnage entre sources {#deduplication-across-sources}

Si le même jeu est à la fois ajouté manuellement et trouvé plus tard par une analyse de plugin de
source (ou trouvé par deux plugins de source différents), Concourse les fusionne en une seule
entrée plutôt que d'afficher des doublons - la correspondance se fait par titre. Quand plusieurs
sources trouvent le même titre, le plugin le plus prioritaire dans l'ordre de votre onglet Source
l'emporte pour le chemin de lancement/la plateforme (réordonnez les plugins là-bas si vous voulez
qu'un autre prenne la priorité).

Si vous voulez vraiment garder séparées deux entrées de même titre (par ex. deux versions
différentes du même jeu), le formulaire d'édition d'un jeu propose une case « Keep separate from
plugin scans » (`skip_dedup`) - cochez-la pour exclure cette entrée spécifique de la logique de
fusion.

## Traduction hors ligne {#offline-translation}

Le titre et la description d'un jeu peuvent être traduits dans votre langue d'interface actuelle
entièrement hors ligne - aucun service de traduction externe, rien ne quitte votre machine.
Depuis la page de détail d'un jeu, le bouton « Translate » ouvre un menu avec trois groupes
(faites défiler ou utilisez les flèches pour naviguer entre eux) :

- **Translate** - traduit uniquement le titre, uniquement la description, ou les deux. Relancer
  ceci avec un modèle différent sélectionné écrase la traduction précédente pour ce champ.
- **Show** - bascule entre le texte traduit et l'original, par champ ou pour les deux à la fois.
  Ce choix est mémorisé par jeu, donc rouvrir un jeu plus tard affiche ce que vous aviez choisi en
  dernier spécifiquement pour lui.
- **Remove** - efface une traduction mise en cache pour un champ (ou les deux), revenant à
  l'original sans rien laisser en cache.

**Configuration unique** (Settings) : téléchargez le moteur de traduction une fois (un petit
téléchargement, à faire une seule fois), puis choisissez un modèle dans le menu déroulant et
téléchargez-le aussi. Plusieurs niveaux de modèle sont proposés, faisant un compromis
taille/RAM contre qualité - tous fonctionnent entièrement sur le CPU, donc un niveau plus petit
traduit plus vite et utilise moins de mémoire pendant qu'un jeu tourne en parallèle. Un niveau est
non censuré, destiné à traduire les descriptions de jeux NSFW eux-mêmes sans qu'un modèle
« safety-tuned » ne refuse de traduire un texte tiers légitime.

Une traduction mise en cache est liée à la langue d'interface pour laquelle elle a été faite -
changer votre langue d'interface, ou modifier le titre/la description originale d'un jeu,
l'invalide automatiquement (retraduisez pour en obtenir une nouvelle pour la nouvelle langue ou
le texte modifié).

## Lancements par URI vs. exécutables directs {#uri-launches-vs-direct-executables}

Certains plugins de source (Steam, Epic) lancent un jeu via un URI de plateforme
(`steam://run/...`, `com.epicgames.launcher://...`) plutôt qu'un chemin `.exe` direct, puisque
c'est ainsi que la plateforme elle-même s'attend à être invoquée pour démarrer un jeu. Le suivi
du temps de jeu fonctionne différemment pour ceux-ci - voir
[Suivi du temps de jeu](#playtime-tracking) ci-dessous.

## Suivi du temps de jeu {#playtime-tracking}

Pour un chemin d'exécutable direct, Concourse attend le processus réel et enregistre une vraie
session (début/fin/durée) une fois qu'il se termine. Pour un jeu lancé par URI, il n'y a pas de
handle de processus à attendre de la même façon, donc une session n'est pas enregistrée de la
même manière - les chiffres « Recently Played »/total d'heures de l'onglet Stats reflètent ce qui
est réellement traçable selon la méthode de lancement.
