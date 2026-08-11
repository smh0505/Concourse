# 主题 Manifest

主题是唯一一种 manifest 形状与其他类型有明显不同的插件类型 —— 目前,第三方主题始终属于纯数据
(`runtime: "data"`)这一档:一个完全不含编译代码的 manifest。所有插件类型共享的字段
(`id`/`name`/`version`/`kind`/`entry`/`runtime`)见[Manifest 参考](./manifest-reference);
本页介绍的是主题专属的字段。

## 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `cssVariables` | `Record<string, string>` | 该主题激活期间应用到 `:root` 的 CSS 自定义属性(例如 `"--color-base": "#1e1e2e"`)。这是纯数据主题的全部内容。 |
| `cardVisual` | 封闭词汇的 JSON AST | 无需编写真实代码即可覆盖游戏卡片的封面视觉区域(图片或占位符)。 |
| `fontFaces` | 字体声明数组 | 通过 `@font-face` 加载的真实字体文件。 |

单独一个 `cssVariables` 就是一个完整、有效的主题 —— `cardVisual`/`fontFaces` 都是可选的、
可自行选用的附加项。

## `cardVisual`:节点词汇表

`cardVisual` 会针对一组封闭的节点类型进行校验(`theme/cardVisualAst.ts` 中的
`validateCardVisualAst`) —— 这种格式中不存在任何 `eval`/`new Function`/表达式求值机制,因此
恶意 manifest 没有可利用的代码执行原语可供逃逸。深度超过 5 层或总节点数超过 50 个的 AST 会被
直接拒绝,任何不在下表中列出的节点形状也是如此。

| 节点类型 | 形状 | 说明 |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | 若引用的字段为真值,则渲染 `then`,否则渲染 `else`(若省略 `else` 则不渲染任何内容)。 |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag` 被限定为这两种非交互元素 —— 没有任何途径可以渲染 `button`/`a` 或任何可获得焦点或进行导航的元素,这与"页脚操作始终由宿主渲染、永不由主题控制"的规则相符。 |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | 它是一个独立的节点类型,而非带有通用属性包的 `element` —— `src`/`alt` 是这种格式中仅有的可绑定属性,因此 manifest 没有办法注入任意属性(例如 `onerror` 处理器,或包含 `url(...)` 的 `style`)。 |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | 若存在 `field`,则渲染其解析后的值,否则渲染字面量字符串 `content`。 |

`FieldRef`(由 `if.test`、`image.src`/`alt`、`text.field` 使用)的形状为
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }` —— `field` 是
`Game` 属性的一个封闭允许列表(而非"该 game 对象拥有的任意属性"),`transform` 则是一组固定的
宿主实现函数之一,按名称匹配调度,绝非任意表达式。

### 示例:带占位符回退的图片

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

## `fontFaces`:字段校验

每一项都是 `{ family: string, url: string, weight?: string, style?: string }`,会被加载为一条
真实的 `@font-face` 规则。由于这属于不受信任的 manifest 内容,会直接进入真实的 `<style>` 代码
块,因此在构造任何 CSS 文本之前,每个字段都会先经过严格的允许列表检查
(`theme/fontFaceRegistry.ts`) —— 任何一项未通过检查的条目都会被丢弃(并记录日志),而不是被
强制转换,也不会阻塞该主题其余部分的加载:

| 字段 | 是否必填 | 约束条件 |
|---|---|---|
| `family` | 是 | 仅允许字母、数字、空格、连字符,长度 1-100 个字符 —— 特别排除了 CSS 注入攻击所需的字符(`"`、`'`、`;`、`{`、`}`)。 |
| `url` | 是 | 必须能解析为 `https:` URL,并额外检查不包含 `"`、`'`、`;`、`{` 或 `}`。 |
| `weight` | 否 | 与 `family` 相同的安全字符模式,1-30 个字符。 |
| `style` | 否 | 必须恰好是 `"normal"`、`"italic"` 或 `"oblique"` 之一。 |

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

要在(见下方的)`cssVariables` 的 `--font-family` 中按名称引用一个已加载的字体才能真正应用
它 —— 声明一条 `fontFaces` 记录只是让该字体可用,本身并不会在任何地方使用它。

## `cssVariables`:可用的令牌(token)

下面每一个令牌都是 `styles.css` 要么设置了默认值、要么通过回退方式读取
(`var(--your-token, <default>)`)而未声明默认值的真实 CSS 自定义属性。设置任何不在此列表中的
内容仍然有效(它只是一个普通的 CSS 自定义属性,没有任何限制),但应用自身的样式表不会读取它。

### 基础令牌(始终有值)

