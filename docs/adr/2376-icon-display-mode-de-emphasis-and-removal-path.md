---
id: ADR-2376
title: icon display mode は主導線から外し、移行先が出荷されるまで告知しない removal path に載せる
status: accepted
date: 2026-09-04
topic: renderer
authors: [kompiro]
related_to:
  - ADR-30
  - ADR-299
  - ADR-351
  - ADR-1000
  - ADR-2317
  - ADR-2366
  - ADR-2593
  - ADR-9005
  - ADR-1415
scope:
  packages:
    - core
    - app
    - vscode
assumptions:
  - "file: packages/core/src/renderer/svg-renderer.ts"
  - "symbol: packages/core/src/renderer/layout-measure.ts :: ICON_CARD_WIDTH"
  - "file: docs/acceptance/2376-icon-mode-de-emphasis.md"
  - "file: docs/test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md"
---

# ADR-2376: icon display mode は主導線から外し、移行先が出荷されるまで告知しない removal path に載せる

- **日付**: 2026-09-04
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2376](https://github.com/kompiro/karasu/issues/2376)（Phase 1 = de-emphasize、Phase 2 = deprecation の可否）
  - Phase 1 実装 PR: [#2682](https://github.com/kompiro/karasu/pull/2682)。本 ADR が Phase 1 の決定も引き取る（同 PR は「昇格 ADR が決定を carry する」と書いて閉じた）
  - 移行先 Issue: [#2696](https://github.com/kompiro/karasu/issues/2696)（shape mode の `shape: url()` に card frame と aspect 保持を入れる）
  - 投資凍結の対象: [#2639](https://github.com/kompiro/karasu/issues/2639)（icon mode のバッジがタイトルに重なる）、先行 [#2533](https://github.com/kompiro/karasu/issues/2533)
  - [ADR-30](30-icon-mode.md)（icon mode の導入）、[ADR-1000](1000-icon-mode-layout-gap-tuning.md)（icon mode 専用の gap 定数）、[ADR-299](299-vscode-icon-mode-toggle.md)（VS Code のトグル）、[ADR-351](351-resource-shape-and-infra-icon-mode.md)
  - [ADR-2366](2366-node-chrome-and-ports.md)（node 視認性リデザイン）、[ADR-2593](2593-canvas-space-objective.md)（空き空間を目的関数にした行幅予算）、[ADR-2317](2317-preview-toolbar-density.md)（プレビューのコントロール配置規則）
  - TPL: [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)（告知は移行先と同じ release に置く）、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードは全描画面を点検する）
  - AT: [AT-2376](../acceptance/2376-icon-mode-de-emphasis.md)（Phase 1 の受け入れ記録）

## 背景

icon display mode は [ADR-30](30-icon-mode.md) で 2 つの動機から導入された。

1. `user` シェイプが比率計算を含む動的実装で、見た目の調整にコード変更が要った。
2. シェイプの多様性より、アイコンによる識別のほうが視認性が高い。

この 2 つはどちらも icon mode 固有ではなくなった。1 は #2366 の node 視認性バッチ
（[ADR-2366](2366-node-chrome-and-ports.md)）が card + 固定アスペクトのメダリオンに
作り直して解消し、2 は外部 SVG アイコン（`shape: url()`、[ADR-9005](9005-svg-icon-file-import.md) /
[ADR-1415](1415-outline-icon-variants.md)）が shape mode でも効くため、モードの選択とは独立である。

残っていた固有価値は 1 つだけだった。**固定サイズカード（160×100 / 160×56）が、
テキスト長によらずレイアウトを安定させ密に保つ**、という前提である。#2376 はこれを
2 段階で扱うことにした。Phase 1 で主導線から外し、#2366 のリデザインが着地した後に
Phase 2 で deprecation の可否を決める。Phase 1 は PR #2682 で出荷済みで、本 ADR は
その記録と Phase 2 の評価結果の両方を引き取る。

## 決定

**icon display mode を removal path に載せる。ただし deprecation の告知は移行先
（[#2696](https://github.com/kompiro/karasu/issues/2696)）が出荷される release まで行わず、
それまでのあいだ icon mode 固有の描画不具合には投資しない。**

### Phase 1（PR #2682 で出荷済み）の記録

- `◇ アイコンモード` トグルをパンくず行から撤去し、Settings タブの「表示」セクションへ移した。
- これは [ADR-2317](2317-preview-toolbar-density.md) の配置規則（図を描き変える操作は
  パンくず行に置く）への**意図的な例外**である。規則が変わったからではなく、この操作が
  主導線に値しなくなったから動かした。他のコントロールはこれに追随しない。
- 代償として、編集ペインを描画しない `karasu serve` からは icon mode に到達できなくなった
  （言語・テーマが既に同じ理由で到達できないのと揃う）。
- core の `displayMode` API は変えていない（v1.0 前で破壊的変更を避ける方針）。
- **UI には非推奨を含意する表示を置かなかった。** 選択肢は「アイコンカード」であって
  「レガシー」ではない。判断が存在しないうちに UI がそれを先取りしないためで、この線は
  本 ADR が告知の順序を決めた後も変わらない（下記「告知と削除の順序」で告知するまで、
  UI は今のまま何も言わない）。

### Phase 2 の評価

#2376 が定めた 3 項目に、実測で答えた。

| 項目 | 答え | 根拠 |
| --- | --- | --- |
| 1. 可変幅カードでは代替できない、固定サイズ・高密度の需要が残っているか | **いいえ** | 前提そのものが実測で崩れている（下記） |
| 2. 外部アイコン（`shape: url()`）利用者に shape mode への完全な移行先があるか | **いいえ** | card frame が描かれず、アスペクトが 2.13 倍歪む（下記） |
| 3. Phase 1 以降の利用シグナル | **測れない** | Phase 1 のマージは 2026-09-03 で、本 ADR の 1 日前 |

**項目 1**: 「固定サイズカードがテキスト長によらずレイアウトを安定させる」という前提は、
同じ失敗として 2 度観測されている。#2533（修正済み）は固定 160px カードに未切り詰めの
ラベルが描かれて隣と重なる不具合で、#2639（未修正）は固定カード幅 160 に対して
タイトル予算 `ICON_LABEL_MAX_WIDTH = 122` とバッジ幅約 50 が独立に決まるため、
`122 + 50 > 160` でバッジがタイトルの上に必ず載る不具合である。**カードは固定でも
その中のテキスト予算が固定でない**ので、テキスト長は依然としてレイアウトを壊す。
サイズを変えて壊す代わりに、重ね書きして壊すようになっただけである。
一方、密度そのものは [ADR-2593](2593-canvas-space-objective.md) が shape mode で解いた
（キャンバス面積 17% 減）。icon mode に固有の残余価値は無い。

**項目 2**: 同じモデルと同じシートを両モードでレンダリングして測った。シートは
`service { shape: url("my-icon"); background-color: #123456; border-color: #ABCDEF; border-width: 3; }`
のように、利用者から見える frame を宣言している。

| | shape | icon |
| --- | --- | --- |
| 宣言した card frame が描かれるか | **いいえ** | はい（`160×100`, `fill="#123456"`, `stroke="#ABCDEF"`, `stroke-width="3"`） |
| アイコン本体の transform | `scale(1.7909…, 0.84)`（**アスペクト 2.13 倍の歪み**） | `scale(1, 1)` |

原因は 2 つある。card frame を描くのは `renderIconFrame` だけで、これは
`displayMode !== "icon"` で早期 return する。`renderShape` は `backgroundColor` /
`borderColor` / `borderWidth` をアイコン本体へテンプレート置換として渡すが、
ピクトグラムだけの SVG にはそれを使う枠が無いので黙って捨てられる。もう 1 つは、
アイコン本体が node の箱を満たすよう軸ごとに独立にスケールされることで、shape mode では
その箱が `measureNode` によるテキスト由来のサイズになるため、`160×100` の viewBox が
`286×84` のカードに押し込まれる。これを #2696 として起票した。

**項目 3**: Phase 1 出荷から 1 日しか経っていないので、Phase 1 以降のシグナルは存在しない。
Phase 1 より前のシグナルは一方向で、#2366 のリデザイン以降に立った icon mode の Issue
（#2533 / #2639）はすべて固定カード前提に起因する不具合であり、icon mode を使いたいという
要望は 1 件も無い。逆生成した dify モデル（41 view）の計測も shape mode で行っている。

### 告知と削除の順序

[TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)
に従い、次の順序で進める。

1. **#2696 が出荷される release で deprecation を告知する。** docs（`README.md` /
   `docs/tools/app.md` / `docs/tools/app.ja.md`）と changeset に、その release で同時に書く。
2. **その次の major で `displayMode: "icon"` と icon theme を削除する。** VS Code の
   トグル（[ADR-299](299-vscode-icon-mode-toggle.md)）も同じ PR で外す。
3. **それまで icon mode 固有の描画不具合は直さない。** #2639 は本 ADR と #2696 を指す
   コメントを添えて won't-fix で閉じる。

告知を今行わないのは、項目 2 が「移行先が未出荷」と答えたからである。移行先の無い
deprecation は、警告に従うと機能が減る状態を作る。

## 理由

- **項目 1 と 2 の答えは待っても変わらない。** どちらも実測で、利用シグナルの有無に
  依存しない。項目 3 が測れないことは、方向を決めない理由にはならない。
- **TPL-2175 が告知の順序を決める。** karasu には既に「告知は移行先と同じ release に置く」
  という規則があり、`facet` の移行で 1 度適用している。ここで例外を作らない。
- **投資凍結が本 ADR の実利である。** #2639 のような icon mode 固有の不具合が立つたびに
  「直すか」を毎回ゼロから判断し直すのをやめられる。判断は本 ADR が 1 度だけ下す。
- **保守コストの規模**: `displayMode` を参照する非テスト箇所は core 133、app 71、
  vscode 8、nest 6。facets / diff / drill-down / group-by といったレンダラー機能は
  すべて icon mode の経路を考慮する必要がある。加えて icon mode 専用の gap 定数系統
  （[ADR-1000](1000-icon-mode-layout-gap-tuning.md)）がある。
- **削除を今やらないのは破壊的変更を避けるためではなく、順序のためである。** core の
  `displayMode` API は v1.0 前なので変えられるが、移行先の無い状態で消せば外部アイコン
  利用者が行き場を失う。#2696 が先に要る。

### この決定の代償

**告知しないまま直さない期間が生まれる。** #2639 に当たった利用者は、修正されない不具合を
UI 上の何のシグナルも無しに踏むことになる。これを受け入れるのは、告知を前倒しすると
TPL-2175 の失敗モード（行き先の無い警告を出し、警告を無視する習慣を教える）に落ちるためで、
2 つの損のうち小さいほうを取っている。緩和として、#2639 は本 ADR と #2696 を指すコメントを
添えて閉じ、判断の根拠が tracker から辿れる状態にしておく。

## 却下した案

### 案B: 評価だけ記録して判断を先送りする

項目 1 と 2 の測定結果を ADR に残し、項目 3 が測れるようになる時点（次の release など）を
再評価トリガーに指定して、removal path には載せない。

- 却下理由: 再評価のトリガーは結局 #2696 の出荷になり、本決定の順序と一致する。差は
  「そのあいだ icon mode 固有の不具合を直し続けるか」だけで、先送りはその費用を払う側に立つ。
  判断を下さない ADR は #2639 のような案件が来るたびに同じ検討をやり直させる。

### 案C: icon mode を維持する

deprecation しないと決め、#2639 を直し、`displayMode` 分岐を保守し続ける。

- 却下理由: ADR-30 の 2 つの動機が両方失効し、唯一残っていた固有価値の前提も実測で
  崩れている。218 箇所の分岐と専用 gap 定数系統を維持する根拠が残っていない。

### 案D: 今すぐ deprecation を告知する

項目 1 の答えが明確なので、docs と release notes で先に告知し、移行先は後から出す。

- 却下理由: TPL-2175 違反。移行先（#2696）が未出荷なので、告知に従った利用者は
  card frame とアスペクトを失う。「唯一動くやり方をやめろ」と言うのと同じになる。

### 案E: 告知せずに次の major で削除する

告知の手間を省き、破壊的変更としてまとめて落とす。

- 却下理由: deprecation は「まだ動く」ことと対で成立する（TPL-2175）。告知の無い削除は、
  利用者が major に上げて初めて気づく形になる。

### 案F: Phase 1 の UI に「レガシー」と表示する

PR #2682 の初期リビジョンは選択肢を「アイコンカード（レガシー）」とし、削除を示唆していた。

- 却下理由: 同 PR で撤回済み。判断が存在しないうちに UI がそれを先取りすると、決定が
  逆に転んだときに嘘になる。本 ADR で方向が決まった後も、告知は上記「告知と削除の順序」の
  ステップ 1 まで行わないので、UI は据え置きのままである。

## スコープ外

- **外部 SVG アイコン（`shape: url()`）そのもの**（[ADR-9005](9005-svg-icon-file-import.md) /
  [ADR-1415](1415-outline-icon-variants.md)）は icon mode と独立の機能で、削除の影響を受けない。
  Outline ビューが使う `iconNameForNode` も icon mode ではなくアイコン語彙に依存している。
- **VS Code のトグル**（[ADR-299](299-vscode-icon-mode-toggle.md)）は据え置き。低トラフィックな
  設定であり、削除時に同じ PR で外す。
- **`docs/spec/style.md` の `shape` プロパティ記述**は `url()` を含めて変わらない。
