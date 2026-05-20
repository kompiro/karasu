# app.css のモジュール分割とライトテーマ対応

- **日付**: 2026-05-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1470](https://github.com/kompiro/karasu/issues/1470)
  - 関連 ADR: [ADR-20260515-01](../adr/20260515-01-adopt-shadcn-ui.md)（shadcn/ui 採用・`@theme inline` ブリッジ）
  - 関連 TPL:
    - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)（表示モード / グローバル切替は全描画面の点検と precedence 設計が必要）
    - [TPL-20260518-01](../test-perspectives/TPL-20260518-01-involutive-toggle-renders-both-states.md)（両方の結果状態を end-to-end で検証）
    - [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md)（interactive control の a11y 契約はリファクタで静かに壊れる）
  - コード: `packages/app/src/styles/app.css`, `packages/app/src/main.tsx`, `packages/app/src/components/SettingsPane.tsx`

## 背景・課題

`packages/app/src/styles/app.css` は単一ファイルで約 2900 行に肥大化している。
すべてのデザイントークンが 1 つの `:root` ブロックに dark 専用の生値で定義され、
コンポーネントスタイルが 40 近いセクションとして同居している。

このため次の 2 つの問題がある。

1. **ファイルが肥大化してナビゲートしづらい** — 特定コンポーネントのスタイルを
   探すのにスクロール量が大きく、PR の diff も追いにくい。
2. **ライトテーマを提供できない** — トークンが dark 固定の生値であり、さらに
   `:root` の外にハードコードされた色（影の `rgba(0,0,0,*)`、warning の amber、
   diff 色など）が散在するため、テーマを切り替える土台がない。

本 Design Doc は (A) `app.css` のモジュール分割と (B) ライトテーマ対応を、
同時に成立する 1 つの設計として扱う。両者は「色をすべてトークン経由にする」
という同じ作業に依存しており、別々に進めると二度手間になるためである。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `app.css` | 単一ファイル 約 2900 行。`main.tsx` が直接 `import "./styles/app.css"` |
| トークン定義 | `:root` に primitive token を一括定義（`--bg-*` 6 段, `--text-*`, `--accent*`, `--feather*`, `--border-*` 5 段, semantic states, `--radius-*`, layout 寸法, `--font-*`）。すべて dark 専用の生値 |
| shadcn ブリッジ | `@theme inline` で Tailwind token → karasu CSS 変数（ADR-20260515-01）。`background` / `foreground` / `popover` / `border` / `ring` / `accent` / `muted` を橋渡し |
| `@source` / preflight | Tailwind v4 の `@source "../**/*.{ts,tsx}"`、preflight 有効 |
| ハードコード色 | `:root` の外に生 hex / rgba が散在: 影 `rgba(0,0,0,.4〜.65)`、上端ハイライト `rgba(255,255,255,.025〜.04)`、warning の amber `#f59e0b` と `rgba(245,158,11,*)`（特に Reference Panel に多数）、diff 色 `#22c55e`/`#ef4444`、info blue `#93c5fd`、slate 系 `#94a3b8`/`#cbd5e1`/`#e2e8f0`、`node-detail-nav-btn` の `#334155`/`#60a5fa`/`#1e3a5f`/`#3b82f6` |
| 未定義トークン参照 | `--bg-elevated`（`.deploy-block-selector`）、`--text-tertiary`（context menu 系）が fallback 付きで参照されるが `:root` に定義がない |
| `--diff-*` トークン | diff セクション内の後続 `:root` で `--diff-color-added` 等を定義（定義が分散） |
| テーマ切替 | 存在しない。dark 固定 |
| 設定の永続化 | API key は `utils/api-key-storage.ts`、locale は i18n の `LocaleProvider` が担当。`localStorage` 利用パターンは既存 |
| Monaco エディタ | `EditorPane.tsx` が `karasu-dark` テーマ（`base: "vs-dark"`、`editor.background: #0f172a`、構文色 8 種）をハードコード定義し、`theme="karasu-dark"` 固定で渡す。エディタは左ペインのほぼ全面を占める大面積 |
| SVG 図のレンダラ | `packages/core` のレンダラが約 35 個の hex 色をハードコード。app の CSS 変数とは独立 |

## 制約・前提

