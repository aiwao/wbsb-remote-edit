import { describe, expect, it } from "vite-plus/test";
import { markdownTokens } from "./markdown-tokens.js";

describe("markdownTokens", () => {
  it("groups unordered list items so later markers are not typed again", () => {
    expect(markdownTokens("- first\n- second\n")).toEqual([
      {
        items: ["first", "second"],
        marker: "-",
        ordered: false,
        type: "list",
      },
    ]);
  });

  it("keeps the first ordered marker and stores later item text only", () => {
    expect(markdownTokens("3. first\n4. second\n")).toEqual([
      {
        items: ["first", "second"],
        marker: "3.",
        ordered: true,
        type: "list",
      },
    ]);
  });

  it("does not parse list-looking lines inside fenced code", () => {
    expect(markdownTokens("```js\n- not a list\n```")).toEqual([
      {
        code: "- not a list",
        language: "js",
        type: "code",
      },
    ]);
  });
});
