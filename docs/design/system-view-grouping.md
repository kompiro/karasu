# システム構成図の grouping — 優先順位と検証計画

- **日付**: 2026-07-09
- **ステータス**: 部分昇格 — **P2a の決定は [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md) に昇格済み**。本 doc は P1 検証の詳細（evidence）と、まだ検討中の **P2b（宣言構文 `group`/`boundary`）/ P2c** を継続保持する。
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

以降、本 doc は **P2b（宣言構文）/ P2c** の検討を継続する。実装フェーズの整理:

| フェーズ | 内容 | 文法変更 | 状態 |
| --- | --- | --- | --- |
| **P2a** | 二段 topo + 枠 + 折り畳み（team=`ownerIndex` 軸） | ゼロ | ✅ 実装済み（ADR-20260711-03） |
| **P2b** | `group`（または `boundary`）宣言構文 + `groupIndex` | あり（#1820 gate 経由） | 検討中 |
| **P2c** | 直交ルーティング + 集約 + hop/junction（#1859） | ゼロ | 実装中（下記「P2c 実装設計」）— A: 直交ルーティング ✅ / B: 集約トランク ✅ / C: hop/junction |

## P2c 実装設計（#1859）

計測 5 の試作を**実レンダラーに実装する**ための設計。文法変更ゼロ（P2a と同じく view-mode 局所）。展開状態のグループビューのエッジは現在、既定 system レイアウトと同じ直線／skip-layer ルーティングを流用しており（`layout.ts` の共通パイプライン）、読みづらい。計測 5 の 3 つの手（直交ルーティング・集約トランク・hop/junction）を追加する。

**受け入れ条件**（#1859）: (1) 展開ビューでエッジがノード/フレーム内部を貫通しない（貫通数 == 0）、(2) 同一 infra/external target への複数エッジが 1 トランク + junction dot に束ねられる、(3) 全交差が hop アークで描かれる、(4) 逆流エッジが破線、(5) Group by: none は不変。

### 現状のパイプライン（インベントリ）

`layout()` は grouped/ungrouped 共通で `computeLayoutEdges` → `distributePorts` → `routeOrthogonalEdges` → `distributeChannelLanes` → `markParallelBundles` を順に実行する。要点:

- `routeOrthogonalEdges`（[ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)）は **downward の skip-layer エッジが *ノードカード* を貫通する場合のみ** L 字 `waypoints` を付与する。**フレームは障害物集合に入っていない** — これが展開ビューの枠貫通の直接原因。
- `markParallelBundles`（[ADR-20260511-01](../adr/20260511-01-parallel-edge-bundling.md)）は同一 `(from,to)` の**ラベル分離**用で、target を共有する別ソースの束ねではない。
- `renderEdge`（`edge-routing.ts`）は `points = [fromPoint, ...waypoints, toPoint]` を 2 点なら `<line>`、3 点以上なら `<polyline>` で描く。`waypoints` は既存の直交抽象で **P2c-A はこれに乗る**（後方互換）。hop/junction に相当する描画は**現状ない**。
- `assignGroupedLayers`（`group-layout.ts`）が既に `groupOrder`（帯順）と `groupBands`（各グループの row 範囲）を返し、`layout.ts` がフレーム矩形（`ContainerRect { group: true, groupId }`）を作る。**P2c はこの帯順・フレーム矩形を障害物／チャネル定義として消費する** — 新しいレイアウト情報は不要。

### 再利用 vs 新設

| 既存資産 | P2c での扱い | 理由 |
| --- | --- | --- |
| `routeOrthogonalEdges`（ADR-20260429-01） | **温存**（ungrouped 不変）。grouped では別パス `routeGroupedEdges` に置換 | 既存は「target 直前 row の単一 channel」前提で、フレーム回避・左右ガター迂回を表現できない。継ぎ足すと ungrouped の決定論 snapshot を壊すリスク。geometry helper（`segmentCrossesRect` 等）は共有ユーティリティに切り出す |
| `markParallelBundles`（ADR-20260511-01） | **温存**。P2c-B のトランクは別パス `aggregateGroupTrunks` | 既存は per-`(from,to)`（ラベル分離）、P2c-B は per-`target`（別ソースを 1 spine に合流）で関心が直交。ADR-20260511-01 案 3 と同じく edge identity は保つ（トランクは描画の合流であって統合ではない） |
| `LayoutEdge.waypoints` | **再利用** | 直交経路の既存抽象。P2c-A は set するだけ |
| domain エッジ集約（ADR-20260410-01） | **概念の借用**のみ | あちらは domain→implicit service の畳み込み、P2c-B は service→infra/external の視覚トランク。別レイヤで実装は共有しない |

