# draw.io (mxGraph XML) Export — a Layout Escape Hatch

- **日付**: 2026-04-19
- **ステータス**: 実装済み (system / deploy のみ。org view は follow-up に分離)
- **関連**: #649, #645 (non-goals), `docs/concepts.md`

> **実装時の調整**: 初版 PR では `system` / `deploy` の 2 view のみを drawio ページとして出力する。
> `org` view は独自のレンダリングパイプラインで `LayoutResult` を介さないため、そのまま流用できない。
> org 対応は別 Issue に分離し、org-renderer から座標抽出ステップを切り出す形で追加する想定。

## mxGraph XML とは（調査メモ）

`.drawio` ファイルの中身は **mxGraph XML** フォーマット。`mxGraph` は
JGraph Ltd（draw.io / diagrams.net の作者）が作った JavaScript ダイアグラム
ライブラリ起源のスキーマで、本体ライブラリは 2020 年にアーカイブ済み、
fork の [maxGraph](https://github.com/maxGraph/maxGraph) に引き継がれている。
XML スキーマはほぼ互換。

**実用上の消費者はほぼ draw.io 一強**:

- draw.io Desktop、diagrams.net Web
- VS Code `Draw.io Integration` 拡張
- Confluence / Jira の draw.io プラグイン
- Notion / GitBook などの draw.io 埋め込み
- IntelliJ の Diagrams.net plugin

他ツール互換性:

- Lucidchart は mxGraph/drawio インポートを一応サポート（レイアウト再計算あり、スタイル劣化）
- Visio は直接読めないが draw.io 経由で `.vsdx` に書き出し可能
- Mermaid / PlantUML 系は非対応

つまり **「mxGraph XML ≈ draw.io のファイル形式」** と考えてよい。
karasu の「レイアウト調整の逃げ道」としての位置付けは draw.io エコシステム全体に届く。
他ツール（Graphviz DOT、PlantUML 等）への出力が必要になった場合は、
mxGraph を経由せず別エクスポーターを追加する方が筋が良い。

### 変換方式（SVG 経由ではない）

SVG → mxGraph の変換ではなく、karasu 内部の `LayoutResult` から **直接**
mxGraph XML を生成する。SVG と draw.io は同じ `LayoutResult` を消費する姉妹パス:

```
.krs → Parser → KrsFile (AST)
  └─ extractView / extractDeployView → ViewSlice
       └─ layout() / layoutDeploy() → LayoutResult { nodes, containers, edges }
            ├── SVG path: svg-renderer → <svg>
            └── drawio path: drawio-exporter → <mxfile>
```

SVG 経由にしない理由:

- SVG は視覚表現に最適化された形式で、意味的情報（どのノードがどのサービスに属するか等）が失われている
- draw.io の `mxCell` は `parent` 属性でネスト構造を表現するため、karasu の container/node ツリーを直接マッピングできる
- SVG パーサを通すと二重変換になりロスが増える

### mxGraph XML の構造（実装で使う部分）

```xml
<mxfile host="karasu" type="export">
  <diagram id="system" name="System">
    <mxGraphModel dx="..." dy="..." grid="1" ...>
      <root>
        <mxCell id="0" />                             <!-- root（mxGraph 固定） -->
        <mxCell id="1" parent="0" />                  <!-- default layer（固定） -->

        <!-- コンテナ（group cell） -->
        <mxCell id="svc-checkout" value="Checkout"
                style="rounded=0;container=1;collapsible=0;..."
                parent="1" vertex="1"
                data-karasu-id="checkout" data-karasu-kind="container">
          <mxGeometry x="..." y="..." width="..." height="..." as="geometry" />
        </mxCell>

        <!-- ノード（vertex cell、親が container の場合 geometry は親相対） -->
        <mxCell id="order" value="Order"
                style="rounded=1;fillColor=#ffffff;..."
                parent="svc-checkout" vertex="1"
                data-karasu-id="order" data-karasu-kind="domain">
          <mxGeometry x="..." y="..." width="..." height="..." as="geometry" />
        </mxCell>

        <!-- エッジ -->
        <mxCell id="edge-0" value="creates"
                style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;..."
                parent="1" edge="1" source="order" target="payment"
                data-karasu-edge-from="order" data-karasu-edge-to="payment">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
  <!-- 別ページ（deploy view 等）は <diagram> を追加 -->
</mxfile>
```

押さえどころ:

- `mxCell id="0"` / `id="1"` は mxGraph 固定の root / default-layer。全 cell は最終的に `parent="0"` に辿り着く
- `vertex="1"` / `edge="1"` で種別を区別
- `style` は `key=value;key=value` のフラット文字列（CSS 風）。先頭にベア token を置くと shape 名になる（例: `ellipse;fillColor=...`）
- コンテナは `style` に `container=1` を入れるだけで group 扱いになり、中の cell は `parent` 属性で参照する
- container 内の cell の `mxGeometry x/y` は **親相対** になる点に注意（実装では container 原点を引いて格納）
- カスタム属性（`data-karasu-*`）は mxCell 要素に任意の XML 属性として付けてよい。draw.io は保持して読み書きしてくれる
- マルチページは `<diagram>` を並べるだけ（ネイティブ機能）

## 背景・課題

karasu は「テキストファースト」を貫くため、自動レイアウト最適化を非目標 (#645) に置いている。
一方で、プレゼン資料や外部配布ドキュメントでピクセル単位の微調整をしたい場面は実在する。
現状の回避策は SVG を書き出してベクタツールで編集することだが、ノード/エッジの多い図では
非現実的である。

**draw.io (diagrams.net) への一方向エクスポート**は、karasu が構造モデルと初期レイアウトを
提供し、仕上げを draw.io に任せる「逃げ道」を作る。この方針は非目標と**矛盾せず補強する**
— karasu はテキストファーストのモデリングに集中し、レイアウト整形は専用ツールに委ねる。

## 制約・前提

- `.krs` は単一の真実源。draw.io 側での編集は karasu に戻さない（round-trip 非サポート）
- 既存レイアウトエンジン（`packages/core/src/renderer/layout.ts` の `LayoutResult`）の
  座標を再利用する。第2のレイアウトパスを作らない
- エクスポートは CLI 経由（`karasu render <file> --format drawio`）。
  SVG と同じ粒度（`--view system | deploy | org`）で切れること
- karasu の ID・アノテーションはベストエフォートで保持（カスタム属性に埋める）。
  将来ツールが読み取れる余地を残す
- ドリルダウン対話性は再現しない。1 view = 1 静的スナップショット

## 検討した選択肢

### 選択肢 A: 1 view = 1 ファイル（SVG と同一粒度）

`--view <type>` を必須または既定の動作として要求し、1 呼び出し = 1 `.drawio` を出力する。

- メリット
  - 既存 `render` コマンドのメンタルモデルと一致（SVG と対称）
  - 実装が単純（`LayoutResult` 1 つを mxGraph に変換するだけ）
  - 個別 view を CI で出し分けやすい
- デメリット
  - view ごとに別ファイルになり、ユーザーが手で束ねる必要がある
  - 「ひとつのプロジェクトの全体像」を 1 ファイルで配布したい要求に応えにくい

### 選択肢 B: マルチページ `.drawio` ファイル（各 view が 1 ページ）

mxfile は `<diagram>` タグを複数持てる。各 view を 1 ページ（タブ）として同一ファイルに束ねる。
`--view <type>` を省略するとマルチページ、指定すると単一ページを出力。

- メリット
  - 1 プロジェクト = 1 ファイル配布が自然
  - draw.io ネイティブの機能なので追加コストがほぼゼロ
  - system / deploy / org を横断して閲覧できる
- デメリット
  - ファイルが大きくなりやすい（view が多い場合）
  - 単一 view だけ欲しいときは `--view` を明示する必要がある

### 選択肢 C: カスタム XML 生成 vs ライブラリ利用

mxGraph XML は比較的素直なスキーマで、ブラウザ互換を考慮する必要もないため、
**手書き XML ジェネレータ**で十分。node の `mxgraph` 系 npm パッケージは
ブラウザ前提のものが多く、CLI から node で実行するには重い。

採用: 軽量な純 TypeScript の XML ビルダー（文字列連結またはごく薄い helper）で生成する。

## 現時点の方針

- **選択肢 B を採用**: 既定はマルチページ、`--view` 指定で単一ページ
- **XML は手書きジェネレータ** (`packages/core/src/exporter/drawio/`) で生成
- **入口は CLI の `render` コマンド拡張**: `--format svg | drawio`（既定 `svg`）

### 実装構成

```
packages/core/src/exporter/
  drawio/
    drawio-exporter.ts       # LayoutResult[] → mxGraph XML 文字列
    drawio-exporter.test.ts
    drawio-style.ts          # tags/annotations → mxCell style 文字列
    drawio-style.test.ts
    mxgraph-builder.ts       # 小さな XML ビルダー（薄い helper）
```

公開 API（`@karasu-tools/core`）:

```ts
export function exportDrawio(input: DrawioExportInput): string;

interface DrawioExportInput {
  pages: Array<{
    id: string;       // view 種別 + view path（例: "system", "deploy", "domain:order"）
    name: string;     // タブに表示される見出し
    layout: LayoutResult;
  }>;
}
```

CLI 変更:

```
karasu render <file> [--format svg|drawio] [--view system|deploy|org] [-o <out>]
```

- `--format drawio` + `--view` 省略 → 既定の 3 view（system/deploy/org）をページとして束ねる
- `--format drawio` + `--view <t>` → 1 ページの `.drawio`
- `--format drawio` 時、`--output` 省略なら stdout に XML を書く（SVG と対称）

### karasu → mxGraph マッピング

| karasu | mxGraph | 備考 |
|---|---|---|
| container (system / service / organization) | group `mxCell`（`vertex="1" connectable="0" style="group"`） | `parent` 参照で入れ子を表現 |
| node (domain / usecase / resource / user / deploy unit / team / member) | `mxCell` `vertex="1"` + `mxGeometry` | 既存 `LayoutNode` の `x/y/width/height` をそのまま流用 |
| edge | `mxCell` `edge="1"` + `source` / `target` | ラベルは `value`、集約エッジは後述 |
| ghost ノード | スタイルで破線・薄色 | `dashed=1;opacity=60` 等 |
| annotation (external, deprecated, migration_target) | style 属性 | 初期セットのみ対応 |
| karasu ID, annotations | `mxCell` のカスタム属性 (`data-karasu-id`, `data-karasu-annotations`) | 将来の round-trip 検討余地 |

### kind の可視化（ステレオタイプ + shape/色）

ノードの種類（`service` / `domain` / `user` / `database` / `lambda` ...）が
draw.io 上でぱっと見て判別できるように、2 系統の可視化を併用する:

1. **ラベルに UML 風ステレオタイプを前置**: `«service»` のような小さな灰文字を
   ラベル上に追加する。value は HTML として埋め込む（`html=1` が style に入っている）。
2. **kind に応じた shape / fillColor**:
   - 論理: `user` → `umlActor`、`usecase` → `ellipse`、`resource` → `document`、
     `database` / `table` / `bucket` / `storage` → `cylinder3`、`queue` → `flowchart.delay`
   - 残りの論理ノード（`system` / `service` / `domain` / `queue-item`）は rounded rect のまま fillColor で差別化
   - デプロイ: 全て rounded rect。`oci` / `war` / `jar` / `artifact` / `lambda` / `function` / `assets` / `job` を色で区別

annotation による上書き（`deprecated` → 赤枠 等）は kind スタイルよりあとに適用する。
fill を設定しない annotation（`deprecated` など）では kind 由来の fill が維持される。

さらに、ノードとコンテナのラベルには **全ての annotation と tag を小さなバッジ**として
表示する（stereotype の下に、kind スタイルとは独立して）:

- `@annotation` 群（オレンジ）: `@deprecated` `@external` `@migration_target` など全て
  — スタイル未定義のカスタム annotation も含めてテキスト表示される
- `#tag` 群（青）: `#human` `#pii` `#core` など全て

tag は karasu 側にスタイル意味を持たせていないためテキスト表示のみ、
annotation は「ラベル」と「スタイル」の両方に効くという役割分担。
`data-karasu-tags` / `data-karasu-annotations` 属性はどちらもセルに残る。

### アノテーション → スタイル（初期セット）

- `external` → `fillColor=#f5f5f5;strokeColor=#999;dashed=1`
- `deprecated` → `strokeColor=#cc0000;strokeDasharray=4,2;fontStyle=2` (italic)
- `migration_target` → `fillColor=#fff3e0;strokeColor=#ff9800`

それ以外のタグは未指定（既定スタイル）。ユーザー要望を受けて段階的に増やす。

### 集約された implicit edge の扱い

`LayoutEdge.domainEdges` に内訳を持つ service 間集約エッジは、**1 本のエッジセル**として出力し、
内訳をカスタム属性 `data-karasu-aggregated="domain1->domain2,domain3->domain4"` に格納する。
理由:

- 配置上も 1 本として見えているので、描画の直感を保つ
- ラベル（例: "3 domain edges"）はそのまま `value` として可視化できる
- 詳細は属性で保持されるので、将来 draw.io プラグインで展開する余地がある

### 識別子と重複対策

- `mxCell` の `id` には `sanitizeId(karasuId)` を使う（SVG レンダラと共通化）
- マルチページ時、ページをまたぐ ID 衝突を避けるため `<page-id>:<karasu-id>` 形式にする

## アクセプタンステスト

`docs/acceptance/drawio-export.md` に以下を記述する（実装 PR で追加）:

- [ ] `examples/` の任意プロジェクトに対し `karasu render --format drawio` が XML を標準出力する
- [ ] 出力 XML を draw.io（desktop または web）で開き、すべての view がページとして閲覧できる
- [ ] 各ノードの位置関係が SVG 描画と視覚的に一致する（厳密なピクセル一致は不要）
- [ ] `external` / `deprecated` / `migration_target` のノードが区別できるスタイルで描画される
- [ ] `--view system` 指定で 1 ページのみ含む `.drawio` が出力される
- [ ] karasu ID がエクスポート後のセルから取り出せる（draw.io の「Edit Geometry / Edit Style / Edit Attributes」で確認）
- [ ] 存在しない `--format xyz` はエラー終了する

## ドキュメント反映

- `docs/concepts.md` の非目標セクションに「レイアウト最適化はしないが、draw.io export という逃げ道がある」旨を追記（#645 とコーディネート）
- `README.md` に `--format drawio` 例を追加
- `docs/spec/` の CLI リファレンス（もしあれば）を更新

## スコープ外（今回やらない）

- round-trip（draw.io で編集した結果を `.krs` に戻す）
- GUI 埋め込みエディタ
- Lucidchart / Miro など他ツール
- ドリルダウン対話性の保持
- 大規模プロジェクト向けのストリーミング出力
