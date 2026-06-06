# Remote Edit Bridge

Browser extension popup and a Go/Cobra CLI communicate over WebSocket.

The CLI sends:

```json
{ "type": "edit", "title": "Draft", "content": "Text written in the editor", "from": "cli" }
```

Before opening the editor, the CLI requests the current article from the extension:

```json
{ "type": "get_wbsb_article", "from": "cli" }
```

## Run the CLI

```sh
nix develop --command go run ./cmd/wbsb-remote-edit edit --title "Draft"
```

Defaults:

- WebSocket endpoint: `ws://127.0.0.1:8787/ws`
- Browser extension origins: `chrome-extension://...` and `moz-extension://...` are accepted
- Local dev origins: `http://localhost`, `http://127.0.0.1`, and loopback IPs are accepted

The command starts the local WebSocket server, waits for the extension to connect, requests the current article, opens `$EDITOR` with the returned body, and sends the title plus the saved editor content to the extension after the editor exits. The extension acknowledges the received edit after displaying it, then the CLI shuts down the WebSocket server. Use `--editor` to override `$EDITOR`. Use `--title` to override the article title returned by the extension.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` directory in this repository.
5. Open the extension popup and connect.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on.
3. Select `extension/manifest.json` in this repository.
4. Open the extension popup and connect.

## Browser Compatibility Notes

- The extension uses Manifest V3 and avoids browser-specific JavaScript APIs in the popup.
- `host_permissions` uses portless localhost match patterns so the same manifest works in Chrome and Firefox.
- The explicit `content_security_policy` allows `ws://localhost:*` and `ws://127.0.0.1:*`, which keeps Firefox from upgrading the local WebSocket endpoint to `wss://`.

## Useful Commands

```sh
nix develop --command go test ./...
nix develop --command go run ./cmd/wbsb-remote-edit edit --title "Draft" --addr 127.0.0.1:8787
```
