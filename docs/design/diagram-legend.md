# 図の凡例（legend）構文

- **日付**: 2026-04-27
- **ステータス**: 検討中
- **関連**:
  - Issue [#833](https://github.com/kompiro/karasu/issues/833)
  - `docs/spec/syntax.md` — `.krs` ブロック構文
  - `docs/spec/style.md` — `.krs.style` セレクタとプロパティ
  - ADR-20260312-04 — CSS インスパイアのスタイリングシステム
  - ADR-20260322-01 — ビルトインスタイルの一元化と構造化リファレンス

## 背景・課題

karasu では色や枠の太さでノード・コンテナに意味を持たせるユースケースが
頻出する（例: 赤=外部サービス、緑=チームA所有、青=チームB所有、
点線=非推奨）。しかし**「その色が何を意味するか」を図に書く方法が無い**:

- `.krs` 内のコメントは出力 SVG に出ない → 読み手に伝わらない
- 「Legend」と名付けたダミーノードを置く運用は破綻しやすい
  - レイアウトに巻き込まれる
  - スタイル解決の対象になり、本物のノードと区別できない
  - ビューを切り替えると消える / 別ビューで意味を持たない

レビュー / オンボーディング / 共有時に「この図の色の意味は？」が常に
口頭ベースになる。これを `.krs` で第一級に表現したい。

## 制約・前提

- ADR-20260312-04 が定める「`.krs` は論理構造、`.krs.style` は見た目」の
  分離は崩さない。ただし**「色 → 意味の対応」は論理側の宣言**でもある
  （著者がモデルに込めた意図）と捉える余地もある。論点 D で議論。
- 既存 `.krs` を壊さない（後方互換）。
- 凡例は SVG 出力に組み込まれて見える必要がある。レビューや GitHub での
  プレビュー時にも一緒に見えなければ意味がない。
- core が単体配布される前提（ADR-20260425-01）は維持する。文字列の i18n
  は legend 本体ラベルにも適用される必要がある（論点 G）。

## 検討した選択肢

### 論点 A: 構文の形

#### A-1: トップレベル `legend` ブロック（採用候補）

```krs
legend "Owner team" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
  swatch #DC2626 "Third-party"
}
```

- ブロックは複数書ける（複数の凡例を横並びにできる）
- `swatch <color> <label>` で色とラベルの対を 1 行で宣言
- `legend` の引数はタイトル（省略可）

**Pros**
- 既存の system / deploy / organization と同じトップレベルブロックの
  形に揃う。パーサ拡張も既存パターンの追加で済む。
- 1 ブロックで完結し、可読性が高い。

**Cons**
- 同じ色で別の意味を凡例に出したいときに重複する
  → ユースケースが薄いので無視してよい。

#### A-2: `.krs.style` の `@legend` at-rule

```css
@legend "Owner team" {
  .team-backend  { label: "Team Backend"; }
  .team-frontend { label: "Team Frontend"; }
}
```

- スタイル側に置き、既存セレクタを参照する形

**Pros**
- 「色の意味」は表現側の話なのでスタイル側に置くのが筋という見方。
- DRY: 既存スタイルクラスの `background-color` を直接参照できる。

**Cons**
- 「凡例に何を出すか」はモデルの意図であり、`.krs.style` を切り替えたら
  消える挙動はおかしい。
- セレクタ表記とラベル表記の組み合わせは記法が膨らむ。
- スタイルファイルが optional な karasu の運用で、必須情報を style 側に
  置くと「`.krs.style` を読み込まないと意味が伝わらない」という弱点。

#### A-3: 既存スタイルクラスを `.krs` 内で参照する `legend ref`

```krs
legend "Status" {
  ref .deprecated "Deprecated"
  ref .external   "External system"
}
```

A-1 と組み合わせ可能。`.krs.style` で定義された色を再利用する。

**Pros**
- 凡例と実際のスタイルが乖離しない（DRY）。
- 著者は色を覚えなくてよい。

**Cons**
- スタイルクラスが定義されていない場合のフォールバック挙動が必要。
- `.krs` から `.krs.style` のセレクタを参照する横断依存ができる。

→ **A-1 + A-3 の併用を採用候補**。`swatch <color> <label>` をプリミティブに、
   `ref <selector> <label>` でスタイル参照。共存できる。

### 論点 B: `.krs` か `.krs.style` か

#### B-1: `.krs` に置く（採用候補）

凡例は「著者が伝えたい意味」であり、モデルの一部とみなす。
スタイルファイルが無くても凡例だけは出る。

**Pros**
- スタイルファイル切り替えで凡例が消える事故を避けられる。
- 既存 system / deploy / organization と同じ `.krs` トップレベルに揃う。
- `.krs.style` を読み込まない CLI / 直接 import 用途でも凡例が見える。

**Cons**
- ラベル文言の i18n は app 側の翻訳経路と分離が必要（論点 G）。

#### B-2: `.krs.style` に置く

**Pros**
- 色 → 意味は表現の話なので分離の筋は通る。
- 多言語版スタイルファイルを切り替えれば凡例も切り替わる。

**Cons**
- 上記 B-1 の「Pros」を全部失う。

→ **B-1 を採用**。

### 論点 C: 配置（どこにレンダリングするか）

#### C-1: 各ビューの SVG 内にコーナー固定（採用候補）

system / deploy / organization の各ビューの SVG bbox 内、右下 or 左下に
凡例ボックスを描画。SVG 1 ファイル内で完結するのでエクスポートしても
そのまま付いてくる。

**Pros**
- SVG 単体でも凡例が一緒に出る（GitHub Markdown プレビュー、エクスポート
  資料のいずれでも）。
- export 経路（drawio / PNG / draw.io）で別途プラグを書かなくてよい。

**Cons**
- レイアウトに干渉する。bbox を拡げる必要がある。

#### C-2: ビュー外のセカンドカラム

Preview UI でメインビューの隣に凡例パネルを描画。SVG には含めない。

**Pros**
- メイン図のレイアウトを汚さない。

**Cons**
- エクスポートに含まれない（SVG 単独で意味が完結しない）。
- export pipeline 全部に手を入れる必要がある。

#### C-3: タブ切り替え

凡例だけのタブを別に作る。

**Pros**
- 大きな凡例でも収まる。

**Cons**
- ふだん隠れる。レビューで見落とす。本問題の解決にならない。

→ **C-1 を採用**。レイアウトに干渉する分は、凡例エントリ数で bbox 拡張量を
   素直に計算すれば許容範囲。

### 論点 D: ビューごとに別の凡例にできるか

#### D-1: 単一の `legend` ブロックは全ビューに出る

最初は 1 種類の凡例を全ビューに同じ位置で描く。

**Pros**
- 実装最小。共通の意味（チーム所有とか）はだいたい全ビューで同じ。

**Cons**
- 「deploy では物理層特有の凡例を出したい」「organization では別の凡例」
  という用途が想定される。後出しで構文を拡張すると `.krs` 互換が
  気にしづらい。

#### D-2: `legend <view-scope>? "..." {}` でビュー指定可（採用）

```krs
legend "Owner team" { ... }                # 全ビュー（scope 省略時）
legend system "Owner team" { ... }         # system 図のみ
legend deploy "Hosting tier" { ... }       # deploy 図のみ
legend org "Team responsibilities" { ... } # org 図のみ
```

`<view-scope>` は `system | deploy | org` のいずれか（省略可）。
省略時は全ビューに出る。複数の `legend` ブロックを書ける。

**Pros**
- 「全ビュー共通」の最小ユースケース（scope 省略）はそのまま満たせる。
- 「deploy だけ別」のようなビュー特化が同じ構文の中で表現できる。
- 将来「複数 scope 指定（`legend system, deploy "..."`）」のような拡張も
  自然に乗せられる。

**Cons**
- パーサとレンダラーの dispatch がもう一段増えるが、純粋なフィルタ
  処理なので複雑度は限定的。

→ **D-2 を採用**。デフォルト挙動（scope 省略 → 全ビュー）は D-1 と同じなので
   小規模ユースケースは複雑にならず、ビュー特化が必要な著者にも応える。

### 論点 E: 何を凡例エントリにできるか

v1 の primitive:

| エントリ | 構文例 | 用途 |
|---|---|---|
| 色サンプル | `swatch #2563EB "Team Backend"` | 単純な色 → 意味 |
| スタイル参照 | `ref .deprecated "Deprecated"` | 既存スタイルの再利用 |

**v1 で扱わない（後続）:**
- 形（shape）の凡例（`shape: cylinder` → "Database"）
- 線種（dashed → "Async"）
- アイコンの凡例
- 複合キー（色 + 形）

形・線種は ADR-20260413-02（implicit エッジの sync/async 視覚区別）と
重なるので、ここで先取りせず後続検討。

### 論点 F: タイトルとレイアウト

`legend "Owner team" { ... }` のタイトルは凡例ボックスの上に表示。
タイトル省略時は表示しない。複数ブロックは縦に並べる（横は SVG bbox の
幅次第で調整）。色サンプルは 16x16 px 程度の四角形 + 右にラベル。

### 論点 G: ラベルの i18n

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

## 比較

| 論点 | 採用案 | 理由 |
|---|---|---|
| A 構文 | `legend` ブロック + `swatch` / `ref` プリミティブ | 既存トップレベルブロックの形に揃う |
| B 配置 | `.krs` 内 | 著者の意図はモデル側、style 切替で消えない |
| C レンダリング | 各ビュー SVG 内コーナー | SVG 単独で意味が伝わる、エクスポートに自動で乗る |
| D ビューごと | `legend <view-scope>? "..." {}` でビュー指定可、scope 省略時は全ビュー | デフォルトは全ビュー、必要なら絞れる |
| E エントリ | `swatch` / `ref` のみ | v1 を絞る |
| F レイアウト | タイトル + 縦並び、bbox 拡張 | 既存 layout に重ね描きせず素直に伸ばす |
| G i18n | `.krs` 著者文言として i18n しない | `name`/`label` と同列 |

## 現時点の方針

採用案を組み合わせて以下を実装する。

### 構文（v1）

```ebnf
legend     ::= "legend" view-scope? string-literal? "{" entry* "}"
view-scope ::= "system" | "deploy" | "org"
entry      ::= swatch | ref-entry
swatch     ::= "swatch" hex-color string-literal
ref-entry  ::= "ref" style-selector string-literal
hex-color  ::= "#" hex-digit{6} | "#" hex-digit{3}
style-selector ::= class-selector | id-selector | type-selector
                  (`.foo`, `#foo`, `service` のような既存セレクタ)
```

例:

```krs
# scope 省略 → system / deploy / org すべてに同じ凡例が出る
legend "Owner team" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
  swatch #DC2626 "Third-party"
  ref .deprecated "Deprecated"
}

