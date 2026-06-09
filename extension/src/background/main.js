import {
  ackMessage,
  messageText,
  wbsbArticleErrorMessage,
  wbsbArticleMessage,
  wbsbArticleTitleErrorMessage,
  wbsbArticleTitleMessage,
} from "../popup/remote-edit-messages.js";
import {
  ensureWbsbArticlePage,
  readWbsbArticle,
  readWbsbArticleTitle,
  writeWbsbArticle,
} from "../popup/wbsb-page-client.js";
import {
  addRuntimeMessageListener,
  getStorage,
  sendRuntimeMessage,
  setStorage,
} from "../shared/extension-api.js";
import { toErrorMessage } from "../shared/errors.js";
import {
  DEFAULT_REMOTE_EDIT_ENDPOINT,
  REMOTE_EDIT_STORAGE_KEYS,
  RUNTIME_MESSAGE_TYPES,
  WS_MESSAGE_TYPES,
} from "../shared/protocol.js";

const RETRY_DELAY_MS = 1500;
const LOG_LIMIT = 30;
const RUNTIME_COMMAND_TYPES = new Set([
  RUNTIME_MESSAGE_TYPES.getRemoteEditState,
  RUNTIME_MESSAGE_TYPES.setRemoteEditAutoConnect,
  RUNTIME_MESSAGE_TYPES.setRemoteEditEndpoint,
]);

const state = {
  autoConnect: false,
  editContent: "",
  editTitle: "No edit yet",
  endpoint: DEFAULT_REMOTE_EDIT_ENDPOINT,
  isConnected: false,
  isConnecting: false,
  logEntries: [],
};

let socket = null;
let connecting = null;
let retryTimer = null;
let initialized = null;

function publicState() {
  return {
    ...state,
    endpointDisabled: state.autoConnect || state.isConnected || state.isConnecting,
  };
}

function broadcastState() {
  sendRuntimeMessage({
    state: publicState(),
    type: RUNTIME_MESSAGE_TYPES.remoteEditState,
  }).catch(() => {
    // Popup may be closed; background state is still authoritative.
  });
}

function setState(patch) {
  Object.assign(state, patch);
  broadcastState();
}

function appendLog(source, text) {
  state.logEntries = [
    {
      source,
      text,
      at: new Date().toLocaleTimeString(),
    },
    ...state.logEntries,
  ].slice(0, LOG_LIMIT);
  broadcastState();
}

function isSocketOpen() {
  return socket && socket.readyState === WebSocket.OPEN;
}

function sendMessage(message) {
  if (!isSocketOpen()) {
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}

function sendAck(message) {
  const ack = ackMessage(message);
  if (ack) {
    sendMessage(ack);
  }
}

async function loadSettings() {
  const items = await getStorage({
    [REMOTE_EDIT_STORAGE_KEYS.autoConnect]: false,
    [REMOTE_EDIT_STORAGE_KEYS.endpoint]: DEFAULT_REMOTE_EDIT_ENDPOINT,
  });

  const storedEndpoint = items[REMOTE_EDIT_STORAGE_KEYS.endpoint];
  state.endpoint =
    typeof storedEndpoint === "string" && storedEndpoint.trim()
      ? storedEndpoint.trim()
      : DEFAULT_REMOTE_EDIT_ENDPOINT;

  const storedAutoConnect = items[REMOTE_EDIT_STORAGE_KEYS.autoConnect];
  state.autoConnect = storedAutoConnect === true || storedAutoConnect === "true";
}

function saveSettings() {
  return setStorage({
    [REMOTE_EDIT_STORAGE_KEYS.autoConnect]: state.autoConnect,
    [REMOTE_EDIT_STORAGE_KEYS.endpoint]: state.endpoint.trim(),
  });
}

function clearRetry() {
  if (!retryTimer) {
    return;
  }

  globalThis.clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleReconnect() {
  if (!state.autoConnect || retryTimer || connecting || isSocketOpen()) {
    return;
  }

  retryTimer = globalThis.setTimeout(() => {
    retryTimer = null;
    if (!state.autoConnect) {
      return;
    }

    connect().catch(() => {
      scheduleReconnect();
    });
  }, RETRY_DELAY_MS);
}

function connect() {
  if (isSocketOpen()) {
    return Promise.resolve(socket);
  }
  if (connecting) {
    return connecting;
  }

  setState({ isConnecting: true });

  let nextSocket;
  try {
    nextSocket = new WebSocket(state.endpoint.trim());
  } catch (error) {
    socket = null;
    setState({
      isConnected: false,
      isConnecting: false,
    });
    appendLog("extension", toErrorMessage(error));
    return Promise.reject(error);
  }

  socket = nextSocket;
  setState({ isConnected: false });

  const connectPromise = new Promise((resolve, reject) => {
    let settled = false;

    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) {
        return;
      }

      settled = true;
      connecting = null;
      clearRetry();
      setState({
        isConnected: true,
        isConnecting: false,
      });
      appendLog("extension", "connected");
      ensureWbsbArticlePage().catch((error) => {
        appendLog("extension", toErrorMessage(error));
      });
      resolve(nextSocket);
    });

    nextSocket.addEventListener("message", (event) => {
      handleCliMessageEvent(event).catch((error) => {
        appendLog("extension", toErrorMessage(error));
      });
    });

    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) {
        socket = null;
      }
      if (connecting === connectPromise) {
        connecting = null;
      }

      setState({
        isConnected: false,
        isConnecting: false,
      });

      if (state.autoConnect) {
        appendLog("extension", "disconnected; retrying");
        scheduleReconnect();
      } else {
        appendLog("extension", "disconnected");
      }

      if (!settled) {
        reject(new Error("WebSocket connection closed"));
      }
    });

    nextSocket.addEventListener("error", () => {
      appendLog("extension", "connection error");
      setState({ isConnecting: Boolean(connecting) });
    });
  });

  connecting = connectPromise;
  return connecting;
}