- **後方互換**: 既存のクラス名・DOM 構造は変えない。`app.css` を分割しても
  `main.tsx` が import するエントリは 1 つ（`index.css`）に保つ。
- **Tailwind v4 / shadcn 構成を壊さない**: `@import "tailwindcss"`、`@source`、
  `@theme inline`、preflight 有効はそのまま維持する。`@theme inline` が
  `var(--bg-base)` 等を inline 参照しているのは「実行時に解決させる」ためであり、
  テーマ切替と相性が良い（ビルド時に dark 値で焼き付かない）。
- **FOUC を出さない**: 初回ペイント前にテーマが確定していること。
- **in scope（Issue #1470 上で確定）**:
  - Monaco エディタのテーマ連動。`karasu-light` テーマを新規定義し、app の
    実効テーマに応じて `karasu-dark` / `karasu-light` を切り替える。エディタは
    大面積のため、未連動だとライトテーマが半端に見えるため。
  - プレビューキャンバス（背景・グリッド）はトークン経由でテーマに追従する。
- **out of scope**:
  - **SVG 図そのものの再テーマ化**。`packages/core` のレンダラの色見直しは
    影響範囲が広く（CLI / VS Code の export SVG にも波及）別 Issue とする。
    ライトテーマでは明るいキャンバスの上に現状の（暗い）図が乗る。これは
    core レンダラがテーマ化されるまでの既知の暫定状態。
  - 既存 `.dialog__*` / `.toolbar-btn*` のレガシー CSS の除去（別の cleanup pass）。

## 検討した選択肢

### 案1: `app.css` 単一ファイルのまま、末尾にテーマ override を追記

`app.css` はそのまま、`:root` を dark、`[data-theme="light"]` ブロックを末尾に
足す。ハードコード色だけトークン化する。

**メリット**

- 変更ファイル数が少なく diff が局所的。

**デメリット**

- ファイル肥大の問題（課題 1）が未解決のまま。
- トークン定義とコンポーネントスタイルが同居し続け、テーマ追加時にどこを
  触ればよいかが不明瞭。
- Issue #1470 のスコープ（分割）を満たさない。

### 案2: `styles/` ディレクトリへ分割 + テーマトークン層を新設（採用）

`app.css` を役割別の複数ファイルに分割し、`@import` で束ねる。色トークンを
`themes.css` に集約し、dark / light の 2 セットを定義する。

```
packages/app/src/styles/
  index.css         ← エントリ。@import 群 + @source + @theme inline
  base.css          ← フォント @import, html/body/#root リセット, スクロールバー
  tokens.css        ← 非色トークン（--radius-*, --font-*, レイアウト寸法）
  themes.css        ← 色トークン: :root（dark 既定）+ :root[data-theme="light"]
  layout.css        ← app-shell / app / グリッド / edit-area / ペイン配置
  components/        ← 機能別コンポーネントスタイル
    chat.css, settings.css, file-tree.css, context-menu.css,
    diagram.css, node-detail.css, reference-panel.css, ...
```

ファイル粒度（`components/` を何分割するか）は実装時に調整可。目安は
「現状の `── セクション ──` 見出し単位、近接するものは束ねる」。

**メリット**

- 課題 1・2 を同時に解決。トークン定義（`themes.css`）と利用箇所（`components/*`）
  が分離し、テーマ追加時の触る場所が `themes.css` に限定される。
- 既存のトークン名（`--bg-base`, `--text-primary`, `--border-strong` …）が
  すでに役割ベース（depth / hierarchy）で命名されており、**そのまま意味的
  トークン層として使える**。リネーム不要で、light 値を与えるだけでよい。

**デメリット**

- 変更ファイル数・diff が大きい。レビュー負荷が高い（行の移動が主体）。
- `@import` の順序とカスケード順を崩すと既存スタイルが壊れる。

## 比較

| 観点 | 案1 | 案2 |
| --- | --- | --- |
| 課題1（肥大化）の解決 | × | ○ |
| 課題2（ライトテーマ土台）の解決 | △（同居のまま） | ○ |
| 変更量 / レビュー負荷 | 小 | 大（大半は行移動） |
| テーマ追加時の触る場所 | 不明瞭 | `themes.css` に限定 |
| Issue #1470 スコープ充足 | × | ○ |

