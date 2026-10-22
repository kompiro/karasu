import { WEBVIEW_INIT_ELEMENT_ID, type HostMessage, type WebviewInit } from "./protocol.js";

/**
 * Reads the start values the host wrote into the page. A page without them
 * cannot show anything sensible, so it fails loudly instead of guessing.
 */
export function readWebviewInit(doc: Document): WebviewInit {
  const text = doc.getElementById(WEBVIEW_INIT_ELEMENT_ID)?.textContent;
  if (!text) throw new Error(`The page has no #${WEBVIEW_INIT_ELEMENT_ID} start values.`);
  const value = JSON.parse(text) as Partial<WebviewInit>;
  if (
    typeof value.entryPath !== "string" ||
    (value.theme !== "light" && value.theme !== "dark") ||
    (value.locale !== "en" && value.locale !== "ja")
  ) {
    throw new Error(`#${WEBVIEW_INIT_ELEMENT_ID} does not hold valid start values.`);
  }
  return { entryPath: value.entryPath, theme: value.theme, locale: value.locale };
}

const HOST_MESSAGE_TYPES = new Set<HostMessage["type"]>([
  "fsResult",
  "setEntry",
  "filesChanged",
  "setTheme",
  "highlight",
]);

/**
 * Whether a `message` event's data is one of the host's messages. The host is
 * the only sender, but the webview sees every `message` event on its window,
 * so it reads only the shapes it knows.
 */
export function isHostMessage(data: unknown): data is HostMessage {
  if (typeof data !== "object" || data === null) return false;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" && HOST_MESSAGE_TYPES.has(type as HostMessage["type"]);
}
