import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  findIdentifierOnLine,
  findUniqueIdentifier,
  fixtureUri,
  openFixture,
  pollUntil,
  waitForDiagnostics,
  waitForLspReady,
} from "./_helpers.js";

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

      // `Auth` appears twice (declaration + edge reference); target the
      // reference on the edge line specifically.
      const cursor = findIdentifierOnLine(doc, /^MySystem\s*->/, "Auth");

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

      // `SharedAuth` appears in both the import line and the edge line; target
      // the edge reference so the LSP must walk the import to resolve it.
      const cursor = findIdentifierOnLine(main, /SharedAuth\s*->/, "SharedAuth");

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

      const cursor = findUniqueIdentifier(doc, "ECPlatform");

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

      const cursor = findUniqueIdentifier(doc, "Payment");

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
    it("publishes an error diagnostic anchored near the unclosed brace", async () => {
      const doc = await openFixture("at-0037/syntax-error.krs");
      await waitForLspReady(doc.uri);

      const diags = await waitForDiagnostics(doc.uri, (d) =>
        d.some((diag) => diag.severity === vscode.DiagnosticSeverity.Error),
      );
      const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.ok(errors.length > 0, "expected at least one error diagnostic");

      // The fixture's first line is `system Broken {` which is syntactically
      // valid; the unclosed brace begins at `service Foo {` (line index 1).
      // Assert at least one error is anchored on or after that line, so a
      // future regression that publishes an error at line 0 (the wrong place)
      // is caught.
      const minLine = errors.reduce(
        (acc, e) => Math.min(acc, e.range.start.line),
        Number.POSITIVE_INFINITY,
      );
      assert.ok(
        minLine >= 1,
        `expected the earliest error diagnostic to be on line >= 2 (1-based), got line ${minLine + 1}`,
      );
    });
  });
});

describe("AT-1177 — Tidy Style formatting", () => {
  // The extension registers no formatter of its own: `documentFormattingProvider`
  // comes from the LSP server, which routes by languageId (`krs-style` →
  // tidyStyleSheet, `krs` → the source formatter). These tests drive that
  // route through the real extension host via the public
  // `vscode.executeFormatDocumentProvider` command — no `File: Open File...`
  // dialog and no WebView, so they run in this in-process suite harness.

  const FORMAT_POLL_INTERVAL_MS = 100;
  const FORMAT_TIMEOUT_MS = 15_000;

  /**
   * Request document-formatting edits for `uri`, polling until the provider
   * returns a non-empty edit list. The language client starts asynchronously
   * on activation, and `executeFormatDocumentProvider` resolves to
   * `undefined` while no provider is registered yet — both fixtures are
   * deliberately non-tidy, so a ready provider always yields edits.
   */
  async function formatDocumentEdits(uri: vscode.Uri): Promise<vscode.TextEdit[]> {
    return pollUntil(
      async () => {
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
          "vscode.executeFormatDocumentProvider",
          uri,
          { tabSize: 2, insertSpaces: true },
        );
        return Array.isArray(edits) && edits.length > 0 ? edits : undefined;
      },
      {
        timeoutMs: FORMAT_TIMEOUT_MS,
        intervalMs: FORMAT_POLL_INTERVAL_MS,
        message: `formatting provider returned no edits for ${uri.toString()} within ${FORMAT_TIMEOUT_MS}ms`,
      },
    );
  }

  async function applyEdits(doc: vscode.TextDocument, edits: vscode.TextEdit[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(doc.uri, edits);
    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    assert.ok(applied, "workspace.applyEdit should apply the formatting edits");
  }

  it("formats a .krs.style buffer to tidied output", async () => {
    const doc = await openFixture("at-1177/messy.krs.style");
    // Routing precondition: VS Code must classify *.krs.style as `krs-style`
    // (not `krs`), or the server would run the wrong formatter.
    assert.strictEqual(doc.languageId, "krs-style");

    const edits = await formatDocumentEdits(doc.uri);
    await applyEdits(doc, edits);

    // Tidy output: duplicate-free rules, axis-ordered declarations
    // (color/visual before shape/karasu), canonical multi-line form. The
    // buffer is updated without saving — the format target is the unsaved
    // buffer (AT-1177 AT-L).
    assert.strictEqual(
      doc.getText(),
      "service {\n  color: red;\n  shape: user;\n}\n\ndomain {\n  color: blue;\n}\n",
    );
    assert.strictEqual(doc.isDirty, true, "tidy should edit the buffer, not write the file");
  });

  it("formats a .krs buffer with the source formatter, not tidy-style", async () => {
    const doc = await openFixture("at-1177/unformatted.krs");
    assert.strictEqual(doc.languageId, "krs");

    const edits = await formatDocumentEdits(doc.uri);
    await applyEdits(doc, edits);

    // The source formatter normalizes indentation and blank lines while
    // preserving the .krs structure. Running tidy-style here instead would
    // mangle the source into style-sheet rules (`system {\n  Shop: { ... `),
    // so this exact match proves the `krs` languageId routed to the source
    // formatter (AT-1177 AT-N).
    assert.strictEqual(
      doc.getText(),
      "system Shop {\n  service Api {}\n\n  service Billing {}\n}\n",
    );
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