**方針: grouped 専用の routing / trunk / marks パスを新設し、既存 ungrouped パイプラインは byte-identity で温存する。** 「Group by: none 不変」（AC-5）を構成的に保証する最も安全な形。3 パスは `groupBands != null` gate 内でのみ走る。

### 3 つの追加パス

1. **P2c-A `routeGroupedEdges`**（grouped で `routeOrthogonalEdges` の代わりに呼ぶ）
   - 障害物集合 = 全ノードカード ∪ **全グループフレーム矩形**。
   - エッジを「必ず空く」経路のみに通す: **帯間チャネル**（隣接帯の間の横帯）／**左右ガター**（canvas 端とフレーム外縁の間の縦列 — skip-band・逆流エッジの迂回先）／**フレーム内列回廊**（フレーム内のノード列間の縦ギャップ）。
   - 候補経路を障害物に対し全セグメント再判定し、残れば**より外側のガターへ退避**（最外ガターは構成上必ず空くので**貫通ゼロを保証**）。
   - **逆流（against-flow）エッジ = 破線**（AC-4）。`groupOrder` 上で「下の帯→上の帯」に向かうもの。実装案: `LayoutEdge.groupBackward?: boolean` を足し、`renderEdge` で **author が `stroke-style` 未指定のときのみ** dashed（ADR-20260511-01 の override 優先と同型）。
   - 挿入位置: `distributePorts` の後、`distributeChannelLanes` の前（既存スロット）。
2. **P2c-B `aggregateGroupTrunks`**（P2c-A の後）
   - 束ね鍵 = **target ノード**（infra/external）。複数帯から同一 target に入るエッジを 1 本の縦 **trunk（spine）** に合流。各ソースは spine まで横 stub、spine が target に 1 本で到達。
   - 合流点座標を出し（junction dot は P2c-C が描く）、edge identity は保つ（各 `LayoutEdge` を残し `waypoints` を spine 経由に書き換え + trunk メタを付与）。
3. **P2c-C `computeCrossingMarks` + renderer**（最終ジオメトリ確定後）
   - **hop（◠）**: 横セグメントが縦セグメントを直角で跨ぐ交点を検出し、横線側に跨ぎアークを描く（交差=非接続）。近接交点は 1 幅広 hop にクラスタ化。
   - **junction（●）**: P2c-B のトランク合流点に接続ドット（合流=接続）。
   - 描画: 交差 marks はエッジ横断的情報なので `svg-renderer.ts` に別レイヤ（`renderCrossingMarks()`）を足し、`<path>`（hop）/`<circle>`（junction）を edge レイヤ上に emit。座標のみから決定論的に導出（snapshot 安定）。

### スライス分割（P2a に倣い独立 PR）

各 PR 単独でも図が悪化しない（strictly monotonic）ように A→B→C で積む:

| スライス | 内容 | 満たす AC | 単独価値 |
| --- | --- | --- | --- |
| **P2c-A** | `routeGroupedEdges` — フレーム障害物・帯チャネル・ガター・回廊・逆流破線 | AC-1, AC-4, AC-5 | 貫通ゼロ達成（最大の可読性改善） |
| **P2c-B** | `aggregateGroupTrunks` — target 共有トランク | AC-2（トランク） | 交差の最大削減要因 |
| **P2c-C** | `computeCrossingMarks` + renderer — hop/junction | AC-3, AC-2（junction dot） | 残る交差を「非接続」と明示し無害化 |

各 PR に changeset（`@karasu-tools/core` + `karasu` minor）と AT を付す。

### 正しさの柵

[TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) の不変条件を継承しつつ、P2c 固有の**二重計測**を柵にする（proactive [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)）:

