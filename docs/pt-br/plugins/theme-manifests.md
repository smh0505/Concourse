# Manifestos de Tema

Temas são o único tipo de plugin com uma forma de manifesto significativamente diferente dos
demais - hoje, um tema de terceiros é sempre da camada somente-dados (`runtime: "data"`): um
manifesto sem nenhum código compilado. Veja [Referência de Manifesto](./manifest-reference) para
os campos que todo tipo de plugin compartilha (`id`/`name`/`version`/`kind`/`entry`/`runtime`);
esta página cobre os campos específicos de temas.

## Campos

| Campo | Tipo | Notas |
|---|---|---|
| `cssVariables` | `Record<string, string>` | Propriedades customizadas de CSS (ex.: `"--color-base": "#1e1e2e"`) aplicadas a `:root` enquanto este tema está ativo. Este é o conteúdo inteiro de um tema somente-dados. |
| `cardVisual` | AST JSON de vocabulário fechado | Sobrescreve a região visual da capa do card do jogo (imagem-ou-placeholder) sem precisar de código real. |
| `fontFaces` | array de declarações de fonte | Arquivos de fonte reais para carregar via `@font-face`. |

`cssVariables` sozinho já é um tema completo e válido - `cardVisual`/`fontFaces` são ambos
extras opcionais, opt-in.

## `cardVisual`: o vocabulário de nós

`cardVisual` é validado contra um conjunto fechado de tipos de nó (`validateCardVisualAst` em
`theme/cardVisualAst.ts`) - não há `eval`/`new Function`/avaliação de expressão em nenhum lugar
deste formato, então não há primitiva de execução de código para um manifesto malicioso escapar.
Uma AST que exceda profundidade 5 ou 50 nós totais é rejeitada de imediato, assim como qualquer
formato de nó fora do listado abaixo.

