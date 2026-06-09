import { computed, ref } from "vue";
import { addRuntimeMessageListener, sendRuntimeMessage } from "../shared/extension-api.js";
import { toErrorMessage } from "../shared/errors.js";
import { DEFAULT_REMOTE_EDIT_ENDPOINT, RUNTIME_MESSAGE_TYPES } from "../shared/protocol.js";

const LOG_LIMIT = 30;
const STORAGE_KEYS = {
  autoConnect: "remote-edit-auto-connect",
  endpoint: "remote-edit-endpoint",
};

export function useRemoteEditSocket() {
  const endpoint = ref(DEFAULT_REMOTE_EDIT_ENDPOINT);
  const autoConnect = ref(false);
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const logEntries = ref([]);
  const editTitle = ref("No edit yet");
  const editContent = ref("");

  let removeRuntimeMessageListener = null;

  const endpointDisabled = computed(
    () => autoConnect.value || isConnected.value || isConnecting.value,
  );

  function appendLocalLog(source, text) {
    logEntries.value = [
      {
        source,
        text,
        at: new Date().toLocaleTimeString(),
      },
      ...logEntries.value,
    ].slice(0, LOG_LIMIT);
  }

  function saveLocalSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.autoConnect, String(autoConnect.value));
      localStorage.setItem(STORAGE_KEYS.endpoint, endpoint.value.trim());
    } catch {
      // Popup-local settings are convenience state only.
    }
  }

  function loadLocalSettings() {
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

  function applyState(nextState) {
    if (!nextState) {
      return;
    }

    endpoint.value = nextState.endpoint || DEFAULT_REMOTE_EDIT_ENDPOINT;
    autoConnect.value = Boolean(nextState.autoConnect);
    isConnected.value = Boolean(nextState.isConnected);
    isConnecting.value = Boolean(nextState.isConnecting);
    logEntries.value = Array.isArray(nextState.logEntries) ? nextState.logEntries : [];
    editTitle.value = nextState.editTitle || "No edit yet";
    editContent.value = nextState.editContent || "";
    saveLocalSettings();
  }

  async function sendCommand(message) {
    try {
      const response = await sendRuntimeMessage(message);
      if (response?.error) {
        appendLocalLog("extension", response.error);
        return;
      }
      applyState(response?.state);
    } catch (error) {
      appendLocalLog("extension", toErrorMessage(error));
    }
  }

  function handleEndpointInput(event) {
    endpoint.value = event.target.value;
    saveLocalSettings();
    sendCommand({
      endpoint: endpoint.value,
      type: RUNTIME_MESSAGE_TYPES.setRemoteEditEndpoint,
    });
  }

  function handleAutoConnectChange(event) {
    const nextAutoConnect = Boolean(event.target.checked);
    autoConnect.value = nextAutoConnect;
    saveLocalSettings();
    sendCommand({
      autoConnect: nextAutoConnect,
      type: RUNTIME_MESSAGE_TYPES.setRemoteEditAutoConnect,
    });
  }

  function init() {
    if (removeRuntimeMessageListener) {
      return;
    }

    loadLocalSettings();

    removeRuntimeMessageListener = addRuntimeMessageListener((message) => {
      if (message?.type === RUNTIME_MESSAGE_TYPES.remoteEditState) {
        applyState(message.state);
      }
      return false;
    });

    sendCommand({ type: RUNTIME_MESSAGE_TYPES.getRemoteEditState });
  }

  function dispose() {
    removeRuntimeMessageListener?.();
    removeRuntimeMessageListener = null;
  }

  return {
    autoConnect,
    editContent,
    editTitle,
    endpoint,
    endpointDisabled,
    handleAutoConnectChange,
    handleEndpointInput,
    init,
    logEntries,
    dispose,
  };
}
