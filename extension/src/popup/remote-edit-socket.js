import { computed, ref } from "vue";
import { toErrorMessage } from "../shared/errors.js";

const RETRY_DELAY_MS = 1500;
const DEFAULT_ENDPOINT = "ws://127.0.0.1:8787/ws";
const LOG_LIMIT = 30;
const STORAGE_KEYS = {
  autoConnect: "remote-edit-auto-connect",
  endpoint: "remote-edit-endpoint",
};

export function useRemoteEditSocket({ onMessage }) {
  const endpoint = ref(DEFAULT_ENDPOINT);
  const autoConnect = ref(false);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const logEntries = ref([]);

  let socket = null;
  let connecting = null;
  let retryTimer = null;

  const endpointDisabled = computed(
    () => autoConnect.value || isConnected.value || isConnecting.value,
  );

  function appendLog(source, text) {
    logEntries.value = [
      {
        source,
        text,
        at: new Date().toLocaleTimeString(),
      },
      ...logEntries.value,
    ].slice(0, LOG_LIMIT);
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

  function connect() {
    if (isSocketOpen()) {
      return Promise.resolve(socket);
    }
    if (connecting) {
      return connecting;
    }

    isConnecting.value = true;

    let nextSocket;
    try {
      nextSocket = new WebSocket(endpoint.value.trim());
    } catch (error) {
      socket = null;
      isConnected.value = false;
      isConnecting.value = false;
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
        appendLog("extension", "connected");
        resolve(nextSocket);
      });

      nextSocket.addEventListener("message", (event) => {
        try {
          onMessage(event);
        } catch (error) {
          appendLog("extension", toErrorMessage(error));
        }
      });

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
  }

  function scheduleReconnect() {
    if (!autoConnect.value || retryTimer || connecting || isSocketOpen()) {
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
    if (event.target.checked) {
      startAutoConnect();
    } else {
      stopAutoConnect();
    }
  }

  function init() {
    loadSettings();
    if (autoConnect.value) {
      startAutoConnect();
    }
  }

  function dispose() {
    autoConnect.value = false;
    disconnect();
  }

  return {
    appendLog,
    autoConnect,
    endpoint,
    endpointDisabled,
    handleAutoConnectChange,
    handleEndpointInput,
    init,
    logEntries,
    dispose,
    sendMessage,
  };
}
