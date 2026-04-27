# Diagram legend syntax

- **日付**: 2026-04-27
- **ステータス**: 検討中
- **関連**:
  - Issue [#833](https://github.com/kompiro/karasu/issues/833) — feat: legend syntax for diagrams (color/meaning pairs)
  - `docs/spec/syntax.md` — `.krs` block syntax
  - `docs/spec/style.md` — `.krs.style` selector / property reference
  - ADR-20260312-03 — 論理構造と物理構造の分離（命名・配置の指針）

## 背景・課題

karasu の図では色やバッジで意味を符号化することが多い:

- 赤いコンテナ = サードパーティ
- 緑 = チーム A 所有 / 青 = チーム B 所有
- `@deprecated` バッジ = 廃止予定
- `[external]` タグ = 外部システム

しかし「**色やバッジが何を意味するか**」を `.krs` 内で宣言する一級表現が無い。
今は次のどちらかで誤魔化している:

1. `.krs` のコメントブロックに書く（SVG には載らない）。
2. `service Legend { ... }` のようなダミーノードを置く（モデルが汚れる、レイアウトを崩す）。

結果として、初見の読み手は何の色が何を表すのか推測するしかなく、
レビュアーも「作者の意図した対応関係」を確かめられない。

## ゴール

`.krs` に `legend` ブロックを追加し、**色 → 意味** および **既存スタイル参照 → 意味**
のペアを宣言できるようにする。レンダラーは対応する凡例 SVG を生成する。

## v1 のスコープ

| 入る | 入らない（フォローアップ） |
|------|--------------------------|
| `system` ブロック内に書く `legend` ブロック（v2 で `deploy` / `organization` に展開）| トップレベル直下 / 複数ブロック |
| **system view のみ凡例を描画**（deploy / org view では未表示） | deploy view / org view への描画 |
| `swatch "<color>" "<label>"` 行（直書き）| `shape` / `icon` / `pattern` 凡例 |
| `ref @<annotation>` / `ref [<tag>]` / `ref .<class>` 行（既存スタイル参照）| クラスから自動生成（v1 は明示宣言のみ）|
| 図の右下フッターとして埋め込む | クリックでフィルタなどのインタラクション |
| `legend "Title"` のオプショナルなタイトル | i18n 対応（v1 は素の文字列をそのまま埋め込む）|

## 提案する構文

### v1 の `.krs` 構文

```krs
system ECPlatform {
  label "EC Platform"

  legend "Owner team" {
    swatch "#2563EB" "Team Backend"
    swatch "#16A34A" "Team Frontend"
    swatch "#DC2626" "Third-party"

    ref @deprecated "Deprecated"
    ref [external]  "External system"
  }

  service ECommerce { … }
  service Payment   { … }
}
```

- **`system` ブロック内に置く**（v1）。1 つの system に対して `legend` は最大 1 つ。
  トップレベル直下や `service` / `domain` 内には書けない。
- v1 では **system view にのみ** 凡例フッターが描画される。
  Deploy / Org view では `legend` ブロックは無視される（warning も出さない）。
  v2 で `deploy { legend { … } }` / `organization { legend { … } }` の同形を解禁する想定。
- タイトル文字列はオプション（`legend { … }` も可）。
- 行の順序が描画順序になる（明示的）。
- `swatch "<#hex>"` は色を直接指定。
- `ref @deprecated` / `ref [tag]` / `ref .class` は **`.krs.style` の解決済み色** を参照する。
  v1 は背景色 / バッジ色を凡例の swatch として使う。

### 構文の選択

**「`system` ブロック内に置く（v1 は system view のみ描画）」を選んだ理由**:

| 案 | メリット | 却下理由 |
|----|----------|---------|
| **`system { legend { … } }`（採用）**| 「この system 図に付随する凡例」として scope が明確。後で `deploy { legend { … } }` を同じ形で解禁できる（v2 拡張性）| 1 ファイル多 system のとき凡例を共有したい場合に重複が必要（v1 では妥協）|
| トップレベル `legend { … }` 1 ブロック共有 | 書き手の負担が軽い | per-view 拡張のときに「どの view に出すか」のルールが追加で必要、v1 では曖昧化 |
| per-view 専用キーワード（`legend system { … }` をトップレベルに）| 完全な per-view | v1 でいきなり 2 階層フラット構文を入れるのは過剰、karasu の他のブロックと違う形になる |
| `.krs.style` 内の `legend { … }` セクション | スタイル定義との近接 | 「凡例＝意味の宣言」は **モデルの一部** で、見た目だけではない |

### `swatch` と `ref` の使い分け

- `swatch`: モデル外で人間が決めた色（例: チーム配色を Notion で決めた配色そのまま）。
  色を直接書きたいだけのケース。
- `ref`: 既存の annotation / tag / style class に紐づく意味の説明。
  スタイルファイルで色を変えたら自動で凡例も追従する。

両方混在可能 — 「チーム色は `swatch`、`@deprecated` は `ref` で凡例化」が想定する典型ケース。

## 描画戦略

### 配置: 図の右下フッター

```
┌─────────────────────────┐
│                         │
│     diagram body        │
│                         │
│                         │
├─────────────────────────┤
│ ▭ Team Backend          │
│ ▭ Team Frontend  Legend │
│ ▭ Third-party           │
└─────────────────────────┘
```

- 図本体の **下に独立した行** として描画する。図 bbox を変えない。
- 行高は凡例エントリ数 × 行高 + パディング。
- `viewBox` を凡例の高さぶん広げる。
- 左揃えで、必要なら 2-3 列に折り返す（`width / column-width` で列数決定）。

**却下した代替**:

| 案 | 却下理由 |
|----|---------|
| 図 bbox の角に重ねる | レイアウトに依存、ノードと重なるリスク |
| 別 SVG として返す（呼び出し側が結合）| API が破壊的、CLI/エクスポートで二重管理 |
| HTML オーバーレイ（app 側で描画）| エクスポート SVG 単体で凡例が見えなくなる |

### v1 は system view にのみ適用

v1 では **system view** （`svg-renderer.ts` の `render()` から到達する経路）
だけが凡例フッターを描画する。Deploy / Org view は `legend` ブロックを
読み飛ばす（warning も出さない）。

実装上は共通ヘルパー `appendLegendFooter()` を `svg-builder.ts` に置き、
`svg-renderer.ts` の出力 SVG を閉じる直前で呼び出す。
v2 で deploy / org も対応するときは、それぞれの renderer で
`deploy { legend { … } }` / `organization { legend { … } }` を読み、
同じヘルパーを呼び足すだけで済む（API は変えない）。

### `.krs.style` の解決と `ref` 参照

`ref @deprecated` の解決:

1. パーサーが `LegendBlock.entries` に `{ kind: "ref", target: "@deprecated", label: "Deprecated" }` を入れる。
2. レンダラーが `ResolvedStyles` から `@deprecated` クラスの色（badge color or background color）を引く。
3. その色を swatch として描画する。

存在しないクラスを参照したら parser 段階では通し、resolver 段階で warning
（`ref @nonexistent: class not found`）を出す。`.krs.style` を後で書く / 削除する
ワークフローを邪魔しない。

## 配置の決定: `.krs` か `.krs.style` か

**`.krs` に置く**。

理由: 凡例は「色 → **意味**」の対応を宣言するもので、**意味はモデルに属する**。
`.krs.style` は「色そのもの」を扱う。両者は分離する:

- `.krs.style`: `.team-backend { background: #2563EB }`  ← 色の選択
- `.krs`: `legend { swatch "#2563EB" "Team Backend" }` ← 色の意味

`ref @deprecated` 形式は両者を橋渡しする（色は `.krs.style` から、
意味は `.krs` から）。

## v1 の最小実装範囲

順序:

1. **lexer**: `legend`, `swatch`, `ref` キーワードを追加（`packages/core/src/lexer/lexer.ts`）。
2. **AST**: `LegendBlock` / `LegendEntry` 型を追加し、`SystemNode` に
   `legend?: LegendBlock` フィールドを生やす（`packages/core/src/types/ast.ts`）。
3. **parser**: `system` ブロック内の `legend` parse を追加
   （`packages/core/src/parser/parser.ts`）。トップレベル / `service` / `domain` 内の
   `legend` は明示的に parse error にする。同じ system 内に `legend` が複数あれば最後勝ち + warning。
4. **resolver**: `ref` 参照を resolved styles と突き合わせ、未解決を warning に。
5. **renderer**: `appendLegendFooter()` ヘルパーを `svg-builder.ts` に追加し、
   `svg-renderer.ts` の system view 出力からのみ呼ぶ。Deploy / Org renderer は触らない。
6. **examples**: `examples/legend/index.krs` を 1 つ追加してアクセプタンステストの基盤に。

各ステップは独立した PR にできる粒度に分けられる（lexer+parser+AST、renderer、examples+AT を分けるのが自然）。

## アクセプタンステスト（人間確認用 / 自動）

新しい `docs/acceptance/0065-diagram-legend.md` を作成する想定:

| AT | 内容 | 自動 / 手動 |
|----|------|------------|
| AT-0065-1 | `legend` ブロックがパースされ AST に載る | 自動（parser test）|
| AT-0065-2 | `swatch` 行が renderer の出力に色サンプル＋ラベルとして現れる | 自動（renderer test）|
| AT-0065-3 | `ref @deprecated` が `.krs.style` の色で描画される | 自動（renderer test）|
| AT-0065-4 | 存在しないクラスを `ref` すると warning が出て、凡例エントリは省略される | 自動（resolver test）|
| AT-0065-5 | `viewBox` が凡例ぶん拡張され、ノードと重ならない | 手動（視覚確認）|
| AT-0065-6 | system view でフッター描画。Deploy / Org view では `legend` ブロックがあっても描画されない（v1 の合意動作） | 手動 + e2e |

## 決定事項（Issue #833 の open question を解消）

| Q | 決定 | 補足 |
|---|------|------|
| **Q1**. v1 のスコープ | **system view のみ**。Deploy / Org view では描画しない | 構文上は `system { legend { … } }` のため、後で deploy / org に同形で展開できる |
| **Q2**. `shape` / `icon` 凡例 | **入れない**（v1）| `swatch` は将来 `swatch [shape=rect] "#…" "label"` のように拡張する余地を残す |
| **Q3**. タイトル i18n | **入れない**（v1）| 作者の入れた素の文字列を SVG にそのまま埋め込む |
| **Q4**. 配置スコープ | **`system` ブロック内のみ**（v1）| 将来 `deploy { legend { … } }` / `organization { legend { … } }` を解禁する想定 |

## フォローアップ（v1 の後）

- `deploy { legend { … } }` / `organization { legend { … } }` の解禁（v2 のメイン）
- shape / icon / pattern バリアント
- 凡例タイトル / ラベルの i18n キー対応
- 自動凡例生成（用いられている annotation / tag を集める）
- インタラクティブ凡例（クリックで該当ノードをハイライト等）

## 想定インパクト

- パーサ・AST: 追加のみ（既存ノード型に影響なし）
- レンダラー: 共通ヘルパー追加 + 各 renderer の末尾呼び出し（数行）
- VSCode / LSP: `legend` 補完を将来追加できるが v1 では不要（手書きで十分）
- ドキュメント: `docs/spec/syntax.md` に `legend` 章を追加
