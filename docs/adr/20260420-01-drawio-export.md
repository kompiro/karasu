# ADR-20260420-01: draw.io (mxGraph XML) Export — a Layout Escape Hatch

- **日付**: 2026-04-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #649, PR #704（Design Doc）, PR #709（実装）
  - Follow-up: Issue #717（app 側での利用）
  - 前提: #645（non-goals）, [`docs/concepts.md`](../concepts.md)
  - 旧 Design Doc（本 ADR に昇格して削除）: `docs/design/drawio-export.md`

## 背景

karasu は「テキストファースト」を貫くため、**自動レイアウト最適化を非目標**（#645）に置いている。しかし、プレゼン資料や外部配布ドキュメントでピクセル単位の微調整をしたい場面は実在し、従来は SVG を書き出してベクタツールで編集する以外に手段がなかった。ノード/エッジの多い図ではこの回避策は非現実的である。

**draw.io (diagrams.net) への一方向エクスポート**は、karasu が構造モデルと初期レイアウトを提供し、仕上げを draw.io に任せる「逃げ道」を作る。この方針は非目標を**補強**する — karasu はテキストファーストのモデリングに集中し、レイアウト整形は専用ツールに委ねる。

## 決定

`@karasu-tools/core` に draw.io エクスポーターを追加し、CLI から `karasu render <file> --format drawio` で利用できるようにする。以下の設計判断を採用する。

### 1. mxGraph XML を LayoutResult から直接生成する（SVG 経由ではない）

SVG → mxGraph の変換ではなく、karasu 内部の `LayoutResult` から直接 mxGraph XML を生成する。SVG と draw.io は同じ `LayoutResult` を消費する姉妹パスとなる:

```
.krs → Parser → KrsFile (AST)
  └─ extractView / extractDeployView → ViewSlice
       └─ layout() / layoutDeploy() → LayoutResult { nodes, containers, edges }
            ├── SVG path:    svg-renderer   → <svg>
            └── drawio path: drawio-exporter → <mxfile>
```

理由:

- SVG は視覚表現に最適化された形式で、意味的情報（どのノードがどのサービスに属するか等）が失われている。コンテナのネスト構造を再構築するコストが大きい
- draw.io の `mxCell` は `parent` 属性でネスト構造を表現するため、karasu の container/node ツリーを直接マッピングできる
- SVG パーサを通すと二重変換になりロスが増える

### 2. マルチページ `.drawio` を既定出力とする

karasu の各 view を draw.io のページ（タブ）として束ねる。ページ構成:

- `system` — 全 system をトップレベルで束ねた view
- `system:<path>` — system / service / domain / usecase のドリルダウン view（子を持つコンテナ種のみ）。例: `system:ECPlatform.Checkout.Order`
- `deploy` — 物理配置 view
- `org` — 組織 view。`organization` が複数あれば `org:<id>` で分割

`--view system | deploy | org` で 1 family に絞れる。`mxfile > diagram` 複数要素はネイティブ機能なので追加コストはない。

### 3. org view 用レイアウトは drawio 専用に新設する

org view は SVG 側で独自パイプライン（`org-renderer.ts`）を持ち、`LayoutResult` を介さない。これを切り出して共有するより、drawio 用の簡易ツリーレイアウト（`exporter/drawio/org-layout.ts`）をコピーする方が小さく済む。team を入れ子コンテナ、member を中のノードとして配置する実装。

### 4. kind / tags / annotations を視覚化する

ノード種別が draw.io 上で一目で判別できるように、次の 3 段構えで表示する:

- **UML 風ステレオタイプ**: ラベル上部に `«service»` / `«domain»` / `«user»` などを小さな灰文字で表示
- **kind 別の shape / 色**:
  - `user` → UML アクター、`usecase` → 楕円、`resource` → document、`database` / `table` / `bucket` / `storage` → cylinder、`queue` → flowchart delay
  - 残りの kind（system / service / domain / deploy kind 群）は角丸長方形 + kind 別 fill/stroke で差別化
- **アノテーション・タグのバッジ**: 全 annotation を `@name`（オレンジ）、全 tag を `#name`（青）でラベル上に表示。スタイル未定義のカスタム annotation も見える

annotation によるスタイル上書き（`@external` 灰色破線 / `@deprecated` 赤枠斜体 / `@migration_target` オレンジ）は kind スタイルより後に適用する。

