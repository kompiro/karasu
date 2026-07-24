---
id: ADR-2125
title: id-migration-map と専用 lint を退役する — 移行完了後の map は「lint が map を守るためだけの map」だった
status: accepted
date: 2026-07-24
topic: adr-tooling
scope:
  packages: []
  concerns: [ci]
related_to: [ADR-2092]
---

# ADR-2125: id-migration-map と専用 lint を退役する — 移行完了後の map は「lint が map を守るためだけの map」だった

- **日付**: 2026-07-24
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2125](https://github.com/kompiro/karasu/issues/2125)（Retire docs/adr/id-migration-map.json and its lint）
  - 移行本体: Issue [#2083](https://github.com/kompiro/karasu/issues/2083)、rename commit `9246a1c1`（PR [#2100](https://github.com/kompiro/karasu/pull/2100) `refactor(adr)!: migrate ADR ids to issue-number, ending the numbering race`）
  - 併せて close した PR: [#2105](https://github.com/kompiro/karasu/pull/2105)（map を redirect-only 化する中間案 — 本決定が全削除を選んだため不要になった）
  - 経緯: [#2099](https://github.com/kompiro/karasu/pull/2099)（native エントリ登録の導入）→ [#2104](https://github.com/kompiro/karasu/pull/2104)（登録の revert）→ [#2118](https://github.com/kompiro/karasu/pull/2118) / [#2120](https://github.com/kompiro/karasu/pull/2120)（登録する/しないの揺れが実害として現れた 2 件）
  - ADR: [ADR-2092](2092-tpl-config-split.md)（移行 Phase 1 の側面決定 — map と同じ #2083 系）

## 背景

`docs/adr/id-migration-map.json` は、ADR の id を日付形式（`ADR-YYYYMMDD-NN`）から issue-number 形式（`ADR-<issue>`）へ移行する #2083 のために作られた old→new 対応表（333 エントリ）である。専用 lint `scripts/lint/adr-id-migration-map.ts`（約 370 行 + vitest ミラー）が totality・injectivity・slug 保存を検証し、とりわけ **half-migrated 状態**（一部だけ rename され、未 rename の `20260716-02-…` が `ADR-20260716` という「もっともらしく間違った id」にパースされる状態）の検出が主目的だった。

rename commit `9246a1c1`（PR #2100、2026-07-21）で移行は完了し、docs/adr は post-migration に確定した。以後の実態は次の通り:

- **map を読む消費者が存在しない。** `adr:validate` / `adr:regenerate` / `adr:check-assumptions` も docs-site も map を参照しない。repo 内の参照は「map を維持する機構」（lint・その test・`lint:adr-id-map` script・lefthook hook・TEMPLATE.md の登録ルール）のみ。**map は lint に検査されるためだけに存在していた。**
- **lint の中心機能はもう発火しない。** half-migrated 検出も totality 検査も pre-migration フェーズ専用ガードの内側にあり、post-migration では素通りする。TEMPLATE.md の「map は totality ledger であり、未登録の ADR ファイルで `pnpm lint:adr-id-map` が fail する」という記述は main 上で既に虚偽だった（この stale ルールが #2120 で不要エントリの追加→削除という実害を生んだ）。
- **旧 id リンク切れの被害面もほぼ消滅。** docs/ 内の旧形式 id は日付入り歴史記録 2 件（`docs/qa/2026-07-16-checklist.md`・`docs/review/2026-06-30-review.md`）に計 7 箇所残るのみで、point-in-time 文書としてはむしろ旧 id が正しい。docs-site 配下の残存は git-ignored な生成物である。

## 決定

**map・lint・その周辺機構を全削除する**（Issue #2125 の option 1）。

1. `docs/adr/id-migration-map.json`、`scripts/lint/adr-id-migration-map.ts`、同 `.test.ts` を削除する（test の削除で `test:scripts` 経由の CI 検査も消える）
2. `package.json` の `lint:adr-id-map`、`lefthook.yml` の `adr-id-map` pre-push hook を除去する
3. `docs/adr/TEMPLATE.md` から native エントリ登録ルール（前述の虚偽 totality claim を含む）を削除する — 新規 ADR はファイル名 `<issue>-<slug>.md` と frontmatter だけで完結し、`adr:validate` が検証する
4. old→new 対応表は別形態（README への静的表など）でも残さない。**復元は rename commit `9246a1c1` に一本化する** — `git show 9246a1c1 --stat` で全 333 rename が読める

## 却下した案

- **lint だけ削除し JSON を凍結保存する**（option 2）: 変化しないファイルに CI ガードは不要という点は正しいが、TEMPLATE.md の登録ルールと map の実態が既に乖離しており、「凍結のはずの map に登録する/しない」の揺れ（#2099→#2104→#2118→#2120）が再発する。参照されないルックアップ表の保存先として git history に劣る点もない。
- **map を redirect-only 化して維持する**（option 3、PR #2105 の方向）: native エントリを落として「rename の記録」に純化する案。しかし消費者がいない以上、純化しても「lint が map を守るための map」という構造は変わらない。#2105 は本決定を受けて close した。
- **README に静的な old→new 表を残す**: schema も validator も不要になる最安の保存形態だが、参照する読者が想定できず、333 行の表が README を占有するコストが上回る。必要になれば rename commit から機械的に再生成できる。

## 影響

- pre-push hook と CI から検査が 1 本ずつ減る。新規 ADR 作成時の登録作業（と、それを忘れた/やり過ぎたときの手戻り）が消える。
- 旧 id（`ADR-YYYYMMDD-NN`）から新 id を引きたくなった場合は `git show 9246a1c1` を参照する。歴史記録内の旧 id はそのまま保存される。
