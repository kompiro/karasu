---
id: TPL-20260511-02
title: "人間向け spec ドキュメントと in-app reference データは片方向 smoke test で同期を縛る"
status: active
date: 2026-05-11
applicable_to:
  - "`docs/spec/*.md` に新しいキーワード / プロパティ / タグ / アノテーション / ノード種別を足すとき"
  - "parser / 文法（`LOGICAL_KEYWORDS`、infra ブロック、トークン種別等）や `getReference()` 側に先にキーワードを足すとき — 同じ PR で `docs/spec/*.md` に節を足したか確認するため"
  - "`getReference()`（`packages/core/src/builtins/reference.ts`）や `ReferencePanel` など、spec の内容を手で複製している UI / データを変更するとき"
  - "ある仕様の「正典」と「それを再掲する別表現」が複数あって、片方だけ更新されがちなとき"
known_consumers:
  - reference-panel
  - get-reference
discovered_from:
  - issue: "#1296"
  - issue: "#1327"
related_to:
  - TPL-20260510-11
  - TPL-20260510-12
topic: build
scope:
  packages:
    - core
    - app
---

# TPL-20260511-02: 人間向け spec ドキュメントと in-app reference データは片方向 smoke test で同期を縛る

## 観点

karasu には「同じ仕様を 2 箇所で手書きしている」構造がある。`docs/spec/{syntax,style,tags-annotations}.md` が人間向けの正典、`packages/core/src/builtins/reference.ts`（`getReference()`）+ `packages/app/src/components/ReferencePanel.tsx` がアプリ内 Reference パネルの再掲。片方（多くは spec doc）に新しい style プロパティ / shape / タグ / アノテーション / ノード種別が landed しても、もう一方は更新されず、パネルが静かに古くなる。

この種の drift は **「正典から再掲側への片方向 subset チェック」を smoke test で固定する** ことで防げる。すなわち「spec doc が記述している keyword は、すべて reference データに存在する」を assert する（`docs/spec/style.md` の `css` fence のプロパティ宣言、各テーブルの第 1 列コードスパンを抽出して `getReference()` と突き合わせる）。逆向き（reference の全エントリが doc に記述されている）は assert しない — reference が doc より先行している（あるいは doc 側が追いついていない）ことは別系統の gap で、片方向に絞ると test が脆くならない。

これは #1234 / TPL-20260510-12 item 5 が parser に対してやっていることの reference データ版であり、TPL-20260510-11（並列関数ファミリの parameter parity）の「並列に存在するものは drift する」という観察を doc ↔ data の軸に広げたもの。

## 想定される失敗モード

- spec doc に `label-position` / `label-offset` / `column` のような新 style プロパティを足したが `reference.ts` に追記し忘れ、Reference パネルの Styles タブが古いプロパティ一覧のまま（#1296 で実際に発生）。
- 新しいノード種別 / タグ / アノテーションが spec に landed したのに Syntax / Tags タブに出てこない。
- 逆向き: parser / `reference.ts` 側に先にキーワードが landed したのに `docs/spec/*.md` に節がなく、`getReference()` / `ReferencePanel` 経由でしか辿れない状態が続く（infra-layer ノード種別 `database` / `queue` / `storage` / `table` / `queue-item` / `bucket` が ADR-20260405-05 以降ずっと spec doc 未記載だった #1327 で実際に発生）。`spec-syntax.test.ts` の `krs` fence チェックは構文の *使用例* は縛れても *節の存在* は縛れない点に注意。
- 逆に reference 側を直しても i18n 文字列（`STRINGS_EN` / `STRINGS_JA`）の片方を足し忘れ、片言語だけ `undefined` が表示される。
- 「reference にあるが doc にない」を厳密に双方向チェックしてしまい、doc が追いついていない過渡期に無関係な test 失敗が出続けて test がミュートされる。

## チェックリスト

`docs/spec/*.md` または `getReference()` / `ReferencePanel` を変更するときに確認する:

- [ ] spec doc に keyword（style プロパティ / shape / タグ / アノテーション / ノード種別）を足したら、同じ PR で `reference.ts` の対応する配列にエントリを足したか。
- [ ] 逆向きも忘れない: parser / 文法（`LOGICAL_KEYWORDS`、infra ブロック、トークン種別等）や `reference.ts` 側にキーワード（ノード種別含む）を先に足したら、同じ PR で `docs/spec/syntax.md`（必要なら `style.md` / `tags-annotations.md`）にその layer・用途・制約を記述する節を足したか。`spec-syntax.test.ts` の `krs` fence は使用例しか縛れないので、節の追加は人手で確認する。
- [ ] 新エントリの description を `STRINGS_EN` と `STRINGS_JA` の **両方** に足したか（型 union も更新したか）。
- [ ] `packages/core/src/builtins/reference-spec-sync.test.ts` が通るか（= spec doc が記述する keyword をすべて reference が含むか）。新カテゴリの doc テーブルを足したなら、その抽出も smoke test に加えたか。
- [ ] 双方向ではなく「spec → reference」の片方向 subset チェックに留めているか（reference に余分があってもよい）。

## 既知の対処パターン

- **片方向 subset smoke test パターン**: 正典（doc）から keyword 集合を機械抽出し、再掲側（`getReference()`）の集合に subset 包含されることを assert する。抽出は markdown の fenced code block / テーブル第 1 列コードスパンを正規表現で拾うだけで十分（`packages/core/src/builtins/reference-spec-sync.test.ts` がこの形）。`docs/spec/syntax.md` の `krs` fence を parser に通す `packages/core/src/spec-syntax.test.ts`（#1251）と同じ発想の data 版。
- **理想的には正典を 1 つにする**: `reference.ts` を `docs/spec/*` から生成してしまえば drift は構造的に消える（#1296 の Goal 3）。ただし spec doc は散文・表・コードブロックが混ざっていて機械生成が容易ではないため、当面は smoke test で「同期忘れに気づける」状態を担保する。

## 関連テスト

- `packages/core/src/builtins/reference-spec-sync.test.ts` — spec doc ↔ `getReference()` の片方向 subset チェック（本 TPL の主たる担保）
- `packages/core/src/spec-syntax.test.ts` — `docs/spec/syntax.md` の `krs` fence ↔ parser（#1251 / TPL-20260510-12 item 5）
- `packages/core/src/builtins/reference.test.ts` — `getReference()` のノード種別 / タグ / sampleKrs の内容チェック
