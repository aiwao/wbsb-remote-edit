export function extensionApi() {
  return globalThis.browser || globalThis.chrome;
}

export function runtimeApi() {
  return globalThis.browser?.runtime || globalThis.chrome?.runtime;
}

export function addRuntimeMessageListener(listener) {
  const api = runtimeApi();
  if (!api?.onMessage?.addListener) {
    throw new Error("runtime messaging API is unavailable");
  }

  api.onMessage.addListener(listener);
  return () => {
    api.onMessage.removeListener(listener);
  };
}

export function sendRuntimeMessage(message) {
  const api = runtimeApi();
  if (!api?.sendMessage) {
    return Promise.reject(new Error("runtime messaging API is unavailable"));
  }

  if (globalThis.browser?.runtime?.sendMessage) {
    return api.sendMessage(message);
  }

  return new Promise((resolve, reject) => {
    api.sendMessage(message, (response) => {
      const error = api.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

export function getStorage(keys) {
  const api = extensionApi();
  if (!api?.storage?.local?.get) {
    return Promise.reject(new Error("storage API is unavailable"));
  }

  if (globalThis.browser?.storage?.local?.get) {
    return api.storage.local.get(keys);
  }

  return new Promise((resolve, reject) => {
    api.storage.local.get(keys, (items) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items);
    });
  });
}

export function setStorage(items) {
  const api = extensionApi();
  if (!api?.storage?.local?.set) {
    return Promise.reject(new Error("storage API is unavailable"));
  }

  if (globalThis.browser?.storage?.local?.set) {
    return api.storage.local.set(items);
  }

  return new Promise((resolve, reject) => {
    api.storage.local.set(items, () => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

export function queryActiveTab() {
  const api = extensionApi();
  if (!api?.tabs?.query) {
    return Promise.reject(new Error("tabs API is unavailable"));
  }

  const query = { active: true, lastFocusedWindow: true };

  if (globalThis.browser?.tabs?.query) {
    return api.tabs.query(query).then((tabs) => tabs[0]);
  }

  return new Promise((resolve, reject) => {
    api.tabs.query(query, (tabs) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

export function getTab(tabId) {
  const api = extensionApi();
  if (!api?.tabs?.get) {
    return Promise.reject(new Error("tabs API is unavailable"));
  }

  if (globalThis.browser?.tabs?.get) {
    return api.tabs.get(tabId);
  }

  return new Promise((resolve, reject) => {
    api.tabs.get(tabId, (tab) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

export function updateTab(tabId, properties) {
  const api = extensionApi();
  if (!api?.tabs?.update) {
    return Promise.reject(new Error("tabs API is unavailable"));
  }

  if (globalThis.browser?.tabs?.update) {
    return api.tabs.update(tabId, properties);
  }

  return new Promise((resolve, reject) => {
    api.tabs.update(tabId, properties, (tab) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

export function sendTabMessage(tabId, message) {
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

export function executeScript(details) {
  const api = extensionApi();
  if (!api?.scripting?.executeScript) {
    return Promise.reject(new Error("scripting API is unavailable"));
  }

  if (globalThis.browser?.scripting?.executeScript) {
    return api.scripting.executeScript(details);
  }

  return new Promise((resolve, reject) => {
    api.scripting.executeScript(details, (results) => {
      const error = api.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(results);
    });
  });
}
