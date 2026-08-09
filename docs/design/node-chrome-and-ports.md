# Node chrome（コーナーチップ・kind 色語彙）とエッジ接続点

- **日付**: 2026-08-10
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2366](https://github.com/kompiro/karasu/issues/2366)（提案 H + P10。Phase 1〜3 は #2386 / #2399 / #2412 で出荷済み）
  - 関連 ADR: [ADR-1479](../adr/1479-svg-diagram-theming.md)（テーマ機構と LIGHT_BADGE_COLORS）、[ADR-30](../adr/30-icon-mode.md)（アイコンモード）、[ADR-1000](../adr/1000-icon-mode-layout-gap-tuning.md)
  - 関連 TPL: [TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)（色コントラストの機械検証）、[TPL-1697](../test-perspectives/TPL-1697-kind-style-sets-text-color-per-theme.md)、[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)、[TPL-2044](../test-perspectives/TPL-2044-svg-interactive-control-paints-last.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)
  - コード: `packages/core/src/renderer/{svg-renderer,badge,layout,edge-routing-ports}.ts`、`packages/core/src/builtins/default-style.ts`、`packages/core/src/shapes/shape-registry.ts`

## 背景・課題

#2366 の node 視認性バッチで残った 3 問題を扱う。いずれも「カードの中身」ではなく
「カードの縁とその外側」= node chrome の問題で、互いに幾何を共有するため 1 つの
design doc で方針を揃える。

- **P5 コーナーチップ渋滞**: アノテーションバッジは右上角の**外側**に浮く円 +
  右へ伸びるラベルで、上から入るエッジ・隣接ノードと重なる。同じ角に info「i」/
  deploy「D」ボタン（16px 円）、deploy ビューでは kind バッジも重なる。静的出力
  （CLI render）では押せないボタンが常に描かれる。
- **P7 kind 色語彙の空洞化**: dark テーマで `domain` / `usecase` / `resource` /
  `member` が完全同一配色（地 `#1E3A5F`）。deploy kind の地色（war `#3B2A1F`、
  function `#2D3B1F` 等）は彩度を落とした濁色で、枠だけが浮く。色相の割り当て
  規則が存在しない。
- **P10 接続点の不明瞭**（ユーザー報告、実スクリーンショットあり）: ポートは
  bounding box 基準で、シェイプの描画輪郭を無視する。矢印の先端が右上チップ群の
  数ピクセルに突っ込み、user カードのメダリオン帯（上辺の左右）ではエッジが
  「何もない空間」に刺さる。cylinder の上楕円・hexagon の斜辺でも同様。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| アノテーションバッジ | 単一マージ済みバッジ。`badge.ts` が円 r=10 + 9px ラベルを角の外に描く。geometry は system / org renderer で共有（#1583）。diff は `data-node-badge` + ghost バッジ（#738） |
| ボタン | `renderNode` が右端から 20px 刻みで i / D を配置。`measureNode` は info ボタン幅を条件付きで予約するのみ |
| kind 配色 | `default-style.ts` の BUILTIN_STYLE_TEMPLATE(_LIGHT)。badge-color は TPL-2366 のガードテスト（素の canvas ≥4.5:1、boundary tint 合成 ≥3:1）が機械検証 |
| 予約済みの意味色 | diff = amber、`edge[cyclic]` = 赤、`edge[implicit]` = amber、boundary 帯 = palette の 6 hues（#2179、frame 専用）、team = 緑 |
| ポート | `edge-routing-ports.ts` が bounding box の辺上に配分。シェイプ情報なし。#2367-2369 で candidate chain は一本化済み |
| シェイプ幾何 | #2412 で `contentInset`（content-safe 境界）を導入済み。ポート用の幾何はまだない |
| 縮退タブ / facet リング | 右下タブ（#2179）、bbox 外周リング（#2174、TPL-2044 で操作系より下に描画） |

## 制約・前提

- 色は TPL-2366 のガード（badge/text 系 ≥4.5:1、tint 合成 ≥3:1）を通ること。
  kind 地色⇔文字色の対は TPL-1697。
- アイコンモードは固定カード（ADR-30 / ADR-1000 / TPL-1001）。チップ再配置は
  アイコンモードのアクションバー（React HTML）には触れない。
- diff / cyclic / implicit / boundary / team の意味色と kind 色の衝突を増やさない
  （現状の job=赤 と cyclic=赤 の衝突は許容済みとして維持し、新規衝突を作らない）。
- P10 のポート変更は penetration=0 / overlap=0 の routing 不変条件（`routing-parity.test.ts`）を保つ。交差数 pin の再測定は許容。
- ボタンの有無は**出力の用途**（インタラクティブか静的か）で決める。既存 app の
  クリック挙動（`data-info-button` 等の data 属性契約）は変えない。
- out of scope: エッジ自体の再ルーティング（#2367-2369 で完了）、アイコンモードの
  縮退（#2376）、facet リングとバッジの統合。

## 検討した選択肢

### H-1 コーナーチップ

**案A: インセットチップ行 + 静的出力でのボタン抑制（推奨）**

- アノテーションバッジをカード**内側**右上のピル型チップにする（グリフ + ラベル、
  高さ 16px、上パディング 24px 帯に収まる）。ラベルはカード幅の 40% で elide。
  diff の `data-node-badge` / ghost 意味論は data 属性ごと維持。
- deploy ビューの kind バッジも同じインセットチップに統一（`badge-label` 系の
  スタイル語彙は不変、描画位置だけ変わる）。
- `RenderOptions.interactive`（既定: app=true、CLI render=false）を導入し、静的
  SVG では i / D ボタンを描かない。app 側は現状どおり。
- チップ行の優先順: 右から [annotation] [D] [i]。入り切らない場合はラベルを先に
  落とし、グリフのみで詰める（数え上げではなく「右から詰めて溢れたら degrade」の
  単一規則）。
- チップ行の占有矩形を `LayoutNode.chipZone` として持ち、P10 の keep-out に渡す。

メリット: 枠外衝突が構造的に消える。エッジ/隣接ノードとの重なりがなくなる。
静的出力のノイズが消える。
デメリット: バッジが目立たなくなる（角の外に浮く現状は「目を引く」効果はある）。
snapshot 全面更新。

**案B: 現状配置のまま keep-out だけ導入**

バッジ位置は変えず、ポートと meta 行にバッジ回避を教える。
メリット: 見た目の変化が最小。
デメリット: 隣接ノードとの衝突（バッジは自分のカードの外にある）は解決不能。
「バッジのぶんだけ余白を空ける」レイアウト予約が全ノードに波及し、案A より
複雑になる。

### H-2 kind 色語彙

**案A: 色相割り当て表 + 「同色相ルール」（推奨）**

規則を 2 つに畳む:

1. **論理層は青系の明度・塗りで階層を表す**。同一だった 4 kind を分離する:
   `domain` = 現行 navy 塗り継続 / `usecase` = **塗りなし**（canvas 地 + 枠線のみ。
   「振る舞い」は「構造」より軽く描く）/ `resource` = 中立 slate（論理参照であって
   所有物ではない）/ `member` は shape=user で既に分離済み、配色は domain と共有継続。
2. **deploy kind は「accent 色相の低明度塗り」**: `fill = accent と同色相で L≈0.16`、
   `text = 同色相で高明度`。彩度を落とした濁色（war の茶・function のオリーブ）を
   全廃する。accent（badge-color / border-color）の色相表:

   | kind | hue | 備考 |
   | --- | --- | --- |
   | oci | blue | 現行踏襲 |
   | lambda | purple | 現行踏襲 |
   | jar | green | 現行踏襲 |
   | war | orange | 塗りを茶から橙系低明度へ |
   | function | yellow | 塗りをオリーブから黄系低明度へ |
   | assets | cyan | 現行踏襲 |
   | job | red | cyclic 赤との既存衝突は許容継続 |
   | artifact | gray | 現行踏襲 |
   | store | teal | 現行踏襲 |

   具体 hex は実装時に TPL-2366 ガード（両テーマ、tint 合成込み）を通る値へ調整
   する。表が固定するのは**色相と規則**であって hex ではない。

メリット: 「色を見れば層と種別が分かる」が規則として書ける。spec
（`docs/spec/style.md`）に表を載せられる。ガードテストが規則の破れを検出する。
デメリット: 全 example / guide 図 / snapshot が変わる。ユーザーの既存 `.krs.style`
上書きとの見え方の組み合わせは検証できない（上書きはそのまま勝つ、で仕様通り）。

**案B: 同一 4 kind の分離だけ行う（最小介入）**

domain / usecase / resource の分離のみ。deploy の濁色は放置。
メリット: 変更が小さい。デメリット: P7 の半分（deploy 濁色）が残り、色相規則が
ないままなので次に kind を足すときまた場当たりになる。

### P10 接続点

**案A: シェイプ宣言の port frame + チップ keep-out（推奨）**

- `contentInset` と同じ流儀で、シェイプが `portFrame(w, h)` を宣言する:
  辺ごとに「取り付け線分（辺に沿った from..to）と食い込み深さ」。既定は bbox
  そのまま（box / 外部アイコンは無宣言）。
  - user: top 辺は `深さ = medallionRadius`（カード上辺に取り付く）。メダリオン
    直下 ±medR は取り付け禁止区間。
  - cylinder: top は楕円リム（深さ ry）、bottom は深さ ry。
  - hexagon: left/right は頂点 1 点に収束（from=to=中央）、top/bottom は
    斜辺を除いた平坦部。
  - queue / cloud: cap / 輪郭ゆらぎ分の深さ。
- H-1 の `chipZone`（右上）と縮退タブ帯（右下）をポート配分の keep-out にする。
  矢印先端がチップの下に潜らない。
- 配分アルゴリズム自体（#2367-2369 の chain）は変えず、「辺のどこに置けるか」の
  入力だけを差し替える。

メリット: エッジが常に描画輪郭に接地する。P10 の報告事象（浮いた始点・チップ
直撃）が構造的に消える。シェイプ追加時の拡張点が contentInset と対で揃う。
デメリット: routing の交差数 pin 再測定。深さの分だけエッジが僅かに伸びる。

**案B: keep-out のみ（port frame なし）**

チップ回避だけ入れ、輪郭接地は諦める。
メリット: 小さい。デメリット: P10 の主訴（輪郭から浮く）が残る。user カードを
#2412 で直した今、浮きの主因はメダリオン帯と cylinder/hexagon で、ここを
放置すると F の成果と不整合。

## 比較

| 観点 | H-1 案A | H-1 案B | H-2 案A | H-2 案B | P10 案A | P10 案B |
| --- | --- | --- | --- | --- | --- | --- |
| P5/P7/P10 の解消度 | 全 | 半分 | 全 | 半分 | 全 | 1/3 |
| 変更量 | 中 | 中 | 中（色のみ） | 小 | 中 | 小 |
| snapshot 影響 | 大 | 小 | 大 | 中 | 中（エッジ座標） | 小 |
| 将来の拡張点 | chipZone | なし | 色相規則 | なし | portFrame | なし |

## 現時点の方針

**3 領域とも案A を採用する**。いずれの案B も「P の半分を残す」削減案であり、
Phase 1〜3 で「規則 + 機械検証」を作ってきた路線（contentInset / contrast guard）
と揃えるなら、chrome にも同じ形（宣言的幾何 + 単一規則 + ガード）を与えるのが
一貫する。3 領域は chipZone（H-1 → P10）以外は独立なので、スライスを分けて
出荷する。

実装時の義務: H-2 で `docs/spec/style.md` に色語彙表の節を新設するため、その PR で
proactive TPL を最低 1 件起こす（spec-audit ルール）。候補は「kind を追加するときは
色相表に行を足し、fill/text を同色相ルールで導出する（ガードテストが hex を検証
する）」。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** H-1 チップ再配置 + `interactive` オプション | — | バッジ/ボタンの描画位置と有無のみ。レイアウト座標は不変で、エッジ・色に触れない |
| **B** H-2 色語彙表 | — | `default-style.ts` の値と spec 表のみ。幾何に触れず、ガードテストが安全網 |
| **C** P10 portFrame + keep-out | A（chipZone） | ルーティング入力のみ。penetration/overlap 不変条件のテストが安全網。A 未マージでも portFrame 単体は出せるが、keep-out の対象矩形が旧バッジ位置になるため A 先行が自然 |

> 各スライスの到達点は、実装開始時に起票する sub-issue（親: #2366）の
> `## Slice status` を参照。

## 未解決の問い

- チップのピル背景色: badge-color をそのまま塗りにすると明色で文字が読めない。
  「badge-color を pill 地に、文字は白/近白」+ ガード拡張（白⇔badge-color ≥4.5:1）
  か、「pill 地 = badge-color の低明度、文字 = badge-color」か。実装時に両案を
  レンダリングして決める（ガードテストの拡張はどちらでも必須）。
- `usecase` 塗りなし案は boundary 帯 tint と重なったときの見え方が未検証。
  tint 上での枠線コントラストを guard に足すか、実装時に目視で判断する。
- CLI render に `--interactive` フラグを公開するか（app 内部オプションに留めるか）。
  公開すると CLI の公開 API 変更になるため、まずは内部既定（CLI=false）のみで
  出し、要望があれば公開する。
