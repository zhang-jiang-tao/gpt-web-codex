# Linux 部署与排错

本文记录 GPT Web Codex v2.2.11 在 Ubuntu 26.04.1 LTS x86_64 上的首次人工实机部署结果。验证范围包括源码依赖、Linux AppImage、独立 MCP、文件与终端工具、Luna 调用与续接、OpenAI Tunnel，以及 ChatGPT 网页端真实工具调用。

## 已验证结果

- 核心测试：256 项通过、4 项跳过、0 项失败。
- 启动器测试：79 项通过、0 项失败。
- Linux MCP 正确返回 shell 的 stdout、stderr、状态与退出码。
- `file_create_directory`、带 `modified_at` 的 `file_list`、`file_delete_directory` 均通过实测。
- `gpt-5.6-luna` 可通过 `codex exec --json` 完成任务；同一 web session 的第二轮任务复用同一个 Luna session。
- ChatGPT 网页通过 Tunnel 调用 `terminal_exec`，实际返回 `Linux`、退出码 0 和 `completed`。

## 1. Bun 已安装但项目脚本找不到

症状：直接使用绝对路径运行 Bun 没问题，但 `bun run test` 内部再次调用 `bun` 时出现：

```text
bun: command not found
```

原因：Bun 二进制存在，但其目录不在 PATH。使用 npm 11 安装时，npm 还可能默认阻止 Bun 的 postinstall。

从源码开发应锁定仓库声明的版本，并确认 PATH：

```bash
npm install --global --allow-scripts=bun bun@1.3.14
ln -sfn "$(npm prefix -g)/bin/bun" "$HOME/.local/bin/bun"
ln -sfn "$(npm prefix -g)/bin/bunx" "$HOME/.local/bin/bunx"
hash -r
bun --version
```

如果使用 Bun 官方安装方式，只需保证新 shell 中的 `command -v bun` 能找到它。不要为了解决此问题开启 npm 的永久全局脚本白名单。

## 2. 直接运行 AppImage 时缺少 FUSE 2

症状：

```text
dlopen(): error loading libfuse.so.2
AppImages require FUSE to run
```

Ubuntu 26.04 的对应软件包是：

```bash
sudo apt-get install libfuse2t64
```

这只影响直接挂载并运行 AppImage。项目的 `scripts/install-launcher.sh` 会为启动包装器设置 `APPIMAGE_EXTRACT_AND_RUN=1`，因此正常安装路径不要求 FUSE 挂载。也可临时这样运行：

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./gpt-web-codex-*-linux-x64.AppImage
```

## 3. 启动器早于配置启动

如果先打开启动器，再从另一个终端运行 `gpt-web-codex setup`，配置文件虽然已经有效，旧启动器进程仍可能显示 Tunnel 未运行。配置完成后退出并重新打开启动器，使它重新读取配置并启动 Tunnel/MCP。

以后可考虑让启动器监听配置文件变化；在该功能实现之前，重启是确定的恢复方式。

## 4. 非交互传入 Runtime Key

隐藏密码提示依赖交互式终端。下面这种普通管道可能被当成“没有输入密钥”：

```bash
printf '%s\n' "$RUNTIME_KEY" | gpt-web-codex setup ...
```

自动化配置应使用受支持的文件入口，并避免让密钥出现在进程参数中：

```bash
printf '%s' "$RUNTIME_KEY" | gpt-web-codex setup \
  --full \
  --mcp-only \
  --tunnel-id 'tunnel_...' \
  --runtime-key-file /dev/stdin \
  --acknowledge-unofficial
unset RUNTIME_KEY
```

配置程序会把密钥保存到：

```text
~/.codex-chatgpt-web/secrets/tunnel-runtime.key
```

应验证权限为 `600`，且不要把该文件加入 Git、日志或聊天。

## 5. Platform 与 ChatGPT 需要分别登录

Runtime Key 在 `platform.openai.com` 创建，连接器在 `chatgpt.com` 管理。这两个网页的登录状态不能假定互通；Platform 已登录时，ChatGPT 仍可能再次要求登录、验证码或账户选择。

Runtime Key 建议使用 Restricted 权限，只勾选：

```text
Tunnels: Read + Use
```

## 6. 刷新连接器后设置弹窗关闭

ChatGPT 点击连接器的 Refresh 后，设置弹窗可能直接关闭。这不等于刷新失败。重新进入：

```text
Settings → Plugins → WebGPT Luna Standalone
```

核对 `terminal_exec`、`terminal_write_stdin`、`file_create_directory`、`codexluna_start` 等新工具是否出现。

## 7. `doctor` 的连接器 warning

本机 `doctor` 可以证明配置、密钥、Tunnel 和 MCP 运行时健康，但无法证明 ChatGPT 账户侧连接器已绑定。因此下面的 warning 在本地检查中是预期行为：

```text
Local checks cannot prove that ChatGPT connector is attached to this tunnel
```

最终验证必须在普通 ChatGPT 网页对话中调用一个无副作用的工具。例如执行：

```sh
printf 'WEBGPT_LINUX_MCP_OK\n'; uname -s
```

预期结果应包含 stdout、空 stderr、`exit_code: 0` 和 `status: completed`。

## 8. 非阻塞警告

- `vaInitialize failed` 是 Electron/VA-API 硬件视频解码警告，不影响纯 MCP、Tunnel 或 Luna。
- v2.2.11 首次构建出现桌面窗口关联警告；后续源码已加入 `desktopName` 与 `linux.syncDesktopName` 配置。

## 完整诊断顺序

```bash
bun run check-version
bun run typecheck
bun run test
bun run launcher:typecheck
bun run launcher:test
gpt-web-codex doctor --json
```

依次确认：配置有效、私密密钥权限正确、Tunnel Ready、MCP 进程运行，最后再进行 ChatGPT 网页工具调用。
