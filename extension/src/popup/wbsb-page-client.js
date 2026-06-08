import {
  readWbsbArticleFromPage,
  readWbsbArticleTitleFromPage,
  writeWbsbArticleToPage,
} from "../wbsb/page-raw-markdown.js";
import { executeScript, queryActiveTab } from "../shared/extension-api.js";
import { toErrorMessage } from "../shared/errors.js";

function activeTabId(tab) {
  if (!tab?.id) {
    throw new Error("active tab is unavailable");
  }
  return tab.id;
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
    const writeResult = result?.result;
    if (writeResult?.ok) {
      return;
    }
    throw new Error(writeResult?.error || "could not write WBSB article");
  } catch (error) {
    throw new Error(`could not write raw WBSB markdown: ${toErrorMessage(error)}`);
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
  await writeRawWbsbArticle(tabId, {
    body: article.body || "",
    title: article.title || "",
  });
}
