---
id: ADR-20260702-01
title: ADR から karasu 構造へリンクする permalink 規約（taka 短縮 + 必須 source）
status: accepted
date: 2026-07-02
topic: adr-tooling
related_to: [ADR-20260626-04, ADR-20260626-01]
scope:
  packages: [app, docs-site]
assumptions:
  - "file: docs/guide/adr-permalinks.md"
  - "file: docs/guide/adr-permalinks.ja.md"
  - "file: docs/test-perspectives/TPL-20260630-03-adr-permalink-records-source.md"
  - "symbol: packages/app/src/utils/inline-share.ts :: buildShareUrls"
---

# ADR-20260702-01: ADR から karasu 構造へリンクする permalink 規約（taka 短縮 + 必須 source）

- **日付**: 2026-07-02
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1829](https://github.com/kompiro/karasu/issues/1829)（near-term ADR permalink、permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826)）
  - 実装 PR: [#1850](https://github.com/kompiro/karasu/pull/1850)（Design Doc PR: [#1836](https://github.com/kompiro/karasu/pull/1836)）
  - 関連 ADR: [ADR-20260626-04](20260626-04-karasu-nest-ogp-share-page.md)（`/s?s=` OGP 共有ページ）/ [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（karasu-nest stateless）
  - L1 guide: `docs/guide/adr-permalinks.md`（+ `.ja.md`） / L2 規約: `.claude/rules/adr.md`
  - 関連 TPL: [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)（permalink は record ではなく pointer）
  - 受け入れ条件: `docs/acceptance/adr-permalink-convention.md`
  - 前方リンク: #1830（`permalink:` の検証）・#1827/#1833（deep target エンコード）・#1828（repo-backed / source の ref-pin）

## 背景

keystone の製品ループ（epic #1826）は「設計判断をする → 結果の構造を in-repo の
`.krs` に記録する → その構造に **リンクする** ADR を書く」。このうち「ADR から
karasu 構造へリンクする」near-term 実装が #1829 で、inline `?s=` snapshot と taka
短縮の**機構**は既に出荷済み。残るのは「その URL を **ADR にどう記録して再現可能性を
担保するか**」という運用規約である。

規約が無いと (1) ADR ごとに permalink の置き場所がバラつき機械検証できない、
(2) taka 短縮 URL は opaque で、短縮 URL **だけ**を貼るとリンク切れ（D1 レコード削除
/ 期限切れ）時に指す構造を再現・監査できない、という症状が出る。

## 決定

ADR から karasu 構造へリンクする規約を **2 層**に分ける。

- **L1（portable guide）** — 任意の ADR ツール（adr-tools / Log4brains / 素の
  Markdown / 無規約）向けの baseline。「**何を記録するか**」だけを縛り、置き場所は
  縛らない。karasu を参照する ADR はユーザーの repo にユーザーの規約で存在するため、
  karasu は固定の置き場所を一律強制できない。
- **L2（adr-tools 実装）** — `@kompiro/adr-tools` を採用した repo（karasu 自身を
  含む）向けの reference 実装。固定の frontmatter `permalink:` ＋ 機械検証で L1 を
  強制する。

記録する内容は次のとおり（**改訂 B-3**）:

- **記録（SoT）は in-repo `.krs`**、permalink はそれを見る pointer。
- karasu（L2）は **taka 短縮リンク（`short`）＋ 必須 `source`（in-repo `.krs`）** を
  記録する。生の `/s?s=` payload は数 KB に及びうるため frontmatter にインライン
  しない。
- 短縮の宛先は **`/s?s=`（query, server-visible）** を短縮したもの。`#s=`（fragment）は
  server に届かず OGP unfurl が死ぬので不可。
- L2 frontmatter: `short`（taka）＋ `source`（必須）＋ `view`（任意）。本文の
  クリック用サマリは adr-tools が frontmatter から生成する（手書きしない）。

```yaml
permalink:
  - short:  https://taka.kompiro.dev/TkrZQG    # taka 短縮リンク（クリック用 pointer）
    source: examples/payments/system.krs       # 必須: in-repo .krs（記録・復元元）
    view:   system                             # 任意
```

## 理由

- **L1 / L2 の分離** — karasu はユーザー ADR のフォーマットを強制できない。だから
  「何を記録するか」だけの portable guide を baseline にし、固定置き場所＋機械検証は
  adr-tools 採用 repo に限定する。ユーザーは adr-tools 非採用でも L1 を見て自分の
  ツールに合わせられる。
- **記録は `.krs` source・permalink は pointer** — 構造の SoT は in-repo `.krs`
  （[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)）。
  `source` を**必須**にすることで、taka が消えても構造を repo から復元でき、shortener を
  単一障害点にしない。point-in-time の厳密な immutability は #1828（ref-pin）に切り分け、
  near-term では「ADR の commit 時点の `.krs`」と解釈する。
- **trust posture はユーザー選択** — `/s?s=` payload には図情報が入る。短縮すると
  shortener がそれを保持するため、機密構造では「短縮しない」「自前 shortener」を選べる
  旨を guide に明記する。
- **L2 は frontmatter が記録・本文は生成** — 検証を単一ソース（frontmatter）に集約し、
  本文の二重メンテを避けつつ「読者がクリックして構造を見る」可読性も満たす。

## 却下した案

- **短縮 URL だけを記録** — opaque でリンク切れ時に再現不能。ADR の point-in-time
  記録として不十分（`source` 必須で棄却）。
- **自己完結 `/s?s=` payload を frontmatter の正にする（当初案 B-4）** — 凍結
  スナップショットで構造的に immutable という利点はあるが、payload が数 KB に及び ADR
  frontmatter が肥大化する。「ADR に payload を載せたくない」というユーザー判断で
  B-3（taka 短縮 + 必須 source）に改訂した。immutability は `source` ＋ git（将来 #1828
  の ref-pin）で担保する。
- **本文の散文にリンクを貼るだけ / `assumptions:` を拡張** — 機械検証しにくい、または
  `assumptions`（コード symbol の実在前提）の意味が過負荷になるため、専用の
  `permalink:` フィールド（L2）を採る。

## 申し送り

- `permalink:` の検証（必須 `source` の `.krs` 実在・`short` の解決）と本文サマリ生成は
  #1830 / `@kompiro/adr-tools` に委ねる。現状の `adr:validate` はまだ `permalink:` を
  検証しないため、当面は手書きで規約に従う。
- 本 ADR は karasu 自身の ADR には `permalink:` をまだ遡及適用しない（L2 検証が付く
  #1830 以降に適用。worked example は L1 guide に置く）。
