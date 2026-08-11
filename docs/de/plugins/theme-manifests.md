# Theme-Manifeste

Themes sind die eine Plugin-Art mit einer deutlich anderen Manifestform als die übrigen - heute
ist ein Drittanbieter-Theme immer der reine Daten-Tier (`runtime: "data"`): ein Manifest ganz
ohne kompilierten Code. Siehe [Manifest-Referenz](./manifest-reference) für die Felder, die jede
Plugin-Art teilt (`id`/`name`/`version`/`kind`/`entry`/`runtime`); diese Seite behandelt die
themespezifischen Felder.

## Felder

| Feld | Typ | Hinweise |
|---|---|---|
| `cssVariables` | `Record<string, string>` | CSS-Custom-Properties (z. B. `"--color-base": "#1e1e2e"`), angewendet auf `:root`, während dieses Theme aktiv ist. Das ist der gesamte Inhalt eines reinen Daten-Themes. |
| `cardVisual` | JSON-AST mit geschlossenem Vokabular | Überschreibt den Cover-Visual-Bereich der Spielkarte (Bild-oder-Platzhalter) ohne echten Code. |
| `fontFaces` | Array von Schriftart-Deklarationen | Echte Schriftdateien, die über `@font-face` geladen werden. |

`cssVariables` allein ist ein vollständiges, gültiges Theme - `cardVisual`/`fontFaces` sind
beide optionale Zusatzfeatures.

## `cardVisual`: das Node-Vokabular

`cardVisual` wird gegen eine geschlossene Menge von Node-Typen validiert (`validateCardVisualAst`
in `theme/cardVisualAst.ts`) - es gibt in diesem Format kein `eval`/`new Function`/keine
Ausdrucksauswertung irgendwo, sodass es keine Code-Ausführungs-Primitive gibt, aus der ein
bösartiges Manifest ausbrechen könnte. Ein AST, der Tiefe 5 oder 50 Gesamt-Nodes überschreitet,
wird rundweg abgelehnt, ebenso jede Node-Form außerhalb der unten aufgeführten.

| Node-Typ | Form | Hinweise |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Rendert `then`, wenn das referenzierte Feld wahr ist, andernfalls `else` (oder nichts, wenn `else` weggelassen wird). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` ist auf diese zwei nicht-interaktiven Elemente beschränkt - es gibt keinen Weg, ein `button`/`a`/irgendetwas zu rendern, das Fokus erhalten oder navigieren könnte, passend zur Regel, dass Footer-Aktionen immer host-gerendert bleiben, nie theme-gesteuert. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Ein eigener Node-Typ statt `element` mit einer generischen Attribut-Tasche - `src`/`alt` sind die einzigen bindbaren Attribute, die in diesem Format existieren, sodass es für ein Manifest keine Möglichkeit gibt, ein beliebiges Attribut einzuschleusen (einen `onerror`-Handler, ein `style` mit `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Rendert den aufgelösten Wert von `field`, falls vorhanden, andernfalls den literalen String `content`. |

Eine `FieldRef` (verwendet von `if.test`, `image.src`/`alt`, `text.field`) ist
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` ist eine
geschlossene Zulassungsliste von `Game`-Eigenschaften (nicht "jede beliebige Eigenschaft, die
dieses Game-Objekt hat"), und `transform` ist eine von einer festen Menge host-implementierter
Funktionen, per Namensabgleich zugeordnet, niemals ein beliebiger Ausdruck.

### Beispiel: Bild mit Platzhalter-Fallback

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

## `fontFaces`: Feldvalidierung

Jeder Eintrag ist `{ family: string, url: string, weight?: string, style?: string }`, geladen als
echte `@font-face`-Regel. Da es sich hierbei um nicht vertrauenswürdigen Manifest-Inhalt handelt,
der direkt in einen echten `<style>`-Block fließt, wird jedes Feld gegen eine strikte
Zulassungsliste geprüft, bevor überhaupt CSS-Text erzeugt wird (`theme/fontFaceRegistry.ts`) -
ein Eintrag, der eine dieser Prüfungen nicht besteht, wird verworfen (protokolliert), nicht
erzwungen umgewandelt, und blockiert nicht das Laden des restlichen Themes:

| Feld | Erforderlich | Einschränkung |
|---|---|---|
| `family` | ja | Nur Buchstaben, Ziffern, Leerzeichen, Bindestriche, 1-100 Zeichen - schließt speziell die Zeichen (`"`, `'`, `;`, `{`, `}`) aus, die ein CSS-Injection-Versuch bräuchte. |
| `url` | ja | Muss als `https:`-URL parsen und zusätzlich geprüft, keine `"`, `'`, `;`, `{` oder `}` zu enthalten. |
| `weight` | nein | Dasselbe sichere Zeichenmuster wie `family`, 1-30 Zeichen. |
| `style` | nein | Muss exakt `"normal"`, `"italic"` oder `"oblique"` sein. |

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

