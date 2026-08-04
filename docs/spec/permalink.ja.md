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
  `ActiveView`。`@karasu-tools/core` の `ShareTargetView` が対応する）に加えて
  `entity`。`entity` トークンは **ドメイン単位のエンティティビュー**を指す:
  `<id>` は domain id で、`#krs-entity-<domainId>` はそのドメインのエンティティ
  ビュー（エンティティとドメイン内関連。他ドメイン先の ghost は後続で入る）
  を開く。エンティティビューは
  静的 all-views バンドル（`drill-down-svg.ts`）に出力され、system ビューの
  ドメインからドリルされるため system pane 内に置かれる。SPA では entity ビューは
  **`system` ビューのサブモード**（独立した `ActiveView` ではない）: app は
  ドメインにドリル（`activeView === "system"`、`viewPath` = 当該ドメイン）した状態で
  entity サブモードを ON にし、`buildHash` が `#krs-system-<domainId>` の代わりに
  `#krs-entity-<domainId>` を出力、`parseHash` が復元する。share `target` では
  boolean の `entityView` フラグで運ぶ（`orgTree` を踏襲）。
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
target?: { view: ShareTargetView; node?: string; highlight?: string; orgTree?: boolean; entityView?: boolean }
```

1つの opaque トークンで、private fragment URL・server 可視の `/s?s=` unfurl
URL・短縮形のすべてにおいて同一に deep-link できる。`node` はドリル先要素の
**leaf** id（完全なドリル path は leaf から app の node-path index で再構成され、
`#krs-<view>-<node>` ハッシュの解決と同じ）。`target` が無ければモデル全体を
root で開く。開く際、app は history hook の mount より前に URL を上記の正典
`#krs-…` アンカーへ正規化する。未知 / rename 済みの target はモデル全体 /
最近接の解決可能階層へ degrade し、決して throw しない。

## アンカーを運ぶ route の形

上記のアンカーは、karasu が配信するどの URL でも同じように解決する。そのうち 2 つは
**モデル**のアドレスで、残りは **payload** のアドレスである。

| 形 | 何を指すか |
| --- | --- |
| `…/<owner>/<repo>[/<path>][@<ref>]#krs-…` | GitHub repo に commit された `.krs` を `<ref>` 時点で解決（省略時は default branch） |
| `…/s?s=<payload>#…` / `…/#s=<payload>` | URL に凍結したインラインスナップショット |

repo-backed 形は GitHub のパスをそのまま取るので、**host を差し替えるだけで変換が完了する**:
`github.com/<owner>/<repo>` → `karasu.kompiro.dev/<owner>/<repo>`。host と owner の間には
何も挟まらない。`/r/` prefix は [#1961](https://github.com/kompiro/karasu/issues/1961) まで
使われていたが、現在は bare 形へ 301 する。新しいリンクをこの形で書かないこと。

repo-backed 形が **generation ではなく resolution** であることから 2 つの帰結がある
（[ADR-2249](../adr/2249-permalink-generation-seam.md)）:

- `.krs` を持たない repo にはその旨を伝えるページが返る。図でもアプリでもない。
  karasu が URL からモデルを作り出すことはない。
- 描画される内容は URL だけで決まる。訪問者の識別・履歴・入力したリクエストなど、
  訪問者側の事情が結果を変えてはならない。変えた瞬間、リンクが人によって別物になる。

> Related TPLs: [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md) — bare 形は root catch-all なので、SPA と兄弟 Function が持つ経路は常に辞退できる状態に保つ; [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md) — resolution に generation やパーソナライズを混ぜない。

## 安定性に関する注意

アンカーは要素を `id` で固定する。**要素の `id` を rename するとアンカーは壊れる**
（stale な `#krs-…` は view root にフォールバックする）。これは安定 identity で
アドレスすることに内在する制約で、ADR → karasu permalink の rename に対する検証は
`pnpm adr:check-permalinks`（`@kompiro/adr-tools` の `krs` kind）が担い、`permalink:`
の anchor が解決しなくなると CI を落とす（#1830）。`label` に
アンカーして回避してはならない — label は表示 / i18n 文字列であり identity では
ない。

> Related TPLs: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md) — 静的 SVG と SPA ハッシュのアンカーは1つの id ベース文法を保たねばならない。drift すると permalink が片方のサーフェスでしか解決しなくなる。
