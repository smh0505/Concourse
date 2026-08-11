# WIT 接口

这是每个 WASM 插件实际构建所依据的
[WIT](https://component-model.bytecodealliance.org/design/wit.html) 契约 —— 真正的权威来源
是主仓库中的 `src-tauri/wit/plugin.wit`;本页对其进行解释,但如果两者出现分歧,以该文件为准。

## `host` 接口

下面的每一个宿主函数都是 Rust 宿主实现并暴露给插件的一项能力 —— 都是刻意设计成通用的原语
(注册表/文件/进程/网络/受限存储),而非按具体集成设计的语义化函数。来源插件自行组合使用这些
原语(例如解析某个厂商自己的 VDF/XML 格式),而不是由 Concourse 为每个来源编写专门的模块。

### 注册表(Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` 是 `"HKLM"` 或 `"HKCU"`。键/值不存在时返回 `none`/空列表,而非报错 —— "不存在"是一种
正常的、预期内的结果(例如检查某个平台是否已安装)。

### 文件系统

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` 返回该插件自己的可写目录
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) —— 始终隐式可读写。其他任何路径都需要落在
manifest 声明的范围内,或者在运行时申请(参见[安全模型](./security-model#path-scoping))。

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

用于运行时才能发现、而非静态已知的目录(例如用户实际安装 Steam 的位置) —— 宿主只有在同时识别出
你的插件 id *并且* 该路径通过针对该厂商的真实结构检查时,才会授予此权限。

### 进程

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` 是即发即忘的(不等待/不返回退出码) —— 与 `launch()` 在其他地方的使用方式相
符;Concourse 自身基于文件夹的游戏时长追踪机制单独覆盖了会话时长的记录。`run-and-wait` 会阻塞
直到进程退出,适用于确实需要这样做的场景(例如插件需要确认某个第三方安装程序的可见窗口已经关闭
才能继续)。两者都需要 `"run-programs"` 能力授权 —— 参见[安全模型](./security-model)。

### 网络

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` 用于任何 `http-get` 无法表达的场景 —— 自定义请求头(一个 `Authorization`
bearer token)或带请求体的非 GET 方法(例如基于 POST 的查询接口)。对二进制响应应使用
`download-bytes`,而非 `http-get`/`http-request`。

### 压缩包

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

这几个函数共同覆盖了常见的"下载一个发布压缩包、解压、并安装它"流程(供 `wrapper` 插件用于自身
管理的安装)。`unwrap-single-subdir` 处理的是常见情况:发布压缩包将其内容包裹在一个与压缩包名
称相匹配的顶层文件夹中。

### 受限存储

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

两者都由宿主按插件 id 自动命名空间隔离 —— 你的插件永远无法读取或写入另一个插件的设置或按游戏
存储的数据,也无法直接访问核心应用的数据表。

## 三种插件 world

每种可由 WASM 插件实现的 `kind`,都导出以下 world 之一:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

对应内置的 `SourcePlugin` TypeScript 接口 —— 一个 WASM 来源插件是同一契约的一种可直接替换的
实现方式。完整的实现步骤见[快速上手](./getting-started)。

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

一个兼容包装器(例如区域模拟器) —— 完全自成一体。`install()` 下载最新发布版本、解压、在不存在
默认配置文件时生成一份,并运行真正的厂商安装程序来完成只有它才能做的注册步骤。与来源插件不同,
这里没有任何由宿主提供的路径需要传入 —— 该插件始终安装到(并解析)其自身 `plugin-dir()` 下的
同一个确定性位置。

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` 返回每一个可能的匹配 —— 通常是 0 或 1 个,但当你的提供方自身的列表确实存在
歧义时(例如同名的重复/再版内容),也可能更多。当恰好返回一个候选时,宿主会自动选用它;当返回
多个候选时,会向用户展示一个选择器;当没有任何候选返回时,则会完全跳过该提供方。
`fetch-metadata-by-id` 随后根据其 `id` 为某个具体候选获取完整的元数据。

## `game-entry` 与 `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
