---
id: ADR-2461
title: アクセント上の文字はテーマごとのインクにし、半透明クロームは合成後で検証する
status: accepted
date: 2026-08-13
topic: app-ui
related_to: [ADR-2193, ADR-1470, ADR-1368]
depends_on: [ADR-2193]
scope:
  packages: [app]
  concerns: [accessibility]
assumptions:
  - "file: packages/app/src/styles/themes.css"
  - "file: packages/app/src/styles/theme-contrast.test.ts"
  - "grep: packages/app/src/styles/themes.css :: --badge-preview-text"
  - "symbol: packages/core/src/renderer/contrast.ts :: compositeOver"
  - "grep: packages/app/src/components/CommandPalette.tsx :: var\\(--text-on-accent\\)"
---

# ADR-2461: アクセント上の文字はテーマごとのインクにし、半透明クロームは合成後で検証する

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #2461 — white-on-accent and translucent-tint text miss AA
  - [ADR-2193](2193-theme-text-token-contrast.md) — 文字色トークンを全 surface で AA に揃える
  - [TPL-2193](../test-perspectives/TPL-2193-theme-token-contrast-every-surface.md)

## 背景

ADR-2193 の fence は「`themes.css` のトークン × 不透明 surface」を検証する。
そこから外れる 2 種類の組み合わせが未達のまま残っていた。

- **アクセント地に白**: CommandPalette と ProjectPicker の選択行が
  `aria-selected:bg-[color:var(--accent)]` に `text-white` を直書きしていた。
  dark で 3.14:1（light は 5.17:1）。TSX のリテラルなので、CSS を見る
  `styles-no-raw-color.test.ts` にも、トークンを見る `theme-contrast.test.ts`
  にも掛からない。
- **半透明クローム越しの文字**: `--diff-banner-bg` などの tint の上の文字は、
  実効背景が「tint を下地に合成した色」になり、下地単体より必ず比が下がる。
  diff バナーのラベルは light 3.91:1 / dark 4.25:1 だった。

測定は Issue 記載の 2 件では終わらなかった。Reference パネルの
`.reference-badge-preview` は `--text-on-accent`（白）を badge 色の上に置くが、
その背景は `getReference()` が返す **dark パレットの** badge 色で、テーマに
追従しない。したがって **light / dark どちらでも** 白が乗り、`@experimental`
では 2.15:1 だった。`--error-dim` 上の `--error` も light で 4.11:1 だった。

## 決定

**アクセント地の文字はテーマごとのインクにする。** `--text-on-accent` を
light `#FFFFFF` / dark `#0F0F0F` とし、CommandPalette・ProjectPicker の
`text-white` をこのトークン参照に置き換える。

`--accent` 自体は動かさない。dark の `--accent` は不透明 surface 上で文字と
しても使われ（`--bg-overlay` 上 4.68:1）、白地にするために暗くすると
そちらが壊れる。同じトークンが「明るい背景」と「暗い文字」を同時に satisfy
できない以上、切り替えるのは前景側になる。dark の `--error-badge-text`
（`#0F0F0F`）が既に同じ形をしている。

**半透明クロームは合成後で検証する。** `theme-contrast.test.ts` に
`TINTED_PAIRS` を追加し、各 tint が載りうる不透明 surface を宣言して
`compositeOver()` で実効背景を作り、そこに対して 4.5:1 を検証する。宣言した
span はコンポーネントの mount 先を追って決めた（diff バナーは app shell 直下
＝ `--bg-base`、security notice は settings / chat ペイン＝ `--bg-base`、
`--error-dim` は project selector 経由で `--bg-void` に届く）。

これに伴う色の調整:

- light `--error` `#CC2121` → `#BC1E1E`（自身の `--error-dim` 上で 4.11 → 4.79）
- light `--diff-color-removed` `#DC2626` → `#C72020`、
  `--diff-color-added` `#15803D` → `#137538`
- dark `--diff-color-removed` `#EF4444` → `#F26E6E`

**`opacity` による減光はテキストに使わない。** edge-detail の removed 行は
`text-decoration: line-through` に加えて `opacity: 0.75` を掛けており、実効値は
light 2.95:1 / dark 3.15:1 だった。opacity は描画結果に掛かるがトークンには
現れないため、トークンを読む検証は素通りする。line-through が既に意味を
担っているので opacity を外し、減光が要るときは明度の違うトークンを使う
（`styles-no-raw-color.test.ts` に検出を追加。装飾グリフ 2 件のみ許可リスト）。
tint が乗った行のラベルは `--text-muted` では足りない（dark で 3.91:1）ため
`--text-secondary` にした。

`.reference-badge-preview` には専用の `--badge-preview-text`（両テーマとも
`#0F0F0F`）を与える。背景がテーマに追従しない以上、前景も追従させられない。

## 理由

- **未達の在処が「トークンの組」ではなく「描画の組」だった**。ADR-2193 の
  fence はトークン語彙の中だけを見る。TSX のリテラルと半透明合成は、どちらも
  その語彙の外で起きるので、検証の形を変えないと届かない。
- **span を宣言する方が、全 surface を一律に要求するより正確**。全 surface を
  要求すると、実際には起こらない配置のために `--text-link` や `--warning` を
  もう一段暗くすることになる（security notice は `--bg-void` には載らない）。
  宣言はハンドメンテだが、未宣言の tint を drift ガードが落とすので「書き忘れ」
  では通らない。
- **fence の穴は fence 自身に閉じさせる**。`--text-on-accent` は
  `SOLID_PAIRS`、badge 色は `getReference()` から読む専用テスト、tint は
  `TINTED_PAIRS`、未分類の rgba トークンは drift ガードで落ちる。
- **diff 色は 2 つの役割を持つ**ので両方を検証する。バナーのラベル（4.5:1）と
  SVG stroke（3:1）で、片方だけを見て調整すると他方が沈む。

## 却下した案

- **dark の `--accent` を暗くして白のままにする**: `--accent` は文字としても
  使われるため、暗くすると dark surface 上の 4.68:1 が割れる。ブランド色を
  動かす影響範囲（border / ring / glow）も広い。
- **`.reference-badge-preview` に `--text-on-accent` を流用する**: light では
  白のままになるが、この背景は light でも dark パレットの badge 色なので、
  light で 2.15:1 が残る。別トークンにするのが正しい。
- **全 tint を全 surface に対して検証する**: 上記のとおり、存在しない配置の
  ために色を余分に倒すことになる。span 宣言 + drift ガードを選んだ。

## 残る未達（本 ADR の対象外）

- Reference パネルは light テーマでも **dark パレットの** badge 色を表示する。
  インクを変えたので判読はできるが、テーマに追従すべきかどうかは配色の問題で
  あってコントラストの問題ではない。別 Issue で扱う。
- `packages/app/src/components/ui/dialog.tsx` の overlay が `bg-black/60` を
  直書きしており、`--overlay-scrim` トークンを迂回している。非文字なので
  コントラスト上の未達ではないが、テーマ追従の観点では drift（TPL-1001）。
- `TINTED_PAIRS` / `PANEL_TEXT_PAIRS` の前景は**手で宣言している**。トークンの
  値が変われば落ちるが、CSS 側で前景セレクタが別トークンに差し替わっても
  気づけない（レビューで実際に 1 件見つかった: `--diff-bg-*` の前景を
  `--text-secondary` と宣言していたが、当時の CSS は `--text-muted` だった）。
  CSS のカスケードを解決して前景を機械的に導けるようにするのが次の一手。