## 現時点の方針

**案2 を採用する** — Issue #1470 のスコープが分割を含むこと、および分割と
テーマ対応が「色をトークン経由に統一する」同一作業に依存するため、別 PR に
分けても結局同じファイルを二度触ることになる。1 つの実装 PR でまとめて行う。

### テーマモデル

- **トークン層は 2 段**:
  - `tokens.css` … 非色の primitive（`--radius-*`, `--font-*`, `--sidebar-w`,
    `--topbar-h`）。テーマ非依存。
  - `themes.css` … 色トークン。**意味トークン名は dark / light で共通**、値だけ
    差し替える。既定（属性なし）は dark。全 hex は「確定したライトパレット」節。
    ```css
    :root {
      /* dark — 既定 */
      --bg-base: #0c0f1a;
      --text-primary: #dce8ff;
      --shadow-overlay: 0 16px 48px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.4);
      /* … */
      color-scheme: dark;
    }
    :root[data-theme="light"] {
      --bg-base: #f4f6fa;
      --text-primary: #1b2536;
      --shadow-overlay: 0 16px 48px rgba(15, 23, 42, 0.18), 0 4px 16px rgba(15, 23, 42, 0.1);
      /* … 同じトークン名を light 値で上書き … */
      color-scheme: light;
    }
    ```
- **ハードコード色の撤去**: `:root` 外の生 hex / rgba をすべて新規トークンに
  巻き取る。少なくとも次を新設する。
  - 影: `--shadow-sm` / `--shadow-md` / `--shadow-overlay`（現状の `rgba(0,0,0,*)`
    box-shadow 群）
  - 上端ハイライト: `--highlight-edge`（`rgba(255,255,255,.025)` 系）
  - warning: `--warning-border` / `--warning-bg`（`#f59e0b` / `rgba(245,158,11,*)`。
    既存 `--warning` / `--warning-dim` と統合）
  - info: `--info`（`#93c5fd`）
  - diff: `--diff-*` を `themes.css` に集約（現状の分散定義を 1 箇所へ）
  - 未定義参照の解消: `--bg-elevated`・`--text-tertiary` を正式にトークン化
- **`color-scheme`** を各テーマで宣言し、ネイティブ UI（スクロールバー、
  `<select>` のドロップダウン）をテーマに追従させる。
- **適用先**: `data-theme` 属性を `<html>`（`document.documentElement`）に置く。

### 確定したライトパレット

Onyx Cartographer（dark）に対応するライトパレット。**トークン名は dark / light
共通**で、`themes.css` の `:root[data-theme="light"]` が値を上書きする。
非色トークン（`--radius-*` / `--font-*` / `--sidebar-w` / `--topbar-h`）は
`tokens.css` にあり、テーマ非依存（light 値なし）。

設計方針:

- **depth の反転**: dark は「奥＝暗い / 手前＝明るい」。light は「奥＝淡いグレー /
  手前＝白」。`void`（最も奥のパネル）→ `overlay`（ポップオーバ）の順に白へ近づく。
- **border の反転**: dark の `rgba(255,255,255,α)` を light では
  `rgba(15,23,42,α)`（slate）に。
- **影の反転**: dark の `rgba(0,0,0,α)` を light では薄い `rgba(15,23,42,α)` に。
- **ブランド色の保持**: electric blue / feather purple を踏襲。ただし白背景での
  コントラスト確保のため accent は `#4d8fff → #2563eb`（白文字 5.2:1）に深める。

**サーフェス**

| トークン | dark | light |
| --- | --- | --- |
| `--bg-void` | `#07090f` | `#e9edf3` |
| `--bg-base` | `#0c0f1a` | `#f4f6fa` |
| `--bg-surface` | `#111827` | `#fbfcfe` |
| `--bg-raised` | `#172035` | `#ffffff` |
| `--bg-overlay` | `#1d2840` | `#ffffff` |
| `--bg-selected` | `#1a3050` | `#d8e6ff` |
| `--bg-elevated` *(新)* | `#172035` | `#ffffff` |

**ボーダー**

