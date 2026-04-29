# Auto-layout: presentation-only layout hints in `.krs.style`

- **日付**: 2026-04-29（B 着地反映: 2026-04-29）
- **ステータス**: 検討中（A・B 着地済み、本ドキュメントの方針合意後に実装着手可）
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#969](https://github.com/kompiro/karasu/issues/969) — C. presentation-only layout hints in `.krs.style` (escape hatch)
  - 兄弟（着地済み）:
    - A: [auto-layout-actor-row-by-target](./auto-layout-actor-row-by-target.md)（[#967](https://github.com/kompiro/karasu/issues/967)）
    - B: [ADR-20260429-01 — Skip-layer エッジの直交チャネルルーティング](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（[#968](https://github.com/kompiro/karasu/issues/968) / 実装 PR [#989](https://github.com/kompiro/karasu/pull/989)）
  - B のフォローアップ: [#996](https://github.com/kompiro/karasu/issues/996)（Phase 3 — port distribution + per-channel lane allocation）
  - 関連 ADR: [ADR-20260411-01](../adr/20260411-01-arch-layout-barycenter-wrap-scope-reduction.md)（layer 内の x 順序ヒューリスティクス）

## 背景・課題

A（actor row 再配置）と B（直交チャネルエッジルーティング）が main に着地した
ことで、karasu の auto-layout は EC Platform 例の崩れを自動で解消できる:

- A: outgoing edge を持つ actor は target の直前 row に降りる。
- B: 中間ノード矩形を貫通する skip-layer downward edge は L 字型 polyline に
  自動置換される。フォールバックで最悪でも従来の直線（regression なし）。

しかし A・B が **トポロジ起点**で動く以上、以下は依然として残る:

- **作者が意図する位置を auto-layout が推論できない**ケース。例: 監査用の
  `Admin` を意図的に右端に固定したい、外部 SaaS だけ右側に集めたい、など。
  これはトポロジ情報には現れない「読みやすさのための意図」。
- A/B 後に同 row へ並んだ複数ノードの **x 順序**は barycenter が決める。
  実例で「Customer を Seller の左に置きたい」のような意図が満たせない場合
  がある（B Phase 3 #996 はラベル位置の分散であって、ノード x 順序の制御
  ではない）。
- B が対象外としている **同層 / 隣接層 / ghost / cyclic** edge での視覚的
  崩れは hint で動かしても改善しない（ノード位置を変えても直線が引かれる
  まま）ので、本ドキュメントのスコープからも外す。

要するに C は **B 後の残課題のうち、トポロジでは表せない意図**だけを担う
escape hatch である。

## 制約・前提

- **escape hatch であって推奨ルートではない**: hint なしで読める図を
  auto-layout が出すのが正であり、hint は最小限に留める。プロパティを
  追加するたびに「この hint が必要なケースは A/B / Phase 3 に取り込めないか」
  を必ず検討する。
- **モデル語彙は変えない**: `.krs` には影響を与えない。
- **既存 `.krs.style` と互換**: 既存スタイル（`background-color` 等）と
  同じセレクタ・カスケード規則を使う。新セレクタ型は追加しない。
- **B との用語衝突を避ける**: B のフォローアップ #996 が **per-channel
  lane allocation** という内部用語で「lane」を使う。これは edge routing の
  チャネル内ラベル y 分散を指す概念で、`.krs.style` の hint とは別物。
  本ドキュメントでは混乱回避のため hint プロパティ名は **`column`** を採用
  する（後述 C6 で詳説）。
- **B Phase 2 が修正したケースを hint で重複対処しない**: skip-layer 貫通
  は B が自動で解決するため、`.krs.style` 側の hint は **node x 配置**の
  意図表明に限定する。
- **決定的なレンダリング**: snapshot test 多数のため、hint は決定的に
  反映されること（座標から純関数で導出）。

## 決定（提案）

### 1. 最小プロパティセット

初期実装は **`column` の 1 プロパティのみ**を導入する。layer（行）を
動かす `rank` 系は実例で必要になってから追加する（Issue 本文の "smallest
unblocks real cases" に従う）。

```css
#Admin {
  column: right;       /* left | center | right */
}
```

#### `column` の意味

- 値は `left` / `center` / `right` の 3 値（列挙）。任意の数値や `%` は
  受け付けない（escape hatch を最小に保つため）。
- 同じ layer 内で **x 順序の決定的なバケット**を表す。barycenter による
  並べ替えの **前** に bucket 分けし、bucket 内は従来どおり barycenter で
  並べる。
- 既定値は「未指定」。未指定ノードは barycenter 単独で並ぶ（既存挙動）。

```
layer 1:  [ left bucket ] [ center bucket / unspecified ] [ right bucket ]
            ↑ left の中は barycenter で並ぶ        ↑ right も同様
```

#### 適用される selector

`.krs.style` の既存 selector（id / kind / tag / annotation / 複合）すべてで
書ける。実用上は **id** が最頻、次いで kind + tag。

```css
#Admin            { column: right; }
user[ops]         { column: right; }
service[external] { column: right; }
```

### 2. プロパティの分類: `layout-*` 名前空間は使わない

CSS 風の素直な名前（`column`）を採用する。`layout-column:` のような
名前空間プレフィックスは却下（後述 C2）。

### 3. 解決パイプライン

既存の `style-resolver` は `ResolvedNodeStyle`（描画属性）を返す。`column` は
**描画ではなくレイアウト入力**なので、別の解決パスを設ける:

```
parser → StyleSheet → style-resolver
  ├─ ResolvedNodeStyle  (描画属性 — 既存)
  └─ ResolvedLayoutHints (新規 — column など)
```

- `ResolvedLayoutHints` は `Map<nodeId, { column?: "left" | "center" | "right" }>`。
- カスケード規則・specificity は既存と同一（最後勝ち、id=100, tag=10, kind=1）。
- 不正値（`column: foo` 等）はパーサが警告を出して該当宣言を無視する
  （既存の不明プロパティ警告経路を流用）。

### 4. 層配置との関係

`column` は **layer（行）の指定ではなく、layer 内 x 配置の指定**である。
これは A の挙動（layer は kind とエッジから決まる）と直交する:

- `#Admin { column: right; }` を書いても Admin の **layer** は変わらない。
- A/B の自動配置を尊重したまま「同じ row の右端」に寄せられる。
- layer 自体を動かしたい場合は将来 `rank` プロパティで対応（v2 以降）。

### 5. B（直交ルーティング）との相互作用

B は `LayoutEdge.waypoints` に基づき、エッジ経路を計算する。`column` で
ノードの x が動くと、B の channel 計算に渡される矩形位置も動くため、
B の経路も **自動的に再計算**される。

- `column: right` で右に寄せたノードへの skip-layer edge は、B が新しい
  座標を見て改めて貫通判定 → polyline / 直線フォールバックを選ぶ。
- 結果として「hint で位置を動かしたら B のルーティングも追随する」整合
  性が保たれる。`column` の実装は layout 段の x ソートに介入するだけで、
  B の実装に変更は要らない。

### 6. ドキュメント・警告ガイドライン

- `docs/spec/style.md` / `style.ja.md` に "Layout hints" セクションを追加し、
  **最終手段**であることを明記する。
- 各 hint の説明に「これが必要だと感じたら、まず A/B / Phase 3 のヒュー
  リスティクス改善で吸収できないか検討すること」を記載。
- 用語: B 内部の "channel lane"（edge routing の per-channel y 分散）と
  `.krs.style` の `column` は別物だと注記する。

## 理由

1. **モデルを汚さない**: `.krs` は「実際の構造」、`.krs.style` は「見せ方」
   という分離が貫ける。escape hatch をモデルに置くと、後で「なぜ Admin に
   `[right]` タグが付いているのか」と誤読される。
2. **既存の `.krs.style` とつなぐコストが低い**: 同じ selector / cascade /
   parser を流用できる。実装は新プロパティの追加と layout への小さな
   フックのみ。
3. **B と非干渉**: `column` は layer 内 x 順序にだけ作用するので、B の
   waypoint 計算ロジックに手を入れずに済む。B が後段で再ルーティングする。
4. **段階的拡張**: `column` だけで始めて、実例が出てから `rank`・`row`・
   `column-span` 等を足す。空振り設計を避ける。

## 却下した案

### C1: モデル側にレイアウト用タグ（例: `[lane:right]`）を追加
- `.krs` に `[lane:right]` のようなタグを書けるようにする案。
- 却下理由: タグは「この要素が何者か」を表す語彙。レイアウト都合をタグに
  混ぜると、モデルの意味が見せ方に汚染される（A の代替案 A2 と同じ理由）。

### C2: 名前空間付きプロパティ（`layout-column:`, `karasu-layout: ...`）
- CSS の `-webkit-` のようにベンダープレフィックスでレイアウト系を分ける。
- 却下理由: karasu の `.krs.style` は CSS 風だが CSS そのものではない
  （`shape:` 等、独自プロパティが既にある）。プレフィックスを足すと既存
  プロパティとの一貫性が崩れる。

### C3: 数値座標 `x: 320px;` `y: 80px;`
- 完全フリーフォームで絶対座標を指定できるようにする。
- 却下理由: escape hatch の用途を超える。図のサイズ・フォント・テーマで
  座標は容易にズレるため、保守不能になる。`column` のような **意図** ベース
  に絞る。

### C4: 別ファイル `*.krs.layout` を新設
- レイアウトヒントは独立ファイルに切り出す。
- 却下理由: ファイルが増える割に得るものが少ない。`.krs.style` で
  selector を共有できる方がはるかに便利。

### C5: `flex` / `grid` 風のフルレイアウト DSL
- `display: grid; grid-template-rows: ...` のような完全な DSL を導入。
- 却下理由: スコープ過剰。auto-layout が主役で、hint は最後の調整という
  本 Issue の前提（"keep it minimal"）から逸脱する。

### C6: Issue 本文の strawman どおり `lane:` を採用
- 却下理由: B の ADR-20260429-01 と Phase 3（[#996](https://github.com/kompiro/karasu/issues/996)）が edge routing の **per-channel
  lane allocation**（チャネル内ラベル y 分散）という内部概念で「lane」を
  使う。同じファイル内のエッジに作用する内部用語と、`.krs.style` のノード
  x 配置プロパティが同名だと、ドキュメントとコードの両方で曖昧になる。
  Issue 本文の `lane:` は strawman 表記なので、実装時に **`column`** に
  改名する。`column` は「同 row 内のどの列か」を素直に表し、CSS の
  `flex`/`grid` 系慣習にも近い。

## 影響範囲

| 領域                                                | 影響                                         |
| --------------------------------------------------- | -------------------------------------------- |
| `packages/core/src/parser/style-parser.ts`          | `column` プロパティを受理、`left/center/right` 以外は警告 |
| `packages/core/src/types/style.ts`                  | `ResolvedLayoutHints` 型を追加               |
| `packages/core/src/resolver/style-resolver.ts`      | layout hints の解決を追加                    |
| `packages/core/src/renderer/layout.ts`              | x 順序決定（barycenter）の前に column bucket を適用 |
| `packages/core/src/renderer/edge-routing-channels.ts` | 変更不要（B は新しい座標で再計算する）     |
| `docs/spec/style.md`, `docs/spec/style.ja.md`       | "Layout hints" セクション追加                |
| 既存の `.krs.style`                                 | 影響なし（新プロパティ・既定値は未指定）     |

## 検証

### 自動

- 既存スタイル / レイアウトテストすべて通過（A 着地後 / B 着地後のスナップ
  ショットを破壊しないこと）
- 新規テスト:
  - パーサ: `column: right` を受理、`column: foo` で警告
  - リゾルバ: id selector が kind selector を上書きする
  - レイアウト: 同じ layer 内で `column: left` ノードが左端、`column: right`
    ノードが右端に来る
  - B との結合: `column` でノードを動かしたとき B の polyline 経路が
    新座標に追随することをスナップショットで確認
  - 後方互換: `column` を含まない既存スナップショットが変化しない

### 手動 / Acceptance Test

- AT に「ある actor を右端に固定したい」という代表ケースを追加し、`.krs`
  を変えずに `.krs.style` だけで意図どおりの並びになることを確認する。
- 既存の EC Platform 例で hint を一切 **付けない** まま、A+B のみで描画が
  許容範囲に収まっていることを確認する（C 実装によって自動レイアウトの
  品質が劣化していないことのガード）。

## 未解決事項

- **`rank` の追加判断**: A+B+Phase3 着地後でも row が意図と違うケースが
  実例で残ったら追加する。`rank: <integer>` の正確なセマンティクス
  （絶対 row index か、layer 内オフセットか）は実例を見てから決める。
- **deploy / org view での扱い**: 当面 system view のみに適用する。
  deploy view（hierarchical DAG, ADR-20260408-02）は別ロジックなので、
  そちらの hint は別途 Issue で検討する。
- **複数選択時のカスケード境界例**: 同じ specificity で `column: left` と
  `column: right` が当たった場合は「後勝ち」（既存規則）に従うが、テスト
  ケースで明示する。
- **Phase 3（#996）着地後の再評価**: Phase 3 のフォローアップが終わった
  時点でもう一度「`column` 一本で十分か」を実例ベースで確認する。
