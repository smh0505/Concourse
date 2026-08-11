# Manifest dei Temi

I temi sono l'unico tipo di plugin con una forma di manifest significativamente diversa dagli
altri - oggi, un tema di terze parti è sempre del livello puramente basato su dati
(`runtime: "data"`): un manifest senza alcun codice compilato. Vedi
[Riferimento del Manifest](./manifest-reference) per i campi che ogni tipo di plugin condivide
(`id`/`name`/`version`/`kind`/`entry`/`runtime`); questa pagina copre i campi specifici dei temi.

## Campi

| Campo | Tipo | Note |
|---|---|---|
| `cssVariables` | `Record<string, string>` | Proprietà CSS personalizzate (ad es. `"--color-base": "#1e1e2e"`) applicate a `:root` mentre questo tema è attivo. Questo è l'intero contenuto di un tema puramente basato su dati. |
| `cardVisual` | AST JSON a vocabolario chiuso | Sovrascrive la regione visiva di copertina della card di un gioco (immagine-o-placeholder) senza bisogno di codice reale. |
| `fontFaces` | array di dichiarazioni font | File font reali da caricare tramite `@font-face`. |

`cssVariables` da solo è un tema completo e valido - `cardVisual`/`fontFaces` sono entrambi
opzionali, extra facoltativi.

## `cardVisual`: il vocabolario dei nodi

`cardVisual` viene validato contro un set chiuso di tipi di nodo (`validateCardVisualAst` in
`theme/cardVisualAst.ts`) - non c'è `eval`/`new Function`/valutazione di espressioni da nessuna
parte in questo formato, quindi non esiste alcun primitivo di esecuzione di codice da cui un
manifest malevolo possa evadere. Un AST che supera la profondità 5 o 50 nodi totali viene
rigettato del tutto, così come qualsiasi forma di nodo al di fuori di quelle elencate sotto.

| Tipo di nodo | Forma | Note |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Renderizza `then` se il campo referenziato è truthy, altrimenti `else` (o niente, se `else` viene omesso). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` è limitato a questi due elementi non interattivi - non esiste alcun percorso per renderizzare un `button`/`a`/qualsiasi cosa che possa ricevere focus o navigare, coerentemente con la regola che le azioni del footer restano renderizzate dall'host, mai controllate dal tema. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Un proprio tipo di nodo invece di `element` con un attribute bag generico - `src`/`alt` sono gli unici attributi bindabili che esistono in questo formato, quindi non c'è modo per un manifest di iniettare un attributo arbitrario (un handler `onerror`, uno `style` contenente `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Renderizza il valore risolto di `field` se presente, altrimenti la stringa letterale `content`. |

Un `FieldRef` (usato da `if.test`, `image.src`/`alt`, `text.field`) è
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` è una lista
chiusa di proprietà di `Game` (non "qualsiasi proprietà che questo oggetto game abbia"), e
`transform` è una tra un set fisso di funzioni implementate lato host risolte per corrispondenza
di nome, mai un'espressione arbitraria.

### Esempio: immagine con fallback a placeholder

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

## `fontFaces`: validazione dei campi

Ogni voce è `{ family: string, url: string, weight?: string, style?: string }`, caricata come
una vera regola `@font-face`. Dato che si tratta di contenuto di manifest non attendibile che
finisce direttamente in un blocco `<style>` reale, ogni campo viene verificato contro una lista
di consentiti rigorosa prima che venga costruito qualsiasi testo CSS (`theme/fontFaceRegistry.ts`)
- una voce che fallisce uno qualsiasi di questi controlli viene scartata (con log), non forzata,
e non blocca il resto del tema dal caricarsi:

| Campo | Obbligatorio | Vincolo |
|---|---|---|
| `family` | sì | Solo lettere, cifre, spazi, trattini, 1-100 caratteri - esclude specificamente i caratteri (`"`, `'`, `;`, `{`, `}`) di cui un tentativo di CSS-injection avrebbe bisogno. |
| `url` | sì | Deve essere interpretabile come un URL `https:`, e viene inoltre verificato che non contenga `"`, `'`, `;`, `{`, o `}`. |
| `weight` | no | Stesso pattern di caratteri sicuri di `family`, 1-30 caratteri. |
| `style` | no | Deve essere esattamente `"normal"`, `"italic"`, o `"oblique"`. |

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

Fai riferimento a un font caricato per nome in `--font-family` di `cssVariables` (vedi sotto) per
applicarlo effettivamente - dichiarare una voce `fontFaces` rende solo il font disponibile, non lo
usa da nessuna parte di per sé.

## `cssVariables`: token disponibili

Ogni token sotto è una vera proprietà CSS personalizzata per cui `styles.css` imposta un valore
predefinito, o legge tramite un fallback (`var(--your-token, <default>)`) senza dichiararne uno
affatto. Impostare qualsiasi cosa non presente in questa lista funziona comunque (è una normale
proprietà CSS personalizzata, niente lo impedisce), ma nulla nel foglio di stile dell'app stessa
la leggerà.

### Token base (hanno sempre un valore)

