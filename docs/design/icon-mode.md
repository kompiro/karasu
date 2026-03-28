# アイコンモード — SVG アイコンによるノード表示切り替え

- **日付**: 2026-03-28
- **ステータス**: 検討中
- **関連**:
  - [2レイヤレンダリング](two-layer-rendering.md)
  - [インタラクティブ SVG レンダリング](interactive-svg-rendering.md)
  - [ビルトインスタイルとリファレンス](builtin-style-and-reference.md)
  - [デプロイノード種別スタイル統合 (Issue #30)](https://github.com/kompiro/karasu/issues/30)
  - [org ノードスタイル統合 (Issue #81)](https://github.com/kompiro/karasu/issues/81)

## 背景・課題

現在のシェイプ語彙（box, cylinder, user, cloud 等）は UML/DFD 時代の「紙＋モノクロ印刷」制約下で生まれたものであり、色とアイコンを活用できる現代の SVG 表示環境では必ずしも最適ではない。

特に `user` シェイプは TypeScript で比率計算を含む動的な実装になっており、見た目を調整するためにコードを変更しなければならない。

アイコンで要素を識別できるなら、シェイプの多様性よりも**視認性**と**調整のしやすさ**を優先する設計が望ましい。

## 制約・前提

- `packages/core` は Pure TypeScript（FS アクセスなし）
- アイコンテーマの**規範**は `packages/core` が持つ（SVG Export 時にも一貫した描画が必要なため）
- 表示モードのトグルは UI 層（`packages/app`）の責務
- ユーザーが追加するカスタム SVG アイコンに色注入は行わない（自由度を保つため）
- 詳細情報（フルラベル・説明・リンク等）は NodeDetailPanel で参照する
- テキストが収まらない場合は `...` で打ち切る（AI サマライズは将来対応）
- **モード切り替え時は全体を再レイアウトする**（シェイプモードの可変サイズとアイコンモードの固定サイズは共存しない）

## 検討した選択肢（トグルの置き場所）

### 案 A: `.krs` ファイル内ディレクティブ

`@display-mode: icon` をファイル先頭に記述。

- ✗ 表示の関心事がドキュメントに入り込む
- ✗ Export 用途と閲覧用途で別設定が持てない

### 案 B: コンパイル API パラメータ

`compile(src, style, path, { theme: "icon" })` として渡す。

- ✓ 呼び出し側が制御できる
- ✗ core の API に表示テーマの概念が入る

### 案 C: UI 層でスタイルシートを差し替え（採用）

アプリが `styleSource` にアイコンテーマ用スタイルを注入する。
アイコンテーマの CSS 文字列（`ICON_THEME_STYLE_SOURCE`）は `packages/core` に定義し、
アプリがそれをインポートして `styleSource` の前置として渡す。

```typescript
// packages/app 側
const effectiveStyle = displayMode === "icon"
  ? ICON_THEME_STYLE_SOURCE + "\n" + userStyleSource
  : userStyleSource;

compile(krsSource, effectiveStyle, viewPath);
```

- ✓ core の API を変えない
- ✓ Export 時も `ICON_THEME_STYLE_SOURCE` を使えば一貫した描画
- ✓ ユーザーが `.krs.style` でさらに override できる

## 確定した設計

### カードレイアウト

アイコンモードのノードは**2種類の固定サイズ**で描画する。
説明の有無は `measureNode()` が参照してサイズを決定する。

#### 説明あり: 160×100

```
viewBox="0 0 160 100"
┌──────────────────────────────────────────────────┐  y=0
│  [🔷] ServiceName                                │  y=0..28  タイトル行
├──────────────────────────────────────────────────┤  y=28
│  description text line 1（フル幅 144px）          │  y=28..72 説明行（44px）
│  description text line 2                         │
│  description text line 3                         │
├──────────────────────────────────────────────────┤  y=72
│  🔗2  👥EC開発チーム                      [ⓘ]   │  y=72..100 アクションバー
└──────────────────────────────────────────────────┘  y=100
```

#### 説明なし: 160×56（圧縮）

```
viewBox="0 0 160 56"
┌──────────────────────────────────────────────────┐  y=0
│  [🔷] ServiceName                                │  y=0..28  タイトル行
├──────────────────────────────────────────────────┤  y=28
│  🔗2  👥EC開発チーム                      [ⓘ]   │  y=28..56 アクションバー
└──────────────────────────────────────────────────┘  y=56
```

160÷100 = 1.60 ≈ φ（黄金比 1.618）。

### 各行の仕様

#### タイトル行（0..28px）

| 要素 | 位置・サイズ |
|---|---|
| 種別ピクトグラム | x=6, y=4, 20×20px |
| ノード名ラベル | x=30, y=19（baseline）font-size 13px |
| ラベル有効幅 | 160 - 30 - 8 = **122px**（英字≈17文字、日本語≈7文字） |

#### 説明行（28..72px、44px高）

| 要素 | 仕様 |
|---|---|
| 有効幅 | 160 - 16（padding）= **144px** |
| フォント | font-size 11px（≈22文字/行） |
| 行数 | 最大3行（行高 14px × 3 + padding） |
| 超過時 | `...` で打ち切り |

#### アクションバー（説明あり: 72..100px / 説明なし: 28..56px、28px高）

| 要素 | 位置 |
|---|---|
| リンクインジケータ（🔗） | 左寄せ、font-size 10px |
| チームインジケータ（👥） | 🔗 の右隣 |
| `[ⓘ]` 詳細パネルボタン | 右端、18×18px |

アクションバーの各要素は **React HTML オーバーレイ**で描画する（SVG 内には描画しない）。
これにより SVG Export 時は静的表示、アプリ内ではインタラクティブになる。

### クリックゾーンの分離

```
┌──────────────────────────────────────────────────┐
│                                                  │
│   ドリルダウンゾーン（タイトル行 + 説明行）        │  → ドリルダウン（子あり）
│                                                  │     詳細パネル（子なし leaf）
├──────────────────────────────────────────────────┤
│  🔗 → リンク直接遷移  👥 表示のみ         [ⓘ]   │  → [ⓘ] で詳細パネル
└──────────────────────────────────────────────────┘
```

ドリルダウンと詳細パネルのアクセス手段が**物理的に分離**されるため、
`data-has-children` による条件分岐が不要になる。

### コンテナノードのヘッダー

system / domain / service（子あり）はカード型ではなく、**ヘッダーバンド + 子ノード領域**で描画する。
ヘッダーはカードのタイトル行（28px）と同じ構造。

```
┌─────────────────────────────────────────────────────┐
│ [🔷] SystemName                              [ⓘ]   │ ← ヘッダー 28px
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                │
│  │  child card  │  │  child card  │                │
│  └──────────────┘  └──────────────┘                │
└─────────────────────────────────────────────────────┘
```

ヘッダーに表示するピクトグラム（20×20）は、同一の SVG ファイルから `krs-pictogram` クラスでマークされた部分を抽出して使う。1ファイルで leaf カードとコンテナヘッダーの両用途に対応する。

| ノード | アイコンファイル |
|---|---|
| `system` | `system.svg` |
| `service`（子あり） | `service.svg` |
| `domain` | `domain.svg` |

### SVG ファイルフォーマット（ビルトインアイコン）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <!-- ピクトグラム: krs-pictogram クラスでマーク（コンテナヘッダーでも再利用） -->
  <g class="krs-pictogram" transform="translate(6, 4)">
    <path d="..." fill="{{color}}"/>  <!-- 20×20px 内に収める -->
  </g>

  <!-- テキストスロット（svg-renderer が参照） -->
  <text class="krs-label"       x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8"  y="44" text-anchor="start"/>
</svg>
```

プレースホルダー一覧:

| プレースホルダー | 注入値 | 用途 |
|---|---|---|
| `{{color}}` | text-color | ピクトグラムの塗り色 |
| `{{fill}}` | background-color | シェイプ型アイコンに使用 |
| `{{stroke}}` | border-color | 線色 |
| `{{strokeWidth}}` | border-width | 線幅 |

ユーザー追加カスタムアイコン（`builtIn: false`）にはプレースホルダー置換を行わない。

### アイコンテーマのカバー範囲

`packages/core/src/builtins/icon-theme.ts` に `ICON_THEME_STYLE_SOURCE` として定義する。

#### 論理ノード（6種）

| ノード種別 | アイコンファイル |
|---|---|
| `service` | `service.svg` |
| `user` | `user.svg` |
| `domain` | `domain.svg` |
| `resource` | `resource.svg` |
| `team` | `team.svg` |
| `member` | `member.svg` |

#### タグ別バリアント

| セレクタ | アイコンファイル |
|---|---|
| `resource[table]` | `database.svg`（既存） |
| `resource[queue]` | `queue.svg` |
| `resource[api]` | `api.svg` |
| `resource[storage]` | `cloud.svg` |

#### デプロイノード（8種）

| 種別 | アイコンファイル |
|---|---|
| `oci` | `oci.svg` |
| `lambda` | `lambda.svg` |
| `jar` | `jar.svg` |
| `war` | `war.svg` |
| `function` | `function.svg` |
| `assets` | `assets.svg` |
| `job` | `job.svg` |
| `artifact` | `artifact.svg` |

## 実装レイヤー別変更サマリ

### `packages/core/src/renderer/shape-registry.ts`

- `SvgIconDef` に以下を追加:
  - `builtIn?: boolean` — プレースホルダー置換の有無
  - `pictogramBody?: string` — `<g class="krs-pictogram">` の内容（コンテナヘッダー用）

### `packages/core/src/renderer/svg-icon-loader.ts`

- `parseSvgIcon()` で `<g class="krs-pictogram">` の内容を抽出し `pictogramBody` に格納
- `builtIn: true` のアイコンレンダリング時に `{{color}}` / `{{fill}}` / `{{stroke}}` / `{{strokeWidth}}` を `ShapeContext` の値で置換
- `ShapeContext` に `color`（text-color）フィールドを追加
- コンテナヘッダー描画用に `renderPictogram(name, ctx)` を export（pictogramBody を 20×20 にスケールして返す）

### `packages/core/src/renderer/svg-renderer.ts`

- SVG アイコンシェイプを使うノードでは `labelSlot` / `descriptionSlot` 座標でテキスト配置
- テキスト打ち切りロジック（幅ベース `...` 付加）を実装

### `packages/core/src/renderer/layout.ts`

- `measureNode()` に説明有無を参照するアイコンモード対応を追加
- 説明あり → 160×100 / 説明なし → 160×56

### `packages/core/src/builtins/icon-theme.ts`（新規）

- `ICON_THEME_STYLE_SOURCE` を export
- 論理ノード・タグバリアント・デプロイノード全種を網羅

### `packages/core/icons/`

- ビルトインアイコン SVG ファイル群（計 18 種程度）
- `icons.json` にエントリ追加

### `packages/app`

- `displayMode` 状態と `ICON_THEME_STYLE_SOURCE` の注入ロジック
- トグルボタン UI（アイコン + テキストラベル）
- アクションバーの React HTML オーバーレイ（🔗 / 👥 / [ⓘ]）

## 未解決の問い

1. **20px ピクトグラムの視認性** — 小さいため単純なシルエット形状（塗り潰し系）が向く。`database.svg` のような線描きは細部が潰れる可能性がある。

2. **AI サマライズ** — 文字数超過時の `...` 打ち切りから、将来的に Claude API を使ったサマライズへ移行する設計（別 Issue）。

## 解決済みの問い

- **シェイプモードとの共存**: モード切り替え時に全体を再レイアウトする。シェイプモードの可変サイズとアイコンモードの固定サイズは共存しない。
- **コンテナノードの扱い**: アイコンモードでもコンテナを識別できるよう、ヘッダーバンドにピクトグラムを表示する。SVG ファイルは `krs-pictogram` クラスで leaf カードとコンテナヘッダーの両用途に対応（案 B 採用）。
