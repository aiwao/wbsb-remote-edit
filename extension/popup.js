const state = {
  socket: null,
  connecting: null,
  log: [],
};

const els = {
  endpoint: document.querySelector("#endpoint"),
  status: document.querySelector("#status"),
  connect: document.querySelector("#connect"),
  disconnect: document.querySelector("#disconnect"),
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

  els.connect.disabled = connected || connecting;
  els.disconnect.disabled = !connected && !connecting;
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

  if (message.type === "edit") {
    els.editTitle.textContent = message.title || "Untitled";
    els.editContent.textContent = message.content || "";
  }

  appendLog(message.from || "CLI", messageText(message));
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

  state.connecting = new Promise((resolve, reject) => {
    const socket = new WebSocket(els.endpoint.value.trim());
    state.socket = socket;

    socket.addEventListener("open", () => {
      state.connecting = null;
      setStatus("Online", "is-online");
      appendLog("extension", "connected");
      renderControls();
      resolve(socket);
    });

    socket.addEventListener("message", handleMessage);

    socket.addEventListener("close", () => {
      state.connecting = null;
      if (state.socket === socket) {
        state.socket = null;
      }
      setStatus("Offline", "is-offline");
      appendLog("extension", "disconnected");
      renderControls();
    });

    socket.addEventListener("error", () => {
      state.connecting = null;
      setStatus("Error", "is-error");
      appendLog("extension", "connection error");
      renderControls();
      reject(new Error("WebSocket connection failed"));
    });
  });

  return state.connecting;
}

function disconnect() {
  if (state.socket) {
    state.socket.close();
  }
  state.socket = null;
  state.connecting = null;
  setStatus("Offline", "is-offline");
  renderControls();
}

els.connect.addEventListener("click", () => {
  connect().catch(() => {});
});
els.disconnect.addEventListener("click", disconnect);

renderControls();
