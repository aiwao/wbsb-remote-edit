function lineEndIndex(text, start) {
  const newlineIndex = text.indexOf("\n", start);
  return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

function parseMarkdownListLine(line) {
  const text = line.endsWith("\n") ? line.slice(0, -1) : line;
  const match = /^( {0,3})([-+*]|(\d+)[.)])[ \t]+(.*)$/.exec(text);
  if (!match) {
    return null;
  }

  return {
    marker: match[2],
    ordered: Boolean(match[3]),
    start: match[3] ? Number(match[3]) : 1,
    text: match[4],
  };
}

function markdownTextTokens(text) {
  const tokens = [];
  let cursor = 0;
  let position = 0;

  while (position < text.length) {
    const lineStart = position;
    const lineEnd = lineEndIndex(text, lineStart);
    const firstItem = parseMarkdownListLine(text.slice(lineStart, lineEnd));

    if (!firstItem) {
      position = lineEnd;
      continue;
    }

    const items = [firstItem.text];
    let blockEnd = lineEnd;
    position = lineEnd;

    while (position < text.length) {
      const nextLineEnd = lineEndIndex(text, position);
      const nextItem = parseMarkdownListLine(text.slice(position, nextLineEnd));
      if (!nextItem || nextItem.ordered !== firstItem.ordered) {
        break;
      }

      items.push(nextItem.text);
      blockEnd = nextLineEnd;
      position = nextLineEnd;
    }

    if (cursor < lineStart) {
      tokens.push({ text: text.slice(cursor, lineStart), type: "text" });
    }

    tokens.push({
      items,
      marker: firstItem.ordered ? `${firstItem.start}.` : firstItem.marker,
      ordered: firstItem.ordered,
      type: "list",
    });
    cursor = blockEnd;
  }

  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), type: "text" });
  }

  return tokens;
}

function appendMarkdownTextTokens(tokens, text) {
  tokens.push(...markdownTextTokens(text));
}

export function markdownTokens(markdown) {
  const tokens = [];
  const fencePattern = /(^|\n)```([^\n`]*)\n([\s\S]*?)\n```[^\S\n]*(?=\n|$)/g;
  let cursor = 0;
  let match;

  while ((match = fencePattern.exec(markdown))) {
    const fenceStart = match.index + match[1].length;
    if (cursor < fenceStart) {
      appendMarkdownTextTokens(tokens, markdown.slice(cursor, fenceStart));
    }

    tokens.push({
      code: match[3],
      language: match[2].trim().split(/\s+/)[0] || "",
      type: "code",
    });
    cursor = fencePattern.lastIndex;
  }

  if (cursor < markdown.length) {
    appendMarkdownTextTokens(tokens, markdown.slice(cursor));
  }

  return tokens;
}
