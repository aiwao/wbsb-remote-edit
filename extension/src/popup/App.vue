<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  ackMessage,
  messageText,
  wbsbArticleErrorMessage,
  wbsbArticleMessage,
  wbsbArticleTitleErrorMessage,
  wbsbArticleTitleMessage,
} from "./remote-edit-messages.js";
import { useRemoteEditSocket } from "./remote-edit-socket.js";
import { toErrorMessage } from "../shared/errors.js";
import { WS_MESSAGE_TYPES } from "../shared/protocol.js";
import {
  ensureWbsbArticlePage,
  readWbsbArticle,
  readWbsbArticleTitle,
  writeWbsbArticle,
} from "./wbsb-page-client.js";

const editTitle = ref("No edit yet");
const editContent = ref("");

const {
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
} = useRemoteEditSocket({
  onConnected: ensureWbsbArticlePage,
  onMessage: handleMessageEvent,
});

function handleMessageEvent(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    appendLog("CLI", event.data);
    return;
  }

  if (message.type === WS_MESSAGE_TYPES.getWbsbArticle) {
    sendWbsbArticle(message).catch((error) => {
      appendLog("extension", toErrorMessage(error));
    });
  }

  if (message.type === WS_MESSAGE_TYPES.getWbsbArticleTitle) {
    sendWbsbArticleTitle(message).catch((error) => {
      appendLog("extension", toErrorMessage(error));
    });
  }

  if (message.type === WS_MESSAGE_TYPES.edit) {
    editTitle.value = message.title || "Untitled";
    editContent.value = message.body || "";
    writeWbsbArticle({
      body: message.body || "",
      title: message.title || "",
    })
      .then(() => {
        appendLog("WBSB", "inserted edit");
        sendAck(message);
      })
      .catch((error) => {
        appendLog("extension", toErrorMessage(error));
      });
  }

  appendLog(message.from || "CLI", messageText(message));
}

function sendAck(message) {
  const ack = ackMessage(message);
  if (ack) {
    sendMessage(ack);
  }
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

onMounted(() => {
  init();
});

onBeforeUnmount(() => {
  dispose();
});
</script>

<template>
  <main class="popup">
    <header class="topbar">
      <h1>Remote Edit</h1>
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
