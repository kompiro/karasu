# draw.io (mxGraph XML) Export — a Layout Escape Hatch

- **日付**: 2026-04-19
- **ステータス**: 検討中
- **関連**: #649, #645 (non-goals), `docs/concepts.md`

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
