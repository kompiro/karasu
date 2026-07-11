# システム構成図の grouping — 優先順位と検証計画

- **日付**: 2026-07-09
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1822](https://github.com/kompiro/karasu/issues/1822)（旧題 "Declare semantic clusters within a system"）
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

## 未解決の問い / 決めないこと

- **相互結合した group をどう並べるか**（P1 計測 4 → 計測 5 で部分回答）— 5 group では feedback arc set の全探索（120 通り）で十分だった（逆行 2/11 本）。group 数が増えたときの近似ヒューリスティックと、宣言順を尊重するかは未決。
- **実レンダラへの実装コスト** — 計測 5 はモック実証。`layout()` に二段 topological sort・直交ルーティング・集約トランクを載せるのが P2 実装の本体（既存 `assignForcedSystemLayers` / `krs-cat-frame` との整合を含む）。
- **group 間の相互結合を info 診断にするか** — `[cyclic]` / `duplicate-owner-assignment` と同じく「事実を述べ、判断は読み手に委ねる」形で surface できる。診断コードの新設は #1820 gate の対象か要検討。
- **任意 grouping なら group グラフは DAG に近づくか**（P2 の動機の一つ）— チーム境界は依存構造と一致しないことが実測された。意味的 group ならより DAG に近い可能性があるが未検証。
- **既定は展開か折り畳みか** — 価値が折り畳みにある以上、大規模モデルでは**既定で畳んでおく**方が良い可能性がある（#1821 の layer toggle は既定展開）。
- **組織 group と任意 group の共存** — 両方のフレームを同時に描くと視覚的に破綻しうる。排他にするか、片方を hover 時のみにするか。
- **`[external]` カテゴリと group の直交性** — ノードが external かつ group 所属のとき、どちらのフレームで描くか（`categoryOf` の precedence と同種の問題）。
- **P2 の `contains` というキーワード名** — `owns` との対比で妥当か、`members` 等が良いかは P2 着手時に決める。
- **判定基準** — 「要素数が減った」は計測できたが、「構造の理解が速くなった」は未計測。karasu-nest corpus での主観評価に留めるか、指標を立てるか。
