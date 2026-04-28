---
id: ADR-20260428-07
title: 図の凡例（legend）構文をモデル側に追加する
status: accepted
date: 2026-04-28
topic: renderer
related_to:
  - ADR-20260312-03
  - ADR-20260312-04
  - ADR-20260322-01
  - ADR-20260425-01
scope:
  packages:
    - core
    - app
  concerns:
    - i18n
assumptions:
  - "file: docs/spec/syntax.md"
  - "file: examples/feature-samples/legend.krs"
  - "file: packages/core/src/renderer/svg-builder.ts"
  - "symbol: packages/core/src/renderer/svg-builder.ts :: buildLegendFooter"
  - "symbol: packages/core/src/types/ast.ts :: LegendBlock"
---

# ADR-20260428-07: 図の凡例（legend）構文をモデル側に追加する

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - Issue [#833](https://github.com/kompiro/karasu/issues/833)
  - 仕様: [`docs/spec/syntax.md`](../spec/syntax.md) の Diagram legend 節
  - サンプル: `examples/feature-samples/legend.krs`
  - ADR-20260312-03 — 論理構造と物理構造の分離
  - ADR-20260312-04 — CSS インスパイアのスタイリングシステム
  - ADR-20260322-01 — ビルトインスタイルの一元化と構造化リファレンス
  - ADR-20260425-01 — i18n ポリシー（凡例ラベルは exemption）

## 背景

karasu の図では色やバッジで意味を符号化することが多い（チーム所有、サードパーティ、
廃止予定 など）。しかし「**この色は何を意味するか**」を `.krs` 内で第一級に
表現する手段がなく、運用ではコメントブロックや「Legend」と名付けたダミー
ノードで代用していた。前者は SVG に出ず、後者はモデルを汚しレイアウトを
壊す。レビュー / オンボーディング / 共有時に毎回口頭で補足する状態だった。

設計検討は `docs/design/diagram-legend.md` で進め、Phase 1〜6（lexer + AST →
parser → resolver → renderer → examples + AT → spec docs）を経て shipping
した（PR #881 / #932 / #937 / #943 / #947 / #949）。

## 決定

`.krs` のトップレベルに `legend` ブロックを追加し、各ビューの SVG の下に
フッター帯として描画する。

```ebnf
legend ::= "legend" view-scope? title? "{" entry* "}"
view-scope ::= "system" | "deploy" | "org"
entry      ::= "swatch" "#" hex-digits <string-literal>
             | "ref" ref-target <string-literal>
ref-target ::= "@" identifier
             | "[" identifier "]"
             | "." identifier   ; 前方互換、現状常に未解決
             | "#" identifier
             | identifier
```

主要な決定:

1. **配置はモデル側（`.krs`）**。`.krs.style` ではない。スタイルファイルを
   切り替えても凡例は消えず、`.krs` 単独で意味が完結する。
2. **描画は図の下のフッター帯**。図の bbox を変えず、viewBox を高さぶん拡張
   する。コーナー固定だと図の成長で重なるリスクがあり、また app の右クリック
   pan で凡例が画面外へ流れる問題があるため不採用。
3. **ビュースコープを v1 から導入**（`system` / `deploy` / `org`）。省略時は
   全ビューに描画。
4. **`ref` は既存スタイルカスケードで解決**。highest-specificity の matching
   rule から `background-color`（or `badge-color` フォールバック）を採用。
   未解決 ref は描画時に省略し、resolver が `legend-ref-unresolved`
   warning を出す。
5. **ラベルは i18n しない**（著者文言として `name` / `label` と同列）。
   多言語凡例が必要なら `.krs` を locale 別に分ける運用とし、`legend.ja "..."`
   のような構文は v1 範囲外。

## 理由

- **論理層に置く**: 凡例は「色 → **意味**」の宣言で、意味は著者がモデルに
  込めた意図。スタイルは表現のレイヤーで、両者を混ぜない（ADR-20260312-04 の
  分離方針）。`.krs.style` 切替で凡例が消える挙動は事故を生む。
- **フッター帯**: bbox 重なりリスクなく viewBox 拡張だけで完結する。
  SVG export に自動で乗り、レビューや GitHub プレビューでも凡例が見える
  （これが本機能の動機）。pan 操作で見失うこともない。
- **ビュースコープを v1 から**: 一度構文を決めたら互換性配慮で広げにくい。
  scope 省略をデフォルトにすれば最小ユースケースは複雑化せず、必要な著者は
  即座に絞れる。
- **既存カスケードで `ref` を解決**: `.krs.style` の specificity ルールに
  乗せれば「凡例の色 = 図上のノードの色」が常に保証される。
- **i18n exemption**: `name` / `label` と同じ系統。著者の語彙そのものが意味の
  根拠なので app の locale で上書きしない（ADR-20260425-01 の例外条件、
  `docs/spec/i18n.md` 参照）。

## 却下した案

### `.krs.style` に置く（B-2）

- **Pros**: 「色は表現」の筋が通り、多言語版スタイルファイルを切り替えれば
  凡例も切り替わる。
- **Cons**: スタイルファイルが optional の前提を崩す。「`.krs.style` を
  読み込まないと意味が伝わらない」状態は CLI / ライブラリ直接利用の DX を
  下げる。author の意図を style に出すと「同じ `.krs` で意味が変わる」摩擦も。

### 図 bbox の右下コーナーに重ねる（C-1）

- **Pros**: 一般的な慣習（draw.io / mxGraph）。
- **Cons**: 図の成長でノードと重なる。さらに app の pan 操作で凡例が画面外に
  流れる。footer 帯の方が strict に堅牢で、本機能の動機（SVG 単独で意味が
  完結する）を十分に満たす。

### 単一の `legend` を全ビュー固定（D-1）

- **Pros**: 実装最小、共通の凡例で済むケースが多い。
- **Cons**: deploy 図特有の凡例（hosting tier 等）を後で足したいときに構文
  互換性が気になる。`legend <view-scope>?` を v1 から入れて scope 省略を
  デフォルトにすれば、最小ユースケースは複雑化せずビュー特化も同じ構文に
  乗る。

### `ref` の解決を「ノードが使っているか」で判定

- **Pros**: 「未使用の凡例エントリ」を検出できる。
- **Cons**: builtin スタイルシートが定義する `@deprecated` 等の標準色は
  ノード未使用でも凡例に出したいケースがある。スタイルカスケードで解決する
  方が柔軟（`legend-ref-unresolved` warning は両方の経路で確認する）。

### shape / icon / pattern を v1 で扱う

- **Cons**: 構文・レンダリング両面で複雑度が上がる。color のみで MVP を
  shipping し、追加プリミティブは別 ADR で議論する。

## v1 で扱わないこと（follow-up）

- shape / icon / pattern 凡例
- インタラクティブ凡例（クリックでハイライト等）
- 使用中アノテーション / タグからの自動生成
- diff ビュー（`compileSystemDiff` / `compileDeployDiff`）と
  org のドリルダウン / focused-team / icon-mode 経路への描画
- 多言語凡例（`legend.ja "..."` 構文）

これらは個別 Issue で議論する。
