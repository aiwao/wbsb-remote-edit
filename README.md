# Remote Edit Bridge

Browser extension popup and a Go/Cobra CLI communicate over WebSocket. The Vue/Vite+ extension lives in `extension/` and builds to `extension/dist/`.

The CLI sends:

```json
{ "type": "edit", "title": "Draft", "body": "Text written in the editor", "from": "cli" }
```

Before opening the editor, the CLI requests the current article from the extension:

```json
{ "type": "get_wbsb_article", "from": "cli" }
```

The CLI can also request only the current article title:

```json
{ "type": "get_wbsb_article_title", "from": "cli" }
```

The Vue extension reads `get_wbsb_article` and `get_wbsb_article_title` only from `*://wbsb.dev/articles/new`. It takes the title from the article title input and reads the article body from wbsb's TipTap Markdown state only for `get_wbsb_article`.

## Run the CLI

```sh
nix develop --command go run ./cmd/wbsb-remote-edit edit --title "Draft"
nix develop --command go run ./cmd/wbsb-remote-edit send ./draft.md --title "Draft"
```

## Build with Nix

```sh
mkdir -p build
nix build .# -o build/release
nix build .#wbsb-remote-edit -o build/cli
nix build .#wbsb-remote-edit-extension -o build/extension
```

The default build includes the CLI at `build/release/bin/wbsb-remote-edit` and the browser extension at `build/release/extension`. The project version is defined once in `flake.nix`.

## Release Workflow

The manual GitHub Actions release workflow reads the version from `nix run .#version`, refuses to continue if `v<version>` already exists, builds with Nix, packages CLI binaries for Linux, macOS, and Windows on amd64 and arm64, packages Chrome ZIP and Firefox signed XPI extensions, then creates the GitHub Release using a GitHub App token. It expects these repository secrets: `RELEASE_APP_ID`, `RELEASE_APP_PRIVATE_KEY`, `AMO_JWT_ISSUER`, and `AMO_JWT_SECRET`. The GitHub App must be installed on the repository with contents write access, and the AMO secrets are the addons.mozilla.org JWT issuer and JWT secret used by `web-ext sign`. If the Firefox extension version already exists on AMO, signing is skipped via `nix run .#amo-version-exists`.

Defaults:

- WebSocket endpoint: `ws://127.0.0.1:8787/ws`
- Browser extension origins: `chrome-extension://...` and `moz-extension://...` are accepted
- Local dev origins: `http://localhost`, `http://127.0.0.1`, and loopback IPs are accepted

The command starts the local WebSocket server, waits for the extension to connect, requests the current article, opens `$EDITOR` with the returned body, and sends the title plus the saved editor content to the extension after the editor exits. The extension acknowledges the received edit after displaying it, then the CLI shuts down the WebSocket server. Use `--editor` to override `$EDITOR`. Use `--title` to override the article title returned by the extension.

Use `send <markdown-path>` to send an existing Markdown file without opening an editor. If `--title` is omitted, `send` requests the current article title from the extension and sends that title with the file body.

## Build the Vue Extension

```sh
nix develop --command sh -lc 'cd extension && pnpm run build'
```

Validate the built Manifest V3 extension with:

```sh
nix develop --command web-ext lint --source-dir extension/dist
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/dist/` directory in this repository.
5. Open the extension popup and connect.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on.
3. Select `extension/dist/manifest.json` in this repository.
4. Open the extension popup and connect.

## Browser Compatibility Notes

- The extension uses Manifest V3 and avoids browser-specific JavaScript APIs in the popup.
- The content script and host permission are limited to `*://wbsb.dev/articles/new`.
- The explicit `content_security_policy` allows `ws://localhost:*` and `ws://127.0.0.1:*`, which keeps Firefox from upgrading the local WebSocket endpoint to `wss://`.

## Useful Commands

```sh
nix develop --command go test ./...
nix develop --command go run ./cmd/wbsb-remote-edit edit --title "Draft" --addr 127.0.0.1:8787
nix develop --command go run ./cmd/wbsb-remote-edit send ./draft.md --title "Draft"
nix develop --command sh -lc 'cd extension && pnpm run build'
nix develop --command web-ext lint --source-dir extension/dist
```
