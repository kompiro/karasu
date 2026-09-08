# root view の各 system フレームが持つエッジ集合を誰が決めるか

- **日付**: 2026-09-08
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2756](https://github.com/kompiro/karasu/issues/2756)
  - 発見の経緯: [#2646](https://github.com/kompiro/karasu/issues/2646) / PR [#2741](https://github.com/kompiro/karasu/pull/2741) のレビュー
  - 関連 ADR: [ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（multi は single の計算に合わせる）, [ADR-2223](../adr/2223-service-anchored-edge-renders-on-parent-canvas.md)（同じ罠を「実装上の落とし穴」として記録済み）, [ADR-681](../adr/681-top-level-service-rendering.md)（`__unassigned__` 擬似 system）, [ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（per-system フレーム）
  - 関連 TPL: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md), [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)
  - コード: `packages/core/src/view/view-extract.ts`（`extractRootSystemView`）, `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`）

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

- **抽出**: `extractRootSystemView` は `systems[0]`（+ 旧 API の orphan 引数）だけを導出対象にする。`deriveInfraEdges` / `deriveImplicitServiceEdges` / `deriveDeliversEdges` は `allChildren = systems[0].children + orphans` に対してしか走らない。2 番目以降の system の派生エッジは**そもそも作られない**。
- **レイアウト**: `layoutMultipleSystems` は `ViewSlice.childEdges` を読まず、system ごとに `withChildAnchoredEdges(sys)`（= `sys.edges` + 子ブロックに書かれた anchored edge）からレイアウトする。抽出が `systems[0]` 用に作った派生エッジは、**レイアウト直前でもう一度落ちる**。

### 各エッジ族の出どころ

| 族 | 由来 | 現在 root view に届くか |
| --- | --- | --- |
| explicit（`system` スコープ） | `sys.edges` | ○ |
| anchored（`service S1 { S1 -> S2 }`, [ADR-2223](../adr/2223-service-anchored-edge-renders-on-parent-canvas.md)） | `withChildAnchoredEdges` が持ち上げ | ○（layout 側で個別対応済み） |
| infra 派生（`resource` / `usecase`） | `deriveInfraEdges` | ✗ |
| implicit service（domain 間依存の集約） | `deriveImplicitServiceEdges` | ✗ |
| internal（in-place 展開した service の内部 domain 間） | 同上 | ✗ |
| delivers（`delivers` → `client`） | `deriveDeliversEdges` | ✗ |

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

## 制約・前提

- **`.krs` の構文は変えない**（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md) の v1.0 freeze）。描画対象が増えるだけの追加的変更に留める。
- **single system 経路の出力は 1 バイトも変えない**。今回動かすのは root view だけ。
- **cross-system エッジの provenance を壊さない**。#2646（PR #2741）で `layoutMultipleSystems` は「どの system が cross-system エッジの起点か」を `withChildAnchoredEdges(sys)` からエッジ同一性で記録するようになった。限定子付き target（`Alpha.Store`）を除外した集合をそこに渡すと、折り畳んだ端点の再アンカーが壊れる。
- **root view の node map は bare id キー**（`allLayoutNodes.set(id, node)`）。system をまたいで同名の子 id が存在しうるという事実は、どの案でも前提として扱う。
- **out of scope**: root view の node map を path キーに正規化すること（同名 id の根本解決）。今回のエッジ問題とは独立に大きく、別 Issue に値する。
- **out of scope**: in-place 展開（#1921）を 2 番目以降の system にも広げること。展開は root view の primary system 限定という現状を維持する。

## 検討した選択肢

### 案1: `ViewSlice.systemEdges`（system id → そのフレームのエッジ）を足す

抽出が **全 system** に対して同じ導出を走らせ、`Map<string, KrsEdge[]>` として slice に載せる。`layoutMultipleSystems` はこの map を引くだけにする。

`childEdges` は **map の全エントリの union** とする。こうすると `assignEdgeCanonicalIds` / `resolveStyles` の `extraEdges` / diff マージが、既存の配線のまま全 system を覆う。multi root では `childEdges` をレイアウトに使う経路が存在しない（`layoutInner` は single 専用）ので、union にしてもレイアウトには影響しない。

```ts
// view-extract.ts
const systemEdges = new Map<string, KrsEdge[]>();
for (const sys of systems) {
  const { edges, implicitEdgeDetails } = deriveCanvasEdges(/* その system の子と自スコープのエッジ */);
  systemEdges.set(sys.id, edges);
  // details は slice の 1 枚のマップにマージ
}
```

```ts
// layout.ts
const systemRawEdges = viewSlice.systemEdges?.get(sys.id) ?? withChildAnchoredEdges(sys);
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
| 同名 id 耐性 | ○（system ごとに集合が閉じる） | ✗（誤爆する） | ◎ | ○ | ○ |
| single 経路への影響 | なし | なし | あり（型変更） | なし | なし |
| compare モードのコスト | map の diff 1 箇所 | なし | 大 | なし | 大 |
| 将来の path キー化への橋 | △ | ✗ | ◎ | ✗ | △ |

## Related TPLs

- [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) — 並列に存在する関数ファミリは parameter parity を保つ。`known_consumers` に `layout-single-vs-multi-system` を既に持つ。本 Issue は `discovered_from` に追記する（#2646 と同じ扱い）
- [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md) — 暗黙フィルタ（宣言漏れ / resolver / null 戻り）を全経路で確認する。今回の `idSet` フィルタと「導出対象が `systems[0]` だけ」がまさにその暗黙フィルタ
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) — style の lookup は layout が使う id 形をすべて試す。新たに描かれる派生エッジがスタイルを失わないことを縛る観点として隣接

### proactive TPL の候補（レビューで判断したい）

> **「下流のステージは、上流が組み立てた集合を作り直さず消費する」**

ADR-2223 と本 Issue は同じ形で 2 回続いている（抽出が用意したエッジ集合を、レイアウトが `sys.edges` から作り直して落とす）。TPL-219 は「並列な関数ペアの parameter parity」を見る観点なので、この「パイプラインの下流が上流の成果物を無視して再導出する」形は厳密には別の切り口である。

3-Yes ルールでの評価:

1. 横展開しうるか — **Yes**。node 集合（`si === 0` だけ `childNodes` を見る現在の分岐）、style、ghost にも同型がある
2. 構造的に再発しうるか — **Yes**。抽出に新しいエッジ族を足すたびに再発する
3. 既存 TPL に未掲載か — **判断が割れる**。TPL-219 の傘に入れて `known_consumers` を増やすだけでも運用は回る

3 番目の判断をレビューで決めたい。新規に起こすなら本 PR で `test-perspective` スキルを使って起こし、本 Design Doc と相互リンクする。

## 現時点の方針

**案1 を採用する。**

理由は 3 つ。

1. **ADR-2521 が既に方向を決めている** — 「multi は single の計算に合わせる」。今回は計算そのものではなく計算の**入力**が食い違っているケースだが、片方だけが正しく、選択の余地がないという構図は同じ。
2. **style / canonical id の制約が案を絞る**。2 番目以降の system に派生エッジを描く以上、そのエッジ集合は `resolveStyles` にも届かなければならない。`childEdges` を union にすることで既存配線のまま届く案1 と案2 だけがこれを満たし、案2 は同名 id で誤爆する。
3. **案3 が正しい終着点だが、bug 1 件で払う額ではない**。案1 は案3 への橋を焼かない（`systemEdges` map は `systemSlices` に畳める形）。

### 実装の指針

1. `view-extract.ts` の `extractRootSystemView` から、systems[0] 用の導出（explicit + anchored + infra + implicit + internal + delivers）を `deriveCanvasEdges()` に切り出す
2. 全 system に対して `deriveCanvasEdges()` を呼び、`systemEdges: Map<string, KrsEdge[]>` を組む。systems[0] のエントリは現在の `childEdges` と同一。各 system の `implicitEdgeDetails` は slice の 1 枚のマップにマージする
3. `childEdges` を `systemEdges` 全エントリの union にする（in-place 展開の `internalEdges` は primary のみ）
4. `ViewSlice` に `systemEdges` を追加し、`emptySlice` に既定値を置く
5. `layout.ts` の `systemRawEdges` を `viewSlice.systemEdges?.get(sys.id) ?? withChildAnchoredEdges(sys)` にする。**cross-system の provenance（`crossSystemSource`）は従来どおり `withChildAnchoredEdges(sys)` から登録する** — 新しい集合は限定子付き target を除外するので、そこから取ると #2646 の再アンカーが壊れる
6. `diff/view-diff.ts` で `systemEdges` を system ごとに `diffEdgeArray` でマージする
7. テスト:
   - `layout.test.ts`: 3 族（infra 派生 / implicit service / delivers）× 3 位置（single / `si === 0` / `si >= 1`）で single と root が同じエッジ集合を出す parity 表
   - `layout.test.ts`: 同名 id を持つ 2 system で、片方だけに宣言したエッジが他方のフレームに漏れないこと（案2 の失敗モードを柵にする）
   - `layout.test.ts`: 派生エッジ + cross-system エッジ + カテゴリ折り畳みの同居（#2646 の再アンカーが生きていることの柵）
   - `view-extract.test.ts`: `systemEdges` が全 system 分そろい、`childEdges` がその union であること
   - compare モードで削除された派生エッジが残ること
   - 新たに描かれる派生エッジがスタイル解決を受けること（`[implicit]` の色 / `[async]` の破線）
8. AT: 自動テストで閉じるため新規 AT は起こさない（手動でしか確認できない項目が無い）
9. changeset: `@karasu-tools/core` + `karasu`, patch（描画が変わる）
10. ADR 昇格: 実装完了後に `docs/adr/2756-root-view-system-edge-ownership.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: system が 2 つ以上あるモデルの root view に、これまで描かれていなかった派生エッジが現れる。エッジが増えれば layering も変わるため、**既存 examples の root view のレイアウトが動く**。これは修正の目的そのものだが、rendered-diff のレビューが要る
- **ドキュメント更新**: 仕様の変更ではないので `docs/spec/` は変更なし。`docs/concepts.md` も変更なし
- **テスト・examples への影響**: `examples.test.ts` の drift ガードと、root view のエッジ本数に依存する既存テストが動く可能性がある。全スイートで確認する
- **`ViewSlice` の直接利用者**: `systemEdges` は optional + layout 側 fallback 付きなので、slice を手組みする呼び出しは無変更で動く
