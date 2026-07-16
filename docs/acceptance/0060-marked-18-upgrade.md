# Acceptance Test: marked 17 → 18 upgrade

## Summary

Verify that the upgrade of `marked` from `17.0.6` to `18.0.2` in `packages/app`
does not introduce visible regressions in markdown rendering. The v18 release
ships parser-level changes that *could* affect rendered output:

- Block tokens now trim trailing blank lines (internal; should not change HTML output for our usage).
- GFM tables no longer greedily capture trailing newlines.
- Headings / definitions no longer swallow multiple trailing newlines.
- 18.0.2 fixes an infinite-loop regression in indented code blocks with blank lines.

Tracked via ADR #773 and issue #769.

`marked` is used in two places in `packages/app`:

- `packages/app/src/components/NodeDetailPanel.tsx` — renders `metadata.description` for nodes.
- `packages/app/src/components/ChatPane.tsx` — renders assistant chat messages.

Both paths pass the parsed HTML through DOMPurify before mounting.

---

## Prerequisites

- Checkout of `chore/marked-18` branch (or the replacement PR once opened).
- App running: `pnpm --filter @karasu-tools/app dev`.
- A `.krs` file with rich node descriptions available (see fixtures below).

---

## Automated coverage

- `packages/app/src/components/NodeDetailPanel.test.tsx`
  — existing tests cover basic bold/italic/inline-code markdown and `<script>`
    XSS sanitization.
  — new regression guards added for v18 edge cases:
    - `renders GFM tables without swallowing trailing newlines`
    - `renders headings followed by blank lines`
    - `renders indented code blocks with embedded blank lines`
- `packages/app/src/components/ChatPane.test.tsx`
  — assistant-message markdown rendering (`renders bold text in assistant
    messages`) and sanitization (`sanitizes XSS in assistant messages`).
- `pnpm --filter @karasu-tools/app test` passes 477 / 477 on this branch.
- `pnpm --filter @karasu-tools/app typecheck` passes.

---

## Manual verification checklist

Copy the fixture markdown below into a `description` field for a node
(or paste into the chat input) and confirm the rendered output in the
panel matches the expected behavior.

### TC-1 — Basic inline formatting (NodeDetailPanel)

Description:

```
This is **bold**, *italic*, and `inline code`.
```

> ✅ Automated by `packages/app/src/components/NodeDetailPanel.test.tsx` (suite-wide) — `renders markdown description as HTML`（`<strong>` / `<em>` / `<code>` の DOM 構造を検証。実ブラウザでの見た目の live-paint は任意の目視確認）

- [x] `bold` is rendered with `<strong>`.
- [x] `italic` is rendered with `<em>`.
- [x] `inline code` is rendered with `<code>`.

### TC-2 — GFM table with content after (NodeDetailPanel)

Description:

```
| Column A | Column B |
|----------|----------|
| value 1  | value 2  |
| value 3  | value 4  |

Trailing paragraph after the table.
```

> ✅ Automated by `packages/app/src/components/NodeDetailPanel.test.tsx` (suite-wide) — `renders GFM tables without swallowing trailing newlines`（`<table>` 描画とテーブル後続段落の分離を DOM で検証）

- [x] Table renders with two columns, two data rows.
- [x] "Trailing paragraph after the table." renders as a paragraph *after* the table (v18 no longer swallows trailing newlines into the table token).

### TC-3 — Heading followed by blank lines (NodeDetailPanel)

Description:

```
# Heading


Paragraph after two blank lines.
```

> ✅ Automated by `packages/app/src/components/NodeDetailPanel.test.tsx` (suite-wide) — `renders headings followed by blank lines`（`<h1>` と後続 `<p>` が独立して描画されることを検証）

- [x] `Heading` renders as `<h1>`.
- [x] `Paragraph after two blank lines.` renders as a separate paragraph, not concatenated to the heading.

### TC-4 — Indented code block with embedded blank line (NodeDetailPanel)

Description:

```
    line one

    line three
```

> ✅ Automated by `packages/app/src/components/NodeDetailPanel.test.tsx` (suite-wide) — `renders indented code blocks with embedded blank lines`（両行が単一 `<pre><code>` に入ることを検証。テストが完走すること自体が 18.0.2 の無限ループ回帰の検出になる）

- [x] Both lines appear inside a single `<pre><code>` block; the page does not hang (18.0.2 infinite-loop fix).

### TC-5 — XSS sanitization still active (NodeDetailPanel)

Description:

```
<script>alert(1)</script>safe text
```

> ✅ Automated by `packages/app/src/components/NodeDetailPanel.test.tsx` (suite-wide) — `sanitizes XSS in description — <script> tag is removed`（`<script>` 要素の不在と `safe text` の残存を DOM で検証。script が除去される以上 alert は発火し得ない）

- [x] No alert fires.
- [x] `safe text` is visible.
- [x] No `<script>` element present in the DOM of the panel.

### TC-6 — ChatPane assistant response rendering

In the chat UI, send a message whose assistant reply contains any of the
markdown patterns from TC-1–TC-4. Confirm:

- [ ] Tables, headings, code blocks, and inline formatting render as expected.
- [ ] No console errors from marked or DOMPurify.

> 🟡 Partially automated — `packages/app/src/components/ChatPane.test.tsx` › `renders bold text in assistant messages` / `sanitizes XSS in assistant messages`（assistant メッセージのマークダウン描画とサニタイズは jsdom で fence 済み。table / heading / code の実チャットセッションでの live-paint と console エラー無しの確認は手動）

---

## Exit criteria

All six TCs pass and `pnpm --filter @karasu-tools/app test` / `typecheck`
remain green.
