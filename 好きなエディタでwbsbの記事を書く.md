[https://x.com/Comamoca\_/status/2063108384690438620?s=20](https://x.com/Comamoca%5C_/status/2063108384690438620?s=20)

> とりあえずログインしてみたけど、現状投稿方法がブラウザのみだから何らかテキストエディタで書いたものを投稿できるようになって欲しい感がある(日頃からEmacsで記事を書いているため)
>
> こまもか🦊 (@Comamoca\_)

こfwaorgjwaのポストをきっかけに作ってみたので紹介します。

## 使い方

<https://github.com/aiwao/wbsb-remote-edit/releases/latest>

1. リンクからCLIと拡張機能をダウンロードして、拡張機能をブラウザにインストール。
2. wbsb.devを開く。
3. ブラウザ拡張のポップアップを開き、`Auto connect`スイッチをオンにする。
4. CLIで`edit`コマンドを実行

ブラウザ拡張とCLIが両方ともブリッジサーバーに接続した時点で使用できるようになります。

コマンド一覧はリポジトリのREADMEまたはCLIの`help`コマンドから確認してください。

## 動作の流れ

![mermaid-diagram-2026-06-08T14-14-39.png](/api/article-images?key=article-images%2FwbsGjIAbrhz35Tf3jRGIV0QLgumxUR5Z%2F1780999209560-mermaid-diagram-2026-06-08T14-14-39.png.png)

流れはシンプルで、ブリッジサーバーを立てて、それを介して記事情報をやりとりしています。

## 技術的な概要

**記事情報の取得**

記事タイトルはシンプルに、タイトルのinputのvalueから取得しています。

記事本文は、元々、ページがMarkdownをHTMLに変換したものを[turndown](https://github.com/mixmark-io/turndown)でMarkdownに戻すということをやっていて、ある程度正常に変換できていたのですが、動作が不安定に感じたので、生のMarkdownを取得するように変更しました。

生のMarkdownを取得するのが面倒くさくて、Reactに隠れているエディタの状態を探索する必要がありました。

探索とは具体的にどういう処理かと言うと、

---

1. エディタ(ProseMirror)のMarkdown APIを探す

Reactの内部のオブジェクトグラフを辿り、APIの候補を探す。

```javascript
function markdownEditorSeeds() {
  const editorElement = document.querySelector(".ProseMirror");
  const nodes = Array.from(document.querySelectorAll("*")).slice(0, MAX_NODES);
  return [
    ...reactSeedsFromNode(document.documentElement),
    ...reactSeedsFromNode(document.body),
    ...nodes.flatMap((node) => reactSeedsFromNode(node)),
    editorElement?.pmViewDesc,
  ];
}
```

ReactがDOMノードに持っている内部プロパティを`seed`として使う。

```javascript
const REACT_PROPERTY_PATTERN = /^__(reactFiber|reactProps|reactContainer)\$/;

function reactSeedsFromNode(node) {
  return Reflect.ownKeys(node).flatMap((property) => {
    if (typeof property !== "string" || !REACT_PROPERTY_PATTERN.test(property)) {
      return [];
    }

    try {
      return [node[property]];
    } catch {
      return [];
    }
  });
}
```

---

2. それがMarkdown APIかどうかを確かめる。

候補のオブジェクトに対して、次の二種類のAPIを試す。

```javascript
const markdownStorage = candidate.storage?.markdown;
readers.push([markdownStorage?.getMarkdown, markdownStorage]);

readers.push([candidate.getMarkdown, candidate]);
```

`getMarkdown()`が関数として存在するならそれを呼び出し、文字列が返ればそれを記事本文のMarkdownとして使う。

```javascript
for (const [getMarkdown, receiver] of readers) {
  if (typeof getMarkdown !== "function") {
    continue;
  }

  try {
    const markdown = getMarkdown.call(receiver);
    if (typeof markdown === "string") {
      return markdown;
    }
  } catch {
    // Keep searching other visible TipTap editor objects.
  }
}
```

---

と、かなりまわりくどいことをしています。

## 最後に

正直、このツールでやっていることは、テキストエディタで書いたMarkdownをwbsbのエディタにコピペするだけでいいので、存在価値は低いです。

<https://x.com/imaimai17468/status/2063110224417059119?s=20>

> wbsb.dev/info/roadmapに多少書いたのですが、リポジトリとかCLIの対応予定はありません🙇 記事はサイトで書けばいいじゃん＆コピペすればいいじゃんがあり、作る労力に対してあまり効果が見合わないなと思っています 現状のWebエディタで不足していることや、そもコピペできないぜがあれば喜んで修正するので、教えてください 🙇
>
> 🐸いまいまい🐌 (@imaimai17468)

興味をもっていただけた方は、ぜひ、使ってみてください。
