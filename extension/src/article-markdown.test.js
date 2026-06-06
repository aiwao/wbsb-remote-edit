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

    expect(markdown).toBe("first\nsecond");
  });

  it("keeps textless elements that still produce markdown", () => {
    const markdown = articleBodyChildrenToMarkdown([
      articleChild({ html: "<p>first</p>", text: "first" }),
      articleChild({ html: "<hr>", matches: true }),
      articleChild({ html: "<p>second</p>", text: "second" }),
    ]);

    expect(markdown).toBe("first\n\n* * *\n\nsecond");
  });

  it("converts tight ProseMirror article blocks without blank lines after every line", () => {
    const markdown = articleBodyChildrenToMarkdown([
      articleChild({ html: "<p>sikko</p>", text: "sikko" }),
      articleChild({ html: '<p><br class="ProseMirror-trailingBreak"></p>' }),
      articleChild({ html: "<p>a</p>", text: "a" }),
      articleChild({ html: '<p><br class="ProseMirror-trailingBreak"></p>' }),
      articleChild({
        html: '<ul class="tight" data-tight="true"><li><p>a</p></li></ul>',
        text: "a",
      }),
      articleChild({ html: "<p>    </p>", text: "    " }),
      articleChild({
        html: '<ul class="tight" data-tight="true"><li><p>a</p></li></ul>',
        text: "a",
      }),
      articleChild({ html: "<p>sikkkooo</p>", text: "sikkkooo" }),
      articleChild({ html: "<p>oookfek</p>", text: "oookfek" }),
      articleChild({
        html: '<p data-placeholder="本文を入力してください" class="is-empty"><br class="ProseMirror-trailingBreak"></p>',
      }),
      articleChild({ html: "<p>feaokfewok</p>", text: "feaokfewok" }),
      articleChild({ html: '<p><br class="ProseMirror-trailingBreak"></p>' }),
      articleChild({
        html: '<ul class="tight" data-tight="true"><li><p>a</p></li><li><p>a</p></li><li><p>a</p></li></ul>',
        text: "aaa",
      }),
      articleChild({
        html: '<ol class="tight" data-tight="true"><li><p>a</p></li><li><p>a</p></li><li><p>a</p></li></ol>',
        text: "aaa",
      }),
      articleChild({ html: '<p><br class="ProseMirror-trailingBreak"></p>' }),
    ]);

    expect(markdown).toBe(
      [
        "sikko",
        "a",
        "* a",
        "* a",
        "sikkkooo",
        "oookfek",
        "feaokfewok",
        "* a",
        "* a",
        "* a",
        "1. a",
        "2. a",
        "3. a",
      ].join("\n"),
    );
  });
});