# deploy 図だけに出す物理層用の凡例
legend deploy "Hosting tier" {
  swatch #0EA5E9 "Cloud Run"
  swatch #F59E0B "On-prem"
}
```

複数の `legend` ブロックが同じビューに該当する場合、宣言順に縦に並べる。

### 実装の骨子（ハイレベル）

1. **AST**: `KrsFile.legends: LegendBlock[]` を追加。
   `LegendBlock { scope?: "system" | "deploy" | "org"; title?: string; entries: LegendEntry[] }`
   `LegendEntry = { kind: "swatch", color: string, label: string }
                | { kind: "ref", selector: StyleSelector, label: string }`
2. **Parser**: トップレベル `legend` キーワードを受理する分岐を `parser.ts`
   に追加。`legend` の直後にオプショナルな view-scope（`system`/`deploy`/`org`
   のいずれか 1 トークン）を受理し、続くものが string literal なら title、
   `{` なら scope+title なし、として分岐。エントリは `swatch` / `ref` の
   サブパーサに分離。
3. **Renderer**: 各 SVG renderer (system / deploy / org) に
   `renderLegend(legends, styles): string` を呼び出す共通ヘルパを追加。
   呼び出し側で **そのビューに該当する legend のみフィルタ**してから渡す
   （scope 省略 = 該当、scope 一致 = 該当）。`ref` エントリの色は
   `resolveStyles` の結果から `selector` を引くことで取得
   （無解決ならスキップ + warning）。
4. **Layout**: SVG bbox を凡例幅・高さ分だけ拡張。配置は右下固定で v1。
5. **AppShell**: 既存 view で渲染するだけなので app 側の変更は無し。
6. **エクスポート**: SVG に組み込まれるので drawio / PNG エクスポート経路
   は無改修で動くはず（要確認）。
7. **Validation / warnings**: `ref` セレクタが解決できない場合 warning。
   `swatch` の color が無効な場合 diagnostic。
8. **i18n**: i18n しない方針なので新規 key は無し。`docs/spec/i18n.md` の
   exemption リストに「`legend` ブロック内のラベル文字列」を追記する。

### 受け入れテスト

`docs/acceptance/833-diagram-legend.md` に以下を記述:

- AT1: `legend` ブロック付き `.krs` を開くと、各ビュー（system/deploy/org）
  右下に凡例が描画される
- AT2: `swatch` の色とラベルがその通りに描画される
- AT3: `ref .deprecated "Deprecated"` がスタイル定義の色で描画される
- AT4: `legend` ブロックを削除するとどのビューにも凡例が出ない
- AT5: SVG エクスポートに凡例が含まれる
- AT6: `legend deploy "..." { ... }` は deploy 図にのみ描画され、
  system / org 図には出ない
- AT7: scope 省略の `legend` と scope 指定の `legend` を併記すると、
  該当ビュー（例: deploy）には両方が宣言順に縦並びで描画される

### 段階的な実装順

PR を 3 つに分割する想定:

1. **PR1 (parser + AST)**: `legend` 構文のパーサと AST、構文単体テスト。
   レンダリングはまだしない。
2. **PR2 (renderer)**: `renderLegend` を core renderer に組み込み、
   各ビューで描画。AT1〜AT5 を達成。
3. **PR3 (spec docs)**: `docs/spec/syntax.md` に `legend` 節を追加。
   `docs/spec/i18n.md` の exemption に追記。サンプル `examples/legend/`
   を追加。

## 未解決の問い

- ~~**Q1**: 凡例は drill-down 後（ネストされたビュー）でも出すべきか？~~
  **解決**: 全ビュー（drill-down 含む）に出す。SVG 単体で意味が完結する
  ことが本機能の動機なので、深いビューを単独 export しても凡例が落ちない
  ことを優先する。レイアウト圧迫が実問題化したら scope や `top-level-only`
  のような修飾子を後続で検討する。
- ~~**Q2**: `ref` の selector 解決順は最初の一致でよいか、それとも
  CSS specificity に従うか？~~
  **解決**: `resolveStyles` の出力（既存 cascade で解決済みのスタイル）を
  引く。凡例の色と図上のノードの色が常に一致する。
- **Q3**: 凡例ボックスのデフォルト位置（右下 vs 左下 vs 上）は？
  → v1 は右下固定とし、設定可能化は後続 Issue で。

## ADR 化の提案

採用が固まったら ADR に昇格させる。トピック候補: `core-concepts` または
`renderer`。決定事項は「`.krs` に `legend` トップレベルブロックを追加し、
各ビュー SVG の右下に描画する」「ラベルの i18n は `name`/`label` と同列
で著者文言として扱う」「`.krs.style` 側ではなく `.krs` 側に置く」の 3 点。

ファイル名候補: `docs/adr/YYYYMMDD-NN-diagram-legend.md`。
