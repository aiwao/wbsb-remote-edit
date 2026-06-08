import {
  readWbsbArticleFromPage,
  readWbsbArticleTitleFromPage,
  writeWbsbArticleToPage,
} from "../wbsb/page-raw-markdown.js";
import { executeScript, queryActiveTab, sendTabMessage } from "../shared/extension-api.js";
import { toErrorMessage } from "../shared/errors.js";
import { CONTENT_MESSAGE_TYPES } from "../shared/protocol.js";

const CONTENT_SCRIPT_FILE = "assets/content.js";

function activeTabId(tab) {
  if (!tab?.id) {
    throw new Error("active tab is unavailable");
  }
  return tab.id;
}

function executeContentScript(tabId) {
  return executeScript({
    files: [CONTENT_SCRIPT_FILE],
    target: { tabId },
  }).catch((error) => {
    throw new Error(
      `content script is not running and could not be injected: ${toErrorMessage(error)}`,
    );
  });
}

async function executePageScript(tabId, func, args = []) {
  try {
    return await executeScript({
      args,
      func,
      target: { tabId },
      world: "MAIN",
    });
  } catch {
    return executeScript({
      args,
      func,
      target: { tabId },
    });
  }
}

async function readRawWbsbArticle(tabId) {
  try {
    const [result] = await executePageScript(tabId, readWbsbArticleFromPage);
    const article = result?.result;
    if (article?.ok && typeof article.body === "string") {
      return {
        body: article.body,
        title: article.title || "",
      };
    }
  } catch (error) {
    throw new Error(`could not read raw WBSB markdown: ${toErrorMessage(error)}`);
  }

  return null;
}

async function readRawWbsbArticleTitle(tabId) {
  try {
    const [result] = await executePageScript(tabId, readWbsbArticleTitleFromPage);
    return result?.result || "";
  } catch (error) {
    throw new Error(`could not read WBSB article title: ${toErrorMessage(error)}`);
  }
}

async function writeRawWbsbArticle(tabId, article) {
  try {
    const [result] = await executePageScript(tabId, writeWbsbArticleToPage, [article]);
    return Boolean(result?.result?.ok);
  } catch {
    return false;
  }
}

function isMissingContentScriptError(error) {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("could not establish connection") ||
    message.includes("receiving end does not exist") ||
    message.includes("no matching message handler")
  );
}

async function sendContentMessage(tabId, message) {
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    await executeContentScript(tabId);
    return sendTabMessage(tabId, message);
  }
}

export async function readWbsbArticle() {
  const tabId = activeTabId(await queryActiveTab());
  const rawArticle = await readRawWbsbArticle(tabId);
  if (rawArticle) {
    return rawArticle;
  }

  throw new Error("could not find WBSB raw markdown editor state");
}

export async function readWbsbArticleTitle() {
  const tabId = activeTabId(await queryActiveTab());
  return readRawWbsbArticleTitle(tabId);
}

export async function writeWbsbArticle(article) {
  const tabId = activeTabId(await queryActiveTab());
  const normalizedArticle = {
    body: article.body || "",
    title: article.title || "",
  };

  if (await writeRawWbsbArticle(tabId, normalizedArticle)) {
    return;
  }

  const response = await sendContentMessage(tabId, {
    article: normalizedArticle,
    type: CONTENT_MESSAGE_TYPES.writeWbsbArticle,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "could not write WBSB article");
  }
}
