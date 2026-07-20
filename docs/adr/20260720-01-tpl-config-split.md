---
id: ADR-20260720-01
title: TPL の reference-data 設定を `tpl.config.json` に分離し、TPL は `date-sequence` を維持する
status: accepted
date: 2026-07-20
topic: adr-tooling
related_to:
  - ADR-20260513-01
  - ADR-20260512-03
  - ADR-20260502-02
scope:
  concerns:
    - ci
assumptions:
  - "file: tpl.config.json"
  - "file: scripts/lint/config-topics-sync.ts"
  - "grep: package.json :: tpl validate --config tpl.config.json --packages-root packages"
  - "grep: package.json :: lint:config-topics-sync"
  - "grep: lefthook.yml :: config-topics-sync"
---

# ADR-20260720-01: TPL の reference-data 設定を `tpl.config.json` に分離し、TPL は `date-sequence` を維持する

- **日付**: 2026-07-20
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2083](https://github.com/kompiro/karasu/issues/2083)（ADR 採番の `issue-number` 移行 — 本 ADR はその Phase 1）
  - 前提 ADR: [ADR-20260513-01](20260513-01-tpl-tools-extraction.md)（tpl-tools 切り出し。`--config adr.config.json` を渡す wiring を決めた ADR — 本 ADR はその config 共有部分のみを改める）, [ADR-20260512-03](20260512-03-reference-data-single-source.md)（reference-data single-source）, [ADR-20260502-02](20260502-02-adr-config-externalization.md)（語彙の外部化）
  - 上流: [kompiro/adr-tools#25](https://github.com/kompiro/adr-tools/pull/25)（`compareAdrIds` — `issue-number` の数値順ソート、`0.0.10`）
  - コード: `tpl.config.json` / `scripts/lint/config-topics-sync.ts` / `package.json`（`tpl:*`）/ `lefthook.yml` / `.github/workflows/tpl-validate.yml`

## 背景

[#2083](https://github.com/kompiro/karasu/issues/2083) で ADR の採番を
`date-sequence`（`ADR-YYYYMMDD-NN`）から `issue-number`（`ADR-<n>`）へ移行する。
`idFormat` は `adr.config.json` の repo 全体設定である。

ところが `@kompiro/tpl-tools` は ADR-20260513-01 の決定に従い
`--config adr.config.json` を渡されており、**`adr-tools` と同じキー `idFormat`
を読む**（`tpl-tools@0.0.6`。既定は `date-sequence`）。したがって
`adr.config.json` に `"idFormat": "issue-number"` を足すと、その設定が TPL 側にも
適用される。

実測: `idFormat: issue-number` を足した状態で `pnpm tpl:validate` を実行すると
**81 件すべての TPL が失敗し、243 findings** が出る（`id-format-invalid` +
README index 不整合）。ADR 移行が TPL 全滅を巻き添えにする構造だった。

## 決定

**TPL 用の設定を `tpl.config.json` に分離し、TPL は `date-sequence`
（`TPL-YYYYMMDD-NN`）を維持する。**

- `tpl.config.json` を新設（`idFormat: "date-sequence"` + `topics`）。`tpl-tools`
  が読むのは `idFormat` と `topics` の 2 キーのみ。
- `package.json` の `tpl:validate` / `tpl:related` は `--config tpl.config.json`
  を渡す。`lefthook.yml` の glob と `.github/workflows/tpl-validate.yml` の path
  filter も `tpl.config.json` に差し替える。
- `topics` は両ファイルに**複製**する。ADR と TPL は同一の語彙を共有し続ける。
- 複製による drift を防ぐため `pnpm lint:config-topics-sync`
  （`scripts/lint/config-topics-sync.ts`）を新設し、両ファイルの `topics` が
  メンバー・順序ともに一致することを検査する。`idFormat` は**意図的に比較しない**
  — 差異こそが分離の目的だから。lefthook の pre-push と、`scripts/lint` の
  vitest mirror（CI）で走る。

## 理由

- **TPL は単一 issue に紐付かない**: TPL は bug retrospective から抽出する観点で、
  しばしば複数 issue にまたがる。`issue-number` は TPL の実態に合わない。ADR は
  逆に「1 決定 = 1 issue」がほぼ成り立つ（#2083 参照）。
- **移行コストの非対称**: ADR 265 件の移行は #2083 が引き受ける価値のある投資だが、
  TPL 81 件を道連れにする理由はない。TPL の採番は誰も困っていない。
- **`topics` 共有は維持する価値がある**: ADR-20260512-03 の single-source 原則の
  実利は「ADR と TPL が同じ topic 語彙で引ける」ことにある。config ファイルが
  1 つであること自体が目的ではない。複製 + 機械チェックで実利は保てる。
- **上流を変えるより呼び出し側で分ける方が軽い**: `tpl-tools` に「ADR とは別の
  `idFormat` キーを読む」ような特別扱いを入れると、汎用ツールに karasu 固有の
  事情が漏れる（ADR-20260513-01 が避けたかったこと）。`--config <path>` を
  受け取る設計は既にあり、別ファイルを渡すだけで済む。

## 却下した案

- **TPL も `issue-number` に移行する**: 語彙は完全に統一されるが、移行対象が
  81 件増え、しかも TPL は issue 対応付けが ADR より弱い（bug retrospective 由来で
  単一 issue に落ちない）。#2083 のレビュー可能性も下がる。
- **`adr.config.json` を共有したまま `idFormat` だけ CLI フラグで上書きする**:
  `tpl-tools` に `--id-format` を足す上流変更が要る。設定の出所が config と CLI に
  分かれ、どちらが効いているか読めなくなる。
- **`topics` を片方から生成する**（例: `tpl.config.json` を build 時に
  `adr.config.json` から生成）: 生成物を repo に置くか build 依存にするかの選択が
  増え、複製 2 箇所・16 語彙という規模に対して過剰。機械チェックで十分。
- **ADR-20260513-01 を `superseded` にする**: 本 ADR が改めるのは「karasu が
  `--config` に何を渡すか」だけで、tpl-tools を独立パッケージにする決定・
  `adr.config.json` をハードコードしない設計は今も有効。`related_to` に留める。
