# テーママニフェスト

テーマは、他のプラグイン種別と意味のある形でマニフェストの形状が異なる唯一の種類です -
今日、サードパーティのテーマは常にデータのみ(`runtime: "data"`)の階層です: コンパイル済みコードを
一切持たないマニフェストです。すべてのプラグイン種別が共有するフィールド(`id`/`name`/`version`/
`kind`/`entry`/`runtime`)については[マニフェストリファレンス](./manifest-reference)を参照してください。
このページではテーマに固有のフィールドを扱います。

## フィールド

| フィールド | 型 | 補足 |
|---|---|---|
| `cssVariables` | `Record<string, string>` | このテーマがアクティブな間`:root`に適用されるCSSカスタムプロパティ(例: `"--color-base": "#1e1e2e"`)。これがデータのみのテーマの全内容です。 |
| `cardVisual` | 閉じた語彙のJSON AST | 実際のコードを必要とせずに、ゲームカードのカバービジュアル領域(画像またはプレースホルダー)を上書きします。 |
| `fontFaces` | フォント宣言の配列 | `@font-face`経由で読み込む実際のフォントファイル。 |

`cssVariables`単体で完全な有効なテーマです - `cardVisual`/`fontFaces`はどちらもオプションの
opt-in拡張です。

## `cardVisual`: ノードの語彙

`cardVisual`は閉じたノードタイプのセット(`theme/cardVisualAst.ts`の`validateCardVisualAst`)に対して
検証されます - この形式には`eval`/`new Function`/式評価が一切存在しないため、悪意のあるマニフェストが
脱出できるコード実行の原始的手段が存在しません。深さ5または合計50ノードを超えるASTは、以下に列挙されて
いない形状のノードと同様に、無条件に拒否されます。

| ノードタイプ | 形状 | 補足 |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | 参照されたフィールドが真値であれば`then`を、そうでなければ`else`(`else`が省略されている場合は何もレンダリングしません)をレンダリングします。 |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag`はこの2つの非インタラクティブな要素に閉じられています - `button`/`a`/フォーカスやナビゲーションを取得できるものをレンダリングする経路は存在しません。これはフッターのアクションが常にホスト側でレンダリングされ、テーマ側で制御されないというルールに合致します。 |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | 汎用属性バッグを持つ`element`ではなく、独自のノードタイプです - `src`/`alt`はこの形式でバインド可能な唯一の属性で、マニフェストが任意の属性(`onerror`ハンドラや`url(...)`を含む`style`など)を注入する方法はありません。 |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | `field`が存在すればその解決済みの値を、そうでなければリテラルの`content`文字列をレンダリングします。 |

`FieldRef`(`if.test`、`image.src`/`alt`、`text.field`で使用)は
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }`です - `field`は
`Game`プロパティの閉じたアローリスト(「このgameオブジェクトが持つ任意のプロパティ」ではありません)で、
`transform`は名前でディスパッチされる固定セットのホスト実装関数の1つであり、決して任意の式ではありません。

### 例: プレースホルダーへのフォールバック付き画像

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

## `fontFaces`: フィールド検証

各エントリは`{ family: string, url: string, weight?: string, style?: string }`で、実際の
`@font-face`ルールとして読み込まれます。これは信頼できないマニフェストのコンテンツが実際の
`<style>`ブロックに直接入るため、CSSテキストが構築される前にすべてのフィールドが厳格なアローリストに
対してチェックされます(`theme/fontFaceRegistry.ts`) - これらのいずれかに失敗したエントリは
(ログに記録された上で)破棄され、強制的に修正されることはなく、テーマの残りの部分の読み込みをブロック
することもありません。

| フィールド | 必須 | 制約 |
|---|---|---|
| `family` | はい | 文字、数字、スペース、ハイフンのみ、1〜100文字 - 特にCSSインジェクション攻撃に必要な文字(`"`、`'`、`;`、`{`、`}`)を除外しています。 |
| `url` | はい | `https:` URLとしてパースできる必要があり、さらに`"`、`'`、`;`、`{`、`}`を含まないことがチェックされます。 |
| `weight` | いいえ | `family`と同じ安全な文字パターン、1〜30文字。 |
| `style` | いいえ | `"normal"`、`"italic"`、`"oblique"`のいずれかである必要があります。 |

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

読み込んだフォントを実際に適用するには、下記の`cssVariables`の`--font-family`で名前を参照してください -
`fontFaces`エントリを宣言するだけでは、フォントが利用可能になるだけで、それ自体はどこにも使用されません。

## `cssVariables`: 利用可能なトークン

以下のトークンはすべて、`styles.css`がデフォルト値を設定しているか、何も宣言せずにフォールバック
(`var(--your-token, <default>)`)経由で読み取っている実際のCSSカスタムプロパティです。このリストに
ないものを設定しても動作はします(ただのCSSカスタムプロパティなので、何も妨げるものはありません)が、
アプリ自身のスタイルシート内でそれを読み取るものは何もありません。

### ベーストークン(常に値を持つ)

