import * as assert from "node:assert";
import * as vscode from "vscode";
import { fixtureUri, openFixture, waitForDiagnostics, waitForLspReady } from "./_helpers.js";

describe("AT-0037 — Phase 5 LSP features", () => {
  describe("AT-0037-1: keyword completion", () => {
    it("offers `system` after typing `sys` on a fresh line", async () => {
      const doc = await openFixture("at-0037/single-system.krs");
      await waitForLspReady(doc.uri);

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor && editor.document.uri.toString() === doc.uri.toString());

      // Append a new line containing `sys` and request completion at end-of-line.
      const insertAt = new vscode.Position(doc.lineCount, 0);
      await editor.edit((b) => b.insert(insertAt, "\nsys"));
      const triggerPos = new vscode.Position(insertAt.line + 1, 3);

      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        doc.uri,
        triggerPos,
      );

      const labels = list.items.map((i) => (typeof i.label === "string" ? i.label : i.label.label));
      assert.ok(
        labels.includes("system"),
        `expected 'system' keyword in completion, got ${labels.join(",")}`,
      );
      // A few other keywords from the AT description.
      for (const kw of ["service", "domain", "usecase", "resource", "user", "deploy"]) {
        assert.ok(labels.includes(kw), `expected '${kw}' keyword in completion`);
      }
    });
  });

  describe("AT-0037-2: identifier completion", () => {
    it("offers `Payment` as a reference in the same file", async () => {
      const doc = await openFixture("at-0037/single-system.krs");
      await waitForLspReady(doc.uri);

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor);
      const insertAt = new vscode.Position(doc.lineCount, 0);
      await editor.edit((b) => b.insert(insertAt, "\nPay"));
      const triggerPos = new vscode.Position(insertAt.line + 1, 3);

      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        doc.uri,
        triggerPos,
      );
      const reference = list.items.find(
        (i) =>
          (typeof i.label === "string" ? i.label : i.label.label) === "Payment" &&
          i.kind === vscode.CompletionItemKind.Reference,
      );
      assert.ok(reference, "expected `Payment` as a reference completion item");
    });
  });

  describe("AT-0037-3: go to definition (same file)", () => {
    it("jumps from edge reference `Auth` to `service Auth`", async () => {
      const doc = await openFixture("at-0037/edges.krs");
      await waitForLspReady(doc.uri);

      // `MySystem -> Auth "calls"` is on line index 3 (0-based); place cursor on `Auth`.
      const edgeLineIdx = doc
        .getText()
        .split("\n")
        .findIndex((l) => l.startsWith("MySystem ->"));
      assert.ok(edgeLineIdx >= 0, "edge line not found in fixture");
      const lineText = doc.lineAt(edgeLineIdx).text;
      const authCol = lineText.indexOf("Auth");
      assert.ok(authCol >= 0);
      const cursor = new vscode.Position(edgeLineIdx, authCol + 1);

      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeDefinitionProvider",
        doc.uri,
        cursor,
      );
      assert.ok(locations.length > 0, "expected at least one definition location");
      const target = locations[0];
      assert.strictEqual(target.uri.toString(), doc.uri.toString());

      // Target line should contain `service Auth`.
      const targetLine = doc.lineAt(target.range.start.line).text;
      assert.match(targetLine, /service\s+Auth\b/);
    });
  });

  describe("AT-0037-4: go to definition (cross-file)", () => {
    it("jumps from `SharedAuth` in main.krs to base.krs", async () => {
      const main = await openFixture("at-0037/cross-file/main.krs");
      await waitForLspReady(main.uri);

      const text = main.getText();
      const lines = text.split("\n");
      const refLineIdx = lines.findIndex((l) => l.includes("SharedAuth -> Platform"));
      assert.ok(refLineIdx >= 0, "SharedAuth reference line not found in main.krs");
      const col = lines[refLineIdx].indexOf("SharedAuth");
      const cursor = new vscode.Position(refLineIdx, col + 1);

      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeDefinitionProvider",
        main.uri,
        cursor,
      );
      assert.ok(locations.length > 0, "expected at least one definition location");
      const target = locations[0];
      const baseUri = fixtureUri("at-0037/cross-file/base.krs");
      assert.strictEqual(target.uri.toString(), baseUri.toString(), "should jump into base.krs");
    });
  });

  describe("AT-0037-5: hover with description", () => {
    it("returns markdown description on hover over the node identifier", async () => {
      const doc = await openFixture("at-0037/with-description.krs");
      await waitForLspReady(doc.uri);

      const lines = doc.getText().split("\n");
      const lineIdx = lines.findIndex((l) => l.startsWith("system ECPlatform"));
      assert.ok(lineIdx >= 0);
      const col = lines[lineIdx].indexOf("ECPlatform");
      const cursor = new vscode.Position(lineIdx, col + 2);

      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        doc.uri,
        cursor,
      );
      assert.ok(hovers && hovers.length > 0, "expected hover content for ECPlatform");
      const text = hoverText(hovers);
      assert.match(text, /EC platform for online shopping/);
    });
  });

  describe("AT-0037-6: hover on a node without description", () => {
    it("returns no hover content for a node that has no description property", async () => {
      const doc = await openFixture("at-0037/single-system.krs");
      await waitForLspReady(doc.uri);

      const lines = doc.getText().split("\n");
      const lineIdx = lines.findIndex((l) => l.includes("service Payment"));
      assert.ok(lineIdx >= 0);
      const col = lines[lineIdx].indexOf("Payment");
      const cursor = new vscode.Position(lineIdx, col + 2);

      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        doc.uri,
        cursor,
      );
      const meaningful = (hovers ?? []).filter((h) => hoverText([h]).trim().length > 0);
      assert.strictEqual(
        meaningful.length,
        0,
        "expected no hover content when description is absent",
      );
    });
  });

  describe("AT-0037-7: outline / document symbols", () => {
    it("emits the expected nested symbol hierarchy", async () => {
      const doc = await openFixture("at-0037/outline-hierarchy.krs");
      await waitForLspReady(doc.uri);

      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        "vscode.executeDocumentSymbolProvider",
        doc.uri,
      );
      assert.ok(Array.isArray(symbols));

      const ec = symbols.find((s) => s.name === "ECPlatform");
      assert.ok(ec, "ECPlatform top-level symbol missing");
      assert.strictEqual(ec.kind, vscode.SymbolKind.Module);

      const ecommerce = ec.children.find((c) => c.name === "ECommerce");
      assert.ok(ecommerce, "ECommerce child missing");
      assert.strictEqual(ecommerce.kind, vscode.SymbolKind.Class);

      const order = ecommerce.children.find((c) => c.name === "Order");
      assert.ok(order, "Order child missing");
      assert.strictEqual(order.kind, vscode.SymbolKind.Namespace);

      const prod = symbols.find((s) => s.name === "prod");
      assert.ok(prod, "prod deploy block missing");
      assert.strictEqual(prod.kind, vscode.SymbolKind.Module);

      const apiServer = prod.children.find((c) => c.name === "ApiServer");
      assert.ok(apiServer, "ApiServer node missing");
      assert.strictEqual(apiServer.kind, vscode.SymbolKind.Variable);
    });
  });

  describe("AT-0037-8: diagnostics regression", () => {
    it("publishes at least one error diagnostic for a syntactically broken file", async () => {
      const doc = await openFixture("at-0037/syntax-error.krs");
      await waitForLspReady(doc.uri);

      const diags = await waitForDiagnostics(doc.uri, (d) =>
        d.some((diag) => diag.severity === vscode.DiagnosticSeverity.Error),
      );
      assert.ok(diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error));
    });
  });
});

function hoverText(hovers: readonly vscode.Hover[]): string {
  const parts: string[] = [];
  for (const h of hovers) {
    for (const c of h.contents) {
      if (typeof c === "string") parts.push(c);
      else if ("value" in c && typeof c.value === "string") parts.push(c.value);
    }
  }
  return parts.join("\n");
}
