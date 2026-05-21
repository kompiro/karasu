# SVG 図のライト / ダークテーマ対応

- **日付**: 2026-05-21
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1479](https://github.com/kompiro/karasu/issues/1479)
  - 関連 ADR: [ADR-20260520-06](../adr/20260520-06-app-css-modularization-and-light-theme.md)（app.css モジュール化・ライトテーマ — SVG 図は対象外と明記）
  - 関連 ADR: [ADR-20260312-04](../adr/20260312-04-css-inspired-styling.md)（CSS 風スタイリング・built-in stylesheet）
  - 関連 TPL: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)（表示モード / グローバル切替の全描画面点検）
  - コード: `packages/core/src/renderer/*.ts`, `packages/core/src/builtins/default-style.ts`

## 背景・課題

ADR-20260520-06 で app の chrome（パネル・ツールバー・サイドバー・エディタ）に
ライトテーマが入った。しかし**レンダリングされる SVG 図そのものは対象外**と
明記されたため、light モードでは「明るい chrome の中に、暗い背景の図が乗る」
という不整合が残っている。プレビューキャンバスはトークン経由でテーマに追従するが、
その上に置かれる SVG 図は暗いままである。

原因は `packages/core` の SVG レンダラが色をハードコードしていることにある。
レンダラ側の構造色（凡例・パンくず・タブバー・空状態など）は app の CSS 変数とは
独立しており、図は app のテーマに追従できない。

## 現状（インベントリ）

### レンダラがハードコードしている色

`packages/core/src/renderer/*.ts` に約 35 個の hex リテラルが散在する。これらは
**図の構造色（chrome）** であり、ノード / エッジのスタイルとは別系統である。

| 箇所 | ファイル | 例 |
| --- | --- | --- |
| キャンバス背景 | `svg-renderer.ts` | `#0F172A` |
| 凡例 | `svg-builder.ts` | `LEGEND_BG=#1F2937` / `LEGEND_BORDER=#334155` / `LEGEND_TEXT=#E5E7EB` / `LEGEND_MUTED=#9CA3AF` |
| 空状態・補助テキスト | `svg-renderer.ts` / `deploy-renderer.ts` | `#9CA3AF` / `#64748B` / `#94A3B8` |
| パンくず（multi-level） | `multi-level-svg.ts` | bg `#1E293B` / text `#E2E8F0` / link `#60A5FA` |
| タブバー・戻るボタン（drill-down） | `drill-down-svg.ts` | tab `#1E293B` / active `#334155` / text `#E2E8F0` 等 8 色 |
| セクションラベル（all-layers） | `all-layers-svg.ts` | `ALL_LAYERS_BG=#0F172A` / label `#64748B` |
| org tree | `org-tree-renderer.ts` / `org-renderer.ts` | team fill `#1E293B` / stroke `#475569` / text `#E2E8F0` 等 |
| diff インジケータ・ghost edge | `svg-renderer.ts` | `#3B82F6` / `#94A3B8` |

### ノード / エッジのスタイル色（カスケード系統）

`packages/core/src/builtins/default-style.ts` には約 70 個の色があり、これは
**`.krs.style` カスケードの built-in stylesheet**（ADR-20260312-04）である。
ノード種別ごとの `background-color` / `color` / `border-color` を定義し、
レンダラ定数とは別レイヤーで、ユーザーが `.krs.style` で上書きできる。
`packages/core/src/builtins/reference-data.ts` のアノテーションバッジ色
（deprecated / new / experimental / migration の 4 色）も同系統の semantic
accent 色である。

本 Doc では**この built-in stylesheet にも light 変種を与える**（後述）。
レンダラ chrome 色とこのカスケード色の 2 レイヤーを、単一の `theme` 引数で
同時に切り替える。

### レンダラの options 引き回し

`render()` は末尾に `options?: RenderOptions` という汎用バッグを受ける。
`displayMode?: DisplayMode`（`"shape" | "icon"`）は専用引数として全ビルダ
（`buildDrillDownSvg` / `buildAllLayersSvg` / `compileProject` 等）を貫通している。
**テーマ引数は displayMode と同じ経路で引き回せる。**

