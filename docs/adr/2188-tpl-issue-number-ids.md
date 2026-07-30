---
id: ADR-2188
title: TPL の採番を issue-number（TPL-<n>）へ移行する
status: accepted
date: 2026-07-30
topic: adr-tooling
related_to:
  - ADR-2092
  - ADR-1192
  - ADR-1357
scope:
  concerns:
    - ci
assumptions:
  - "file: tpl.config.json"
  - "grep: tpl.config.json :: issue-number"
  - "file: docs/test-perspectives/TPL-2188-id-uniqueness-needs-cross-corpus-check.md"
  - "grep: docs/test-perspectives/README.md :: TPL-<n>-<slug>"
---

# ADR-2188: TPL の採番を issue-number（TPL-<n>）へ移行する

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2188](https://github.com/kompiro/karasu/issues/2188)（date-sequence id の並行ブランチ衝突 + validator の重複未検出）
  - 改める ADR: [ADR-2092](2092-tpl-config-split.md)（config 分離の決定は維持、「TPL は `date-sequence` を維持する」の部分のみ本 ADR で覆す）
  - 上流: [kompiro/tpl-tools#14](https://github.com/kompiro/tpl-tools/issues/14) / [#15](https://github.com/kompiro/tpl-tools/pull/15)（`duplicate-id` cross-file 検査、`0.0.7`）
  - 関連 TPL: [TPL-2188](../test-perspectives/TPL-2188-id-uniqueness-needs-cross-corpus-check.md)（本件から抽出した観点）
  - コード: `tpl.config.json` / `docs/test-perspectives/`（88 ファイル rename）

## 背景

[#2188](https://github.com/kompiro/karasu/issues/2188) で、並行する 2 ブランチが同日に同じ `TPL-20260730-01` を採番し、マージ後も `pnpm tpl:validate` が素通しする事故が起きた。`date-sequence`（`TPL-YYYYMMDD-NN`）の `NN` は**自ブランチに存在するファイル集合**から導出されるため、同日に切られたブランチは互いの採番を見えず、この race は構造的である。ADR の旧 `YYYYMMDD-NN` 形式が #2083 / #2100 で issue-number へ移行したのと同型の問題が、衝突窓が狭い（同日のみ）まま TPL に残っていた。

ADR-2092 は「TPL の採番は誰も困っていない」を前提に `date-sequence` 維持を決めたが、#2188 はその前提の反例である。検出面は上流 `tpl-tools` 0.0.7 の `duplicate-id` 検査（cross-file）で塞いだうえで、採番そのものを raceless にするか検討し、issue-number への移行を決めた。

## 決定

**TPL の id / ファイル名を `TPL-<n>` / `TPL-<n>-<slug>.md` に移行する（`tpl.config.json` の `idFormat: issue-number`）。**

採番規則は ADR と同じ優先順位で、`docs/test-perspectives/README.md` を正とする:

1. **起点の GitHub Issue 番号**（複数 issue にまたがる TPL は先頭の `discovered_from` の issue）
2. 番号が既に他 TPL に使われている、または issue が無い場合は **その TPL を起こした PR 番号**
3. どちらも使えない場合は **local 採番（既存 TPL id の最大値 + 1）**

既存 89 TPL は本 ADR 末尾の対応表のとおり一括移行した（起点 Issue: 67 / 作成 PR: 16 / local 採番: 6 — local 分は移行時点の最大値 2165 の続き 2166〜2171。89 件目の TPL-20260730-03 は移行作業と並行して main に追加され、merge 時に取り込んだ）。`related_to` グラフ・README 索引・repo 内の全参照（docs / packages / .claude / workflows、約 2,100 箇所）も同時に書き換えた。旧 NN 略記（`TPL-04` など、初期 backfill 23 件への省略参照）も新 id に引き直した。

**ADR-2092 の config 分離（`tpl.config.json` / `adr.config.json`）は維持する。** 分離の当初理由（idFormat の差異）は消えるが、片方のツール設定変更がもう片方の corpus 検証を巻き添えにしない分離の実利は形式が揃っても変わらない。`topics` 複製 + `pnpm lint:config-topics-sync` の運用も従来どおり。

## 理由

- **race を検出でなく構造で消す**: GitHub の Issue / PR 番号は大域的に一意で、並行ブランチ間で採番が衝突しない。`duplicate-id` 検査（マージ時検出）だけでも事故は防げるが、採番元を変えれば衝突がそもそも起きない。fallback の local 採番（優先順位 3）にのみ race が残り、そこは 0.0.7 の `duplicate-id` 検査が防護する
- **ADR と語彙が揃う**: 採番規則・ファイル名規約・「番号 = 起点の GitHub 番号」という読みが ADR と TPL で統一され、hane skill（`test-perspective`）の既定規約とも一致する（karasu が「独自規約」例外である状態が解消）
- **ADR-2092 の却下理由の再評価**: 「TPL は単一 issue に紐付かない」は事実だが、実測では 88 件中 66 件が先頭 issue で一意に解決し、残りも PR 番号 + local 採番で機械的に解決できた。「移行コスト」も全参照の書き換えをスクリプト化することで 1 PR に収まった

## 却下した案

- **`date-sequence` 維持 + `duplicate-id` 検査のみ**（#2188 の当初推奨）: 検出はマージ時まで遅れ、衝突自体は起き続ける。採番の語彙統一の価値も得られない。ユーザー判断で構造的解消を選択
- **content-derived / random suffix**（`TPL-20260730-a3f1` 型）: raceless だが可読性を失い、GitHub 番号との対応も持たない
- **config の再統合**（`adr.config.json` 一本化）: idFormat が揃ったので技術的には可能だが、ツール別設定の独立性を手放す理由がない。将来必要になれば別 Issue で検討する

## 残課題・影響

- **書き換え不能な歴史的参照**: マージ済み PR description・Issue コメント・コミットメッセージ内の旧 id は GitHub 上に残る。旧→新の解決は本 ADR の対応表を正とする
- **Gap ID（`G12-1` / `GA08-2` など）**: Fit/Gap 監査の gap id は旧 NN 略記を埋め込んでいるが、Issue 側で定義済みの歴史的識別子のため改番しない
- **kompiro/hane**: `test-perspective` skill が「独自規約の例」として karasu の旧形式を挙げている記述が stale になる（挙動には影響なし、hane 側 follow-up）

## 移行対応表（旧 → 新）

<!-- markdownlint-disable MD013 -->

| 旧 id | 新 id | 番号の根拠 |
|---|---|---|
| TPL-20260510-01 | TPL-1160 | 起点 Issue |
| TPL-20260510-02 | TPL-1101 | 起点 Issue |
| TPL-20260510-03 | TPL-1094 | 起点 Issue |
| TPL-20260510-04 | TPL-1053 | 起点 Issue |
| TPL-20260510-05 | TPL-999 | 起点 Issue |
| TPL-20260510-06 | TPL-1001 | 起点 Issue |
| TPL-20260510-07 | TPL-510 | 起点 Issue |
| TPL-20260510-08 | TPL-1032 | 起点 Issue |
| TPL-20260510-09 | TPL-948 | 起点 Issue |
| TPL-20260510-10 | TPL-907 | 起点 Issue |
| TPL-20260510-11 | TPL-219 | 起点 Issue |
| TPL-20260510-12 | TPL-74 | 起点 Issue |
| TPL-20260510-13 | TPL-976 | 起点 Issue |
| TPL-20260510-14 | TPL-1171 | 起点 Issue |
| TPL-20260510-15 | TPL-1024 | 起点 Issue |
| TPL-20260510-16 | TPL-239 | 起点 Issue |
| TPL-20260510-17 | TPL-168 | 起点 Issue |
| TPL-20260510-18 | TPL-1207 | 作成 PR |
| TPL-20260510-19 | TPL-2166 | local 採番 |
| TPL-20260510-20 | TPL-2167 | local 採番 |
| TPL-20260510-21 | TPL-1223 | 作成 PR |
| TPL-20260510-22 | TPL-1225 | 作成 PR |
| TPL-20260510-23 | TPL-1227 | 作成 PR |
| TPL-20260511-01 | TPL-1281 | 起点 Issue |
| TPL-20260511-02 | TPL-1296 | 起点 Issue |
| TPL-20260512-01 | TPL-1352 | 起点 Issue |
| TPL-20260514-01 | TPL-1381 | 起点 Issue |
| TPL-20260514-02 | TPL-1383 | 作成 PR |
| TPL-20260514-03 | TPL-2168 | local 採番 |
| TPL-20260514-04 | TPL-2169 | local 採番 |
| TPL-20260514-05 | TPL-2170 | local 採番 |
| TPL-20260514-07 | TPL-1385 | 起点 Issue |
| TPL-20260514-08 | TPL-1386 | 起点 Issue |
| TPL-20260516-01 | TPL-1399 | 起点 Issue |
| TPL-20260518-01 | TPL-1402 | 起点 Issue |
| TPL-20260519-01 | TPL-1419 | 作成 PR |
| TPL-20260519-02 | TPL-1415 | 起点 Issue |
| TPL-20260519-03 | TPL-1417 | 起点 Issue |
| TPL-20260520-01 | TPL-1468 | 起点 Issue |
| TPL-20260520-02 | TPL-1480 | 起点 Issue |
| TPL-20260610-01 | TPL-1503 | 作成 PR |
| TPL-20260610-02 | TPL-2171 | local 採番 |
| TPL-20260612-01 | TPL-1522 | 起点 Issue |
| TPL-20260612-02 | TPL-1537 | 起点 Issue |
| TPL-20260613-01 | TPL-1530 | 起点 Issue |
| TPL-20260613-02 | TPL-1535 | 起点 Issue |
| TPL-20260613-03 | TPL-1534 | 起点 Issue |
| TPL-20260615-01 | TPL-1583 | 起点 Issue |
| TPL-20260615-02 | TPL-1608 | 起点 Issue |
| TPL-20260616-01 | TPL-1621 | 作成 PR |
| TPL-20260616-02 | TPL-1623 | 起点 Issue |
| TPL-20260616-03 | TPL-1625 | 起点 Issue |
| TPL-20260618-01 | TPL-1666 | 起点 Issue |
| TPL-20260618-02 | TPL-1681 | 起点 Issue |
| TPL-20260618-03 | TPL-1697 | 起点 Issue |
| TPL-20260623-01 | TPL-1716 | 作成 PR |
| TPL-20260623-02 | TPL-1720 | 起点 Issue |
| TPL-20260623-03 | TPL-1725 | 起点 Issue |
| TPL-20260623-04 | TPL-1736 | 作成 PR |
| TPL-20260624-01 | TPL-1680 | 起点 Issue |
| TPL-20260624-02 | TPL-1738 | 起点 Issue |
| TPL-20260624-03 | TPL-1755 | 起点 Issue |
| TPL-20260624-04 | TPL-1761 | 作成 PR |
| TPL-20260625-01 | TPL-1790 | 起点 Issue |
| TPL-20260626-01 | TPL-1799 | 起点 Issue |
| TPL-20260630-01 | TPL-1827 | 起点 Issue |
| TPL-20260630-02 | TPL-1842 | 起点 Issue |
| TPL-20260630-03 | TPL-1829 | 起点 Issue |
| TPL-20260711-01 | TPL-1882 | 作成 PR |
| TPL-20260711-02 | TPL-1927 | 起点 Issue |
| TPL-20260712-01 | TPL-1886 | 起点 Issue |
| TPL-20260714-01 | TPL-1936 | 作成 PR |
| TPL-20260714-02 | TPL-1944 | 作成 PR |
| TPL-20260715-01 | TPL-1954 | 起点 Issue |
| TPL-20260715-02 | TPL-1967 | 作成 PR |
| TPL-20260716-01 | TPL-2005 | 作成 PR |
| TPL-20260716-02 | TPL-1983 | 起点 Issue |
| TPL-20260717-01 | TPL-2046 | 起点 Issue |
| TPL-20260717-02 | TPL-2044 | 起点 Issue |
| TPL-20260718-01 | TPL-2019 | 起点 Issue |
| TPL-20260718-02 | TPL-2032 | 起点 Issue |
| TPL-20260721-01 | TPL-2084 | 起点 Issue |
| TPL-20260721-02 | TPL-2048 | 起点 Issue |
| TPL-20260727-01 | TPL-2133 | 起点 Issue |
| TPL-20260729-01 | TPL-2158 | 起点 Issue |
| TPL-20260729-02 | TPL-2157 | 起点 Issue |
| TPL-20260730-01 | TPL-2161 | 起点 Issue |
| TPL-20260730-02 | TPL-2165 | 起点 Issue |
| TPL-20260730-03 | TPL-2185 | 起点 Issue |
