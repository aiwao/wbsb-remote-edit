import TurndownService from "turndown";

const ARTICLE_MATCH = "*://wbsb.dev/articles/new";
const TITLE_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
const BODY_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[5]/div/div";

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

function runtimeApi() {
  return globalThis.browser?.runtime || globalThis.chrome?.runtime;
}

function isArticlePage() {
  return (
    (window.location.protocol === "http:" || window.location.protocol === "https:") &&
    window.location.hostname === "wbsb.dev" &&
    window.location.pathname === "/articles/new"
  );
}

function firstXPathNode(xpath) {
  return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
    .singleNodeValue;
}

function readTitle() {
  const titleElement = firstXPathNode(TITLE_XPATH);
  if (!(titleElement instanceof HTMLInputElement)) {
    throw new Error(`title input was not found at ${TITLE_XPATH}`);
  }

  return titleElement.value.trim();
}

function readBody() {
  const bodyElement = firstXPathNode(BODY_XPATH);
  if (!(bodyElement instanceof Element)) {
    throw new Error(`body element was not found at ${BODY_XPATH}`);
  }

  const html = Array.from(bodyElement.children)
    .map((child) => child.outerHTML)
    .join("\n");
  return turndown.turndown(html).trim();
}

function readArticle() {
  if (!isArticlePage()) {
    throw new Error(`this extension only reads ${ARTICLE_MATCH}`);
  }

  return {
    body: readBody(),
    title: readTitle(),
  };
}

runtimeApi()?.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "read_wbsb_article") {
    return false;
  }

  try {
    sendResponse({
      article: readArticle(),
      ok: true,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    });
  }

  return false;
});