これらは実際のデフォルト値とともに`:root`に設定されます - 任意のサブセットを上書きでき、
未設定のものは下記のデフォルトを保持します。デフォルトは
[Catppuccin Latte](https://github.com/catppuccin/catppuccin)のカラースキームで、これはアプリが
出荷時に持つデフォルトテーマでもあります - ライトテーマを構築する場合、これらの色の値は自分自身の
値を比較するための妥当な出発点となるパレットです。

| トークン | デフォルト | 補足 |
|---|---|---|
| `--color-base` | `#eff1f5` | ページ背景。 |
| `--color-mantle` | `#e6e9ef` | わずかに凹んだサーフェス(例: 固定ヘッダーの背景)。 |
| `--color-crust` | `#dce0e8` | base/mantle/crustの3つの中で最も暗く/最も彩度の高い色 - `--color-tint`はデフォルトでこれを使用します。 |
| `--color-text` | `#4c4f69` | 通常の本文テキスト。 |
| `--color-text-reverse` | `#ffffff` | `--color-text`の反対の明るさの終端。予測不能な明るさの背景画像(ゲーム詳細のバックドロップなど)の上に配置するためのもので、通常のテキスト色ではコントラストを保証できません。 |
| `--color-subtext` | `#5c5f77` | 強調しないテキスト(ヒント、二次的なラベル)。 |
| `--color-surface0` | `#ccd0da` | ボーダー、控えめな塗りつぶし。 |
| `--color-surface1` | `#bcc0cc` | `--color-surface0`よりわずかに強いボーダー/塗りつぶし。 |
| `--color-accent` | `#1e66f5` | プライマリアクセント(送信ボタン、アクティブなタブ/ナビ、フォーカスリング)。 |
| `--color-accent-alt` | `#8839ef` | セカンダリアクセント。 |
| `--color-danger` | `#d20f39` | 破壊的アクション(削除)。 |
| `--color-button-text` | `var(--color-text)` | ニュートラルボタンのテキスト/アイコン色 - 彩度の高いボタン背景を持つテーマがこれだけを上書きできるよう、`--color-text`とは別になっています。 |
| `--color-on-accent` | `var(--color-base)` | `--color-accent`の上にレンダリングされるもの(送信ボタン、アクティブなタブ、トースト)のテキスト/アイコン色。 |
| `--color-tint` | `var(--color-crust)` | カバーアートのスクリム(リスト行、統計行)の背景色 - 透明度と合成した際に本当のコントラストを得るには`--color-base`より暗く/彩度が高い必要があります。`--color-crust`が`--color-text`とうまく組み合わさらない場合は上書きしてください(このコントラスト計算の背景については[セキュリティモデル](./security-model)を参照)。 |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | 間隔スケール(`0.25rem`、`0.5rem`、`0.75rem`、`1rem`、`1.5rem`、`2rem`)。 |
| `--radius-sm` | `4px` | 小さい角丸。 |
| `--radius-md` | `6px` | デフォルトの角丸(ほとんどのコントロール)。 |
| `--radius-lg` | `8px` | より大きい角丸(行、パネル)。 |
| `--radius-xl` | `10px` | 最も大きい角丸。 |
| `--button-border-width` | `1px` | デフォルトのボタンボーダー幅。 |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | 段階的に強くなる`rgba(0,0,0,...)`のぼかし | 標高スケール。 |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | UI全体の書体 - すべての要素がこれを直接継承するか、`font-family: inherit`を設定します。望むファミリーがシステムフォントでない場合は`fontFaces`エントリと組み合わせてください。 |

### opt-inフック(デフォルトでは未宣言)

これらは`:root`にデフォルト値を持ちません - アプリは`var(--token, <fallback>)`経由でのみこれらを
使用するため、未設定のフックは何の影響もなく表示されているフォールバック値に静かに戻ります。

| トークン | 未設定時のフォールバック | 影響対象 |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | ニュートラルボタンのボーダー色。 |
| `--button-radius` | `var(--radius-md)` | ニュートラルボタンの角丸。 |
| `--card-border-width` | `1px` | ゲームカード/リスト行/統計行のボーダー幅。 |
| `--card-radius` | `var(--radius-lg)` | ゲームカード/リスト行/統計行の角丸。 |
| `--cover-placeholder-background` | `var(--color-surface0)` | カバーアートなしのプレースホルダー背景(単色だけでなく、`repeating-linear-gradient(...)`パターンなど有効な`background`値であれば何でも受け付けます)。 |
| `--tile-background` | `none` | Big Pictureタイルの背景。 |
| `--tile-border-width` | `3px` | Big Pictureタイルのボーダー幅。 |
| `--tile-border-color` | `transparent` | Big Pictureタイルのボーダー色。 |
| `--tile-radius` | `var(--radius-xl, 10px)` | Big Pictureタイルの角丸。 |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Big Pictureタイルのフォーカス状態のシャドウ/リング。 |
| `--accent-active-background` | `var(--color-accent)` | アクティブなナビ/タブ/フィルタータグの背景 - テーマのアクセント色がアクティブ状態のインジケーターに強制的に一致しないよう`--color-accent`とは別になっています。 |
| `--accent-active-color` | `var(--color-on-accent)` | アクティブなナビ/タブ/フィルタータグ状態のテキスト/アイコン色。 |

`styles.css`ではなく個々のコンポーネントレベルでさらにいくつかのopt-inフックが存在します
(例: `GameCard.vue`の`--balloon-background`/`--balloon-font-family`、`BigPictureTile.vue`の
`--tile-title-font-family`) - ここで網羅的にカタログ化されているわけではありませんが、まったく同じ
`var(--token, fallback)`パターンに従っているので、コンポーネントの`<style>`ブロックを`var(--`で
grepすれば見つかります。

## 例: より完全なテーママニフェスト

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
