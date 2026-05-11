---
id: ADR-20260511-04
title: user.role キーワードは存続させ、spec で「authz primitive ではない」と明示する（B-soft）
status: accepted
date: 2026-05-11
topic: core-concepts
related_to: [ADR-20260511-02, ADR-20260428-06, ADR-20260312-03]
assumptions:
  - "file: docs/spec/syntax.md"
  - "file: docs/spec/tags-annotations.md"
  - "grep: docs/spec/syntax.md :: role \"<role-name>\""
  - "grep: packages/core/src/types/ast.ts :: \"role\""
---

# ADR-20260511-04: user.role キーワードは存続させ、spec で「authz primitive ではない」と明示する（B-soft）

- **日付**: 2026-05-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1281](https://github.com/kompiro/karasu/issues/1281) — Re-examine the `user.role` keyword
  - 前提 ADR: [ADR-20260511-02](20260511-02-no-runtime-authz-modeling.md) — 実行時認可は karasu の語彙に取り込まない（本 ADR はその ADR が明示的に「別 Issue で扱う」と切り出した残課題を閉じる）
  - 関連 ADR: [ADR-20260428-06](20260428-06-client-mcp-modeling.md) — `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を予約語として認識した ADR
  - 関連 ADR: [ADR-20260312-03](20260312-03-three-axis-structure.md) — 論理／物理／組織の三面構造
  - 旧 Design Doc: `docs/design/user-role-keyword-decision.md`（本 ADR の昇格に伴い削除。検討経緯は PR #1291 と本 ADR を参照）

## 背景

`user` ノードの `role` プロパティは古くから存在するが、`role` という語自体が二義的で、文脈次第で異なる解釈に滑り落ちる。

- **actor archetype ラベル** — 「この system には customer / admin / support という種別のユーザーがいる」という構造的なラベル。`[human]` / `[ai]` タグの細分化に近い。
- **RBAC の permission bundle** — 「admin role には refund permission が紐づく」という実装側の概念。これを語彙に持ち込むと `requires role = "admin"` のような述語式言語への滑り台になる。

ADR-20260511-02 は usecase レベルの authz（`requires` 述語・`policy` ブロック・`user_attributes`）を karasu に取り込まないと決めたが、既存の `user.role` の扱い（actor archetype として残す B-soft か、deprecate する B-strict か）は別 Issue として切り出していた。本 ADR はその残課題を閉じる。

リポジトリ全体の `role "..."` の使用例（`examples/hr-tool/system.krs`、`examples/payment-platform/system.krs`、`examples/ec-platform/02-users.krs`、`examples/client-mcp/index.krs`、`examples/feature-samples/users.krs` など 14 ファイル前後）を読むと、現状の `role` は短い archetype label（`admin` / `customer`）ではなく **「この user が何をする人か」を 1 行で説明する文字列** として使われている（例: `"勤怠の申請・照会を行う一般社員"`、`"Places orders and tracks shipments"`）。実質的には短い `description` 補助として機能しており、レンダラも `description` とは別行で描画している（`packages/core/src/renderer/svg-renderer.ts`）。RBAC 的な使われ方の痕跡は examples・parser tests には無い。

## 決定

`user.role` プロパティを存続させる（B-soft）。`docs/spec/syntax.md` と `docs/spec/tags-annotations.md` の文言を改訂し、「actor archetype あるいは『この user が何をする人か』を 1 行で表す短い役割記述。RBAC の permission bundle / authz primitive ではない（`requires role = ...` のような述語構文は導入しない — ADR-20260511-02 参照）」と明示する。パーサ・AST・レンダラ・LSP・examples には変更を入れない。

## 理由

- **`role` の重力源（authz への滑り台）は ADR-20260511-02 が外部から塞いだ** — 述語構文・`policy` ブロック・属性宣言が今後入らないことが ADR レベルで確定しているため、`role` キーワード単独が RBAC 化のゲートウェイになる可能性は構造的に低い。残るのは語の引力だけで、これは spec 上の 1 文で縛れる範囲。
- **examples の実態が「短い役割記述」に収束している** — 当初想定された actor archetype よりも、説明補助としての使われ方が主流。B-strict で `description` に統合する案もあったが、レンダラ上で別行として表示できる便益（カード上の視認性）は失う。
- **B-strict の変更範囲が大きい** — spec / examples（14 ファイル）/ lexer / parser / AST / renderer / LSP / VS Code 拡張に波及する。それに見合うだけの「`role` を残すことの実害」が現時点では観測されていない（authz への滑り台懸念は ADR-20260511-02 が塞いだ）。
- **将来再検討の余地は残せる** — `role` の RBAC 的誤用が実際に観測されたら、その時点で B-strict 相当の ADR を起こして supersede すればよい。今は最小侵襲で意味を縛る方が ROI が高い。

## 却下した案

- **B-strict（`user.role` を deprecate）** — `role` の二義性を語彙レベルで解消する案。authz への滑り台を「外部 fence（ADR-20260511-02）」ではなく「語の除去」で塞ぐ筋の良さはあるが、上記のとおり ADR-20260511-02 が同等の機能を構造的に果たしている。spec / 14 example ファイル / lexer / parser / AST / renderer / LSP / VS Code 拡張への波及に見合うだけの実害が現時点では観測されていない。将来 RBAC 的誤用が増えたら本 ADR を supersede して再検討する。
- **何もしない（spec を縛らない）** — Issue #1281 の問題提起そのものを放置することになる。`role` の二義性は spec で 1 文で縛れば対処できるので、それすらしないのは選択肢にならない。

## 適用範囲

- `user.role` の意味づけ（actor archetype / 短い役割記述、authz primitive ではない）— `docs/spec/syntax.md` と `docs/spec/tags-annotations.md` で明示する。
- 既存パーサ・AST・レンダラ・LSP・examples — 変更しない。
- `requires role = ...` 等の authz 述語構文の導入 — 本 ADR の対象外（ADR-20260511-02 で別途取り込まない決定済み）。
- 将来 RBAC 的誤用が実際に観測されたら、本 ADR を supersede する新 ADR で B-strict 相当の deprecate を再検討する余地は残す。
