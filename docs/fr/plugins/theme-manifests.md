# Manifestes de thème

Les thèmes sont le seul type de plugin dont la forme de manifeste diffère significativement des
autres - aujourd'hui, un thème tiers est toujours du niveau purement déclaratif (`runtime:
"data"`) : un manifeste sans aucun code compilé. Voir la
[Référence du manifeste](./manifest-reference) pour les champs partagés par tous les types de
plugins (`id`/`name`/`version`/`kind`/`entry`/`runtime`) ; cette page couvre les champs
spécifiques aux thèmes.

## Champs

| Champ | Type | Notes |
|---|---|---|
| `cssVariables` | `Record<string, string>` | Propriétés CSS personnalisées (par ex. `"--color-base": "#1e1e2e"`) appliquées à `:root` pendant que ce thème est actif. C'est tout le contenu d'un thème purement déclaratif. |
| `cardVisual` | AST JSON à vocabulaire fermé | Remplace la région visuelle de couverture de la carte de jeu (image ou placeholder) sans avoir besoin de vrai code. |
| `fontFaces` | tableau de déclarations de police | Vrais fichiers de police à charger via `@font-face`. |

`cssVariables` seul constitue un thème complet et valide - `cardVisual`/`fontFaces` sont tous les
deux optionnels, des extras auxquels on adhère volontairement.

## `cardVisual` : le vocabulaire des nœuds

`cardVisual` est validé contre un ensemble fermé de types de nœuds (`validateCardVisualAst` dans
`theme/cardVisualAst.ts`) - il n'y a aucun `eval`/`new Function`/évaluation d'expression nulle
part dans ce format, donc aucune primitive d'exécution de code dont un manifeste malveillant
pourrait s'échapper. Un AST dépassant une profondeur de 5 ou 50 nœuds au total est rejeté
d'office, tout comme toute forme de nœud en dehors de ce qui est listé ci-dessous.

| Type de nœud | Forme | Notes |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Affiche `then` si le champ référencé est vrai (truthy), sinon `else` (ou rien, si `else` est omis). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` est limité à ces deux éléments non interactifs - aucun chemin n'existe pour afficher un `button`/`a`/quoi que ce soit pouvant prendre le focus ou naviguer, cohérent avec la règle selon laquelle les actions du pied de carte restent rendues par l'hôte, jamais contrôlées par le thème. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Son propre type de nœud plutôt qu'un `element` avec un sac d'attributs génériques - `src`/`alt` sont les seuls attributs liables qui existent dans ce format, donc il n'y a aucun moyen pour un manifeste d'injecter un attribut arbitraire (un gestionnaire `onerror`, un `style` contenant `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Affiche la valeur résolue de `field` si présente, sinon la chaîne littérale `content`. |

Une `FieldRef` (utilisée par `if.test`, `image.src`/`alt`, `text.field`) est
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` est une liste
fermée de propriétés `Game` (pas « n'importe quelle propriété que cet objet game possède »), et
`transform` est l'une d'un ensemble fixe de fonctions implémentées côté hôte, dispatchées par
correspondance de nom, jamais une expression arbitraire.

### Exemple : image avec un placeholder de repli

```json
{
  "cardVisual": {
    "type": "if",
    "test": { "field": "cover_art_url" },
    "then": {
      "type": "image",
      "class": "cover",
      "src": { "field": "cover_art_url" },
      "alt": { "field": "title" }
    },
    "else": {
      "type": "element",
      "tag": "div",
      "class": "cover-placeholder",
      "children": [{ "type": "text", "field": { "field": "title", "transform": "firstLetterUpper" } }]
    }
  }
}
```

## `fontFaces` : validation des champs

Chaque entrée est `{ family: string, url: string, weight?: string, style?: string }`, chargée
comme une vraie règle `@font-face`. Comme il s'agit de contenu de manifeste non fiable allant
directement dans un vrai bloc `<style>`, chaque champ est vérifié par rapport à une liste
d'autorisation stricte avant qu'un texte CSS ne soit construit (`theme/fontFaceRegistry.ts`) -
une entrée échouant l'un de ces contrôles est abandonnée (journalisée), pas convertie de force, et
ne bloque pas le reste du thème lors du chargement :

| Champ | Requis | Contrainte |
|---|---|---|
| `family` | oui | Lettres, chiffres, espaces, tirets uniquement, 1 à 100 caractères - exclut spécifiquement les caractères (`"`, `'`, `;`, `{`, `}`) dont aurait besoin une tentative d'injection CSS. |
| `url` | oui | Doit s'analyser comme une URL `https:`, et vérifiée en plus pour ne pas contenir `"`, `'`, `;`, `{`, ou `}`. |
| `weight` | non | Même motif de caractères sûrs que `family`, 1 à 30 caractères. |
| `style` | non | Doit être exactement `"normal"`, `"italic"`, ou `"oblique"`. |

```json
{
  "fontFaces": [
    {
      "family": "My Custom Font",
      "url": "https://raw.githubusercontent.com/you/your-theme-repo/<commit-sha>/my-font.woff2",
      "weight": "400"
    }
  ]
}
```

Référencez une police chargée par son nom dans `--font-family` de `cssVariables` (voir
ci-dessous) pour réellement l'appliquer - déclarer une entrée `fontFaces` ne fait que rendre la
police disponible, elle ne l'utilise nulle part par elle-même.

## `cssVariables` : jetons disponibles

Chaque jeton ci-dessous est une véritable propriété CSS personnalisée pour laquelle `styles.css`
définit soit une valeur par défaut, soit la lit via un repli (`var(--your-token, <default>)`)
sans en déclarer une du tout. Définir quelque chose qui n'est pas dans cette liste fonctionne
quand même (c'est une simple propriété CSS personnalisée, rien ne l'empêche), mais rien dans la
feuille de style propre de l'application ne la lira.

### Jetons de base (ont toujours une valeur)

Ceux-ci sont définis sur `:root` avec une vraie valeur par défaut - remplacez n'importe quel
sous-ensemble ; ceux non définis gardent la valeur par défaut ci-dessous. Les valeurs par défaut
sont celles de la palette de couleurs [Catppuccin Latte](https://github.com/catppuccin/catppuccin),
qui est aussi le thème par défaut fourni avec l'application - si vous construisez un thème clair,
ces valeurs de couleur constituent un point de départ raisonnable pour comparer les vôtres.

| Jeton | Défaut | Notes |
|---|---|---|
| `--color-base` | `#eff1f5` | Arrière-plan de la page. |
| `--color-mantle` | `#e6e9ef` | Surface légèrement en retrait (par ex. arrière-plans d'en-tête collant). |
| `--color-crust` | `#dce0e8` | Le plus sombre/saturé du trio base/mantle/crust - `--color-tint` prend cette valeur par défaut. |
| `--color-text` | `#4c4f69` | Texte de corps normal. |
| `--color-text-reverse` | `#ffffff` | Point de luminosité opposé de `--color-text`, pour un placement sur une image d'arrière-plan de luminosité imprévisible (par ex. le fond de la page de détail d'un jeu) où la couleur de texte normale ne peut pas garantir de contraste. |
| `--color-subtext` | `#5c5f77` | Texte moins mis en avant (indices, libellés secondaires). |
| `--color-surface0` | `#ccd0da` | Bordures, remplissages subtils. |
| `--color-surface1` | `#bcc0cc` | Bordures/remplissages légèrement plus marqués que `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Accent principal (boutons de validation, onglets/nav actifs, anneaux de focus). |
| `--color-accent-alt` | `#8839ef` | Accent secondaire. |
| `--color-danger` | `#d20f39` | Actions destructives (suppression). |
| `--color-button-text` | `var(--color-text)` | Couleur de texte/icône pour les boutons neutres - séparée de `--color-text` afin qu'un thème avec des arrière-plans de bouton saturés puisse ne remplacer que celle-ci. |
| `--color-on-accent` | `var(--color-base)` | Couleur de texte/icône pour tout ce qui est affiché par-dessus `--color-accent` (boutons de validation, onglets actifs, toasts). |
| `--color-tint` | `var(--color-crust)` | Teinte d'arrière-plan pour un scrim de jaquette (lignes de liste, lignes de stats) - doit être plus sombre/saturée que `--color-base` pour un vrai contraste une fois mélangée avec de la transparence. À remplacer si votre `--color-crust` ne s'accorde pas bien avec votre `--color-text` (voir [Modèle de sécurité](./security-model) pour le calcul de contraste sous-jacent). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Échelle d'espacement (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Petit rayon de coin. |
| `--radius-md` | `6px` | Rayon de coin par défaut (la plupart des contrôles). |
| `--radius-lg` | `8px` | Rayon de coin plus grand (lignes, panneaux). |
| `--radius-xl` | `10px` | Plus grand rayon de coin. |
| `--button-border-width` | `1px` | Largeur de bordure de bouton par défaut. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | flous `rgba(0,0,0,...)` croissants | Échelle d'élévation. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | La police de toute l'interface - chaque élément hérite directement de celle-ci ou définit `font-family: inherit`. À associer à une entrée `fontFaces` si la famille souhaitée n'est pas une police système. |

### Points d'ancrage optionnels (non déclarés par défaut)

Ceux-ci n'ont aucune valeur par défaut sur `:root` - l'application ne les utilise que via
`var(--token, <fallback>)`, donc un point d'ancrage non défini se replie silencieusement sur la
valeur affichée, sans effet à moins que vous ne le définissiez.

| Jeton | Repli si non défini | Affecte |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Couleur de bordure des boutons neutres. |
| `--button-radius` | `var(--radius-md)` | Rayon de coin des boutons neutres. |
| `--card-border-width` | `1px` | Largeur de bordure de la carte de jeu / ligne de liste / ligne de stats. |
| `--card-radius` | `var(--radius-lg)` | Rayon de coin de la carte de jeu / ligne de liste / ligne de stats. |
| `--cover-placeholder-background` | `var(--color-surface0)` | Arrière-plan du placeholder « pas de jaquette » (accepte toute valeur `background` valide, par ex. un motif `repeating-linear-gradient(...)`, pas seulement une couleur unie). |
| `--tile-background` | `none` | Arrière-plan de tuile en Big Picture. |
| `--tile-border-width` | `3px` | Largeur de bordure de tuile en Big Picture. |
| `--tile-border-color` | `transparent` | Couleur de bordure de tuile en Big Picture. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Rayon de coin de tuile en Big Picture. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Ombre/anneau de l'état focalisé d'une tuile en Big Picture. |
| `--accent-active-background` | `var(--color-accent)` | Arrière-plan de nav/onglet/tag de filtre actif - séparé de `--color-accent` afin que la couleur d'accent d'un thème ne force pas l'indicateur d'état actif à y correspondre. |
| `--accent-active-color` | `var(--color-on-accent)` | Couleur de texte/icône pour l'état nav/onglet/tag de filtre actif. |

Une poignée de points d'ancrage optionnels supplémentaires existent au niveau du composant
individuel plutôt que dans `styles.css` (par ex. `--balloon-background`/`--balloon-font-family`
de `GameCard.vue`, `--tile-title-font-family` de `BigPictureTile.vue`) - non catalogués de manière
exhaustive ici, mais ils suivent exactement le même motif `var(--token, fallback)`, donc chercher
`var(--` dans le bloc `<style>` d'un composant les trouvera.

## Exemple : un manifeste de thème plus complet

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "kind": "theme",
  "cssVariables": {
    "--color-base": "#1e1e2e",
    "--color-mantle": "#181825",
    "--color-crust": "#11111b",
    "--color-text": "#cdd6f4",
    "--color-text-reverse": "#000000",
    "--color-accent": "#89b4fa"
  }
}
```
