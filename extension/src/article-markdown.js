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

function cloneArticleBodyChildWithoutEditorUi(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(ARTICLE_EDITOR_UI_SELECTOR).forEach((editorUiElement) => {
    editorUiElement.remove();
  });
  return clone;
}

export function articleBodyChildrenToMarkdown(children) {
  const html = Array.from(children)
    .map((child) => cloneArticleBodyChildWithoutEditorUi(child))
    .filter((child) => !isBlankArticleBodyChild(child))
    .map((child) => child.outerHTML)
    .join("");

  return turndown.turndown(html).trim();
}
