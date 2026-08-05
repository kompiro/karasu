---
id: ADR-2348
title: AT レコードは Design Doc ではなく Issue を指す — 削除が規約で確定しているアドレスを記録に埋めない
status: accepted
date: 2026-08-04
topic: testing
authors: [kompiro]
related_to:
  - ADR-2331
  - ADR-2259
  - ADR-1192
  - ADR-2188
scope:
  packages: []
assumptions:
  - "file: scripts/acceptance/design-refs.ts"
  - "symbol: scripts/acceptance/design-refs.ts :: analyzeDesignRefs"
  - "file: .claude/rules/acceptance.md"
  - "grep: .claude/rules/acceptance.md :: 設計根拠は Issue で指す"
---

# ADR-2348: AT レコードは Design Doc ではなく Issue を指す — 削除が規約で確定しているアドレスを記録に埋めない

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 起点 PR: [#2348](https://github.com/kompiro/karasu/pull/2348)（対応する Issue は無い。[ADR-2331](2331-adr-automerge-scope.md) の「未決」から起こした）
  - [ADR-2331](2331-adr-automerge-scope.md)（auto-merge 例外の範囲。本 ADR はその未決事項「AT から design doc へのリンクをやめるか」に答える）
  - [ADR-1192](1192-test-perspective-library.md)（TPL 運用）、[ADR-2188](2188-tpl-issue-number-ids.md)（採番は起点 Issue 番号）
  - TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録より長生きするアドレスを指す。本件で design doc の事例を追記）
  - 規約: `docs/process.md`「AT レコードは `docs/design/` を指さない」、`.claude/rules/acceptance.md`
  - 強制: `scripts/acceptance/design-refs.ts`（`pnpm at:check-coverage` 内）

## 背景

`docs/process.md` は Design Doc を ADR に昇格させた時点で**削除する**と定めている（記録を ADR に一本化するため）。一方 AT レコードは実装 PR の時点で書かれ、その時点で設計根拠が置かれている唯一の場所は Design Doc なので、`- **設計**: docs/design/<name>.md` と書くのが自然だった。

この 2 つを重ねると、**AT が指すアドレスは規約によって必ず消える**。「壊れるかもしれない」ではない。昇格という正常な作業が、毎回リンクを切る。

ADR-2331 はこの症状の別の面を扱った。昇格 PR がリンクを繋ぎ直す必要があるせいで auto-merge の適用条件から外れる、という問題である。そこでは条件のほうを緩めて対処し、「参照元をなくす案」は未決として残した。本 ADR がそれに答える。

着手時に実態を数えたところ、腐敗は既にかなり進んでいた:

| 参照形式 | 参照先が生存 | 参照先が削除済み |
| --- | ---: | ---: |
| markdown リンク | 2 | 1 |
| バッククォートの地の文 | 5 | 38 |

**46 参照のうち 39 が既に解決しない。** うち 1 件（`docs/acceptance/1821-layer-toggle-external-infra.md`）は main に残った**壊れた markdown リンク**だった。

誰も気付かなかった理由は 2 つある。リポジトリで動いているリンクチェックは `packages/docs-site`（公開サブセット）しか見ていない。そして死んだ参照の大半はリンクではなくバッククォートの地の文なので、リンクチェッカを `docs/` 全体に広げても検出できない形だった。

## 決定

**AT レコードから `docs/design/` を参照しない。設計根拠は Issue で指し、ADR が存在するならそれも併記する。**

```markdown
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)
- **設計 (ADR)**: [ADR-2259](../adr/2259-permalink-payload-cap.md)
```

- **Issue を第一の到達先にする。** Issue は削除されず、design PR と実装 PR の両方へ辿れる。
- **ADR が無い段階では Issue だけにする。** ADR 番号は起点 Issue 番号と一致する規約（ADR-2188）なので執筆時点で分かっているが、**ファイルが存在しないうちにリンクを書かない** — 前方参照は切れたリンクと区別がつかない。昇格 PR で `- **設計 (ADR)**: …` を足す。
- **機械で強制する。** `scripts/acceptance/design-refs.ts` が `docs/acceptance/**` から `docs/design/` への参照を finding として報告し、`pnpm at:check-coverage --strict` で落ちる（CI と pre-push の両方で走る）。
- **規約は編集の直前に届く層に置く。** `.claude/rules/acceptance.md`（`paths: docs/acceptance/**`）に何を書くべきかを置き、`docs/process.md` に背景を書く。ガードは事後判定、rules は事前提示という役割分担である。

既存 46 参照はすべて本 PR で解消した。ADR が存在するものはその ADR を指し（`1821` / `1974` / `1858` / `1320` / `1142` / `1096` / `1168` の 7 件）、それ以外はヘッダの Issue が既にポインタを持っていたので参照を落とした。

## 理由

- **削除が規約で確定しているアドレスを記録に埋めない。** TPL-2254 が preview URL について書いた「記録の寿命とアドレスの寿命が合っていない」の、より強い形である。preview URL は腐りうるだけだが、Design Doc の削除は**プロセスが保証している**。偶発ではないものを、忘れずに直すことで運用するのは筋が悪い。
- **昇格作業から工程が 1 つ消える。** ADR-2331 は「昇格 PR がリンクを直す」ことを許す方向で解いた。本 ADR は直す必要そのものをなくす。ADR-2331 の条件は残す（`docs/spec/` や TPL など AT 以外の参照元は依然あり、そちらは昇格時に張り替える）。
- **腐敗が見えない形だった。** 39 件が既に死んでいたのに CI も人も気付いていなかった。参照をやめれば、検出できない腐敗そのものが発生しなくなる。リンクチェッカを広げる案（下記）と違い、地の文の参照にも効く。
- **失うものが小さい。** 昇格前は設計根拠まで Issue 経由の 1 ホップになるが、Issue には design PR と実装 PR が両方紐づくので迷子にならない。そして 260 AT のうち 152 は既に Issue を、144 は既に ADR を参照しており、この形は新規ではない。

## 却下した案

- **現状維持（昇格のたびに張り替える）** — ADR-2331 で auto-merge は通るようになったので、追加コストは「昇格者が忘れないこと」だけ。しかし忘れた実例が既に main にあり、39 件の腐敗はその積み上がりである。人の記憶を強制手段にしている点が弱い。
- **`docs/` 全体に markdown リンクチェッカを入れる（前案の案D）** — 壊れたリンクを検出でき、AT 以外にも効く。ただし今回死んでいた 39 件のうち 38 件はリンクではなくバッククォートの地の文なので**検出できない**。有用ではあるが本件の解にはならず、直交する改善として別途検討する。
- **AT の `設計` 行に ADR 番号をテキストで先に書く** — 番号は執筆時点で確定している（ADR-2188）ので `ADR-2259` とだけ書いておく案。存在しないものへの前方参照になり、読者が「まだ無い」のか「消えた」のか判別できない。
- **昇格時に Design Doc を削除せず stub を残す** — リンクは切れなくなるが、`docs/process.md` が記録を ADR に一本化すると決めた理由（同じ内容が 2 か所にあると乖離する）を捨てることになる。参照側を直すほうが安い。

## 未決（本 ADR の範囲外）

- **`docs/` 全体のリンクチェック** — 却下案の 2 番目。AT 以外（spec / TPL / guide）の壊れたリンクは依然として誰も見ていない。導入するかは別途。
- **AT 以外の参照元** — `docs/spec/` / `docs/test-perspectives/` / `docs/prd/` / `docs/roadmap.md` も Design Doc を参照している。同じ規約を広げるかは、それぞれの記録の寿命が Design Doc とどう違うかを見てから決める（ADR は 昇格元 を記録する必要があるので対象外）。
