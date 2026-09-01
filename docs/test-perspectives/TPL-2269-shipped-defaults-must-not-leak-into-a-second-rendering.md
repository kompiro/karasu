---
id: TPL-2269
title: "出荷側の既定値を持つエンティティに 2 つ目の描画面を足すとき、既定値は面ごとに分ける（著者の宣言だけを渡す）"
status: active
date: 2026-08-31
applicable_to:
  - "既にスタイル・テーマ・設定の既定値を持つエンティティに、2 つ目の描画面（枠・凡例・一覧・サマリ）を足すとき"
  - "既存のセレクタ・キー・設定項目の到達範囲を、新しい面まで広げるとき"
  - "解決済みの値（既定値をマージ済みの構造体）を、それを前提にしていない面が読み始めるとき"
known_consumers:
  - style-resolver
  - renderer
discovered_from:
  - issue: "#2269"
  - root_cause_file: "packages/core/src/builtins/default-style.ts"
related_to:
  - TPL-2234
  - TPL-1503
  - TPL-1032
topic: styling
scope:
  packages:
    - core
---

# TPL-2269: 出荷側の既定値を 2 つ目の描画面に漏らさない

## 観点

1 つのエンティティに 2 つ目の描画面を足し、既存のセレクタ（あるいは設定キー）を
その面にも届かせるとき、**渡すのは著者が書いた宣言だけにする**。出荷側が書いた
既定値まで一緒に渡してはならない。

既定値は「そのエンティティの色」ではなく「**先にあった面の**既定の見た目」である。
`team { background-color: … }` は「Platform チームの色」ではなく「org tree view の
チームカードの既定の塗り」で、フレームという概念が無かった時代に書かれている。
新しい面がそれを読むと、**著者が何も書いていないのに全部の見た目が変わる**。

到達状態は「著者が名指していないものは、この PR の前後で 1px も変わらない」。
面ごとに既定値の持ち主を決めて書く — カードの既定値は builtin シート、フレームの
既定値はレンダラー、という具合に。

[TPL-2234](TPL-2234-one-entity-one-appearance-resolver.md) が「1 エンティティの
見た目の決定は 1 関数に閉じる」を言うのに対し、本観点はその 1 関数が
**何を入力に取るか**を言う。解決済みの値（既定値マージ済み）を入力にすると
上書きの有無が判別できなくなるので、入力は宣言の有無を保った形にする。

## 想定される失敗モード

- 新しい面が `Resolved*Style` のような**既定値マージ済みの構造体**を読み、出荷側の
  既定値がそのまま新しい面に出る。テストを書いた本人は上書きを指定した状態でしか
  確認しないので、**上書きが無い既定状態の変化に誰も気づかない**。
- 既定値の変化が「機能が効いている証拠」に見えてしまい、レビューで意図した変更と
  区別できない。karasu では builtin の `team { background-color: #D1FAE5;
  border-color: #6EE7B7 }` を team フレームが読むと、全フレームが緑になる。
  これは [#2179](https://github.com/kompiro/karasu/issues/2179) が決めた
  「team フレームは単色」と、Issue 自身の受け入れ条件「名指ししなかったチームは不変」の
  両方に反する。
- 逆方向の漏れ: 新しい面のために足した宣言が、先にあった面の見た目を変える。
  同じ判定条件（宣言の出どころ）で防ぐ。
- 出荷側シートが**複数ある**ことを見落とし、1 つだけ除外して他が漏れる
  （karasu には `<builtin>` に加えて icon mode の `<icon-theme>` がある）。

## チェックリスト

既存のセレクタ・キーの到達範囲を新しい面へ広げる変更で確認する:

- [ ] 新しい面が読む解決結果は、**著者が宣言したプロパティだけ**を持つ（全フィールドが
      optional で、「未指定」と「既定値」が区別できる）。既定値マージ済みの構造体を
      読んでいない。
- [ ] 出荷側シート・出荷側設定を**列挙して**除外した。1 つだけでなく全部（karasu では
      `NON_AUTHOR_SHEET_IDS` に `<builtin>` と `<icon-theme>` の両方）。
- [ ] **著者が何も書いていない状態**で新しい面の見た目が変わっていないことを assert する
      テストがある。上書きを指定したケースだけのテストはこの失敗を検出しない。
- [ ] 出荷側の既定値が**先にあった面には今までどおり効く**ことも同じテストで押さえた。
      「著者シートだけ」は新しい面についての規定であって、既存面の退行ではない。
- [ ] テーマ等で出荷側の既定値が複数セットあるなら、**全セット**で確認した（karasu では
      light / dark 両方）。

## 既知の対処パターン

- **出どころで切る。** karasu は `StyleRule.sheetId` が出荷側シートの番兵
  （`<builtin>` / `<icon-theme>`）かどうかで判定する
  （`packages/core/src/resolver/style-resolver.ts` の `resolveTeamFrames`）。
  プロパティ名や値では切らない — 著者が同じ値を書いたときに区別できなくなる。
- **面ごとに既定値の持ち主を spec に書く。** 「カードの既定値は builtin シート、
  フレームの既定値はレンダラー」と明記しておくと、次に 3 つ目の面を足す人が
  同じ判断に到達できる。

## 関連テスト

- `packages/core/src/renderer/team-frame-style-selector.test.ts`
  — describe「the frame's default is the renderer's, not the built-in sheet's」
  （既定状態で builtin のカード色がフレームに出ないこと、light / dark 両テーマ、
  かつカード側では今までどおり builtin が効くこと）

## 派生元 spec

- `docs/spec/style.md` § [Team frames (*Group by: team*)](../spec/style.md#team-frames-group-by-team)
  （「Each rendering keeps its own default」— builtin シートの `team { … }` はカードの
  既定値でありフレームには届かない、という規定）
