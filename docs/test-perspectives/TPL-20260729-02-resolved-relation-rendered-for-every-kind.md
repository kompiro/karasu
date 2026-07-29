---
id: TPL-20260729-02
title: "解決済みの関係を描画する側の kind gate も、spec が許す全 kind を列挙する"
status: active
date: 2026-07-29
applicable_to:
  - "解決済みの関係（`owns` / `realizes` など）をカード上のチップ・バッジ・ボタンや metadata として提示するとき"
  - "新しい論理ノード kind を first-class node に追加し、検証側の valid-target set を広げるとき（描画側の gate が同じ広さになっているか）"
  - "同じ意味の kind 判定（`kind === \"service\" || kind === \"domain\"`）が measure / render / metadata の複数箇所にコピーされているとき"
known_consumers:
  - renderer
  - compile
  - app
  - vscode
discovered_from:
  - issue: "#2157"
  - root_cause_file: "packages/core/src/renderer/layout.ts"
  - root_cause_adr: "ADR-1720"
related_to:
  - TPL-20260623-02
  - TPL-20260716-02
topic: renderer
scope:
  packages:
    - core
    - app
    - vscode
---

# TPL-20260729-02: 解決済みの関係を描画する側の kind gate も、spec が許す全 kind を列挙する

## 観点

[TPL-20260623-02](TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) は **検証側**（valid-target set）の
kind 取りこぼしを扱う。本 TPL はその 1 段下流 —— 参照が正しく解決された**あとで、それを画面に出す側**の
kind gate を扱う。

描画側の gate が狭いと、**診断も warning も出ない**。モデルは valid、`ownerIndex` にはエントリがある、
組織図にも出る。それでもカードには何も出ない。検証側の取りこぼし（warning が出る）と違い、
利用者は「書いたのに反映されない」という形でしか気づけず、ツール側からは沈黙のまま情報が落ちる。

#2157 では `client` を team が `owns` しても、system view のカードにチップが出ず
`NodeMetadata.team` も `undefined` だった（`realizes` した client の deploy ボタンも同様）。
[ADR-1720](../adr/1720-client-realize-owns-target.md) で検証側は `client` を受け入れるようになっていたが、
`kind === "service" || kind === "domain"` という inline gate が renderer/compile の 6 箇所に残っていた。
**同じ図の中で `Group by: team` のフレームは `client` を正しくチームに入れており**、フレームは知っているのに
カードは知らない、という自己矛盾が症状として最もわかりやすかった。

## 想定される失敗モード

- **警告ゼロで情報が落ちる** — モデルは valid・検証は通る・図は描ける。落ちるのは「関係の提示」だけなので、テストも診断も鳴らない
- **同一ビュー内で矛盾する** — グルーピング（id ベース）は新 kind を含むのに、カードの affordance（kind gate）は含まない
- **サーフェス間で歯抜けになる** — SVG カードだけ直して `NodeMetadata` を忘れる（detail panel が空のまま）、app だけ直して VS Code webview を忘れる
- **描画だけ直して measure を忘れる** — チップは描かれるがカード高さ・幅が予約されておらず、他の行に重なる／はみ出す
- **提示文字列の不統一** — 同じ team をフレームは label、チップは id で名乗る（#2157 の二次症状）

## チェックリスト

解決済みの関係を新たに提示する / 既存の提示に kind を追加するとき:

- [ ] kind gate を **共有定数**（`OWNABLE_KIND_SET` / `DEPLOY_AFFORDANCE_KIND_SET` のような ReadonlySet）にしたか。inline の `kind === "x" || kind === "y"` を複数箇所にコピーしていないか
- [ ] **描画・measure・metadata の 3 点セット**を同じ gate で通したか（measure を忘れるとチップが未予約領域に描かれる）
- [ ] 同じ情報を出す**全サーフェス**を洗い出したか（SVG カード / core の `NodeMetadata` / app の detail panel / VS Code webview / エクスポータ）
- [ ] 意図的に**除外する kind** があるなら、理由をコード定数の doc コメントに書き、除外を assert するテストを置いたか（例: infra は shape 都合で deploy ボタン対象外）
- [ ] kind を列挙する**振る舞いテスト**（定数を回して各 kind で提示されることを assert）を置き、定数に kind を足したらケース不足で落ちるようにしたか

## 既知の対処パターン

- 「この kind 集合は何のためのものか」で定数を分ける（所有チップ = `OWNABLE_KIND_SET`、deploy ボタン = `DEPLOY_AFFORDANCE_KIND_SET`）。同じ 3 kind でも意味が違うなら別定数にし、それぞれに除外理由を書く
- kind gate を `makeOwnerResolver` のような **1 つの resolver 関数**に畳み、呼び出し側は「解決結果があるか」だけを見る形にする（#2157 の修正）
- `it.each([...KIND_SET])` と「定数とテストケースの集合一致」assert を組み合わせ、定数への追加がテスト側の追従を強制するようにする
- identity（id）と表示（label）を別フィールドで持つ（`team` / `teamLabel`）。ナビゲーションは id、表示は label に固定すると、表示規約を変えても遷移先が壊れない

## 派生元 spec

- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §team node（`owns` の対象 kind と、所有がカード上のチップとして描画されること）

## 関連テスト

- `packages/core/src/renderer/owner-affordance-kinds.test.ts`（kind 網羅・除外 kind・label 表示・measure 予約）
- `packages/app/src/components/NodeDetailPanel.test.tsx`（`teamLabel` を表示し `team` で遷移する）
- `packages/vscode/src/webview-content.test.ts`（webview の org ジャンプボタン）