| トークン | dark | light |
| --- | --- | --- |
| `--border-faint` | `rgba(255,255,255,0.03)` | `rgba(15,23,42,0.05)` |
| `--border-subtle` | `rgba(255,255,255,0.055)` | `rgba(15,23,42,0.08)` |
| `--border-default` | `rgba(255,255,255,0.09)` | `rgba(15,23,42,0.12)` |
| `--border-strong` | `rgba(255,255,255,0.15)` | `rgba(15,23,42,0.20)` |
| `--border-active` | `#3d5a8a` | `#7d9bc8` |

**テキスト**

| トークン | dark | light | 白背景コントラスト |
| --- | --- | --- | --- |
| `--text-primary` | `#dce8ff` | `#1b2536` | ~13:1 ✓ |
| `--text-secondary` | `#7b92b4` | `#4d5e78` | ~6.5:1 ✓ |
| `--text-tertiary` *(新)* | `var(--text-secondary)` | `#5f7088` | ~4.9:1 ✓ |
| `--text-muted` | `#3d5068` | `#6f7e95` | ~4.0:1（dark baseline 同等以上） |
| `--text-link` | `#5ba4f5` | `#2563eb` | ~5.2:1 ✓ |
| `--text-link-hover` | `#82beff` | `#1d4ed8` | ~6.3:1 ✓ |

**アクセント / feather**

| トークン | dark | light |
| --- | --- | --- |
| `--accent` | `#4d8fff` | `#2563eb` |
| `--accent-hover` | `#6aaeff` | `#1d4ed8` |
| `--accent-dim` | `rgba(77,143,255,0.10)` | `rgba(37,99,235,0.10)` |
| `--accent-glow` | `rgba(77,143,255,0.22)` | `rgba(37,99,235,0.18)` |
| `--feather` | `#8b7cf6` | `#7c5cf0` |
| `--feather-dim` | `rgba(139,124,246,0.07)` | `rgba(124,92,240,0.08)` |
| `--feather-glow` | `rgba(139,124,246,0.18)` | `rgba(124,92,240,0.20)` |

**セマンティック状態**

| トークン | dark | light |
| --- | --- | --- |
| `--error` | `#f87171` | `#dc2626` |
| `--error-dim` | `rgba(248,113,113,0.10)` | `rgba(220,38,38,0.09)` |
| `--warning` | `#fbbf24` | `#b45309` |
| `--warning-dim` | `rgba(251,191,36,0.08)` | `rgba(180,83,9,0.10)` |
| `--warning-border` *(新)* | `rgba(245,158,11,0.25)` | `rgba(180,83,9,0.30)` |
| `--warning-bg` *(新)* | `rgba(245,158,11,0.06)` | `rgba(180,83,9,0.08)` |
| `--success` | `#34d399` | `#15803d` |
| `--info` *(新)* | `#93c5fd` | `#1d6fd4` |

**影 / ハイライト / diff**

| トークン | dark | light |
| --- | --- | --- |
| `--shadow-sm` *(新)* | `0 2px 8px rgba(0,0,0,0.45)` | `0 2px 8px rgba(15,23,42,0.12)` |
| `--shadow-md` *(新)* | `0 8px 28px rgba(0,0,0,0.55)` | `0 8px 28px rgba(15,23,42,0.14)` |
| `--shadow-overlay` *(新)* | `0 16px 48px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4)` | `0 16px 48px rgba(15,23,42,0.18), 0 4px 16px rgba(15,23,42,0.10)` |
| `--highlight-edge` *(新)* | `rgba(255,255,255,0.04)` | `transparent` |
| `--diff-color-added` | `#22c55e` | `#15803d` |
| `--diff-bg-added` | `rgba(34,197,94,0.12)` | `rgba(34,197,94,0.16)` |

> `--highlight-edge` は dark のみ意味を持つ「上端の白い inset ハイライト」。
> light では白パネル上で不可視なため `transparent` にして無効化する。
> `--diff-*` の `removed` / `changed` も added と同じパターンで light 値を与える
> （dark の現行値は実装時に既存 CSS から読み取って併記）。

### Monaco エディタのテーマ連動

`EditorPane.tsx` の `karasu-dark` に対をなす `karasu-light` を新規定義する
（`base: "vs"`）。`EditorPane` は `useTheme()` の `effectiveTheme` を読み、
`theme={effectiveTheme === "light" ? "karasu-light" : "karasu-dark"}` を渡す。

