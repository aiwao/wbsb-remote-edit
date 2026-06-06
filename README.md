# Greet WebSocket Bridge

Browser extension popup and a Go/Cobra CLI communicate over WebSocket.

The extension sends:

```json
{ "type": "greet", "name": "Ada" }
```

The CLI replies:

```json
{ "type": "greet", "name": "Ada", "greeting": "Hello, Ada!", "from": "cli" }
```

The CLI can also broadcast greetings back to connected extension popups from standard input.

## Run the CLI

```sh
nix develop --command go run ./cmd/greet-ws serve
```

Defaults:

- WebSocket endpoint: `ws://127.0.0.1:8787/ws`
- Browser extension origins: `chrome-extension://...` and `moz-extension://...` are accepted
- Local dev origins: `http://localhost`, `http://127.0.0.1`, and loopback IPs are accepted

Type a name into the running CLI and press Enter to broadcast a greeting to connected extension popups.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` directory in this repository.
5. Open the extension popup, connect, enter a name, and send.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on.
3. Select `extension/manifest.json` in this repository.
4. Open the extension popup, connect, enter a name, and send.

## Browser Compatibility Notes

- The extension uses Manifest V3 and avoids browser-specific JavaScript APIs in the popup.
- `host_permissions` uses portless localhost match patterns so the same manifest works in Chrome and Firefox.
- The explicit `content_security_policy` allows `ws://localhost:*` and `ws://127.0.0.1:*`, which keeps Firefox from upgrading the local WebSocket endpoint to `wss://`.

## Useful Commands

```sh
nix develop --command go test ./...
nix develop --command go run ./cmd/greet-ws serve --addr 127.0.0.1:8787
```
