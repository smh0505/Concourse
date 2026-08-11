# Manifiestos de tema

Los temas son el único tipo de plugin con una forma de manifiesto significativamente distinta al
resto - hoy, un tema de terceros siempre es del nivel solo con datos (`runtime: "data"`): un
manifiesto sin ningún código compilado. Consulta la [Referencia del manifiesto](./manifest-reference)
para los campos que comparten todos los tipos de plugin (`id`/`name`/`version`/`kind`/`entry`/
`runtime`); esta página cubre los campos específicos de los temas.

## Campos

| Campo | Tipo | Notas |
|---|---|---|
| `cssVariables` | `Record<string, string>` | Propiedades personalizadas de CSS (p. ej. `"--color-base": "#1e1e2e"`) aplicadas a `:root` mientras este tema está activo. Esto es todo el contenido de un tema solo con datos. |
| `cardVisual` | AST JSON de vocabulario cerrado | Sobrescribe la región visual de portada de la ficha del juego (imagen o marcador de posición) sin necesitar código real. |
| `fontFaces` | array de declaraciones de fuente | Archivos de fuente reales para cargar mediante `@font-face`. |

`cssVariables` por sí solo ya es un tema completo y válido - `cardVisual`/`fontFaces` son ambos
extras opcionales, de adhesión voluntaria.

## `cardVisual`: el vocabulario de nodos

`cardVisual` se valida contra un conjunto cerrado de tipos de nodo (`validateCardVisualAst` en
`theme/cardVisualAst.ts`) - no hay `eval`/`new Function`/evaluación de expresiones en ningún
punto de este formato, así que no existe una primitiva de ejecución de código de la que un
manifiesto malicioso pueda escapar. Un AST que supere la profundidad 5 o los 50 nodos totales se
rechaza directamente, al igual que cualquier forma de nodo fuera de lo listado abajo.

| Tipo de nodo | Forma | Notas |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Renderiza `then` si el campo referenciado es verdadero, en caso contrario `else` (o nada, si se omite `else`). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` está limitado a estos dos elementos no interactivos - no existe ninguna vía para renderizar un `button`/`a`/cualquier cosa que pueda tomar el foco o navegar, en línea con la regla de que las acciones del pie siempre se renderizan desde el host, nunca controladas por el tema. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Su propio tipo de nodo en lugar de `element` con una bolsa genérica de atributos - `src`/`alt` son los únicos atributos vinculables que existen en este formato, así que no hay forma de que un manifiesto inyecte un atributo arbitrario (un manejador `onerror`, un `style` que contenga `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Renderiza el valor resuelto de `field` si está presente, en caso contrario la cadena literal `content`. |

Un `FieldRef` (usado por `if.test`, `image.src`/`alt`, `text.field`) es
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` es una lista
cerrada de propiedades de `Game` (no "cualquier propiedad que tenga este objeto de juego"), y
`transform` es una de un conjunto fijo de funciones implementadas por el host que se despachan
por coincidencia de nombre, nunca una expresión arbitraria.

### Ejemplo: imagen con un marcador de posición de respaldo

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

## `fontFaces`: validación de campos

Cada entrada es `{ family: string, url: string, weight?: string, style?: string }`, cargada como
una regla `@font-face` real. Dado que se trata de contenido de manifiesto no confiable que va
directo a un bloque `<style>` real, cada campo se comprueba contra una lista blanca estricta
antes de construir cualquier texto CSS (`theme/fontFaceRegistry.ts`) - una entrada que falle
cualquiera de estas comprobaciones se descarta (y se registra), no se fuerza a un valor válido, y
no bloquea la carga del resto del tema:

| Campo | Requerido | Restricción |
|---|---|---|
| `family` | sí | Solo letras, dígitos, espacios y guiones, 1-100 caracteres - excluye específicamente los caracteres (`"`, `'`, `;`, `{`, `}`) que necesitaría un intento de inyección de CSS. |
| `url` | sí | Debe interpretarse como una URL `https:`, y además se comprueba que no contenga `"`, `'`, `;`, `{`, ni `}`. |
| `weight` | no | Mismo patrón de caracteres seguros que `family`, 1-30 caracteres. |
| `style` | no | Debe ser exactamente `"normal"`, `"italic"`, u `"oblique"`. |

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

Referencia una fuente cargada por nombre en el `--font-family` de `cssVariables` (ver más abajo)
para aplicarla realmente - declarar una entrada de `fontFaces` solo hace que la fuente esté
disponible, no la usa en ningún sitio por sí sola.

## `cssVariables`: tokens disponibles

Cada token de abajo es una propiedad personalizada de CSS real para la que `styles.css` establece
un valor por defecto, o que lee mediante un valor de respaldo (`var(--your-token, <default>)`)
sin declarar ninguno en absoluto. Establecer algo que no esté en esta lista sigue funcionando (es
una propiedad personalizada de CSS normal, nada lo impide), pero nada en la propia hoja de
estilos de la app la leerá.

### Tokens base (siempre tienen un valor)

