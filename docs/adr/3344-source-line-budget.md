---
id: ADR-3344
title: ソースファイルに行数予算を設け、超えているファイルは現在の行数で pin する
status: accepted
date: 2026-10-31
topic: build
related_to: [ADR-2521]
assumptions:
  - "grep: .oxlintrc.json :: \"files\": \\[\"packages/\\*/src/\\*\\*/\\*\\.\\{ts,tsx,mts,cts\\}\"\\]"
  - "grep: .oxlintrc.json :: \"max\": 600 \\}"
  - "file: scripts/lint/line-budget.test.ts"
  - "file: .claude/rules/line-budget.md"
---

# ADR-3344: ソースファイルに行数予算を設け、超えているファイルは現在の行数で pin する

- **日付**: 2026-10-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3344](https://github.com/kompiro/karasu/issues/3344)、PR [#3432](https://github.com/kompiro/karasu/pull/3432)
  - `layout.ts` の分割: Issue [#2512](https://github.com/kompiro/karasu/issues/2512)。分割で見つかった収束: [ADR-2521](2521-multi-system-pipeline-convergence.md)

## 背景

`packages/core/src/renderer/layout.ts` は #2512 で 3,360 行から 1,103 行に分割され（2026-08-16）、翌日の #2531 で
1,002 行まで減った。2026-10-31 には 1,719 行に戻っていた。分割で行数は減ったが、増加を止める仕組みは何も足していなかった。
直近 90 日で変更回数が最も多いファイルは、行数でも上位に並んでいた（`layout.ts`・`parser.ts`・
`svg-renderer.ts`・`warnings.ts`・`view-extract.ts`・`edge-routing-groups.ts`）。

分割そのものは機能開発のついでに行う前提とし、本決定には含めない。決めるのは「これ以上増やさない」ための柵だけである。

## 決定

`packages/*/src` のソース（`.ts` / `.tsx` / `.mts` / `.cts`）に、oxlint の `max-lines` で 600 行の既定予算を設ける。
すでに超えている 33 ファイルは、`.oxlintrc.json` に 1 ファイル 1 override で現在の行数を pin する。
`scripts/lint/line-budget.test.ts` が、pin が常にファイルの現在の行数と等しいことを検査する。

- 対象外: テスト（`*.{test,spec}.{ts,tsx,mts,cts}`）、`*.d.ts`（`ignorePatterns` で oxlint が読まない）、
  `*.generated.ts`、`packages/core/src/builtins/examples.ts`（ロジックではなくデータ）
- pin のあるファイルは増やせない。行数が要る変更は、先にコードを外へ移すか、理由を PR 本文に書いて pin を上げる
- pin のあるファイルが縮んだら、同じ PR で pin を下げる。既定予算以下になったら pin を消す
- 予算を超える新しいファイルには pin を足さず、分割する
- 運用の規則は `.claude/rules/line-budget.md`（`.oxlintrc.json` の編集時に読み込まれる）

## 理由

- **既存の lint で増加を止められる。** oxlint の `max-lines` は後ろの override が優先されるので、既定予算の override の後に
  ファイルごとの override を置けば「現在の行数で pin」がそのまま書ける。予算と pin が `.oxlintrc.json` の 1 か所に集まり、
  専用のスクリプトと予算ファイルを足さずに済む。行数は末尾の改行を 1 行と数えないので、改行で終わるファイルでは `wc -l` と一致する
- **pin を下げる側は lint では検出できないので、ratchet テストで補う。** lint は pin を超えた増加しか見ない。縮んだファイルに
  古い pin が残ると、その差が再び増やせる余地になる。#2512 の後に起きたのはこの形である。テストは pin が現在の行数より
  高ければ落ち、設定すべき値をメッセージで示す
- **柵の抜け道もテストで塞ぐ。** pin として数えるのは既定予算以外で `max-lines` を設定する override すべてである
  （`eslint/max-lines` のキーも含む）。1 ファイル・glob なし・`max-lines` キー・`["error", { max }]` の形でなければ落とす。
  予算の対象のソースにある、`max-lines` を外す `eslint-disable` / `oxlint-disable`（ルールを列挙しない全体の disable を含む）も落とす。
  走査する範囲は、glob をテストの定数に持ち（設定の glob と一致しなければ落ちる）、`excludeFiles` を設定から読むので、lint の対象とずれない
- **600 行にしたのは、中くらいのファイルを次の `layout.ts` になる前に柵の中へ入れるため。** 予算 800 なら pin は 18 件、
  1,000 なら 13 件で済むが、その手前のファイルは柵の外で増え続ける。pin が 33 件に増える管理の手間より、柵の範囲を優先した

## 却下した案

- **`scripts/lint/` に予算ファイルを読む専用スクリプトを置く。** Issue で代替案として挙げていた。oxlint の override で
  pin を書けたので不要になった
- **既定予算 800 / 1,000。** 上の理由のとおり、柵の外に残るファイルが増える
- **pin を下げるのを慣習に任せる（ratchet テストなし）。** 下げ忘れた pin がそのまま増える余地になり、Issue が直そうとした
  問題がもう一度起きる
- **`*.d.ts` も予算に入れる。** `packages/*/src` の宣言ファイルは 1 行と 8 行の ambient な shim で、#3344 が止めたい
  ロジックの増加とは関係がない。対象外であることを規則と ratchet テストに明記した
