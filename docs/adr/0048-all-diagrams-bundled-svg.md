# ADR-0048: 全ビュー統合バンドル SVG（buildAllViewsSvg）

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: Issue #121, Issue #122, Issue #123, [ADR-0037](0037-svg-export-two-phase.md)

## 背景

従来の SVG エクスポートは 1 ビュー（system / deploy / org）ごとに個別の SVG を生成していた。各ビュー内のドリルダウンナビゲーションは CSS `:target` で実現されているが、ビューをまたぐナビゲーション（例: system タブ → org タブ）はサポートされていなかった。CLI render コマンド (#121) と GitHub Actions 連携 (#122) の実現に向けて、1 つの SVG ファイルで全ビューを閲覧できる形式が求められた。

## 決定

`buildAllViewsSvg(krsSource, styleSource?, displayMode?): string` を `packages/core` に追加し、system / deploy / org 全ビューを単一 SVG にバンドルする。**ID プレフィックス方式**でビューとレベルを同時に識別する：

```
krs-system-root          ← system view のルート
krs-system-ServiceA      ← system view の ServiceA ドリルダウン
krs-deploy-root          ← deploy view のルート
krs-org-root             ← org view のルート
krs-org-TeamA            ← org view の TeamA ドリルダウン
```

CSS `:has([id^="krs-system-"]:target)` セレクターで「`krs-system-` で始まる ID が `:target` 状態のとき」を検出し、対応するパネルを表示する。タブバー（SVG `<a>`）からビュー切り替えを行う。

### 後方互換の扱い

既存の drill-down ID スキーム（`krs-view-root` 等）は廃止し、新スキーム（`krs-system-root` 等）に統一する。互換レイヤーは持たず、専用のリファクタリング Issue として切り出す。

### Deploy ビューの階層化

現時点では Deploy はフラット表示のみ。将来の階層化に備えて ID スキーム・構造は拡張可能に設計する。

### タブの disabled 表示

`.krs` ファイルに定義がないビューのタブは `pointer-events: none` + 薄色で disabled スタイルを適用し、レイアウトの安定性のために要素自体は SVG に含める。

### サイズ決定

- **width**: 全パネル中の最大幅
- **height**: `TAB_HEIGHT + 全パネル中の最大高さ`

CSS では `viewBox` の動的変更ができないため、コンテンツが小さいビューのパネル下部には余白が生じることを許容する。

## 理由

- **CSS-only**: JavaScript 不要、既存の drill-down SVG と同じ方針。GitHub の Markdown レンダラーや SVG ビューアで動作する
- **単一ファイル**: ZIP 等の複数ファイル形式は採用せず、CI でアーティファクトとして 1 ファイルを commit/共有できる
- **ID プレフィックス**: フラグメント ID 一つでビュー × ドリルダウンレベルを同時に表現できる。CSS `:target` の「同時に 1 要素のみ対象」制約を回避できる
- **cross-view リンク**: `.krs` のアロー定義で別ビューのノードを参照する場合、`href="#krs-{targetView}-{targetNodeId}"` でタブ切替 + ドリルダウンが同時に発生する自然なナビゲーションを実現できる
- **後方互換を持たない**: 内部 ID スキームの統一を優先し、互換レイヤーで複雑性を増やさない

## ブラウザ対応

CSS `:has()` が必要なため Chrome 105+ / Firefox 121+ / Safari 15.4+（既存の drill-down SVG と同じ前提）。

## 関連の注記

- アプリ内プレビューでの `<iframe srcdoc>` 利用は別 Issue で検討（本決定のスコープ外）
- `#122` の GitHub Actions テンプレートとの連携設計は #122 側に追記