Estos se establecen en `:root` con un valor por defecto real - sobrescribe cualquier subconjunto;
los que no se fijen mantienen el valor por defecto de abajo. Los valores por defecto son el
esquema de color de [Catppuccin Latte](https://github.com/catppuccin/catppuccin), que también es
el tema por defecto distribuido con la app - si estás construyendo un tema claro, estos valores
de color son una paleta de partida razonable con la que comparar la tuya propia.

| Token | Por defecto | Notas |
|---|---|---|
| `--color-base` | `#eff1f5` | Fondo de página. |
| `--color-mantle` | `#e6e9ef` | Superficie ligeramente hundida (p. ej. fondos de cabecera fija). |
| `--color-crust` | `#dce0e8` | El más oscuro/saturado del trío base/mantle/crust - `--color-tint` toma este por defecto. |
| `--color-text` | `#4c4f69` | Texto normal del cuerpo. |
| `--color-text-reverse` | `#ffffff` | Extremo de brillo opuesto a `--color-text`, para colocar sobre una imagen de fondo de brillo impredecible (p. ej. el fondo de detalle del juego) donde el color de texto normal no puede garantizar contraste. |
| `--color-subtext` | `#5c5f77` | Texto poco enfatizado (pistas, etiquetas secundarias). |
| `--color-surface0` | `#ccd0da` | Bordes, rellenos sutiles. |
| `--color-surface1` | `#bcc0cc` | Bordes/rellenos ligeramente más fuertes que `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Acento primario (botones de envío, pestañas/nav activos, anillos de foco). |
| `--color-accent-alt` | `#8839ef` | Acento secundario. |
| `--color-danger` | `#d20f39` | Acciones destructivas (eliminar/borrar). |
| `--color-button-text` | `var(--color-text)` | Color de texto/icono para botones neutros - separado de `--color-text` para que un tema con fondos de botón saturados pueda sobrescribir solo esto. |
| `--color-on-accent` | `var(--color-base)` | Color de texto/icono para cualquier cosa renderizada sobre `--color-accent` (botones de envío, pestañas activas, notificaciones). |
| `--color-tint` | `var(--color-crust)` | Tinte de fondo para un scrim de arte de portada (filas de lista, filas de estadísticas) - necesita ser más oscuro/saturado que `--color-base` para tener contraste real una vez mezclado con transparencia. Sobrescríbelo si tu `--color-crust` no combina bien con tu `--color-text` (consulta el [Modelo de seguridad](./security-model) para las matemáticas de contraste detrás de esto). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Escala de espaciado (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Radio de esquina pequeño. |
| `--radius-md` | `6px` | Radio de esquina por defecto (la mayoría de controles). |
| `--radius-lg` | `8px` | Radio de esquina mayor (filas, paneles). |
| `--radius-xl` | `10px` | Radio de esquina más grande. |
| `--button-border-width` | `1px` | Grosor de borde de botón por defecto. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | difuminados `rgba(0,0,0,...)` crecientes | Escala de elevación. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | La tipografía de toda la interfaz - cada elemento la hereda directamente o establece `font-family: inherit`. Combínalo con una entrada de `fontFaces` si la familia que quieres no es una fuente del sistema. |

### Ganchos de adhesión voluntaria (no declarados por defecto)

Estos no tienen valor por defecto en `:root` - la app solo los usa mediante
`var(--token, <fallback>)`, así que un gancho no establecido cae silenciosamente al valor
mostrado, sin efecto a menos que lo establezcas.

| Token | Valor de respaldo si no se establece | Afecta a |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Color de borde de botón neutro. |
| `--button-radius` | `var(--radius-md)` | Radio de esquina de botón neutro. |
| `--card-border-width` | `1px` | Grosor de borde de ficha de juego / fila de lista / fila de estadísticas. |
| `--card-radius` | `var(--radius-lg)` | Radio de esquina de ficha de juego / fila de lista / fila de estadísticas. |
| `--cover-placeholder-background` | `var(--color-surface0)` | Fondo del marcador de posición sin arte de portada (acepta cualquier valor `background` válido, p. ej. un patrón `repeating-linear-gradient(...)`, no solo un color plano). |
| `--tile-background` | `none` | Fondo de la ficha de Big Picture. |
| `--tile-border-width` | `3px` | Grosor de borde de la ficha de Big Picture. |
| `--tile-border-color` | `transparent` | Color de borde de la ficha de Big Picture. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Radio de esquina de la ficha de Big Picture. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Sombra/anillo del estado enfocado de la ficha de Big Picture. |
| `--accent-active-background` | `var(--color-accent)` | Fondo de nav/pestaña/etiqueta de filtro activa - separado de `--color-accent` para que el color de acento de un tema no fuerce al indicador de estado activo a coincidir con él. |
| `--accent-active-color` | `var(--color-on-accent)` | Color de texto/icono para el estado activo de nav/pestaña/etiqueta de filtro. |

Existe un puñado de ganchos adicionales de adhesión voluntaria a nivel de componente individual
en lugar de en `styles.css` (p. ej. `--balloon-background`/`--balloon-font-family` de
`GameCard.vue`, `--tile-title-font-family` de `BigPictureTile.vue`) - no catalogados
exhaustivamente aquí, pero siguen exactamente el mismo patrón `var(--token, fallback)`, así que
buscar `var(--` en el bloque `<style>` de un componente los encontrará.

## Ejemplo: un manifiesto de tema más completo

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
