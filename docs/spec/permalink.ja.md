# Deep permalink アンカー

> [English](permalink.md) · **日本語**（このファイル）

**deep permalink** は karasu モデル内の *特定の構造要素 / view* を指すリンクで、
リンクをたどった読者がモデル全体ではなく**ちょうどその要素にドリル / フォーカス
した状態**で着地する。本ページは2つの deep-link サーフェスが共有する
**fragment アンカー**の正典である。

同じアンカーを2つのサーフェスが解決する:

| サーフェス | アンカーの消費方法 |
| --- | --- |
| **静的レンダリング SVG**（`buildDrillDownSvg` / all-views エクスポート） | 純 CSS `:target` + `:has()`。`<svg-url>#krs-system-Payment` を開くとその階層が表示される（JS 不要）。 |
| **nest/app SPA**（`useHistoryNavigation`） | mount 時 / `popstate` で `#krs-…` ハッシュを解析し、node-path index 経由でドリル + フォーカスする。 |

両サーフェスが**同一の文法**を使うため、1つのアンカーは可搬である。レンダリング
SVG からコピーした fragment はアプリでも解決し、その逆も成り立つ。

## アンカー文法

```
#krs-<view>-<id>[:<highlight>]
```

- **`<view>`** — `system` · `deploy` · `org` · `matrix` のいずれか（アプリの
  `ActiveView`。`@karasu-tools/core` の `ShareTargetView` が対応する）。
- **`<id>`** — ドリル先要素の**著者が付けた `id`**。`sanitizeId` を通す
  （`[A-Za-z0-9_-]` 以外は `_`）。リテラル `root` は view の最上位を表す。
  identity は常に `id` であり、`label` や翻訳 / 表示文字列は使わない。
- **`:<highlight>`** *(SPA のみ)* — 着地時にフォーカス強調する `id`（任意）。
  静的 SVG は highlight チャネルを持たない（CSS `:target` は1要素のみ選択）ため、
  この接尾は静的 SVG では落とす。

文法の単一の出所は `@karasu-tools/core` の `anchorId(viewPrefix, id)`
（`packages/core/src/renderer/svg-renderer.ts`）。element アンカーの生成側 —
静的 SVG（`drill-down-svg.ts`）と、ドリル可能な system/org ビューの SPA ハッシュ
生成（`packages/app` の `buildHash`） — は `anchorId` を経由し、2サーフェスが
drift しないことを保証する（parity test 済み）。

**すべての fragment が element アンカーではない。** SPA には単一階層の
whole-view タブ（`#krs-deploy`・`#krs-matrix`）と org Tree View モード
（`#krs-org-tree`）もあり、これらは `<id>` セグメントを持たず、意図的に
`anchorId` 文法の外にある。これらのビューの share `target` はビュー自体を開く
（leaf なし）ため、`target.node` は `system` / `org` でのみ意味を持つ。

## share URL でアンカーを運ぶ

nest インライン share URL（`#s=<payload>` / `/s?s=<payload>`）は deep target を
エンコード済み `SharePayload` の**内側**に optional な `target` として運ぶ:

```ts
target?: { view: ShareTargetView; node?: string; highlight?: string; orgTree?: boolean }
```

1つの opaque トークンで、private fragment URL・server 可視の `/s?s=` unfurl
URL・短縮形のすべてにおいて同一に deep-link できる。`node` はドリル先要素の
**leaf** id（完全なドリル path は leaf から app の node-path index で再構成され、
`#krs-<view>-<node>` ハッシュの解決と同じ）。`target` が無ければモデル全体を
root で開く。開く際、app は history hook の mount より前に URL を上記の正典
`#krs-…` アンカーへ正規化する。未知 / rename 済みの target はモデル全体 /
最近接の解決可能階層へ degrade し、決して throw しない。

## 安定性に関する注意

アンカーは要素を `id` で固定する。**要素の `id` を rename するとアンカーは壊れる**
（stale な `#krs-…` は view root にフォールバックする）。これは安定 identity で
アドレスすることに内在する制約で、ADR → karasu permalink を rename に対して検証
する仕組みは別途追跡している（`adr:check-assumptions` 拡張、#1830）。`label` に
アンカーして回避してはならない — label は表示 / i18n 文字列であり identity では
ない。

> Related TPLs: [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md) — 静的 SVG と SPA ハッシュのアンカーは1つの id ベース文法を保たねばならない。drift すると permalink が片方のサーフェスでしか解決しなくなる。
