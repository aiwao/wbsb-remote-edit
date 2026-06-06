const RETRY_DELAY_MS = 1500;
const STORAGE_KEYS = {
  autoConnect: "remote-edit-auto-connect",
  endpoint: "remote-edit-endpoint",
};
const DEBUG_ARTICLE = {
  title: "ABCDEFG",
  body: "abcdefghijklmnopqrstuvwxyz\n\n\nabcdefghijklmnopqrstuvwxyz",
};

const state = {
  socket: null,
  connecting: null,
  retryTimer: null,
  autoConnect: false,
  log: [],
};

const els = {
  endpoint: document.querySelector("#endpoint"),
  status: document.querySelector("#status"),
  autoConnect: document.querySelector("#auto-connect"),
  editTitle: document.querySelector("#edit-title"),
  editContent: document.querySelector("#edit-content"),
  log: document.querySelector("#log"),
};

function setStatus(label, className) {
  els.status.textContent = label;
  els.status.className = `status ${className}`;
}

function renderControls() {
  const connected = state.socket && state.socket.readyState === WebSocket.OPEN;
  const connecting = Boolean(state.connecting);

  els.autoConnect.checked = state.autoConnect;
  els.endpoint.disabled = state.autoConnect || connected || connecting;
}

function appendLog(source, text) {
  state.log.unshift({
    source,
    text,
    at: new Date().toLocaleTimeString(),
  });
  state.log = state.log.slice(0, 30);

  els.log.replaceChildren(
    ...state.log.map((entry) => {
      const row = document.createElement("div");
      const meta = document.createElement("strong");
      const body = document.createElement("span");

      row.className = "log-entry";
      meta.textContent = `${entry.at} ${entry.source}`;
      body.textContent = entry.text;
      row.append(meta, body);
      return row;
    }),
  );
}

function messageText(message) {
  if (message.type === "get_wbsb_article") {
    return "get_wbsb_article";
  }
  if (message.type === "edit") {
    return message.title || "untitled edit";
  }
  if (message.error) {
    return message.error;
  }
  return message.type || "message";
}

function handleMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    appendLog("CLI", event.data);
    return;
  }

  if (message.type === "get_wbsb_article") {
    sendWBSBArticle(message);
  }

  if (message.type === "edit") {
    els.editTitle.textContent = message.title || "Untitled";
    els.editContent.textContent = message.body || "";
    sendAck(message);
  }

  appendLog(message.from || "CLI", messageText(message));
}

function sendAck(message) {
  if (!message.id || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  state.socket.send(JSON.stringify({ type: "ack", id: message.id }));
}

function sendWBSBArticle(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  state.socket.send(
    JSON.stringify({
      type: "wbsb_article",
      id: message.id,
      title: DEBUG_ARTICLE.title,
      body: DEBUG_ARTICLE.body,
      from: "extension",
    }),
  );
}

function connect() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(state.socket);
  }
  if (state.connecting) {
    return state.connecting;
  }

  setStatus("Connecting", "is-connecting");
  renderControls();

  let socket;
  try {
    socket = new WebSocket(els.endpoint.value.trim());
  } catch (error) {
    state.socket = null;
    setStatus("Error", "is-error");
    appendLog("extension", error.message);
    renderControls();
    return Promise.reject(error);
  }

  state.socket = socket;

  const connectPromise = new Promise((resolve, reject) => {
    let settled = false;

    socket.addEventListener("open", () => {
      if (state.socket !== socket) {
        return;
      }

      settled = true;
      state.connecting = null;
      clearRetry();
      setStatus("Online", "is-online");
      appendLog("extension", "connected");
      renderControls();
      resolve(socket);
    });

    socket.addEventListener("message", handleMessage);

    socket.addEventListener("close", () => {
      if (state.socket === socket) {
        state.socket = null;
      }
      if (state.connecting === connectPromise) {
        state.connecting = null;
      }
      if (state.autoConnect) {
        setStatus("Retrying", "is-connecting");
        appendLog("extension", "disconnected; retrying");
        scheduleReconnect();
      } else {
        setStatus("Offline", "is-offline");
        appendLog("extension", "disconnected");
      }
      renderControls();

      if (!settled) {
        reject(new Error("WebSocket connection closed"));
      }
    });

    socket.addEventListener("error", () => {
      setStatus("Error", "is-error");
      appendLog("extension", "connection error");
      renderControls();
    });
  });

  state.connecting = connectPromise;
  return state.connecting;
}

function disconnect() {
  clearRetry();
  if (state.socket) {
    state.socket.close();
  }
  state.socket = null;
  state.connecting = null;
  setStatus("Offline", "is-offline");
  renderControls();
}

function scheduleReconnect() {
  const connected = state.socket && state.socket.readyState === WebSocket.OPEN;
  if (!state.autoConnect || state.retryTimer || state.connecting || connected) {
    return;
  }

  state.retryTimer = window.setTimeout(() => {
    state.retryTimer = null;
    if (!state.autoConnect) {
      renderControls();
      return;
    }

    connect().catch(() => {
      scheduleReconnect();
    });
  }, RETRY_DELAY_MS);
}

function clearRetry() {
  if (!state.retryTimer) {
    return;
  }

  window.clearTimeout(state.retryTimer);
  state.retryTimer = null;
}

function startAutoConnect() {
  state.autoConnect = true;
  saveSettings();
  appendLog("extension", "auto connect on");
  renderControls();

  connect().catch(() => {
    scheduleReconnect();
  });
}

function stopAutoConnect() {
  state.autoConnect = false;
  saveSettings();
  appendLog("extension", "auto connect off");
  disconnect();
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.autoConnect, String(state.autoConnect));
    localStorage.setItem(STORAGE_KEYS.endpoint, els.endpoint.value.trim());
  } catch {
    // Extension storage is best-effort for popup convenience only.
  }
}

function loadSettings() {
  try {
    const endpoint = localStorage.getItem(STORAGE_KEYS.endpoint);
    if (endpoint) {
      els.endpoint.value = endpoint;
    }
    state.autoConnect = localStorage.getItem(STORAGE_KEYS.autoConnect) === "true";
  } catch {
    state.autoConnect = false;
  }
}

els.autoConnect.addEventListener("change", () => {
  if (els.autoConnect.checked) {
    startAutoConnect();
  } else {
    stopAutoConnect();
  }
});

els.endpoint.addEventListener("input", saveSettings);

loadSettings();
if (state.autoConnect) {
  startAutoConnect();
} else {
  renderControls();
}
