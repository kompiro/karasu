# Auto-layout: presentation-only layout hints in `.krs.style`

- **日付**: 2026-04-29
- **ステータス**: 検討中（B #968 の着地後に実装可否を最終判定）
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#969](https://github.com/kompiro/karasu/issues/969) — C. presentation-only layout hints in `.krs.style` (escape hatch)
  - 兄弟設計:
    [auto-layout-actor-row-by-target](./auto-layout-actor-row-by-target.md)（A — 着地済 #967）,
    [auto-layout-edge-routing-orthogonal](./auto-layout-edge-routing-orthogonal.md)（B — 実装中 #968）
  - 関連 ADR: [ADR-20260411-01](../adr/20260411-01-arch-layout-barycenter-wrap-scope-reduction.md)（layer 内の x 順序ヒューリスティクス）

## 背景・課題

A（actor row 再配置）と B（直交エッジルーティング）が着地すれば、karasu の
auto-layout は EC Platform 例で目に見える崩れを自動で解消できる。しかし
A・B がカバーできない領域は必ず残る:

- **作者が意図する位置**を auto-layout が推論できない。例: 監査用の `Admin`
  を意図的に右端に固定したい、`OrderEvents` キューを「3 番目の row」に
  揃えたい、など。
- A/B はトポロジを見て決めるため、**同じ row 内の x 順序**は barycenter ヒュー
  リスティクスに依存する。複数 actor を同 row に並べたときに作者の意図と
  異なる順序になることがある。
- 一部の図では「論理上は同じ層だが、見た目だけ別 row に分けたい」要件が
  ある（例: テナント横断の依存先と内部依存先）。

これらは **モデル（`.krs`）には存在しない情報**で、純粋に提示の問題である。
karasu の哲学（モデルは「実際にあるもの」を記述する）を守るには、`.krs`
に書き足すのではなく `.krs.style` 側に隔離するのが妥当。

## 制約・前提

- **escape hatch であって推奨ルートではない**: hint なしで読める図を
  auto-layout が出すのが正であり、hint は最小限に留める。プロパティを
  追加するたびに「この hint が必要なケースは A/B に取り込めないか」を
  検討する。
- **モデル語彙は変えない**: `.krs` には影響を与えない。
- **既存 `.krs.style` と互換**: 既存スタイル（`background-color` 等）と
  同じセレクタ・カスケード規則を使う。新セレクタ型は追加しない。
- **B（#968）が landしてからスコープを確定**: B が orthogonal routing で
  解決するケースは hint で扱わない。本ドキュメントは方針合意までを目的と
  し、実装着手は B のマージ後に再評価する。
- **決定的なレンダリング**: snapshot test 多数のため、hint は決定的に
  反映されること。

## 決定（提案）

### 1. 最小プロパティセット

初期実装は **`lane` の 1 プロパティのみ**を導入する。`rank` は実例で必要に
なってから追加する（Issue 本文の「smallest unblocks real cases」に従う）。

```css
#Admin {
  lane: right;       /* left | center | right */
}
```

#### `lane` の意味

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
#Admin            { lane: right; }
user[ops]         { lane: right; }
service[external] { lane: right; }
```

### 2. プロパティの分類: `layout-*` 名前空間は使わない

検討の結果、CSS 風の素直な名前（`lane`）を採用する。`layout-lane:` のような
名前空間プレフィックスは却下（後述）。

### 3. 解決パイプライン

既存の `style-resolver` は `ResolvedNodeStyle`（描画属性）を返す。`lane` は
**描画ではなくレイアウト入力**なので、別の解決パスを設ける:

```
parser → StyleSheet → style-resolver
  ├─ ResolvedNodeStyle  (描画属性 — 既存)
  └─ ResolvedLayoutHints (新規 — lane など)
```

- `ResolvedLayoutHints` は `Map<nodeId, { lane?: "left" | "center" | "right" }>`。
- カスケード規則・specificity は既存と同一（最後勝ち、id=100, tag=10, kind=1）。
- 不正値（`lane: foo` 等）はパーサが警告を出して該当宣言を無視する
  （既存の不明プロパティ警告経路を流用）。

### 4. 層配置との関係

`lane` は **layer（行）の指定ではなく、layer 内 x 配置の指定**である。
これは A の挙動（layer は kind とエッジから決まる）と直交する:

- `#Admin { lane: right; }` を書いても Admin の **layer** は変わらない。
- A/B の自動配置を尊重したまま「同じ row の右端」に寄せられる。
- layer 自体を動かしたい場合は `rank` プロパティで対応（v2 以降）。

### 5. ドキュメント・警告ガイドライン

- `docs/spec/style.md` に "Layout hints" セクションを追加し、**最終手段**で
  あることを明記する。
- 各 hint の説明に「これが必要だと感じたら、まず A/B のヒューリスティクス
  改善で吸収できないか検討すること」を記載。