### 3 つの consumer

| consumer | 接続点 | 現在渡しているもの |
| --- | --- | --- |
| app | `packages/app/src/hooks/useViewSvg.ts` | `fileContent` / `styleSource` / `displayMode` / `emptyStateLabels` |
| CLI | `packages/cli/src/render.ts`（`karasu render`） | `--view` のみ |
| VS Code | `packages/vscode/src/preview-panel.ts` | `diagramType` / `displayMode` / `viewPath` |

CLI と VS Code export は**自己完結した `.svg` ファイル**を書き出す。app の CSS 変数
コンテキストが無いため、レンダラが `fill="var(--diagram-bg)"` を吐いて app CSS に
依存することはできない。

## 制約・前提

- SVG は app プレビュー（DOM 内インライン）・`karasu render`（standalone `.svg`）・
  VS Code（プレビュー + export）の 3 経路で消費される。standalone SVG も成立する
  テーマ機構でなければならない。
- standalone `.svg` はブラウザ以外（Inkscape・OS の画像プレビュー・Markdown
  レンダラ等）でも開かれる。これらは CSS `<style>` ブロックや
  `prefers-color-scheme` メディアクエリを十分にサポートしないことがある。
- 後方互換: 既存の `karasu render` 出力・既存テストの SVG スナップショットは
  デフォルトで現状（dark）を維持する。
- レンダラは `packages/core`（Pure TS）。app の CSS 変数を参照できない。
- TPL-20260510-06: テーマは「描画全体に影響するグローバル切替」であり、
  **すべての描画面**（凡例 / パンくず / タブ / org tree / diff / 空状態、および
  Full View・export SVG などの代替描画パス）が追従する必要がある。
- テーマ化の対象は 2 レイヤー: (a) レンダラ chrome 色（約 35 リテラル）、
  (b) built-in stylesheet（`default-style.ts` の約 70 色 + `reference-data.ts` の
  バッジ色）。両者を単一の `theme` 引数で切り替える。
- built-in stylesheet の light 変種はカスケードの**最下層**に置き、ユーザーの
  `.krs.style` は従来どおりその上で勝つ（明示的に色を指定したユーザー図は両
  テーマで意図どおりに保たれる）。

## 検討した選択肢

検討の中心は **standalone SVG が色をどう持ち運ぶか** である。

### 案1: パレット引数 + 解決済み色を埋め込む（resolve-and-embed）

レンダラに `theme: "dark" | "light"` を受け取らせ、内部で `DiagramPalette` を
解決し、**リテラル hex を SVG 属性に直接書き込む**。consumer はそれぞれの実効
テーマを渡し、テーマ変更時に再レンダリングする（app は displayMode 変更時に
すでに再レンダリングしているため追加コストは無い）。

```ts
// packages/core/src/renderer/palette.ts（新規）
export interface DiagramPalette {
  canvasBg: string;
  legendBg: string; legendBorder: string; legendText: string; legendMuted: string;
  mutedText: string; subtitleText: string;
  breadcrumbBg: string; breadcrumbText: string; breadcrumbSeparator: string; breadcrumbLink: string;
  tabBg: string; tabActiveBg: string; tabText: string; /* ... */
  orgTeamFill: string; orgTeamStroke: string; /* ... */
  diffGhost: string; diffIndicator: string; /* ... */
  sectionLabel: string;
}
export const darkPalette: DiagramPalette = { /* 現在の値 */ };
export const lightPalette: DiagramPalette = { /* 新規 */ };
```

**メリット**

- どの SVG レンダラでも確実に表示される（リテラル色のみ。`<style>` / メディア
  クエリ非依存）。
- `var()` を SVG presentation attribute に書く互換性リスクが無い。
- 実装が素直: ハードコード定数をパレット参照に置換するだけ。
- 既存のスナップショットテストはデフォルト dark で無変更。
- export された `.svg` がテーマ固定 = ドキュメント貼り付け時に見た目が安定する
  （むしろ望ましい性質）。

**デメリット**

