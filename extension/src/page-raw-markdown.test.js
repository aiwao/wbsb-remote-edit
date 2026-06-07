import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readWbsbArticleFromPage,
  readWbsbArticleTitleFromPage,
} from "./page-raw-markdown.js";

const originalDocument = globalThis.document;
const originalXPathResult = globalThis.XPathResult;

function node(properties = {}) {
  return Object.assign({}, properties);
}

function documentWith({ nodes = [], title = "" }) {
  const titleInput = { value: title };
  return {
    body: node(),
    documentElement: node(),
    evaluate() {
      return {
        singleNodeValue: titleInput,
      };
    },
    querySelector(selector) {
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
    globalThis.XPathResult = originalXPathResult;
  });

  it("reads only the article title from the title XPath", () => {
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    globalThis.document = documentWith({
      nodes: [],
      title: "Title Only",
    });

    expect(readWbsbArticleTitleFromPage()).toBe("Title Only");
  });

  it("finds raw markdown from a TipTap editor inside a React object graph", () => {
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
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
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
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