Referenziere eine geladene Schrift über ihren Namen in `cssVariables`' `--font-family` (siehe
unten), um sie tatsächlich anzuwenden - das Deklarieren eines `fontFaces`-Eintrags macht die
Schrift nur verfügbar, verwendet sie aber selbst nirgends.

## `cssVariables`: verfügbare Tokens

Jedes Token unten ist eine echte CSS-Custom-Property, für die `styles.css` entweder einen
Standardwert setzt, oder die per Fallback gelesen wird (`var(--your-token, <default>)`), ohne
überhaupt einen zu deklarieren. Das Setzen von etwas, das nicht auf dieser Liste steht,
funktioniert trotzdem (es ist eine ganz normale CSS-Custom-Property, nichts hindert dich daran),
aber nichts im eigenen Stylesheet der App liest es aus.

### Basis-Tokens (haben immer einen Wert)

Diese werden auf `:root` mit einem echten Standardwert gesetzt - überschreibe eine beliebige
Teilmenge; nicht gesetzte behalten den Standardwert unten. Die Standardwerte sind das Farbschema
von [Catppuccin Latte](https://github.com/catppuccin/catppuccin), das auch das mitgelieferte
Standard-Theme der App ist - wenn du ein helles Theme baust, sind diese Farbwerte eine sinnvolle
Ausgangspalette zum Vergleich.

| Token | Standard | Hinweise |
|---|---|---|
| `--color-base` | `#eff1f5` | Seitenhintergrund. |
| `--color-mantle` | `#e6e9ef` | Leicht zurückgesetzte Fläche (z. B. Hintergründe klebender Kopfzeilen). |
| `--color-crust` | `#dce0e8` | Dunkelstes/gesättigtstes des Trios base/mantle/crust - `--color-tint` verwendet dies standardmäßig. |
| `--color-text` | `#4c4f69` | Normaler Fließtext. |
| `--color-text-reverse` | `#ffffff` | Gegenteiliger Helligkeitsendpunkt zu `--color-text`, zur Platzierung über einem unvorhersehbar hellen Hintergrundbild (z. B. dem Backdrop der Spieldetailseite), wo die normale Textfarbe keinen Kontrast garantieren kann. |
| `--color-subtext` | `#5c5f77` | Weniger betonter Text (Hinweise, sekundäre Labels). |
| `--color-surface0` | `#ccd0da` | Rahmen, dezente Füllungen. |
| `--color-surface1` | `#bcc0cc` | Etwas stärkere Rahmen/Füllungen als `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Primärakzent (Submit-Buttons, aktive Tabs/Navigation, Fokusringe). |
| `--color-accent-alt` | `#8839ef` | Sekundärakzent. |
| `--color-danger` | `#d20f39` | Destruktive Aktionen (entfernen/löschen). |
| `--color-button-text` | `var(--color-text)` | Text-/Icon-Farbe für neutrale Buttons - getrennt von `--color-text`, damit ein Theme mit gesättigten Button-Hintergründen nur dieses überschreiben kann. |
| `--color-on-accent` | `var(--color-base)` | Text-/Icon-Farbe für alles, was über `--color-accent` gerendert wird (Submit-Buttons, aktive Tabs, Toasts). |
| `--color-tint` | `var(--color-crust)` | Hintergrundtönung für ein Cover-Art-Scrim (Listenzeilen, Statistikzeilen) - muss dunkler/gesättigter als `--color-base` sein für echten Kontrast bei Vermischung mit Transparenz. Überschreiben, wenn dein `--color-crust` nicht gut mit deinem `--color-text` harmoniert (siehe [Sicherheitsmodell](./security-model) für die dahinterstehende Kontrastmathematik). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Abstandsskala (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Kleiner Eckenradius. |
| `--radius-md` | `6px` | Standard-Eckenradius (die meisten Steuerelemente). |
| `--radius-lg` | `8px` | Größerer Eckenradius (Zeilen, Panels). |
| `--radius-xl` | `10px` | Größter Eckenradius. |
| `--button-border-width` | `1px` | Standard-Button-Rahmenbreite. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | zunehmende `rgba(0,0,0,...)`-Unschärfen | Elevation-Skala. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | Die Schriftart der gesamten UI - jedes Element erbt dies entweder direkt oder setzt `font-family: inherit`. Mit einem `fontFaces`-Eintrag kombinieren, wenn die gewünschte Schriftfamilie keine Systemschrift ist. |

### Optionale Hooks (standardmäßig nicht deklariert)

Diese haben keinen Standardwert in `:root` - die App verwendet sie nur über
`var(--token, <fallback>)`, sodass ein nicht gesetzter Hook stillschweigend auf den unten
gezeigten Wert zurückfällt, ohne Effekt, solange du ihn nicht setzt.

| Token | Fallback, falls nicht gesetzt | Betrifft |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Rahmenfarbe neutraler Buttons. |
| `--button-radius` | `var(--radius-md)` | Eckenradius neutraler Buttons. |
| `--card-border-width` | `1px` | Rahmenbreite von Spielkarte/Listenzeile/Statistikzeile. |
| `--card-radius` | `var(--radius-lg)` | Eckenradius von Spielkarte/Listenzeile/Statistikzeile. |
| `--cover-placeholder-background` | `var(--color-surface0)` | Hintergrund des Platzhalters ohne Cover-Art (akzeptiert jeden gültigen `background`-Wert, z. B. ein `repeating-linear-gradient(...)`-Muster, nicht nur eine einfarbige Fläche). |
| `--tile-background` | `none` | Hintergrund der Big-Picture-Kachel. |
| `--tile-border-width` | `3px` | Rahmenbreite der Big-Picture-Kachel. |
| `--tile-border-color` | `transparent` | Rahmenfarbe der Big-Picture-Kachel. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Eckenradius der Big-Picture-Kachel. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Schatten/Ring des Fokuszustands der Big-Picture-Kachel. |
| `--accent-active-background` | `var(--color-accent)` | Hintergrund für aktive Navigation/Tabs/Filter-Tags - getrennt von `--color-accent`, damit die Akzentfarbe eines Themes nicht erzwingt, dass der Aktiv-Zustand-Indikator ihr entspricht. |
| `--accent-active-color` | `var(--color-on-accent)` | Text-/Icon-Farbe für den Aktiv-Zustand von Navigation/Tabs/Filter-Tags. |

Eine Handvoll weiterer optionaler Hooks existiert auf Einzelkomponenten-Ebene statt in
`styles.css` (z. B. `GameCard.vue`'s `--balloon-background`/`--balloon-font-family`,
`BigPictureTile.vue`'s `--tile-title-font-family`) - hier nicht erschöpfend katalogisiert, folgen
aber demselben `var(--token, fallback)`-Muster, sodass das Durchsuchen des `<style>`-Blocks einer
Komponente nach `var(--` sie findet.

## Beispiel: ein umfangreicheres Theme-Manifest

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
