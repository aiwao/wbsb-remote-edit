export function extensionApi() {
  return globalThis.browser || globalThis.chrome;
}

export function runtimeApi() {
  return globalThis.browser?.runtime || globalThis.chrome?.runtime;
}

export function queryActiveTab() {
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
