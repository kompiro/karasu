---
id: ADR-3471
title: docs/ の外からは Design Doc ではなく Issue と ADR を指す
status: accepted
date: 2026-11-01
topic: adr-tooling
authors: [kompiro]
related_to:
  - ADR-2348
  - ADR-2331
  - ADR-3286
  - ADR-2804
  - ADR-953
  - ADR-3416
scope:
  concerns:
    - ci
assumptions:
  - "symbol: scripts/lint/design-doc-refs.ts :: check"
  - "grep: scripts/lint/design-doc-refs.ts :: TEMPLATE\\.md"
  - "grep: package.json :: lint:design-doc-refs"
  - "grep: lefthook.yml :: run: pnpm run lint:design-doc-refs"
  - "grep: .github/workflows/ci.yml :: run: pnpm run lint:design-doc-refs"
  - "grep: .github/workflows/ci-skip.yml :: scripts/lint/design-doc-refs\\.ts"
  - "grep: .claude/rules/adr.md :: lint:design-doc-refs"
---

# ADR-3471: docs/ の外からは Design Doc ではなく Issue と ADR を指す

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3471](https://github.com/kompiro/karasu/issues/3471)、きっかけの PR [#3468](https://github.com/kompiro/karasu/pull/3468)
  - [ADR-2348](2348-at-records-point-at-issues.md)（AT レコードは Issue を指す。本 ADR はその決定を `docs/` の外に広げる）、[ADR-2331](2331-adr-automerge-scope.md)（ADR PR の auto-merge は差分の性質で判定する）、[ADR-3286](3286-risk-based-review-tiers.md)（リスク段階）
  - 配線の前例: [ADR-2804](2804-no-nul-bytes-guard.md)（pre-push と、`ci.yml`・`ci-skip.yml` の両方の Check で走る検査）、[ADR-953](953-ci-docs-only-paired-stub-workflow.md)（docs だけの PR の Check）
  - TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録より長生きするアドレスを指す）、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（門の側の検査は集合全体に走らせる）

## 背景

Design Doc は ADR に昇格すると削除される（`docs/process.md`「ドキュメントのライフサイクル」）。ところがコードのコメントや workflow のコメントは、実装のときに唯一の設計の置き場だった `docs/design/<name>.md` を指して書かれてきた。このため昇格のたびに 2 つの悪い選択肢しかなかった。

- **コードの参照を張り替える。** 張り替えはコードの変更なので、昇格 PR は ADR-2331 の Low から外れ、Medium（`.github/workflows/` などなら High）になって人のマージを待つ。#3468（ADR-3416）は、変えたのが `scripts/adr/*.ts` の冒頭コメント 4 つだけで Medium になった。
- **張り替えずに残す。** ほとんどの昇格はこちらを選んでいた。#3471 の着手時点で、`docs/` の外の `docs/design/<name>.md` への参照は 83 件（`TEMPLATE.md` とテストのデータを除く）。うち 68 件は、もう存在しない 32 の Design Doc を指していた。残りの 15 件も、まだ開いている 2 つの Design Doc を指しており、同じ道をたどる。

AT レコードは同じ問題を ADR-2348 で解いている。AT は Issue を指し、`scripts/acceptance/design-refs.ts` がそれを検査する。`docs/` の外には同じ検査が無かった。

## 決定

**`docs/` の外（コード・設定・workflow・`.claude/rules/` など、追跡されているすべてのファイル）は `docs/design/<name>.md` を指さない。Issue（`#N`）を指し、ADR があればそれを指す。**

- 例外は、昇格せず消えない `docs/design/TEMPLATE.md` だけ。
- Design Doc のパスを引用ではなくデータとして持つファイル（リスク段階の分類器のテスト、ADR の差分の種類のテスト、AT の検査、本検査のテスト）は、`scripts/lint/design-doc-refs.ts` の `EXEMPT_FILES` に理由と一緒に名前で載せる。載っているのに Design Doc のパスを 1 つも持たないファイルは、それ自体が検査で落ちるので、例外の一覧は理由より長く残らない。
- `docs/` の中は対象にしない。`docs/` の Markdown の張り替えは ADR-2331 の Low に入るので、昇格 PR が扱える。
- 検査は `pnpm lint:design-doc-refs`。lefthook の pre-push（glob なし）と、Required の `Check` を出す `ci.yml` と `ci-skip.yml` の両方で走る。`ci-skip.yml` は `**/*.md` と `.claude/**` の PR を受け持ち、そこにも参照は書けるので、`ci.yml` だけでは漏れる（TPL-2446）。`ci-skip.yml` は依存を install しないので、検査は plain `node` で動く erasable TypeScript で書く（ADR-2804 と同じ）。
- 既存の参照は #3471 の最初の PR で置き換えた。消えた Design Doc は昇格先の ADR を、`system-view-grouping.md` はその箇所が述べるフェーズの ADR（ADR-1858 / 1859 / 1884 / 1886 / 1974）を、`app-e2e-coverage-program.md` は計測の Issue #3041 を指すようにした。

## 理由

- 昇格 PR が `docs/` の外に触れなくなるので、Design Doc を ADR にして消すだけの昇格は、いつも Low で auto-merge できる。
- 参照がいつまでも解決する。Issue は消えず、設計の PR にも実装の PR にも ADR にも辿れる。
- AT レコードと同じ規則なので、覚えることが 1 つで済む。
- 昇格の手順を人や AI が覚えていることに頼らず、push と Check で落ちる。

## 却下した案

- **ADR-2331 の分類器を広げ、コードのコメント中のパスの張り替えも Low にする。** 置き換えた文字列がコメントであって実行時の文字列でないことを示すには、言語ごとの構文解析が要る。昇格のたびにコードを書き換えること自体も残る。68 件の死んだ参照は、実際には張り替えが省かれてきたことを示している。
- **今のまま（コードに触れる昇格は Medium）にする。** 68 件の死んだ参照を生んだのがこの運用である。
- **`scripts/acceptance/design-refs.ts` を広げる。** あちらは AT の網羅性の検査（`pnpm at:check-coverage`）の一部で、AT に関わる PR でしか走らない。`docs/` の外への参照はどの PR でも入るので、配線の違う別の検査にした。
