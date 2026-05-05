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

### 案F: 著者が `.krs` で edge に任意の ID を付与（採用候補・併用）

`.krs` の edge 宣言にオプションで ID を書けるようにする:

```
ECommerce -> Payment "Process payment" #criticalWrite
WebApp --> Bff "events" #liveStream
```

`.krs.style` 側では既存の `edge#<id>` selector でそのまま指せる:

```
edge#criticalWrite { direction: down }
```

#### 案 D（computed canonical ID）と何が違うか

- D: ソースから機械的に算出。著者は何も書かなくてよい
- F: 著者が **任意に** 付ける。書いた edge は安定 ID を持つ

両者は **対立せず両立** する:

- 何も書かれていない edge → 案 D の computed ID で addressable
- `#myId` が書かれている edge → その ID が canonical ID として優先される

#### 利点

- **完全な安定性**: ソースを並べ替えても ID が壊れない
- **読みやすさ**: `edge#criticalWrite` は意味で読める
- **合成 edge の安定指定にも拡張可能**:
  ```
  usecase PlaceOrder {
    resource OrderDB.OrderTable #placeOrderWrite { operations create, read }
  }
  ```
  のように `resource` 行に `#id` を許せば、合成 edge にも著者命名 ID を当てられる
- **opt-in なので既存の `.krs` を一切壊さない**

#### 懸念と反論

- 「`.krs` には presentation を書かない」原則との関係:
  - **edge に名前を付けるのは presentation ではなく logical model の話**。node が ID を持つのと同じ筋。「この edge は重要なので名前を持つ」という著者の意図は logical
  - 一方で「direction」「color」は presentation なので `.krs.style` 側に残す
  - 役割分担: `.krs` は **どの edge かを名指す手段**を提供、`.krs.style` は **どう描くか** を決める
- 文法を増やすコスト:
  - opt-in なので「書きたい人だけ書く」運用。spec 上は 1 行で済む
  - GUI editing（#1076）の文脈でも「per-edge override が頻発する edge には ID を付けると安定する」というガイドに繋げられる
- 合成 edge への ID 付与:
  - usecase の resource 行に `#id` を許す案は本設計の範囲としつつ、aggregated service edge への命名は別議論にする（合成パスが複雑なため）

→ **採用候補**。後述の比較で D と F を併用する形に集約

### 案E: 不透明ハッシュ（`from->to@a3f1`）

全 edge に決定的な短ハッシュ（label/tags/kind を入力に SHA1 短縮など）を
当てる。

- 利点: 衝突絶対なし。アルゴリズムが単純
- 欠点: 読めない。`.krs.style` の保守性が下がる。GUI 編集の前提でも、
  人間が編集する余地を残しておきたい

→ 却下

## 比較

| 観点 | A 単純 | B index 必須 | C label のみ | D 階段式 | E ハッシュ | F 著者 ID |
|---|---|---|---|---|---|---|
| 一意性 | △（衝突あり） | ◎ | △（label 必要） | ◎ | ◎ | ◎（書けば） |
| 読みやすさ | ◎ | △ | ◎ | ◎ | × | ◎ |
| ソース順耐性 | ◎ | × | ◎ | ○（衝突時のみ index） | ◎ | ◎ |
| 著者が手書きできるか | ◎ | × | ○ | ◎ | × | ◎ |
| `.krs` 文法追加 | 無 | 無 | 無 | 無 | 無 | 有（opt-in） |
| 合成 edge への適用 | 自動 | 自動 | 自動 | 自動 | 自動 | usecase 経由なら可能 |

karasu の合成 edge は構造的に一意（usecase→resource は Map key、
aggregated service→service は (pair, kind) でグループ化）なので、
**A の base のみで実用上ほぼ衝突しない**。残った稀な衝突は **F の著者 ID
で明示的に解く**形にすれば、tie-break ladder（B / C / D）の複雑さを
丸ごと回避できる。E は読めないので不採用。

⇒ **A + F の組合せ** を採用する。

## 現時点の方針

**シンプルな base ID + 衝突時のみ著者 ID 必須**を採用する。

