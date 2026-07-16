# システム構成図の grouping — 優先順位と検証計画

- **日付**: 2026-07-09
- **ステータス**: 部分昇格 — **P2a は [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)、P2c（直交ルーティング + 集約トランク + 交差マーク、#1859）は [ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)、差分モード grouping（#1886）は [ADR-20260716-01](../adr/20260716-01-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)、multi-system root grouping（#1884）は [ADR-20260716-02](../adr/20260716-02-group-by-team-multi-system-root-per-system-frames.md) に昇格済み**。本 doc は P1 検証の詳細（evidence）と、**P2b（宣言構文 `boundary` — 下記「P2b 詳細設計」で設計確定）** を継続保持する。
- **関連**:
  - 引き金 Issue: [#1822](https://github.com/kompiro/karasu/issues/1822)（旧題 "Declare semantic clusters within a system"）
  - 実装済み: [#1858](https://github.com/kompiro/karasu/issues/1858) P2a（ADR-20260711-03）。フォローアップ #1872–#1876
  - 親 epic: [#1817](https://github.com/kompiro/karasu/issues/1817)（comprehension pillar — 横方向の密度制御）
  - 既存実装: [#1821](https://github.com/kompiro/karasu/issues/1821)（external / infra カテゴリの折り畳み）
  - notation promotion gate: [#1820](https://github.com/kompiro/karasu/issues/1820)
  - 関連 TPL: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)
  - 関連 ADR: [ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md)（`.krs` / `.krs.style` v1.0 凍結）
  - コード: `packages/core/src/renderer/category-collapse.ts`, `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/svg-renderer.ts`

> 本 Doc は「semantic clusters の構文をどう綴るか」から始めた初版を差し替えたもの。
> 初版の案を却下するのではなく、**「いま何を優先すべきか」** の軸で作業順序を組み替える。
> 語彙・構文の検討結果は「設計空間の記録」節に保存し、P2 / P3 で再利用する。

## 背景・課題

解きたいのは一点、**system view の要素が多すぎて読み取れない**こと。

grouping はそれ自体が目的ではなく、**まとまりごとに開閉（collapse / expand）して要素数を減らすための手段**である。#1817 が整理したとおり、drill-down は縦方向（浅い ↔ 深い）の壁しか解かず、残る壁は**ある階層における横方向の密度**にある。

## この Doc の主眼 — 優先順位

初版は「grouping の構文をどう綴るか」から始めたが、順序が逆だった。**「入れ物を作ると本当に読みやすくなるのか」がまだ検証されていない**以上、構文・語彙の確定は後回しにする。

| 優先度 | 何を | なぜ先か | 文法変更 |
| --- | --- | --- | --- |
| **P1** | **grouping が可読性を上げるかの検証**（乗り物 = 組織境界） | 中心仮説が未検証。ここが偽なら以降すべて不要 | **なし** |
| **P2** | **任意 grouping の宣言機構** | 組織境界だけでは要素数問題が残る（後述） | あり（P1 検証後に支払う） |
| **P3** | 語彙・first-class 化の判断 | corpus evidence を見てから（#1820 gate） | — |

## 現状（インベントリ）

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| 折り畳み機構 | `collapseNodeList` がカテゴリを ⊕ + 件数のスタブに畳む | `category-collapse.ts:81` → `layout.ts:767` |
| カテゴリの判定 | `categoryOf()` は **単一値**（`CategoryId \| null`）を返し、`infra` を先に判定する precedence 付き | `category-collapse.ts:34-38` |
| `infra` の由来 | **kind 由来**（`INFRA_KIND_SET`）。タグではない | `category-collapse.ts:35` |
| `external` の由来 | **唯一のタグ由来カテゴリ** | `category-collapse.ts:36` |
| 境界フレーム描画 | `krs-cat-frame`（破線・hover で reveal）／`renderContainer()`（タイトル付き箱） | `svg-renderer.ts:472-590` / `:593-639` |
| タグの renderer 到達 | `LayoutNode.tags?: string[]` として既に届く | `layout-types.ts:23-25` |
| `ownerIndex` の renderer 到達 | `layout()` に既に渡っている（`collapseNodeList` と同じ関数） | `layout.ts:315 / 732 / 759` |

### 組み込みタグが折り畳み軸にならない理由

`appliesTo`（`builtins/reference-data.ts`）を見ると、**`service` に付けられる組み込みタグは `[external]` ただ一つ**。他は `database` / `user` / `client` / `resource` / `edge` に限定される。

つまり #1821 が実装した `external` + `infra` は、**組み込み語彙で system view 上に表現できる折り畳み軸の全部**だった。密集している service（`Billing` / `Wallet` / `Inventory` …）は構造上どの組み込みタグも持たないため、「タグ毎に畳む」へ一般化しても**密度問題には効かない**。

## 制約・前提

### 開閉の識別子は「単一値」でなければならない

境界フレームで囲んで畳む以上、ノードは**ちょうど 1 つのまとまりに属する**必要がある（多重所属はフレームの重なりを生み、[TPL-20260624-02] の「全要素ちょうど一度配置」不変条件を壊す）。`categoryOf()` が単一値 + precedence なのはこのためである。

**タグは多値**（1 ノードに複数付けられる）。したがって:

- bare tag（`[payments]`）も keyed tag（`[cluster: payments]`）も、**単一値の所属を多値コンテナに入れる**ことになり、構造的に不適。
- `[...]` は group 所属の置き場所ではない。

### karasu が持つ単一値の所属機構

1. **containment**（親はちょうど 1 つ）— ただし入れ子を強制するため、複数ファイル分散と衝突する。#1822 が明示するとおり **file は grouping の単位ではない**。
2. **参照による関連 + 1:1 インデックス** — `realizes`（物理 → 論理）、**`owns`（組織 → 論理）**。containment を強制せず、ファイルをまたげる。

`owns` は必要な性質を既に備えている:

- `ownerIndex: Map<string, string>` は **1:1**（`index.ts:445`）
- 多重所有は許容し、**precedence で primary owner を選ぶ**（`@migration_target` 勝ち → 無印 → `@deprecated` 負け、同点は先勝ち）
- 重複は error ではなく **`duplicate-owner-assignment` の info 診断**として観測にとどめる（`ast.ts:507`, `parser.ts:1828`）

**多値を許容しつつ precedence で単一値に落とし、重複は info で観測する** — 開閉フレームが要求する性質を、karasu は組織の面で既に一度解いている。

### その他

- **`.krs` / `.krs.style` は v1.0 凍結**（[ADR-20260616-06]）。文法変更は #1820 の promotion gate を通す。
- **out of scope**: deploy / org view への grouping 適用、group の入れ子、group 単位の drill-down、cross-system group。

## P1: grouping は可読性を上げるか（検証）

### 乗り物 — 組織境界（`owns` / `ownerIndex`）

system view を**所有チーム単位**で囲み、開閉する。

- **`.krs` の文法変更ゼロ** — `organization` / `team` / `owns` は既存構文。`ownerIndex` は既に `layout()` に届いている。
- **単一値** — `ownerIndex` が 1:1 なので、フレームの不変条件を最初から満たす。
- **意味がある** — Conway の法則により、チーム境界はしばしば実際に意味的なまとまりである。合成タグではなく実データで仮説を検証できる。

> **三面分離について（当初の懸念は誤りだった）**: 「論理ビューに組織境界を描くのは面をまたぐ」と当初考えたが、**karasu は既に system view の全 service カードに所有チーム名を描画している** — `ownerIndex` → `LayoutNodeProperties.team`（`layout.ts:871, 1117`）→ meta row（`svg-renderer.ts:916-931`）。組織情報は既に論理ビューに出荷済みであり、境界フレームは**新たな越境ではなく既存情報の強い視覚化**にすぎない。

### 被験体

現状 `examples/` の最大は `examples/en/hato/index.krs` の 15 ノードで、密度問題の実証には小さい。第一次検証では **20 service / 5 team / 4 infra / 2 external = 26 top-level ノード**の密なモデルを合成して用いた。以降の検証は #1816 / #1820 が定める **karasu-nest corpus（実 OSS アーキテクチャ）** に移す（gate の evidence 要件と一致）。

## P1 検証結果（第一次）

### 計測 1 — 現在のレイアウトでは枠が描けない

現行 `layout()` は y を**依存の深さ**で決める（`systemTier()` の 5 段 + longest-path layering）。そのため同一チームのノードが縦横に散る。合成モデルを現行レンダラで描き、チームごとの bounding box を測ると:

| 指標 | 値 |
| --- | --- |
| canvas | 1784 × 1534 |
| `platform` チームの枠が覆う面積 | canvas の **33%** |
| 重なるチーム枠のペア | **8 / 10** |
| 最悪の重なり | `fulfillment` × `platform` = **96%** |

**結論**: 境界フレームは「描画だけの変更」では実現できない。**レイアウトがグループのメンバーを寄せる**必要がある。#1822 が「render with boundary frames」と書いたとき、暗黙にレイアウト変更を要求していた。

### 計測 2 — 価値は「枠」ではなく「折り畳み」にある

同じモデルをチーム単位でグループ配置したモックと比較した:

| | baseline（依存レイヤ） | grouped 展開 | grouped + 3 チーム折り畳み |
| --- | --- | --- | --- |
| canvas 面積 | 2,737k px² | 1,335k px²（**51%**） | 853k px²（**31%**） |
| service 段の要素数 | 20 | 20 | **8 + スタブ 3 = 11** |
| 描画される edge | 34 | 34 | **26** |
| チーム枠の重なり | 8/10 ペア | 0 | 0 |

- **grouped 展開のみ**（枠を描くだけ）の利得は限定的。ノード配置は整うが、cross-team edge が上部で絡み、依存の向きが失われる。
- **折り畳むと利得が大きい**。要素が 20 → 11、canvas は 1/3、残った線が読める。

**したがって仮説「入れ物を作ると読みやすくなる」は、正確には偽である。** 読みやすくするのは**折り畳み**であり、**枠はその折り畳みを可能にする（発見可能にする）アフォーダンス**にすぎない。枠だけを実装しても目的（要素過多の解消）は達成されない。

### 計測 3 — 「依存レイヤ」の厳密な定義

「グループ配置は依存レイヤを壊す」は不正確だった。`assignForcedSystemLayers()`（`layout.ts:1606`）が y をどう決めるかを厳密に書くと:

```
y = tierBase[systemTier(node)] + subRow(node)
```

- **`systemTier`** — kind による 5 段のバケツ（`user`=0 / `client`=1 / service=2 / infra=3 / external=4）。**依存ではなくカテゴリ**。
- **`subRow`** — その tier 内の **intra-tier edge のみ**（`edges.filter(e => idSet.has(e.from) && idSet.has(e.to))`）による topological な longest-path 層化。**cross-tier edge は sub-row に一切影響しない。**
- 加えて infra tier には pull-up の後処理（#974）。

したがって:

1. **grouping が触るのは tier 2（service）だけ**である。`user` / `client` / `infra` / `external` の 4 tier は純粋な kind バケツなので、グループ配置の影響を受けない（モックでも infra / external の帯はそのまま維持された）。
2. 失われうるのは**ただ一つ** — **service → service edge が service tier 内に誘導する topological sub-order**。
3. しかもこれは「グループを topological に並べ、グループ内も topological に並べる」**二段 topological sort** で保存できるはずである。group が 0 個ないし 1 個なら現行挙動に退化するので、**現行規則の厳密な一般化**になる。

### 計測 4 — ただし集約は循環を生む

二段 topological sort は「group 単位のグラフが DAG である」ことを前提にする。合成モデルで実測した:

| | 結果 |
| --- | --- |
| service 単位のグラフ（service → service edge のみ） | 20 ノード / 24 edge / **非循環（DAG）** |
| チーム単位に集約したグラフ | 5 group / 9 inter-group edge / **循環あり** |
| 強連結成分 | **{ catalog, fulfillment, platform, payments }**（5 group 中 4 つが相互結合） |

`payments → platform → fulfillment → payments` のような循環が、**非循環のサービスグラフを集約しただけで生まれる**。

**したがって代償は次のように狭く、かつ正確に述べられる:**

- **グループ内**の topological sub-order は保存できる（intra-group edge による）。
- **グループ間**の topological order は、グループが相互結合しているときは**定義できない**。実測ではそれが常態だった（4/5 が 1 つの SCC）。SCC 内の順序はヒューリスティックにならざるをえない。

一方で、この循環は**それ自体が観察に値する事実**である。karasu は既に node 単位の循環を `[cyclic]` として観測し（判断はしない）、`buildGraph` は循環時に reversal を捨てる guard を持つ（`layout.ts:90-96`）。group 単位の相互結合も同様に **info 診断**として surface できる — 「これらの group は相互に結合している」。Conway 的には「チーム境界が依存構造と一致していない」という所見であり、**任意 grouping（P2）ならより DAG に近い group グラフを作れる可能性がある**ことも示唆する。

### 計測 5 — レイアウト試作: 二段 topological sort + 直交ルーティング + 集約

計測 2 のモック（中心線どうしを直線で結ぶ）は「エッジの重なりが多く読みづらい」というレビューを受け、計測 3 の緩和案をモックに実装した。構成:

1. **グループ順序** — feedback arc set の全探索（5 group = 120 通り、重み = 集約前の service edge 本数）。結果は fulfillment → payments → platform → catalog → identity で、逆行は **2/11 本**（platform→fulfillment, catalog→payments）。SCC があっても全順序はこのヒューリスティックで決められる。
2. **二段 topological sort** — group を層 = 帯として縦に並べ、group 内も intra-group edge で層化（計測 3 の緩和案そのもの）。
3. **直交ルーティング** — エッジは帯間チャネルと左右ガターのみを通す。フレーム内は列間ギャップ（構成上必ず空く縦回廊）経由。**ノード・フレーム貫通が構成的に起きない**。逆流エッジは破線で明示描画する。
4. **集約（bundling）** — 同一 infra/external target への edge は 1 トランクに合流（`docs/concepts.ja.md` の「集約」の grouping 版）。infra/external への 14 本が 6 トランクに落ちた。
5. **交差点の表現** — 回路図の慣習を導入。横線が縦線を**跨ぐアーク（◠ hop）**で「交差 = 非接続」を、集約トランクへの**合流点（● junction）**で「合流 = 接続」を明示する。直交ルーティングで交差がすべて直角になったから成立する手で、線の交わりの「接続か通過か」という曖昧さ自体を消す（近接する複数交差は 1 つの幅広 hop にクラスタ化）。

結果（モック計測値）:

| | v1 mock（直線） | v2 展開 | v2 全折り畳み |
| --- | --- | --- | --- |
| エッジ交差 | 76 | 61 | **21** |
| **ノード貫通** | **38** | **0** | **0** |
| 交差の表現 | なし（曖昧） | hop 41 + junction 8 | hop 20 + junction 4 |
| 描画 edge | 34 | 34 | 17 |

所見:

- **v1 の読みづらさの主因は交差ではなくノード貫通（38 本）だった。** 交差数だけを可読性指標にすると欠陥を見逃す — レイアウト変更の検証では**交差数と貫通数を両方**測ること（P2 実装時のテスト観点候補）。
- 交差削減の最大要因はルーティング規律そのものより**集約**。
- **交差は「減らす」だけでなく「表現で無害化」できる。** 幾何的な交差数（61）は残るが、hop / junction により全交差が「非接続」と明示され、可読性上の害（接続との誤読）は消える。交差の総数最小化を追うより、直角交差 + 明示表現に落とす方が実装コストに対する効果が大きい。
- 全折り畳み時はそのまま **group 依存 DAG のビュー**になる（26 ノード → 11 要素、交差 21）。「既定で畳んでおき、必要な所だけ開く」運用の有力な根拠。
- 逆流の破線 2 本が視覚的に浮かび上がる — 計測 4 の「group 間相互結合は所見」を裏付ける（描画自体が Conway 所見になる）。

### cross-group edge

折り畳み時、畳まれたノードを端点に持つ edge は**スタブに再ターゲットされて生き残る**必要がある（[TPL-20260624-02]）。モックでもこれを再現し、cross-team edge を強調色で描くと**チーム間の結合が可視化される**という副次効果が得られた（Conway 的な観察に使える）。

### 正しさの柵

[TPL-20260624-02] の不変条件に従う:

- 全ノードが**ちょうど一度**配置される（drop / duplicate なし）
- 畳んだノードを端点に持つ edge が**両端点を解決して描画される**
- 退化ケース（team が 1 サービス / 全サービスが同一 team / team 未使用）で破綻しない

## P2: 任意 grouping の宣言機構（P1 検証後）

**組織境界だけでは要素数問題は残り続ける。** 1 チームが多数のサービスを持つ場合、チーム内の密度は下がらない。また「決済まわり」のように**組織と一致しない**意味的まとまりを表現したい要求も残る。したがって、著者が任意に group を宣言する機構は別途必要になる。

その形は上記の構造的制約から導かれる — **containment ではなく参照、単一値、多重所属は precedence + info 診断**。すなわち `organization` / `owns` を雛形にする:

```krs
group payments {
  label "Payments"
  contains Billing, Wallet
}
```

- ファイルをまたげる（`owns` と同じ）。**file は単位ではない**（#1822）を満たす。
- `groupIndex: Map<string, string>` を 1:1 で持ち、多重所属は precedence で primary を選び、重複は info 診断で観測する。

> **スコープの訂正（P1 計測 1 より）**: 当初 P2 を「`groupIndex` を足して `krs-cat-frame` を再利用するだけ」と見積もったが、これは誤り。**グループ配置のレイアウトが本体**であり、`collapseNodeList` の再利用や枠の描画はその上に乗る薄い層にすぎない。P2 の主コストは `layout()` — 依存レイヤリングとグループ局所性の調停（計測 3）にある。

これは文法変更だが、**karasu ネイティブな形**であり、かつ **P1 の検証が済んでから支払うコスト**である。

## P3: 語彙・first-class 化（#1820 gate）

P1 が検証され P2 の機構が使われたのち、corpus の使用実感をもとに #1820 の promotion gate で判断する。

`group` は現時点で最も無難な語である（後述の語彙分析）。将来これを本当に一級の階層段（`system > ? > service`）へ昇格させるなら、その時点で `subsystem` が正しい語になる。段を作らない限り `group` が事実に忠実。

## 設計空間の記録（deferred — 却下ではない）

P2 / P3 に着手するときに再利用するため、これまでの検討結果を保存する。

### 語彙

| 語 | 評価 |
| --- | --- |
| `cluster` | **不可**。`docs/concepts.md` / `docs/spec/syntax.md` が "regions, AZs, **clusters**, nodes" を **out of scope な物理トポロジ**として名指ししており、論理グルーピングに使うと自分の spec と衝突する。コードでも `clusterByXGap()`（近接クラスタリング）と二重化。統計的には cluster は *discover* するもので "Declare" と矛盾 |
| `namespace` | **不可**。中核の意味は**識別子のスコープ**（`payments.Billing` のように id を修飾する）。今回 id は変えないので過剰約束。K8s namespace は運用テナント境界＝物理側 |
| `partition` | **不可**。数学的には**互いに素かつ全体を覆う**分割。どの group にも属さないサービスが普通にありえるので全域性が成り立たない。DB では sharding ＝物理 |
| `subsystem` | 階層段を足すことを含意する。段を作るなら正しい語 |
| **`group`** | **推奨**。物理・創発いずれの baggage もなく、既存語と衝突しない。「名前の付いたまとまり」以上を約束しない |

### 綴り方

| 案 | 評価 |
| --- | --- |
| bare tag `[payments]` | **構造的に不適** — タグは多値。今日パースはできる（未知タグに警告なし）が、開閉の単一値識別子にならない |
| keyed tag `[cluster: payments]` | **構造的に不適** — 同上。`[...]` 自体が多値コンテナ。加えて `parseTags()`（`parser.ts:1359-1376`）は `:` を扱わず、`[cluster: payments]` は `["cluster", ":", "payments"]` の 3 タグに誤解釈される |
| sigil `$payments` | `$` は lexer で未使用（`default` で skip）なので字句的には空き。ただし**恒久記号の新設**は最も重い notation commitment。`$` は多くの言語で「変数」を意味し語感がずれる |
| UML 風 `<<payments>>` | `<` `>` も lexer 未使用で空き。ただし **karasu の `[tag]` が既に UML stereotype の座**（style の specificity が Kind=1 / Tag=10 / ID=100 と CSS に一致し、`[tag]` は CSS の `.class` に対応）。分類用の括弧が二重化する。`<` `>` は将来の双方向 edge（`<->`）に使いたい文字でもある |
| `#payments` | **不可**。`#` は karasu では **identity**（`readHashToken`、ID selector `#ECommerce`、edge id `#criticalWrite`）。CSS の `#id` に対応し、グループとは逆の意味 |
| **参照宣言 `group X { contains … }`** | **P2 の推奨**。単一値・ファイル横断・`owns` の既存イディオムに乗る |

## 確定した方針 → ADR-20260711-03（P2a）

P1 の計測を踏まえた 2026-07-11 レビューで確定した **P2a の 6 決定**（メンバー範囲=全ノード種／全体フロー保存／共存=排他セレクタ／既定=展開／min-FAS 順序／折り畳みエッジ再ターゲット）と、その理由・却下案は **[ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)** に昇格した。P2a は実装完了（#1860/#1861/#1865/#1869）。

以降、本 doc は **P2b（宣言構文）** の検討を継続する（差分モード grouping #1886 → [ADR-20260716-01](../adr/20260716-01-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)、multi-system root grouping #1884 → [ADR-20260716-02](../adr/20260716-02-group-by-team-multi-system-root-per-system-frames.md) に昇格済み）。実装フェーズの整理:

| フェーズ | 内容 | 文法変更 | 状態 |
| --- | --- | --- | --- |
| **P2a** | 二段 topo + 枠 + 折り畳み（team=`ownerIndex` 軸） | ゼロ | ✅ 実装済み（ADR-20260711-03） |
| **P2b** | `boundary` 宣言構文 + `boundaryIndex` | あり（experimental で追加。#1820 gate は promotion 側） | ✅ 実装済み（#1974: A 文法 #1966 / B 軸配線 #1973 / C spec・examples・roadmap）— 下記「P2b 詳細設計」 |
| **P2c** | 直交ルーティング + 集約トランク + hop/junction 交差マーク（#1859） | ゼロ | ✅ 実装済み（**[ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)**。#1927/#1954 mixed route・#1939/#1956 marks 拡張含む） |

## P2b 詳細設計（宣言構文 + `boundaryIndex`）

P2a は grouping 軸を **team（`ownerIndex`）** に固定した。P2b は「著者が任意に宣言する意味的まとまり」を第二の軸として足す。**設計の要点は「新レイアウトを作らない」こと** — P2a/P2c が実装した grouping 機構（`collapseGroups` / `assignGroupedLayers` / 境界フレーム / P2c ルーティング）は grouping 軸を **`Map<string,string>`（node id → group id）** としか見ていない（`groupIdOf` at `layout.ts:1038`）。P2b は **`ownerIndex` と同型の第二の map（`boundaryIndex`）を供給し、Group by セレクタで切り替える**だけに絞る。新規なのは (a) 文法、(b) `boundaryIndex` の構築、(c) 軸値の配線、(d) app のセレクタ選択肢、(e) 診断、(f) spec、(g) TPL contract。**レイアウト・描画・折り畳み・ルーティングのコードは一切増やさない。**

### 動機（P2a だけでは足りない理由）

ADR-20260711-03（P2a）は「入れ物を作って畳むと読める」を team 軸で実証した。しかし team 軸には二つの穴が残る（本 doc「P2」節）:

1. **1 チームが多数の service を持つと、チーム内の密度は下がらない。** team 枠の中がまた過密になる。
2. **組織と一致しない意味的まとまり**（「決済まわり」「認証まわり」）を表現できない。`owns` は組織の面であって、bounded-context の面ではない。

P2b は「著者が引く任意の境界」を第二軸として与え、この二穴を埋める。team 軸（Conway）と boundary 軸（意味的クラスタ）は**独立**で、同じ図を別々の切り口で畳める。

### 決定 1 — 構文（語彙 = `boundary`、メンバー動詞 = `contains`）

```krs
boundary payments {
  label "Payments"
  contains Billing
  contains Wallet
}
```

- **top-level 宣言**。`organization` と同じく system/domain の外に置ける。ファイル横断（`owns` と同じく id 参照であって containment ではない）。
- **`contains <id>` を 1 行 1 メンバー**で並べる（`owns <id>` の綴りに厳密に揃える。parser 実装も `parseTeamBlock` の owns ループ `parser.ts:1796-1805` をそのまま流用できる）。カンマ列挙（`contains A, B`）は `owns` と idiom がずれ parser 分岐も増えるため採らない（2026-07-14 決定）。
- `label` / `description` / `link` は `organization` と同じく受け付ける（`BaseNodeFields` 相当）。

**語彙が `boundary` である理由（本 doc P3 の vocab 分析は当初 `group` を推していた — その lean を覆す）:**

| 論点 | `boundary` | `group` |
| --- | --- | --- |
| セレクタの自己言及 | 「**Group by: boundary**」= 「宣言した boundary で束ねる」と読め、team 軸と対等に並ぶ | 「Group by: **group**」は自己言及で不明瞭（機構そのものが group） |
| 既存語との整合 | design doc 全体と `docs/guide/` の**「境界フレーム / boundary frame」**語彙に一致。読者が見る対象（描かれる枠）を名指す | 中立だが機構名と重複 |
| 構文 vs 機構の分離 | **構文 = `boundary`（著者が引く線）／機構 = group（team でも boundary でも生む枠）** と綺麗に分離。`ownerIndex`↔`boundaryIndex` の命名も源構文に揃う（owns→owner, boundary→boundary） | 構文と機構が同語で混線 |
| DDD の含意 | 「bounded context」を薄く連想させるが、`contains` で「ただのまとまり」に留める（過剰約束は避ける） | baggage なし |

`group` の唯一の優位（baggage の無さ）より、**セレクタの自己言及回避**と**boundary-frame 語彙との一致**が勝ると判断する。加えて内部機構は既に `group`（`groupBy` / `collapseGroups` / `assignGroupedLayers` / `__group_<team>__`）で統一されており、**「構文＝boundary / 機構＝group」の二層命名**はコードの現状とも噛み合う。

**メンバー動詞が `contains` である理由:** `member` は**既に予約語**（org の team メンバーブロック `lexer.ts:36` / `parser.ts:1806-1807`）で衝突する。`contains` / `includes` は共に空き。`contains` は「boundary payments contains Billing」と自然に読め、本 doc の P2 例でも既に使っていた。karasu の参照動詞（owns / realizes / delivers / handles = 三単現）とも語形が揃う。

### 決定 2 — `boundaryIndex` は `ownerIndex` の構造的ミラー

parse 時に `boundaryIndex: Map<string, string>`（node id → boundary id）を構築する。`buildOwnerIndex`（`parser.ts:1900-1949`）と同型:

- **1:1**（node はちょうど 1 boundary に属する）。開閉フレームの単一値要件（本 doc「開閉の識別子は単一値」）を最初から満たす。
- **多重所属は許容し、precedence で primary を選ぶ。** ただし boundary には `@migration_target` / `@deprecated` のような組織アノテーションが意味を持たないため、precedence は **宣言順の first-wins**（最初に `contains` した boundary が勝つ）に単純化する。`ownerIndex` の `migrationPriority`（`parser.ts:83-91`）は流用せず、tie-break だけを踏襲する。
- **重複は error ではなく info 診断** `duplicate-boundary-assignment`（`duplicate-owner-assignment` `parser.ts:1932-1937` のミラー。severity `info`、params `{ nodeId, existingBoundary }`）。「事実を述べ、判断は読み手に委ねる」register（[TPL-20260514-08]）に従う。診断コードは `DiagnosticParamsByCode`（`ast.ts:532` 近傍）に追加。

> **spec の既存記述との齟齬に注意（実装が正）**: `docs/spec/syntax.md:887` は `owns` の重複を「produces an **error**」と書くが、実装（`parser.test.ts:1258-1328`）は **first-wins + `@migration_target` 優先の precedence 解決**で error ではない。P2b の `contains` も同じく precedence 解決（error にしない）とし、spec を実装に合わせて記述する（`owns` 側の stale 記述も同 PR で正すか別 Issue 化するかは実装時判断）。

### 決定 3 — 軸の配線（team 軸への完全パリティ）

Group by セレクタを **排他**（none / team / **boundary**）に拡張する（ADR-20260711-03 決定 3「共存＝排他」を踏襲）。既存 team 軸の機構をそのまま再利用し、`groupIdOf`（`layout.ts:1038`）が `groupBy` に応じて `ownerIndex` か `boundaryIndex` を選ぶ。配線が必要な全箇所（[TPL-20260510-11] parallel-function-parity — 一つでも漏らすと軸が**黙って落ちる**）:

- **core**: `groupBy?: "team"` → `"team" | "boundary"`（`index.ts:409` / `layout.ts:930` / `svg-renderer.ts:141,189` / `all-layers-svg.ts` / `drill-down-svg.ts` / `layoutMultipleSystems` `layout.ts:1578`）。`layout.ts:1010-1077` の `groupBy === "team"` gate を軸に応じた index 選択へ一般化。
- **app**: `GroupByMode`（`preview-context.tsx:17`）に `"boundary"` を追加。**off-sentinel gate（`useSystemView.ts:241-242`）を必ず広げる** — コメントが「新軸はここと core union の両方を広げないと silently drop」と警告している当該箇所。ドロップダウン（`PreviewColumn.tsx:295-320`）に選択肢追加。
- **CLI**: 現状 `groupBy` の call site なし（app 専用）。P2b でも CLI 露出は追加しない（scope 外）。

**team 軸と boundary 軸の関係**: 独立。ある node が team A に `owns` され boundary B に `contains` されることは普通にあり、「Group by: team」では A 枠、「Group by: boundary」では B 枠に入る（排他セレクタなので枠は同時に重ならない）。これは org と意味的クラスタが一致しないという P2b の動機そのもので、意図した挙動。

### 決定 4 — notation gate: experimental で着地（stable 昇格は corpus 待ち）

`boundary` は**新規 experimental notation** として追加する（[ADR-20260713-01] notation promotion gate）。gate の既定は「experimental 据え置き・open/既存構文での表現に寛容・証拠源＝karasu-nest corpus」。P2b は既存構文で表現しきれない（タグは多値で単一値の開閉識別子にならない — 本 doc「タグが折り畳み軸にならない理由」で既に検証済み）ため新構文を導入するが、**stable 昇格は corpus evidence を見てから** #1820 gate で判断する。

- **後方互換は明示的に約束しない**（experimental tier の定義）。`docs/roadmap.md` の experimental 節に watch item として登録し、promotion trigger（corpus 上で boundary がどう使われるか）を書く。
- gate を「絵に描いた餅」にしないため、`docs/process.md` のリリース運用 touchpoint（experimental notation に触れる changeset）に乗る。
- **現時点で corpus（karasu-nest, #1783）は未実在**。よって P2b は「価値検証のための experimental 構文を出す」ことが目的で、stable 化は当面しない。この順序（P2a で team 軸の価値実証 → P2b で宣言構文を experimental 提供 → corpus で使用実感 → gate で stable 判断）は本 doc P1→P2→P3 の順序規律と一致する。

### 決定 5 — スコープ（P2a/P2c 機構の再利用に徹する）

**新規に書くもの**: 文法（lexer keyword `lexer.ts:3-50` / token `tokens.ts:42-66` / parser dispatch `parser.ts:213-283` + `parseBoundaryBlock` / AST `BoundaryBlock` + `KrsFile.boundaryIndex` `ast.ts:453-471`）、`buildBoundaryIndex`、軸値配線（決定 3）、app セレクタ、診断、spec（`syntax.md` に boundary 節）、TPL contract。

**再利用（変更しない）**: `collapseGroups` / `assignGroupedLayers` / `group-layout.ts` / 境界フレーム描画 / P2c ルーティング（`routeGroupedEdges` / `aggregateGroupTrunks` / `computeCrossingMarks`）。これらは軸が `Map<string,string>` でありさえすれば boundary 軸でもそのまま動く。

**out of scope**（本 doc scope 節と一致）: boundary の入れ子、boundary 単位の drill-down、cross-system boundary、deploy / org view への boundary 適用。将来必要になれば別 Issue。

### 正しさの柵

- **[TPL-20260510-12]（AST↔parser↔renderer 三点同意）**: `boundary` を AST 型・parser keyword・renderer（軸として消費）の 3 層で揃える。1 層でも欠けると parse できて描かれない/描けてキー無し等の silent 不整合。
- **[TPL-20260610-01]（受理語彙は効果を持つ）**: parse は通るが枠を生まない「inert な boundary」を防ぐ。`boundary` 宣言 → `boundaryIndex` に載る → Group by: boundary で枠が出る、を end-to-end で assert。
- **[TPL-20260510-11]（parallel-function-parity）**: 決定 3 の全 call site に軸値を通す。特に `useSystemView.ts:241-242` の off-sentinel gate と core union の同時拡張。
- **[TPL-20260615-01]（precedence index winner）**: 多重所属の first-wins + 重複 info 診断（`ownerIndex` の winner ルールのミラー）。
- **[TPL-20260514-08]（診断の fact-vs-style register）**: `duplicate-boundary-assignment` は info（構造的事実）で、警告や error にしない。
- **[TPL-20260624-02]（再配置で全要素ちょうど一度・端点保持）**: boundary 軸でも折り畳み時に removed/stub の全域性と cross-boundary エッジ端点保持を維持（team 軸と同じ機構なので継承）。
- **[TPL-20260623-01]（user-facing surface の docs 同期）/ [TPL-20260623-02]（valid-target set が全 kind を列挙）**: `contains` の妥当ターゲット集合を parser・resolver で同期し、spec / examples に反映。
- **[TPL-20260610-02] / [TPL-20260616-02]（spec 約束の診断を実装・カタログ化）**: `duplicate-boundary-assignment` を `docs/spec/diagnostics.md` に登録。
- **[TPL-20260511-01]（keyword の字句的曖昧性）**: `boundary` / `contains` を lexer に足すときの既存 id との衝突確認。
- **退化ケース**: boundary 0 個（現行挙動に退化）/ 全 node が 1 boundary / boundary 宣言だが contains 空 / 参照先 id が存在しない。

> **proactive TPL について**: 本 P2b の新規失敗クラス（「新 group-by 軸を全 call site に通さないと黙って落ちる」「受理された boundary が枠を生まない」）は既存 [TPL-20260510-11] / [TPL-20260610-01] が既に覆う。#1939 の判断（「既存原則の適用範囲を広げるだけなら新規 proactive TPL 不要」）と同じく、**新規 proactive TPL は起こさず既存 TPL を spec 節に back-ref する**方針。ただし `docs/spec/syntax.md` に boundary 節を追加する実装 PR では、CLAUDE.md「spec 新規セクション追加 PR は proactive TPL 最低 1 件」に従い、TPL-20260610-01 を当該節に `> Related TPLs:` で back-ref して要件を満たす（新規起票の要否は実装時に最終判断）。

### Related TPLs

- [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) — 新 node 形の AST/parser/renderer 三点同意
- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理された語彙は効果を持つ（inert boundary の防止）
- [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) — 並列関数ファミリの parameter parity（軸を全 call site へ）
- [TPL-20260615-01](../test-perspectives/TPL-20260615-01-migration-priority-index-winner.md) — 1:1 index の precedence winner（`boundaryIndex` のミラー元）
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — 事実系診断は info register
- [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) — 再配置で全要素ちょうど一度・端点保持
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) — valid-target set が全 kind を列挙（`contains` の対象）

### 実装スライス分割（2026-07-14 決定）

P2a に倣い、各 PR 単独でも図が悪化しない独立スライスで積む:

| スライス | 内容 | changeset |
| --- | --- | --- |
| **P2b-A** | core 文法（lexer / token / parser dispatch + `parseBoundaryBlock` / AST `BoundaryBlock`）+ `buildBoundaryIndex` + `duplicate-boundary-assignment` 診断 | `@karasu-tools/core` minor |
| **P2b-B** | 軸配線 — core `groupBy: "team" \| "boundary"` + `groupIdOf` の index 選択、app `GroupByMode` / off-sentinel gate / ドロップダウン | `@karasu-tools/core` + `karasu` minor |
| **P2b-C** | `docs/spec/syntax.md` に boundary 節 + `docs/spec/diagnostics.md` 登録 + `examples/` + AT + roadmap experimental 登録 + TPL back-ref | docs のみ |

各スライスに AT を付す。**boundary の spec 節を足す P2b-C は CLAUDE.md「spec 新規セクション追加 PR は proactive TPL 最低 1 件」に従い、TPL-20260610-01 を back-ref**（新規起票の要否は実装時最終判断）。

## 未解決の問い / 決めないこと

- **P2 のメンバー列挙キーワード** — `contains` / `includes` / `member` を候補として記録（参照系は動詞が karasu のイディオム: owns / realizes / delivers / handles）。**P2b 設計時に決める**。
- **group 間の相互結合を info 診断にするか** — `[cyclic]` / `duplicate-owner-assignment` と同じく「事実を述べ、判断は読み手に委ねる」形で surface できる。診断コードの新設は #1820 gate の対象か要検討。
- **任意 grouping なら group グラフは DAG に近づくか**（P2 の動機の一つ）— チーム境界は依存構造と一致しないことが実測された。意味的 group ならより DAG に近い可能性があるが未検証。
- **Group by 状態・折り畳み状態の共有**（URL / Share payload への符号化）— #1838 の follow-up（`/render` query param・Share button state）と同じ枠で扱う。
