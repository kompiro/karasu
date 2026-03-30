# SVG エクスポート（ドリルダウン対応）

- **日付**: 2026-03-28
- **更新**: 2026-03-30（Full View 定義追加・Phase 2 実装完了）
- **ステータス**: 実装済み（Phase 1・Phase 2 完了）
- **関連**: [Issue #22](https://github.com/kompiro/karasu/issues/22), [2レイヤレンダリング](two-layer-rendering.md), [インタラクティブ SVG レンダリング](interactive-svg-rendering.md)

## Full View の定義

**Full View（全体ビュー）** とは、ビュー種別ごとの全ドリルダウン層を一度に展開したビューである。

### System ビューの層構造

System ビューのノード階層は以下の5層からなる:

```
system
└── service
    └── domain
        └── usecase
            └── resource
```

通常のインタラクティブプレビューでは1層ずつドリルダウンするが、
Full View では **すべての層（system 〜 resource）を含む全レベルを同時にレンダリング** し、
ユーザーがレベル間をリンクで行き来できる。

### Org ビューの層構造

```
organization
└── team
    └── team（サブチーム）
        └── …（任意の深さ）
```

### Deploy ビュー

Deploy ビューはフラットなコンテナビューであり、ドリルダウン構造を持たない。
**Deploy タブでは Full View ボタンを表示しない。**

---

## 背景・課題

現在のプレビューは React + DOM イベント委譲でドリルダウン・パン/ズームを実現しているが、
図を他者と共有したり、ドキュメントに埋め込む際には **スタンドアローンなファイル** が必要になる。

また、アプリ内でも「全体ビュー（全ドリルダウンレベルを一度に閲覧できるビュー）」を
ツールバーのボタンで切り替えられるようにしたい。
**アプリ内の全体ビューとエクスポートされる SVG は同一のもの** を使う。

`core` パッケージが生成する SVG 文字列にはすでに `data-node-id`・`data-has-children` 属性が含まれており、
これを活用することで JavaScript 不要のドリルダウン対応 SVG を生成できる可能性がある。

## 制約・前提

- エクスポートは **現在表示中のタブ（system / deploy / org）** を対象とする
- `core` パッケージは Pure TypeScript。ブラウザ API（Blob, URL.createObjectURL 等）に依存しない
- ダウンロードのトリガー（Blob 生成・`<a>` クリック）は `app` パッケージの責務
- CSS `:target` + `:has()` は Chrome 105+, Firefox 121+, Safari 15.4+ で対応済み
- エクスポート後の SVG にはパン/ズーム機能はない（静的）

### アプリ内埋め込みの課題：URL フラグメント競合

案C の SVG は `<a href="#krs-view-X">` によるフラグメントナビゲーションを使う。
この SVG を `dangerouslySetInnerHTML` でアプリの DOM に直接埋め込むと、
クリック時に **親ページの URL フラグメントが変化** し、アプリの状態（React Router 等）と衝突する。

**解決策: `<iframe srcdoc>` による分離**

全体ビューモード時は、SVG 文字列を `<iframe srcdoc={svgContent}>` で表示する。
iframe 内のフラグメントナビゲーションは親ページの URL に影響しない。

```tsx
// 全体ビューモード
<iframe
  srcdoc={multiLevelSvg}
  style={{ width: "100%", height: "100%", border: "none" }}
  title="Full diagram view"
/>
```

エクスポート時はこの `multiLevelSvg` 文字列をそのまま Blob としてダウンロードするため、
アプリ内表示とエクスポート内容が完全に一致する。

## 検討した選択肢

### 案A: 現在のビューをそのまま保存（最小実装）

現在 `PreviewPane` が受け取っている `svg` 文字列を Blob に変換してダウンロードする。

```typescript
// app 側のみ変更、core 変更なし
function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**メリット**
- app 側だけの変更で完結。core への影響ゼロ
- 実装コストが最小（ツールバーにボタン追加 + 上記関数のみ）

**デメリット**
- ドリルダウンなし。現在表示中のレイヤーだけが出力される
- `data-node-id` 等のインタラクション用属性がファイルに残る（無害だが冗長）
- 「現在のビュー」以外のレイヤーを参照できない

---

### 案B: 複数 SVG ファイルを ZIP でダウンロード

各ドリルダウンレベルを個別の SVG ファイルとして生成し、ZIP にまとめてダウンロードする。

- `system.svg` → トップレベル、各 service ノードが `<a href="service-ECommerce.svg">` でリンク
- `service-ECommerce.svg` → ECommerce のドリルダウンビュー、戻りリンクあり

**メリット**
- 各 SVG が小さくシンプル
- SVG ビューア（Inkscape, ブラウザ等）で `<a>` リンクが動作する
- ブラウザ非依存（ローカルファイルとしても機能）

**デメリット**
- ZIP ライブラリが必要（`fflate` 等を追加依存）
- 複数ファイル間のリンクはローカルファイルシステムでのみ動作（HTTP サーバ経由では相対パス問題が発生しやすい）
- 実装コストが案AよりもC同等以上に高い

---

### 案C: 単一 SVG に全レイヤーを埋め込み（ハッシュナビゲーション）

> **実装メモ（2026-03-30）**: 設計段階では CSS `:target` + `:has()` による JavaScript 不要の実装を想定していたが、
> SVG の `<style>` 要素内では `:has()` がブラウザ間で信頼性に欠けることが判明。
> 実装では `<iframe srcdoc>` 内に JavaScript（`hashchange` + `DOMContentLoaded`）を注入して
> `.krs-view` グループの表示制御を行う方式に変更した（`sandbox="allow-scripts"` が必要）。

全ドリルダウンレベルを1つの SVG ファイルに埋め込む。CSS の `:target` + `:has()` セレクタで
アクティブなビューを切り替える。JavaScript 不要。

#### SVG の構造

```xml
<svg xmlns="http://www.w3.org/2000/svg" ...>
  <defs>
    <!-- 共有マーカー等 -->
  </defs>

  <style>
    /* デフォルト: root 以外は非表示 */
    .krs-view { display: none; }
    /* fragment 未指定時は root を表示 */
    svg:not(:has(.krs-view:target)) #krs-view-root { display: block; }
    /* fragment 指定時は対象を表示 */
    .krs-view:target { display: block; }
  </style>

  <!-- トップレベル -->
  <g id="krs-view-root" class="krs-view">
    <!-- 通常の SVG コンテンツ -->
    <!-- 子を持つノードは <a href="#krs-view-ECommerce"> でラップ -->
    <a href="#krs-view-ECommerce">
      <g data-node-id="ECommerce" data-has-children="true">...</g>
    </a>
  </g>

  <!-- ECommerce ドリルダウン -->
  <g id="krs-view-ECommerce" class="krs-view">
    <!-- 戻りボタン -->
    <a href="#krs-view-root">
      <g class="krs-back-button">
        <rect .../>
        <text>← 戻る</text>
      </g>
    </a>
    <!-- ドリルダウンビューの SVG コンテンツ -->
  </g>

  <!-- ... 他のドリルダウンビュー ... -->
</svg>
```

#### CSS メカニズム

```css
/* 全ビュー非表示 */
.krs-view { display: none; }

/* fragment なし → root を表示 */
svg:not(:has(.krs-view:target)) #krs-view-root { display: block; }

/* fragment あり → 対象ビューを表示 */
.krs-view:target { display: block; }
```

`svg:has(.krs-view:target)` は「SVG 内に `:target` な `.krs-view` が存在するか」を問う。
`:has()` が使えることで「他のビューが選択されたら root を隠す」が CSS だけで実現できる。

#### core の変更

```typescript
// packages/core/src/index.ts に追加
export function buildExportSvg(
  source: string,
  options?: { includeAllLevels?: boolean }
): string;
```

内部では:
1. ソースをパース・コンパイルして全ノード情報を取得
2. ルートレベルの SVG を生成（既存の `render()` 利用）
3. `data-has-children="true"` のノードを列挙
4. 各ノードのドリルダウンビューを再帰的に生成（最大2段階）
5. 各ビューを `<g id="krs-view-{id}" class="krs-view">` でラップ
6. 子を持つノードの `<g>` を `<a href="#krs-view-{id}">` でラップ
7. 各ドリルダウンビューに戻りボタンを追加
8. 全体を単一 SVG として組み立て

**メリット**
- 単一ファイルで完結
- JavaScript 不要
- ブラウザ・SVG ビューア（モダン版）で動作
- `core` パッケージに純粋関数として実装できる（ブラウザ非依存）

**デメリット**
- 実装コストが案Aより高い（core に新関数追加が必要）
- `:has()` 非対応の古い SVG ビューア（Inkscape 1.2 以下等）では動作しない
- 全レベルを一度にレンダリングするため、大規模な図では SVG サイズが増大する
- `<a>` ラップと `data-*` 属性の整合性を維持する必要がある

---

## 比較

| 観点 | 案A（現在ビューのみ） | 案B（ZIP） | 案C（単一 SVG + CSS :target） |
|------|-------------------|-----------|-----------------------------|
| ドリルダウン | なし | あり（複数ファイル） | あり（CSS のみ） |
| 実装コスト | 低 | 高 | 中 |
| 外部依存追加 | なし | ZIP ライブラリ | なし |
| 単一ファイル | ✓ | ✗（ZIP） | ✓ |
| core 変更 | なし | あり | あり |
| ブラウザ対応 | すべて | すべて | Chrome 105+ / FF 121+ / Safari 15.4+ |
| SVG ビューア対応 | すべて | すべて（相対パス制約あり） | モダンのみ |
| 共有しやすさ | △（1レベルのみ） | △（ZIP 解凍が必要） | ○（1ファイルをそのまま共有） |

## 現時点の方針

**2フェーズで実装する。**

### Phase 1: 案A（現在ビューのみ Export）

まず最小実装として案Aを実施する。

- ツールバーに「Export SVG」ボタンを追加（アイコン + テキストラベル）
- 現在の `svg` 文字列を `image/svg+xml` の Blob としてダウンロード
- ファイル名: `{diagram-label}-{activeView}.svg`（例: `ECプラットフォーム-system.svg`）
- core への変更なし

### Phase 2: 案C（CSS :target ドリルダウン + 全体ビュー切り替え）

Phase 1 の後、全体ビュー機能と合わせて実装する。

#### core の変更

- `buildExportSvg(source: string): string` を追加
  - 全ドリルダウンレベルを埋め込んだ単一 SVG を返す
  - ブラウザ API に依存しない Pure TS 関数
  - System ビューは最大 4 深度（system 直下から service / domain / usecase / resource まで）
  - Org ビューは最大 10 深度（実用上の上限）

#### app の変更

- ツールバーに「全体ビュー」トグルボタンを追加（アイコン + テキストラベル）
  - ON: `<iframe srcdoc={multiLevelSvg}>` でプレビューエリアを置き換え
  - OFF: 通常の drill-down プレビューに戻る
- Phase 1 の「Export SVG」ボタンの動作を更新
  - 全体ビューモード ON 時: multi-level SVG をダウンロード
  - 全体ビューモード OFF 時: 現在ビューの SVG をダウンロード（Phase 1 挙動を維持）

#### ツールバーの最終レイアウト（Phase 2 後）

```
[ 全体ビュー (toggle) ]  [ Export SVG ]  [ ? Reference ]
```

## 未解決の問い

1. **ファイル名の決定ロジック**: diagram ラベルがない場合のフォールバック（`diagram.svg` 等）
2. **大規模図のサイズ制限**: 全レベルを埋め込む際、ノード数が多い場合の SVG サイズをどう扱うか（警告表示など）
3. **戻るボタンのデザイン**: SVG 内に描画する「← 戻る」ボタンのスタイルをどう統一するか
4. ~~**deploy / org タブの扱い**~~ → **解決済み（2026-03-30）**: Deploy は Full View 非対応（ボタン非表示）。Org は Full View 対応（team の入れ子を全展開）。
5. **iframe のアクセシビリティ**: `title` 属性以外に必要な対応はあるか
