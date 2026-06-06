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

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});
turndown.escape = (text) => text;

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

export function articleBodyChildrenToMarkdown(children) {
  const html = Array.from(children)
    .filter((child) => !isBlankArticleBodyChild(child))
    .map((child) => child.outerHTML)
    .join("");

  return turndown.turndown(html).trim();
}
