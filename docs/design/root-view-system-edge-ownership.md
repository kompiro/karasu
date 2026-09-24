# root view の各 system フレームが持つエッジ集合を誰が決めるか

- **日付**: 2026-09-08（改訂: 2026-09-24）
- **ステータス**: 検討中（方針は確定。案1 を spike で実測し、詳細マップの持ち方だけ初版から変更した）
- **PR**: [#2783](https://github.com/kompiro/karasu/pull/2783)（初版）
- **関連**:
  - 引き金 Issue: [#2756](https://github.com/kompiro/karasu/issues/2756)
  - 発見の経緯: [#2646](https://github.com/kompiro/karasu/issues/2646) / PR [#2741](https://github.com/kompiro/karasu/pull/2741) のレビュー
  - 関連 ADR: [ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（multi は single の計算に合わせる）, [ADR-2223](../adr/2223-service-anchored-edge-renders-on-parent-canvas.md)（同じ罠を「実装上の落とし穴」として記録済み）, [ADR-681](../adr/681-top-level-service-rendering.md)（`__unassigned__` 擬似 system）, [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（per-system フレーム）
  - 関連 TPL: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md), [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)。本 Issue の実装 PR で TPL-2756 を新規に起こす（「proactive TPL」節。ファイルが無いうちは前方参照を張らない）
  - コード: `packages/core/src/view/view-extract.ts`（`extractRootSystemView`）, `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`）, `packages/core/src/diff/view-diff.ts`（`diffSystemViewSlices`）

## 背景・課題

system が 2 つ以上ある root view で、**宣言されていないエッジ（派生エッジ）が 1 本も描かれない**。

`.krs` はサービスとインフラの依存を 2 通りで書ける。矢印を明示する書き方と、`usecase` の `resource` 参照・`delivers`・domain 間の依存から karasu が導出する書き方である。後者は single system のビューでは描かれるが、root view では消える。

```krs
system Alpha {
  service Api {
    usecase U { resource Store.T }
  }
  database Store { table T }
}
system Beta {
  service Web
}
```

`Alpha` 単体のビューは `Api -> Store` を描く。`Alpha` + `Beta` の root view は**エッジを 1 本も描かない**。矢印で書き直せば直るので、同じ構造に 2 つの綴りを与えたうえで片方だけを描いていることになる。

これは [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) が言う「system が 2 つになった瞬間に機能が黙って無効になる」パターンの再発であり、#2646（カテゴリ折り畳みのエッジが root view で drop される）の 1 階層下にあたる。#2646 を直しても、`resource` 経由でインフラに繋がるモデルでは `Infra (N)` スタブに刺さるエッジが依然ゼロ本になる。

### 対象は「system が 2 つ以上」より広い（2026-09-24 改訂で判明）

`compile.ts` は top-level のノードを `__unassigned__` 擬似 system に包む（[ADR-681](../adr/681-top-level-service-rendering.md)）。擬似 system が 1 つだけでも、自分のラベル付きフレームを持つために `layoutMultipleSystems` を通る（`layout.ts` の `isUnassignedOnly`）。つまり **`system` を 1 つも書いていないモデルも、派生エッジを 1 本残らず失っていた**。

```krs
service Api {
  usecase U { resource Store.T }
}
database Store { table T }
```

これは `system` が 2 つある場合とまったく同じ欠落だが、2 つ目の system を必要としない。初版の本節は「system が 2 つ以上ある root view」と書いていたため、この経路を取りこぼしていた。修正は同一で、柵を 1 本足せば足りる。

## 現状（インベントリ）

### 欠落は抽出とレイアウトの 2 段階で起きている

`layout().edges` を実測した結果（`service Api { usecase U { resource Store.T } domain D1 { D1 -> D2 } }` + `service Other { domain D2 }` + `client Web` + `database Store { table T }` を含む system を、位置を変えて置いたもの）:

| 位置 | `slice.childEdges` | `layout().edges` |
| --- | --- | --- |
| single system | `Api->Other`, `Api->Store` | 同じ |
| root view の primary system（`si === 0`） | `Api->Other`, `Api->Store` | **空** |
| root view の 2 番目以降（`si >= 1`） | **空** | **空** |
| single（`delivers Web`） | `Api->Web` | 同じ |
| root view（`delivers Web`） | `Api->Web` | **空** |
| `system` なし（`__unassigned__` 単独） | `Api->Store` | **空** |

最後の行は 2026-09-24 の改訂で追加した。`system` を書かないモデルも同じ経路を通るという事実（「対象は『system が 2 つ以上』より広い」節）を表に載せていなかった。

- **抽出**: `extractRootSystemView` は `systems[0]`（+ 旧 API の orphan 引数）だけを導出対象にする。`deriveInfraEdges` / `deriveImplicitServiceEdges` / `deriveDeliversEdges` は `allChildren = systems[0].children + orphans` に対してしか走らない。2 番目以降の system の派生エッジは**そもそも作られない**。
- **レイアウト**: `layoutMultipleSystems` は `ViewSlice.childEdges` を読まず、system ごとに `withChildAnchoredEdges(sys)`（= `sys.edges` + 子ブロックに書かれた anchored edge）からレイアウトする。抽出が `systems[0]` 用に作った派生エッジは、**レイアウト直前でもう一度落ちる**。

### 各エッジ族の出どころ

欠落が 2 段階で起きている以上、「届くか」を 1 列で書くと段階が混ざる。抽出（`ViewSlice.childEdges` に載るか）と描画（`layout().edges` に出るか）を分けて示す。

| 族 | 由来 | 抽出: primary（`si === 0`） | 抽出: 2 番目以降 | 描画 |
| --- | --- | --- | --- | --- |
| explicit（`system` スコープ） | `sys.edges` | ○ | ✗ | ○ |
| anchored（`service S1 { S1 -> S2 }`, [ADR-2223](../adr/2223-service-anchored-edge-renders-on-parent-canvas.md)） | `collectAnchoredPeerEdges` / `withChildAnchoredEdges` | ○ | ✗ | ○ |
| infra 派生（`resource` / `usecase`） | `deriveInfraEdges` | ○ | ✗ | ✗ |
| implicit service（domain 間依存の集約） | `deriveImplicitServiceEdges` | ○ | ✗ | ✗ |
| internal（in-place 展開した service の内部 domain 間） | 同上 | ○ | ✗ | ✗ |
| delivers（`delivers` → `client`） | `deriveDeliversEdges` | ○ | ✗ | ✗ |

上 2 行が「抽出 ✗ なのに描画 ○」になっているのは、抽出を通ったからではない。`layoutMultipleSystems` が `withChildAnchoredEdges(sys)` から**作り直している**からである（`extractRootSystemView` の `explicitEdges` は `systems[0]` の分しか組まない）。逆に派生 4 族は、抽出が primary 用に作った集合をレイアウトが読まないので、抽出を通っても描画で落ちる。

この非対称、すなわち「下流が上流の成果物を使わず自前で作り直す」構図が本 Issue の芯であり、案4 の評価にも直結する。

### ADR-2223 は同じ罠を既に記録している

ADR-2223 の「実装上の落とし穴」節:

> **抽出だけでは足りない**。multi-system ルートと `__unassigned__` ルートは `layoutMultipleSystems` を通り、そこは `ViewSlice.childEdges` ではなく各 system の `sys.edges` からレイアウトする。抽出を通ったエッジがレイアウト直前で再び落ちるため、`layout.ts` 側でも anchored edge を持ち上げる。

そのときは anchored edge **だけ**を layout 側で持ち上げて塞いだ。今回の穴は、同じ落とし穴の塞ぎ残しである。

### `childEdges` はレイアウト以外にも使われている

| consumer | 用途 |
| --- | --- |
| `compile.ts:521` | `assignEdgeCanonicalIds` — permalink / 診断のエッジ id |
| `compile.ts:527` | `resolveStyles` の `extraEdges` — **モデルに宣言のない派生エッジのスタイル解決** |
| `style-resolver.ts` `styleDerivedEdges` | 静的バンドルのページごとの同じ補完 |
| `diff/view-diff.ts:223` | compare モードの before/after マージ |
| `layout.ts:251` | single system 経路のレイアウト入力 |

実測: `edge { color: #ff0000 }` は multi root の**両 system の宣言済みエッジ**に効く（`resolveStyles` がモデルを歩くため）。一方で**派生エッジ**はモデルに宣言が無いので `childEdges` 経由の `extraEdges` でしか色が付かない。したがって 2 番目以降の system に派生エッジを描けるようにするなら、そのエッジ集合が `resolveStyles` にも届かないと、新たに描かれた線が `[implicit]` の色も `[async]` の破線も失う（[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) の隣接ケース）。

**この制約が案の良し悪しを分ける主要因である。**

### `implicitEdgeDetails` は bare id キーで、multi 経路ではそもそも引かれていない

implicit service エッジが束ねた構成要素（[ADR-463](../adr/463-implicit-edge-detail-panel.md) の詳細パネルが出す「どの domain 間依存を集約した線か」）は `ViewSlice.implicitEdgeDetails` に載る。キーは `deriveImplicitServiceEdges` の `` `${fromEndpoint}->${toEndpoint}#${edge.kind}` `` で、**system 名を含まない**。

lookup は `layout-edges.ts` の `computeLayoutEdges` だけが行い、そこは single system 経路（`layout.ts:661`）からしか呼ばれない。multi 経路（`layout.ts:1096`）は `computeEdgePoints` を直に呼ぶので、`domainEdges` を付ける処理を通らない。

ここから 2 つの帰結がある。どちらも案1 の実装計画に効く。

1. **lookup を multi 経路にも足さないと、詳細パネルが空になる。** 2 番目以降の system に implicit service エッジを描けるようにしても、エッジは出るが中身が無いという別の半端な状態で終わる
2. **全 system の details を 1 枚のマップに無修飾キーでマージすると混線する。** `Alpha` と `Beta` がどちらも `Api` と `Store` を持つとき、両者の `Api->Store#implicit` は同一キーになり、後勝ちで一方の構成要素がもう一方の線の詳細として出る

つまり bare id の問題は node map と案2 のフィルタだけでなく、**details のキーにも同じ形で存在する**。案1 は system ごとにエッジ集合を閉じるので線そのものは誤爆しないが、details を 1 枚のマップに集めるなら、そのキーは system で修飾しない限りこの穴が残る。

2026-09-24 の spike で帰結 2 を実測した。`systemEdges` を入れたうえで details の lookup だけを slice 全体の無修飾マップに差し替えると、`Alpha` と `Beta` がそれぞれ `Api`→`Other` を集約するモデルで、**Alpha の線が Beta の構成要素（`B1->B2`, `B3->B2`）を出す**。混線は理屈ではなく実在する。

## 制約・前提

- **`.krs` の構文は変えない**（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md) の v1.0 freeze）。描画対象が増えるだけの追加的変更に留める。
- **single system 経路の出力は 1 バイトも変えない**。今回動かすのは root view だけ。
- **cross-system エッジの provenance を壊さない**。#2646（PR #2741）で `layoutMultipleSystems` は「どの system が cross-system エッジの起点か」を `withChildAnchoredEdges(sys)` からエッジ同一性で記録するようになった。限定子付き target（`Alpha.Store`）を除外した集合をそこに渡すと、折り畳んだ端点の再アンカーが壊れる。
- **root view の node map は bare id キー**（`allLayoutNodes.set(id, node)`）。system をまたいで同名の子 id が存在しうるという事実は、どの案でも前提として扱う。`implicitEdgeDetails` のキーも同じく bare id なので、同名 id 耐性はエッジ集合と details の**両方**で示す必要がある（前節）。
- **out of scope**: root view の node map を path キーに正規化すること（同名 id の根本解決）。今回のエッジ問題とは独立に大きく、別 Issue に値する。
- **out of scope**: in-place 展開（#1921）を 2 番目以降の system にも広げること。展開は root view の primary system 限定という現状を維持する。

## 検討した選択肢

### 案1: `ViewSlice.systemEdges`（system id → そのフレームのエッジ）を足す

抽出が **全 system** に対して同じ導出を走らせ、`Map<string, KrsEdge[]>` として slice に載せる。`layoutMultipleSystems` はこの map を引くだけにする。

`childEdges` は **map の全エントリの union** とする。こうすると `assignEdgeCanonicalIds` / `resolveStyles` の `extraEdges` / diff マージが、既存の配線のまま全 system を覆う。multi root では `childEdges` をレイアウトに使う経路が存在しない（`layoutInner` は single 専用）ので、union にしてもレイアウトには影響しない。

```ts
// layout.ts（エントリの形は下の「案1 の変種」で決まる。採用した変種 b では `?.edges`）
const systemRawEdges = viewSlice.systemEdges?.get(sys.id)?.edges ?? withChildAnchoredEdges(sys);
```

**メリット**

- 導出コードが 1 本（`deriveCanvasEdges`）になり、single / primary / 2 番目以降が同じ関数を通る。TPL-219 の drift 源を新設しない
- style / canonical id / diff が既存の `childEdges` 経路のまま全 system を覆う
- single system 経路は入力も出力も無変更
- レイアウト側の fallback（`?? withChildAnchoredEdges(sys)`）で、slice を手組みする直接呼び出し（テスト・外部 API）が壊れない。ADR-2223 の `assumptions:` にある `grep: layout.ts :: withChildAnchoredEdges` も有効なまま

**デメリット**

- `ViewSlice` に「canvas 軸」（`childNodes` / `childEdges`）と「system 軸」（`systems` / `systemEdges`）が同居する。root view だけ 2 軸になる歪みは残る
- `diffSystemViewSlices` に map のマージ（system ごとの `diffEdgeArray`）が要る
- `childEdges` の意味が root view で「primary canvas のエッジ」から「root view 全体のエッジ」に変わる。ドキュメントされた契約ではないが、直接呼び出しの読み手には変化

#### 案1 の変種: `implicitEdgeDetails` をどこに置くか

案1 は「エッジ集合を system ごとに閉じる」ところまでしか決めない。集約 implicit エッジの構成要素（詳細パネルの行）をどこに置くかで 2 つに分かれ、**ここが初版と改訂版の唯一の実質的な違い**である。

**変種 a: 1 枚のマップに集め、キーを system で接尾修飾する**（初版の方針）

`` `${from}->${to}#${kind}@${sys.id}` `` にして `ViewSlice.implicitEdgeDetails` へマージする。修飾を接尾にするのは、`diffImplicitEdgeDetails` が `key.indexOf("#")` より前を bare pair として `edgeDiff` の lookup に使っているため（接頭に付けると compare モードの `changes.domainEdges` が黙って当たらなくなる）。

- 単一の真実が 1 枚のマップに残る。ADR-2521 の「共有ヘルパーにフラグを足さない」志向に沿う
- 書き込み（`view-extract.ts`）と lookup（`layout-edges.ts`）の 2 箇所を**恒久的に同期**させる必要がある（[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) の形）
- lookup 側にフレームのスコープを渡す引数が増える。single 経路は `containerNode?.id ?? ""`、multi 経路は `sys.id`。`extractOrphanView` の書き込みも同じ形に移す
- single 経路のキー形が動く（frame が 1 つなので出力は不変だが、変更は single 経路に及ぶ）

**変種 b: `systemEdges` のエントリに system ごとの詳細マップを同居させる**（改訂版の方針）

```ts
// view-extract.ts
interface SystemFrameEdges {
  edges: KrsEdge[];
  /** キーは無修飾の `${from}->${to}#${kind}`。フレームごとに閉じているので衝突しない。 */
  implicitEdgeDetails: Map<string, DomainEdgeDetail[]>;
}
const systemEdges = new Map<string, SystemFrameEdges>();
for (const sys of systems) {
  systemEdges.set(sys.id, deriveCanvasEdges(/* その system の子と自スコープのエッジ */));
}
```

- 混線が**キーの規律ではなく構造**で起こらなくなる。「この構成要素は誰のものか」をマップの所在が答える
- キー形を 1 文字も変えないので、`layout-edges.ts`・single 経路・`extractOrphanView`・`diffImplicitEdgeDetails` のキー解析がすべて無変更。変種 a が要求する「2 箇所の恒久同期」が発生しない
- `diffSystemViewSlices` のマージが edges だけでなく details にも及ぶ。`diffImplicitEdgeDetails` の引数を `ViewSlice` 2 つから `ReadonlyMap` 2 つへ広げて使い回す（シグネチャのみ、ロジック無変更）
- primary system の details が slice 側（`implicitEdgeDetails`）とフレーム側の 2 箇所に存在する。multi root では slice 側を読む consumer が無いので害は出ないが、**非 primary の details が slice 側に載らない非対称**が残る

### 案2: `childEdges` を root canvas 全体の union にするだけ（新フィールドなし）

抽出は全 system 分の派生エッジを `childEdges` に足す。レイアウトは現在すでに持っている「その system の子 id 集合でフィルタ」（`idSet`）で system ごとに切る。

**メリット**

- 差分が最小。新しい `ViewSlice` フィールドがゼロ、diff の変更もゼロ
- style / canonical id が自動的に全 system を覆う

**デメリット**

- **同名 id の混線**。`system Alpha { service Api  database Store }` と `system Beta { service Api  database Store }` が並ぶとき、Alpha 由来の `Api->Store` は Beta のフレームでも `idSet` を通ってしまい、Beta に**存在しない依存が描かれる**。id が bare である以上フィルタでは切れない
- 誤爆が「余分な線が 1 本増える」という形で出るため、既存テストが落ちずに通り抜けやすい

この 1 点で採用できない。ただし「`childEdges` を root 全体の union にする」という部分は案1 に取り込んでいる（レイアウトの入力には使わない、という条件付きで）。

### 案3: `ViewSlice` を system ごとのスライス配列に正規化する

`systems: KrsNode[]` を `systemSlices: { system, nodes, edges, implicitEdgeDetails }[]` に置き換え、「root view は N 個の canvas の集まり」を型で表す。`si === 0` だけ `childNodes` を見て他は `sys.children` を見る、という現在の非対称もここで消える。

**メリット**

- 構造的に正しい。「どの system のどのエッジか」が型で表現され、bare id を前提にした map（`allLayoutNodes` / `crossSystemRemap`）の歪みも順に畳める
- 将来 root view の node map を path キーに移すときの土台になる

**デメリット**

- `ViewSlice` 型を参照するファイルが 19（非テスト）。drawio exporter・org view・deploy view・diff 3 種・compile 2 経路・app が追随する
- bug 1 件の修正としては過大。段階移行を挟まないと 1 PR に収まらない

### 案4: `layoutMultipleSystems` が導出ヘルパーを直接呼ぶ

`deriveInfraEdges` などを renderer から system ごとに呼ぶ。`ViewSlice` は不変。

**メリット**

- `ViewSlice` の契約に一切触らない。diff も無変更

**デメリット**

- **導出の呼び出し側が 2 箇所になる**。抽出側に新しい族が増えたとき renderer 側が追随しないと、今回とまったく同じ穴が開く。TPL-219 が繰り返し指している drift 源をこちらから新設することになる
- ADR-2223 が実際にこの手（layout 側で anchored edge を持ち上げる）を打っており、その結果が**今回の塞ぎ残し**である。同じ轍
- `compile` は `childEdges` しか style / canonical id に渡さないので、renderer で作った派生エッジには色も id も付かない。結局その集合を上流に戻す配線が別途要る

### 案5: system ごとに `extractView` を再帰させる

root view のレイアウトが、各 system について drill-down 相当の slice を作って使う。

**メリット**

- 導出コードの再利用に新しいコードがほぼ要らない

**デメリット**

- drill-down の slice は `containerNode` / `ancestorChain` を持ち、ghost 解決も走る別の意味の成果物。root view の 1 フレームと同一ではない（root view は system の**直下の子**だけを描き、ghost は root 用に別途組む）
- `buildResourceLabelMap` / `buildEntityResolver` などモデル全体を歩く構築が system 数だけ走る
- compare モードでは N+1 個の slice を before/after で差分することになり、diff の設計が重くなる

## 比較

| 観点 | 案1 map | 案2 union のみ | 案3 slice 配列 | 案4 layout で導出 | 案5 再帰抽出 |
| --- | --- | --- | --- | --- | --- |
| 変更量 | 中（3 ファイル + テスト） | 小 | 大（19 ファイルが型参照） | 小 | 中 |
| 導出が 1 本か | ○ | ○ | ○ | ✗（2 箇所） | ○ |
| style / canonical id の到達 | ○（union で自動） | ○ | ○ | ✗（別途配線） | △ |
| 同名 id 耐性 | ○（エッジは system ごとに閉じる。details は下の変種比較を参照） | ✗（誤爆する） | ◎ | ○ | ○ |
| single 経路への影響 | なし | なし | あり（型変更） | なし | なし |
| compare モードのコスト | map の diff 1 箇所 | なし | 大 | なし | 大 |
| 将来の path キー化への橋 | △ | ✗ | ◎ | ✗ | △ |

### 案1 の変種比較（`implicitEdgeDetails` の置き場）

| 観点 | 変種 a: 1 枚 + 接尾修飾（初版） | 変種 b: system ごとのマップ（採用） |
| --- | --- | --- |
| 混線の防ぎ方 | キー形の規律 | マップの所在（構造） |
| `layout-edges.ts` | frame スコープ引数を追加 | 無変更 |
| single 経路のキー形 | 動く（出力は不変） | 無変更 |
| `diffImplicitEdgeDetails` のキー解析 | bare pair の前置きを保つ制約が乗る | 無変更 |
| `extractOrphanView` の書き込み | 同じ形に移す | 無変更 |
| compare モードのマージ | edges のみ | edges + details（引数をマップ 2 つへ一般化） |
| 真実の重複 | なし | primary の details が 2 箇所から読める |

## Related TPLs

- [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) — 並列に存在する関数ファミリは parameter parity を保つ。`known_consumers` に `layout-single-vs-multi-system` を既に持つ。本 Issue は `discovered_from` に追記する（#2646 と同じ扱い）
- [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md) — 暗黙フィルタ（宣言漏れ / resolver / null 戻り）を全経路で確認する。今回の `idSet` フィルタと「導出対象が `systems[0]` だけ」がまさにその暗黙フィルタ
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) — style の lookup は layout が使う id 形をすべて試す。新たに描かれる派生エッジがスタイルを失わないことを縛る観点として隣接

### proactive TPL（2026-09-24 に決定）

> **「下流のステージは、上流が組み立てた集合を作り直さず消費する」**

ADR-2223 と本 Issue は同じ形で 2 回続いている（抽出が用意したエッジ集合を、レイアウトが `sys.edges` から作り直して落とす）。TPL-219 は「並列な関数ペアの parameter parity」を見る観点なので、この「パイプラインの下流が上流の成果物を無視して再導出する」形は厳密には別の切り口である。

3-Yes ルールでの評価:

1. 横展開しうるか: **Yes**。node 集合（`si === 0` だけ `childNodes` を見る現在の分岐）、style、ghost にも同型がある
2. 構造的に再発しうるか: **Yes**。抽出に新しいエッジ族を足すたびに再発する
3. 既存 TPL に未掲載か: **Yes**（レビューでの決定）。TPL-219 は parameter parity という別の切り口なので、この形をその題名の下に埋めない

**TPL-2756 として新規に起こす。** 実装 PR で `test-perspective` スキルを使って起こし、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) の `discovered_from` にも #2756 を追記する（`known_consumers` に `layout-single-vs-multi-system` を既に持つため、傘の側も更新する）。

## 現時点の方針

**案1 を、変種 b（system ごとの詳細マップ）で採用する。**

案の選定理由は 3 つ。

1. **ADR-2521 が既に方向を決めている**。「multi は single の計算に合わせる」。今回は計算そのものではなく計算の**入力**が食い違っているケースだが、片方だけが正しく、選択の余地がないという構図は同じ。
2. **style / canonical id の制約が案を絞る**。2 番目以降の system に派生エッジを描く以上、そのエッジ集合は `resolveStyles` にも届かなければならない。`childEdges` を union にすることで既存配線のまま届く案1 と案2 だけがこれを満たし、案2 は同名 id で誤爆する。
3. **案3 が正しい終着点だが、bug 1 件で払う額ではない**。案1 は案3 への橋を焼かない（`systemEdges` map は `systemSlices` に畳める形）。

### 変種 b を採る理由（2026-09-24 改訂）

初版は変種 a（1 枚のマップ + 接尾修飾）を指定していた。spike で両方を実測し、b に変えた。

- **b は a が守ろうとしていたものを、規律なしで守る**。混線は実在する（「`implicitEdgeDetails` は bare id キー」節の実測）。a はそれをキー形で防ぐので、書き込みと lookup の 2 箇所が永久にずれてはいけない。b はマップの所在で防ぐので、ずれる余地そのものが無い。
- **b の変更面は a より狭い**。`layout-edges.ts` は diff に現れず、single 経路のキーも `diffImplicitEdgeDetails` のキー解析も動かない。初版が「接頭に付けると compare モードの `changes.domainEdges` が黙って当たらなくなる」と警戒していた箇所に、触らずに済む。
- **b の代償は重複 1 つだけ**。primary system の details が slice 側とフレーム側の両方に載る。multi root では slice 側を読む consumer が無いので観測可能な害は出ない。ADR-2521 が嫌う「同じ問いに 2 つの真実」に形は似ているが、あちらは*計算*が 2 つあってどちらが正しいか決まっていなかったケースで、ここは同一の値が 2 箇所から読めるだけである。

spike で確認した結果（ブランチ `spike/2756-per-system-edge-details`、#2756 が閉じるまで残す）:

- 派生 3 族（infra / implicit service / delivers）が single・primary・2 番目以降・`__unassigned__` 単独のすべてで描かれる
- 同名 id を持つ 2 system で、片方だけに宣言した依存が他方のフレームに漏れない
- 同名 id を持つ 2 system がそれぞれ implicit service エッジを持つとき、各線の `domainEdges` が自分の system の構成要素だけを持つ
- 9 パッケージ 399 テストファイル・8138 テストが通り、lint / typecheck / knip / check:cycles / format:check も通る（回帰ゼロ）

### 実装の指針

1. `view-extract.ts` の `extractRootSystemView` から、systems[0] 用の導出（explicit + anchored + infra + implicit + internal + delivers）を `deriveCanvasEdges()` に切り出す。`canvasChildren`（フレームが並べるノード集合）と `anchorChildren`（anchored edge を出しうる子）を分けて受ける。両者が違うのは primary フレームだけで、そこは top-level orphan を system の子の隣に混ぜる（orphan は宣言された peer ではない、ADR-2223）
2. 全 system に対して `deriveCanvasEdges()` を呼び、`systemEdges: Map<string, SystemFrameEdges>` を組む。`SystemFrameEdges` は `{ edges, implicitEdgeDetails }`（案1 の変種 b）。systems[0] のエントリの `edges` は現在の `childEdges` と同一
3. `implicitEdgeDetails` の**キー形は変えない**。無修飾の `` `${from}->${to}#${kind}` `` のまま、フレームごとのマップに入れる。混線はマップの所在で防ぐので、`layout-edges.ts` / single 経路 / `extractOrphanView` / `diffImplicitEdgeDetails` のキー解析はいずれも無変更。`ViewSlice.implicitEdgeDetails` は primary フレームのぶんのまま据え置く（single 経路と diff が読む先を動かさない）
4. `childEdges` を `systemEdges` 全エントリの union にする（in-place 展開の `internalEdges` は primary のみ。非 primary は `expandedSet` を渡さないので自然に空になる）
5. `ViewSlice` に `systemEdges` を追加し、`emptySlice` に既定値を置く。drill-down 経路は未設定（`undefined`）でも layout の fallback に落ちるので挙動は同じだが、**`emptySlice` の空 Map と表現を揃える**。同じ問いに 2 つの綴りを残さない
6. `layout.ts` の `systemRawEdges` を `viewSlice.systemEdges?.get(sys.id)?.edges ?? withChildAnchoredEdges(sys)` にする。**cross-system の provenance（`crossSystemSource`）は従来どおり `withChildAnchoredEdges(sys)` から登録する**。新しい集合は限定子付き target を除外するので、そこから取ると #2646 の再アンカーが壊れる。なお `layoutMultipleSystems` には既に `systemEdges: LayoutEdge[]` というローカル変数があるので、slice 側のフレームは別名（`systemFrame`）で受けて取り違えを避ける
7. multi 経路の `computeEdgePoints` 呼び出しで、**そのフレームの** `implicitEdgeDetails` を引いて `domainEdges` を付ける。single 経路の `computeLayoutEdges` と同じ扱いにしないと、描かれた implicit エッジの詳細パネルが空になる
8. `diff/view-diff.ts` で `systemEdges` を system ごとにマージする。`edges` は `diffEdgeArray`、`implicitEdgeDetails` は `diffImplicitEdgeDetails`。後者は引数を `ViewSlice` 2 つから `ReadonlyMap` 2 つへ広げて、slice 側とフレーム側の両方から使い回す（ロジックは変えない）。片側にしか無いフレームはそのまま通し、revision 間で追加・削除された system がエッジを失わないようにする
9. テスト:
   - `layout.test.ts`: 3 族（infra 派生 / implicit service / delivers）× 3 位置（single / `si === 0` / `si >= 1`）で single と root が同じエッジ集合を出す parity 表
   - `layout.test.ts`: **`system` を書かないモデル（`__unassigned__` 単独）でも派生エッジが描かれること**（改訂で追加。「対象は『system が 2 つ以上』より広い」節の柵）
   - `layout.test.ts`: 同名 id を持つ 2 system で、片方だけに宣言したエッジが他方のフレームに漏れないこと（案2 の失敗モードを柵にする）
   - `layout.test.ts`: 同名 id を持つ 2 system が**それぞれ** implicit service エッジを持つとき、各線の `domainEdges` が自分の system の構成要素だけを持つこと（details 混線の柵。これが変種 b の要）
   - `layout.test.ts`: 派生エッジ + cross-system エッジ + カテゴリ折り畳みの同居（#2646 の再アンカーが生きていることの柵）
   - `view-extract.test.ts`: `systemEdges` が全 system 分そろい、`childEdges` がその union であること。drill-down では付かないこと
   - compare モードで削除された派生エッジが残ること
   - **新たに描かれる派生エッジがスタイル解決を受けること（`[implicit]` の色 / `[async]` の破線）。spike ではここだけ未測定**。`childEdges` が union なので配線上は届くはずだが、「この制約が案の良し悪しを分ける主要因」と本 Doc が書いた点なので、実装 PR では必ず柵にする
10. AT: 自動テストで閉じるため新規 AT は起こさない（手動でしか確認できない項目が無い）
11. changeset: `@karasu-tools/core` + `karasu`, patch（描画が変わる）
12. TPL: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) の `discovered_from` に #2756 を追記し、あわせて **TPL-2756 を新規に起こす**（「proactive TPL」節で決定済み）
13. ADR 昇格: 実装完了後に `docs/adr/2756-root-view-system-edge-ownership.md` として昇格し、本 Design Doc は同じ PR で削除する。**spike ブランチは #2756 の close で消えるので ADR からは参照しない**（[TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。必要な実測値は ADR 本文に書き写す

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: root view に、これまで描かれていなかった派生エッジが現れる。対象は system が 2 つ以上あるモデルと、**`system` を 1 つも書かないモデル**の両方（「対象は『system が 2 つ以上』より広い」節）。エッジが増えれば layering も変わるため、root view のレイアウトが動く
- **shipped examples のレンダリングは動かない**（spike で実測）。2 system の例 `examples/en/feature-samples/multi-system-root.krs` は依存を明示矢印だけで書いており、`examples/ja/multi-file-system/` は 5 ファイルすべてが `system Blog` を宣言して 1 つの system にマージされる。したがって rendered-diff は合成テストの中だけで動く。裏を返すと **この欠陥を示す example が 1 つも無い**ので、実装 PR で例を足すかは別途判断する（足すなら `examples-sync` の同期が要る）
- **in-place 展開（#1921）のエッジが副産物で描かれるようになる**: main では multi root でも primary の `childNodes` は展開済み（domain が並ぶ）なのに、`layout().edges` が空だった。修正後は展開フレームを跨ぐエッジが描かれる。**展開の対象を広げたのではない**（primary 限定は不変）。派生エッジ族がまるごと落ちていたぶんが直るだけである
- **ドキュメント更新**: 仕様の変更ではないので `docs/spec/` は変更なし。`docs/concepts.md` も変更なし
- **テスト・examples への影響**: `examples.test.ts` の drift ガードと、root view のエッジ本数に依存する既存テストが動く可能性がある。全スイートで確認する
- **`ViewSlice` の直接利用者**: `systemEdges` は optional + layout 側 fallback 付きなので、slice を手組みする呼び出しは無変更で動く
- **`implicitEdgeDetails` のキー形は変えない**（改訂）: 変種 b はフレームごとのマップで混線を防ぐので、このマップを引く利用者はどちらも追随不要。`layout-edges.ts`（キーを組み立てて get）と `diff/view-diff.ts`（`#` の前を切り出して `edgeDiff` を引く）はそのまま動く。初版は接尾修飾を指示していたため、この 2 箇所の同時変更を要求していた
- **非 primary の details は `ViewSlice.implicitEdgeDetails` に載らない**（変種 b の代償）: multi root でこのマップを読む consumer は無く（`computeLayoutEdges` は single 経路専用）、compare モードはフレーム側のマージで覆われるので、観測可能な欠落は無い。ただし「slice の `implicitEdgeDetails` は root view 全体ではなく primary フレームのもの」という非対称は残るので、ADR に書き残す
- **`edgeDiff` は bare pair キーのまま残る**: `diffEdgeArray` は `` `${from}->${to}` `` で before/after を突き合わせる。`childEdges` を全 system の union にすると、`Alpha` と `Beta` がどちらも `Api->Store`（宣言でも派生でも）を持つケースで 2 本が 1 エントリに畳まれ、片方だけの追加・削除が正しく分類されない。キー形が bare なのは今回始まったことではない（`crossSystemEdges` も同じ map に入る）が、**union にする分だけ露出面は広がる**。`edgeDiff` を per-system キーに移すのは案3 と同じ「bare id キーの正規化」に属する残件なので、ここでは直さず ADR 昇格時に既知の限界として書き残す
