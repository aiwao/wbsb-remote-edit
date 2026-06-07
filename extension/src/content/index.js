import { writeArticle } from "./wbsb-editor-writer.js";

const WRITE_WBSB_ARTICLE_MESSAGE = "write_wbsb_article";
const LISTENER_INSTALLED_KEY = "__remoteEditBridgeContentListenerInstalled";

function runtimeApi() {
  return globalThis.browser?.runtime || globalThis.chrome?.runtime;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

if (!globalThis[LISTENER_INSTALLED_KEY]) {
  globalThis[LISTENER_INSTALLED_KEY] = true;
  runtimeApi()?.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== WRITE_WBSB_ARTICLE_MESSAGE) {
      return false;
    }

    writeArticle(message.article)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          error: toErrorMessage(error),
          ok: false,
        });
      });
    return true;
  });
}
