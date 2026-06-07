import { consumeCodeFenceSeparatorBreak, hasLaterContent } from "./editor-markdown.js";
import { markdownTokens } from "./markdown-tokens.js";

const ARTICLE_MATCH = "*://wbsb.dev/articles/new";
const TITLE_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
const BODY_XPATH = "/html/body/div[1]/main/div/div/div[2]/div[5]/div/div";

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

function createInputEvent(type, inputType, data = null) {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    data,
    inputType,
  });
}

function dispatchTextInput(element, inputType = "insertText", data = null) {
  element.dispatchEvent(createInputEvent("input", inputType, data));
}

function dispatchBeforeInput(element, inputType, data = null) {
  return element.dispatchEvent(createInputEvent("beforeinput", inputType, data));
}

function selectNodeContents(node) {
  const range = document.createRange();
  range.selectNodeContents(node);

  const selection = window.getSelection();
  if (!selection) {
    throw new Error("window selection is unavailable");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertEditorText(editor, text) {
  if (!dispatchBeforeInput(editor, "insertText", text)) {
    return;
  }

  document.execCommand("insertText", false, text);
  dispatchTextInput(editor, "insertText", text);
}

function createEnterKeyEvent(type) {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code: "Enter",
    key: "Enter",
    keyCode: 13,
    which: 13,
  });
}

function insertEditorParagraph(editor) {
  const keydownEvent = createEnterKeyEvent("keydown");
  const wasNotCanceled = editor.dispatchEvent(keydownEvent);
  editor.dispatchEvent(createEnterKeyEvent("keyup"));

  if (!wasNotCanceled || keydownEvent.defaultPrevented) {
    return;
  }

  if (!dispatchBeforeInput(editor, "insertParagraph")) {
    return;
  }

  document.execCommand("insertParagraph", false);
  dispatchTextInput(editor, "insertParagraph");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pasteHtml(editor, html, plainText) {
  editor.focus();

  try {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", plainText);

    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    });

    if (!editor.dispatchEvent(event) || event.defaultPrevented) {
      return;
    }
  } catch {
    // Fall through to the execCommand fallback.
  }

  document.execCommand("insertHTML", false, html);
  dispatchTextInput(editor, "insertFromPaste", plainText);
}

function insertCodeBlock(editor, token, shouldCreateFollowingParagraph) {
  const languageClass = token.language ? ` class="language-${escapeHtml(token.language)}"` : "";
  const followingParagraph = shouldCreateFollowingParagraph ? "<p><br></p>" : "";
  const html = `<pre><code${languageClass}>${escapeHtml(token.code)}</code></pre>${followingParagraph}`;

  pasteHtml(editor, html, token.code);
}

function insertThematicBreak(editor, token, shouldCreateFollowingParagraph) {
  const followingParagraph = shouldCreateFollowingParagraph ? "<p><br></p>" : "";

  pasteHtml(editor, `<hr>${followingParagraph}`, token.markdown);
}

async function insertList(editor, token, shouldCreateFollowingParagraph) {
  const [firstItem = "", ...remainingItems] = token.items;

  await typeIntoEditor(editor, `${token.marker} ${firstItem}`);
  for (const item of remainingItems) {
    insertEditorParagraph(editor);
    await waitForEditorTick(0);
    await typeIntoEditor(editor, item);
  }

  if (shouldCreateFollowingParagraph) {
    insertEditorParagraph(editor);
    await waitForEditorTick(0);
    insertEditorParagraph(editor);
    await waitForEditorTick(0);
  }
}

function waitForEditorTick(index) {
  if (index % 50 !== 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function typeIntoEditor(editor, text) {
  for (const [index, character] of Array.from(text).entries()) {
    if (character === "\n") {
      insertEditorParagraph(editor);
    } else {
      insertEditorText(editor, character);
    }

    await waitForEditorTick(index);
  }
}

async function typeMarkdownIntoEditor(editor, markdown) {
  const tokens = markdownTokens(markdown);

  for (const [index, token] of tokens.entries()) {
    if (token.type === "text") {
      await typeIntoEditor(editor, token.text);
      continue;
    }

    const shouldCreateFollowingParagraph = hasLaterContent(tokens, index);
    if (token.type === "list") {
      await insertList(editor, token, shouldCreateFollowingParagraph);
    } else if (token.type === "thematicBreak") {
      insertThematicBreak(editor, token, shouldCreateFollowingParagraph);
    } else {
      insertCodeBlock(editor, token, shouldCreateFollowingParagraph);
    }
    if (shouldCreateFollowingParagraph) {
      consumeCodeFenceSeparatorBreak(tokens, index);
    }
    await waitForEditorTick(index);
  }
}

function replaceEditorContentsWithText(editor, text) {
  editor.focus();
  selectNodeContents(editor);

  if (!text) {
    if (dispatchBeforeInput(editor, "deleteContentBackward")) {
      document.execCommand("delete", false);
      dispatchTextInput(editor, "deleteContentBackward");
    }
    return Promise.resolve();
  }

  return typeMarkdownIntoEditor(editor, text);
}

function dispatchTitleInput(element, inputType = "insertText") {
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
    dispatchTitleInput(titleElement);
  }
  titleElement.dispatchEvent(new Event("change", { bubbles: true }));
}

async function setBody(body) {
  const editor = firstXPathNode(BODY_XPATH);
  if (!editor || editor.nodeType !== Node.ELEMENT_NODE) {
    throw new Error(`body editor was not found at ${BODY_XPATH}; got ${nodeDescription(editor)}`);
  }

  await replaceEditorContentsWithText(editor, body);
}

export async function writeArticle(article) {
  if (!isArticlePage()) {
    throw new Error(`this extension only writes ${ARTICLE_MATCH}`);
  }

  setTitle(article?.title || "");
  await setBody(article?.body || "");
}
