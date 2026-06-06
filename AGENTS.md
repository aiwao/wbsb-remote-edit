# AGENTS.md

## Project Specification

- This project is a local remote-edit bridge between a Go/Cobra CLI and a Manifest V3 browser extension popup over WebSocket.
- The CLI entrypoint is `./cmd/wbsb-remote-edit`, and the user-facing command is:

```sh
nix develop --command go run ./cmd/wbsb-remote-edit edit
```

- `edit` has no positional arguments. Use `--title` to override the article title. If `--title` is not set, the CLI uses the title returned by `get_wbsb_article`.
- `edit` starts the local WebSocket server, waits for a browser extension connection, sends a `get_wbsb_article` request, opens `$EDITOR` with the returned article body, then sends the edited body back to the extension as an `edit` message.
- Use `--editor` to override `$EDITOR`. The editor temp file should use the final title in the pattern `{title}-*.md`; unsafe filename characters should be sanitized before calling `os.CreateTemp`.
- The WebSocket endpoint defaults to `ws://127.0.0.1:8787/ws`.
- Message bodies are represented only by `body`. Do not reintroduce a separate `content` field.

### WebSocket Messages

- CLI requests the current article:

```json
{ "type": "get_wbsb_article", "id": "article-1", "from": "cli" }
```

- Extension replies with the article:

```json
{ "type": "wbsb_article", "id": "article-1", "title": "ABCDEFG", "body": "abcdefghijklmnopqrstuvwxyz\n\n\nabcdefghijklmnopqrstuvwxyz", "from": "extension" }
```

- CLI sends the edited article:

```json
{ "type": "edit", "id": "edit-1", "title": "ABCDEFG", "body": "edited markdown", "from": "cli" }
```

- Extension acknowledges displayed edits:

```json
{ "type": "ack", "id": "edit-1" }
```

- The CLI should wait for the `ack` after sending `edit`, then shut down the WebSocket server.

### Browser Extension Behavior

- The popup has a single auto-connect switch. While it is on, the popup should keep trying to connect to the configured WebSocket endpoint.
- Endpoint and auto-connect state are stored in `localStorage` for popup convenience.
- For now, `get_wbsb_article` returns debug data:

```json
{ "title": "ABCDEFG", "body": "abcdefghijklmnopqrstuvwxyz\n\n\nabcdefghijklmnopqrstuvwxyz" }
```

### Go Checks

- When changing Go code, run:

```sh
nix develop --command go test ./...
```

## Browser Extension Checks

- Use the Nix dev shell for extension tooling.
- When changing files under `extension/`, run:

```sh
nix develop --command web-ext lint --source-dir extension
```

- Keep the extension compatible with both Chrome and Firefox. The shared Manifest V3 file should continue to pass `web-ext lint` with zero errors, warnings, and notices.
