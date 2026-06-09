# wbsb-remote-edit
[wbsb.dev](https://wbsb.dev)の記事を好きなテキストエディタで書けるようにするツールです。

## CLI: コマンド

全てのコマンドには共通の引数があります。

* `--addr`: `host:port`形式で、立ち上がるブリッジサーバーのアドレス。**デフォルトでは127.0.0.1:8787が使用されます。**
* `--allow-origin`: ブリッジサーバーに接続してよいOrigin。
* `--path`: ブリッジWebsocketサーバーのエンドポイント。**デフォルトでは`/ws`が使用されます。**

### edit

```sh
wbsb-remote-edit edit
```

好きなテキストエディタで記事の編集を開始します。

**引数一覧**

* `--title`: 記事のタイトル。
* `--editor`: 指定するエディタ。**デフォルトでは`$EDITOR`が開かれます。**

### push

```sh
wbsb-remote-edit push README.md
```

ブラウザのエディタにマークダウンを送信します。

**引数一覧**

* `markdown-path`: ブラウザのエディタに送信するマークダウン。**この引数は必須です。**
* `--title`: 記事のタイトル。

### pull

```sh
wbsb-remote-edit pull Article.md
```

ブラウザのエディタから記事を受信します。

**引数一覧**

* `output-path`: 保存先のファイルまたはディレクトリ。**この引数は必須です。**

## CLI: ダウンロード

[Release](https://github.com/aiwao/wbsb-remote-edit/releases/latest)からファイルをダウンロードして展開してください。

**Windowsの場合**

wbsb-remote-edit-cli-<バージョン>-windows-<CPUアーキテクチャ>.zip

**Macの場合**

wbsb-remote-edit-cli-<バージョン>-darwin-<CPUアーキテクチャ>.tar.gz

**Linuxの場合**

wbsb-remote-edit-cli-<バージョン>-linux-<CPUアーキテクチャ>.tar.gz

## ブラウザ拡張: 機能

### Endpoint 入力欄

このEndpointをブリッジサーバーとします。

### Auto connect スイッチ

このスイッチがオンの間、`Endpoint入力欄`で指定されたブリッジサーバーに接続し続けます。

## ブラウザ拡張: インストール

[Release](https://github.com/aiwao/wbsb-remote-edit/releases/latest)からファイルをダウンロードしてインストールしてください。

**Chromeの場合**

wbsb-remote-edit-chrome-<バージョン>.zip

**Firefoxの場合**

wbsb-remote-edit-firefox-<バージョン>.xpi

## 開発: 環境構築

`nix develop`または[nix-direnv](https://github.com/nix-community/nix-direnv)

## 開発: ビルド

```sh
nix build .# -o build/
```