- **交差数と貫通数を両方 assert する。** 計測 5 の所見「交差数だけでは貫通 38 を見逃す」を回帰防止観点にした。P2c-A の AT は **node/frame 貫通数 == 0** を厳密 assert。
- 交差は hop/junction で無害化するので、交差数の残存を欠陥と誤認せず「全交差が mark 付き」を assert する。
- 退化ケース（team 1 つ / 全 service 同一 team / team 未使用 / infra・external なし）で貫通ゼロ。
- **AC-5**: ungrouped の既存 snapshot が byte-identical。新パスは gate 内でのみ走ることをテストで固定。

### P2c 固有の却下案

- **既存 `routeOrthogonalEdges` にフレーム対応を継ぎ足す**: ungrouped の決定論 snapshot を壊すリスク。ガター迂回を表現できず両モードのロジックが絡む。→ 専用パスに分離し geometry helper のみ共有。
- **トランクを「1 論理エッジ + 複数ラベル」に統合**（ADR-20260511-01 案 3 と同型）: edge id selector / direction style / diff renderer が edge 単位で動くので identity が壊れる。→ 描画のみ共有。
- **A\* / ELK による障害物回避**（ADR-20260429-01 案 B1/B3 と同型）: 帯構造では overkill。帯 + ガター + 回廊の stub-and-bend で貫通ゼロが構成的に取れる。
- **交差数の最小化を追う**: 交差は表現で無害化できるので、総数最小化より直角交差 + 明示表現が費用対効果で優る（計測 5 所見）。

### P2c の未解決の問い（各スライス PR で確定）

- **逆流破線と `cyclic` / author `stroke-style` の優先順位** — P2c-A 実装時。
- **hop アークの向き** — 横 over 縦で固定するか、トランク spine を主線にして横エッジを跨がせるか。第一候補は後者。P2c-C で確定。
- **hop クラスタ化の近接閾値** — 座標由来で決定論に。P2c-C で確定。
- **エクスポート面（Show All Layers / drill-down）への波及** — #1879（PR #1888）が grouping frames をエクスポートに通した follow-up。P2c ルーティング/marks をエクスポートに通すかは #1879 マージ後に別途判断（本 P2c の範囲外）。

## 差分モードの grouping — 除去ノード配置と集約エッジ diff state（#1886）

P2a を **compare/diff モード**（`compileSystemDiff`）で有効化した #1873（PR #1883）の
レビューで、grouping と diff の噛み合わせに 2 つの残課題が切り出された（#1886）。どちらも
「今日の柵（`group-by-diff.test.ts`）は成り立つ保証を pin しているが、理想の見え方は
assert していない」状態。本節でその理想を確定する。

### 背景・課題

`compileSystemDiff` は grouping 軸を **after 側だけの `ownerIndex`**
（`afterResolved.krsFile.ownerIndex`）で render に渡している（`index.ts:1266`）。
`diffed.slice` は before ∪ after の和集合なので、**before にしか存在しないノード/エッジは
after の ownerIndex で所属チームを解決できず**、以下の 2 つの誤表示を生む。

1. **除去された team 所有ノードが末尾の非 group 帯に落ちる。** before で team が所有し
   after で削除された service は `removed` 状態で描かれるが、after ownerIndex に無いため
   grouping が `null` を返し、**全 team フレームの下**の未 group 帯に置かれる。レビュアーには
   「team X がこの service を失った」ではなく、孤立した removed ボックスに見える。
2. **畳んだ group の集約エッジが per-edge diff state を失う。** team を畳むと cross-group
   エッジは `<Team> (N)` stub に**再ターゲット**される（drop しない — 正しい）。しかし
   `edgeDiffState` は**元の端点 id**でキーされ（`svg-renderer.ts:298` の
   `edgeKey = \`${from}->${to}\`` を `svg-renderer.ts:307` で lookup）、描画される stub
   エッジは stub id でキーされるので、
   再ターゲット後のエッジは `data-diff-state` 装飾**なし**で描かれる。畳むと追加/削除された
   cross-team 依存が不可視になる。さらに 1 本の stub エッジが**複数の元エッジ**（別々の
   diff state を持ちうる）を集約するため、集約後の state をどう定めるかという意味論の問いもある。

