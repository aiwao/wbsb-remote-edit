# wbsb-remote-edit

A tool that lets you write articles for [wbsb.dev](https://wbsb.dev) in your favorite text editor.

## CLI: Commands

All commands share the following options.

* `--addr`: The address of the bridge server to start, in `host:port` format. **By default, `127.0.0.1:8787` is used.**
* `--allow-origin`: Origins that are allowed to connect to the bridge server.
* `--path`: The endpoint path for the bridge WebSocket server. **By default, `/ws` is used.**

### edit

```sh
wbsb-remote-edit edit
```

Start editing an article in your favorite text editor.

**Options**

* `--title`: The article title.
* `--editor`: The editor to use. **By default, `$EDITOR` is opened.**
* `--file`: The Markdown file to use as the editor initial body.

### push

```sh
wbsb-remote-edit push README.md
```

Send Markdown to the browser editor.

**Arguments**

* `markdown-path`: The Markdown file to send to the browser editor. **This argument is required.**
* `--title`: The article title.

### pull

```sh
wbsb-remote-edit pull Article.md
```

Receive an article from the browser editor.

**Arguments**

* `output-path`: The destination file or directory. **This argument is required.**

## CLI: Download

Download and extract the file from [Release](https://github.com/aiwao/wbsb-remote-edit/releases/latest).

**For Windows**

wbsb-remote-edit-cli-<version>-windows-<CPU architecture>.zip

**For Mac**

wbsb-remote-edit-cli-<version>-darwin-<CPU architecture>.tar.gz

**For Linux**

wbsb-remote-edit-cli-<version>-linux-<CPU architecture>.tar.gz

## Browser Extension: Features

### Endpoint Input

This endpoint is used as the bridge server.

### Auto Connect Switch

While this switch is on, the extension keeps connecting to the bridge server specified in the `Endpoint input`.

## Browser Extension: Installation

Download and install the file from [Release](https://github.com/aiwao/wbsb-remote-edit/releases/latest).

**For Chrome**

wbsb-remote-edit-chrome-<version>.zip

**For Firefox**

wbsb-remote-edit-firefox-<version>.xpi

## Development: Environment Setup

`nix develop` or [nix-direnv](https://github.com/nix-community/nix-direnv)

## Development: Build

```sh
nix build .# -o build/
```
