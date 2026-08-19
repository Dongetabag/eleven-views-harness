# Agent Note: 通过 ACP 提供 Cursor Agent 委派能力

Status: implemented

[English](2026-08-19-cursor-agent-acp-delegation.md) | 中文

## Problem

Eleven Views 发行版需要与 Cursor Agent 协同运行，同时不能把 Cursor 变成 LLM 适配器，也不能把 Cursor 凭据放入 Harness 配置。使用 shell 包装器会失去[通用 ACP 子代理后端](2026-06-22-acp-subagent-backend.md)已经提供的结构化生命周期、取消和权限交换。

普通 Web 会话也应保持 Cursor 可选。若在 host 启动时创建 agent 进程，就会在人们选择委派之前消耗资源，并让未使用此功能的 Web surface 也依赖 Cursor 身份验证。

## Decision

Web bundle 注册一个名为 `cursor` 的休眠通用 ACP provider。它通过 `agent acp` 启动本地 Cursor Agent CLI，在设置时使用 `CURSOR_AGENT_PATH`，否则从 `PATH` 解析 `agent`。该 provider 使用共享 subprocess 边界，仅在 run 开始时创建新的 ACP 进程。

内置 `cursor` preset 包含完整的 `standard` composition，并添加一个 one-shot `subagent_cursor` tool。嵌套深度继续由 provider 管理。此 preset 不会把 Cursor 能力添加到其他模式。

仓库提供 `pnpm run cursor:web`，并通过一个小型 Cordis patch 把 Cursor preset 设为 composition 默认值。Cursor 项目规则和编辑器 task 公开同一启动路径。身份验证仍由 Cursor CLI 管理，任何 token 或 API key 都不会存入受版本控制的配置。

ACP provider 配置为 `permission: allow`。因此，在父 agent 已获准调用 `subagent_cursor` 后，host 会批准被委派 Cursor run 内部提出的权限请求。

## Verification

- Web composition 测试证明 provider 已注册但不会创建进程，并且只有 Cursor preset 公开 `subagent_cursor`。
- Cursor Agent CLI 身份验证和一个非交互式本地 workspace 提示均成功完成。
- Cursor Web patch 能以已选择的 Cursor preset 完成解析，品牌化 Web server 能从仓库 task 启动。
- 文档配对、lint、类型检查和仓库 diff 检查均通过。

## Alternatives considered

- 把 Cursor 实现为 model provider。否决原因是 Cursor Agent 是拥有自身工具和权限协议的 agent runtime，并非 LLM endpoint。
- 从 shell tool 调用 `agent --print`。否决原因是这种方式会丢弃 ACP 生命周期、结构化取消和权限处理。
- 把 Cursor tool 添加到 `standard`。否决原因是每个 standard session 都会继承一个可选产品依赖。
- 构建 Cursor 专用 backend。否决原因是通用 ACP backend 已经负责所需的 transport 和进程生命周期。

## Consequences

每次委派都会启动一个新的 Cursor Agent，并通过现有 one-shot subagent contract 返回最终文本。host 必须先安装 Cursor 并完成身份验证，委派才能成功。操作者可以通过 `CURSOR_AGENT_PATH` 移动可执行文件，无需修改受版本控制的文件。

宽松的子级策略便于本地编码工作，但会扩大被委派 run 在其 workspace 内可执行的操作范围。父 tool approval 仍然是人们审查是否应运行独立 Cursor task 的节点。
