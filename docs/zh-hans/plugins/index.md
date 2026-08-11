# 插件架构概览

Concourse 通过一套单一的插件系统,将来自多种来源的游戏聚合到一个游戏库中,并对自身进行换肤,
该系统共有五种插件类型。每种类型共享同一套 manifest 格式和加载器;不同的是每种类型的插件所
实现的契约。

## 五种插件类型

| 类型 | 职责 | 选择方式 |
|---|---|---|
| `source` | 扫描某个平台(Steam、GOG、Epic 等)以查找已安装的游戏,并启动它们 | 可多选启用 |
| `theme` | 重新设计配色/字体/卡片视觉效果 | 互斥(同一时刻只有一个处于激活状态) |
| `metadata` | 从外部数据库获取某款游戏的描述/发行日期/美术素材 | 可多选启用 |
| `controller` | 为 Big Picture 导航映射物理手柄按钮/摇杆轴 | 互斥 |
| `wrapper` | 通过一个由插件自行管理的兼容层(例如区域模拟器)启动游戏 | 可多选启用 |

来源插件和元数据提供方插件可独立**多选启用**(Settings 中的复选框) —— 你可以同时运行多个来源
插件和多个元数据提供方,各自贡献其他插件所没有的游戏/字段。主题插件和控制器映射插件是**互斥
单选**(单选按钮) —— 你始终只浏览一种皮肤,同时只使用一种物理输入方案。

## 两种发布插件的方式

1. **WASM 插件** —— 一个单独安装的 `.wasm` 组件,在运行时通过 URL(或精选注册表)下载,运行在
   一个沙盒化的 [wasmtime](https://wasmtime.dev/) Component Model 实例中。这是目前第三方
   `source`/`wrapper`/`metadata` 插件所走的路径 —— 参见[快速上手](./getting-started)和
   [WIT 接口](./wit-interface)参考文档。
2. **纯数据主题 manifest** —— 专用于 `theme` 插件,如果不需要完整的 WASM 插件机制,manifest
   可以是纯 JSON(`cssVariables`/`cardVisual`/`fontFaces`,完全没有代码)。参见
   [主题 Manifest](./theme-manifests)。

WASM 插件目前只存在于已定义
[WIT world](https://component-model.bytecodealliance.org/design/wit.html) 的三种类型中:
`source`、`wrapper`、`metadata`。目前要构建第三方 `theme` 插件,只能走上面的纯数据 manifest
路径。目前 `controller` 映射插件还没有第三方路径 —— Concourse 内置的手柄映射是直接编译进应用
本体的,新增一种映射意味着要为 Concourse 本身贡献代码,而不是发布一个独立插件。

## 为什么选择 WASM,而非原生代码或脚本

Concourse 曾考虑过为第三方插件使用可下载的原生可执行文件和一种脚本语言。两者都因同一个原因被
否决:插件需要真实的文件系统/注册表/网络/进程访问权限才能完成其工作(扫描一个 Steam 安装、
通过包装器启动一个游戏),而这两种方案都无法授予*受限范围*的访问权限 —— 一个原生二进制文件或
未加沙盒的脚本会获得与整个应用相同的权限。而通过 Component Model 使用 WASM,则能获得真正基于
能力(capability)的沙盒机制:只有当 Concourse 的 Rust 端实现并授予某个 `host` 接口函数时,
插件才能获得它,即便如此,大多数函数还会进一步按插件分别限定范围(参见[安全模型](./security-model))。

## 接下来

- [快速上手](./getting-started) —— 端到端构建一个最简单的 WASM 来源插件
- [Manifest 参考](./manifest-reference) —— 每一个 `plugin.json` 字段
- [主题 Manifest](./theme-manifests) —— 主题插件的 `cssVariables`/`cardVisual`/`fontFaces`
- [WIT 接口](./wit-interface) —— 实际的宿主能力接口与插件 world
- [安全模型](./security-model) —— 路径范围、能力门控、签名
- [发布](./publishing) —— 提交到精选插件注册表
