export function readWbsbArticleTitleFromPage() {
  const titleXPath = "/html/body/div[1]/main/div/div/div[2]/div[3]/input";
  const titleElement = document.evaluate(
    titleXPath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;

  return titleElement ? titleElement.value.trim() : "";
}
