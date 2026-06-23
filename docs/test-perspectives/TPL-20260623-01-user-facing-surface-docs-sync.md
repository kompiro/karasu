---
id: TPL-20260623-01
title: "user-facing な app/CLI surface の変更は docs/tools の両ロケール + reference に反映する"
status: active
date: 2026-06-23
applicable_to:
  - "app に user-facing な操作面（keyboard shortcut / toolbar action / diagram view）を追加・変更・削除するとき"
  - "CLI に subcommand / flag を追加・変更・削除するとき"
  - "`docs/tools/*.md` のような「実装の操作面を手書きで説明するページ」を持つとき（原典が code 側にあり、doc が静かに drift する構造）"
known_consumers:
  - docs-site
  - app
  - cli
discovered_from:
  - root_cause_file: "docs/tools/app.md"
  - root_cause_file: "scripts/lint/app-shortcut-docs-sync.ts"
related_to:
  - TPL-20260616-01
  - TPL-20260511-02
topic: build
scope:
  packages:
    - app
    - cli
    - docs-site
---

# TPL-20260623-01: user-facing な app/CLI surface の変更は docs/tools の両ロケール + reference に反映する

## 観点

`docs/tools/*.md`（app / CLI の使い方ページ）は、実装の **user-facing な操作面** — keyboard shortcut、toolbar action、diagram view、CLI の subcommand / flag — を **手書きの散文** で説明している。`docs/spec/*` の表が `reference-data.ts` から生成され `reference-docs-check` で守られているのと違い、これらのページには原典（code）と doc を結ぶ機械的な紐付けが無い。

したがって操作面を足す・変える・消すと、doc は **静かに drift** する。これは TPL-20260511-02（spec doc ↔ reference data の片方向同期）/ TPL-20260616-01（docs パイプラインの link/anchor 解決）と同じ「同じ意図を 2 つの表現で持つ」構造であり、その操作面（UI/CLI）軸版にあたる。

surface は 2 つに分かれ、扱う道具が違う:

- **enumerable な slice**（keyboard shortcut）— code 側に `keybinding` chord という単一の真実があるので **機械チェックできる**。`scripts/lint/app-shortcut-docs-sync.ts` が「app の全 `keybinding` が両ロケールの doc に載っているか」を検証する。
- **non-enumerable な slice**（toolbar action / view / CLI flag）— 列挙の単一ソースが無いので **レビュー時のチェックリスト**（この TPL）で担保する。

## 想定される失敗モード

- app に shortcut / view / toolbar button を足したが `docs/tools/app.md` が古いまま → ユーザーが機能を発見できない、または存在しない操作を案内される。ビルドは緑で、公開されたサイトで初めて気づく。
- 実例: #1710 で `docs/tools/app.md` が command palette の `Cmd+Shift+P` を載せずに公開された（レビューで後追い追加。#1714）。
- en だけ・ja だけ更新して **片側の locale が drift** する（spec-structure-sync と同種）。
- CLI に flag を足したが CLI ページに反映されず、`--help` を読まないと分からない。

## チェックリスト

- [ ] 追加 / 変更した **keyboard shortcut**（`keybinding` chord）を `docs/tools/app.md` と `app.ja.md` の両方に載せたか（`pnpm lint:app-shortcut-docs-sync` が緑か）。doc に載せない判断なら `scripts/lint/app-shortcut-docs-sync.ts` の `DOC_EXEMPT` に理由付きで追加したか。
- [ ] 追加 / 変更した **toolbar action / diagram view** を `docs/tools` の該当節（en + ja の両方）に反映したか。
- [ ] 追加 / 変更した **CLI subcommand / flag** を `docs/tools` の CLI ページ（en + ja の両方）に反映したか（CLI ページ着地後）。
- [ ] 反映を **en と ja の双方** に入れたか（片側だけは drift）。
- [ ] その表が `reference-data.ts` 由来など **機械生成できる** ものなら、手書きせず生成側を更新したか。

## 既知の対処パターン

- **enumerable slice の機械チェック**: `scripts/lint/app-shortcut-docs-sync.ts`（app の全 `keybinding` を収集 → 正規化した表示形を両ロケール doc に対し substring 照合）。lefthook の `app-shortcut-docs-sync`（glob `packages/app/src/**` + `docs/tools/**`）と `scripts` vitest プロジェクト経由で CI gating。意図的な非掲載は `DOC_EXEMPT` に理由付きで明示する escape hatch。
- **機械生成できる表**: `reference-data.ts` → `scripts/reference/gen-docs.ts`（`--check` で drift を fail）。
- **non-enumerable slice**: この TPL のチェックリスト + PR テンプレートのレビュー項目。

## 関連テスト

- `scripts/lint/app-shortcut-docs-sync.test.ts`（`chordToDisplay` / `collectChords` の単体 + 実 doc が同期している統合アサーション）
