import TurndownService from "turndown";

const ARTICLE_MATCH = "*://wbsb.dev/articles/new";
const TITLE_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
const BODY_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[5]/div/div";
const BODY_EDITOR_SELECTOR = '[contenteditable="true"][aria-label="記事本文"]';
const LISTENER_INSTALLED_KEY = "__remoteEditBridgeContentListenerInstalled";

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

function nodeDescription(node) {
  if (!node) {
    return "null";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return node.nodeName;
  }
  return `<${node.localName}>`;
}

function readTitle() {
  const titleElement = firstXPathNode(TITLE_XPATH);
  if (
    !titleElement ||
    titleElement.nodeType !== Node.ELEMENT_NODE ||
    titleElement.localName !== "input" ||
    !("value" in titleElement)
  ) {
    throw new Error(
      `title input was not found at ${TITLE_XPATH}; got ${nodeDescription(titleElement)}`,
    );
  }

  return titleElement.value.trim();
}

function readBody() {
  const bodyElement = firstXPathNode(BODY_XPATH);
  if (!bodyElement || bodyElement.nodeType !== Node.ELEMENT_NODE) {
    throw new Error(
      `body element was not found at ${BODY_XPATH}; got ${nodeDescription(bodyElement)}`,
    );
  }

  const html = Array.from(bodyElement.children)
    .map((child) => child.outerHTML)
    .join("\n");
  return turndown.turndown(html).trim();
}

function dispatchTextInput(element, inputType = "insertText") {
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType,
    }),
  );
}

function setTitle(title) {
  const titleElement = firstXPathNode(TITLE_XPATH);
  if (
    !titleElement ||
    titleElement.nodeType !== Node.ELEMENT_NODE ||
    titleElement.localName !== "input" ||
    !("value" in titleElement)
  ) {
    throw new Error(
      `title input was not found at ${TITLE_XPATH}; got ${nodeDescription(titleElement)}`,
    );
  }

  titleElement.focus();
  titleElement.select();

  const inserted = document.execCommand("insertText", false, title);
  if (!inserted || titleElement.value !== title) {
    titleElement.value = title;
    dispatchTextInput(titleElement);
  }
  titleElement.dispatchEvent(new Event("change", { bubbles: true }));
}

function setBody(body) {
  const editor = document.querySelector(BODY_EDITOR_SELECTOR);
  if (!editor) {
    throw new Error(`body editor was not found with selector ${BODY_EDITOR_SELECTOR}`);
  }

  editor.focus();

  const range = document.createRange();
  range.selectNodeContents(editor);

  const selection = window.getSelection();
  if (!selection) {
    throw new Error("window selection is unavailable");
  }
  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand("insertText", false, body);
  dispatchTextInput(editor);
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

function writeArticle(article) {
  if (!isArticlePage()) {
    throw new Error(`this extension only writes ${ARTICLE_MATCH}`);
  }

  setTitle(article?.title || "");
  setBody(article?.body || "");
}

if (!globalThis[LISTENER_INSTALLED_KEY]) {
  globalThis[LISTENER_INSTALLED_KEY] = true;
  runtimeApi()?.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "read_wbsb_article" && message?.type !== "write_wbsb_article") {
      return false;
    }

    try {
      if (message.type === "write_wbsb_article") {
        writeArticle(message.article);
        sendResponse({ ok: true });
        return false;
      }

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
}
