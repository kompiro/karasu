# トランクの合流と分岐を「本数」で読ませ、交差マークを潰さない

- **日付**: 2026-09-21
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2631](https://github.com/kompiro/karasu/issues/2631)（親 [#2598](https://github.com/kompiro/karasu/issues/2598) の slice E）
  - 関連 ADR: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c: ガター / 集約トランク / 交差マーク）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（本判断を slice E に残した ADR）、[ADR-1185](../adr/1185-parallel-edge-bundling.md)（束ねても edge identity は保つ）、[ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（ラベル衝突回避）、[ADR-2330](../adr/2330-ungrouped-routing-parity.md)（計測柵で ungrouped を保証）
  - 関連 TPL: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)（本 PR で起こす proactive TPL。ADR-1859 の「交差は表現で無害化する」という原則に対して、本設計が足す装飾が違反しうると分かったため設計時に起こしたもので、出荷済みの bug からの抽出ではない）
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`、`crossing-marks.ts`、`edge-routing.ts`、`label-placement.ts`、`svg-renderer.ts`、`routing-parity.test.ts`

## 背景・課題

#2631 は「boundary 軸で 2 本のエッジが 1 本に見える」という bug として起票された。計測すると、現在 main で残る共線ペアは **すべて trunk 兄弟**（ADR-1859 P2c-B の集約トランク）であり、spine と target entry を設計どおり共有しているものだった。ungrouped は 0 件で、grouped の team / boundary にだけ残る。

| 軸 | 共線ペア v / h | うち trunk 兄弟 | junction dot |
| --- | --- | --- | --- |
| none | 0 / 0 | 0 | 0 |
| team | 4 / 4 | 4 / 4 | 3 |
| boundary | 1 / 2 | 1 / 2 | 2 |

（reverse-engineered dify、root view、31 edges）

つまり #2631 の受け入れ条件 AC-1「corridor か port を分ける」は、ADR-1859 の AC-2「同一 target への複数エッジを 1 トランク + junction dot に束ねる」と正面から衝突する。ADR-2598 はこの読み替えの判断を slice E に残していた。

トランクを廃する案（各エッジに固有 lane と固有 port を与える）と、spine を数 px ずつ離して束に見せる案を実装して比べたところ、**どちらも junction dot が 1 つも描かれなくなる**ことが分かった。合流マークは「spine がその点より上へ伸びる T 字」にだけ打つ設計（`crossing-marks.ts`、`trunkId` と spine x で束ねる）なので、spine を分けた時点で T 字が消える。集約であるという情報を図から落とす方向になる。

そこで集約は残すと決めた上で、dot だけでは読めない 2 点を潰す。

1. **どのラベルがどのエッジか読めない。** trunk エッジのラベルは既定の「最長セグメントの中点」規則（`defaultLabelAnchor`）に従うため、最長である共有 spine の中点に落ちる。fan-in 7 本のモデルでは 7 つのラベルが、誰のものでもない 1 本の線の脇に縦に並ぶ。
2. **合流後の 1 本が何本ぶんか読めない。** dot は合流が起きた点を示すが、その先の幅 1px の線が 2 本ぶんか 7 本ぶんかは示さない。

併せて、同じ語彙を**出ていく側**にも当てられることが spike で分かった。同じ source から出るガター経路は今それぞれ固有の lane と固有の fan port を取っており、1 つのカード辺から 8 本出る dify の `ApiBackend` ではカード際で互いに交差する。これを 1 本の spine にまとめて各 target の行で枝を落とすと、交差が 2 割減り、キャンバスも 3〜4% 縮む。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 集約トランク | `aggregateGroupTrunks` が **target で** グループ化。右 spine へ清掃可能な部分集合を取り、それが 2 本以上あればその部分集合だけが 1 つの spine x と 1 つの entry port を共有し `trunkId` を付ける。stub が塞がれた兄弟は `routeGroupedEdges` の結果を保つ（AC-1 を維持し、以前より悪くならない） |
| 合流マーク | `computeCrossingMarks` が `trunkId` と spine x で elbow を束ね、spine が上へ伸びる elbow にだけ `JunctionMark`（半径 3 の dot）を出す |
| 交差マーク | 同関数が `HopMark`（半径 `HOP_RADIUS = 4` のアーチ）を「より水平な側」のセグメントに出す。host 側の線は `gappedStrokePath` でギャップを空ける |
| ラベル位置 | `labelAnchorWithSegment` が既定で最長セグメントの中点。`label-placement.ts` の衝突回避（#2048）が同じアンカーを再計算して押しのける |
| ガター lane | `distributeGutterLanes` は `trunkId` 付きを飛ばし、単独エッジの lane を **全 trunk spine より外側**（`maxTrunkX` の先）から採番する |
| ポート扇 | `fanOutGutterPorts` は 1 つのカード辺に付く全エッジを分配する。trunk の target entry だけは `trunkId` ごとに 1 スロットへ併合する |
| 計測柵 | `routing-parity.test.ts` が examples 11 モデルで貫通 0 / 共線 0 を assert。**trunk を作るモデルは 1 件も無い**（全モデル `0 trunked in 0 trunks`）ので、トランクの設計は柵の外にある |

最後の行は TPL-2598 そのものの再発である。柵は trunk 兄弟を除外しておらず、trunk を作る fixture を 1 件足せば落ちる。現状の 0 は「まだ trunk を見ていない」だけの 0。

## 制約・前提

- **幾何を変えない（fan-in 側）。** 経路・ポート・キャンバスは現行のまま。変えるのはラベルのアンカーと装飾だけ。これは 4 案すべてで実測して確認した（下の計測節）。
- **決定性を保つ。** 同一入力 → 同一 SVG（`docs/concepts.md` Goals）。装飾は最終座標の純関数として導出する。
- **既定（Group by: none）を変えない。** トランクは grouped 専用（#2364 で ungrouped は却下済み）。
- **交差は表現で無害化する（ADR-1859）。** 交差が「接続に見えない」ことは装飾より優先する。装飾が交差マークを覆うのは許容しない。
- **edge identity を保つ（ADR-1185）。** 束ねるのは描画であって統合ではない。各 `LayoutEdge` は自分の線・自分のラベル・自分の detail panel を持ち続ける。
- **`packages/core` から環境を読まない。** core のソースは browser 向けパッケージ（i18n / nest / app / vscode）からも typecheck されるので、`process.env` を直接参照すると `TS2591` でそれらのビルドが落ちる（spike で実際に踏んだ）。本設計の 5 項目はいずれも切り替えスイッチを持たず、定数または既存の `LayoutOptions` として実装する。
- out of scope: ungrouped ビューの混雑（dify `ApiBackend` の 8 本扇）、ポート扇の間隔に下限を設けること、`LANE_PITCH` の変更。

## 検討した選択肢

### 読み替えの判断（#2631 AC-1 をどうするか）

#### 案1: 集約の表現として確定し、読めるようにする

spine と entry の共有は ADR-1859 AC-2 のとおり正とし、#2631 の AC-1 を却下として記録する。その上で合流マークを本数 tip に置き換え、spine の太さでも本数を示す。

**メリット**

- fan-in 側は幾何が 1px も動かない。面積・貫通・重なりのどれも現状維持
- 「集約である」という情報が図に残る（むしろ強まる）

**デメリット**

- ADR-1859 AC-2 の解釈を確定させる決定になるので、後から覆しにくい

#### 案2: spine を数 px ずつ離して束に見せる

**メリット**: 重なり 0 になる（dify 1/2 → 0/0）。
**デメリット**: junction dot が 0 個になり、集約の表現ではなく「近接した平行線」になる。幅も増える（fan-in 8 で +17%）。

#### 案3: トランクを廃して完全分離

**メリット**: #2631 の AC-1 を文字どおり満たす。
**デメリット**: 案2 と同じく dot が消え、幅は fan-in 8 で +34%。ADR-1859 AC-2 を supersede する必要がある。

### 合流後の本数をどう見せるか

#### 案A: 本数 tip + 帯（採用）

合流点の dot を「そこから先が何本ぶんか」の数字 tip に置き換え、spine を本数ぶん太く描き、その帯を target へ入る共有の横線（entry）まで L 字で延ばす。

#### 案B: 本数 tip のみ（帯なし）

tip だけを置き、線の太さは現行のまま。

| 観点 | 案A | 案B |
| --- | --- | --- |
| 俯瞰で束と分かるか | 線の太さで分かる | 分からない（寄って数字を読む） |
| 共有 entry の扱い | 束として太く描かれる | 現行どおり細い |
| 交差アーチへの影響 | 帯に埋もれるので調整が要る | 影響なし |
| 増える描画 | 帯 + tip | tip のみ |

### アーチの大きさ

現行の半径 4px は小さく、帯の上では完全に埋もれる。tip と同じ 9px まで振って計測した（詳細は計測節）。9px は grouped ビューで隣の平行線に届いて破綻するため、**6px** を採る。

### 出ていく束（fan-out trunk）

fan-in の鏡像として、同じ source から出るガター経路を 1 本の spine にまとめ、各 target の行で枝を落とす。合流ではなく分岐なので tip は下るほど減る。

## 計測

すべて reverse-engineered dify（10,093 行、root view）。

**装飾だけを変える案は幾何を動かさない。** 下の表がその 3 つ（現行 / 案A / 案B）。
経路そのものを変える案2（spine を離す）と案3（トランク廃止）は幅が増える（fan-in 8 で +17% / +34%、「検討した選択肢」節）ので、この表には入らない。

| 案 | 共線 v / h（兄弟除く） | 貫通 | 合流マーク | キャンバス | 再描画 |
| --- | --- | --- | --- | --- | --- |
| 現行 | 0 / 0 | 0 | dot 2 | 1824x2935 | 安定 |
| 案A | 0 / 0 | 0 | tip 2 | 1824x2935 | 安定 |
| 案B | 0 / 0 | 0 | tip 2 | 1824x2935 | 安定 |

ラベルを持たないモデル（dify を含む）では、ラベル移動ぶんの差分は出ない（同一ハッシュ）。差分が出るのは trunk エッジにラベルがあるモデルだけ。

**アーチ半径の上限。** 判定は 3 つ。隣の平行線に触る / そのエッジの端点でないカードに重なる / host 線のギャップが接続点まで届く。

| 半径 | none 隣 / カード / ポート | team 隣 | boundary 隣 |
| --- | --- | --- | --- |
| 4（現行） | 2 / 0 / 2 | 0 | 0 |
| 5 | 2 / 1 / 8 | 0 | 0 |
| 6 | 2 / 4 / 8 | 0 | 0 |
| 7 | 11 / 4 / 9 | 0 | 0 |
| 8 | 20 / 4 / 9 | 0 | 0 |
| 9（tip と同寸） | 20 / 4 / 9 | **45** | 0 |

examples の 4 モデル（hato / hr-tool / getting-started / ec-platform 04）は半径 9 でも全項目 0。問題が出るのは 10,000 行規模の最混雑部だけ。**拘束しているのは `LANE_PITCH`（14px）ではなくポート扇の間隔**で、`LANE_PITCH` を 22px に広げても team の 45 件は 1 件も減らず面積も変わらない。実際に触る相手は `fanOutGutterPorts` が 1 つのカード辺に並べた線で、その間隔は「辺の使える長さ ÷ 本数」なので混雑した辺では 9.6px まで詰まる。

**帯は交差マークを飲む。** 帯幅は `1 + min(本数 - 1, 8) x 3` px、アーチの立ち上がりは 4px。本数 4 以上（帯 10px）でアーチが帯の内側に入り、7 本（19px）では完全に消えて「縦線が帯に合流した」ように読める。さらに、本数 tip が交差点とほぼ同じ高さに来ると **交差＝非接続のアーチが合流＝接続のマークに覆われる**。同じカードから trunk stub と外向き stub が出ると y が数十 px しか違わないため構造的に起きる。

**fan-out trunk の効果。**

| ビュー | fan-out 本数 | hop 数 | アーチ同士の近接 | キャンバス |
| --- | --- | --- | --- | --- |
| team 現状 | 0 | 147 | 36 | 2176x3373 / 7.34Mpx |
| team 有効 | 8 | 122 | 4 | 2104x3373 / 7.10Mpx |
| boundary 現状 | 0 | 156 | 39 | 1824x2935 / 5.35Mpx |
| boundary 有効 | 5 | 123 | 0 | 1752x2935 / 5.14Mpx |
| 合成 fan-out 8 | 0 → 7 | — | — | 幅 468 → 348 / 1.05 → 0.78Mpx |

束が成立しないモデル（examples、source が別々の合成 fixture）では 1 バイトも変わらない。

## 現時点の方針

**案1 + 案A + アーチ 6px + fan-out trunk を採用する。**

集約は ADR-1859 のとおり正とし、#2631 の AC-1 は却下として新 ADR に記録する。その上で以下を足す。

幾何との関係は 2 つに分かれる。**1 から 4（fan-in 側の可読性とアーチ）は幾何を 1px も動かさない**ので、面積・貫通・重なりのどの指標とも引き換えにならない。**5（fan-out trunk）は経路を変える**: ガター回廊が 1 本にまとまるぶんキャンバスが縮み（team 7.34 → 7.10Mpx、boundary 5.35 → 5.14Mpx）、交差も減る（147 → 122 / 156 → 123）。非兄弟の共線ペアと貫通は 0 のまま、という形で引き換えが無いことを確認している。

1. **trunk エッジのラベルを自分の stub に置く。** trunk 経路の最初のセグメントはそのエッジだけのもので、以降は兄弟と共有する。`labelAnchorWithSegment` に「このセグメントに置く」という指定を足し、`renderEdge` と `label-placement.ts` の両方から同じ指定を渡す（両者がずれるとラベルと衝突回避が別の場所を指す）。
2. **合流マークを本数 tip にする。** dot を、そこから先が何本ぶんかの数字に置き換える。N 本の fan-in なら N-1 個の tip が 2, 3, ..., N と並ぶ。
3. **spine を本数ぶん太く描き、共有 entry まで延ばす。** 帯はエッジの下に敷く。target へ入る横線は全本数が通るので束の最も太い部分になる。
4. **アーチの既定半径を 4px から 6px にする。** 併せて、帯に載るアーチは帯の半幅 + 3px まで広げ・高くして帯の外へ出す。tip は交差点と重なるときだけ spine 上をずらして避ける。
5. **fan-out trunk を足す。** 同じ source から出るガター経路を 1 本の spine にまとめ、各 target の行で枝を落とす。tip は下るほど減る。lane は fan-in トランクより外側から採番し、`fanOutGutterPorts` では source 側を 1 スロットに併合する。

**案B を採らない理由**: 帯が無ければ交差アーチの調整も要らず実装は小さいが、図を引いて見たときに束であることが分からない。#2631 が「1 本に見える」と報告した読者は俯瞰で見ていたので、俯瞰で答えが出る形を採る。

**半径 9px を採らない理由**: grouped ビューで隣の平行線に届く（team で 45 件）。通すにはポート扇の間隔に下限を設ける必要があり、それは配置に返る変更になる。

### fan-out trunk は新しい決定であること

ADR-1859 AC-2 は「同一 target への複数エッジを 1 トランクに」であり、source 側は対象外だった。出口を共有することの意味（この node からまとめて出る）は集約とは別の主張なので、新 ADR で明示的に決める。読み方は次のとおりに統一する。

- **tip の数字はつねに「その spine 区間が運んでいる本数」**。fan-in では下るほど増え、fan-out では下るほど減る。どちらも帯の太さと一致する。
- 1 つの図に両方が現れても、tip と帯の読み方は変わらない。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** fan-in の可読性（ラベル / tip / 帯 + 柵） | — | 幾何を変えないので、A 単体で図が悪化しない。帯を入れる以上アーチの帯越え調整は A に含める（含めないと交差が読めなくなる） |
| **B** アーチ既定半径 4 → 6 | — | A と独立。全ビュー共通の見え方の変更で、A が無くても単体で成立する |
| **C** fan-out trunk | A | tip と帯の機構を使う。A が入っていないと分岐の本数を示す手段が無い |

> 各スライスの到達点は親 Issue [#2631](https://github.com/kompiro/karasu/issues/2631) の `## Slice status` に置く。

### 柵とテスト

- **trunk を作る fixture を `routing-parity.test.ts` の corpus に足す**（TPL-2598）。現状どのモデルも trunk を作らないので、足さない限りトランクの設計は柵の外にある。fixture は合成で、fan-in と fan-out の両方を飽和させる。
- **共線ペアの assert に兄弟の除外を明示する。** 現在 model レベルの `collinearOverlaps` は trunk 兄弟を除外していない（unit レベルの同名ヘルパーは除外している）。「trunk 兄弟は spine 1 本と entry 1 点を共有する」を**別の assert として肯定的に固定**し、それ以外のペアは 0 とする。暗黙の 0 を、意図した 0 に変える。
- **端点がノードの輪郭に載り続けることを assert する**（TPL-2385、#2631 の AC-2）。ラベルのアンカーを動かしてもポートは動かさない。
- **装飾が交差マークを隠さないことを assert する**（新 TPL-2631）。帯に載る hop について「アーチの幅と高さが帯の半幅を超える」を機械的に確認する。
- 決定性: 同一入力を 2 回描いて同一ハッシュ。

### 受け入れテスト

実装 PR で `docs/acceptance/2631-*.md` に起こす。人手で確認するのは次の 4 点に絞る。

1. fan-in が 3 本以上あるモデルを Group by: team で開き、各エッジのラベルが自分のカードの横（stub 上）にあること。
2. 同じ図で、合流点の数字が下るほど増え、spine の太さが同じ刻みで太くなること。target に入る横線が束の最も太い部分であること。
3. その spine を横切る線が、帯の外へ出るアーチで「またいでいる」と読めること。数字が交差点を覆っていないこと。
4. fan-out が 3 本以上あるモデルで、1 本の spine が source から出て、枝が抜けるたびに数字が減ること。

## 未解決の問い

- **帯の角。** spine と entry の帯を butt cap で突き合わせているため外角に小さな切り欠きが出る。テーパー付きの 1 本のポリゴンで描くか、角を丸めるか。実装時に決める。
- **stub が短いときのラベル。** dify で 112px、合成例で 69px。長いラベルはカードに被りうるので #2048 の衝突回避との噛み合わせを詰める。
- **tip の形。** 背景色で抜いた円 + 数字を前提にしている。テーマ（light / dark）での抜き色と、facet オーバーレイ時の色の扱いは実装時に確認する。
- **ungrouped の最混雑部。** 半径 6px では dify の ungrouped で「カードに重なる」が 0 → 4、「ポート際のギャップ」が 2 → 8 に増える。いずれも 1 つのカード辺から 8 本が扇状に出る 1 箇所で、原因はポート扇の間隔。本 doc の範囲外だが、別 Issue として起票するか判断が要る。
