# インタラクティブ SVG レンダリング

- **日付**: 2026-03-20
- **ステータス**: ドラフト
- **関連**: [AST 再構成](ast-restructure.md), [2レイヤレンダリング](two-layer-rendering.md), [.krs 構文リファレンス](../spec/syntax.md)

## 背景・課題

AST 再構成により、各ノードが `description`（複数行 Markdown）、`link`（複数URL）、`team` などのリッチなプロパティを持つようになる。これらをどのように図上で表現し、ユーザーが操作できるようにするかを設計する。

### 現在のレンダリング

- SVG は文字列として生成し、`dangerouslySetInnerHTML` で DOM に注入している
- ノードは `<g data-node-id="...">` で囲まれ、ドリルダウンクリックに対応済み
- 表示テキストは label + description（1行）+ role の最大3行
- インタラクションはドリルダウン（クリック）とパン/ズームのみ

### 目指す姿

- 図上のノードには**サマリ情報**を簡潔に表示する（情報過多にしない）
- 詳細が知りたいときに**ポップアップで展開**できる（description の Markdown レンダリング、link 一覧など）
- link は**クリッカブル**で、外部リソースにそのまま遷移できる
- team やタグベースの resource 種別は**視覚的に区別**できる

## 制約・前提

- SVG は core パッケージが文字列として生成する。core は React に依存しない
- インタラクション（ポップアップ、リンククリック）は app パッケージの React コンポーネントが担う
- SVG → React 間の通信は `data-*` 属性による**イベント委譲**で行う（現在のドリルダウンと同じ方式）
- 純粋な SVG ファイルとしてエクスポートした場合も、静的な情報は維持したい

## 設計

### 1. ノードの表示レイヤー構成

ノードの情報を3つのレイヤーに分けて段階的に表示する。

| レイヤー | 表示タイミング | 内容 |
|---------|--------------|------|
| **常時表示** | 常に図上に表示 | label, サマリ description, アイコン/バッジ |
| **ホバーヒント** | マウスホバー | link 数、team 名、description 冒頭（ツールチップ風） |
| **詳細パネル** | クリック（ドリルダウン不可ノード）またはアクションボタン | Markdown description 全文、link 一覧、全プロパティ |

#### 常時表示（SVG 内）

```
┌────────────────────────────┐
│  ECサイト                   │  ← label
│  商品管理と注文処理          │  ← description サマリ（1行、最大約50文字 + "..."）
│  🔗2  👥EC開発チーム         │  ← メタ行: link 数アイコン + team
└────────────────────────────┘
```

- **description サマリ**: `description` の先頭1行目、または先頭50文字で打ち切り + `…`
- **メタ行**: link 数（`🔗2`）と team 名を小さいフォントで表示。情報がなければ行自体を省略
- leaf ノード（resource, user でドリルダウン不可）はクリックで詳細パネルを開く
- 子を持つノードはクリックでドリルダウン、詳細パネルは別のインタラクションで開く

#### resource のタグベース shape

resource ノードはタグに応じた shape で描画する。shape は `.krs.style` で上書き可能だが、デフォルトマッピングを提供する。

| タグ | デフォルト shape | 視覚イメージ |
|------|-----------------|-------------|
| `[table]` | `cylinder` | DB テーブル |
| `[queue]` | `queue` | メッセージキュー |
| `[api]` | `hexagon` | API エンドポイント |
| `[storage]` | `cloud` | オブジェクトストレージ |
| `[file]` | `box` | ファイル（将来: 専用 shape） |
| （タグなし） | `box` | 汎用 |

これはスタイルリゾルバのデフォルトルールとして実装する。

```
// default.krs.style 相当の組み込みルール
resource[table] { shape: cylinder; }
resource[queue] { shape: queue; }
resource[api]   { shape: hexagon; }
resource[storage] { shape: cloud; }
```

### 2. data-* 属性によるメタデータ埋め込み

core の SVG レンダラーが `<g>` 要素に `data-*` 属性でメタデータを埋め込む。app 側はこれを読み取ってインタラクションを実現する。

```xml
<g data-node-id="ECommerce"
   data-node-kind="service"
   data-has-children="true"
   data-has-description="true"
   data-link-count="2"
   style="cursor: pointer">
  <!-- shape, label, description サマリ, メタ行 -->
</g>
```

| 属性 | 型 | 用途 |
|-----|-----|------|
| `data-node-id` | string | ノード識別（既存） |
| `data-node-kind` | LogicalNodeKind | 種別（アイコン・スタイル判定） |
| `data-has-children` | "true" / "false" | ドリルダウン可否の判定 |
| `data-has-description` | "true" / "false" | 詳細パネル表示の要否 |
| `data-link-count` | number | link バッジの表示 |

