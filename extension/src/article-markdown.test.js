import { describe, expect, it } from "vite-plus/test";
import { articleBodyChildrenToMarkdown } from "./article-markdown.js";

function articleChild({ html, text = "", matches = false, hasDescendant = false }) {
  return {
    matches: () => matches,
    outerHTML: html,
    querySelector: () => (hasDescendant ? {} : null),
    textContent: text,
  };
}

describe("articleBodyChildrenToMarkdown", () => {
  it("does not let empty editor blocks add blank markdown lines", () => {
    const markdown = articleBodyChildrenToMarkdown([
      articleChild({ html: "<p>first</p>", text: "first" }),
      articleChild({ html: "<p><br></p>" }),
      articleChild({ html: "<p>second</p>", text: "second" }),
    ]);

    expect(markdown).toBe("first\n\nsecond");
  });

  it("keeps textless elements that still produce markdown", () => {
    const markdown = articleBodyChildrenToMarkdown([
      articleChild({ html: "<p>first</p>", text: "first" }),
      articleChild({ html: "<hr>", matches: true }),
      articleChild({ html: "<p>second</p>", text: "second" }),
    ]);

    expect(markdown).toBe("first\n\n* * *\n\nsecond");
  });
});
