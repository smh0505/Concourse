# Modèle de sécurité

Installer par URL un plugin WASM exécute quand même du code arbitraire que vous n'avez pas écrit -
le même risque concret que lancer n'importe quel `.exe` téléchargé. Concourse ne prétend pas que
le seul sandbox WASM résout ce problème ; cette page décrit ce que l'application fait réellement à
ce sujet, et ce qu'elle ne fait pas.

## Le sandbox wasmtime lui-même

Chaque plugin WASM s'exécute à l'intérieur d'une instance du Component Model
[wasmtime](https://wasmtime.dev/) sans aucun accès ambiant à quoi que ce soit - aucun système de
fichiers, aucun réseau, aucun lancement de processus, rien, à moins qu'une fonction `host`
spécifique ne l'accorde. C'est la base : un plugin ne peut jamais faire que ce que l'interface
`host` expose (voir [Interface WIT](./wit-interface)), jamais rien au-delà, quoi que le code du
plugin lui-même essaie.

## Contrôle des portées de chemins {#path-scoping}

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) est toujours implicitement
lisible/accessible en écriture - chaque plugin obtient gratuitement un répertoire sandbox privé.
Tout ce qui va au-delà nécessite l'une de ces deux choses :

- **Une portée statique déclarée** - une clé de registre + préfixe de ruche fixe, ou un préfixe de
  chemin du système de fichiers fixe, dont un plugin a réellement besoin à un emplacement connu
  (par ex. les clés de registre fournisseur fixes d'une plateforme, ou un répertoire de manifestes
  fixe). Déclarée une fois, vérifiée par l'hôte à chaque appel fichier/registre.
- **Une portée demandée à l'exécution** (`request-read-scope`) - pour un répertoire découvrable
  seulement à l'exécution (là où l'installation Steam de l'utilisateur a réellement placé ses
  dossiers de bibliothèque). L'hôte n'accorde ceci que s'il reconnaît l'id du plugin *et* que le
  chemin demandé passe un vrai contrôle structurel pour ce fournisseur (par ex. exiger un
  sous-répertoire `steamapps`) - un id de plugin non reconnu est rejeté d'office, jamais fait
  confiance silencieusement.

Dans les deux cas, les portées déclarées dans le manifeste (ou révélées lors de la confirmation
d'installation) d'un plugin sont montrées à l'utilisateur avant qu'il ne l'installe, de sorte que
« ce que ce plugin peut réellement toucher sur mon disque » soit visible dès le départ, pas
seulement appliqué silencieusement.

## Verrou de lancement de processus

`spawn-process`/`run-and-wait` sont verrouillés derrière l'octroi explicite d'une capacité
`"run-programs"` - un plugin déclarant ceci dans le champ `capabilities` de son manifeste déclenche
une véritable invite « ce plugin exécute d'autres programmes sur votre système » dans l'interface
de confirmation d'installation, que l'utilisateur doit accepter positivement. L'hôte impose ce
verrou indépendamment de ce que le manifeste déclare (un plugin ne peut pas simplement omettre le
champ pour éviter l'invite et quand même appeler la fonction) - le champ `capabilities` ne
contrôle que si l'interface demande l'autorisation du tout.

## Contrôle du réseau

`http-get`/`http-request`/`download-bytes` sont soumis à une liste d'autorisation/limitation de
débit par plugin, pas un accord général « peut atteindre tout internet ».

## Ce que cela ne résout *pas* : la confiance, pas seulement le sandboxing

Le contrôle des portées de chemins/processus/réseau limite *ce qu'*un plugin peut atteindre, mais
ne dit rien sur le fait que le code lui-même fasse quelque chose de malveillant dans cette portée
(un plugin de source a réellement besoin de `spawn-process` pour lancer des jeux - ce n'est pas
quelque chose qu'un sandbox peut distinguer de lancer autre chose). Deux couches supplémentaires
adressent ce point :

### Signature de code (indicative)

Les releases de plugins publiées peuvent porter une attestation
[Sigstore](https://www.sigstore.dev/) - une preuve vérifiable de quel build CI a produit un
binaire `.wasm` donné et depuis quel commit source. C'est **indicatif, pas une barrière rigide au
moment de l'installation** - Concourse ne refuse pas d'installer un plugin non signé, puisque cela
bloquerait tout aussi facilement un auteur de plugin qui n'a pas encore mis en place la signature.
La revue indicative apparaît dans l'interface de confirmation d'installation, et *est* appliquée
de façon stricte pour le registre organisé ci-dessous.

### Registre organisé (verrouillé strictement)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) est une liste
revue et épinglée par hash - chaque entrée épingle le manifeste/WASM d'un plugin à un SHA de
commit et un hash de contenu exacts. Installer via le registre (plutôt qu'une URL collée
librement) **rejette strictement en cas de désaccord de hash** - si ce qui est réellement servi ne
correspond plus à ce qui a été revu, l'installation échoue purement et simplement plutôt que
d'avertir et de continuer. Retirer une entrée du registre *est* le mécanisme de révocation
(uniquement au moment de l'installation - cela n'atteint pas rétroactivement les copies déjà
installées).

**En résumé** : les plugins installés via le registre obtiennent des garanties d'intégrité réelles
et appliquées. Les plugins installés par URL collée librement obtiennent le sandboxing et des
portées déclarées visibles, mais la décision de confiance réelle reste la vôtre - voir
[Publication](./publishing) si vous voulez que votre propre plugin atteigne le niveau plus fort et
revu.
