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

export const RUNTIME_MESSAGE_TYPES = Object.freeze({
  remoteEditState: "remote_edit_state",
  getRemoteEditState: "get_remote_edit_state",
  setRemoteEditAutoConnect: "set_remote_edit_auto_connect",
  setRemoteEditEndpoint: "set_remote_edit_endpoint",
});

export const DEFAULT_REMOTE_EDIT_ENDPOINT = "ws://127.0.0.1:8787/ws";
