---
id: ADR-2803
title: shape mode のカードデザインアイコンは、ピクトグラムだけを角に置き、テキストは共通スタックで描く
status: accepted
date: 2026-09-23
topic: renderer
authors: [kompiro]
related_to:
  - ADR-2376
  - ADR-2366
  - ADR-9005
  - ADR-1415
  - ADR-2593
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/shapes/shape-registry.ts :: pictogramGroup"
  - "symbol: packages/core/src/shapes/shape-registry.ts :: PICTOGRAM_OFFSET"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: displayMode === \"icon\" && iconDef\\?\\.labelSlot"
  - "file: packages/core/src/renderer/external-icon-card.test.ts"
  - "file: docs/acceptance/2803-slotted-icon-card-text.md"
  - "file: docs/test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md"
---

# ADR-2803: shape mode のカードデザインアイコンは、ピクトグラムだけを角に置き、テキストは共通スタックで描く

- **日付**: 2026-09-23
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2803](https://github.com/kompiro/karasu/issues/2803)（slotted アイコンがメタ行と client チップを落とし、その高さだけ確保する）
  - 実装 PR: [#2866](https://github.com/kompiro/karasu/pull/2866)、Design Doc PR: [#2854](https://github.com/kompiro/karasu/pull/2854)
  - 先行: [#2696](https://github.com/kompiro/karasu/issues/2696) / PR [#2797](https://github.com/kompiro/karasu/pull/2797)（shape mode の `url()` にカード枠と比率保持を入れた。ADR を持たないので本 ADR がその決定も引き取る）
  - 関連 Issue: [#2802](https://github.com/kompiro/karasu/issues/2802) / PR [#2865](https://github.com/kompiro/karasu/pull/2865)（組み込みアイコンを core が登録する）、[#2816](https://github.com/kompiro/karasu/issues/2816)（`url()` を `icon()` へ綴り替える）
  - [ADR-2376](2376-icon-display-mode-de-emphasis-and-removal-path.md)（icon mode の removal path。移行先は shape mode の `url()`）
  - [ADR-2366](2366-node-chrome-and-ports.md)（`user` のメダリオン、`contentInset`、コーナーレーン）、[ADR-9005](9005-svg-icon-file-import.md)（SVG ファイル + テキストスロット規約）、[ADR-1415](1415-outline-icon-variants.md)（アイコン語彙の共有解決）、[ADR-2593](2593-canvas-space-objective.md)（shape mode の密度）
  - TPL: [TPL-2803](../test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md)（測った行は描かれた行。本件の proactive TPL）、[TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)
  - AT: [AT-2803](../acceptance/2803-slotted-icon-card-text.md)、[AT-2696](../acceptance/2696-shape-mode-external-icon-card.md)
  - コード: `packages/core/src/renderer/svg-renderer.ts`、`packages/core/src/shapes/shape-registry.ts`

## 背景

`renderNode` はカードのテキストを 2 系統で描いていた。アイコン定義が `krs-label`
スロットを持てば `renderSlottedText`、持たなければ `renderDefaultText`。寸法を決める
`measureNode` は shape mode では常に後者（中央寄せのテキストスタック）の行数で高さと
幅を測る。slotted 系統は測った行の一部しか描かないので、測定と描画が食い違っていた。

実物の `service.svg`（viewBox 160×100、ピクトグラム 20×20 を (6, 4)、label スロット
(30, 19)、description スロット (8, 44)）を当てて測ると、食い違いは 4 つあった。

| 症状 | 観測 |
| --- | --- |
| 1. 行が落ちる | `client` + capability + link のカードで `data-meta-glyph` が 0 個（アイコン無しでは 2 個）、capability チップも出ない |
| 2. 上に固まる | label は本体の上から 19/100 の位置。link 2 件のカードは 84px のうち上 16px に label があり、残りが空く |
| 3. 大きさが揃わない | 本体スケールがカード高さ依存で、ピクトグラムが 13.2px（label のみ）から 20px 以上（背の高いカード）まで揺れる |
| 4. 折り返さない | `measureNode` は `DESC_MAX_LINES` 行に折り返して高さを確保するが、描画はスロット位置に 1 行で描く |

[ADR-2376](2376-icon-display-mode-de-emphasis-and-removal-path.md) は icon mode の
移行先を shape mode の `url()`（#2696）と定めている。icon mode の利用者が deprecation
告知に従うと、この経路に乗ってチップを失う。告知の前に移行先を完成させる必要があった。

## 決定

**shape mode では、テキストスロットを持つアイコン（カードデザイン）から
ピクトグラムだけを取り、原寸 20px でカード左上の padding 帯に置く。テキストは他の
シェイプと同じ `renderDefaultText` が描く。テキストスロットを読むのは icon mode だけとし、
icon mode の描かれ方は変えない。`measureNode` は変更しない。**

- 分岐条件は `displayMode === "icon" && iconDef?.labelSlot`。shape mode はスロットを一切読まない。
- ピクトグラムの角位置（カード左上 + (6, 4)）と原寸 20px は `shape-registry` の
  `PICTOGRAM_OFFSET` / `pictogramGroup` が 1 箇所で持ち、組織図レンダラーも同じ値を読む（TPL-2234）。
- (6, 4)〜(26, 24) は shape mode の padding（X 40 / Y 24）の内側に収まるので、テキストと
  幾何的に重ならない。だから測定を変えずに済み、カード寸法とレイアウトは byte 単位で変わらない。
- スロットを持たないアイコンは従来どおり。shape mode では内接・比率保持・中央寄せ、
  icon mode では固定カードを満たす。
- `iconBodyBox` の「slotted は左上寄せ」分岐（#2797）は到達しなくなるので削除した。

## 理由

- **4 つの症状は 1 つの原因の現れである。** shape mode で測定と描画が別のテキストレイアウトを
  使っていたことが原因で、本決定はその片方を消す。以後 `renderDefaultText` に入る変更
  （新しいチップ、折り返し規則、`contentInset`）は `url()` カードにも自動で届く。
- **アイコンが宣言していない位置を発明しない。** スロット規約（[ADR-9005](9005-svg-icon-file-import.md)）は
  label と description の 2 点しか持たない。メタ行や `role` をスロット座標系に積む案は、
  3 行目以降の置き場所を renderer 側の定数として作ることになる。
- **測定を変えないことが最大の安全策になった。** カード寸法が動かないので、レイアウト・
  ルーティング・エッジ端点はいずれも従来どおりで、変わるのはカードの中身だけである。
- **ピクトグラムの大きさが図全体で揃う。** 原寸固定なので、同じアイコンが隣り合うカードで
  別の大きさに見えることがなくなった（[ADR-2366](2366-node-chrome-and-ports.md) が
  `user` のメダリオンで採った形と同じ理屈）。
- **icon mode との見た目の一致は、2 つのレイアウトを保つ理由にならない。** icon mode は
  ADR-2376 で removal path に載っており、shape mode の他のカードと揃うほうが移行後の図として一貫する。

## 引き取った先行決定（#2696 / PR #2797）

#2696 は ADR を持たないまま出荷されたので、その決定も本 ADR が記録する。

- アイコン本体は絵であってカードではないため、宣言された `background-color` /
  `border-color` / `border-width` / `border-radius` はノードのカードとして本体の背後に描く
  （どちらの表示モードでも）。
- shape mode では本体を軸ごとに引き伸ばさず、`viewBox` 比率を保ってカードに内接させる
  （#2696 以前は 160×100 の viewBox が 286×84 のカードに入り `scale(1.79, 0.84)` = 比率 2.13 倍の歪みだった）。
- カード枠はノードの箱に置いたままにする。エッジとクロームが付く先は描かれた輪郭である（TPL-2385）。
- #2797 が入れた「slotted は左上寄せ」は本 ADR で撤回する。撤回できる理由は下記のとおり。

## 実装で設計を覆した点

- **「スロットは持つがピクトグラム group を持たないアイコン」の扱いは分岐にしなかった。**
  Design Doc はそれをシルエットと同じ扱い（内接・中央寄せ）にすると書いたが、実装では
  `pictogramGroup` が `undefined` を返したときに本体の内接描画へ落ちる形になっており、
  結果は同じで分岐は 1 つ少ない。
- **spec の「スロット無しアイコンは内接・中央寄せ」はモードを分けて書く必要があった。**
  レビューで指摘されて実測したところ、`iconBodyBox` は icon mode でノードの箱をそのまま
  返すので、スロット無しアイコンも icon mode では固定カードを満たす（既存テストが
  `scale(6.666…, 2.333…)` を固定している）。en / ja の節をモード別に書き分けた。
- **`PICTOGRAM_SIZE` は公開しなかった。** 20px は `shape-registry` の内部定数で足り、
  公開すると knip が未使用エクスポートとして落とす。

## 却下した案

### 案A: 測定をアイコン対応にし、スロットの座標系に行を積む

`measureNode` が shape mode でもアイコン定義を読み、スロット位置から寸法を出す。本体は
scale 1 で左上に固定し、description はスロット x から折り返し、その下に `role`・チップ・
メタ行をスロット x 揃えで積む。

- 却下理由: スロット規約が宣言していない位置を renderer が発明することになる。加えて
  shape mode にテキストレイアウトが 2 つ残り、折り返し幅・`contentInset`・コーナーレーンとの
  干渉・チップの幅予約を両方に複製し続けることになる（TPL-2234 と同じ drift の形）。

### 案B': ピクトグラムを `user` 型のメダリオンにする

ピクトグラムをカード上辺にまたがる円に入れ、`contentInset` の top でテキストを下げる
（[ADR-2366](2366-node-chrome-and-ports.md) の `user`）。

- 却下理由: 高さが増えるので `measureNode` と `portFrame` の変更が要り、全カードの
  レイアウトが動く。輪郭がカード矩形でなくなり、エッジの付き方（TPL-2385）も再検討になる。
  角に置く採用案で同じ識別性が得られ、そのコストを払う理由がない。

### 案C: 足りない行だけ `renderSlottedText` に足す

description スロットの下に `role`・チップ・メタ行を追加し、測定は変えない。

- 却下理由: 症状 1 しか直らない。症状 2〜4 は残り、行を足すほど本体スケールの小さい
  短いカードでははみ出す（label のみのカードは scale 0.66 で、スロット座標の外に行を置く余地がない）。

### 案D（#2696 当時の却下を撤回）: メダリオンは `url()` の意味を変える

PR #2797 は当時、spec が `url()` を「カスタムシェイプのシルエット」として提示していたため、
ピクトグラムだけを描く案を却下していた。

- 撤回理由: `icons.json` の 30 個はすべて 160×100 のカードデザインで、利用者の SVG を
  読むホストも無い（#2802）。シルエットの用途は原理上しか存在せず、しかもスロット無し
  アイコンの扱いを変えないので失われない。

## スコープ外

- **icon mode の slotted カードもメタ行・チップを描かない。** ADR-2376 の投資凍結に従い直さない。
  icon mode は固定カード（160×100 / 160×56）を返すので、shape mode のような「確保した高さが空く」
  食い違いにはならない。
- **ピクトグラム以外の装飾を持つカードデザインのアイコン**は現存せず、読み込むホストも無い（#2802）。
  利用者の SVG を受け入れる時点で、スロット規約と合わせて決め直す。
- **ピクトグラムを label の左に並べる**（中央スタックの 1 行目に組み込む）見た目は扱わない。
  label の幅予約が変わり、測定の変更が要る。
