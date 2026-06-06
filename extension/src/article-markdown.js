import TurndownService from "turndown";

const TEXTLESS_MARKDOWN_SELECTOR = [
  "audio",
  "canvas",
  "code",
  "hr",
  "iframe",
  "img",
  "math",
  "ol",
  "picture",
  "pre",
  "svg",
  "table",
  "ul",
  "video",
].join(",");
const ARTICLE_EDITOR_UI_SELECTOR = "select";
const BLANK_LINE_MARKER_ATTRIBUTE = "data-wbsb-blank-line";
const BLANK_LINE_MARKER_HTML = `<p ${BLANK_LINE_MARKER_ATTRIBUTE}="true">x</p>`;

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});
turndown.escape = (text) => text;
turndown.addRule("wbsbParagraph", {
  filter: "p",
  replacement(content, node) {
    if (node.parentNode?.nodeName === "LI") {
      return content;
    }

    return content ? `\n${content}\n` : "";
  },
});
turndown.addRule("wbsbList", {
  filter: ["ul", "ol"],
  replacement(content, node) {
    const parent = node.parentNode;
    if (parent?.nodeName === "LI" && parent.lastElementChild === node) {
      return `\n${content}`;
    }

    return content ? `\n${content}\n` : "";
  },
});
turndown.addRule("wbsbListItem", {
  filter: "li",
  replacement(content, node, options) {
    let prefix = `${options.bulletListMarker} `;
    const parent = node.parentNode;
    if (parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }

    const itemContent = content
      .replace(/^\n+|\n+$/g, "")
      .replace(/\n/gm, `\n${" ".repeat(prefix.length)}`);

    return `${prefix}${itemContent}${node.nextSibling ? "\n" : ""}`;
  },
});
turndown.addRule("wbsbBlankLine", {
  filter(node) {
    return node.getAttribute(BLANK_LINE_MARKER_ATTRIBUTE) === "true";
  },
  replacement() {
    return "\n\n";
  },
});

function normalizedTextContent(element) {
  return (element.textContent || "").replace(/\u00a0/g, " ").trim();
}

function hasTextlessMarkdownElement(element) {
  return (
    element.matches(TEXTLESS_MARKDOWN_SELECTOR) ||
    Boolean(element.querySelector(TEXTLESS_MARKDOWN_SELECTOR))
  );
}

function isBlankArticleBodyChild(element) {
  return normalizedTextContent(element) === "" && !hasTextlessMarkdownElement(element);
}

function isBlankLineParagraph(element) {
  return (
    element.matches("p") &&
    normalizedTextContent(element) === "" &&
    Boolean(element.querySelector("br")) &&
    !hasTextlessMarkdownElement(element)
  );
}

function isListElement(element) {
  return element.matches("ul,ol");
}

function previousNonBlankArticleBodyChild(children, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!isBlankArticleBodyChild(children[cursor])) {
      return children[cursor];
    }
  }
  return null;
}

function hasLaterNonBlankArticleBodyChild(children, index) {
  return children.slice(index + 1).some((child) => !isBlankArticleBodyChild(child));
}

function shouldPreserveBlankLineAfterList(children, index) {
  if (
    !isBlankLineParagraph(children[index]) ||
    !hasLaterNonBlankArticleBodyChild(children, index)
  ) {
    return false;
  }

  const previousChild = previousNonBlankArticleBodyChild(children, index);
  return Boolean(previousChild && isListElement(previousChild));
}

function cloneArticleBodyChildWithoutEditorUi(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(ARTICLE_EDITOR_UI_SELECTOR).forEach((editorUiElement) => {
    editorUiElement.remove();
  });
  return clone;
}

function articleBodyChildHtml(child, index, children) {
  if (shouldPreserveBlankLineAfterList(children, index)) {
    return BLANK_LINE_MARKER_HTML;
  }

  if (isBlankArticleBodyChild(child)) {
    return "";
  }

  return child.outerHTML;
}

export function articleBodyChildrenToMarkdown(children) {
  const normalizedChildren = Array.from(children).map((child) =>
    cloneArticleBodyChildWithoutEditorUi(child),
  );
  const html = normalizedChildren
    .map((child, index) => articleBodyChildHtml(child, index, normalizedChildren))
    .join("");

  return turndown.turndown(html).trim();
}
