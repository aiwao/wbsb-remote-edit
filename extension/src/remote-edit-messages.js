import { WS_MESSAGE_TYPES } from "./protocol.js";

const EXTENSION_SOURCE = "extension";

export function messageText(message) {
  if (message.type === WS_MESSAGE_TYPES.getWbsbArticle) {
    return WS_MESSAGE_TYPES.getWbsbArticle;
  }
  if (message.type === WS_MESSAGE_TYPES.getWbsbArticleTitle) {
    return WS_MESSAGE_TYPES.getWbsbArticleTitle;
  }
  if (message.type === WS_MESSAGE_TYPES.edit) {
    return message.title || "untitled edit";
  }
  if (message.error) {
    return message.error;
  }
  return message.type || "message";
}

export function ackMessage(message) {
  if (!message.id) {
    return null;
  }
  return { type: WS_MESSAGE_TYPES.ack, id: message.id };
}

export function wbsbArticleMessage(request, article) {
  return {
    type: WS_MESSAGE_TYPES.wbsbArticle,
    id: request.id,
    title: article.title,
    body: article.body,
    from: EXTENSION_SOURCE,
  };
}

export function wbsbArticleErrorMessage(request, errorText) {
  return {
    type: WS_MESSAGE_TYPES.wbsbArticle,
    id: request.id,
    error: errorText,
    from: EXTENSION_SOURCE,
  };
}

export function wbsbArticleTitleMessage(request, title) {
  return {
    type: WS_MESSAGE_TYPES.wbsbArticleTitle,
    id: request.id,
    title,
    from: EXTENSION_SOURCE,
  };
}

export function wbsbArticleTitleErrorMessage(request, errorText) {
  return {
    type: WS_MESSAGE_TYPES.wbsbArticleTitle,
    id: request.id,
    error: errorText,
    from: EXTENSION_SOURCE,
  };
}
