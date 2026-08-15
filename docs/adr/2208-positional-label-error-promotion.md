---
id: ADR-2208
title: organization / team / member の positional label を error にする
status: accepted
date: 2026-08-15
topic: parser
depends_on: [ADR-19]
related_to: [ADR-1314]
scope:
  packages:
    - core
assumptions:
  - "file: packages/core/src/parser/parser.ts"
  - "symbol: packages/core/src/parser/parser.ts :: parseRetiredPositionalLabel"
  - "file: scripts/lint/krs-fences.ts"
  - "file: packages/core/src/types/diagnostics-catalog.test.ts"
---

# ADR-2208: organization / team / member の positional label を error にする

- **日付**: 2026-08-15
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2208](https://github.com/kompiro/karasu/issues/2208)（本 ADR の起点）、実装 PR [#2495](https://github.com/kompiro/karasu/pull/2495)、追補 PR（本 ADR）
  - [ADR-19](19-required-id-label-as-property.md) — id 必須化・label のプロパティ化（本 ADR が完了させる決定）
  - [ADR-1314](1314-krs-spec-v1-freeze.md) — `.krs` v1.0 凍結
  - Issue [#2133](https://github.com/kompiro/karasu/issues/2133) — `boundary` を removed 化し、org / team / member を deprecated 化
  - Issue [#2209](https://github.com/kompiro/karasu/issues/2209) — エッジ inline label（本 ADR の対象外）
  - [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) / [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md) / [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)

## 背景

ADR-19 は id を必須にし label をプロパティに移した（案B「位置引数として残す」は
構文の非対称性を理由に却下）。しかし parser は `<kw> <id> "<label>"` の位置引数形を
受理し続けていた — spec に記載の無い leniency である。#2133 がこれを整理し、
experimental な `boundary` / `facet` では `positional-label-removed`（error）として
即撤去、`organization` / `team` / `member` では `positional-label-deprecated`
（warning）として猶予を置いた。本 ADR はその残りを閉じる。

着手時の調査で、#2208 起票時の前提が 2 点崩れていた。

1. **deprecation warning は一度もリリースされていない。** #2133 のマージは 2026-07-27
   だが changeset は未消費のままで、npm 上の `@karasu-tools/core` は 0.2.0、`karasu`
   は 0.6.0 と `package.json` と同値だった。warning を出す版が存在しない以上、待っても
   猶予にはならない。
2. **error にした後は `karasu fmt` で移行できない。** `format()` は error 診断が 1 件でも
   あると `FormatError` を投げる。機械的移行が効くのは昇格版より前だけである。

## 決定

`organization` / `team` / `member` の位置引数形を `positional-label-removed`（error）
にし、`positional-label-deprecated` は診断コードごと撤去する。**読み取った文字列は
AST の `label` として保持する**（`boundary` / `facet` は従来どおり破棄）。

## 理由

- ADR-19 の残課題を閉じるのに必要で、未リリースの deprecation を待つ意味が無い。
- 位置引数形は spec に一度も載っていないため、ADR-1314 の凍結面（構文・builtin タグ／
  注釈・診断 register・warn-don't-error）を壊さない。撤去は凍結 spec への準拠である。
  凍結面の「warn-don't-error」は**未解決参照**（spec §S6）に関する方針であって、
  構文の受理形を warning に留める約束ではない。
- 値を保持するのは**忠実性の選択であって救済ではない**。recovery が著者の書いた文字列を
  読むので、診断を無視して AST を見る `Parser.parse` の呼び出し側には名前が残る。
  描画が助かるわけではない — error が立っている間はどの経路も新しい図を描かない
  （app は直前の有効な SVG を出し直し、`karasu render` と `karasu subtree` は exit 1）。
  実装 PR #2495 はこの点を「図が劣化しない」と誤って説明しており、本 ADR で訂正する。

## 影響と移行

- 位置引数形を含む `.krs` は error になる。移行は `karasu fmt`（**昇格版へ上げる前に**
  実行する）。`examples/` の出現は 0 件、spec にも載ったことが無いため実ファイルの
  露出は無いと判断した。
- リリースノート（changeset）に移行順序を明記する。未消費だった #2133 の changeset からは
  「org / team / member は warning」の記述を落とした（存在しない版の挙動を告知しないため）。

## 併せて入れたガード

- **fence guard**（`scripts/lint/krs-fences.ts`）: ```krs フェンスを error だけでなく
  deprecation クラス（code が `-deprecated` で終わる warning）でも落とす。AT-0007 は
  #2133 から #2208 までの間、撤去予定の形を教え続けていた。判定は code の形から導き、
  export した純粋関数を合成診断でテストする（現 corpus の該当は 0 件）。
- **診断カタログの逆方向**（`packages/core/src/types/diagnostics-catalog.test.ts`）:
  TPL-1623 は双方向完全性を謳うが、実装は「コード→カタログ」しか assert していなかった。
  「カタログ行→コード」を追加し、撤去済みコードの行が残る drift を検出する。

## 却下した案

### 値も破棄する（boundary / facet 踏襲）

1 コード = 1 挙動で説明は単純になるが、recovery が著者の書いた情報を捨てる。error に
するかどうかと、AST をどこまで忠実に組むかは別の判断であり、破棄する側に利点が無い。

### warning のまま v2.0 まで持ち越す

ADR-19 の残課題が閉じない。deprecation warning は未リリースで猶予の実体が無く、
spec に無い形を parser が受理し続ける状態（TPL-2133 が指す drift）が続く。