### 決定 1 — 配置: after ownerIndex を基点に、除去ノードだけ before 所属を backfill

diff 用の grouping 軸を、**after の `ownerIndex` を基点**にしつつ、**diff 状態が `removed` の
ノードにだけ before 側の所属を backfill** したものに切り替える。

- 除去ノード（before-only）は before 側の所属で解決され、**かつての team フレーム内**に
  `removed` 状態で収まる（「team X がこの service を失った」が読める）。
- 畳んだときの `(N)` カウントは除去メンバーも数える。
- 生存ノードは常に **after が正**。所属替え（team A → team B）は after の team に置かれ、
  **所属剥奪（`owns` を消したが node は残る = A → 無所属）も after どおり無所属**になる。
  既定（非 diff）ビューとの一貫性を保つ。

> **なぜ単純な before ∪ after マージにしないか**: 素朴に 2 つの map を union（after 勝ち）すると、
> 「removed した node」と「`owns` だけ消した生存 node」がどちらも「before にあり after に無い」
> 形になり区別できず、後者に**古い所属が leak** する（`ownerIndex` は grouped フレームだけでなく
> 非 grouped diff の service カードの team バッジにも使われる — `layout.ts:1000/1281/1290` — ので
> leak は既定ビューにも波及する）。`removed` diff 状態を条件に backfill することで、剥奪ケースを
> after どおり無所属に保ちつつ、除去ノードだけをフレームに戻す。

実装は `index.ts` の `compileSystemDiff`: `new Map(afterResolved.krsFile.ownerIndex)` を基点に、
`diffed.nodes` を走査して `state === "removed"` かつ未所属の node にだけ
`beforeResolved.krsFile.ownerIndex` の team を set する。render / layout / grouping 側の変更は
不要（軸は既に単一の `Map<string,string>` 契約）。

> **副次: 消えた team のフレーム。** team 自体が after で消滅（before に team X、after に無し）した
> 場合、その全メンバーは `removed` なので before 所属が backfill され、**全メンバーが removed の
> team X フレーム**が描かれる。これは「team X ごと（所有物も含め）除去された」の正しい表現であり、
> 意図した挙動として受け入れる（AT で固定）。

### 決定 2 — 集約 stub エッジの diff state: 単一なら踏襲・混在なら `changed`

畳んだ group の stub エッジ（1 本が 1 本以上の元 cross-group エッジを集約）が担う diff state を、
集約元の状態から導出して stub エッジのキーで引けるよう re-key する。

- 集約元の全エッジが**同一 state**（すべて `added` / すべて `removed` / すべて `unchanged`）なら
  その state を踏襲する。
- 集約元が**混在**（例: `added` 1 本 + `unchanged` 1 本）なら **`changed`** を付与する
  （「この依存関係は変化した」と読める）。

`changed` は新設値ではなく既存の `DiffState`（`view-diff.ts:4`）の一員で、system view では
既に**複数 domain エッジを 1 本に集約したエッジに `changed` を使う前例**がある
（`view-diff.ts:194-196`）。集約したエッジに `changed` を与えるのはこの既存語彙・既存パターンと
一貫する。

実装スケッチ:

- `collapseGroups`（`group-collapse.ts`）は既に元エッジを stub エッジへ dedup 集約している。ここに
  **diff state 集約を追い込む**: `edgeDiffState` map（元端点キー）を任意入力として受け取り、
  同一 `(from,to,kind)` に畳まれた元エッジ群の state を fold（単一→踏襲 / 混在→`changed`）して、
  **stub エッジの `${from}->${to}` キー**で引ける diff state を返す。
- `compileSystemDiff` はこの再キー済み map を（元の `edgeDiffStateMap` に**上書きマージ**して）
  render options に渡す。非畳み込みエッジは元キーのままなので既存挙動は不変。
- fold は `unchanged` も明示的に state として扱う（全 unchanged → `unchanged` で装飾なし相当、
  混在に unchanged が混じれば `changed`）。
