---
id: TPL-2632
title: "閲覧者向けの affordance を、作者側の identity で gate しない"
status: active
date: 2026-10-13
applicable_to:
  - "描かれた要素（エッジ・カード・マーク）に hover・hit・強調・減光などの閲覧者向けの反応を付ける、またはその発火条件のセレクタ・フラグを変える変更"
  - "作者が書いた identity（canonical id・`#<id>`・selector で指せること）を必要とする機能（書き戻し・context menu・jump to source）を、閲覧者向けの反応と同じ class やフラグに載せる変更"
  - "identity を配らない描画経路（deploy view・ghost 縮約・collapse stub など）を足す、または既存の経路の要素を別の経路に流す変更"
known_consumers:
  - edge-hover-affordance
  - node-focus
  - edge-context-menu
discovered_from:
  - issue: "#2632"
  - root_cause_file: "packages/core/src/renderer/edge-routing.ts"
  - root_cause_file: "packages/app/src/styles/components/preview.css"
related_to:
  - TPL-1983
  - TPL-219
  - TPL-3090
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-2632: 閲覧者向けの affordance を、作者側の identity で gate しない

## 観点

> 起源は **#2632**（retrospective）。deploy view のエッジに hover しても何も起きなかった。
> hover の強調と peer の減光（#1186）が `.krs-edge--interactive` を条件にしていて、その class は
> canonical id を持つエッジにしか付かない。deploy エッジは `realizes` から導出されるので
> canonical id を持たず、hover も hit-line も無かった。spike で数えると、描かれたエッジの
> 24.7% が同じ理由で反応しなかった（deploy view のほか、当時の multi-system root と ghost 縮約。
> multi-system root のエッジはその後 canonical id を持つようになった）。

閲覧者がしたいこと（線を目で追う、どれが焦点か見分ける）は、要素が描かれていれば成り立つ。
作者が書いた identity は、**書き戻す先がある操作**（direction menu・`edge#<id>` selector）の
ためのものである。2 つを同じ class やフラグに載せると、identity を配らない経路が 1 本
増えるたびに、そこに描かれた要素から閲覧者向けの反応が黙って消える。

発火条件は、**その能力が本当に必要とするもの**に置く。hover と hit は「描かれていること」
（`.krs-edge`）、右クリックの書き戻しは「addressable であること」（`data-edge-canonical-id`）。

## 想定される失敗モード

- **identity を配らない経路で、要素が反応しなくなる。** deploy view と ghost 縮約のエッジ、
  base が衝突したエッジが `canonicalId` を持たない（#2632）。小さな system view ではほぼ全エッジが id を持つので、
  既定のテストモデルでは気づかない。
- **identity を合成して直そうとし、書き戻し先の無い操作を開く。** deploy エッジに canonical id を
  振ると hover は付くが、direction menu の書き戻しは system 側のエッジに当たり、読者が見ている
  キャンバスは変わらない（#2632 の direction 2 を退けた理由）。
- **affordance の条件が identity と無関係な所でも割れている。** stroke の規則が `line` / `polyline`
  しか選ばず `<path>` で描かれたエッジが太くならない、祖先グループの `opacity` が子の
  `opacity: 1` を打ち消す、のように、class を直しただけでは揃わない条件が別にある。
- **同じ発火条件が別の場所に複製されている。** CSS の `:hover` と JS（`node-focus.ts` の
  `EDGE_HOVER_TRIGGER`）が同じ条件を持ち、片方だけ広げると線とマークが食い違う（TPL-3090）。

## チェックリスト

閲覧者向けの反応を付ける・変える変更で確認する:

- [ ] 発火条件のセレクタ・フラグが、その反応に本当に必要なものだけを見ている（hover・hit・減光は
      identity を見ない）
- [ ] identity が要る操作（書き戻し・context menu）は、閲覧者向けの反応とは別の class やフラグに
      載っている
- [ ] identity を配らない描画経路を列挙し、そこに描かれた要素でも反応することを render surface
      ごとにテストしている（TPL-1983 / TPL-219）
- [ ] 要素の形（`line` / `polyline` / `path`）と祖先グループの `opacity` まで含めて、実効値で
      確かめている（子の computed 値だけ見ない）
- [ ] 同じ発火条件を持つ箇所（CSS と JS）を同時に変えている

## 既知の対処パターン

- **能力ごとに条件を分ける**（#2632）: `renderEdge` は hit-line を全エッジに描き、
  `krs-edge--interactive` は canonical id を持つエッジにだけ付ける。`preview.css` の hover 強調と
  減光は `.krs-edge`、`cursor: context-menu` は `.krs-edge--interactive` に置く。
- **祖先グループを持ち上げる**: deploy view のエッジは `<g class="ghost-edges" opacity="0.3">` の
  中にあるので、`.ghost-edges:has(.krs-edge:hover) { opacity: 1 }` で焦点のエッジを実効 1 にする。
- **parity テストで構造を固定する**: examples コーパスの全ファイルを system / deploy / drill-down /
  all-layers / all-views bundle で描き、全エッジが hit-line を 1 本持つこと、`krs-edge--interactive`
  と `data-edge-canonical-id` が一致することを表示面ごとに assert する。

## 関連テスト

- `packages/core/src/renderer/edge-affordance-parity.test.ts`: 表示面ごとに、全エッジが hit-line を
  1 本持ち、右クリックの予告が addressable なエッジに一致すること
- `packages/app/src/components/PreviewPane.test.tsx` › `an edge without a canonical id (#2632)`:
  右クリックでメニューを開かず既定動作を止めない、クリックで detail panel を閉じる、
  description があれば detail panel を開く
- `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx`: canonical id の無いエッジの
  クリックで focus canvas が開き、hover でほかのエッジのマークが沈むこと
- `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts`: Chromium で、deploy エッジの実効
  opacity が焦点 1 / peer 0.25 になること、`<path>` のエッジが太くなること
