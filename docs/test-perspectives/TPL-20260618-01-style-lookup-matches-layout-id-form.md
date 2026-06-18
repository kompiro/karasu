---
id: TPL-20260618-01
title: "ノード style/metadata の lookup は layout が使う id 形（bare / 修飾）をすべて試す"
status: active
date: 2026-06-18
applicable_to:
  - "resolver が解決した per-node style / metadata を renderer が id で引くとき"
  - "新しいビュー（deploy / org / 将来のビュー）の layout が node を `containerId::unitId` のような修飾 id で keying するとき"
  - "`?? defaultNodeStyle` / `?? default` のような silent fallback を伴う lookup を書くとき"
discovered_from:
  - issue: "#1666"
  - root_cause_file: "packages/core/src/renderer/svg-renderer.ts"
related_to:
  - TPL-20260512-01
  - TPL-20260510-15
topic: renderer
scope:
  packages:
    - core
---

# TPL-20260618-01: ノード style/metadata の lookup は layout が使う id 形（bare / 修飾）をすべて試す

## 観点

resolver は per-node の解決済み style を **ある id 形**（多くは bare な AST id）で
格納する。一方、レイアウトは node を **別の id 形**（例: deploy の
`containerId::unitId`、drill-down の修飾 path）で keying することがある。renderer の
lookup がレイアウト側の id 形しか試さないと、格納側の bare id にヒットせず
**`?? defaultNodeStyle` に静かに落ちる** — node は「壊れて見えない」が、解決済みの
style（例: Icon Mode の `shape: url(...)`）を取りこぼし、default で描画される。

silent fallback（`?? default`）はこの不一致を **例外でなく見た目の degrade** に変える
ため、機能テストでも気づきにくい。

## 想定される失敗モード

- deploy / org など修飾 id を使うビューで、resolver が bare id で格納した per-node
  style を renderer が修飾 id でしか引かず、全 node が default style で描画される
  （#1666: deploy Icon Mode が icon を一切描かなかった）。
- 解決済みの shape / color / annotation バッジ等が「指定したのに効かない」形で消える。
- 修飾 id を導入した新ビューを足したとき、style lookup の id 形だけ更新し忘れる。

## チェックリスト

per-node の解決済み style / metadata を id で引くコードを書く / 触るとき:

- [ ] lookup は **格納側の id 形（bare）と layout 側の id 形（修飾）の両方**を試すか
      （例: `styles.nodes.get(styleKey) ?? get(nodeId) ?? get(layoutNode.id)`）
- [ ] `?? default` に落ちたケースが「意図した default」か「id 不一致の取りこぼし」か
      を区別できるか（不一致を silent に流していないか）
- [ ] そのビュー専用の **強いテスト**（default ではない解決済み style が実際に
      描画に現れること）を置いたか — 「例外が出ない / stroke がある」程度の弱い
      アサーションでは取りこぼしを検出できない（#1666 はこれで漏れた）

## 既知の対処パターン

- `svg-renderer.ts` の node lookup に `?? styles.nodes.get(layoutNode.id)` を足し、
  deploy の bare unit id を拾えるようにした（#1666）。同種の修飾 id（diff meta は
  既に `layoutNode.id` で引いていた — #735）に揃えた形。

## 関連テスト

- `packages/core/src/renderer/deploy-renderer.test.ts` —
  「draws the registered icon glyph for a unit in Icon Mode (#1666)」。icon を登録し、
  解決済み `shape: url(...)` が描画（icon glyph wrapper）に現れることを assert する。