- **kind をまたぐ集約の扱い**: `collapseGroups` の edge dedup は `(from,to,kind)` 鍵なので、
  1 つの stub ペア間に **sync/async の 2 本の stub エッジ**が並存しうる。一方 render の diff
  lookup（`svg-renderer.ts:298` の `edgeKey`）は **kind を含まない** `${from}->${to}` 形で、
  既存の `edgeDiffState` 契約（`view-diff.ts` の diffed.edges も `#kind` を除いた形でキー、
  `view-diff.ts:150-152`）もそもそも kind を区別しない。したがって diff-state の re-key も
  `${from}->${to}`（kind なし）に**揃える** — この場合、同一ペアの sync/async 2 本は 1 つの
  diff-state スロットを共有し、**両 kind の元エッジ群をまとめて 1 回 fold** する（sync だけ
  `added`・async だけ `removed` でも「混在 → `changed`」に落ちる）。kind 別に diff-state を
  持たせる（lookup も kind 付きに拡張する）のは既存契約の変更になるため本決定の範囲外とし、
  必要になれば別 Issue。実装 AT で「同一 stub ペアに sync/async 両方があるケース」を退化ケース
  として固定する。

**却下した代替（決定 2）:**

- **単一なら踏襲・混在は `unchanged`**: 追加と削除が混ざると変化が消え、#1886 point 2 が指摘する
  「畳むと変化が不可視」がそのまま残る。
- **非 unchanged 優先（`added` > `removed`）**: 変化は見えるが、追加と削除が同一 stub に同居すると
  片方に誤って寄せる。`changed` の方が「混ざっている」を正しく述べる（karasu の「事実を述べ、
  判断は読み手に委ねる」方針とも整合）。

### 正しさの柵

`group-by-diff.test.ts` の既存 pin（TPL-20260624-02 全域性: removed ノードちょうど一度・
cross-group エッジ再ターゲットで非 drop）を**維持しつつ**、本決定で理想の見え方を追加 assert する。

- **除去ノードの配置**: before で team 所有・after で削除されたノードが、末尾帯ではなく
  **かつての team フレーム内**に `removed` 状態で描かれる（`data-container-id="__group_<team>__"`
  の内側に居ることを構造で assert）。
- **消えた team フレーム**: team ごと除去されたケースで、全 removed メンバーの team フレームが
  描かれる（決定 1 の副次を固定）。
- **集約エッジの diff state**: 単一 state の cross-group エッジを畳んだ stub エッジが元 state を
  担う / 混在を畳んだ stub エッジが `changed` を担う（`data-diff-state` を stub エッジで assert）。
- **退化ケース**: マージ ownerIndex が before だけ / after だけ / 両方に所属を持つノードで
  破綻しない。

この課題は **id を書き換える集約変換が、元 id にキーされた per-要素の装飾（diff state）を
落とす**という、TPL-20260624-02（端点＝トポロジ保持）が**カバーしていない**失敗クラスなので、
proactive [TPL-20260712-01](../test-perspectives/TPL-20260712-01-rekey-transform-preserves-per-element-decoration.md)
を同 PR で起こした（装飾の再導出を柵にする）。

### スコープ外（本決定に含めないこと）

- **`changed` の視覚表現**（stroke パターン等）の新設 — 既存の diff スタイル（`diff-style.ts`）が
  `changed` に持つ表現をそのまま使う。新しい見た目は導入しない。
- deploy diff（`compileDeployDiff`）への同種修正 — deploy には team grouping 軸が無いため
  対象外。必要になれば別 Issue。

### 実装フェーズ

ADR-20260711-03（P2a）への follow-up。実装は 1 PR（core: `index.ts` マージ ownerIndex +
`group-collapse.ts` diff-state fold）＋ changeset（`@karasu-tools/core` + `karasu` patch）＋
AT（`docs/acceptance/`）＋ proactive TPL の contract 化。実装完了 PR で `Closes #1886`。

## multi-system root view の grouping（#1884）

