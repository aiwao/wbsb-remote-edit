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

## Load the Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` directory in this repository.
5. Open the extension popup, connect, enter a name, and send.

## Useful Commands

```sh
nix develop --command go test ./...
nix develop --command go run ./cmd/greet-ws serve --addr 127.0.0.1:8787
```
