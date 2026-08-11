# 发布

## 自由的按 URL 安装方式(始终可用)

任何人今天都可以安装你的插件,而无需在任何地方被列出 —— Concourse 的 "Add Plugin"(添加插件)
对话框接受一个直接指向 `plugin.json` manifest 的 URL。发布一个带有你编译好的 `.wasm` 和
manifest 作为发布资源的 GitHub release,分享该 manifest 的发布资源 URL,就完成了。这是一条
真实的、一等公民的安装路径,而不是备用方案 —— 插件作者无需出现在任何注册表中就能被安装。

要让针对自由 URL 的更新检查正常工作,请按常规方式发布版本(带标签的版本号,例如 `v0.2.0`),
并指向该标签自己的资源 URL,而不是 `.../releases/latest/...` 链接,这样一次具体的安装才会
始终固定在其实际安装时所对应的内容上。

### 代码签名(推荐)

如果你的插件仓库的 CI 为其发布产物附加了构建来源证明(例如
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
Concourse 会在安装确认界面中将其展示为参考性验证信息 —— 证明用户即将安装的 `.wasm` 确实来自你
仓库自己的 CI,而非被篡改过的副本。这不是必需的,但这是自由 URL 安装唯一能获得、而注册表条目
才具备的东西(参见[安全模型](./security-model))。

## 精选注册表

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) 是一份
手工审核、带哈希固定的列表,在安装时会进行硬性的内容校验(不匹配会被直接拒绝,而不仅仅是标记
提示) —— 比自由 URL 安装的保证更强。老实说,截至本文撰写时,它自己说明的审核方式是由一个人
(`smh0505`,与 Concourse 本身相同的维护者)审核,而不是一个开放的社区提交流程 —— "已审核"
意味着有人确实读过那个具体固定版本的源码,这在不改变该政策的情况下,无法扩展到接受任意第三方
pull request。如果你希望你的插件被考虑纳入,请在该仓库上开一个 issue,而不是假定一个添加你
自己条目的 PR 会被原样接受。

### 一条条目实际固定的内容

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin",
  "kind": "source",
  "repo": "you/your-plugin-repo",
  "manifestUrl": "https://github.com/you/your-plugin-repo/releases/download/v0.2.0/plugin.json",
  "wasmSha256": "<sha256 of the pinned .wasm, computed by the reviewer>"
}
```

`manifestUrl` 始终指向一个具体的、不可变的发布资源 —— 绝不是 `.../latest/...` —— 因为精选
条目的整个意义就在于今天安装的内容,正是当初审核过的确切内容,而不是你接下来发布的任何新版本。
`wasmSha256` 是审核者根据你实际的发布产物计算得出的,并会在每次通过该注册表安装时,针对实际
下载的字节内容进行校验。

### 让条目保持最新

如果你的插件被列入注册表,注册表自身的 CI 可以(通过你的发布工作流所发送的
`repository_dispatch`)自动检测到你的新发布,并针对该注册表自动开一个版本更新 PR —— 重新获取、
重新计算哈希、重新固定你的新发布资源以供审核,而不需要有人特意注意到你发布了更新。该 PR 仍然
需要人工合并,审核标准与初次上架时相同。
