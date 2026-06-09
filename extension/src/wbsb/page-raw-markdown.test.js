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

function node(properties = {}) {
  return Object.assign({}, properties);
}

function documentWith({ nodes = [], title = "", titleAttributes = {} }) {
  const attributes = {
    "aria-label": "タイトル",
    maxlength: "70",
    placeholder: "Title",
    type: "text",
    ...titleAttributes,
  };
  const titleInput = {
    ariaLabel: attributes["aria-label"],
    dispatchedEvents: [],
    dispatchEvent(event) {
      this.dispatchedEvents.push(event.type);
      return true;
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    id: attributes.id || "",
    maxLength: Number(attributes.maxlength || 0),
    name: attributes.name || "",
    placeholder: attributes.placeholder || "",
    type: attributes.type || "text",
    value: title,
  };
  const document = {
    body: node(),
    documentElement: node(),
    querySelector(selector) {
      if (selector === ".ProseMirror") {
        return nodes.find((node) => node.className === "ProseMirror") || null;
      }
      if (
        selector === 'input[aria-label="タイトル"]' &&
        titleInput.getAttribute("aria-label") === "タイトル"
      ) {
        return titleInput;
      }
      if (
        selector === 'input[placeholder="Title" i]' &&
        titleInput.placeholder.toLowerCase() === "title"
      ) {
        return titleInput;
      }
      if (selector === 'input[name="title" i]' && titleInput.name.toLowerCase() === "title") {
        return titleInput;
      }
      if (selector === 'input[id="title" i]' && titleInput.id.toLowerCase() === "title") {
        return titleInput;
      }
      if (selector === 'input[maxlength="70"]' && titleInput.getAttribute("maxlength") === "70") {
        return titleInput;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "input") {
        return [titleInput];
      }
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
  });

  it("reads only the article title from the semantic title input", () => {
    globalThis.document = documentWith({
      nodes: [],
      title: "Title Only",
    });

    expect(readWbsbArticleTitleFromPage()).toBe("Title Only");
  });

  it("reads the article title from the placeholder when the aria label changes", () => {
    globalThis.document = documentWith({
      nodes: [],
      title: "Placeholder Title",
      titleAttributes: {
        "aria-label": "",
      },
    });

    expect(readWbsbArticleTitleFromPage()).toBe("Placeholder Title");
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

  it("finds raw markdown from the official TipTap Markdown editor API", () => {
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