### 5. karasu のメタデータをカスタム属性として保持する

各 `mxCell` に `data-karasu-id` / `data-karasu-kind` / `data-karasu-tags` / `data-karasu-annotations` を付与。将来 round-trip やツール連携を検討する余地を残す（本 ADR では round-trip は非目標）。

### 6. XML 生成は手書き

軽量な XML ビルダー（`exporter/drawio/mxgraph-builder.ts`）を内製する。node 向けの `mxgraph` 系 npm パッケージはブラウザ前提で重く、draw.io のスキーマは十分小さい。

## 却下した案

### 案A: SVG を経由して mxGraph に変換する

すでに生成された SVG を解析して mxGraph に詰め替える案。既存 SVG レンダラーの出力をそのまま使えるが、コンテナのネスト / service 所属 / annotation などの意味的情報が SVG に保存されておらず、再抽出のコストが高い。結局 `LayoutResult` に戻る必要があるため採用せず。

### 案B: 1 view = 1 ファイル（SVG と同一粒度）

`--view <type>` を必須として、1 呼び出し = 1 `.drawio` を出力する案。実装は単純だがユーザーが複数ファイルを手で束ねる必要がある。draw.io がマルチページをネイティブサポートしているため、既定でバンドルする方を採用。

### 案C: 外部 mxGraph / maxGraph ライブラリを利用する

`mxgraph` 系 npm パッケージはブラウザ前提のものが多く、node の CLI から呼ぶには依存が重い。XML スキーマは手書きジェネレータで十分小さいため採用せず。

### 案D: Round-trip（draw.io で編集した結果を `.krs` に戻す）

`.krs` は唯一の真実源であるべき。両方向サポートは抽象レイヤーの違反と編集衝突を招く。スタイル・位置の変更のみ取り込むような限定案も、非目標に対する抜け道になるため採用せず。

## mxGraph XML 参考情報

`.drawio` の中身は **mxGraph XML** フォーマット。`mxGraph` は JGraph Ltd（draw.io / diagrams.net の作者）が作った JavaScript ダイアグラムライブラリ起源のスキーマで、本体ライブラリは 2020 年にアーカイブ済み、fork の [maxGraph](https://github.com/maxGraph/maxGraph) に引き継がれている（スキーマはほぼ互換）。

実用上の消費者はほぼ draw.io エコシステム一強:

- draw.io Desktop / diagrams.net Web
- VS Code `Draw.io Integration` 拡張
- Confluence / Jira / Notion / GitBook の draw.io プラグイン / 埋め込み
- IntelliJ `Diagrams.net` plugin

他ツール（Lucidchart / Visio）への互換性は限定的。将来 Graphviz DOT や PlantUML への出力が必要になった場合は、mxGraph を経由せず別エクスポーターを追加する方が筋が良い。

実装で押さえた XML 構造の要点:

- `mxfile > diagram > mxGraphModel > root` のツリー
- `mxCell id="0"` / `id="1" parent="0"` は mxGraph 固定の root / default-layer
- `vertex="1"` / `edge="1"` で種別を区別
- `style` は `key=value;key=value` のフラット文字列（CSS 風）
- コンテナは `style` に `container=1` を入れれば group 扱いになり、中の cell は `parent` 属性で参照
- container 内の cell の `mxGeometry x/y` は**親相対**（実装では container 原点を引いて格納）
- カスタム属性（`data-karasu-*`）は mxCell 要素に任意の XML 属性として付けてよい
- マルチページは `<diagram>` 要素を並べるだけ（ネイティブ機能）

## 影響範囲

- **コア**: `packages/core/src/exporter/drawio/` に新規モジュール。既存パイプラインへの変更なし
- **CLI**: `karasu render` に `--format drawio` オプションを追加（既定 `svg` で後方互換）
- **App**: 本 ADR の範囲外（Issue #717 で別途対応）
- **ドキュメント**: `docs/concepts.md` の非目標節にエスケープハッチを明記、`README.md` に例追加、`docs/acceptance/0057-drawio-export.md` を新規追加

## 既存ドキュメントの扱い

旧 Design Doc `docs/design/drawio-export.md` は本 ADR に昇格して削除する（プロセス: `docs/process.md`）。詳細な検討過程は PR #704 / #709 のコミット履歴・レビューで追跡可能。
