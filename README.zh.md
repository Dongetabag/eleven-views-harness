# Eleven Views Harness

[English](README.md) | 中文

<img src="apps/web/public/eleven-views-logo.png" alt="Eleven Views" width="140">

Eleven Views Harness 是开源 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Eleven Views 品牌发行版，上游项目由 [DeepSeek AI](https://deepseek.com) 开发。它保留上游 `dsh` 运行时、模型提供商支持、插件架构和 MIT 许可证，并将 Eleven Views 视觉身份应用于 Web 体验。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

上游 DeepSeek Harness 项目目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 通过 `npm` 运行上游版本

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令运行未品牌化的上游 npm 版本。它默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/Dongetabag/eleven-views-harness.git
cd eleven-views-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

### 通过 Cursor Agent 运行

安装并登录 [Cursor Agent CLI](https://cursor.com/docs/cli/using)，然后以 Cursor 模式启动品牌化 Web UI：

```sh
agent login
pnpm run cursor:web
```

此启动方式会选择 **Cursor Agent** 作为主要 provider，仅为本次启动隐藏内置 DeepSeek route，并把已登录 Cursor 账户可用的模型加载到 model selector 中。每次 Harness 回复都会在启动 workspace 中创建一个新的非交互式 Cursor run，由 Cursor 负责内部 coding loop。不需要 DeepSeek API key。切换启动模式后请新建 Harness session，因为现有 session 会保留原 provider。

Cursor 模式还包含 `subagent_cursor`，用于显式 one-shot ACP 委派。主要 run 会传递 Cursor 的 `--force` 标志，委派 ACP run 会批准子级权限请求，因此发送前请检查每个任务。Cursor 身份验证保留在 Cursor 的本地账户存储中，不应将任何密钥写入本仓库。

如果无法从 `PATH` 运行 `agent`，请在启动前将 `CURSOR_AGENT_PATH` 设置为该可执行文件的路径。Cursor 编辑器用户也可以通过 **Terminal → Run Task → Eleven Views Harness: Run with Cursor** 运行同一个命令。

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
