<script setup>
import { onBeforeUnmount, onMounted } from "vue";
import { useRemoteEditSocket } from "./remote-edit-socket.js";

const {
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
} = useRemoteEditSocket();

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