- standalone SVG は 1 つのテーマに固定され、閲覧者の OS 設定に追従しない。
- consumer がテーマを切り替えると再レンダリングが必要（app は元々再レンダ
  しているため実害なし。CLI/VS Code export も 1 回限りなので問題なし）。

### 案2: SVG 内 `<style>` + CSS カスタムプロパティ + `prefers-color-scheme`

レンダラが SVG 内に `<style>` ブロックを吐き、`--krs-*` カスタムプロパティを
dark / light 両方定義し、`@media (prefers-color-scheme: light)` で切り替える。
要素は class 経由で `fill` を CSS から受ける。

**メリット**

- standalone SVG が閲覧環境の OS テーマに自動追従する（1 ファイルで両対応）。

**デメリット**

- presentation attribute `fill="..."` は `var()` を確実には解決しない。要素に
  `class` を付け `<style>` で `fill` を当てる方式へ要素出力を全面改修する必要が
  あり、変更量が大きい。
- ブラウザ以外の SVG レンダラはメディアクエリ / `<style>` 非対応のことがあり、
  standalone export が崩れる（制約に反する）。
- app は OS と異なるテーマを強制できない（System/Light/Dark セレクタの Light を
  選んでも OS が dark なら図は dark のまま）。結局 app 側で属性注入が要る。

### 案3: ハイブリッド（属性切替可能な `<style>`）

案2 の `<style>` を `prefers-color-scheme` と root `<svg>` の `data-theme` 属性
両方で効くようにし、`theme: "auto"` のときメディアクエリ、明示テーマのとき
`data-theme` 固定とする。

**メリット**

- 自動追従と強制切替の両立。

**デメリット**

- 案2 の `var()` / 非ブラウザレンダラ問題をそのまま抱える。
- 機構が最も複雑。Issue が解こうとしている不整合に対し過剰。

## 比較

| 観点 | 案1 resolve-and-embed | 案2 `<style>`+メディアクエリ | 案3 ハイブリッド |
| --- | --- | --- | --- |
| 変更量 | 小（定数 → パレット参照） | 大（要素を class 化） | 大 |
| standalone の堅牢性 | ◎ 全レンダラで表示 | △ 非ブラウザで崩れ | △ |
| OS テーマ自動追従 | × | ○ | ○ |
| app でのテーマ強制 | ◎ 引数で渡す | × 別途属性注入 | ○ |
| `var()` 互換リスク | 無し | あり | あり |
| 後方互換（snapshot） | ◎ default dark で無変更 | 要調整 | 要調整 |

## 現時点の方針

**案1（resolve-and-embed）を採用する。**

理由:

- Issue が解きたいのは「app プレビューの図を chrome のテーマに一致させる」こと。
  app は実効テーマを知っており、テーマ変更時に再レンダリングする経路が既にある
  （`displayMode` と同じ）。案1 で過不足なく解決できる。
- standalone `.svg` の堅牢性（非ブラウザレンダラでも表示される）は制約であり、
  案1 はリテラル色のみでこれを満たす。案2/3 は `<style>` / メディアクエリ依存で
  この制約に反する。
- 案2/3 の「OS テーマ自動追従」は便利だが本 Issue の要求ではない。将来 CLI で
  `--theme auto`（メディアクエリ出力）が欲しくなったら案1 の上に追加できる
  （「未解決の問い」参照）。
- 変更量が最小で、既存スナップショットがデフォルト dark のまま無変更。

### 実装の指針

1. **パレット抽象の新設** — `packages/core/src/renderer/palette.ts` に
   `DiagramPalette` 型・`darkPalette`（現行値を移設）・`lightPalette`（新規）を
   定義する。`DiagramTheme = "dark" | "light"` 型と `resolvePalette(theme)` も置く。
2. **ハードコード定数の置換** — `svg-builder.ts` / `svg-renderer.ts` /
   `org-tree-renderer.ts` / `org-renderer.ts` / `deploy-renderer.ts` /
   `drill-down-svg.ts` / `all-layers-svg.ts` / `multi-level-svg.ts` の hex
   リテラルをパレット参照に置換する。