### Canonical edge ID 規則

ID は以下の優先順で決める:

1. **著者が `#<id>` を書いていれば、それが canonical ID**
2. それ以外は **base form**: `<from><arrow><to>`
   - sync edge: `<from>-><to>`
   - async edge: `<from>-->`-> ではなく独立した base にする
3. base 同士で衝突した場合、**それらの edge は per-edge selector で
   addressable にならない**（著者が `#<id>` を付けるまで）
   - 著者が `#<id>` を付けたエッジ → そのエッジは ID で指せる
   - `#<id>` が付いていない衝突 edge → `edge#<base>` の selector は
     どれにも match しない（曖昧解決を勝手にしない）。`pnpm` で
     dev warning を出して著者に明示的命名を促す

### なぜ tie-break ladder（label / index）を持たないか

- karasu の合成 edge は **構造的に一意**:
  - usecase→resource: `(usecase.id, resource.id)` で Map 化されるため重複不可
  - aggregated service→service: `(service pair, kind)` でグループ化される
- 通常 edge での衝突は同じ pair に複数本書く稀ケースのみ
- 機械的 tie-break（label・occurrence index）は:
  - ソース変更で ID が drift する fragility を抱える
  - spec が複雑になる
  - GUI editing から書き戻したルールが「いつの間にか別の edge を指す」事故を生む
- ⇒ **衝突したら著者に名前を要求** が筋。曖昧推測しない

### 著者 ID の文法

`.krs` の edge 宣言と usecase の resource 行で `#<id>` をオプション指定可能:

```
# 通常 edge
ECommerce -> Payment "Process payment" #criticalWrite
WebApp --> Bff "events" #liveStream

# 合成 edge（usecase->resource）
usecase PlaceOrder {
  resource OrderDB.OrderTable #placeOrderWrite {
    operations create, read
  }
}
```

ID は同一プロジェクト内で一意。重複は parser エラー。文字種は node ID と
同じ規則に揃える（`docs/spec/syntax.md` の identifier 規則）。

aggregated service→service 暗黙 edge への著者 ID 付与は **本設計のスコープ外**。
合成のタイミングが view 抽出後でユーザーから直接見えにくいため、必要なら
別 Issue で扱う。

### sync / async の扱い

矢印そのものを ID の一部にする:

- `A -> B`（sync）→ ID base = `A->B`
- `A --> B`（async）→ ID base = `A-->B`

これにより同エンドポイントの sync/async 並存は base レベルで自然に区別できる。

### 文法

```
edge_id_selector := "edge#" id_form
id_form          := author_id | base
author_id        := identifier
base             := identifier ("->" | "-->") identifier
```

例:

```
edge#A->B            { ... }     /* base ID（衝突なし） */
edge#A-->B           { ... }     /* async edge の base ID */
edge#criticalWrite   { ... }     /* 著者 ID */
```

### Specificity

`edge#<id>` の specificity = `100`（ID 寄与） + `1`（type 寄与） = **101**。
node ID `#<id>` の 100 と type `edge` の 1 を合算した値で、既存仕様
（`docs/spec/style.md`）に整合する。

### モデル / リゾルバ側の変更

1. **`KrsEdge` に `authorId?: string` と派生 `canonicalId: string` を持たせる**
   - `authorId` は parser が `#<id>` を読んだら設定
   - `canonicalId` はパース後の後段で算出: `authorId` があればそれ、無ければ
     computed 規則で算出
   - resolver / GUI の両方が同じ `canonicalId` を見る
2. **`.krs` パーサに edge ID 構文を追加**
   - edge 宣言: `from -> to "label" #id` の `#id` は label の後に置く
     （label 無しでも可: `from -> to #id`）
   - resource 行: `resource <ref> #id { operations ... }`
   - 重複検出（同名の `#id` が複数ある場合のエラー診断）
3. **`StyleSelector` に `edgeId?: string` を追加**
   - parser が `edge#...` を読んだとき設定
4. **`edgeSelectorMatches` 拡張**
   - selector に `edgeId` がある場合 `edge.canonicalId === selector.edgeId`
     を要求
