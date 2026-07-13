---
id: ADR-20260713-01
title: ADR→karasu permalink の検証（karasu 側 validator `adr:check-permalinks`）
status: accepted
date: 2026-07-13
topic: adr-tooling
related_to: [ADR-20260702-01, ADR-20260630-01, ADR-20260626-04]
scope:
  packages: [core]
assumptions:
  - "file: scripts/adr/check-permalinks.ts"
  - "file: scripts/adr/check-permalinks.test.ts"
  - "symbol: packages/core/src/index.ts :: buildAllViewsSvgProject"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: anchorId"
  - "file: docs/spec/permalink.md"
---

# ADR-20260713-01: ADR→karasu permalink の検証（karasu 側 validator `adr:check-permalinks`）

- **日付**: 2026-07-13
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - Design Doc: `docs/design/adr-permalink-validation.md`（本 ADR に昇格し同 PR で削除）／ Design Doc PR: [#1913](https://github.com/kompiro/karasu/pull/1913)
  - governing ADR: [ADR-20260702-01](20260702-01-adr-permalink-convention.md)（permalink 規約 — 本検証を #1830 に申し送り）
  - 前提 ADR: [ADR-20260630-01](20260630-01-permalink-deep-element.md)（deep permalink アンカー文法 `#krs-<view>-<id>`）
  - アンカー contract: `docs/spec/permalink.md`（+ `.ja.md`）／ L2 規約: `.claude/rules/adr.md`
  - 関連 TPL: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（整合性チェックは両側で起動）、[TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)（permalink は pointer・source が record）、[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)（アンカー文法の parity）、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（identity は id）
  - 受け入れ条件: `docs/acceptance/1830-adr-permalink-validation.md`
  - follow-up: `@kompiro/adr-tools` への `permalink:` schema + 本文サマリ生成（generic 部分）

## 背景

ADR-20260702-01 は「ADR から karasu 構造へリンクする」規約を確定し、frontmatter
`permalink:`（`short` taka + **必須** `source`（in-repo `.krs`、deep のときは
`…krs#krs-<view>-<id>` を添える）+ 任意 `view`）を定義した。しかしその**検証**は #1830 に
申し送られ、karasu 自身の ADR への `permalink:` 遡及適用も「検証が付く #1830 以降」と
保留された。つまり #1830 が `permalink:` 実運用のゲートである。

検証が無いと (1) `source` の `.krs` を移動 / 削除すると pointer が切れる、(2) `.krs` 内で
要素 `id` を rename / 削除すると deep anchor が dangling する（stale は view root に
フォールバックし、読者は「その要素」に着地できない — `docs/spec/permalink.md` §
Stability caveat）。

`adr:check-assumptions` を「拡張」する案が自然に見えるが、それは `@kompiro/adr-tools`
（generic な public package）のコマンドで、`.krs` を parse できず・karasu core に依存
すべきでない。deep anchor 解決は core を要するため、**karasu 側**にしか置けない。

## 決定

karasu 側 validator `scripts/adr/check-permalinks.ts`（`pnpm adr:check-permalinks`）を
新設し、各 ADR の `permalink:` エントリについて次を検査して破れていれば CI / pre-push を
落とす:

- **`source` 必須**（無ければエラー。`short` 単独は不可）。
- **`source` の `.krs` 実在**（repo root 相対）。
- **deep anchor の解決** — `source` に `#krs-<view>-<id>` があれば、その `.krs` を
  `buildAllViewsSvgProject` でレンダーして emit されるアンカー集合（`id="krs-…"`）に
  含まれるか検証。**レンダー出力を正**とすることで、読者が実際に着地できる集合と検証集合が
  drift しない（TPL-20260630-01）。identity は id（`anchorId` 経由, TPL-20260510-20）。
- **`view` 妥当性**（任意） — 既知 view token（`system`/`deploy`/`org`/`matrix`/`entity`）。
- **`short` のオフライン形式検査**（任意） — http(s) URL か・`#s=` fragment 共有でないか
  （fragment は server に届かず unfurl が死ぬ, ADR-20260626-04）。**ネットワーク解決はしない**。

配線は **両側トリガ（TPL-20260520-02）**: この検証は ADR と `.krs` の整合性を見るため、
`adr:check-assumptions` に倣い ci.yml の Required `Check` job と lefthook pre-push の
双方で **path filter / glob 無し**に実行し、`.krs` 側の rename（`docs/adr/**` に触れない
push）でも必ず発火させる。

near-term で確定した副次判断:

- **`short` はオフライン検査のみ**（CI flakiness と機密構造の外部送信を避ける。`--online` は将来）。
- **本文サマリ表の生成は本 PR の範囲外** — ADR-20260702-01 が生成を adr-tools に割り当てて
  いるため、`@kompiro/adr-tools` への follow-up に切り出す。当面サマリは手書き。

## 理由

- **deep anchor 解決は core を要する** — `.krs` → 有効アンカー集合の再構成は karasu の
  parser / renderer が要り、generic な adr-tools には構造的に置けない。karasu 側 validator が
  正しい置き場所。
- **自己完結で near-term のゲートを即解除** — cross-repo リリースに縛られず #1830 を出荷でき、
  `permalink:` の実運用を開始できる。
- **レンダー出力を正にして drift を封じる** — 手書きのアンカー列挙ではなく実 SVG の
  `id="krs-…"` を集合の正とする（TPL-20260630-01 parity）。
- **両側トリガで穴を塞ぐ** — 整合性チェックを ADR 側パスだけに gate すると `.krs` の rename が
  無検査で通る（TPL-20260520-02 / #1480 と同型）。glob 無しで両側を発火集合に含める。
- **CI は fail-closed** — アプリは未知 target をモデル全体へ degrade する（throw しない）が、
  validator は「壊れた permalink を検出して落とす」のが仕事なので解決不能をエラーにする。

## 却下した案

- **generic 部分を `@kompiro/adr-tools` に、anchor 解決だけ karasu に（案2）** — 責務は綺麗だが
  cross-repo でリリース + bump が要り、#1830 の出荷が adr-tools のサイクルに縛られる。schema を
  adr-tools に足しても anchor 解決は結局 karasu 側にも要り、検証二拠点は変わらない。generic
  部分（`permalink:` schema・`source` 実在・本文サマリ生成）は #1830 後の follow-up に切り出す。
- **adr-tools に pluggable な custom-kind hook を足し karasu resolver へ shell out（案3）** —
  汎用プラグイン機構という重い設計を要求する。near-term には over-engineering。

## 申し送り

- **`@kompiro/adr-tools` への follow-up**（[kompiro/adr-tools#17](https://github.com/kompiro/adr-tools/issues/17)）:
  generic な `permalink:` schema 検証（`source` 実在 = ファイルパス存在）と本文サマリ表の生成。
  karasu 側 validator は当面これらも兼ねるが、他の adr-tools 採用 repo が裨益するのは adr-tools
  実装後。
- **`short` の online 解決**（`--online` opt-in）は将来。
- 本 ADR 以降、karasu 自身の ADR に `permalink:` を適用してよい（検証が付いた）。