Questi sono impostati su `:root` con un valore predefinito reale - sovrascrivi qualsiasi
sottoinsieme; quelli non impostati mantengono il valore predefinito sotto. I valori predefiniti
sono lo schema colori di [Catppuccin Latte](https://github.com/catppuccin/catppuccin), che è
anche il tema predefinito distribuito con l'app - se stai costruendo un tema chiaro, questi valori
di colore sono una tavolozza di partenza ragionevole con cui confrontare la tua.

| Token | Predefinito | Note |
|---|---|---|
| `--color-base` | `#eff1f5` | Sfondo della pagina. |
| `--color-mantle` | `#e6e9ef` | Superficie leggermente incassata (ad es. sfondi dell'header sticky). |
| `--color-crust` | `#dce0e8` | Il più scuro/saturo del trio base/mantle/crust - `--color-tint` ha come predefinito questo valore. |
| `--color-text` | `#4c4f69` | Testo normale del corpo. |
| `--color-text-reverse` | `#ffffff` | Estremo di luminosità opposta a `--color-text`, per il posizionamento su un'immagine di sfondo dalla luminosità imprevedibile (ad es. lo sfondo del dettaglio gioco) dove il colore del testo normale non può garantire il contrasto. |
| `--color-subtext` | `#5c5f77` | Testo meno enfatizzato (suggerimenti, etichette secondarie). |
| `--color-surface0` | `#ccd0da` | Bordi, riempimenti sottili. |
| `--color-surface1` | `#bcc0cc` | Bordi/riempimenti leggermente più marcati di `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Accento primario (pulsanti submit, tab/nav attivi, anelli di focus). |
| `--color-accent-alt` | `#8839ef` | Accento secondario. |
| `--color-danger` | `#d20f39` | Azioni distruttive (rimuovi/elimina). |
| `--color-button-text` | `var(--color-text)` | Colore testo/icona per pulsanti neutri - separato da `--color-text` così un tema con sfondi di pulsante saturi può sovrascrivere solo questo. |
| `--color-on-accent` | `var(--color-base)` | Colore testo/icona per qualsiasi cosa renderizzata sopra `--color-accent` (pulsanti submit, tab attivi, toast). |
| `--color-tint` | `var(--color-crust)` | Tinta di sfondo per uno scrim dell'artwork di copertina (righe lista, righe stat) - deve essere più scuro/saturo di `--color-base` per un contrasto reale una volta mescolato con la trasparenza. Sovrascrivilo se il tuo `--color-crust` non si abbina bene con il tuo `--color-text` (vedi [Modello di Sicurezza](./security-model) per la matematica del contrasto dietro a questo). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Scala di spaziatura (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Raggio d'angolo piccolo. |
| `--radius-md` | `6px` | Raggio d'angolo predefinito (la maggior parte dei controlli). |
| `--radius-lg` | `8px` | Raggio d'angolo maggiore (righe, pannelli). |
| `--radius-xl` | `10px` | Raggio d'angolo massimo. |
| `--button-border-width` | `1px` | Larghezza bordo predefinita dei pulsanti. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | sfocature `rgba(0,0,0,...)` crescenti | Scala di elevazione. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | Il carattere tipografico dell'intera UI - ogni elemento o eredita questo direttamente o imposta `font-family: inherit`. Abbinalo a una voce `fontFaces` se la famiglia che vuoi non è un font di sistema. |

### Hook opzionali (non dichiarati per default)

Questi non hanno un valore predefinito su `:root` - l'app li usa solo tramite
`var(--token, <fallback>)`, quindi un hook non impostato ricade silenziosamente sul valore
mostrato, senza alcun effetto a meno che tu non lo imposti.

| Token | Fallback se non impostato | Interessa |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Colore bordo dei pulsanti neutri. |
| `--button-radius` | `var(--radius-md)` | Raggio d'angolo dei pulsanti neutri. |
| `--card-border-width` | `1px` | Larghezza bordo della card gioco / riga lista / riga stat. |
| `--card-radius` | `var(--radius-lg)` | Raggio d'angolo della card gioco / riga lista / riga stat. |
| `--cover-placeholder-background` | `var(--color-surface0)` | Sfondo placeholder senza artwork di copertina (accetta qualsiasi valore `background` valido, ad es. un pattern `repeating-linear-gradient(...)`, non solo un colore piatto). |
| `--tile-background` | `none` | Sfondo della tile in Big Picture. |
| `--tile-border-width` | `3px` | Larghezza bordo della tile in Big Picture. |
| `--tile-border-color` | `transparent` | Colore bordo della tile in Big Picture. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Raggio d'angolo della tile in Big Picture. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Ombra/anello dello stato focus della tile in Big Picture. |
| `--accent-active-background` | `var(--color-accent)` | Sfondo di nav/tab/filter-tag attivi - separato da `--color-accent` così il colore accento di un tema non forza l'indicatore di stato attivo ad abbinarsi ad esso. |
| `--accent-active-color` | `var(--color-on-accent)` | Colore testo/icona per lo stato nav/tab/filter-tag attivo. |

Esiste una manciata di ulteriori hook opzionali a livello di singolo componente invece che in
`styles.css` (ad es. `--balloon-background`/`--balloon-font-family` di `GameCard.vue`,
`--tile-title-font-family` di `BigPictureTile.vue`) - non catalogati in modo esaustivo qui, ma
seguono esattamente lo stesso pattern `var(--token, fallback)`, quindi cercare `var(--` nel
blocco `<style>` di un componente li troverà.

## Esempio: un manifest tema più completo

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
