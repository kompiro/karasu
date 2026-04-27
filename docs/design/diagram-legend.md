# 図の凡例（legend）構文

- **日付**: 2026-04-27
- **ステータス**: 検討中
- **関連**:
  - Issue [#833](https://github.com/kompiro/karasu/issues/833)
  - `docs/spec/syntax.md` — `.krs` ブロック構文
  - `docs/spec/style.md` — `.krs.style` セレクタとプロパティ
  - ADR-20260312-03 — 論理構造と物理構造の分離
  - ADR-20260312-04 — CSS インスパイアのスタイリングシステム
  - ADR-20260322-01 — ビルトインスタイルの一元化と構造化リファレンス

> 本 doc は #875 と #873 の 2 つの design 提案を統合した結果です。
> どちらか一方の表現に依らず両者の優位点を取り込んでいます。

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

レビュー / オンボーディング / 共有時に「この図の色の意味は？」が常に
口頭ベースになる。これを `.krs` で第一級に表現したい。

## ゴール

`.krs` に `legend` ブロックを追加し、**色 → 意味** および
**既存スタイル参照 → 意味** のペアを宣言できるようにする。
レンダラーは対応する凡例 SVG を生成し、エクスポートにそのまま乗せる。

## 制約・前提

- ADR-20260312-04 が定める「`.krs` は論理構造、`.krs.style` は見た目」の
  分離は崩さない。「色 → 意味の対応」は**著者がモデルに込めた意図**として
  論理側（`.krs`）に置く。
- 既存 `.krs` を壊さない（後方互換）。
- 凡例は SVG 出力に組み込まれて見える必要がある。レビューや GitHub での
  プレビュー時にも一緒に見えなければ意味がない。
- core が単体配布される前提（ADR-20260425-01）は維持する。

## v1 のスコープ

| 入る | 入らない（フォローアップ） |
|------|--------------------------|
| トップレベル `legend` ブロック | `system` / `service` / `domain` 内のネスト |
| `<view-scope>?` でビュー指定可（`system` / `deploy` / `org`、省略 = 全ビュー）| 複数ビュー指定（`legend system, deploy "..."`）|
| 同ビュー対象の複数ブロック（宣言順に縦並び） | per-system の凡例（同じ `.krs` で system が複数ある場合の使い分け）|
| `swatch <hex-color> <label>` 行（直書き）| `shape` / `icon` / `pattern` 凡例 |
| `ref @<annotation>` / `ref [<tag>]` / `ref .<class>` / `ref #<id>` / `ref <type>` 行（既存スタイル参照）| クラスから自動生成（v1 は明示宣言のみ）|
| 図の下に独立したフッター帯として描画 | クリックでフィルタなどのインタラクション |
| `legend "Title"` のオプショナルなタイトル | i18n 対応（v1 は素の文字列を SVG にそのまま埋め込む）|

## 提案する構文

### v1 の `.krs` 構文

```krs
# scope 省略 → system / deploy / org すべてに同じ凡例が出る
legend "Owner team" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
  swatch #DC2626 "Third-party"

  ref @deprecated "Deprecated"
  ref [external]  "External system"
}

# deploy 図だけに出す物理層用の凡例
legend deploy "Hosting tier" {
  swatch #0EA5E9 "Cloud Run"
  swatch #F59E0B "On-prem"
}
```

### 文法

```ebnf
legend         ::= "legend" view-scope? string-literal? "{" entry* "}"
view-scope     ::= "system" | "deploy" | "org"
entry          ::= swatch | ref-entry
swatch         ::= "swatch" hex-color string-literal
ref-entry      ::= "ref" ref-selector string-literal
ref-selector   ::= annotation-ref | tag-ref | style-selector
annotation-ref ::= "@" identifier        # 例: @deprecated
tag-ref        ::= "[" identifier "]"    # 例: [external]
style-selector ::= class-selector | id-selector | type-selector
                   (`.foo`, `#foo`, `service` のような既存セレクタ)
hex-color      ::= "#" hex-digit{6} | "#" hex-digit{3}
```

ルール:

- `legend` はトップレベル直下に書く。`system` / `service` / `domain` 内に
  入れた場合は明示的に parse error。
- `<view-scope>` 省略時は全ビュー（system / deploy / org）に出る。
- 同じビューを対象とする `legend` ブロックが複数ある場合、宣言順に縦に
  並べる（複数の凡例を同居させたいユースケースに対応）。
- タイトル文字列はオプション（`legend { … }` も可）。
- 行の順序が描画順序になる（明示的）。

### `swatch` と `ref` の使い分け

- `swatch`: モデル外で人間が決めた色（例: チーム配色を Notion で決めた配色そのまま）。
  色を直接書きたいだけのケース。
- `ref`: 既存の annotation / tag / style class / id / type に紐づく
  意味の説明。スタイルファイルで色を変えたら自動で凡例も追従する。

両方混在可能 — 「チーム色は `swatch`、`@deprecated` は `ref` で凡例化」
が想定する典型ケース。

## 描画戦略

### 配置: 図の下にフッター帯

```
┌─────────────────────────┐
│                         │
│     diagram body        │
│                         │
│                         │
├─────────────────────────┤    ← 区切り線
│ Legend: Owner team      │
│ ▭ Team Backend          │
│ ▭ Team Frontend         │
│ ▭ Third-party           │
│ ▭ Deprecated  (badge)   │
└─────────────────────────┘
```

- 図本体の **下に独立した行** として描画する。図 bbox 自体は変えない。
- viewBox の高さを凡例ぶん拡張する。幅は本体幅に合わせる。
- 行高は凡例エントリ数 × 行高 + パディング。
- 同ビューに複数の `legend` ブロックがある場合は宣言順に縦に積む
  （タイトル付きでセクション化）。
- 必要なら 2-3 列に折り返す（`width / column-width` で列数決定）。

**却下した代替**:

| 案 | 却下理由 |
|----|---------|
| 図 bbox の右下コーナー | 図が成長するとノードと重なるリスク。レイアウト依存。 |
| 別 SVG として返す（呼び出し側が結合）| API が破壊的、CLI/エクスポートで二重管理。|
| HTML オーバーレイ（app 側で描画）| エクスポート SVG 単体で凡例が見えなくなる。 |

> 当初 #875 の提案では右下コーナー固定だったが、bbox 拡張するだけの
> footer 帯のほうが overlap リスクなく純粋。本マージ時に footer に揃えた。

### 全ビューでの描画

scope 省略時は system / deploy / org 各ビューに同じ凡例が、
scope 指定時は該当ビューにのみ凡例が出る。drill-down 後のネストビューにも
出す（SVG 単体で意味が完結することが本機能の動機）。

実装上は `appendLegendFooter()` 共通ヘルパを `svg-builder.ts` に置き、
各 renderer (`svg-renderer.ts` / `deploy-renderer.ts` / `org-renderer.ts`)
の出力 SVG を閉じる直前で呼び出す。呼び出し側で
**そのビューに該当する legend のみフィルタ**してから渡す。

### `.krs.style` の解決と `ref` 参照

`ref @deprecated` の解決:

1. パーサーが `LegendBlock.entries` に
   `{ kind: "ref", target: { kind: "annotation", name: "deprecated" }, label: "Deprecated" }`
   を入れる。
2. レンダラーが `ResolvedStyles`（既存 cascade で specificity / import 順
   解決済み）から該当のスタイル（背景色 / バッジ色 など）を引く。
3. その色を swatch として描画する。

存在しないクラス / annotation / tag を参照したら parser 段階では通し、
resolver 段階で warning（`ref @nonexistent: not found`）を出す。
`.krs.style` を後で書く / 削除するワークフローを邪魔しない。

凡例の色は常に `resolveStyles` の出力を引くので、
**凡例の色 = 図上のノードの色** が保証される。

## 配置の決定: `.krs` か `.krs.style` か

**`.krs` に置く**。

理由: 凡例は「色 → **意味**」の対応を宣言するもので、**意味はモデルに属する**。
`.krs.style` は「色そのもの」を扱う。両者は分離する:

- `.krs.style`: `.team-backend { background: #2563EB }`  ← 色の選択
- `.krs`: `legend { swatch #2563EB "Team Backend" }`     ← 色の意味

`ref @deprecated` 形式は両者を橋渡しする（色は `.krs.style` から、
意味は `.krs` から）。

スタイルファイルを切り替えても凡例は消えず、`.krs` 単独でも
凡例が成立する。

## ラベルの i18n

ラベル文字列は著者が `.krs` に直接書く文言。i18n 適用は **しない**。

理由:
- 著者の語彙そのものが意味の根拠。app の locale で勝手に上書きするのは
  危険（"Third-party" を著者が選んだ意味は翻訳で削れる可能性）。
- 既存の `service` の `name`、`label` プロパティと同じ扱い。
- 多言語凡例が必要な場合は、`.krs` を locale ごとに分けるか
  `legend.ja "..." {}` 構文を後で足せば良い（v1 範囲外）。

`docs/spec/i18n.md` の方針（"ユーザーに見える文字列はデフォルトで i18n"）
の例外。例外条件は `.krs` 著者由来の文言（既存の `name`/`label` と同列）。
i18n.md の例外リストに追記する。

## v1 の最小実装範囲

PR を細かく分割できる粒度で順序を切る:

1. **lexer**: `legend`, `swatch`, `ref` キーワードを追加
   （`packages/core/src/lexer/lexer.ts`）。
2. **AST**: `LegendBlock` / `LegendEntry` 型を追加し、`KrsFile` に
   `legends?: LegendBlock[]` フィールドを生やす
   （`packages/core/src/types/ast.ts`）。
   ```ts
   type LegendBlock = {
     scope?: "system" | "deploy" | "org";
     title?: string;
     entries: LegendEntry[];
   };
   type LegendEntry =
     | { kind: "swatch"; color: string; label: string }
     | { kind: "ref"; target: RefTarget; label: string };
   type RefTarget =
     | { kind: "annotation"; name: string }   // @deprecated
     | { kind: "tag"; name: string }          // [external]
     | { kind: "selector"; selector: StyleSelector };  // .class / #id / type
   ```
3. **parser**: トップレベル `legend` parse を追加
   （`packages/core/src/parser/parser.ts`）。`system` / `service` / `domain`
   内の `legend` は明示的に parse error。
4. **resolver**: `ref` 参照を `ResolvedStyles` と突き合わせ、
   未解決を warning にする。
5. **renderer**: `appendLegendFooter()` ヘルパーを `svg-builder.ts` に追加し、
   各 renderer (system / deploy / org) の出力末尾で scope フィルタ後に
   呼び出す。
6. **examples**: `examples/legend/index.krs` を 1 つ追加して
   アクセプタンステストの基盤に。
7. **spec docs**: `docs/spec/syntax.md` に `legend` 章を追加。
   `docs/spec/i18n.md` の exemption に追記。

各ステップは独立した PR にできる粒度。PR 分割例: lexer+AST → parser → resolver
→ renderer → examples + spec docs。

## アクセプタンステスト（人間確認用 / 自動）

新しい `docs/acceptance/0833-diagram-legend.md` を作成する想定:

| AT | 内容 | 自動 / 手動 |
|----|------|------------|
| AT-0833-1 | `legend` ブロックがパースされ AST に載る | 自動（parser test）|
| AT-0833-2 | `swatch` 行が renderer の出力に色サンプル＋ラベルとして現れる | 自動（renderer test）|
| AT-0833-3 | `ref @deprecated` が `.krs.style` の色で描画される | 自動（renderer test）|
| AT-0833-4 | 存在しないクラス / annotation / tag を `ref` すると warning が出て、凡例エントリは省略される | 自動（resolver test）|
| AT-0833-5 | `viewBox` が凡例ぶん拡張され、ノードと重ならない | 手動（視覚確認）|
| AT-0833-6 | `legend deploy "..." { ... }` は deploy 図にのみ描画され、system / org 図には出ない | 自動（renderer test）|
| AT-0833-7 | scope 省略 + scope 指定の `legend` を併記すると、該当ビュー（例: deploy）に両方が宣言順に縦並びで描画される | 自動 + 手動（視覚確認）|

## 想定インパクト

- パーサ・AST: 追加のみ（既存ノード型に影響なし）
- レンダラー: 共通ヘルパー追加 + 各 renderer の末尾呼び出し（数行）
- VSCode / LSP: `legend` 補完を将来追加できるが v1 では不要（手書きで十分）
- ドキュメント: `docs/spec/syntax.md` に `legend` 章を追加、
  `docs/spec/i18n.md` の exemption に追記

## ADR 化の提案

採用が固まったら ADR に昇格させる。トピック候補: `core-concepts` または
`renderer`。決定事項:

1. `.krs` に `legend` トップレベルブロックを追加し、各ビュー SVG の
   下にフッター帯として描画する。
2. ラベルの i18n は `name`/`label` と同列で著者文言として扱う（exempt）。
3. `.krs.style` 側ではなく `.krs` 側に置く（意味はモデルの一部）。
4. `<view-scope>?` でビュー指定可（v1 から）。

ファイル名候補: `docs/adr/YYYYMMDD-NN-diagram-legend.md`。
