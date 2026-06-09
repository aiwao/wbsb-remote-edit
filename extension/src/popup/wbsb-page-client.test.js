import { afterEach, describe, expect, it } from "vite-plus/test";
import { writeWbsbArticle } from "./wbsb-page-client.js";

const originalBrowser = globalThis.browser;
const originalChrome = globalThis.chrome;

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
}

describe("writeWbsbArticle", () => {
  afterEach(() => {
    setGlobal("browser", originalBrowser);
    setGlobal("chrome", originalChrome);
  });

  it("retries writing until the WBSB editor is available after navigation", async () => {
    const tab = {
      id: 123,
      status: "complete",
      url: "https://example.com/",
    };
    const updates = [];
    let writeAttempts = 0;

    setGlobal("chrome", undefined);
    setGlobal("browser", {
      scripting: {
        executeScript(details) {
          expect(details.target).toEqual({ tabId: tab.id });
          expect(details.args).toEqual([
            "write",
            {
              body: "pushed body",
              title: "Pushed Title",
            },
          ]);

          writeAttempts += 1;
          if (writeAttempts === 1) {
            return Promise.resolve([
              {
                result: {
                  error: "could not find WBSB TipTap Markdown editor state",
                  ok: false,
                },
              },
            ]);
          }

          return Promise.resolve([
            {
              result: {
                ok: true,
                strategy: "tiptap-markdown",
              },
            },
          ]);
        },
      },
      tabs: {
        get(tabId) {
          expect(tabId).toBe(tab.id);
          return Promise.resolve(tab);
        },
        query() {
          return Promise.resolve([tab]);
        },
        update(tabId, properties) {
          expect(tabId).toBe(tab.id);
          updates.push(properties);
          tab.url = properties.url;
          return Promise.resolve(tab);
        },
      },
    });

    await writeWbsbArticle({
      body: "pushed body",
      title: "Pushed Title",
    });

    expect(updates).toEqual([{ url: "https://wbsb.dev/articles/new" }]);
    expect(writeAttempts).toBe(2);
  });

  it("writes to an existing WBSB edit article tab without navigating", async () => {
    const tab = {
      id: 123,
      status: "complete",
      url: "https://wbsb.dev/articles/article-1/edit",
    };
    const updates = [];
    let writeAttempts = 0;

    setGlobal("chrome", undefined);
    setGlobal("browser", {
      scripting: {
        executeScript(details) {
          expect(details.target).toEqual({ tabId: tab.id });
          expect(details.args).toEqual([
            "write",
            {
              body: "edited body",
              title: "Edited Title",
            },
          ]);

          writeAttempts += 1;
          return Promise.resolve([
            {
              result: {
                ok: true,
                strategy: "tiptap-markdown",
              },
            },
          ]);
        },
      },
      tabs: {
        get(tabId) {
          expect(tabId).toBe(tab.id);
          return Promise.resolve(tab);
        },
        query() {
          return Promise.resolve([tab]);
        },
        update(tabId, properties) {
          expect(tabId).toBe(tab.id);
          updates.push(properties);
          tab.url = properties.url;
          return Promise.resolve(tab);
        },
      },
    });

    await writeWbsbArticle({
      body: "edited body",
      title: "Edited Title",
    });

    expect(updates).toEqual([]);
    expect(writeAttempts).toBe(1);
  });
});
