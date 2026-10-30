import { describe, expect, it } from "vitest";
import { buildWebviewHtml, generateNonce, webviewCsp } from "./webview-html.js";

const CSP_SOURCE = "https://file+.vscode-resource.vscode-cdn.net";

function page(entryPath = "/p/index.krs") {
  return buildWebviewHtml({
    cspSource: CSP_SOURCE,
    nonce: "N0NCE",
    scriptUri: `${CSP_SOURCE}/ext/out/webview/viewer.js`,
    styleUri: `${CSP_SOURCE}/ext/out/webview/viewer.css`,
    init: { entryPath, theme: "dark", locale: "ja" },
  });
}

describe("webviewCsp (#3312)", () => {
  it("denies by default and reaches nothing outside the extension", () => {
    const csp = webviewCsp(CSP_SOURCE, "N0NCE");
    expect(csp.startsWith("default-src 'none'")).toBe(true);
    expect(csp).toContain(`script-src 'nonce-N0NCE' ${CSP_SOURCE}`);
    expect(csp).not.toMatch(/https:\/\/(?!file\+)/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("buildWebviewHtml (#3312)", () => {
  it("loads the staged script with the nonce and the staged stylesheet", () => {
    const html = page();
    expect(html).toContain(
      `<script type="module" nonce="N0NCE" src="${CSP_SOURCE}/ext/out/webview/viewer.js"></script>`,
    );
    expect(html).toContain(
      `<link rel="stylesheet" href="${CSP_SOURCE}/ext/out/webview/viewer.css" />`,
    );
  });

  it("paints in the editor's theme and language before the script runs", () => {
    expect(page()).toContain('<html lang="ja" data-theme="dark">');
  });

  it("writes the start values as a JSON data block", () => {
    const html = page();
    const json = html.match(
      /<script type="application\/json" id="karasu-webview-init">(.*?)<\/script>/,
    )?.[1];
    expect(JSON.parse(json ?? "null")).toEqual({
      entryPath: "/p/index.krs",
      theme: "dark",
      locale: "ja",
    });
  });

  it("keeps a path that contains </script> inside the data block", () => {
    const html = page("/p/</script><script>alert(1)</script>.krs");
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const json = html.match(/id="karasu-webview-init">(.*?)<\/script>/)?.[1];
    expect(JSON.parse(json ?? "null").entryPath).toBe("/p/</script><script>alert(1)</script>.krs");
  });

  it("runs no inline script", () => {
    const scripts = page().match(/<script(?![^>]*type="application\/json")[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain("src=");
  });
});

describe("generateNonce", () => {
  it("is fresh each time", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