3. **built-in stylesheet の light 変種** — `default-style.ts` を
   `defaultStyleSheet(theme: DiagramTheme)` 形に変え、dark / light 2 セットの
   ノード / エッジ色を返す。`reference-data.ts` のバッジ色も同様にテーマ別に
   する。スタイル解決で built-in stylesheet を積む箇所（`compileProject` 等、
   icon-theme シートを足している箇所付近）に theme を渡し、カスケード最下層に
   theme 対応 built-in シートを置く。ユーザー `.krs.style` は従来どおりその上で
   勝つ（cascade order = `[builtinSheet(theme), iconThemeSheet?, ...userSheets]`）。
4. **theme の引き回し** — `displayMode` と同じ経路で `theme?: DiagramTheme` を
   全ビルダ（`render` / `renderDeploy` / `renderOrgView` / `renderOrgTreeView` /
   `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllLayersSvgOrg` /
   `buildDrillDownSvgOrg` / `buildAllViewsSvg` / `compileProject` / 各 diff 系）に
   貫通させる。`theme` はレンダラ chrome パレットと built-in stylesheet の両方を
   駆動する。デフォルトは `"dark"`（後方互換）。TPL-20260510-06 に従い、
   `displaymode-meta.test.ts` の consumer 列挙パターンに倣って **theme を消費する
   全エントリポイントを meta-test で列挙**し、追従漏れを code review で検出可能に
   する。
5. **app の配線** — `useViewSvg.ts` に実効テーマ（`light` / `dark`。`system` は
   `ThemeProvider` が解決済みの concrete 値）を渡し、テーマ変更で再レンダリング
   させる。`packages/core` の renderer 定数に生色が無いことを検証する既存の発想
   （app の `styles-no-raw-color.test.ts`）を core 側にも適用できるか検討する。
6. **CLI の配線** — `karasu render` に `--theme <dark|light>` オプションを追加。
   デフォルト `dark`（既存出力を維持）。
7. **VS Code の配線** — `preview-panel.ts` で VS Code のエディタテーマ
   （`vscode.window.activeColorTheme.kind`）を `theme` にマップしてプレビューに
   渡す。export 時も同様。
8. AT: `docs/acceptance/` に新規ファイル。TC は:
   - app を light テーマにすると、プレビュー内の SVG 図（キャンバス背景・凡例・
     ノード色）が light になり chrome と一致する。
   - app を dark に戻すと図も dark に戻る。
   - ユーザー `.krs.style` で明示指定した色は light / dark どちらでも維持される。
   - `karasu render --theme light` が light テーマの `.svg` を出力する。
   - `karasu render`（オプション無し）が従来どおり dark を出力する（後方互換）。
   - drill-down / all-layers / org / deploy の各代替描画パスでも theme が反映される
     （TPL-20260510-06 の全描画面点検）。
9. ADR 昇格: 実装完了後、`docs/adr/YYYYMMDD-NN-svg-diagram-theming.md` として
   昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。`theme` のデフォルトは `dark` で既存出力を維持する。
- ドキュメント更新: `docs/spec/` の `karasu render` オプション説明に `--theme` を
  追記。`docs/concepts.md` への影響は無し（新概念ではなく描画オプション）。
- テスト・examples への影響: 既存 SVG スナップショットはデフォルト dark のため
  無変更。light テーマ用のスナップショットを新規追加する。

## Related TPLs

- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)
  — テーマは「描画全体に影響するグローバル切替」であり、`applicable_to` が
  「テーマ・モード・スタイルカスケードに優先順位の差を持ち込む変更」を明示的に
  含む。本設計はこの TPL の既存スコープに収まるため **新規 proactive TPL は
  起こさない**。実装時のチェックリスト（全描画面の点検・代替描画パスへの追従・
  meta-test への登録）として TPL-20260510-06 をそのまま適用する。

## 決めないこと（意図的なスコープ外）

- **CLI の `--theme auto`**: standalone SVG が閲覧環境の OS テーマに自動追従する
  出力（案2 のメディアクエリ方式）。本 Issue の要求ではないため見送り、要望が
  あれば案1 の上に追加機構として検討する。

