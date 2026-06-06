<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const RETRY_DELAY_MS = 1500;
const DEFAULT_ENDPOINT = "ws://127.0.0.1:8787/ws";
const STORAGE_KEYS = {
  autoConnect: "remote-edit-auto-connect",
  endpoint: "remote-edit-endpoint",
};

const endpoint = ref(DEFAULT_ENDPOINT);
const autoConnect = ref(false);
const statusLabel = ref("Offline");
const statusTone = ref("is-offline");
const isConnected = ref(false);
const isConnecting = ref(false);
const editTitle = ref("No edit yet");
const editContent = ref("");
const logEntries = ref([]);

let socket = null;
let connecting = null;
let retryTimer = null;

const endpointDisabled = computed(
  () => autoConnect.value || isConnected.value || isConnecting.value,
);

function setStatus(label, tone) {
  statusLabel.value = label;
  statusTone.value = tone;
}

function appendLog(source, text) {
  logEntries.value = [
    {
      source,
      text,
      at: new Date().toLocaleTimeString(),
    },
    ...logEntries.value,
  ].slice(0, 30);
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
    sendWBSBArticle(message).catch((error) => {
      appendLog("extension", toErrorMessage(error));
    });
  }

  if (message.type === "edit") {
    editTitle.value = message.title || "Untitled";
    editContent.value = message.body || "";
    sendAck(message);
  }

  appendLog(message.from || "CLI", messageText(message));
}

function sendAck(message) {
  if (!message.id || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({ type: "ack", id: message.id }));
}

async function sendWBSBArticle(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  let article;
  try {
    article = await readWBSBArticle();
  } catch (error) {
    const errorText = toErrorMessage(error);
    appendLog("extension", errorText);
    socket.send(
      JSON.stringify({
        type: "wbsb_article",
        id: message.id,
        error: errorText,
        from: "extension",
      }),
    );
    return;
  }

  socket.send(
    JSON.stringify({
      type: "wbsb_article",
      id: message.id,
      title: article.title,
      body: article.body,
      from: "extension",
    }),
  );
  appendLog("WBSB", article.title || "untitled article");
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function extensionApi() {
  return globalThis.browser || globalThis.chrome;
}

function queryActiveTab() {
  const api = extensionApi();
  if (!api?.tabs?.query) {
    return Promise.reject(new Error("tabs API is unavailable"));
  }

  if (globalThis.browser?.tabs?.query) {
    return api.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
  }

  return new Promise((resolve, reject) => {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

function sendTabMessage(tabId, message) {
  const api = extensionApi();
  if (!api?.tabs?.sendMessage) {
    return Promise.reject(new Error("tabs messaging API is unavailable"));
  }

  if (globalThis.browser?.tabs?.sendMessage) {
    return api.tabs.sendMessage(tabId, message);
  }

  return new Promise((resolve, reject) => {
    api.tabs.sendMessage(tabId, message, (response) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function readWBSBArticle() {
  const tab = await queryActiveTab();
  if (!tab?.id) {
    throw new Error("active tab is unavailable");
  }

  const response = await sendTabMessage(tab.id, { type: "read_wbsb_article" });
  if (!response?.ok) {
    throw new Error(response?.error || "could not read WBSB article");
  }

  return response.article;
}

function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(socket);
  }
  if (connecting) {
    return connecting;
  }

  setStatus("Connecting", "is-connecting");
  isConnecting.value = true;

  let nextSocket;
  try {
    nextSocket = new WebSocket(endpoint.value.trim());
  } catch (error) {
    socket = null;
    isConnected.value = false;
    isConnecting.value = false;
    setStatus("Error", "is-error");
    appendLog("extension", toErrorMessage(error));
    return Promise.reject(error);
  }

  socket = nextSocket;
  isConnected.value = false;

  const connectPromise = new Promise((resolve, reject) => {
    let settled = false;

    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) {
        return;
      }

      settled = true;
      connecting = null;
      isConnected.value = true;
      isConnecting.value = false;
      clearRetry();
      setStatus("Online", "is-online");
      appendLog("extension", "connected");
      resolve(nextSocket);
    });

    nextSocket.addEventListener("message", handleMessage);

    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) {
        socket = null;
      }
      if (connecting === connectPromise) {
        connecting = null;
      }

      isConnected.value = false;
      isConnecting.value = false;

      if (autoConnect.value) {
        setStatus("Retrying", "is-connecting");
        appendLog("extension", "disconnected; retrying");
        scheduleReconnect();
      } else {
        setStatus("Offline", "is-offline");
        appendLog("extension", "disconnected");
      }

      if (!settled) {
        reject(new Error("WebSocket connection closed"));
      }
    });

    nextSocket.addEventListener("error", () => {
      setStatus("Error", "is-error");
      appendLog("extension", "connection error");
      isConnecting.value = Boolean(connecting);
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
  isConnected.value = false;
  isConnecting.value = false;
  setStatus("Offline", "is-offline");
}

function scheduleReconnect() {
  const connected = socket && socket.readyState === WebSocket.OPEN;
  if (!autoConnect.value || retryTimer || connecting || connected) {
    return;
  }

  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (!autoConnect.value) {
      return;
    }

    connect().catch(() => {
      scheduleReconnect();
    });
  }, RETRY_DELAY_MS);
}

function clearRetry() {
  if (!retryTimer) {
    return;
  }

  window.clearTimeout(retryTimer);
  retryTimer = null;
}

function startAutoConnect() {
  autoConnect.value = true;
  saveSettings();
  appendLog("extension", "auto connect on");

  connect().catch(() => {
    scheduleReconnect();
  });
}

function stopAutoConnect() {
  autoConnect.value = false;
  saveSettings();
  appendLog("extension", "auto connect off");
  disconnect();
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.autoConnect, String(autoConnect.value));
    localStorage.setItem(STORAGE_KEYS.endpoint, endpoint.value.trim());
  } catch {
    // Extension popup settings are best-effort convenience state.
  }
}

