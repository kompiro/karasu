---
id: ADR-20260519-06
title: Outline ビューはタグ駆動アイコン variant を core 共有関数で解決する
status: accepted
date: 2026-05-19
topic: app-ui
related_to: [ADR-20260519-01, ADR-20260519-04]
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/core/src/builtins/icon-theme.ts :: iconNameForNode"
  - "symbol: packages/core/src/builtins/icon-theme.ts :: CLIENT_SUBTYPE_TAGS"
  - "symbol: packages/app/src/components/OutlineView.tsx :: OutlineNode"
  - "file: packages/app/src/components/outline-adapters.ts"
---

# ADR-20260519-06: Outline ビューはタグ駆動アイコン variant を core 共有関数で解決する

- **日付**: 2026-05-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #1415 — Resolve tag-driven icon variants in the Outline view
  - 先行 Issue #1408 — Outline ビューへのアイコン表示追加
  - フォローアップ Issue #1445 — icon-theme を単一真実源から生成する
  - 関連 ADR:
    - [ADR-20260519-01](20260519-01-app-outline-view.md) — Outline ビューの導入
    - [ADR-20260519-04](20260519-04-outline-active-view-ast.md) — Outline はアクティブビューの AST に追従する
  - 関連 TPL:
    - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 同一モデルを複数サーフェスに出すとき表示は一致させる
    - [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — 同一語彙の二重表現は片方更新による drift を検証する（本 ADR と同時に起票）
  - コード: `packages/core/src/builtins/icon-theme.ts`、
    `packages/app/src/components/OutlineView.tsx`、
    `packages/app/src/components/outline-adapters.ts`

## 背景

ADR-20260519-01 で導入した Outline ビューは各ノードの Icon Mode
ピクトグラムを表示するが、**base node kind** しかアイコンに解決して
いなかった。プレビューの Icon Mode が描き分けるタグ駆動の variant —
`client` のサブタイプ（`client[mobile]` 等）と `resource` の variant
（`resource[table]` 等）— は反映されず、Outline は常に base の
`client` / `resource` アイコンを出していた。

Icon Mode はこれらを `ICON_THEME_STYLE_SOURCE`（`icon-theme.ts` の CSS
文字列）経由で style resolver が解決する。Outline はこの解決経路を再利用
できなかった: `(kind, tags) → icon name` を返す関数が無く、サブタイプ
一覧 `CLIENT_SUBTYPE_TAGS` も `@karasu-tools/core` から re-export されて
いなかった。同じノードに表示面ごとに別アイコンが出るのは cross-surface
drift（TPL-20260510-06）に該当する。

## 決定

`(kind, tags) → icon name` を解決する関数 `iconNameForNode` を
`@karasu-tools/core` から公開し、`OutlineView` がそれを通じてアイコンを
解決する。`OutlineNode` は `tags` を持ち、system アダプタが populate する。

## 理由

- **解決ロジックの単一集約**: アイコン語彙の解決を core の 1 関数に集約し、
  Icon Mode（renderer）と Outline（app）が同じ語彙を共有する。
  ADR-20260519-01 の「presentational な単一 `OutlineView`」方針を崩さない。
- **resolver と整合した解決順序**: 複数サブタイプタグを持つ client は
  `tags` 順で first-match-wins し、style resolver の
  `applyClientSubtypeFirstMatch` と同じ規則になる。
- **system-view kind に限定**: `iconNameForNode` は Icon Mode（system-view
  の概念）が描くものだけを解決する。`ICON_THEME_STYLE_SOURCE` には
  `team` / `member`（org kind）や deploy kind の規則もあるが、これらと
  `system`・infra item kind は `undefined` を返す。org kind を含めると
  org ビューの Outline が glyph からピクトグラムへ意図せず変わるため、
  スコープを揃えて除外した。
- **infra item kind は Outline 専用 fallback**: `table` / `queue-item` /
  `bucket` は `ICON_THEME_STYLE_SOURCE` に kind 規則が無く `iconNameForNode`
  は `undefined` を返す。Outline は小さな専用 fallback マップで従来の
  ピクトグラム表示を維持する。
- **二重表現の drift をフェンス**: `iconNameForNode` と
  `ICON_THEME_STYLE_SOURCE` は同一語彙の 2 表現であり、片方更新で静かに
  drift しうる。両者を `icon-theme.ts` に co-locate し相互参照コメントを
  置いたうえで、proactive TPL-20260519-02 を同時に起票した。恒久対策
  （単一真実源からの生成）は #1445 で追跡する。

## 却下した案

- **Outline が style resolver を直接呼ぶ**: 解決経路は完全に一本化される
  が、Outline は AST ではなく正規化済み `OutlineNode` を扱うため resolver
  にかけるには AST 相当の入力を再構築する必要があり、presentational な
  設計を壊す。resolver は shape 以外（spacing / color）も解決する重い処理で、
  アイコン名 1 つのために通すのは過剰。deploy / org ノードは Icon Mode の
  対象外で resolver 経路に乗せられない。
- **`OutlineView` 内にタグ分岐を直書き**: 変更は app に閉じるが、アイコン
  語彙が `icon-theme.ts` と `OutlineView.tsx` に二重化し、ADR-20260519-01
  が避けたかった drift を app 側で再生産する。
