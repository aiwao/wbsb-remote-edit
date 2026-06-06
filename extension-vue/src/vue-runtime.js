import { createRenderer } from "@vue/runtime-core";

export * from "@vue/runtime-core";

const eventListeners = new WeakMap();

function resolveContainer(container) {
  if (typeof container === "string") {
    return document.querySelector(container);
  }
  return container;
}

function patchEvent(element, rawName, previousValue, nextValue) {
  const name = rawName.slice(2).toLowerCase();
  let listeners = eventListeners.get(element);
  if (!listeners) {
    listeners = new Map();
    eventListeners.set(element, listeners);
  }

  const previousListener = listeners.get(name) || previousValue;
  if (previousListener) {
    element.removeEventListener(name, previousListener);
  }

  if (nextValue) {
    element.addEventListener(name, nextValue);
    listeners.set(name, nextValue);
  } else {
    listeners.delete(name);
  }
}

function patchStyle(element, previousValue, nextValue) {
  if (!nextValue) {
    element.removeAttribute("style");
    return;
  }

  if (typeof nextValue === "string") {
    element.style.cssText = nextValue;
    return;
  }

  if (previousValue && typeof previousValue === "object") {
    for (const key of Object.keys(previousValue)) {
      if (!(key in nextValue)) {
        element.style[key] = "";
      }
    }
  }

  for (const [key, value] of Object.entries(nextValue)) {
    element.style[key] = value == null ? "" : value;
  }
}

function setBooleanProperty(element, key, value) {
  element[key] = Boolean(value);
  if (value) {
    element.setAttribute(key, "");
  } else {
    element.removeAttribute(key);
  }
}

function patchProp(element, key, previousValue, nextValue) {
  if (key === "class") {
    if (nextValue) {
      element.setAttribute("class", nextValue);
    } else {
      element.removeAttribute("class");
    }
    return;
  }

  if (key === "style") {
    patchStyle(element, previousValue, nextValue);
    return;
  }

  if (/^on[A-Z]/.test(key)) {
    patchEvent(element, key, previousValue, nextValue);
    return;
  }

  if (key === "value") {
    element.value = nextValue == null ? "" : nextValue;
    return;
  }

  if (key === "checked" || key === "disabled") {
    setBooleanProperty(element, key, nextValue);
    return;
  }

  if (nextValue == null || nextValue === false) {
    element.removeAttribute(key);
    return;
  }

  element.setAttribute(key, nextValue === true ? "" : String(nextValue));
}

const renderer = createRenderer({
  createComment: (text) => document.createComment(text),
  createElement: (tag) => document.createElement(tag),
  createText: (text) => document.createTextNode(text),
  insert: (child, parent, anchor = null) => parent.insertBefore(child, anchor),
  nextSibling: (node) => node.nextSibling,
  parentNode: (node) => node.parentNode,
  patchProp,
  remove: (child) => child.parentNode?.removeChild(child),
  setElementText: (element, text) => {
    element.textContent = text;
  },
  setText: (node, text) => {
    node.nodeValue = text;
  },
});

export function createApp(...args) {
  const app = renderer.createApp(...args);
  const mount = app.mount.bind(app);

  app.mount = (containerOrSelector) => {
    const container = resolveContainer(containerOrSelector);
    if (!container) {
      return undefined;
    }

    container.textContent = "";
    const proxy = mount(container);
    container.setAttribute("data-v-app", "");
    return proxy;
  };

  return app;
}
