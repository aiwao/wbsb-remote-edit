export function readWbsbArticleFromPage() {
  const MAX_NODES = 3000;
  const MAX_OBJECTS = 5000;
  const REACT_PROPERTY_PATTERN = /^__(reactFiber|reactProps|reactContainer)\$/;

  function readTitle() {
    const titleXPath = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
    const titleElement = document.evaluate(
      titleXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    return titleElement ? titleElement.value.trim() : "";
  }

  function isObject(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  function markdownFromCandidate(candidate) {
    if (!isObject(candidate)) {
      return null;
    }

    const getMarkdown = candidate.storage?.markdown?.getMarkdown;
    if (typeof getMarkdown !== "function") {
      return null;
    }

    try {
      const markdown = getMarkdown();
      return typeof markdown === "string" ? markdown : null;
    } catch {
      return null;
    }
  }

  function enqueue(queue, value) {
    if (isObject(value)) {
      queue.push(value);
    }
  }

  function ownPropertyValues(value) {
    let propertyNames;
    let symbols;
    try {
      propertyNames = Object.getOwnPropertyNames(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch {
      return [];
    }

    return [...propertyNames, ...symbols].flatMap((property) => {
      try {
        return [value[property]];
      } catch {
        return [];
      }
    });
  }

  function findMarkdownFromObjectGraph(seeds) {
    const seen = new WeakSet();
    const queue = seeds.filter(isObject);
    let inspected = 0;

    while (queue.length > 0 && inspected < MAX_OBJECTS) {
      const value = queue.shift();
      if (!isObject(value) || seen.has(value)) {
        continue;
      }

      seen.add(value);
      inspected += 1;

      const markdown = markdownFromCandidate(value);
      if (markdown !== null) {
        return markdown;
      }

      for (const child of ownPropertyValues(value)) {
        enqueue(queue, child);
      }
    }

    return null;
  }

  function reactSeedsFromNode(node) {
    if (!node) {
      return [];
    }

    let propertyNames;
    try {
      propertyNames = Object.getOwnPropertyNames(node);
    } catch {
      return [];
    }

    return propertyNames.flatMap((property) => {
      if (!REACT_PROPERTY_PATTERN.test(property)) {
        return [];
      }

      try {
        return [node[property]];
      } catch {
        return [];
      }
    });
  }

  const editorElement = document.querySelector(".ProseMirror");
  const nodes = Array.from(document.querySelectorAll("*")).slice(0, MAX_NODES);
  const seeds = [
    ...reactSeedsFromNode(document.documentElement),
    ...reactSeedsFromNode(document.body),
    ...nodes.flatMap((node) => reactSeedsFromNode(node)),
    editorElement?.pmViewDesc,
  ];
  const body = findMarkdownFromObjectGraph(seeds);
  const title = readTitle();

  if (body === null) {
    return {
      ok: false,
      title,
    };
  }

  return {
    body,
    ok: true,
    title,
  };
}

export function writeWbsbArticleToPage(article) {
  const MAX_NODES = 3000;
  const MAX_OBJECTS = 5000;
  const ARTICLE_MATCH = "*://wbsb.dev/articles/new";
  const TITLE_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
  const REACT_PROPERTY_PATTERN = /^__(reactFiber|reactProps|reactContainer)\$/;

  function isArticlePage() {
    const location = globalThis.location;
    return (
      (location?.protocol === "http:" || location?.protocol === "https:") &&
      location.hostname === "wbsb.dev" &&
      location.pathname === "/articles/new"
    );
  }

  function readTitleInput() {
    return document.evaluate(TITLE_XPATH, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue;
  }

  function dispatchInputEvent(element, type) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function propertySetter(descriptor) {
    const setter = descriptor ? Reflect.get(descriptor, "set") : null;
    return typeof setter === "function" ? setter : null;
  }

  function setInputValue(input, value) {
    const ownValueSetter = propertySetter(Object.getOwnPropertyDescriptor(input, "value"));
    const prototype = Object.getPrototypeOf(input);
    const prototypeValueSetter = propertySetter(
      Object.getOwnPropertyDescriptor(prototype, "value"),
    );

    if (prototypeValueSetter && prototypeValueSetter !== ownValueSetter) {
      prototypeValueSetter.call(input, value);
    } else if (ownValueSetter) {
      ownValueSetter.call(input, value);
    } else {
      input.value = value;
    }
  }

  function setTitle(title) {
    const titleInput = readTitleInput();
    if (!titleInput || !("value" in titleInput)) {
      throw new Error("title input was not found");
    }

    setInputValue(titleInput, title);
    dispatchInputEvent(titleInput, "input");
    dispatchInputEvent(titleInput, "change");
  }

  function isObject(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  function isLegacyMarkdownEditor(candidate) {
    return (
      typeof candidate?.commands?.setContent === "function" &&
      typeof candidate.storage?.markdown?.getMarkdown === "function" &&
      candidate.storage.markdown.parser
    );
  }

  function isOfficialMarkdownEditor(candidate) {
    return (
      typeof candidate?.commands?.setContent === "function" &&
      (typeof candidate.getMarkdown === "function" || candidate.markdown)
    );
  }

  function enqueue(queue, value) {
    if (isObject(value)) {
      queue.push(value);
    }
  }

  function ownPropertyValues(value) {
    let propertyNames;
    let symbols;
    try {
      propertyNames = Object.getOwnPropertyNames(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch {
      return [];
    }

    return [...propertyNames, ...symbols].flatMap((property) => {
      try {
        return [value[property]];
      } catch {
        return [];
      }
    });
  }

  function findMarkdownEditorFromObjectGraph(seeds) {
    const seen = new WeakSet();
    const queue = seeds.filter(isObject);
    let inspected = 0;

    while (queue.length > 0 && inspected < MAX_OBJECTS) {
      const value = queue.shift();
      if (!isObject(value) || seen.has(value)) {
        continue;
      }

      seen.add(value);
      inspected += 1;

      if (isLegacyMarkdownEditor(value) || isOfficialMarkdownEditor(value)) {
        return value;
      }

      for (const child of ownPropertyValues(value)) {
        enqueue(queue, child);
      }
    }

    return null;
  }

  function reactSeedsFromNode(node) {
    if (!node) {
      return [];
    }

    let propertyNames;
    try {
      propertyNames = Object.getOwnPropertyNames(node);
    } catch {
      return [];
    }

    return propertyNames.flatMap((property) => {
      if (!REACT_PROPERTY_PATTERN.test(property)) {
        return [];
      }

      try {
        return [node[property]];
      } catch {
        return [];
      }
    });
  }

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

  function setEditorMarkdown(editor, body) {
    if (isLegacyMarkdownEditor(editor)) {
      const result = editor.commands.setContent(body, true);
      return {
        ok: result !== false,
        strategy: "tiptap-markdown",
      };
    }

    const result = editor.commands.setContent(body, {
      contentType: "markdown",
      emitUpdate: true,
    });
    return {
      ok: result !== false,
      strategy: "tiptap-markdown-content-type",
    };
  }

  if (!isArticlePage()) {
    return {
      error: `this extension only writes ${ARTICLE_MATCH}`,
      ok: false,
    };
  }

  try {
    const title = article?.title?.trim() || "";
    if (title !== "") {
      setTitle(title);
    }

    const editor = findMarkdownEditorFromObjectGraph(markdownEditorSeeds());
    if (!editor) {
      return {
        error: "could not find WBSB TipTap Markdown editor state",
        ok: false,
      };
    }

    const result = setEditorMarkdown(editor, article?.body || "");
    if (!result.ok) {
      return {
        error: "WBSB TipTap editor rejected Markdown content",
        ok: false,
      };
    }

    return {
      ok: true,
      strategy: result.strategy,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}
