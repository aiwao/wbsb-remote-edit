import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  readWbsbArticleFromPage,
  readWbsbArticleTitleFromPage,
  runWbsbArticlePageAction,
  writeWbsbArticleToPage,
} from "./page-raw-markdown.js";

const originalDocument = globalThis.document;
const originalEvent = globalThis.Event;
const originalLocation = globalThis.location;
const originalXPathResult = globalThis.XPathResult;

function node(properties = {}) {
  return Object.assign({}, properties);
}

function documentWith({ nodes = [], title = "" }) {
  const titleInput = {
    dispatchedEvents: [],
    dispatchEvent(event) {
      this.dispatchedEvents.push(event.type);
      return true;
    },
    value: title,
  };
  const document = {
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
    titleInput,
  };
  return document;
}

function setArticleLocation(pathname = "/articles/new") {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      hostname: "wbsb.dev",
      pathname,
      protocol: "https:",
    },
  });
}

describe("readWbsbArticleFromPage", () => {
  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.Event = originalEvent;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
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

  it("finds raw markdown from the official TipTap Markdown editor API", () => {
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    const tiptapEditor = {
      getMarkdown: () => "official markdown",
    };
    const editorNode = node({ className: "ProseMirror" });
    Object.defineProperty(editorNode, "__reactProps$test", {
      value: {
        editor: tiptapEditor,
      },
    });
    globalThis.document = documentWith({
      nodes: [editorNode],
      title: "Official Markdown",
    });

    expect(runWbsbArticlePageAction("read")).toEqual({
      body: "official markdown",
      ok: true,
      title: "Official Markdown",
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

  it("writes markdown through wbsb's legacy TipTap Markdown extension", () => {
    globalThis.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    setArticleLocation();

    const setContentCalls = [];
    const tiptapEditor = {
      commands: {
        setContent: (markdown, emitUpdate) => {
          setContentCalls.push({ emitUpdate, markdown });
          return true;
        },
      },
      storage: {
        markdown: {
          getMarkdown: () => "",
          parser: {},
        },
      },
    };
    const editorNode = node({ className: "ProseMirror" });
    Object.defineProperty(editorNode, "__reactFiber$test", {
      value: {
        child: {
          memoizedState: tiptapEditor,
        },
      },
    });
    const document = documentWith({
      nodes: [editorNode],
      title: "Old Title",
    });
    globalThis.document = document;

    const result = writeWbsbArticleToPage({
      body: "# Hello\n\n```js\nconsole.log(1)\n```",
      title: " New Title ",
    });

    expect(result).toEqual({
      ok: true,
      strategy: "tiptap-markdown",
    });
    expect(setContentCalls).toEqual([
      {
        emitUpdate: true,
        markdown: "# Hello\n\n```js\nconsole.log(1)\n```",
      },
    ]);
    expect(document.titleInput.value).toBe("New Title");
    expect(document.titleInput.dispatchedEvents).toEqual(["input", "change"]);
  });

  it("writes markdown through the official TipTap Markdown contentType option", () => {
    globalThis.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    setArticleLocation();

    const setContentCalls = [];
    const tiptapEditor = {
      commands: {
        setContent: (markdown, options) => {
          setContentCalls.push({ markdown, options });
          return true;
        },
      },
      getMarkdown: () => "",
    };
    const editorNode = node({ className: "ProseMirror" });
    Object.defineProperty(editorNode, "__reactProps$test", {
      value: {
        editor: tiptapEditor,
      },
    });
    globalThis.document = documentWith({
      nodes: [editorNode],
      title: "",
    });

    const result = writeWbsbArticleToPage({
      body: "official markdown",
      title: "",
    });

    expect(result).toEqual({
      ok: true,
      strategy: "tiptap-markdown-content-type",
    });
    expect(setContentCalls).toEqual([
      {
        markdown: "official markdown",
        options: {
          contentType: "markdown",
          emitUpdate: true,
        },
      },
    ]);
  });

  it("writes markdown on an existing article edit page", () => {
    globalThis.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    setArticleLocation("/articles/article-1/edit");

    const setContentCalls = [];
    const tiptapEditor = {
      commands: {
        setContent: (markdown, options) => {
          setContentCalls.push({ markdown, options });
          return true;
        },
      },
      getMarkdown: () => "",
    };
    const editorNode = node({ className: "ProseMirror" });
    Object.defineProperty(editorNode, "__reactProps$test", {
      value: {
        editor: tiptapEditor,
      },
    });
    globalThis.document = documentWith({
      nodes: [editorNode],
      title: "Existing Title",
    });

    const result = writeWbsbArticleToPage({
      body: "updated markdown",
      title: "",
    });

    expect(result).toEqual({
      ok: true,
      strategy: "tiptap-markdown-content-type",
    });
    expect(setContentCalls).toEqual([
      {
        markdown: "updated markdown",
        options: {
          contentType: "markdown",
          emitUpdate: true,
        },
      },
    ]);
  });

  it("refuses to write outside WBSB article editor pages", () => {
    globalThis.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    setArticleLocation("/articles/article-1");
    globalThis.document = documentWith({
      nodes: [node({ className: "ProseMirror" })],
      title: "",
    });

    expect(writeWbsbArticleToPage({ body: "body", title: "" })).toEqual({
      error:
        "this extension only writes *://wbsb.dev/articles/new* or *://wbsb.dev/articles/*/edit*",
      ok: false,
    });
  });

  it("returns ok false when no writable TipTap editor is visible", () => {
    globalThis.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    globalThis.XPathResult = { FIRST_ORDERED_NODE_TYPE: 9 };
    setArticleLocation();
    globalThis.document = documentWith({
      nodes: [node({ className: "ProseMirror" })],
      title: "",
    });

    expect(writeWbsbArticleToPage({ body: "body", title: "" })).toEqual({
      error: "could not find WBSB TipTap Markdown editor state",
      ok: false,
    });
  });
});
