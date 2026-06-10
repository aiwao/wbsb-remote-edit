import { runWbsbArticlePageAction } from "../wbsb/page-article-reader.js";
import { executeScript, getTab, queryActiveTab, updateTab } from "../shared/extension-api.js";
import { toErrorMessage } from "../shared/errors.js";

const WBSB_NEW_ARTICLE_URL = "https://wbsb.dev/articles/new";
const WBSB_EDIT_ARTICLE_PATH_PATTERN = /^\/articles\/[^/]+\/edit$/;
const PAGE_READY_TIMEOUT_MS = 30000;
const PAGE_READY_POLL_MS = 250;
const WRITABLE_EDITOR_TIMEOUT_MS = 30000;
const WRITABLE_EDITOR_POLL_MS = 250;

let pagePreparation = null;

function activeTabId(tab) {
  if (tab?.id === undefined || tab?.id === null) {
    throw new Error("active tab is unavailable");
  }
  return tab.id;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

function isWbsbArticleEditorUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "wbsb.dev" &&
      (parsedUrl.pathname === "/articles/new" ||
        WBSB_EDIT_ARTICLE_PATH_PATTERN.test(parsedUrl.pathname))
    );
  } catch {
    return false;
  }
}

async function waitForTabReady(tabId) {
  const deadline = Date.now() + PAGE_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const tab = await getTab(tabId);
    if (isWbsbArticleEditorUrl(tab?.url) && tab?.status === "complete") {
      return tab;
    }
    await delay(PAGE_READY_POLL_MS);
  }

  throw new Error("timed out waiting for WBSB article page to load");
}

async function prepareWbsbArticlePage() {
  const activeTab = await queryActiveTab();
  const tabId = activeTabId(activeTab);

  if (isWbsbArticleEditorUrl(activeTab.url) && activeTab.status === "complete") {
    return tabId;
  }

  if (!isWbsbArticleEditorUrl(activeTab.url)) {
    await updateTab(tabId, { url: WBSB_NEW_ARTICLE_URL });
  }

  await waitForTabReady(tabId);
  return tabId;
}

export function ensureWbsbArticlePage() {
  if (!pagePreparation) {
    pagePreparation = prepareWbsbArticlePage().finally(() => {
      pagePreparation = null;
    });
  }
  return pagePreparation;
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
    const [result] = await executePageScript(tabId, runWbsbArticlePageAction, ["read"]);
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
    const [result] = await executePageScript(tabId, runWbsbArticlePageAction, ["title"]);
    return result?.result || "";
  } catch (error) {
    throw new Error(`could not read WBSB article title: ${toErrorMessage(error)}`);
  }
}

async function writeRawWbsbArticle(tabId, article) {
  const deadline = Date.now() + WRITABLE_EDITOR_TIMEOUT_MS;
  let lastError = "could not write WBSB article";

  while (Date.now() < deadline) {
    let writeResult;
    try {
      const [result] = await executePageScript(tabId, runWbsbArticlePageAction, ["write", article]);
      writeResult = result?.result;
    } catch (error) {
      throw new Error(`could not write raw WBSB markdown: ${toErrorMessage(error)}`);
    }

    if (writeResult?.ok) {
      return;
    }

    lastError = writeResult?.error || "could not write WBSB article";
    if (!isEditorReadinessError(lastError)) {
      throw new Error(`could not write raw WBSB markdown: ${lastError}`);
    }

    await delay(WRITABLE_EDITOR_POLL_MS);
  }

  throw new Error(`could not write raw WBSB markdown: ${lastError}`);
}

function isEditorReadinessError(errorText) {
  return (
    errorText === "could not find WBSB TipTap Markdown editor state" ||
    errorText === "title input was not found"
  );
}

export async function readWbsbArticle() {
  const tabId = await ensureWbsbArticlePage();
  const rawArticle = await readRawWbsbArticle(tabId);
  if (rawArticle) {
    return rawArticle;
  }

  throw new Error("could not find WBSB raw markdown editor state");
}

export async function readWbsbArticleTitle() {
  const tabId = await ensureWbsbArticlePage();
  return readRawWbsbArticleTitle(tabId);
}

export async function writeWbsbArticle(article) {
  const tabId = await ensureWbsbArticlePage();
  await writeRawWbsbArticle(tabId, {
    body: article.body || "",
    title: article.title || "",
  });
}