**注意**: description の全文や link URL は `data-*` に埋め込まない。サイズが大きくなりすぎるため、詳細パネル表示時に AST から引く。

### 3. インタラクションモデル

#### クリックの判定ロジック

現在の PreviewPane はクリック（パンと区別するため移動量 < 3px）でドリルダウンを発火する。AST 再構成後は以下のように拡張する。

```
クリック検出
  ├─ data-node-id あり
  │    ├─ data-has-children="true"  → ドリルダウン
  │    └─ data-has-children="false" → 詳細パネルを開く
  │
  ├─ data-link-url あり（link アイコン上） → 外部 URL を新タブで開く
  │
  └─ それ以外 → 何もしない（パネルが開いていれば閉じる）
```

#### 詳細パネルへのアクセス（子を持つノード）

子を持つノードはクリックがドリルダウンに割り当てられているため、詳細パネルへのアクセス手段が必要。

**案: ノード右上の info ボタン**

```
┌────────────────────────────────┐
│  ECサイト              [ⓘ]     │  ← info ボタン
│  商品管理と注文処理              │
│  🔗2  👥EC開発チーム             │
└────────────────────────────────┘
```

- `[ⓘ]` は SVG 内に描画する小さなアイコン
- `data-info-button="ECommerce"` 属性を付与
- クリック時にドリルダウンではなく詳細パネルを開く
- description も link もない場合は info ボタンを表示しない

### 4. 詳細パネル（React HTML オーバーレイ）

詳細パネルは SVG の上に React で描画する HTML オーバーレイ。SVG 内には描画しない（Markdown レンダリング、リンククリック、スクロールなど HTML の方が適切なため）。

#### 表示位置

クリックされたノードの SVG 座標から、ビューポート座標に変換してパネルを配置する。

```
┌─────────────────────────────────────────┐
│  SVG Preview                            │
│                                         │
│  ┌──────────┐  ┌─────────────────────┐  │
│  │ ECommerce│→│ ■ ECサイト           │  │
│  │ [click]  │  │                     │  │
│  └──────────┘  │ 商品管理と注文処理を  │  │
│                │ 担当するサービス。    │  │
│                │                     │  │
│                │ ## 責務             │  │
│                │ - 商品カタログの管理  │  │
│                │ - 注文の受付と処理   │  │
│                │                     │  │
│                │ 🔗 設計Wiki          │  │
│                │ 🔗 画面設計          │  │
│                │                     │  │
│                │ 👥 EC開発チーム      │  │
│                └─────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

#### パネルの構成

```
┌─────────────────────────────────┐
│ ■ {label}                   [×] │  ← ヘッダ（種別アイコン + ラベル + 閉じるボタン）
├─────────────────────────────────┤
│                                 │
│ {description の Markdown}       │  ← Markdown レンダリング領域（スクロール可能）
│                                 │
├─────────────────────────────────┤
│ 🔗 リンク                       │  ← link セクション
│  • 設計Wiki ↗                   │     各リンクはクリッカブル、新タブで開く
│  • 画面設計 ↗                   │
├─────────────────────────────────┤
│ 👥 EC開発チーム                  │  ← プロパティセクション（team, role 等）
│ 📌 role: 商品を購入する一般ユーザー │
└─────────────────────────────────┘
```

#### React コンポーネント構成

```
PreviewPane
├── SVG (dangerouslySetInnerHTML)
└── NodeDetailPanel (conditional)        ← 新規追加
    ├── PanelHeader (label, kind icon, close button)
    ├── MarkdownContent (description)    ← markdown-it or remark
    ├── LinkList (links[])
    └── PropertiesSection (team, role, etc.)
```

#### 状態管理

```typescript
// PreviewPane に追加する状態
interface DetailPanelState {
  nodeId: string;
  // SVG 座標系での位置（パン/ズーム変換前）
  anchorX: number;
  anchorY: number;
}

const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null);
```

パネル表示時に必要なノードデータは、CompileResult に含まれる AST から `nodeId` で検索する。SVG 文字列とは別に、app 側がノードメタデータにアクセスできる必要がある。

### 5. CompileResult の拡張

core の `compile()` が返す結果に、ノードメタデータのマップを追加する。

```typescript
export interface NodeMetadata {
  kind: LogicalNodeKind;
  label: string;
  description?: string;    // 生の Markdown テキスト
  links: LinkEntry[];
  team?: string;            // service
  role?: string;            // user
  tags: string[];
  annotations: string[];
  hasChildren: boolean;
}

