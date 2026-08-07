# Concourse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) |
[Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*本翻译为机器翻译(与应用自身 UI 语言的处理方式相同 - 参见下方 [Localization](#功能)),
尚未经过母语者审校。*

一款将来自多个来源(Steam、Epic、GOG、手动添加,以及通过插件支持的更多来源)的游戏聚合到
统一游戏库的桌面应用,配有主机风格、以手柄为先的 "Big Picture" 模式 - 精神上与 Playnite 或
Steam 自带的游戏库相似。

核心应用保持精简;基础游戏库之外的几乎所有功能(来源扫描器、主题、元数据提供方、手柄映射、
兼容性包装器)都是插件。

## 功能

- **游戏库核心** - 手动"添加游戏"、基于 SQLite 的存储、网格/列表视图、标签、搜索/筛选
- **元数据与媒体** - 通过 SteamGridDB 获取封面美术图,通过 IGDB 获取简介/类型/发行日期,
  支持手动覆盖
- **启动与游玩时长追踪** - 无论来源如何都统一启动(直接可执行文件、Steam `steam://`
  链接、Epic/GOG 协议处理程序、通过兼容性包装器启动的游戏),根据游戏启动方式采用进程退出
  追踪或基于文件夹的游玩时长追踪
- **Big Picture 模式** - 全屏、支持手柄导航的界面,带瓦片网格和 Coverflow 幻灯片视图、
  背景美术图交叉淡入淡出、开机自动启动开关
- **兼容性包装器** - 为需要非默认语言环境才能运行的游戏提供按游戏配置的 Locale
  Remulator / Locale Emulator 配置文件
- **插件系统** - 五种插件类型(来源、主题、元数据提供方、手柄映射、兼容性包装器),既可在
  构建时加载(`src/plugins/` 下打包的 TypeScript 插件),也可在运行时加载(可下载的
  WebAssembly 插件 - 见下文)
- **本地化** - UI 支持 10 种语言(英语加 9 种机器翻译语言),主题可设置的 `--font-family`
  用于整个应用换肤,以及无需代码的纯数据主题层(`cssVariables` + 可选的、针对封面美术区域的
  `cardVisual` JSON-AST 覆盖)
- **离线翻译** - 游戏的标题/简介可完全在本机、不依赖任何外部服务地翻译成你当前的 UI 语言:
  一次性下载 llama.cpp 官方预构建的服务端二进制文件,选择一个模型(几种对 CPU 友好的档位,
  外加一个专为 NSFW 游戏简介设计的无审查档位),然后在游戏详情页中独立地翻译/切换显示/撤销
  标题和内容。翻译按游戏和字段分别保存,语言切换或原文被编辑时会自动失效
- **自动更新** - 应用本身以及每个已安装的插件/主题都会自动检查并应用更新

## 技术栈

- **Tauri 2**(Rust 后端)+ **Vue 3**(`<script setup>`,TypeScript)前端
- **SQLite**(通过 `tauri-plugin-sql`),通过版本化迁移演进数据库结构
- 前端状态使用 **Pinia**,每个领域一个 store
- 运行时可下载插件系统使用 **wasmtime**(Wasm Component Model)

## 开发

本仓库使用 [`bun`](https://bun.sh),而非 npm/yarn/pnpm。

```sh
bun install          # 安装 JS 依赖
bun run dev           # 仅启动 Vite 开发服务器(前端)
bunx tauri dev         # 完整应用(前端 + Rust 后端),支持热重载
bunx tauri build        # 生产环境桌面二进制文件
```

在 `src-tauri/` 下:使用 `cargo check` 进行快速的 Rust 编译检查,无需完整构建。

## 插件架构

每个插件都有一个 `plugin.json` 清单(`{ id, name, version, kind, entry }`),并根据 `kind`
实现五种接口之一:

- `source` - 用于游戏来源集成的 `scan()` / `launch()` / `getInstallStatus()`(可多个
  同时启用)
- `theme` - CSS 变量(颜色、字体、边框/圆角)以及针对封面美术区域的可选 JSON-AST
  `cardVisual` 覆盖(单一激活);仅包含 `cssVariables` 的清单完全不需要代码。组件插槽覆盖
  (替换整个自定义 Vue 组件)在早期曾被支持,但后来被这个封闭词汇的 AST 层取代并淘汰 - 主题
  没有任何可注入的 eval/可执行代码路径
- `metadata` - 用于封面美术/简介/类型提供方的 `fetchMetadata(title)`(可多个同时启用)
- `controller` - 针对特定物理手柄布局的 `GamepadMapping`(按钮/摇杆轴索引)(单一激活)
- `wrapper` - 自行管理安装并通过语言环境配置文件启动目标可执行文件的兼容性包装器(例如
  Locale Remulator/Emulator)

构建时插件位于 `src/plugins/<id>/` 下,通过 Vite 的 `import.meta.glob` 发现。运行时插件是
从清单 URL 安装(设置 → 对应标签页 → 添加插件)或手动下载/解压到应用数据目录的 WebAssembly
组件(`source`/`wrapper`/`metadata` 类型),通过内嵌在 Rust 后端中的 `wasmtime` 主机加载。
纯数据主题(仅 `cssVariables`,无代码)是完全不需要 WASM 沙箱的独立、无代码 URL 安装层。

### 官方插件

完整列表(仓库链接、最新版本下载链接、安装说明)请参见文档站点的
**[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)**。

**安全说明(Milestone 12,已完成):** wasmtime 的 Component Model 沙箱保证内存安全(插件
无法破坏主机内存或逃离自身执行范围),而且现在每一个可能造成实际损害、暴露给插件的主机函数
都已加上门控:
- `spawn-process`/`run-and-wait` 需要明确、可见的按插件授权 - 插件必须在清单中声明
  `capabilities: ["run-programs"]`,并且在你真正授予之前,应用不会代表它运行任何东西(通过
  URL 安装时是安装确认对话框中的复选框,对于已安装的插件则是设置中的"需要权限"行及授权
  按钮)。
- `write-file`/`remove-dir` 无条件、硬性地被限制在插件自己的目录内,没有例外。
  `read-file`/`list-dir`/`path-exists`/注册表访问则限定于清单声明的允许列表
  (`pathScopes`),再加上针对唯一一个安装位置事先无法确定的插件(Steam)的经验证的运行时
  范围请求 - 主机会在授予访问权限前检查真实的结构性特征(一个 `steamapps` 子目录),并对
  没有验证器的插件 ID 一律拒绝。
- `http-get`/`http-request`/`download-bytes` 限定于清单声明的主机名允许列表
  (`httpScopes`) - 插件只能访问其声明的主机(精确匹配或子域名),而无法访问任意由攻击者
  控制的 URL。

即便如此,也请只安装来自你完全信任的来源的插件 - 这解决的是"插件可以悄悄触及你系统或网络
上任何地方"的问题,而不是一个完整的应用商店级信任模型。

**信任模型(Milestone 13,已完成):** 两个互补且独立的层级。
- **签名** - 每个官方插件版本都使用 [Sigstore](https://www.sigstore.dev/) 构建来源证明
  进行签名,将已发布的 `.wasm` 绑定到构建它的确切提交和 CI 运行。Concourse 会在安装时检查
  这一点并显示结果 - **仅供参考,不是强制门槛。** 它确认的是这个构件确实来自该仓库自己的
  CI、且此后未被篡改(能捕获篡改、被入侵的发布令牌、被劫持的仓库偷偷塞入的恶意构建),但它
  **不**担保仓库作者的意图。恶意作者自己的代码同样能获得完全有效的签名,因为他们自己的
  CI 确实按其提交内容构建并签名了。
- **精选注册表** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry),一份
  手工维护的插件列表,其固定版本已被实际审阅过,每个条目都锁定到特定版本及其真实的
  SHA256。"添加插件"对话框会在自由输入的 URL 字段旁展示这些条目;从注册表安装时,哈希不
  匹配会被**硬性拒绝**,这与签名的建议性检查不同 - 这个哈希是经审阅后手动选定的,因此
  不匹配是一个真实的"这不是被审阅过的内容"信号。从注册表中移除一个条目即会撤销该条目未来的
  安装(尚不会追溯已安装的副本)。无论如何,自由输入 URL 安装方式仍与之前完全相同地工作 -
  注册表是一条额外的、更受信任的路径,而非必须的门槛。

## 文档

完整的插件开发者及用户文档发布于
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)**(源码位于
[`docs/`](docs/),使用 VitePress 构建) - 包含用户指南(安装、游戏库管理、Big Picture 模式)
以及插件开发者参考(架构概览、入门指南、完整的清单/WIT 接口参考、安全模型,以及如何发布
插件)。

## 状态

按里程碑持续开发中。原始设计提案见 [`.claude/proposal.md`](.claude/proposal.md),最新
进度追踪见 [`.claude/milestones.md`](.claude/milestones.md),各里程碑项目的实现历史/理由
见 [`.claude/devlog.md`](.claude/devlog.md)。

截至目前:核心游戏库、元数据/游玩时长追踪、Big Picture 模式、插件系统(包括 WebAssembly
运行时插件管线及兼容性包装器的托管安装)、WASM 插件权限沙箱化(Milestone 12)、插件信任/
签名模型(Milestone 13)、持续进行中的桌面 UI 打磨工作(Milestone 14)、取代组件替换式
主题的 JSON-AST 主题层(Milestone 17/19)、共享样式规范整理(Milestone 18)、应用 + 插件/
主题自动更新(Milestone 20)、10 语言本地化以及游戏标题/简介的离线本地翻译
(Milestone 21),以及本文档站点(Milestone 22)均已完成。上面列出的所有官方插件均已上线。
未完成的工作包括模拟器/ROM 扫描器插件以及更多来源插件(Xbox/EA/Ubisoft,Milestone 16)。

## 许可证

MIT - 详见 [`LICENSE`](LICENSE)。

### 第三方声明

Concourse 自身的源代码采用 MIT 许可证;仓库或已构建的二进制文件中不包含任何第三方内容。
离线翻译功能(Milestone 21)会在运行时将两类第三方内容直接下载到你的设备上,各自遵循其自身
独立的条款 - 此处列出仅为透明起见,并非因为 Concourse 对其进行了再分发:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)**(MIT) - 翻译引擎本身。Concourse
  从 GitHub 下载其官方预构建的 Windows 版本二进制文件,并将其作为子进程运行;没有任何
  llama.cpp 代码被编译进或随 Concourse 一起分发。
- **模型权重**根据你在设置中的选择从 Hugging Face 下载,各自遵循其模型卡片自身的许可证 -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` 均为 Apache 2.0(Gemma 4 在 2026 年 4 月专门
  改为 Apache 2.0,取代了早期 Gemma 世代所采用的限制性更强的许可证)。两个无审查档位
  (`qwen3-4b-abliterated`、`gemma4-e2b-abliterated`)沿用其各自基础模型的许可证。在将其
  用于商业用途之前,请务必查看每个模型自身的 Hugging Face 模型卡片。
