export function runWbsbArticlePageAction(action, article) {
  const MAX_NODES = 3000;
  const MAX_OBJECTS = 5000;
  const ARTICLE_MATCH = "*://wbsb.dev/articles/new* or *://wbsb.dev/articles/*/edit*";
  const EDIT_ARTICLE_PATH_PATTERN = /^\/articles\/[^/]+\/edit$/;
  const TITLE_INPUT_SELECTORS = [
    'input[aria-label="タイトル"]',
    'input[placeholder="Title" i]',
    'input[name="title" i]',
    'input[id="title" i]',
    'input[maxlength="70"]',
  ];
  const REACT_PROPERTY_PATTERN = /^__(reactFiber|reactProps|reactContainer)\$/;
  const NOT_FOUND = Symbol("not found");

  function isArticlePage() {
    const location = globalThis.location;
    return (
      (location?.protocol === "http:" || location?.protocol === "https:") &&
      location.hostname === "wbsb.dev" &&
      (location.pathname === "/articles/new" || EDIT_ARTICLE_PATH_PATTERN.test(location.pathname))
    );
  }

  function readTitleInput() {
    for (const selector of TITLE_INPUT_SELECTORS) {
      const input = document.querySelector(selector);
      if (isTitleInput(input)) {
        return input;
      }
    }

    return Array.from(document.querySelectorAll("input")).find(isTitleInput) || null;
  }

  function attributeValue(element, name) {
    try {
      return element?.getAttribute?.(name) || "";
    } catch {
      return "";
    }
  }

  function fieldValue(element, name) {
    try {
      const value = element?.[name];
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    } catch {
      return "";
    }
  }

  function normalizedInputType(input) {
    return (attributeValue(input, "type") || fieldValue(input, "type") || "text").toLowerCase();
  }

  function normalizedInputName(input, attributeName, propertyName = attributeName) {
    return (attributeValue(input, attributeName) || fieldValue(input, propertyName))
      .trim()
      .toLowerCase();
  }

  function isTitleInput(input) {
    if (!input || !("value" in input)) {
      return false;
    }

    const type = normalizedInputType(input);
    if (type !== "text" && type !== "") {
      return false;
    }

    const ariaLabel = normalizedInputName(input, "aria-label", "ariaLabel");
    const placeholder = normalizedInputName(input, "placeholder");
    const name = normalizedInputName(input, "name");
    const id = normalizedInputName(input, "id");
    const maxLength = normalizedInputName(input, "maxlength", "maxLength");

    return (
      ariaLabel === "タイトル" ||
      placeholder === "title" ||
      name === "title" ||
      id === "title" ||
      maxLength === "70"
    );
  }

  function readTitle() {
    const titleElement = readTitleInput();
    return titleElement && "value" in titleElement ? titleElement.value.trim() : "";
  }

  function isObject(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  function markdownFromCandidate(candidate) {
    if (!isObject(candidate)) {
      return null;
    }

    const readers = [];
    try {
      const markdownStorage = candidate.storage?.markdown;
      readers.push([markdownStorage?.getMarkdown, markdownStorage]);
    } catch {
      // Ignore inaccessible framework internals.
    }
    try {
      readers.push([candidate.getMarkdown, candidate]);
    } catch {
      // Ignore inaccessible framework internals.
    }

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

    return null;
  }

  function enqueue(queue, value) {
    if (isObject(value)) {
      queue.push(value);
    }
  }

  function ownKeys(value) {
    try {
      return Reflect.ownKeys(value);
    } catch {
      return [];
    }
  }

  function enqueueOwnPropertyValues(queue, value) {
    for (const property of ownKeys(value)) {
      try {
        enqueue(queue, value[property]);
      } catch {
        // Ignore getters that throw while walking React/editor internals.
      }
    }
  }

  function findFromObjectGraph(seeds, match) {
    const seen = new WeakSet();
    const queue = seeds.filter(isObject);
    let cursor = 0;
    let inspected = 0;

    while (cursor < queue.length && inspected < MAX_OBJECTS) {
      const value = queue[cursor];
      cursor += 1;

      if (!isObject(value) || seen.has(value)) {
        continue;
      }

      seen.add(value);
      inspected += 1;

      const result = match(value);
      if (result !== NOT_FOUND) {
        return result;
      }

      enqueueOwnPropertyValues(queue, value);
    }

    return null;
  }

  function reactSeedsFromNode(node) {
    if (!node) {
      return [];
    }

    return ownKeys(node).flatMap((property) => {
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

  function findMarkdownFromObjectGraph(seeds) {
    return findFromObjectGraph(seeds, (value) => {
      const markdown = markdownFromCandidate(value);
      return markdown === null ? NOT_FOUND : markdown;
    });
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

  function isLegacyMarkdownEditor(candidate) {
    try {
      return (
        typeof candidate?.commands?.setContent === "function" &&
        typeof candidate.storage?.markdown?.getMarkdown === "function" &&
        candidate.storage.markdown.parser
      );
    } catch {
      return false;
    }
  }

  function isOfficialMarkdownEditor(candidate) {
    try {
      return (
        typeof candidate?.commands?.setContent === "function" &&
        (typeof candidate.getMarkdown === "function" || candidate.markdown)
      );
    } catch {
      return false;
    }
  }

  function findMarkdownEditorFromObjectGraph(seeds) {
    return findFromObjectGraph(seeds, (value) => {
      if (isLegacyMarkdownEditor(value) || isOfficialMarkdownEditor(value)) {
        return value;
      }
      return NOT_FOUND;
    });
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

  function readArticle() {
    const body = findMarkdownFromObjectGraph(markdownEditorSeeds());
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

  function writeArticle(targetArticle) {
    if (!isArticlePage()) {
      return {
        error: `this extension only writes ${ARTICLE_MATCH}`,
        ok: false,
      };
    }

    try {
      const title = targetArticle?.title?.trim() || "";
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

      const result = setEditorMarkdown(editor, targetArticle?.body || "");
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

  if (action === "read") {
    return readArticle();
  }
  if (action === "title") {
    return readTitle();
  }
  if (action === "write") {
    return writeArticle(article);
  }

  return {
    error: `unknown WBSB page action: ${String(action)}`,
    ok: false,
  };
}

export function readWbsbArticleFromPage() {
  return runWbsbArticlePageAction("read");
}

export function readWbsbArticleTitleFromPage() {
  return runWbsbArticlePageAction("title");
}

export function writeWbsbArticleToPage(article) {
  return runWbsbArticlePageAction("write", article);
}
