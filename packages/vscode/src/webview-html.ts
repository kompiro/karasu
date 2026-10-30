/**
 * The page the preview webview loads (#3312): a root for the viewer, its
 * script and stylesheet from `out/webview/`, and the start values as JSON.
 * Written once per panel; after that the host and the viewer only exchange
 * messages, so a drill or a view switch never reloads the page.
 *
 * Kept free of any `vscode` import so the CSP and the escaping can be
 * unit-tested; `preview-panel.ts` supplies the webview's URIs and CSP source.
 */
import { randomBytes } from "node:crypto";
import {
  WEBVIEW_INIT_ELEMENT_ID,
  type WebviewInit,
} from "@karasu-tools/app/vscode-webview-protocol";

export interface WebviewHtmlParams {
  /** `webview.cspSource`: the origin the webview serves extension files from. */
  cspSource: string;
  nonce: string;
  /** `asWebviewUri` of `out/webview/viewer.js` and `viewer.css`. */
  scriptUri: string;
  styleUri: string;
  init: WebviewInit;
}

/** A fresh nonce for the page's one script. */
export function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * The page's CSP (#2996 decision 2). Scripts only with the nonce or from the
 * extension; styles from the extension plus inline, which the SVG's own
 * `<style>` and React's style attributes need; images from the extension and
 * `data:` (the stylesheet's select chevron). Nothing reaches the network.
 */
export function webviewCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
  ].join("; ");
}

// U+2028 and U+2029, spelled as escapes so the source stays ASCII.
const LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * JSON that is safe inside a `<script>` element: a path containing `</script>`
 * or `<!--` would otherwise end the element early. The two line separators
 * are escaped too, though a JSON data block is never evaluated as script.
 */
function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATORS, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
}

export function buildWebviewHtml(params: WebviewHtmlParams): string {
  const { cspSource, nonce, scriptUri, styleUri, init } = params;
  return `<!doctype html>
<html lang="${init.locale}" data-theme="${init.theme}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(webviewCsp(cspSource, nonce))}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>karasu Preview</title>
    <link rel="stylesheet" href="${escapeAttribute(styleUri)}" />
    <style nonce="${nonce}">
      /* VS Code pads a webview's body; the preview fills the panel instead. */
      body {
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      #root {
        flex: 1 1 auto;
        min-height: 0;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="application/json" id="${WEBVIEW_INIT_ELEMENT_ID}">${scriptSafeJson(init)}</script>
    <script type="module" nonce="${nonce}" src="${escapeAttribute(scriptUri)}"></script>
  </body>
</html>
`;
}
