# Linux deployment and troubleshooting

This document records the first manual GPT Web Codex v2.2.11 deployment on Ubuntu 26.04.1 LTS x86_64. The verification covered source dependencies, the Linux AppImage, standalone MCP, file and terminal tools, Luna execution and resume, OpenAI Tunnel, and a real ChatGPT Web tool call.

## Verified result

- Core tests: 256 passed, 4 skipped, 0 failed.
- Launcher tests: 79 passed, 0 failed.
- Linux MCP returned shell stdout, stderr, status, and exit code correctly.
- `file_create_directory`, `file_list` with `modified_at`, and `file_delete_directory` passed installed-runtime tests.
- `gpt-5.6-luna` completed work through `codex exec --json`; a second task for the same web session reused the same Luna session.
- ChatGPT Web called `terminal_exec` through the Tunnel and received `Linux`, exit code 0, and `completed`.

## 1. Bun exists but project scripts cannot find it

Symptom: Bun works by absolute path, but a nested command from `bun run test` fails with:

```text
bun: command not found
```

Cause: the Bun binary exists outside PATH. npm 11 may also block Bun's postinstall script by default.

For source development, install the repository-pinned version and verify PATH:

```bash
npm install --global --allow-scripts=bun bun@1.3.14
ln -sfn "$(npm prefix -g)/bin/bun" "$HOME/.local/bin/bun"
ln -sfn "$(npm prefix -g)/bin/bunx" "$HOME/.local/bin/bunx"
hash -r
bun --version
```

When using Bun's official installer, only the final PATH check is relevant. Do not enable a permanent global npm script allowlist merely to solve this issue.

## 2. Direct AppImage execution requires FUSE 2

Symptom:

```text
dlopen(): error loading libfuse.so.2
AppImages require FUSE to run
```

On Ubuntu 26.04, install:

```bash
sudo apt-get install libfuse2t64
```

This affects direct AppImage mounting only. `scripts/install-launcher.sh` sets `APPIMAGE_EXTRACT_AND_RUN=1` in its installed wrapper, so the normal installer path does not require a FUSE mount. A temporary direct-run alternative is:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./gpt-web-codex-*-linux-x64.AppImage
```

## 3. The launcher started before setup

If the launcher is already open when another terminal runs `gpt-web-codex setup`, the configuration may be valid while the existing launcher still reports that the Tunnel is stopped. Quit and reopen the launcher after setup so it reloads the configuration and starts the Tunnel/MCP runtime.

A future release may watch the configuration file for changes. Until then, restarting is the deterministic recovery step.

## 4. Supplying a Runtime Key non-interactively

The hidden secret prompt expects an interactive terminal. A plain pipe may be treated as missing input:

```bash
printf '%s\n' "$RUNTIME_KEY" | gpt-web-codex setup ...
```

Automation should use the supported file input without putting the secret in process arguments:

```bash
printf '%s' "$RUNTIME_KEY" | gpt-web-codex setup \
  --full \
  --mcp-only \
  --tunnel-id 'tunnel_...' \
  --runtime-key-file /dev/stdin \
  --acknowledge-unofficial
unset RUNTIME_KEY
```

Setup stores the key at:

```text
~/.codex-chatgpt-web/secrets/tunnel-runtime.key
```

Verify mode `600`, and never add this file to Git, logs, or chat.

## 5. Platform and ChatGPT require separate sessions

Runtime Keys are created on `platform.openai.com`; connectors are managed on `chatgpt.com`. Do not assume that one browser login authenticates both sites. ChatGPT may still require a login, verification code, or account selection after Platform login succeeds.

Prefer a Restricted Runtime Key with only:

```text
Tunnels: Read + Use
```

## 6. The settings dialog closes after connector refresh

ChatGPT may close Settings immediately after Refresh. This does not prove failure. Reopen:

```text
Settings → Plugins → WebGPT Luna Standalone
```

Confirm that current tools such as `terminal_exec`, `terminal_write_stdin`, `file_create_directory`, and `codexluna_start` are listed.

## 7. The connector warning from `doctor`

Local `doctor` checks can prove that configuration, credentials, Tunnel, and the MCP runtime are healthy. They cannot prove the account-side ChatGPT connector binding, so this warning is expected locally:

```text
Local checks cannot prove that ChatGPT connector is attached to this tunnel
```

Finish with a harmless tool call from a normal ChatGPT Web conversation. For example:

```sh
printf 'WEBGPT_LINUX_MCP_OK\n'; uname -s
```

The result should contain stdout, empty stderr, `exit_code: 0`, and `status: completed`.

## 8. Non-blocking warnings

- `vaInitialize failed` is an Electron/VA-API hardware video decode warning; it does not affect pure MCP, Tunnel, or Luna.
- The first v2.2.11 build warned about desktop window association. Current source configures `desktopName` and `linux.syncDesktopName`.

## Full diagnostic order

```bash
bun run check-version
bun run typecheck
bun run test
bun run launcher:typecheck
bun run launcher:test
gpt-web-codex doctor --json
```

Verify configuration, private key permissions, Tunnel readiness, and the MCP process in that order, then finish with the ChatGPT Web tool call.
