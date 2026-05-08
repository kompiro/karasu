# GUI 編集時に同一 ID rule を in-place 更新する

- **日付**: 2026-05-07
- **ステータス**: 決定済み（[ADR-20260508-01](../adr/20260508-01-gui-style-inplace-update.md) として昇格）
- **関連**:
  - 親 Issue: [#1142](https://github.com/kompiro/karasu/issues/1142) — GUI style editing: update existing ID rule in place
  - 親 ADR（再検討対象）: [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md) — append-only round-trip
  - 前提 ADR: [ADR-20260506-02](../adr/20260506-02-edge-id-selector.md) — `edge#<canonicalId>` selector が安定 ID として確立
  - 関連 ADR: [ADR-20260506-03](../adr/20260506-03-edge-direction-style.md)、[ADR-20260506-06](../adr/20260506-06-krs-style-open-affordance.md)
  - コード: `packages/app/src/lib/append-style-rule.ts`、`packages/core/src/parser/style-parser.ts`、`packages/core/src/types/style.ts`

## 背景・課題

ADR-20260506-01 は GUI 編集を **append-only** と決めた。理由は当時:

- Edge を一意に指す ID が無く、同一要素を 2 度編集したときに「同じ rule
  だ」と判定する手段が無かった（`edge[write]` のような tag selector は
  group を指すので個別更新できない）
- 整形・コメントを保つ AST writer の作り込みが重く、editor との衝突や
  意図しない diff を恐れた

その後、ADR-20260506-02 で `edge#<canonicalId>` セレクタが定義・実装
され、各 edge を一意に指せるようになった（spec: `docs/spec/style.md`、
parser: `packages/core/src/parser/style-parser.ts`、resolver:
`packages/core/src/resolver/canonical-id.ts`）。前提条件のうち「ID が無い」
は解消した。

残った懸念は **「整形・コメントを保てるか」** だが、次に述べる通り MVP
としては許容できる範囲に閉じられる。

### 現状の append-only で起きていること

GUI で edge の direction を `down → up → right` と 3 回切り替えると、
`.krs.style` の末尾に:

```
edge#A->B { direction: down; }
edge#A->B { direction: up; }
edge#A->B { direction: right; }
```

が積まれる。cascade 末尾勝ちのおかげで効果は `right` だけだが:

- 何度も切り替えるとファイルが膨らみ、PR diff が読みにくい
- 「effective な値」がぱっと見で分からない（読み手は最後の rule を探す）
- `Tidy Style` を別途回す前提だが、MVP ではまだ未実装

## 制約・前提

- **GUI が書き込む rule は、現状 ID 形式のみ**（`edge#<canonicalId>` /
  将来的に `#<nodeId>`）。Type/Tag selector は GUI から書かない（ADR-20260506-01）
- **GUI が触るプロパティは限定的**: 現在は `direction` のみ。今後増えても
  `color` / `stroke-width` / `shape` 等の単純 key:value で、複雑な値
  （function 表記・複数値）は当面入らない
- **Style parser は AST を返すが位置情報を持たない**。`StyleRule` は
  `{ selector, properties, specificity, sourceIndex }` のみで、トークン
  オフセット・コメント・空白は失われている。**そのまま再シリアライズすると
  整形・コメントが消える**
- **Style lexer もコメントトークンを保持しない**（lexer の現状実装を確認
  する必要があるが、AST には届いていない）
- **Editor との衝突**: ファイル書き込み後に Monaco がリロードする経路は
  ADR-20260507-XX（editor-external-refresh）で進行中。in-place 更新で行
  位置が動いても、ユーザーがエディタ未編集状態であれば再読込で済む

## 検討した選択肢

### 案1: append のまま据え置き、`Tidy Style` コマンドを先に作る

ADR-20260506-01 の方針を維持。散らかったらユーザーが `Tidy` を打つ。

- 利点:
  - 既存実装そのまま。書き込み側は最も単純
  - `Tidy` は別途必要なので、結局作ることになる
- 欠点:
  - **iterative editing の体験が常に「diff が膨らむ」状態**。Tidy を
    打つまで読みにくく、忘れたまま PR を出すと diff レビュアーに優しく
    ない
  - GUI が「自分で散らかしたものを後から掃除する」設計になり、初学者の
    観察した state と効果がズレる

### 案2: テキストベースの最小限 in-place 更新（採用候補）

書き込み前に `.krs.style` の本文を **文字列レベル** でスキャンし、ターゲット
selector（`edge#<canonicalId>` / `#<nodeId>`）のブロックを最後の出現位置で
探す。見つかれば、そのブロック内で対象プロパティだけ書き換え（無ければ
ブロック末尾に挿入）。見つからなければ従来通り末尾に append。

実装の輪郭:

1. ファイル本文を読む
2. 正規表現または手書きスキャナで `selector\s*\{[^}]*\}` 形式のブロック
   を探す。selector match は厳密に（`edge#A->B` と `edge#A-->B` を取り違
   えない）
3. 対象ブロックが複数あった場合は **最後に出現するもの** を更新（cascade
   末尾勝ちと一致）
4. ブロック内で `property:` を探し、値だけ差し替え。無ければ `; }` の前
   に `property: value;` を挿入
5. 「ブロック内に複数行・コメント・複雑な構造（ネストブレース等）がある」
   などの edge case を検出したら **append にフォールバック** + warn を
   コンソールに出す（編集を blocking にしない）

判定する edge case（fallback 条件）:

- ブロック内に `/* */` または `//` コメントがある
- プロパティ値に `{` `}` や引用符が含まれる（現状 spec では無いが防御的に）
- ブロックが複数行で、property が改行込みで書かれている
- 同一 selector のブロックがファイル中で意図的に複数回宣言されている
  （ユーザーが手で並べた grouping のようなケース）

- 利点:
  - **AST writer を作らない** — テキスト直編集なので整形・コメントを
    壊しにくい（fallback の保守性も高い）
  - GUI 編集の典型ケース（GUI が書いた rule を GUI で更新）はほぼ全て
    cover できる。GUI 自身が書く rule は単純な 1-line ブロックなので
    fallback 条件にほとんど該当しない
  - 失敗時は append に倒れるので「壊さない」を担保
- 欠点:
  - 正規表現/手書きスキャナを保守する必要がある
  - 厳密には CSS パーサと挙動が乖離しうる（ただし fallback で吸収）

### 案3: parser 拡張で位置情報付き AST → AST writer

`StyleRule` に `loc: { startOffset, endOffset, propertyLocs: ... }` を
持たせ、AST 経由で書き換える。コメントもトークン保持して再シリアライズ。

- 利点:
  - 厳密。複雑な値・ネスト・特殊ケースにも追従できる
  - 「同じ AST 表現に対して 1 つの正規形」が保証される
- 欠点:
  - **parser を書き換える必要があり、本筋から外れた実装コストが大きい**。
    現状 parser は `app` だけでなく `core` の resolver でも使われており、
    変更範囲が広い
  - コメント保持・空白保持を厳密にやるとさらに複雑（lexer trivia 設計が
    必要）
  - GUI が書く範囲は単純なので、コストに見合わない

### 案4: GUI が書いた rule に `/* karasu:gui */` マーカーを付ける

GUI が生成する rule 末尾に `/* karasu:gui id=A->B */` のような署名を
打ち、in-place 更新は **このマーカー付きの rule のみ** を対象にする。
ユーザーが手で書いた rule は触らない。

- 利点:
  - 「ユーザー手書き rule を壊す」リスクをゼロにできる
  - 案2 のスキャナをマーカー駆動にすれば実装も単純
- 欠点:
  - `.krs.style` にコメント注釈が増える。読み手のノイズになる
  - マーカー無し（手書き）と GUI 由来の混在が生まれ、説明が必要
  - VCS で merge したときマーカーだけ残る等の小さな事故が発生しうる

### 案5: 案2 + 案4 のハイブリッド（保守的に in-place）

デフォルトは案2、ただし **fallback 判定がより厳しい**:

- 単一行 `selector { prop: value; }` のブロックのみ in-place 対象
- 複数プロパティ・複数行・コメント混在の rule は全て append フォール
  バック
- 「単一行ブロック」は GUI 自身が書いたものに事実上限定されるので、案4
  の安全性を **マーカー無し** で得られる

- 利点:
  - 手書き rule を触らない方針を保ちつつ、マーカーノイズを増やさない
  - 案2 より実装が単純（regex は単一行限定で書ける）
- 欠点:
  - 「複数プロパティ持つ rule を手書きしてから GUI で同じプロパティを
    更新したい」ケースは append になる。ただし GUI が書く `.krs.style`
    の典型像から外れるので影響は小さい

## 比較

| 観点 | 案1 据え置き | 案2 textベース | 案3 AST writer | 案4 マーカー | 案5 単一行限定 |
|---|---|---|---|---|---|
| 整形・コメント保持 | n/a | 中（fallback あり） | 高 | 高 | **高**（対象を絞る） |
| 実装コスト | **最小** | 中 | 高 | 中 | **小〜中** |
| 手書き rule への安全性 | n/a | 中 | 高 | **最高** | **高** |
| ファイル diff の小ささ | 低 | 高 | 高 | 高 | 高 |
| GUI iterative 体験 | × | ○ | ○ | ○ | ○ |
| ユーザー教育コスト | 低（Tidy 必要） | 低 | 低 | 中（マーカー説明） | 低 |

## 現時点の方針（仮）

**案5（単一行限定の in-place 更新 + 複雑ケースは append フォールバック）**
を本命とする。

理由:

- GUI が生成する rule は **必ず** 単一行 `selector { prop: value; }` 形式
  になる（`appendEdgeDirectionRule` の現実装）。よって「GUI が書いたものを
  GUI で更新する」典型ケースは全て in-place 対象に乗る
- 手書き rule（複数行・コメント・複数プロパティ）は触らないので、
  「ユーザーの整形を壊す」リスクが事実上ゼロ
- 案3 の parser 拡張は本筋（GUI 編集の体験改善）から外れるコストが大きい。
  Tidy Style や本格的な round-trip が必要になった段階で改めて検討する
- 案4 のマーカーは `.krs.style` 読者にとってノイズなので避ける。GUI
  生成 rule を「単一行」という構造的特徴で識別すれば十分

### MVP スコープ

1. `appendEdgeDirectionRule` を `upsertEdgeDirectionRule` 相当に書き換え:
   - 既存ファイルから `edge#<canonicalId> { ... }` の **単一行形式**
     ブロック（複数行・コメント無し）を最後に出現する位置で検索
   - 見つかれば property の値だけ差し替え、ファイル全体を書き直す
   - 見つからなければ従来通り末尾に append
2. property merge 規則:
   - 既存 rule に対象 property（`direction`）が **ある** → 値だけ書き換え
   - 既存 rule に対象 property が **無い** → ブロック内の最後に追記
     （`{ color: red; direction: down; }` のように）
   - 別 property の値・順序は保つ
3. 「同じ property を異なる値で更新」は **新値が勝つ**（cascade と整合）
4. 単一行限定の判定は防御的に書く（regex は cautious、判定不能なら append）
5. AT として:
   - 既存 GUI 生成 rule が in-place 更新される（diff = 1 行の値だけ）
   - 手書き複数行 rule に対しては append される（既存挙動を維持）
   - 同一 ID rule が重複している既存ファイルでは「最後の出現」を更新する

### 副次的な扱い

- **node ID rule**（`#<nodeId>`）への展開は同じロジックで動くはずなので、
  本変更で general 化する。GUI 側で node 用の context menu が増える時に
  すぐ使える
- **Tidy Style コマンドは依然必要**: 過去に append された累積を整理する
  ユースケースは残る。本変更は「これからの編集が累積しないようにする」
  予防策で、過去の累積を消すものではない
- **編集 race condition**: ユーザーが Monaco でファイルを開きつつ GUI で
  右クリックした場合、GUI 側書き込みは未保存変更を上書きしうる。これは
  append-only でも同じ問題で、本変更で悪化はしない（editor 側のリロード
  経路は ADR-20260507-XX で別途）

## 確定した方針

レビューで以下を確定した:

- **「単一行」の判定は「1 プロパティ・コメント無し」で OK**: 改行を含んで
  も property 数=1 かつコメント無しなら in-place 対象。`edge#A->B {\n
    direction: down;\n}` のような軽い整形にも追従する。複数プロパティ
  混在やコメント混在は append にフォールバック
- **fallback 時の通知は出さない**: 黙って append する。fallback 自体が
  rule の複雑なケースだけなので、ユーザーはファイルを見れば気付く。
  通知 UI は追加しない（チャトリ・コンポーネント追加を避ける）
- **node ID rule も同時に general 化**: `upsert` ロジックを selector 種別
  非依存にして、node `#<id>` rule にも効かせる。GUI の node メニューが
  追加された時に追加実装が要らないようにする
- **ADR は supersedes**: 新 ADR が accepted、旧 ADR-20260506-01 は
  `status: superseded` + `superseded_by: ADR-NEW`、新 ADR に
  `supersedes: [ADR-20260506-01]`。「action は append ではなく
  conditional in-place」という本質的な方針転換なので、effective から
  旧 ADR を外す