```ts
monaco.editor.defineTheme("karasu-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "0369a1", fontStyle: "bold" }, // dark: 7dd3fc
    { token: "annotation", foreground: "b45309" },                 // dark: fbbf24
    { token: "string", foreground: "15803d" },                     // dark: 86efac
    { token: "comment", foreground: "64748b" },                    // dark と共通
    { token: "operator", foreground: "db2777" },                   // dark: f472b6
    { token: "identifier", foreground: "1e293b" },                 // dark: e2e8f0
    { token: "delimiter.bracket", foreground: "64748b" },
    { token: "delimiter.curly", foreground: "64748b" },
  ],
  colors: {
    "editor.background": "#ffffff",            // dark: #0f172a
    "editor.foreground": "#1e293b",            // dark: #e2e8f0
    "editor.lineHighlightBackground": "#eef2f7", // dark: #1e293b
    "editorCursor.foreground": "#2563eb",      // dark: #38bdf8
    "editor.selectionBackground": "#cfe0ff",   // dark: #334155
  },
});
```

### テーマ解決とロジック

- 解決規則: `theme = stored ?? "system"`。`"system"` のとき実効値は
  `matchMedia("(prefers-color-scheme: light)")` で判定。
  - 永続値（`localStorage` キー `karasu.theme`）は `"light" | "dark" | "system"`。
  - 実効値（`"light" | "dark"`）を `document.documentElement.dataset.theme` に書く。
- **FOUC 回避**: `index.html` の `<head>` にインラインスクリプトを 1 本置き、
  バンドル読み込み前に `localStorage` + `matchMedia` を読んで `data-theme` を
  確定させる（業界標準の no-FOUC パターン）。React 側はその後の動的切替のみ担当。
- **React 層**: i18n の `LocaleProvider` に倣い `ThemeProvider` + `useTheme()`
  を新設（`packages/app/src/theme/`）。`{ theme, effectiveTheme, setTheme }` を
  提供。`theme === "system"` のときは `matchMedia` の `change` を購読して実効値を
  ライブ更新する。
- **設定 UI**: `SettingsPane` に言語セレクタと同じ体裁で「テーマ」`<select>` を
  追加（System / Light / Dark）。i18n 文字列を `en` / `ja` 双方に追加。

### 実装の指針

1. `packages/app/src/styles/` を新設し、`app.css` を案2 の構成に分割する。
   `app.css` は削除し、`main.tsx` の import を `./styles/index.css` に変更。
   `@import` 順序は `tailwindcss` → ローカル CSS、`@source` / `@theme inline` は
   `index.css` 内（`@import` 群の後）に置く。カスケード順は現状を保つ。
2. 分割と同時に、`:root` 外のハードコード色を新規トークンへ巻き取る（上記
   「ハードコード色の撤去」）。この段階では値は dark のみ＝**見た目は不変**。
3. `themes.css` に `:root[data-theme="light"]` を追加し、「確定したライトパレット」
   節の light 値を入れる。実装 PR では実機確認の上、明度の微調整のみ可
   （トークン名・構造は変えない）。
4. `index.html` に no-FOUC インラインスクリプトを追加。
5. `packages/app/src/theme/`（`theme-storage.ts` + `ThemeProvider.tsx` +
   `useTheme`）を新設。`main.tsx` で `LocaleProvider` の内側に `ThemeProvider` を
   配置。
6. `EditorPane.tsx` に `karasu-light` テーマを定義（「Monaco エディタのテーマ
   連動」節）。`EditorPane` を `useTheme()` の `effectiveTheme` 購読に変え、
   `theme` prop を切り替える。`registerKrsLanguage` 内の theme 定義は両テーマを
   登録するよう拡張。
7. `SettingsPane` にテーマセレクタを追加。i18n 文字列を追加。
8. AT: `docs/acceptance/` に新規ファイル。TC は:
   - 既定（`localStorage` 空・OS が dark）で dark 表示になる
   - OS を light にすると（stored なし）初回 light で表示される
   - Settings で Light を選ぶと即座に切り替わり、リロード後も保持される
   - Settings で System に戻すと OS 設定に追従し、OS 切替がライブ反映される
   - 初回ロードでテーマのちらつき（FOUC）がない
   - ライトテーマで主要パネル（サイドバー / ツールバー / チャット / 設定 /
     コンテキストメニュー / ノード詳細 / Reference Panel）の文字が判読できる
   - ライトテーマで Monaco エディタが `karasu-light` になり、構文ハイライトが
     判読できる
