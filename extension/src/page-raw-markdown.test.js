import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readWbsbArticleFromPage,
  readWbsbArticleTitleFromPage,
} from "./page-raw-markdown.js";

const originalDocument = globalThis.document;

function node(properties = {}) {
  return Object.assign({}, properties);
}

function documentWith({ nodes = [], title = "" }) {
  const titleInput = { value: title };
  return {
    body: node(),
    documentElement: node(),
    querySelector(selector) {
      if (selector === 'input[aria-label="タイトル"]') {
        return titleInput;
      }
      if (selector === ".ProseMirror") {
        return nodes.find((node) => node.className === "ProseMirror") || null;
      }
      return null;
    },
    querySelectorAll() {
      return nodes;
    },
  };
}

describe("readWbsbArticleFromPage", () => {
  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it("reads only the article title from the title input", () => {
    globalThis.document = documentWith({
      nodes: [],
      title: "Title Only",
    });

    expect(readWbsbArticleTitleFromPage()).toBe("Title Only");
  });

  it("finds raw markdown from a TipTap editor inside a React object graph", () => {
    const tiptapEditor = {
      storage: {
        markdown: {
          getMarkdown: () => "- first\n\nnext",
        },
      },
    };
    const editorNode = node({ className: "ProseMirror" });
    Object.defineProperty(editorNode, "__reactFiber$test", {
      value: {
        child: {
          memoizedState: {
            next: {
              memoizedState: tiptapEditor,
            },
          },
        },
      },
    });
    globalThis.document = documentWith({
      nodes: [editorNode],
      title: "Raw Markdown",
    });

    expect(readWbsbArticleFromPage()).toEqual({
      body: "- first\n\nnext",
      ok: true,
      title: "Raw Markdown",
    });
  });

  it("returns ok false when no TipTap markdown storage is visible", () => {
    globalThis.document = documentWith({
      nodes: [node({ className: "ProseMirror" })],
      title: "Fallback",
    });

    expect(readWbsbArticleFromPage()).toEqual({
      ok: false,
      title: "Fallback",
    });
  });
});
