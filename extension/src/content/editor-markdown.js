export function hasLaterContent(tokens, index) {
  return tokens.slice(index + 1).some((token) => {
    if (token.type !== "text") {
      return true;
    }
    return token.text.replace(/\n/g, "").length > 0;
  });
}

export function consumeCodeFenceSeparatorBreak(tokens, index) {
  if (tokens[index]?.type !== "code") {
    return;
  }

  const nextToken = tokens[index + 1];
  if (nextToken?.type === "text" && nextToken.text.startsWith("\n")) {
    nextToken.text = nextToken.text.slice(1);
  }
}
