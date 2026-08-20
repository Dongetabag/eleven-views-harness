# Agent Note: 将 Cursor Agent 作为主要和委派 runtime

Status: implemented

[English](2026-08-19-cursor-agent-acp-delegation.md) | 中文

## Problem

Eleven Views 发行版需要直接使用用户已验证的 Cursor 账户运行，同时不能把 Cursor 凭据放入 Harness 配置。仅提供委派集成仍会在模型选择器中显示 DeepSeek，并要求单独的父模型密钥，这不符合此次启动应使用 Cursor 运行的预期。

普通 Web 会话仍应保持 Cursor 可选，并且 host 启动期间不应创建 Cursor 进程。对于显式委派，集成还需要保留[通用 ACP 子代理后端](2026-06-22-acp-subagent-backend.md)提供的结构化生命周期、取消和权限交换。

## Decision

Web bundle 注册一个名为 `cursor-agent` 的主要 LLM seam provider。它通过 `agent models` 发现已验证账户的模型目录。每次模型调用时，它把组装后的 system prompt 和 Harness 对话通过 stdin 发送给 `agent --print --output-format json`。Cursor 负责内部 coding loop，Harness 保存最终响应。Cursor 启动 patch 仅为此次启动禁用内置 DeepSeek route，并把 `cursor-agent/auto` 设为默认模型，普通 Web profile 保持不变。

适配器声明文本和图片输入能力。它把持久图片解析到私有随机目录中仅限所有者访问的文件，通过 `--add-dir` 传递该目录，并用绝对路径标记保留每张图片在对话中的位置。Cursor 进程通过其图片能力读取这些文件，进程结束后适配器会删除该目录。Cursor 启动 patch 接受单边最长 4096 像素的图片，同时保留共享附件 backend 的编码字节和 4000 万像素限制。

适配器通过共享 subprocess 边界运行，并提供有界输出和进程树取消。它传递 `--force`，因为非交互式 Cursor 进程无法回答工具批准提示。provider 重试已禁用，因为失败的 Cursor run 可能已经修改 workspace 文件。

bundle 还注册一个名为 `cursor` 的休眠通用 ACP provider。它通过 `agent acp` 启动本地 Cursor Agent CLI，在设置时使用 `CURSOR_AGENT_PATH`，否则从 `PATH` 解析 `agent`。只有在委派 run 开始时才会创建新的 ACP 进程。

内置 `cursor` preset 包含完整的 `standard` composition，并添加一个 one-shot `subagent_cursor` tool。嵌套深度继续由 provider 管理。此 preset 不会把 Cursor 能力添加到其他模式。

仓库提供 `pnpm run cursor:web`，并通过一个小型 Cordis patch 同时选择 Cursor provider 和 Cursor preset。Cursor 项目规则和编辑器 task 公开同一启动路径。身份验证仍由 Cursor CLI 管理，任何 token 或 API key 都不会存入受版本控制的配置。

ACP provider 配置为 `permission: allow`。因此，在父 agent 已获准调用 `subagent_cursor` 后，host 会批准被委派 Cursor run 内部提出的权限请求。

## Verification

- 适配器测试证明模型目录解析、prompt 映射、私有图片物化和清理、非交互式调用、结果 streaming 和不重试策略均正确。
- Web composition 测试证明两条 Cursor 路径都已注册但不会创建进程，并且只有 Cursor preset 公开 `subagent_cursor`。
- Cursor Agent CLI 身份验证、非交互式本地 workspace 提示以及通过新增目录进行的图片检查均成功完成。品牌 Web 流程可以接受一张单边 2162 像素的截图，并返回从图片中读取的文字。
- Cursor Web patch 能以 `cursor-agent/auto` 和已选择的 Cursor preset 完成解析，品牌化 Web server 能从仓库 task 启动。
- 文档配对、lint、类型检查和仓库 diff 检查均通过。

## Alternatives considered

- 只公开委派 Cursor ACP。否决原因是 UI 仍要求单独的父 provider，无法主要使用 Cursor 账户运行。
- 把 Cursor 当作传统 HTTP model endpoint。否决原因是 Cursor Agent 是拥有自身工具和权限协议的 agent runtime。
- 把 Cursor tool 添加到 `standard`。否决原因是每个 standard session 都会继承一个可选产品依赖。
- 构建 Cursor 专用 backend。否决原因是通用 ACP backend 已经负责所需的 transport 和进程生命周期。

## Consequences

每次主要模型调用都会启动一个新的 Cursor Agent，重新发送 Harness 中可见的历史记录，并通过 LLM seam 返回最终文本。每次委派都会通过现有 one-shot subagent contract 返回最终文本。host 必须先安装 Cursor 并完成身份验证。操作者可以通过 `CURSOR_AGENT_PATH` 移动可执行文件，无需修改受版本控制的文件。

主要和委派 Cursor run 都使用宽松的非交互式工具策略。此策略便于本地编码工作，但会扩大 run 在其配置 workspace 内可执行的操作范围。当前主要适配器使用一个 deployment-wide workspace。图片输入会把短期 host 文件添加到单个 Cursor run，而不会把附件字节复制到 prompt 中。Cursor 启动的较高尺寸限制会把更大的截图存入持久会话历史，因此 deployment 仍通过未变更的字节和像素限制控制总体暴露范围。