| Tipo de nó | Formato | Notas |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | Renderiza `then` se o campo referenciado for verdadeiro, senão `else` (ou nada, se `else` for omitido). |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` é restrito a esses dois elementos não interativos - não existe caminho para renderizar um `button`/`a`/qualquer coisa que possa receber foco ou navegar, correspondendo à regra de que ações de rodapé permanecem renderizadas pelo host, nunca controladas pelo tema. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | Seu próprio tipo de nó em vez de `element` com um saco genérico de atributos - `src`/`alt` são os únicos atributos vinculáveis que existem neste formato, então não há como um manifesto injetar um atributo arbitrário (um handler `onerror`, um `style` contendo `url(...)`). |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | Renderiza o valor resolvido de `field` se presente, senão a string literal `content`. |

Um `FieldRef` (usado por `if.test`, `image.src`/`alt`, `text.field`) é
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` - `field` é uma lista de
permissões fechada de propriedades de `Game` (não "qualquer propriedade que este objeto de jogo
tenha"), e `transform` é uma de um conjunto fixo de funções implementadas pelo host, despachadas
por correspondência de nome, nunca uma expressão arbitrária.

### Exemplo: imagem com um fallback de placeholder

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

## `fontFaces`: validação de campos

Cada entrada é `{ family: string, url: string, weight?: string, style?: string }`, carregada como
uma regra `@font-face` real. Como se trata de conteúdo de manifesto não confiável indo direto para
um bloco `<style>` real, todo campo é verificado contra uma lista de permissões rígida antes de
qualquer texto CSS ser construído (`theme/fontFaceRegistry.ts`) - uma entrada que falhe em
qualquer uma dessas verificações é descartada (registrada em log), não coagida, e não impede o
resto do tema de carregar:

| Campo | Obrigatório | Restrição |
|---|---|---|
| `family` | sim | Apenas letras, dígitos, espaços, hífens, 1-100 caracteres - exclui especificamente os caracteres (`"`, `'`, `;`, `{`, `}`) que uma tentativa de injeção de CSS precisaria. |
| `url` | sim | Deve ser interpretável como uma URL `https:`, e adicionalmente verificado para não conter `"`, `'`, `;`, `{`, ou `}`. |
| `weight` | não | Mesmo padrão de caracteres seguros de `family`, 1-30 caracteres. |
| `style` | não | Deve ser exatamente `"normal"`, `"italic"`, ou `"oblique"`. |

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

Referencie uma fonte carregada pelo nome em `--font-family` de `cssVariables` (veja abaixo) para
de fato aplicá-la - declarar uma entrada em `fontFaces` apenas torna a fonte disponível, não a usa
em lugar nenhum por conta própria.

## `cssVariables`: tokens disponíveis

Todo token abaixo é uma propriedade customizada de CSS real para a qual `styles.css` define um
padrão, ou que lê via um fallback (`var(--your-token, <default>)`) sem declarar um de forma
alguma. Definir qualquer coisa que não esteja nesta lista ainda funciona (é uma propriedade
customizada de CSS comum, nada impede isso), mas nada na própria folha de estilos do aplicativo
vai lê-la.

### Tokens base (sempre têm um valor)

Estes são definidos em `:root` com um padrão real - sobrescreva qualquer subconjunto; os não
definidos mantêm o padrão abaixo. Os padrões são o esquema de cores
[Catppuccin Latte](https://github.com/catppuccin/catppuccin), que também é o tema padrão
distribuído do aplicativo - se você está construindo um tema claro, esses valores de cor são uma
paleta inicial razoável para comparar com a sua.

| Token | Padrão | Notas |
|---|---|---|
| `--color-base` | `#eff1f5` | Fundo da página. |
| `--color-mantle` | `#e6e9ef` | Superfície levemente recuada (ex.: fundos de cabeçalho fixo). |
| `--color-crust` | `#dce0e8` | O mais escuro/saturado do trio base/mantle/crust - `--color-tint` usa este como padrão. |
| `--color-text` | `#4c4f69` | Texto normal do corpo. |
| `--color-text-reverse` | `#ffffff` | Ponto extremo de brilho oposto a `--color-text`, para uso sobre uma imagem de fundo com brilho imprevisível (ex.: o fundo da página de detalhes do jogo) onde a cor de texto normal não pode garantir contraste. |
| `--color-subtext` | `#5c5f77` | Texto de ênfase reduzida (dicas, rótulos secundários). |
| `--color-surface0` | `#ccd0da` | Bordas, preenchimentos sutis. |
| `--color-surface1` | `#bcc0cc` | Bordas/preenchimentos ligeiramente mais fortes que `--color-surface0`. |
| `--color-accent` | `#1e66f5` | Destaque primário (botões de envio, abas/navegação ativas, anéis de foco). |
| `--color-accent-alt` | `#8839ef` | Destaque secundário. |
| `--color-danger` | `#d20f39` | Ações destrutivas (remover/excluir). |
| `--color-button-text` | `var(--color-text)` | Cor de texto/ícone para botões neutros - separado de `--color-text` para que um tema com fundos de botão saturados possa sobrescrever apenas isso. |
| `--color-on-accent` | `var(--color-base)` | Cor de texto/ícone para qualquer coisa renderizada sobre `--color-accent` (botões de envio, abas ativas, toasts). |
| `--color-tint` | `var(--color-crust)` | Tonalidade de fundo para um scrim de arte de capa (linhas de lista, linhas de estatística) - precisa ser mais escuro/saturado que `--color-base` para contraste real uma vez misturado com transparência. Sobrescreva se seu `--color-crust` não combinar bem com `--color-text` (veja [Modelo de Segurança](./security-model) para a matemática de contraste por trás disso). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | Escala de espaçamento (`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | Raio de canto pequeno. |
| `--radius-md` | `6px` | Raio de canto padrão (maioria dos controles). |
| `--radius-lg` | `8px` | Raio de canto maior (linhas, painéis). |
| `--radius-xl` | `10px` | Maior raio de canto. |
| `--button-border-width` | `1px` | Largura de borda padrão de botão. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | manchas crescentes de `rgba(0,0,0,...)` | Escala de elevação. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | A tipografia de toda a UI - todo elemento ou herda isso diretamente ou define `font-family: inherit`. Combine com uma entrada de `fontFaces` se a família que você quer não for uma fonte do sistema. |

### Hooks opt-in (não declarados por padrão)

Estes não têm padrão em `:root` - o aplicativo os usa apenas via `var(--token, <fallback>)`,
então um hook não definido volta silenciosamente para o valor mostrado, sem efeito a menos que
você o defina.

| Token | Fallback se não definido | Afeta |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | Cor de borda de botão neutro. |
| `--button-radius` | `var(--radius-md)` | Raio de canto de botão neutro. |
| `--card-border-width` | `1px` | Largura de borda de card de jogo / linha de lista / linha de estatística. |
| `--card-radius` | `var(--radius-lg)` | Raio de canto de card de jogo / linha de lista / linha de estatística. |
| `--cover-placeholder-background` | `var(--color-surface0)` | Fundo do placeholder de sem-arte-de-capa (aceita qualquer valor `background` válido, ex.: um padrão `repeating-linear-gradient(...)`, não apenas uma cor plana). |
| `--tile-background` | `none` | Fundo do tile do Big Picture. |
| `--tile-border-width` | `3px` | Largura de borda do tile do Big Picture. |
| `--tile-border-color` | `transparent` | Cor de borda do tile do Big Picture. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Raio de canto do tile do Big Picture. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Sombra/anel do estado de foco do tile do Big Picture. |
| `--accent-active-background` | `var(--color-accent)` | Fundo de navegação/aba/tag de filtro ativa - separado de `--color-accent` para que a cor de destaque de um tema não force o indicador de estado ativo a combinar com ela. |
| `--accent-active-color` | `var(--color-on-accent)` | Cor de texto/ícone para o estado ativo de navegação/aba/tag de filtro. |

Um punhado de hooks opt-in adicionais existe no nível de componente individual em vez de em
`styles.css` (ex.: `--balloon-background`/`--balloon-font-family` de `GameCard.vue`,
`--tile-title-font-family` de `BigPictureTile.vue`) - não catalogados exaustivamente aqui, mas
seguem exatamente o mesmo padrão `var(--token, fallback)`, então pesquisar por `var(--` no bloco
`<style>` de um componente vai encontrá-los.

## Exemplo: um manifesto de tema mais completo

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