function disconnect() {
  clearRetry();
  if (socket) {
    socket.close();
  }
  socket = null;
  connecting = null;
  setState({
    isConnected: false,
    isConnecting: false,
  });
}

async function startAutoConnect({ log = true } = {}) {
  if (state.autoConnect) {
    connect().catch(() => {
      scheduleReconnect();
    });
    return;
  }

  setState({ autoConnect: true });
  await saveSettings();
  if (log) {
    appendLog("extension", "auto connect on");
  }

  connect().catch(() => {
    scheduleReconnect();
  });
}

async function stopAutoConnect() {
  if (!state.autoConnect && !isSocketOpen() && !connecting) {
    return;
  }

  setState({ autoConnect: false });
  await saveSettings();
  appendLog("extension", "auto connect off");
  disconnect();
}

async function setEndpoint(endpoint) {
  if (state.autoConnect || state.isConnected || state.isConnecting) {
    return;
  }

  const nextEndpoint = String(endpoint || "").trim() || DEFAULT_REMOTE_EDIT_ENDPOINT;
  setState({ endpoint: nextEndpoint });
  await saveSettings();
}

async function sendWbsbArticle(message) {
  try {
    const article = await readWbsbArticle();
    sendMessage(wbsbArticleMessage(message, article));
    appendLog("WBSB", article.title || "untitled article");
  } catch (error) {
    const errorText = toErrorMessage(error);
    appendLog("extension", errorText);
    sendMessage(wbsbArticleErrorMessage(message, errorText));
  }
}

async function sendWbsbArticleTitle(message) {
  try {
    const title = await readWbsbArticleTitle();
    sendMessage(wbsbArticleTitleMessage(message, title));
    appendLog("WBSB", title || "untitled article");
  } catch (error) {
    const errorText = toErrorMessage(error);
    appendLog("extension", errorText);
    sendMessage(wbsbArticleTitleErrorMessage(message, errorText));
  }
}

async function writeEdit(message) {
  setState({
    editContent: message.body || "",
    editTitle: message.title || "Untitled",
  });

  try {
    await writeWbsbArticle({
      body: message.body || "",
      title: message.title || "",
    });
    appendLog("WBSB", "inserted edit");
    sendAck(message);
  } catch (error) {
    appendLog("extension", toErrorMessage(error));
  }
}

async function handleCliMessageEvent(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    appendLog("CLI", event.data);
    return;
  }

  appendLog(message.from || "CLI", messageText(message));

  if (message.type === WS_MESSAGE_TYPES.getWbsbArticle) {
    await sendWbsbArticle(message);
    return;
  }

  if (message.type === WS_MESSAGE_TYPES.getWbsbArticleTitle) {
    await sendWbsbArticleTitle(message);
    return;
  }

  if (message.type === WS_MESSAGE_TYPES.edit) {
    await writeEdit(message);
  }
}

function ensureInitialized() {
  if (!initialized) {
    initialized = loadSettings()
      .then(() => {
        broadcastState();
        if (state.autoConnect) {
          connect().catch(() => {
            scheduleReconnect();
          });
        }
      })
      .catch((error) => {
        appendLog("extension", toErrorMessage(error));
      });
  }

  return initialized;
}

async function handleRuntimeMessage(message) {
  await ensureInitialized();

  if (message?.type === RUNTIME_MESSAGE_TYPES.getRemoteEditState) {
    return { state: publicState() };
  }

  if (message?.type === RUNTIME_MESSAGE_TYPES.setRemoteEditEndpoint) {
    await setEndpoint(message.endpoint);
    return { state: publicState() };
  }

  if (message?.type === RUNTIME_MESSAGE_TYPES.setRemoteEditAutoConnect) {
    if (message.autoConnect) {
      await startAutoConnect();
    } else {
      await stopAutoConnect();
    }
    return { state: publicState() };
  }

  return undefined;
}

addRuntimeMessageListener((message, _sender, sendResponse) => {
  if (!RUNTIME_COMMAND_TYPES.has(message?.type)) {
    return false;
  }

  handleRuntimeMessage(message)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse({ error: toErrorMessage(error) });
    });

  return true;
});

ensureInitialized();
