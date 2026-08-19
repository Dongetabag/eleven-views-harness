# Agent Note: Ship Cursor Agent as primary and delegated runtime

Status: implemented

English | [中文](2026-08-19-cursor-agent-acp-delegation.zh.md)

## Problem

The Eleven Views distribution needs to run directly on a person's authenticated Cursor account without placing Cursor credentials in Harness configuration. A delegated-only integration still leaves DeepSeek in the model selector and requires a separate parent-model key, which does not meet the expectation that this launch runs with Cursor.

Cursor should remain optional for ordinary Web sessions, and no Cursor process should start during host boot. The integration also needs to retain the structured lifecycle, cancellation, and permission exchange available through the [generic ACP subagent backend](2026-06-22-acp-subagent-backend.md) for explicit delegation.

## Decision

The Web bundle registers a primary LLM-seam provider named `cursor-agent`. It discovers the authenticated account catalog through `agent models`. For each model call it sends the assembled system prompt and Harness conversation to `agent --print --output-format json` over stdin. Cursor owns the inner coding loop and Harness stores the final response. The Cursor launch patch disables the built-in DeepSeek route for that launch and selects `cursor-agent/auto` as the default model, leaving the ordinary Web profile unchanged.

The adapter runs through the shared subprocess boundary with bounded output and process-tree cancellation. It passes `--force` because a non-interactive Cursor process cannot answer tool approval prompts. Provider retries are disabled because a failed Cursor run may already have changed workspace files.

The bundle also registers a dormant generic ACP provider named `cursor`. It launches `agent acp`, using `CURSOR_AGENT_PATH` when set and resolving `agent` from `PATH` otherwise. A fresh ACP process starts only when a delegated run begins.

A shipped `cursor` preset includes the complete `standard` composition and adds one one-shot `subagent_cursor` tool. Provider-managed nesting remains in force. The preset does not add Cursor capabilities to other modes.

The repository provides `pnpm run cursor:web` and a small Cordis patch that selects both the Cursor provider and Cursor preset. Cursor project rules and an editor task expose the same launch path. Authentication remains owned by the Cursor CLI and no token or API key is stored in tracked configuration.

The ACP provider is configured with `permission: allow`. The host therefore approves permission requests made inside the delegated Cursor run after the parent agent has received approval to invoke `subagent_cursor`.

## Verification

- Adapter tests prove model-catalog parsing, prompt mapping, non-interactive invocation, result streaming, and the no-retry policy.
- The Web composition test proves that both Cursor routes register without spawning a process and that only the Cursor preset exposes `subagent_cursor`.
- The Cursor Agent CLI authentication and a non-interactive local workspace prompt complete successfully.
- The Cursor Web patch resolves with `cursor-agent/auto` and the Cursor preset selected, and the branded Web server starts from the repository task.
- Documentation pairing, lint, type checking, and repository diff checks pass.

## Alternatives considered

- Expose only delegated Cursor ACP. Rejected because the UI still requires a separate parent provider and does not run primarily on the Cursor account.
- Treat Cursor as a conventional HTTP model endpoint. Rejected because Cursor Agent is an agent runtime with its own tools and permission protocol.
- Add the Cursor tool to `standard`. Rejected because every standard session would inherit an optional product dependency.
- Build a Cursor-specific backend. Rejected because the generic ACP backend already owns the required transport and process lifecycle.

## Consequences

Each primary model call starts a fresh Cursor Agent, resends the visible Harness history, and returns its final text through the LLM seam. Each delegation returns final text through the existing one-shot subagent contract. Cursor must be installed and authenticated on the host. Operators can relocate the executable with `CURSOR_AGENT_PATH` without changing tracked files.

Primary and delegated Cursor runs use permissive non-interactive tool policies. This is convenient for local coding work but expands what a run may do inside its configured workspace. The current primary adapter uses one deployment-wide workspace and advertises text input only.
