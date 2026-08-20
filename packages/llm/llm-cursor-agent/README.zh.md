# `@deepseek-ai/dsh-llm-cursor-agent`

[English](README.md) | 中文

这是面向 Harness LLM seam 的 Cursor Agent CLI 适配器。它使用本地 Cursor 账户登录，列出该账户可用的模型，并让非交互式 Cursor Agent 为每次 Harness model call 负责内部 coding loop。

## Configuration

```yaml
- name: '@deepseek-ai/dsh-llm-cursor-agent'
  config:
    providerName: cursor-agent
    command: agent
    cwd: /absolute/workspace
    force: true
```

`command` 通过受管 subprocess 环境解析。`cwd` 默认为 Harness 启动目录。`force` 会传递 Cursor 的 `--force` 标志，因为非交互式进程无法回答工具批准提示。

## Request mapping

适配器把组装后的 system prompt 和完整的 provider-neutral conversation 转换成一个独立任务，通过 stdin 传入，然后运行 `agent --print --output-format json`。Cursor 使用自己的 workspace tools，Harness 则把其最终答案存为一个 assistant text block。Harness tool schemas 不会转发，因为内部 agent loop 由 Cursor 负责。

对于图片输入，适配器会把每个持久附件解析到私有临时文件，通过 `--add-dir` 将该目录添加到 Cursor run，并在图片对应的对话位置放入绝对文件路径。Cursor 使用图片能力读取该文件。重复引用共用一个文件，纯文本请求不会创建临时目录。

模型发现会运行 `agent models` 并解析已登录账户的 catalog。发现失败时仍会公布 `auto`；真正发起请求后会公开 Cursor CLI 的身份验证或执行失败。

## Safety and lifecycle

命令通过 `dsh-subprocess` 运行，因此输出有界，取消会终止受管进程树。环境中疑似凭据的变量会被清除。Cursor 身份验证仍保留在 Cursor 自己的本地存储中，不会复制到 Harness settings。图片文件使用私有随机目录和仅限所有者的权限；Cursor 进程结束后，适配器会删除该目录，失败的 run 也不例外。

Provider retries 已禁用。Cursor run 在报告失败前可能已经修改 workspace 文件，因此自动重复执行并不安全。

## 模型体验

### Cursor Agent 请求

#### 模型看到的内容

Cursor 所选模型会通过 `agent --print --output-format json` 收到适配器撰写的 runtime 指令、组装后的 Harness system prompt，以及带 role 标签的完整可见对话。每张图片都会在其对应的对话位置显示为一个临时绝对文件路径，Cursor 通过其 CLI runtime 检查该文件。Harness tool schemas 会被省略，因为内部 agent loop 由 Cursor 负责。

#### Token 影响

每次调用都会把完整的可见 Harness history 作为一个独立任务重新发送。精确输入、内部推理和工具使用的 token 成本由 Cursor 负责；适配器会转发 Cursor 最终结果中存在的 usage 总计。

#### KV Cache 影响

适配器每次调用都会启动一个新的 Cursor CLI 进程，不保留 provider session handle。Cursor 可在自己的服务内复用相同的 prompt 前缀，但任何 system instruction、history、role label、workspace context 或模型变更，都可能阻止从首个变更 token 起的复用。

### Cursor Agent 响应

#### 模型看到的内容

Cursor 的最终文本会转换为一个 Harness assistant block。下次调用时，这个保留块会出现在重新构建且带 role 标签的对话中；Cursor 隐藏的内部 trajectory 不会重放。

#### Token 影响

只有最终响应文本会进入未来的 Harness context。内部工具结果和隐藏推理不会增加后续 Harness prompt 的长度，但 Cursor 可能会把它们的成本计入报告的 usage 总计。

#### KV Cache 影响

保留的最终响应会追加到下一个独立任务，同时较早且未改变的前缀仍可由 provider 复用。模型变化时不会共享 cache identity。

## 已知限制与暂缓事项

- 每次 Harness model call 都会启动一个新的 Cursor conversation，并重新发送可见的 Harness history。
- 当 `force: true` 时，Cursor tool approval 为非交互式；Harness access-mode selector 不控制 Cursor 的内部工具。
- 配置的 `cwd` 属于整个 deployment。运行中的 Harness session 选择其他 workspace 时，它不会随之变化。
