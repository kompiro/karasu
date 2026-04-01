# 全ビュー統合バンドル SVG（Export All Diagrams）

- **日付**: 2026-04-01
- **ステータス**: ドラフト
- **関連**:
  - [SVG エクスポート（ドリルダウン対応）](svg-export.md)
  - [Issue #121: CLI render command](https://github.com/kompiro/karasu/issues/121)
  - [Issue #122: GitHub Actions workflow template](https://github.com/kompiro/karasu/issues/122)
  - [Issue #123: GitHub Markdown rendering support](https://github.com/kompiro/karasu/issues/123)

## 背景・課題

現在の SVG エクスポートは **1ビュー（system / deploy / org）ごとに個別の SVG** を生成する。
それぞれのビュー内のドリルダウンナビゲーションは CSS `:target` で実現されているが、
ビューをまたぐナビゲーション（例: system タブ → org タブ）はサポートされていない。

`#121`（CLI render コマンド）・`#122`（GitHub Actions 連携）の実現に向けて、
**1つの SVG ファイルで全ビューを閲覧できる**形式が求められる。

### 具体的なユースケース

- CI/CD パイプラインで `.krs` → 単一 SVG を生成し、ドキュメントリポジトリに commit する
- GitHub 上でアーキテクチャ図を閲覧する際に、system / deploy / org を行き来する
- アプリ UI から「全ビューをまとめて 1 ファイルでエクスポートしたい」ニーズに応える

## 制約・前提

- **CSS-only**: JavaScript 不要。既存の drill-down SVG（`buildDrillDownSvg` 等）と同じ方針
- **単一ファイル**: `.svg` 1 ファイルで完結する。ZIP 等の複数ファイル形式は採用しない
- **CSS `:target` は同時に1要素のみ**対象にできる。ビュー切り替え（どのタブか）と
  ドリルダウン（そのビューのどのレベルか）を同時に表現するための設計が必要
- **ブラウザ対応**: CSS `:has()` が必要なため Chrome 105+ / Firefox 121+ / Safari 15.4+
  （既存の drill-down SVG と同じ前提）
- CLI への追加は `#121`（karasu render コマンド）完了後

## 設計

### ID プレフィックス方式によるビュー×レベルの同時識別

全てのレベル ID に `{view名}-` プレフィックスを付与することで、
**フラグメント ID 一つ**でビューとドリルダウンレベルを同時に表現する。

```
krs-system-root           ← system view のルート
krs-system-ServiceA       ← system view の ServiceA ドリルダウン
krs-deploy-root           ← deploy view のルート
krs-org-root              ← org view のルート
krs-org-TeamA             ← org view の TeamA ドリルダウン
```

CSS の `:has([id^="krs-system-"]:target)` セレクターで、
「krs-system- で始まる ID の要素が `:target` 状態のとき」を検出し、
対応するパネルの表示・非表示を制御する。

#### CSS の骨格

```css
/* 全パネル・全レベルを非表示にリセット */
.krs-pane  { display: none; }
.krs-level { display: none; }

/* デフォルト状態（URL フラグメントなし）: system パネルのルートを表示 */
svg:not(:has(.krs-level:target)) #krs-pane-system { display: block; }
svg:not(:has(.krs-level:target)) #krs-system-root  { display: block; }

/* フラグメント付き: プレフィックスでどのパネルを表示するか決定 */
svg:has([id^="krs-system-"]:target) #krs-pane-system { display: block; }
svg:has([id^="krs-deploy-"]:target) #krs-pane-deploy { display: block; }
svg:has([id^="krs-org-"]:target)    #krs-pane-org    { display: block; }

/* 対象レベルのみ表示 */
.krs-level:target { display: block; }

/* タブのアクティブスタイル */
svg:not(:has(.krs-level:target)) .krs-tab--system,
svg:has([id^="krs-system-"]:target) .krs-tab--system { /* active */ }
svg:has([id^="krs-deploy-"]:target) .krs-tab--deploy  { /* active */ }
svg:has([id^="krs-org-"]:target)    .krs-tab--org     { /* active */ }
```

### SVG 構造

```xml
<svg width="{maxPaneWidth}" height="{TAB_HEIGHT + maxPaneHeight}">
  <style>/* 上記 CSS */</style>

  <!-- タブバー（常時表示） -->
  <g class="krs-tabbar" transform="translate(0, 0)">
    <a href="#krs-system-root">
      <rect class="krs-tab krs-tab--system" x="0"   y="0" width="100" height="32"/>
      <text>System</text>
    </a>
    <a href="#krs-deploy-root">
      <rect class="krs-tab krs-tab--deploy" x="100" y="0" width="100" height="32"/>
      <text>Deploy</text>
    </a>
    <a href="#krs-org-root">
      <!-- .krs に org 定義なしの場合は pointer-events:none + 薄色 (disabled) -->
      <rect class="krs-tab krs-tab--org krs-tab--disabled" x="200" y="0" width="100" height="32"/>
      <text>Org</text>
    </a>
  </g>

  <!-- System パネル -->
  <g id="krs-pane-system" class="krs-pane" transform="translate(0, 32)">
    <g id="krs-system-root" class="krs-level">
      <!-- 既存 buildDrillDownSvg の system root コンテンツ -->
      <!-- 子を持つノード: <a href="#krs-system-{childId}"> -->
    </g>
    <g id="krs-system-ServiceA" class="krs-level">
      <!-- 戻るボタン: <a href="#krs-system-root"> -->
    </g>
    <!-- ... 他のドリルダウンレベル ... -->
  </g>

  <!-- Deploy パネル -->
  <g id="krs-pane-deploy" class="krs-pane" transform="translate(0, 32)">
    <g id="krs-deploy-root" class="krs-level">
      <!-- deploy view コンテンツ -->
    </g>
  </g>

  <!-- Org パネル -->
  <g id="krs-pane-org" class="krs-pane" transform="translate(0, 32)">
    <g id="krs-org-root" class="krs-level">
      <!-- org view コンテンツ -->
    </g>
    <g id="krs-org-TeamA" class="krs-level">
      <!-- 戻るボタン: <a href="#krs-org-root"> -->
    </g>
  </g>
</svg>
```

### cross-view ノードリンクの扱い

`.krs` のアロー定義で別ビューのノードへの参照がある場合、
リンク先の href を `#krs-{targetView}-{targetNodeId}` とすることで、
**タブ切り替え＋ドリルダウンが同時に発生する**自然なナビゲーションを実現する。

```xml
<!-- system view の ServiceA から deploy view の ServerA へのリンク -->
<a href="#krs-deploy-ServerA">
  <g data-node-id="ServiceA" ...>...</g>
</a>
```

### タブの disabled 表示

`.krs` ファイルに定義がないビューのタブは disabled スタイルを適用する。
タブ要素は SVG に含め（レイアウトの安定性のため）、`pointer-events: none` と薄色で無効を表現する。

```css
.krs-tab--disabled {
  opacity: 0.35;
  pointer-events: none;
  cursor: default;
}
```

### SVG のサイズ決定

コンテンツ高が異なる複数パネルを1枚の SVG に収めるため:

- **width**: 全パネル中の最大幅
- **height**: `TAB_HEIGHT + 全パネル中の最大高さ`

CSS では `viewBox` の動的変更はできないため、
コンテンツが小さいビューのパネル下部には余白が生じる（許容する）。

## 実装スコープ

### core: `buildAllViewsSvg()`

```typescript
// packages/core/src/index.ts に追加
export function buildAllViewsSvg(
  krsSource: string,
  styleSource?: string,
  displayMode?: DisplayMode
): string;
```

- 内部で system / deploy / org それぞれの drill-down コンテンツを生成
- ID プレフィックスを付与して単一 SVG に統合
- 定義が存在しないビューは `krs-tab--disabled` を付与
- 既存の `buildDrillDownSvg` / `buildDrillDownSvgOrg` の出力を再利用できる部分は再利用

### app: `KarasuPreviewColumn` に「Export All Diagrams SVG」ボタン

- `DiagramTabBar` と同じ行（`preview-toolbar` の右端）に追加
- `KarasuPreviewColumnProps` に `allViewsSvg?: string` を追加
- MemoryMode / ProjectMode 両方は `KarasuPreviewColumn.tsx` 1 箇所の変更で対応できる
- ファイル名: `{name}-all-diagrams.svg`

### cli: `--all-views` フラグ（`#121` 完了後）

```bash
karasu render index.krs --all-views --output docs/architecture-all.svg
```

## 未解決の問い

1. **既存の drill-down ID との衝突**: 現在の `buildDrillDownSvg` が生成する ID（`krs-view-root` 等）と
   新しい ID スキーム（`krs-system-root` 等）をどう整合させるか。
   既存 ID スキームを廃止して新スキームに統一するか、互換レイヤーを持つか。

2. **`buildAllViewsSvg` と既存関数の関係**: `buildAllViewsSvg` は
   既存の `buildDrillDownSvg` の内部実装を呼び出す形にするか、
   それとも共通の内部関数を抽出してリファクタリングするか。

3. **Deploy ビューのドリルダウン**: 現在の `svg-export.md` では
   「Deploy ビューはフラットで ドリルダウン構造を持たない」とされている。
   全ビュー統合 SVG の deploy タブ内でも同様にフラット表示のみとするか。

4. **アプリ内プレビューでの利用**: 「Export All Diagrams SVG」として出力するだけでなく、
   アプリ内でも `<iframe srcdoc>` によるプレビューとして提供するか（将来検討）。

5. **`#122` との連携設計**: GitHub Actions テンプレートでは
   `karasu render --all-views` + `karasu render --view system` など複数の出力パターンを
   どのように使い分けるか。README への埋め込みパターンのドキュメント化が必要。