9. ADR 昇格: 実装完了後 `docs/adr/YYYYMMDD-NN-app-css-modularization-and-light-theme.md`
   として昇格し、本 Design Doc は同 PR で削除する。

### テスト方針（TPL の反映）

- **TPL-20260510-06（全描画面の点検）**: テーマは「描画全体に影響する
  グローバル切替」であり、本 TPL の `applicable_to` が明示的に「テーマ」を
  含む。CSS における「描画面」は各コンポーネント CSS であり、失敗モードは
  「あるコンポーネントが生の色をハードコードしたまま → light で破綻」。
  これを回帰的に塞ぐため、**`styles/components/*.css` と `layout.css` に生の
  色リテラル（hex / `rgb(a)` / 色名）が出現しないことを検証するメタテスト**を
  追加する（`displaymode-meta.test.ts` に倣う lint 的テスト）。色は
  `themes.css` / `tokens.css` 経由のみ許可。
- **TPL-20260518-01（両結果状態を end-to-end で検証）**: テーマ切替は involutive
  ではないが「複数の結果状態を持つ切替」。`useTheme` の reducer 的検証に加え、
  light / dark **両方**で `data-theme` が `documentElement` に正しく反映される
  ことをコンポーネント結合テストで確認する。
- **TPL-20260516-01（a11y 契約）**: テーマセレクタは `<select>` で言語セレクタの
  パターンを踏襲し、`aria-label` を付ける。テストは role / `aria-label` で要素を
  取得する。
- 単体テスト: `theme-storage`（解決規則・永続化）、`ThemeProvider` /
  `useTheme`（`system` 時の `matchMedia` 購読、`setTheme` での属性更新）、
  `SettingsPane`（セレクタの選択肢と反映）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（既定は dark のまま。明示選択時のみ light）。
- ドキュメント更新: 実装完了時に本 Design Doc を ADR へ昇格。`CLAUDE.md` /
  `docs/spec/` への新規セクション追加はなし。
- テスト・examples への影響: `examples/` への影響なし。`app.css` を参照する
  既存テストがあれば import パスを追従（`grep` で確認）。
- CI: `app.css` 分割後も lint / format / typecheck / knip / check:cycles / build
  が通ること。`@import` 解決は Vite が担う。

## 決着した問い（#1470 で確定）

検討初期に挙がった 4 つの未解決の問いは Issue #1470 上で決着した。

| 問い | 決定 | 反映先 |
| --- | --- | --- |
| Monaco エディタのテーマ連動 | **連動する**。`karasu-light` を新規定義し `effectiveTheme` で切替 | 「Monaco エディタのテーマ連動」節・実装の指針 6 |
| light パレットの確定タイミング | **本 Design Doc で全 hex を確定** | 「確定したライトパレット」節 |
| プレビューキャンバス | **テーマに追従**（light 時は明るいキャンバス。トークン経由なので追加実装不要） | 制約・前提（in scope） |
| 切替 UI | **Settings 内の `<select>` のみ**（System / Light / Dark） | テーマ解決とロジック・実装の指針 7 |

## 未解決の問い / 決めないこと

意図的にスコープ外とするもののみ残る。

- **SVG 図の再テーマ化**: out of scope。`packages/core` のレンダラが約 35 個の
  色をハードコードしており、CLI / VS Code の export SVG にも波及するため別 Issue
  とする。ライトテーマでは明るいキャンバスの上に現状の（暗い）図が乗る。これは
  core レンダラがテーマ化されるまでの既知の暫定状態。
- **テーマのクイックトグル**: 今回は Settings 内のセレクタのみ。activity-bar 等
  への即時トグル配置は将来の小改善として残す。
- **light パレットの微調整**: 「確定したライトパレット」節の hex を確定値とするが、
  実装 PR で実機確認の上 ±数% の明度調整はあり得る（トークン名・構造は変えない）。
- **`--diff-*` の removed / changed の dark 現行値**: 既存 CSS に分散定義されて
  いるため、実装時に読み取って `themes.css` へ集約する（値そのものは不変）。
