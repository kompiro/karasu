---
id: ADR-20260506-01
title: "GUI 駆動の `.krs.style` 編集 — Preview コンテキストメニューから append round-trip"
status: superseded
superseded_by: ADR-20260508-01
date: 2026-05-06
topic: app-ui
related_to:
  - ADR-20260429-04
  - ADR-20260430-04
  - ADR-20260506-02
  - ADR-20260506-03
scope:
  packages: [core, app]
---

# ADR-20260506-01: GUI 駆動の `.krs.style` 編集 — Preview コンテキストメニューから append round-trip

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1076](https://github.com/kompiro/karasu/issues/1076)
  - 実装 PR [#1093](https://github.com/kompiro/karasu/pull/1093)（Design Doc）、[#1129](https://github.com/kompiro/karasu/pull/1129)（GUI MVP）
  - 兄弟 ADR: [ADR-20260506-02](./20260506-02-edge-id-selector.md)（edge ID selector）、[ADR-20260506-03](./20260506-03-edge-direction-style.md)（direction property）

## 背景

`.krs.style` の語彙は機能追加のたびに増え（color、edge differentiation、
label position、direction、…）、ユーザーが「どんな knob があるのか」を
spec を読まずに発見できない discoverability 問題が前面に出ていた。文法を
整えるだけでは到達できない壁。

[#1071](https://github.com/kompiro/karasu/issues/1071) の議論から派生し、
**Preview を `.krs.style` の構造化エディタとして使う**方針を採るかが
論点になった。

## 決定

`.krs.style` を **テキストファイルの source of truth として保ち**、
Preview の右クリック → コンテキストメニューから **追記専用の round-trip**
で書き換えていく構造化エディタを乗せる。具体的に:

- **Append-only cascade override**: 既存ルールには触れず、より specificity
  の高い `edge#<id> { ... }` ルールを末尾に追記する。CSS のカスケードが
  conflict を解決するので「update or append?」の意思決定は GUI 側に不要
- **ID 形式 selector がデフォルト**: Preview で選んだ要素を `edge#<id>`
  で一意に指す。GUI が semantic 解析なしに生成でき、生成された
  `.krs.style` を読む人にも対応関係が分かる
- **Tidy はコマンド族**: append 連発で散らかった `.krs.style` を整理する
  `Tidy Style` を将来導入。`go mod tidy` 同様のセマンティクス。`.krs`
  本体への Tidy は別議論（範囲外）
- **Monaco undo は別系統**: 編集側 (Monaco) と GUI 側で undo 履歴を共有
  しない。統合は MVP のスコープ外

## 理由

- **Discoverability**: spec を読まなくても右クリックで knob が見える
- **既存 cascade に乗る**: 新しい優先順位ルールを追加せず CSS と整合
- **diff が予測可能**: 追記のみなので PR diff が小さく、レビューしやすい
- **競合耐性**: editor との同時編集や複数 GUI 操作にも壊れにくい
- **ADR-20260429-04（column hint）と直交**: column は absolute bucket、
  edge hint は二項関係を表す上位 override 層という関係に整理できる
- **last-wins 慣習（ADR-20260430-04）に整合**: cascade で常に後勝ちが
  決まるため、GUI 操作が後発なら必ず反映される — UX の予測可能性が高い

## 却下した案

### 案: 既存ルールを書き換える（in-place update）
GUI 編集のたびに既存の matching rule を見つけて値を更新する。
- 却下理由: 整形・コメント・並び順を保つ AST writer が必要で、editor との
  衝突や意図しない diff が頻発する。append のシンプルさを失う

### 案: 毎回ファイル全体を書き直す（regenerate）
編集のたびに `.krs.style` を AST から再生成する。
- 却下理由: PR diff が常に大きくなる。コメント・ルール並び順・
  グループ化など著者の意図が失われる

### 案: 文法のみで discoverability を解決
spec 拡充とエディタの auto-complete に頼り、GUI を導入しない。
- 却下理由: 機能追加コストが文法成長と線形に比例し、利用者の認知負荷を
  抑えられない。GUI が無い限り spec 黒帯ユーザー以外が辿り着けない

## スコープ外（フォローアップ）

- **Tidy Style コマンド**: append 累積で `.krs.style` が散らかった時の
  consolidation。実装は MVP 外（必要性が確認されてから着手）
- **Tidy Source（`.krs` 側）**: 論理モデル削除を伴うため別 ADR で扱う
- **`.krs.style` を直接編集中の UX**: target 解決ロジックの改善
  ([#1144](https://github.com/kompiro/karasu/issues/1144))
- **VS Code 拡張への展開**: Web Preview 限定
- **複数 `.krs.style` ファイルへの書き分け**: MVP は最後の `@import` 1 本
  に append
