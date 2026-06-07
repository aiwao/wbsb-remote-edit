export const WS_MESSAGE_TYPES = Object.freeze({
  ack: "ack",
  connected: "connected",
  edit: "edit",
  error: "error",
  getWbsbArticle: "get_wbsb_article",
  getWbsbArticleTitle: "get_wbsb_article_title",
  ok: "ok",
  ping: "ping",
  pong: "pong",
  wbsbArticle: "wbsb_article",
  wbsbArticleTitle: "wbsb_article_title",
});

export const CONTENT_MESSAGE_TYPES = Object.freeze({
  writeWbsbArticle: "write_wbsb_article",
});
