# `@deepseek-ai/dsh-llm-cursor-agent`

English | [中文](README.zh.md)

Cursor Agent CLI adapter for the Harness LLM seam. It uses the local Cursor account login, lists that account's available models, and lets a non-interactive Cursor Agent own the inner coding loop for each Harness model call.

## Configuration

```yaml
- name: '@deepseek-ai/dsh-llm-cursor-agent'
  config:
    providerName: cursor-agent
    command: agent
    cwd: /absolute/workspace
    force: true
```

`command` resolves through the managed subprocess environment. `cwd` defaults to the Harness launch directory. `force` passes Cursor's `--force` flag because a non-interactive process cannot answer tool approval prompts.

## Request mapping

The adapter converts the assembled system prompt and full provider-neutral conversation into one standalone task on stdin, then runs `agent --print --output-format json`. Cursor uses its own workspace tools and the Harness stores its final answer as one assistant text block. Harness tool schemas are not forwarded because Cursor owns the inner agent loop.

Model discovery runs `agent models` and parses the authenticated account catalog. A failed discovery still advertises `auto`; an actual request then surfaces the Cursor CLI authentication or execution failure.

## Safety and lifecycle

The command runs through `dsh-subprocess`, so output is bounded and cancellation terminates the managed process tree. Ambient credential-shaped environment variables are scrubbed. Cursor authentication remains in Cursor's own local storage and is not copied into Harness settings.

Provider retries are disabled. A Cursor run may already have changed workspace files before reporting a failure, so automatically repeating it would not be safe.

## Model Experience

### Cursor Agent request

#### What the model sees

The Cursor-selected model receives an adapter-authored runtime instruction, the assembled Harness system prompt, and the complete visible conversation with role labels through `agent --print --output-format json`. Harness tool schemas and image bytes are omitted because Cursor owns the inner agent loop and uses the workspace tools supplied by its CLI runtime.

#### Token effect

Every call resends the complete visible Harness history as one standalone task. Exact input, internal reasoning, and tool-use token costs are owned by Cursor; the adapter forwards the usage totals present in Cursor's final result.

#### KV Cache effect

The adapter starts a fresh Cursor CLI process for every call and retains no provider session handle. Cursor may reuse an identical prompt prefix within its own service, but any system instruction, history, role label, workspace context, or model change may prevent reuse from the first changed token.

### Cursor Agent response

#### What the model sees

Cursor's final text is converted to one Harness assistant block. On the next call, that retained block appears in the rebuilt role-labelled conversation; Cursor's hidden inner trajectory is not replayed.

#### Token effect

Only the final response text enters future Harness context. Inner tool results and hidden reasoning do not inflate the later Harness prompt, although Cursor may include their cost in the reported usage totals.

#### KV Cache effect

The retained final response appends to the next standalone task while the earlier unchanged prefix remains eligible for provider-side reuse. No cache identity is shared across a model change.

## Known Limitations and Deferred Work

- Each Harness model call starts a fresh Cursor conversation and resends the visible Harness history.
- The adapter currently advertises text input only.
- Cursor tool approval is non-interactive when `force: true`; the Harness access-mode selector does not govern Cursor's inner tools.
- The configured `cwd` is deployment-wide. It does not change when a running Harness session selects a different workspace.
