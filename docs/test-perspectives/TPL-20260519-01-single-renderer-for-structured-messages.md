---
id: TPL-20260519-01
title: "構造化メッセージ（Warning / Diagnostic）の文字列化は単一の renderer に集約する"
status: active
date: 2026-05-19
applicable_to:
  - "WarningKind / DiagnosticCode のような discriminated union を、表示用文字列へ変換する関数を追加・変更するとき"
  - "同じ構造化データを複数の consumer（app / lsp / cli）が別経路で文字列化しているとき"
  - "i18n 対応や locale 追従を、一部の consumer にだけ入れるとき"
related_to:
  - TPL-20260510-18
discovered_from:
  - issue: "#1417"
  - root_cause_adr: "ADR-20260420-03"
topic: core-concepts
scope:
  packages:
    - core
    - i18n
    - app
    - lsp
    - cli
---

# TPL-20260519-01: 構造化メッセージ（Warning / Diagnostic）の文字列化は単一の renderer に集約する

## 観点

karasu の `Warning` / `Diagnostic` は `kind` / `code` + `params` の構造化データで、
**表示文字列を持たない**（言語非依存）。これを人間可読な文字列へ変換する処理は
**単一の renderer に集約する**。`WarningKind` / `DiagnosticCode` を `switch` で
文字列化する関数が 2 つ以上存在すると、片方の文言・言語を更新しても他方に伝播せず、
consumer ごとに表示が割れる。

これは TPL-20260510-18（`.krs` テキストを single source of truth にする）の
「表示文字列版」にあたる原則 — **同じ意味の出力は 1 箇所からしか生成しない**。

## 想定される失敗モード

実際に #1417 で起きた事故: i18n ロールアウト（ADR-20260420-03）で app は
`renderWarning`（`@karasu-tools/i18n`）に移行した一方、lsp / cli は core の
互換ブリッジ `formatWarning()` を使い続けた。ブリッジは `WarningKind` ごとに
文字列をハードコードしており、一部のブランチが英語・一部が日本語のまま正規化
されず放置された。結果、VS Code の Problems パネルに英語と日本語の警告が混在した。

一般化すると、文字列化経路が複数あると次が起きる:

- 片方の renderer にだけ新しい `kind` / `code` のブランチを足し、もう片方が
  実行時に `undefined` / 例外 / 旧文言を出す
- 片方だけ i18n 化され、もう片方が言語ハードコードのまま取り残される（#1417）
- 文言の修正が片方にだけ入り、consumer によって文言が食い違う

## チェックリスト

新しく構造化メッセージの文字列化を書く / 触るときに確認する:

- [ ] `WarningKind` / `DiagnosticCode` を `switch` で文字列化する関数が、その用途
      （ユーザー向け表示）について 1 つだけか。2 つ目を足そうとしていないか
- [ ] 新しい consumer（app / lsp / cli / その他）は、既存の共有 renderer
      （`@karasu-tools/i18n` の `renderWarning` / `renderDiagnostic`）を呼んでいるか。
      独自の文字列化を再実装していないか
- [ ] やむを得ず別の文字列化関数を残す場合（例: core 内部のエラーメッセージ —
      core は `@karasu-tools/i18n` に依存できないため）、それが**ユーザー向けでない**
      ことを確認し、共有 renderer と文言が乖離しても害がない範囲に閉じているか。
      その旨をコード上のコメントで明示し、この TPL を参照しているか
- [ ] union に `kind` / `code` を追加したとき、すべての renderer が網羅性チェック
      （`never` 検査など）で更新漏れを検出できるか

## 既知の対処パターン

- **共有 renderer に集約**: `@karasu-tools/i18n` の `renderWarning(w, t)` /
  `renderDiagnostic(d, t)` が `Warning` / `Diagnostic` の唯一のユーザー向け
  文字列化経路。app は React フック、lsp は `initialize` の locale、cli は
  `LANG` / `LC_ALL` でそれぞれ `t` を束ねて同じ renderer を呼ぶ。
- **網羅性の強制**: 各 renderer の `switch` 末尾に `const _: never = x` を置き、
  `kind` / `code` 追加時にコンパイルエラーで更新漏れを検出する。
- **例外的に残す文字列化の隔離**: `packages/core/src/parser/diagnostic-format.ts`
  は core 内部用（built-in stylesheet のパースエラー Error、parser テスト）に
  限定して残してある。`@karasu-tools/i18n` は core に依存するため core から
  逆参照できないことが理由で、ユーザー向け出力には使わない。

## 関連テスト

- `packages/i18n/src/render-warning.test.ts` — `WarningKind` 全件について
  en / ja 両方で空でない・プレースホルダ未解決でないことを検証
- `packages/lsp/src/diagnostics.test.ts` — locale ごとの出力差分（en / ja）
- `packages/cli/src/i18n.test.ts` — `resolveCliLocale` の locale 解決