function loadSettings() {
  try {
    const storedEndpoint = localStorage.getItem(STORAGE_KEYS.endpoint);
    if (storedEndpoint) {
      endpoint.value = storedEndpoint;
    }
    autoConnect.value = localStorage.getItem(STORAGE_KEYS.autoConnect) === "true";
  } catch {
    autoConnect.value = false;
  }
}

function handleEndpointInput(event) {
  endpoint.value = event.target.value;
  saveSettings();
}

function handleAutoConnectChange(event) {
  autoConnect.value = event.target.checked;
  if (autoConnect.value) {
    startAutoConnect();
  } else {
    stopAutoConnect();
  }
}

onMounted(() => {
  loadSettings();
  if (autoConnect.value) {
    startAutoConnect();
  }
});

onBeforeUnmount(() => {
  autoConnect.value = false;
  disconnect();
});
</script>

<template>
  <main class="popup">
    <header class="topbar">
      <h1>Remote Edit</h1>
      <span class="status" :class="statusTone" aria-live="polite">{{ statusLabel }}</span>
    </header>

    <label class="field">
      <span>Endpoint</span>
      <input
        :value="endpoint"
        type="url"
        :disabled="endpointDisabled"
        spellcheck="false"
        @input="handleEndpointInput"
      />
    </label>

    <label class="switch-control">
      <input
        :checked="autoConnect"
        type="checkbox"
        role="switch"
        @change="handleAutoConnectChange"
      />
      <span class="switch-track" aria-hidden="true">
        <span class="switch-thumb"></span>
      </span>
      <span class="switch-label">Auto connect</span>
    </label>

    <section class="edit-view" aria-live="polite">
      <h2 class="edit-title">{{ editTitle }}</h2>
      <pre class="edit-content">{{ editContent }}</pre>
    </section>

    <section class="log-shell" aria-label="Message log">
      <div class="log">
        <div
          v-for="entry in logEntries"
          :key="`${entry.at}-${entry.source}-${entry.text}`"
          class="log-entry"
        >
          <strong>{{ entry.at }} {{ entry.source }}</strong>
          <span>{{ entry.text }}</span>
        </div>
      </div>
    </section>
  </main>
</template>
