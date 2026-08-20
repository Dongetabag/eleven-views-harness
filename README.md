# Eleven Views Harness

English | [中文](README.zh.md)

<img src="apps/web/public/eleven-views-logo.png" alt="Eleven Views" width="140">

Eleven Views Harness is the Eleven Views branded distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the open-source agent harness developed by [DeepSeek AI](https://deepseek.com). It keeps the upstream `dsh` runtime, provider support, plugin architecture, and MIT license while applying the Eleven Views identity to the Web experience.

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

The upstream DeepSeek Harness project is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run the upstream package from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

This command runs the unbranded upstream npm release. It starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/Dongetabag/eleven-views-harness.git
cd eleven-views-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Run with Cursor Agent

Install and authenticate the [Cursor Agent CLI](https://cursor.com/docs/cli/using), then launch the branded Web UI with the Cursor preset selected:

```sh
agent login
pnpm run cursor:web
```

This launch selects **Cursor Agent** as the primary provider, hides the built-in DeepSeek route for this launch only, and loads the models available to the authenticated Cursor account into the model selector. Each Harness response starts a fresh non-interactive Cursor run in the launch workspace, with Cursor owning the inner coding loop. No DeepSeek API key is required. Start a new Harness session after switching launch modes because existing sessions retain their original provider.

The Cursor preset also includes `subagent_cursor` for explicit one-shot ACP delegation. Primary runs pass Cursor's `--force` flag and delegated ACP runs approve child permission requests, so review each task before sending it. Cursor authentication remains in Cursor's local account storage and no key belongs in this repository.

If `agent` is not available on `PATH`, set `CURSOR_AGENT_PATH` to the executable path before launch. Cursor editor users can run the same command through **Terminal → Run Task → Eleven Views Harness: Run with Cursor**.

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
