---
id: TPL-20260630-03
title: "ADR permalink は record ではなく pointer — in-repo .krs source を必須で記録する"
status: active
date: 2026-06-30
applicable_to:
  - "ADR / 設計記録から karasu の構造（共有 URL・レンダリング済み図）へリンクする規約・スキーマ・生成器を設計するとき"
  - "リンク（短縮 URL / スナップショット URL）を記録するとき、リンク単体を「記録」とせず、SoT である in-repo アセットへの参照を併記して復元可能性を担保するとき"
  - "point-in-time の記録（ADR・監査ログ）が外部サービス（URL shortener / D1 等）に解決を依存するリンクを保持するとき"
known_consumers:
  - docs-site
  - app
  - adr-tools
discovered_from:
  - issue: "#1829"
related_to:
  - TPL-20260510-18
  - TPL-20260510-17
  - TPL-20260510-20
topic: adr-tooling
scope:
  packages:
    - app
    - docs-site
---

# TPL-20260630-03: ADR permalink は record ではなく pointer — in-repo .krs source を必須で記録する

## 観点

ADR（point-in-time の記録）から karasu の構造へリンクするとき、**構造の記録
（source of truth）は in-repo の `.krs`** であり、permalink（taka 短縮リンクでも
`/s?s=` スナップショットでも）はそれを*見る*ための pointer にすぎない。したがって
リンクの隣に **`source`（in-repo `.krs` への参照）を必須で記録**し、リンク単体を
記録にしない。

karasu は L2 実装として **taka 短縮リンク + 必須 `source`** を採用する（生の payload
は数 KB に及びうるため frontmatter にインラインしない）。この形が成立する条件は
「`source` が必須である」こと — これが満たされれば、shortener（taka）が消えても
構造は repo から復元でき、shortener を単一障害点にしない。

不変条件に分解すると:

- **記録は repo にある** — 構造の SoT は in-repo `.krs`（[TPL-20260510-18](TPL-20260510-18-text-as-single-source-of-truth.md)）。
  permalink はその派生表現であり、SoT を置き換えない。`source` はその SoT への
  辿り道であり、リンクの形（短縮 / payload / repo-backed）に依らず復元可能性を担保
  する。
- **リンクは単一障害点にしない** — 短縮 URL は opaque で、shortener のレコードが
  消えると指す構造を失う。`source` を必須にすれば、リンクが死んでも repo から
  再構成できる（point-in-time の厳密さは #1828 の ref-pin 待ち。near-term では
  「ADR の commit 時点の `.krs`」と解釈）。

unfurl が要る共有では **`/s?s=`（query, server-visible）** を短縮の宛先にする。
`#s=`（fragment）はサーバに届かず OGP が死ぬため、短縮も貼付もしない。

## 想定される失敗モード

- 規約・スキーマ・adr-tools の生成器が**短縮 URL だけ**を記録し、`source` を省く。
  → shortener 障害・レコード削除でリンクが死に、ADR から構造を復元できない
  （point-in-time 記録の喪失）。
- 生の `/s?s=` payload（数 KB）を frontmatter にインラインし、ADR が肥大化する。
  → 記録は payload ではなく `source`（in-repo `.krs`）で足りる、という原則の見落とし。
- ADR に `#s=`（fragment）形を貼る／短縮の宛先を `#s=` にする。→ SNS / GitHub で
  unfurl されず、サーバ側の OGP 経路にも届かない。
- deep permalink の対象を `label` で指す。→ i18n / 表示文字列は identity ではなく、
  rename で別名に化ける（[TPL-20260510-20](TPL-20260510-20-id-not-label-for-identity.md)）。

## チェックリスト

- [ ] permalink の隣に **`source`（in-repo `.krs` への参照）が必須**で記録され、
      リンク単体を記録にしていないか。
- [ ] リンク（短縮 URL / payload）が**単一障害点になっていない**か — それが死んでも
      `source` から構造を復元できるか。
- [ ] 短縮する URL は `#s=`（fragment）ではなく **`/s?s=`（query）** か。
- [ ] deep target を指す場合、要素は author-given `id`（`label` ではない）で
      指しているか。
- [ ] 機密構造に対して「短縮しない／自前 shortener」を選べる旨が guide に明記
      されているか（trust posture のユーザー選択）。

## 既知の対処パターン

- **記録は source・リンクは pointer**（[ADR-20260702-01](../adr/20260702-01-adr-permalink-convention.md)
  の改訂 B-3）— `permalink:` を構造化するなら `short`（taka）と `source`（in-repo
  `.krs`）を持ち、`source` を必須にする（`.claude/rules/adr.md`）。検証は `source`
  の実在を必須とし、任意 `short` の解決チェックは外部依存をテストに持ち込むため
  温度を下げる（#1830 へ申し送り）。
- **L1 / L2 の分離** — karasu を参照する ADR はユーザー repo にあり置き場所を
  強制できないため、「何を記録するか」だけの portable guide（L1）を baseline に
  し、固定の置き場所＋機械検証は adr-tools 採用 repo（L2）に限定する。

## 関連テスト

- `docs/acceptance/adr-permalink-convention.md` — 規約どおりのサンプルで permalink が
  `short` + 必須 `source` の形をとることを確認する受け入れ条件。
- 短縮の宛先となる `/s?s=` payload の roundtrip（encode → decode で `.krs` が戻る）は
  `packages/app/src/utils/inline-share.test.ts` が担保する。

## 派生元 spec

この観点は次のドキュメント節を proactive に守るために起こした（双方向 back-ref）:

- `docs/guide/adr-permalinks.md` / `.ja.md`（L1 portable guide）— `> Related TPLs:`
  注釈で本 TPL を参照する。
- `.claude/rules/adr.md` の「ADR から karasu 構造へリンクする（permalink）」節
  （L2 adr-tools 実装規約）。
