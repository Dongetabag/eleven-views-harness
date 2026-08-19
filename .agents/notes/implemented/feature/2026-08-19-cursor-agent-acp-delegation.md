# Agent Note: Ship Cursor Agent delegation through ACP

Status: implemented

English | [中文](2026-08-19-cursor-agent-acp-delegation.zh.md)

## Problem

The Eleven Views distribution needs to run with Cursor Agent without turning Cursor into an LLM adapter or placing Cursor credentials in Harness configuration. A shell wrapper would lose the structured lifecycle, cancellation, and permission exchange already available through the [generic ACP subagent backend](2026-06-22-acp-subagent-backend.md).

Cursor should also remain optional for ordinary Web sessions. Starting an agent process during host boot would spend resources before a person chooses to delegate and would make the Web surface depend on Cursor authentication even when the feature is unused.

## Decision

The Web bundle registers a dormant generic ACP provider named `cursor`. It launches the local Cursor Agent CLI with `agent acp`, using `CURSOR_AGENT_PATH` when set and resolving `agent` from `PATH` otherwise. The provider uses the shared subprocess boundary and starts a fresh ACP process only when a run begins.

A shipped `cursor` preset includes the complete `standard` composition and adds one one-shot `subagent_cursor` tool. Provider-managed nesting remains in force. The preset does not add Cursor capabilities to other modes.

The repository provides `pnpm run cursor:web` and a small Cordis patch that selects the Cursor preset as the composition default. Cursor project rules and an editor task expose the same launch path. Authentication remains owned by the Cursor CLI and no token or API key is stored in tracked configuration.

The ACP provider is configured with `permission: allow`. The host therefore approves permission requests made inside the delegated Cursor run after the parent agent has received approval to invoke `subagent_cursor`.

## Verification

- The Web composition test proves that the provider is registered without spawning a process and that only the Cursor preset exposes `subagent_cursor`.
- The Cursor Agent CLI authentication and a non-interactive local workspace prompt complete successfully.
- The Cursor Web patch resolves with the Cursor preset selected and the branded Web server starts from the repository task.
- Documentation pairing, lint, type checking, and repository diff checks pass.

## Alternatives considered

- Implement Cursor as a model provider. Rejected because Cursor Agent is an agent runtime with its own tools and permission protocol, not an LLM endpoint.
- Invoke `agent --print` from a shell tool. Rejected because it discards ACP lifecycle, structured cancellation, and permission handling.
- Add the Cursor tool to `standard`. Rejected because every standard session would inherit an optional product dependency.
- Build a Cursor-specific backend. Rejected because the generic ACP backend already owns the required transport and process lifecycle.

## Consequences

Each delegation starts a fresh Cursor Agent and returns its final text through the existing one-shot subagent contract. Cursor must be installed and authenticated on the host before delegation can succeed. Operators can relocate the executable with `CURSOR_AGENT_PATH` without changing tracked files.

The permissive child policy is convenient for local coding work but expands what a delegated run may do inside its workspace. The parent tool approval remains the point where a person reviews whether the standalone Cursor task should run.
