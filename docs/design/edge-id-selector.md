# Edge ID selector for `.krs.style`

- **日付**: 2026-05-03
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1096](https://github.com/kompiro/karasu/issues/1096)
  - 親設計: [`docs/design/gui-driven-style-editing.md`](./gui-driven-style-editing.md)
  - 兄弟設計: [`docs/design/edge-direction-style.md`](./edge-direction-style.md)
  - 既存仕様: `docs/spec/style.md`
  - 関連実装: `packages/core/src/types/ast.ts`、`packages/core/src/resolver/style-resolver.ts`、`packages/core/src/resolver/style-parser.ts`

## 背景・課題

#1076（GUI-driven style editing）の MVP では、Preview 上で選んだ edge にだけ
スタイルを適用するため、**個々の edge を一意に指定できる selector** が必要に
なる。現状の `.krs.style` には:

- `edge` — 全 edge
- `edge[tag]` — タグでフィルタ

しかなく、**「この edge だけ」を指す手段がない**。本設計で `edge#<id>` 形式を
追加する。

`KrsEdge` 構造（`packages/core/src/types/ast.ts:224-231`）には現在 ID フィールドが
無く、resolver は `<from>-><to>` という positional な合成キーで扱っている
（`style-resolver.ts:152-154`）。同じエンドポイント間に複数 edge があれば
区別できない。

## 制約・前提

- **`.krs` 構文は変えない**。論理/物理分離（`docs/concepts.md`）と GUI editing
  Design Doc の方針に従い、edge への author-defined ID は導入しない
- **ID は決定的に計算で求まる**こと。GUI が click された edge から
  追加情報なしに導出できる必要がある
- **読み手にとって意味が分かる ID**であること。`.krs.style` に書かれた
  selector を見て「どの edge か」が推測できる
- **同じソースから常に同じ ID が出る**こと（ファイルが変更されなければ
  ID も不変）
- **`.krs` のソース順を変えただけで ID が壊れる**ことは避けたい。完全
  耐性は無理だが、よくある操作（ノード追加・別 edge の追加）で他 edge の
  ID が変わる事象は最小化する
- 既存 selector（`edge`、`edge[tag]`）の挙動は壊さない

## 検討した選択肢

### 案A: 単純な `from->to` のみ

```
edge#A->B { ... }
```

- 利点: シンプル。読みやすい
- 欠点: 同一エンドポイント間の複数 edge を区別できない（`A -> B` と
  `A -> B "retry"` が両方ある場合、どちらか指定不能）

→ 単独では却下。**A を base に据えて、衝突時のみ拡張する** 方針へ

### 案B: 出現順 index 必須（`from->to#N`）

すべての edge に強制で 1-based index を付ける。

- 利点: 衝突時に確実に区別できる
- 欠点: ソース順依存が常に表に出る。`A -> B` を 1 本書いただけでも
  `edge#A->B#1` のような不格好な selector になる。読みにくく、あとで
  edge を 1 本追加しただけで `#1` `#2` の対応関係が変わる懸念

→ 却下

### 案C: label を discriminator に使う

label がある edge は `from->to:"label"` で指せる。

```
edge#A->B { ... }                  /* label なしの edge */
edge#A->B:"retry" { ... }          /* label "retry" の edge */
```

- 利点: 著者が書いた label がそのまま読める ID になる。意味が伝わる
- 欠点: label が無い edge どうしの衝突は解けない

→ **採用候補（案D の一部として）**

### 案D: 階段式 — シンプル ID を default に、衝突時のみ disambiguator を足す（採用）

ID 解決アルゴリズム:

1. Base: `<from>-><to>`
2. Base が一意なら → そのまま使う（`edge#A->B`）
3. 重複ありなら、以下を順に試す:
   1. **label** があれば label で区別: `<from>-><to>:"<label>"`
   2. label でも区別不能 / 一部に label が無い → 残りのエッジに **kind**
      で区別: `<from>-->B` のような async 矢印は `<from>-->to`、sync は
      `<from>-><to>` と base 自体を分ける（後述）
   3. それでも残った重複 → **declaration index**: `<from>-><to>#N`

### 案E: 不透明ハッシュ（`from->to@a3f1`）

全 edge に決定的な短ハッシュ（label/tags/kind を入力に SHA1 短縮など）を
当てる。

- 利点: 衝突絶対なし。アルゴリズムが単純
- 欠点: 読めない。`.krs.style` の保守性が下がる。GUI 編集の前提でも、
  人間が編集する余地を残しておきたい

→ 却下

## 比較

| 観点 | A 単純 | B index 必須 | C label のみ | D 階段式 | E ハッシュ |
|---|---|---|---|---|---|
| 一意性 | △（衝突あり） | ◎ | △（label 必要） | ◎ | ◎ |
| 読みやすさ | ◎ | △ | ◎ | ◎ | × |
| ソース順耐性 | ◎ | × | ◎ | ○（衝突時のみ index） | ◎ |
| 著者が手書きできるか | ◎ | × | ○ | ◎ | × |

## 現時点の方針

### Canonical edge ID 規則

1. **Base form**: `<from><arrow><to>`
   - sync edge: `<from>-><to>`
   - async edge: `<from>-->`-> ではなく独立した base にする — 詳細は後述
2. **Tie-break (label)**: 同じ base の edge が複数あり、label の有無や内容で
   区別できれば `<from><arrow><to>:"<label>"` を使う。label 無しは
   `<from><arrow><to>:""`（空文字列）として扱う
3. **Tie-break (occurrence index)**: それでも衝突するなら 1-based の
   宣言出現順 index を末尾に付ける: `<from><arrow><to>#<N>`
4. ID は左から右へ「base → label → index」と必要なだけ伸びる。**衝突がない
   限り index は付かない**

### sync / async の扱い

矢印そのものを ID の一部にする:

- `A -> B`（sync）→ ID base = `A->B`
- `A --> B`（async）→ ID base = `A-->B`

これにより同エンドポイントの sync/async 並存は base レベルで自然に区別できる。

### 文法

```
edge_id_selector := "edge#" base (":" label_string)? ("#" decimal)?
base             := identifier ("->" | "-->") identifier
```

例:

```
edge#A->B               { ... }     /* unique base */
edge#A->B:"retry"       { ... }     /* tie-break by label */
edge#A->B#2             { ... }     /* tie-break by occurrence */
edge#A->B:"retry"#2     { ... }     /* same label appearing twice */
edge#A-->B              { ... }     /* async edge */
```

### Specificity

`edge#<id>` の specificity = `100`（ID 寄与） + `1`（type 寄与） = **101**。
node ID `#<id>` の 100 と type `edge` の 1 を合算した値で、既存仕様
（`docs/spec/style.md`）に整合する。

### モデル / リゾルバ側の変更

1. **`KrsEdge` に派生フィールド `canonicalId: string` を持たせる**
   - パース後の後段で算出（同 base のグループを舐めて tie-break を決める）
   - resolver / GUI の両方が同じ ID を見る
2. **`StyleSelector` に `edgeId?: string` を追加**
   - parser が `edge#...` を読んだとき設定
3. **`edgeSelectorMatches` 拡張**
   - selector に `edgeId` がある場合 `edge.canonicalId === selector.edgeId`
     を要求
4. **specificity 計算**
   - selector に `edgeId` があれば +100

### ID の安定性

- 既存 edge 群の ID が **ソース変更に対してどれだけ強いか** の保証は以下に
  限定する:
  - 「他 edge の追加・削除」では同 base 群以外の ID は変わらない
  - 同 base 群の中でも、**全 edge が unique label** なら label のみで
    解決されるので index 衝突は発生しない
  - 同 base かつ label が衝突する edge を **間に追加** すると、以後の
    occurrence index が 1 ずつズレる
- これは仕様上の限界として明記する。GUI から書かれた `edge#...:#3` が
  突然 `#4` を指すケースがあり得るが、これは設計トレードオフ
- 著者には「衝突を避けたければ label を付ける」という運用ガイドを spec に
  明記する

## アクセプタンステスト観点

実装時の AT 候補:

- `edge#A->B { color: red }` で唯一の `A -> B` だけ赤くなる
- 同 base 複数 edge が異なる label を持つとき、`edge#A->B:"retry"` が
  対象を絞れる
- label が無い同 base 複数 edge に対し、`edge#A->B#1` `edge#A->B#2` が
  期待通り別エッジに当たる
- async edge `A --> B` は `edge#A-->B` で指せ、sync `edge#A->B` とは別物
  として扱われる
- `edge#X->Y` のような存在しない ID は match なし（エラーではなく warning
  程度の扱いを spec で定める）

CI で見える単体テストは AT に含めない。

## 段取り（参考）

実装 PR は本 Design Doc の ADR 化後に出す:

1. `KrsEdge.canonicalId` 算出ロジック（resolver 直前のパス）
2. `StyleSelector.edgeId` 追加 + parser 更新
3. `edgeSelectorMatches` / specificity 更新
4. `docs/spec/style.md` 更新（selector 表、specificity 表、安定性ガイド、例）
5. unit test（id 解決、selector match、specificity）
6. AT を `docs/acceptance/` に追加

## 現時点の方針（再掲）

- canonical edge ID = `<from><arrow><to>` が base、必要なら `:"<label>"`、
  必要なら `#<N>` の階段式
- async は base に矢印を含めて区別
- selector 文法は `edge#<id>` で specificity 101
- ID 計算は parse 後に一度だけ。`KrsEdge` に持たせる
- 安定性は仕様上の限界として明記し、`label` 推奨で運用カバー

## 未解決の問い

なし。以下は実装時の判断に委ねる:

- **存在しない ID を指定したときの挙動**: 静かに無視 / コンソール warning /
  エラー、のどれにするか。spec 上は「無視 + dev ビルド時 warning」が無難
- **ID 計算の段階**: `KrsEdge` 生成直後のパスで足すか、resolver 内で都度
  計算するか。前者を推奨だが性能比較は実装時に