## 理由

1. **モデルを汚さない**: `.krs` は「実際の構造」、`.krs.style` は「見せ方」
   という分離が貫ける。escape hatch をモデルに置くと、後で「なぜ Admin に
   `[right]` タグが付いているのか」と誤読される。
2. **既存の `.krs.style` とつなぐコストが低い**: 同じ selector / cascade /
   parser を流用できる。実装は新プロパティの追加と layout への小さな
   フックのみ。
3. **段階的拡張**: `lane` だけで始めて、実例が出てから `rank`・`row`・
   `column-span` 等を足す。空振り設計を避ける。
4. **A/B との直交性**: `lane` は layer 決定後の x 順序に作用するため、
   A/B のロジックを変えずに併用できる。

## 却下した案

### C1: モデル側にレイアウト用タグ（例: `[lane:right]`）を追加
- `.krs` に `[lane:right]` のようなタグを書けるようにする案。
- 却下理由: タグは「この要素が何者か」を表す語彙。レイアウト都合をタグに
  混ぜると、モデルの意味が見せ方に汚染される（A の代替案 A2 と同じ理由）。

### C2: 名前空間付きプロパティ（`layout-lane:`, `karasu-layout: ...`）
- CSS の `-webkit-` のようにベンダープレフィックスでレイアウト系を分ける。
- 却下理由: karasu の `.krs.style` は CSS 風だが CSS そのものではない
  （`shape:` 等、独自プロパティが既にある）。プレフィックスを足すと既存
  プロパティとの一貫性が崩れる。

### C3: 数値座標 `x: 320px;` `y: 80px;`
- 完全フリーフォームで絶対座標を指定できるようにする。
- 却下理由: escape hatch の用途を超える。図のサイズ・フォント・テーマで
  座標は容易にズレるため、保守不能になる。`lane` のような **意図** ベース
  に絞る。

### C4: 別ファイル `*.krs.layout` を新設
- レイアウトヒントは独立ファイルに切り出す。
- 却下理由: ファイルが増える割に得るものが少ない。`.krs.style` で
  selector を共有できる方がはるかに便利。

### C5: `flex` / `grid` 風のフルレイアウト DSL
- `display: grid; grid-template-rows: ...` のような完全な DSL を導入。
- 却下理由: スコープ過剰。auto-layout が主役で、hint は最後の調整という
  本 Issue の前提（"keep it minimal"）から逸脱する。

## 影響範囲

| 領域                                                | 影響                                         |
| --------------------------------------------------- | -------------------------------------------- |
| `packages/core/src/parser/style-parser.ts`          | `lane` プロパティを受理、`left/center/right` 以外は警告 |
| `packages/core/src/types/style.ts`                  | `ResolvedLayoutHints` 型を追加               |
| `packages/core/src/resolver/style-resolver.ts`      | layout hints の解決を追加                    |
| `packages/core/src/renderer/layout.ts`              | x 順序決定（barycenter）の前に lane bucket を適用 |
| `docs/spec/style.md`, `docs/spec/style.ja.md`       | "Layout hints" セクション追加                |
| 既存の `.krs.style`                                 | 影響なし（新プロパティ・既定値は未指定）     |

## 検証

### 自動

- 既存スタイル / レイアウトテストすべて通過
- 新規テスト:
  - パーサ: `lane: right` を受理、`lane: foo` で警告
  - リゾルバ: id selector が kind selector を上書きする
  - レイアウト: 同じ layer 内で `lane: left` ノードが左端、`lane: right`
    ノードが右端に来る
  - 後方互換: `lane` を含まない既存スナップショットが変化しない

### 手動 / Acceptance Test

- AT に「ある actor を右端に固定したい」という代表ケースを追加し、`.krs`
  を変えずに `.krs.style` だけで意図どおりの並びになることを確認する。
- B（#968）着地後、B が解決するケースから hint を **外しても** 図が
  崩れないことを確認する（escape hatch を最小に保つガード）。

## 未解決事項

- **`rank` の追加判断**: B 着地後、A+B でも row が意図と違うケースが
  実例で残ったら追加する。`rank: <integer>` の正確なセマンティクス
  （絶対 row index か、layer 内オフセットか）は実例を見てから決める。
- **deploy / org view での扱い**: 当面 system view のみに適用する。
  deploy view（hierarchical DAG）は別ロジックなので、そちらの hint は
  別途 Issue で検討する。
- **複数選択時のカスケード境界例**: 同じ specificity で `lane: left` と
  `lane: right` が当たった場合は「後勝ち」（既存規則）に従うが、テスト
  ケースで明示する。
- **B 着地後の再評価**: B 完了時点で、本ドキュメントの「最小セット」が
  なお適切かを見直す（プロパティ削減 / 追加の判断を行う）。