5. **specificity 計算**
   - selector に `edgeId` があれば +100

### ID の安定性

- **base ID は構造変化に強い**: `from`/`to`/矢印のいずれかが変わらない
  限り ID は不変。他 edge の追加・削除・並び替えに影響されない
- **著者 ID はさらに強い**: ソース内の名前が変わらない限り永続
- **衝突が起きた瞬間に base ID が無効化される**: それまで一意だった base
  に 2 本目を生やすと、両方とも `edge#<base>` で指せなくなる。これは
  silent breakage を避ける設計判断（曖昧解決しない）
  - GUI editing から見ると「著者が `.krs` で衝突を作った瞬間にスタイル
    が外れた」ように見える。warning でユーザーに通知する
- **合成 edge への著者 ID 付与で安定化できる**: usecase の `resource` 行に
  `#<id>` を書けば、`operations` の write/read 切替や resource ref 変更で
  も override が追従する

## 暗黙的に合成される edge の扱い

karasu は `.krs` の `->` トークン由来の edge 以外にも、view 抽出段階で
**合成される edge** がある:

1. **usecase → resource**（`view-extract.ts:51,63`）— `(usecase.id,
   resource.id)` で Map 化されるため**構造的に一意**。同じペアの再宣言は
   last wins
2. **service → service の暗黙 edge**（aggregated）— `(service pair, kind)`
   でグループ化される。base + 矢印（`->` / `-->`）で一意

両者とも本設計の base ID 規則 `<from><arrow><to>` だけで衝突なく一意に
addressable になる。tie-break 装置は不要。

### 推奨運用（spec に書く）

- 「W / R 分類で見た目を変えたい」用途は **`edge[write]` / `edge[read]`
  タグ selector を優先**。`edge#<id>` は per-edge の純粋な override 用
- usecase→resource 合成 edge への安定 override が必要なら、`resource` 行に
  著者 ID を付けて `edge#myId` で指す:
  ```
  resource OrderDB.OrderTable #placeOrderWrite { operations create, read }
  ```
- aggregated service→service 暗黙 edge への per-edge override が頻発する
  なら、それは `.krs` の logical model 側で表現できていないサイン — ADR
  レベルで再検討する

## アクセプタンステスト観点

実装時の AT 候補:

- `edge#A->B { color: red }` で唯一の `A -> B` だけ赤くなる
- async edge `A --> B` は `edge#A-->B` で指せ、sync `edge#A->B` とは別物
  として扱われる
- `A -> B` を 2 本書いた状態で `edge#A->B { ... }` を書くと warning が
  出て、いずれの edge にも適用されない（曖昧解決しない）
- 著者が `A -> B #foo` と `A -> B #bar` のように `#<id>` を付与すると
  `edge#foo` `edge#bar` でそれぞれ別 edge を指せる
- usecase 内 `resource OrderDB.OrderTable #placeOrderWrite { ... }` を
  書くと、合成 edge が `edge#placeOrderWrite` で addressable になる
- `edge#X->Y` のような存在しない ID は match なし（warning 程度の扱い）

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

- 案 A（base only computed ID）と 案 F（著者 ID）の **併用**
- 著者 ID が書かれていれば優先、なければ `<from><arrow><to>` の base
- 衝突したら自動 tie-break しない — 著者が `#<id>` を付けて解決する
- async は base に矢印を含めて区別（`->` vs `-->`）
- selector 文法は `edge#<id>` で specificity 101（著者 ID / base ID
  どちらも同じ specificity）
- ID 計算は parse 後に一度だけ。`KrsEdge.canonicalId` に持たせる
- 衝突は warning で著者に明示的命名を促す

## 未解決の問い

なし。以下は実装時の判断に委ねる:

- **存在しない ID を指定したときの挙動**: 静かに無視 / コンソール warning /
  エラー、のどれにするか。spec 上は「無視 + dev ビルド時 warning」が無難
- **ID 計算の段階**: `KrsEdge` 生成直後のパスで足すか、resolver 内で都度
  計算するか。前者を推奨だが性能比較は実装時に
