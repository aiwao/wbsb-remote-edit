import { runtimeApi } from "./extension-api.js";
import { toErrorMessage } from "./errors.js";
import { CONTENT_MESSAGE_TYPES } from "./protocol.js";
import { writeArticle } from "./wbsb-editor-writer.js";

const LISTENER_INSTALLED_KEY = "__remoteEditBridgeContentListenerInstalled";

if (!globalThis[LISTENER_INSTALLED_KEY]) {
  globalThis[LISTENER_INSTALLED_KEY] = true;
  runtimeApi()?.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== CONTENT_MESSAGE_TYPES.writeWbsbArticle) {
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
