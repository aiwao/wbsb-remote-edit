import { describe, expect, it } from "vite-plus/test";
import { consumeCodeFenceSeparatorBreak, hasLaterContent } from "./editor-markdown.js";

describe("editor markdown helpers", () => {
  it("preserves a blank line after a markdown list", () => {
    const tokens = [
      {
        items: ["first"],
        marker: "-",
        ordered: false,
        type: "list",
      },
      {
        text: "\nsecond",
        type: "text",
      },
    ];

    consumeCodeFenceSeparatorBreak(tokens, 0);

    expect(tokens[1].text).toBe("\nsecond");
  });

  it("consumes only the structural newline after fenced code", () => {
    const tokens = [
      {
        code: "console.log(1)",
        language: "js",
        type: "code",
      },
      {
        text: "\nnext",
        type: "text",
      },
    ];

    consumeCodeFenceSeparatorBreak(tokens, 0);

    expect(tokens[1].text).toBe("next");
  });

  it("keeps an intentional blank line after fenced code", () => {
    const tokens = [
      {
        code: "console.log(1)",
        language: "js",
        type: "code",
      },
      {
        text: "\n\nnext",
        type: "text",
      },
    ];

    consumeCodeFenceSeparatorBreak(tokens, 0);

    expect(tokens[1].text).toBe("\nnext");
  });

  it("detects later non-empty text content", () => {
    expect(
      hasLaterContent(
        [
          { text: "\n", type: "text" },
          { text: "next", type: "text" },
        ],
        0,
      ),
    ).toBe(true);
  });
});
