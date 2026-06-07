export function readWbsbArticleTitleFromPage() {
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

  if (body === null) {
    return {
      ok: false,
      title: readTitle(),
    };
  }

  return {
    body,
    ok: true,
    title: readTitle(),
  };
}
