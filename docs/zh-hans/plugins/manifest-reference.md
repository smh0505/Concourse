# Manifest 参考

每一个插件 —— 无论是内置的 TypeScript 插件、WASM 插件,还是纯数据主题 —— 都由一个
`plugin.json` manifest 描述。本页记录了 Concourse 加载器所理解的每一个字段(源码见
`src/plugins/manifest.ts` 中的 `PluginManifest` 接口)。

## 核心字段(所有插件通用)

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | 唯一标识符。对 WASM 插件而言用作安装目录名 —— 需保证对文件系统安全。 |
| `name` | `string` | 是 | 在 Settings 中显示的名称。 |
| `version` | `string` | 是 | 纯粹的 SemVer,独立于应用自身的版本。详见下方[版本管理](#versioning)。 |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | 是 | 该插件提供哪种能力 —— 决定了其入口模块/组件必须导出的内容。 |
| `entry` | `string` | 是 | 编译好的 `.wasm` 文件的路径,相对于插件自身所在的文件夹。 |
| `runtime` | `"wasm" \| "data"` | 否 | WASM 插件设为 `"wasm"`,无代码的主题 manifest 设为 `"data"`(不需要加载任何 `entry` —— `cssVariables` 就是插件的全部内容)。第三方 manifest 应始终设置这两者之一。(加载器也识别 `"ts"`/未设置这第三个值,但它表示的是一个构建期打包进应用本身的 TypeScript 模块 —— 仅限内部使用,绝不应出现在你要分发的 manifest 中。) |
| `installable` | `boolean` | 否 | 若为 true,表示该插件实现了安装/卸载生命周期(`install()`/`uninstall()`/`isInstalled()`) —— 决定是否自动显示通用的 "Install"(安装)按钮界面。 |

主题 manifest 有自己专属的一套字段(`cssVariables`/`cardVisual`/`fontFaces`) —— 这些字段请参阅
[主题 Manifest](./theme-manifests)而非本页。

## WASM 插件字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `settingsSchema` | `{ key, label, type? }` 数组 | 声明用户可配置的设置(例如一个 API key) —— 宿主会据此渲染出一份通用设置表单,插件无需自建定制设置界面。`type: "password"` 会遮蔽输入内容。 |
| `capabilities` | `string[]` | 该插件实际调用的、受门控的宿主能力。目前只有 `"run-programs"`(门控 `spawn-process`/`run-and-wait`) —— 参见[安全模型](./security-model)。无论此处声明与否,宿主都会强制执行该门控;此字段只决定安装确认界面是否向用户请求明确授权。 |

`pathScopes`/`httpScopes`(声明的超出插件自身目录之外的读取权限,以及允许访问的网络主机)会在
安装确认对话框中展示以供用户查看,但它们是由宿主根据插件在 WIT 层面的实际请求计算得出的,并非
直接写在 `plugin.json` 中声明 —— 关于范围限定的实际工作原理,参见[安全模型](./security-model)。

## 宿主添加的字段(切勿自行设置)

| 字段 | 类型 | 说明 |
|---|---|---|
| `sourceUrl` | `string` | 安装该插件时所用的确切 URL —— 由宿主在安装时添加,以便日后的更新检查能重新获取并比较版本。 |
| `installedViaRegistry` | `boolean` | 若为 true,表示是通过精选注册表中带固定哈希的条目安装,而非通过自由粘贴的 URL —— 这会改变更新检查的方式(注册表固定的 `sourceUrl` 是按 commit SHA 固定且永久冻结的;检查更新意味着重新获取注册表中该 id 的*当前*条目,而不是再次重新获取 `sourceUrl`)。 |

## 示例:一个最简单的来源插件 manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

主题 manifest 的示例见[主题 Manifest](./theme-manifests)。

## 版本管理 {#versioning}

插件版本采用纯粹的 SemVer,与应用自身的版本独立追踪:

- **Patch(修订号)**:bug 修复,manifest/行为无变化。
- **Minor(次版本号)**:新增能力,向后兼容 —— 仍可在相同的宿主 WIT 接口(WASM 插件)或
  `PluginBase` 形状(TS 插件)下正常工作。
- **Major(主版本号)**:破坏性变更 —— manifest 形状发生变化,或(对 WASM 插件而言)插件现在
  需要一个较旧的 Concourse 构建版本所不具备的 `wit/plugin.wit` 接口版本。这是"不要在较旧的应用
  构建版本上安装此插件"的信号。

按照惯例,单独安装的 WASM 插件和纯数据主题 manifest 分别从 `0.1.0`/`1.0.0` 开始 —— 纯内容型
主题 manifest 足够稳定,可以从 `1.0.0` 开始,而带有真实安装/启动逻辑的 WASM 插件通常从 `0.1.0`
开始,直到在实际使用中得到验证。