P2a（ADR-20260711-03）は `layout()` の **single-system focus 分岐**に grouping 機構
（`collapseGroups` + `assignGroupedLayers` + 境界フレーム）を実装したが、**multi-system
root view 分岐**（`layoutMultipleSystems`）には渡していなかった。`layout()` は system が
2 つ以上あると `layoutMultipleSystems` に dispatch するが、その呼び出しに `groupBy` /
`collapsedGroups` を渡しておらず、`layoutMultipleSystems` の signature にも無かった。
結果として **system を 2 つ以上宣言した瞬間**（= cross-system ghost エッジが存在する状況と
一致する — ghost エッジは参照先の第 2 system を要求するため）root view の team 境界フレームと
per-team collapse が黙って消え、利用者からは「ghost エッジがあると group-by-team が壊れる」
ように見えていた。これは [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
（並列関数ファミリの parameter parity）の失敗クラスそのもの — dispatch する分岐にも「兄弟」が
あり、options は全分岐へ通す必要があった。

### 決定 — per-(system, team) フレーム

grouping を **各 system フレームの内側**に適用する。root view は各 system を独立に side-by-side
で配置する（`layoutMultipleSystems` は system ごとに独自の tier layout + 座標オフセット + 枠を持つ）
ので、grouping もその per-system の枠内で完結させる:

- team が 1 つの system 内だけで `owns` するなら、その system フレーム内に境界フレームが 1 つ描かれる。
- team が**複数 system をまたいで** `owns` する場合（`owns` の対象は system-scoped ではない）、
  **各 system フレーム内に 1 つずつ**フレームが描かれる（同一ラベル・disjoint な複数フレーム）。
  「Shop 内の payments チームのメンバー」と「PaymentGateway 内の payments チームのメンバー」は
  視覚的に別枠だが、同じチーム名を共有する — 正直な表現。

実装は `layoutMultipleSystems` の per-system ループに grouping を注入する（`groupBy === "team"`
gate 内）: この system のノードに `collapseGroups`（`collapsedGroups` 対応）→ `assignGroupedLayers`
→ 得た grouped layers で tier layers を置換 → 配置後に per-(system, team) の `__group_<team>__`
ContainerRect を組む。single-system 分岐と同じヘルパを使うので見た目は一致する。ungrouped /
single-system 出力は gate により byte-identical（回帰なし）。

### 却下した案 — cross-system をまたぐ 1 枚のフレーム

1 つの team フレームが複数の side-by-side system フレームを**またいで囲む**案。`layoutMultipleSystems`
の「system は独立」という前提を崩し（system 同士が配置空間を共有することになる）、フレーム矩形が
system フレームと**重なる**ため TPL-20260624-02 の「全要素ちょうど一度・枠は disjoint」不変条件を
壊す。本 doc の scope 節（「out of scope: … cross-system group」）とも整合しない。よって大幅な
re-architecture かつ規模・リスクが見合わないとして却下し、per-system フレームを採る。

### スコープ外（本決定に含めないこと）

- **P2c ルーティング（直交・集約トランク・hop/junction）の multi-system への適用** — multi-system は
  そもそも orthogonal routing を使わず直線エッジ（`computeEdgePoints`）で描いており、本修正も直線の
  ままとする。root view の grouped エッジ磨き込みは必要なら別 Issue。
- **collapsed かつ system をまたぐ team** — 各 system が同じ `__group_collapsed_<team>__` stub id を
  生成しうる退化ケース。実運用では稀なため本修正では扱わず、必要になれば別 Issue。

### ADR 昇格

本決定は ADR-20260711-03（P2a）の follow-up。P2b / P2c 完了時に P2a follow-up 群とまとめて ADR へ
昇格する（本 doc に検討として保持）。

## 未解決の問い / 決めないこと

- **P2 のメンバー列挙キーワード** — `contains` / `includes` / `member` を候補として記録（参照系は動詞が karasu のイディオム: owns / realizes / delivers / handles）。**P2b 設計時に決める**。
- **group 間の相互結合を info 診断にするか** — `[cyclic]` / `duplicate-owner-assignment` と同じく「事実を述べ、判断は読み手に委ねる」形で surface できる。診断コードの新設は #1820 gate の対象か要検討。
- **任意 grouping なら group グラフは DAG に近づくか**（P2 の動機の一つ）— チーム境界は依存構造と一致しないことが実測された。意味的 group ならより DAG に近い可能性があるが未検証。
- **Group by 状態・折り畳み状態の共有**（URL / Share payload への符号化）— #1838 の follow-up（`/render` query param・Share button state）と同じ枠で扱う。