export interface CompileResult {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;  // 追加: nodeId → metadata
}
```

- SVG レンダラーは `data-*` 属性で最小限のヒントだけ埋め込む
- 詳細パネルは `nodeMetadata` マップから全情報を取得する
- SVG のサイズを最小限に保ちつつ、リッチなインタラクションを実現する

### 6. SVG 内のクリッカブルリンク（link アイコン）

ノードの常時表示領域に link アイコンを配置し、SVG 内で直接クリック可能にする。

```xml
<g data-node-id="ECommerce" ...>
  <!-- shape -->
  <!-- label text -->
  <!-- description summary text -->

  <!-- link アイコン（メタ行内） -->
  <g data-link-url="https://wiki.example.com/ec"
     data-link-label="設計Wiki"
     style="cursor: pointer">
    <text x="..." y="..." font-size="10" fill="#60A5FA">🔗</text>
    <text x="..." y="..." font-size="9" fill="#60A5FA">2</text>
  </g>
</g>
```

**リンクが1つの場合**: アイコンクリックで直接 URL を開く
**リンクが複数の場合**: アイコンクリックで詳細パネルの link セクションを開く

#### SVG エクスポート時

純粋な SVG ファイルとしてエクスポートする場合、link は `<a xlink:href="...">` で埋め込むことで、SVG ビューアでもクリック可能にする。

```xml
<a href="https://wiki.example.com/ec" target="_blank">
  <text ...>🔗 設計Wiki</text>
</a>
```

### 7. ノードサイズ計算の変更

`measureNode` 関数を拡張して、新しい表示要素を考慮したサイズ計算を行う。

```
ノードの高さ:
  padding-top
  + label 行（1行）
  + description サマリ行（0 or 1行）
  + メタ行: link + team（0 or 1行）
  + role 行（0 or 1行、user のみ）
  + padding-bottom

ノードの幅:
  max(
    label の文字幅,
    description サマリの文字幅,
    メタ行の文字幅,
    role の文字幅,
    最小幅 80px
  ) + padding-left + padding-right + info ボタン幅
```

### 8. description サマリの生成ルール

Markdown の全文から図上に表示するサマリを生成する。

1. 先頭の段落（最初の空行まで）を取得する
2. Markdown 記法を除去してプレーンテキストにする
3. 50文字で打ち切り、超過時は `…` を付与する
4. サマリは core 側で生成し、`LayoutNode` に含める

```typescript
function summarizeDescription(markdown: string, maxLength = 50): string {
  // 最初の段落を取得
  const firstParagraph = markdown.split(/\n\s*\n/)[0] ?? "";
  // Markdown 記法を簡易除去（#, *, -, ` など）
  const plain = stripMarkdown(firstParagraph).trim();
  // 文字数制限
  if ([...plain].length <= maxLength) return plain;
  return [...plain].slice(0, maxLength).join("") + "…";
}
```

### 9. team の表示

service ノードにのみ表示される。メタ行内に小さいフォントで描画する。

```xml
<!-- メタ行 -->
<text x="..." y="..." font-size="9" fill="#94A3B8" font-family="sans-serif">
  👥 EC開発チーム
</text>
```

team 名が長い場合は15文字で打ち切り + `…`。

## 実装の段階

この設計は以下の順序で段階的に実装する。

### Phase 1: 基盤（AST 再構成と連動）

1. `LayoutNode` に `kind` と `properties` を追加
2. `measureNode` を新プロパティ対応に拡張
3. description サマリの生成ロジック
4. `CompileResult` に `nodeMetadata` を追加

### Phase 2: SVG 表示の拡張

5. ノードにメタ行（link 数 + team）を描画
6. `data-*` 属性の拡張（`data-node-kind`, `data-has-description` 等）
7. info ボタン（`ⓘ`）の描画
8. resource のタグベースデフォルト shape

### Phase 3: インタラクション（app 側）

9. `NodeDetailPanel` コンポーネント実装
10. Markdown レンダリング（lightweight ライブラリ選定）
11. クリック判定ロジックの拡張（info ボタン / leaf ノード → 詳細パネル）
12. link クリックのハンドリング

### Phase 4: エクスポート

13. SVG エクスポート時の `<a>` タグ埋め込み

## 未解決の問い

- Markdown レンダリングライブラリの選定: `markdown-it`（軽量）vs `remark`（React 統合が良い）vs `marked`
- 詳細パネルの表示アニメーション: フェードイン or スライドイン or なし
- モバイル/タッチ対応: ホバーが使えない環境での代替インタラクション
- ノード数が多い図でメタ行を表示するとノイジーにならないか: ズームレベルに応じた表示/非表示の閾値が必要か
- info ボタンの視認性: 常時表示 vs ホバー時のみ表示