这些在 `:root` 上设有真实默认值 —— 可覆盖任意子集;未设置的令牌保留下方默认值。这些默认值来自
[Catppuccin Latte](https://github.com/catppuccin/catppuccin) 配色方案,也是应用自带默认主题
所使用的方案 —— 如果你在构建一个浅色主题,这些颜色值是一个可以合理参考的起始调色板。

| 令牌 | 默认值 | 说明 |
|---|---|---|
| `--color-base` | `#eff1f5` | 页面背景。 |
| `--color-mantle` | `#e6e9ef` | 略微凹陷的表面(例如粘性页眉背景)。 |
| `--color-crust` | `#dce0e8` | base/mantle/crust 三者中颜色最深/最饱和的一个 —— `--color-tint` 默认取此值。 |
| `--color-text` | `#4c4f69` | 普通正文文字。 |
| `--color-text-reverse` | `#ffffff` | `--color-text` 亮度相反端点的颜色,用于放置在亮度不可预测的背景图之上(例如游戏详情页背景),此时普通文字颜色无法保证对比度。 |
| `--color-subtext` | `#5c5f77` | 弱化强调的文字(提示、次要标签)。 |
| `--color-surface0` | `#ccd0da` | 边框、细微填充。 |
| `--color-surface1` | `#bcc0cc` | 比 `--color-surface0` 略强的边框/填充。 |
| `--color-accent` | `#1e66f5` | 主强调色(提交按钮、活跃标签页/导航、焦点圈)。 |
| `--color-accent-alt` | `#8839ef` | 次强调色。 |
| `--color-danger` | `#d20f39` | 破坏性操作(移除/删除)。 |
| `--color-button-text` | `var(--color-text)` | 中性按钮的文字/图标颜色 —— 与 `--color-text` 分离,以便带饱和度按钮背景的主题可以只覆盖此项。 |
| `--color-on-accent` | `var(--color-base)` | 渲染在 `--color-accent` 之上的任何内容(提交按钮、活跃标签页、提示消息)的文字/图标颜色。 |
| `--color-tint` | `var(--color-crust)` | 封面美术遮罩(列表行、统计行)的背景色调 —— 为实现真正对比,需要比 `--color-base` 更深/更饱和,以便与透明度混合后仍有效果。如果你的 `--color-crust` 与 `--color-text` 搭配不佳,请覆盖此项(此处对比度背后的数学原理见[安全模型](./security-model))。 |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | 间距刻度(`0.25rem`、`0.5rem`、`0.75rem`、`1rem`、`1.5rem`、`2rem`)。 |
| `--radius-sm` | `4px` | 小圆角半径。 |
| `--radius-md` | `6px` | 默认圆角半径(大多数控件)。 |
| `--radius-lg` | `8px` | 较大圆角半径(行、面板)。 |
| `--radius-xl` | `10px` | 最大圆角半径。 |
| `--button-border-width` | `1px` | 默认按钮边框宽度。 |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | 逐渐加深的 `rgba(0,0,0,...)` 模糊 | 层级阴影刻度。 |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | 整个界面的字体 —— 每个元素要么直接继承此项,要么设置 `font-family: inherit`。若你想要的字体不是系统字体,请与一条 `fontFaces` 记录搭配使用。 |

### 可选钩子(默认未声明)

这些在 `:root` 中没有默认值 —— 应用只通过 `var(--token, <fallback>)` 使用它们,因此未设置的
钩子会静默回退到下表所示的值,除非你自行设置,否则不会产生任何效果。

| 令牌 | 未设置时的回退值 | 影响范围 |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | 中性按钮边框颜色。 |
| `--button-radius` | `var(--radius-md)` | 中性按钮圆角半径。 |
| `--card-border-width` | `1px` | 游戏卡片/列表行/统计行边框宽度。 |
| `--card-radius` | `var(--radius-lg)` | 游戏卡片/列表行/统计行圆角半径。 |
| `--cover-placeholder-background` | `var(--color-surface0)` | 无封面美术时的占位符背景(可接受任何有效的 `background` 值,例如 `repeating-linear-gradient(...)` 图案,而不只是纯色)。 |
| `--tile-background` | `none` | Big Picture 图块背景。 |
| `--tile-border-width` | `3px` | Big Picture 图块边框宽度。 |
| `--tile-border-color` | `transparent` | Big Picture 图块边框颜色。 |
| `--tile-radius` | `var(--radius-xl, 10px)` | Big Picture 图块圆角半径。 |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Big Picture 图块获得焦点状态时的阴影/光圈。 |
| `--accent-active-background` | `var(--color-accent)` | 活跃导航/标签页/筛选标签的背景色 —— 与 `--color-accent` 分离,以便主题的强调色不会强制活跃状态指示器与其一致。 |
| `--accent-active-color` | `var(--color-on-accent)` | 活跃导航/标签页/筛选标签状态的文字/图标颜色。 |

还有少量可选钩子存在于单个组件级别,而非 `styles.css` 中(例如 `GameCard.vue` 的
`--balloon-background`/`--balloon-font-family`,`BigPictureTile.vue` 的
`--tile-title-font-family`) —— 本页未一一列出,但它们都遵循完全相同的
`var(--token, fallback)` 模式,因此在某个组件的 `<style>` 代码块中搜索 `var(--` 即可找到它们。

## 示例:一个更完整的主题 manifest

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
