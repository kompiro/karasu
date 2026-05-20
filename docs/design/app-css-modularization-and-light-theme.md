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
| SVG 図のレンダラ | `packages/core` のレンダラが約 35 個の hex 色をハードコード。app の CSS 変数とは独立 |

## 制約・前提

- **後方互換**: 既存のクラス名・DOM 構造は変えない。`app.css` を分割しても
  `main.tsx` が import するエントリは 1 つ（`index.css`）に保つ。
- **Tailwind v4 / shadcn 構成を壊さない**: `@import "tailwindcss"`、`@source`、
  `@theme inline`、preflight 有効はそのまま維持する。`@theme inline` が
  `var(--bg-base)` 等を inline 参照しているのは「実行時に解決させる」ためであり、
  テーマ切替と相性が良い（ビルド時に dark 値で焼き付かない）。
- **FOUC を出さない**: 初回ペイント前にテーマが確定していること。
- **out of scope**:
  - **SVG 図そのものの再テーマ化**。`packages/core` のレンダラの色見直しは
    影響範囲が広く別 Issue とする。ライトテーマでは app の chrome（パネル・
    ツールバー・サイドバー・エディタ枠）のみが切り替わり、プレビュー内の図は
    現状のまま（暗い図がライトなキャンバスに乗る）。プレビューキャンバスの
    背景・グリッドは app トークン経由なので追従する。
  - Monaco エディタのテーマ連動（別途検討。今回はエディタ自体のテーマは固定）。
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
    差し替える。既定（属性なし）は dark。
    ```css
    :root {
      /* dark — 既定 */
      --bg-base: #0c0f1a;
      --text-primary: #dce8ff;
      --shadow-overlay: 0 16px 48px rgba(0, 0, 0, 0.65);
      /* … */
      color-scheme: dark;
    }
    :root[data-theme="light"] {
      --bg-base: #f5f7fa;
      --text-primary: #1a2233;
      --shadow-overlay: 0 16px 48px rgba(15, 23, 42, 0.18);
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
3. `themes.css` に `:root[data-theme="light"]` を追加し、全色トークンの light 値を
   与える。コントラスト比は WCAG AA（本文 4.5:1 / UI 3:1）を目安に決める。
4. `index.html` に no-FOUC インラインスクリプトを追加。
5. `packages/app/src/theme/`（`theme-storage.ts` + `ThemeProvider.tsx` +
   `useTheme`）を新設。`main.tsx` で `LocaleProvider` の内側に `ThemeProvider` を
   配置。
6. `SettingsPane` にテーマセレクタを追加。i18n 文字列を追加。
7. AT: `docs/acceptance/` に新規ファイル。TC は:
   - 既定（`localStorage` 空・OS が dark）で dark 表示になる
   - OS を light にすると（stored なし）初回 light で表示される
   - Settings で Light を選ぶと即座に切り替わり、リロード後も保持される
   - Settings で System に戻すと OS 設定に追従し、OS 切替がライブ反映される
   - 初回ロードでテーマのちらつき（FOUC）がない
   - ライトテーマで主要パネル（サイドバー / ツールバー / チャット / 設定 /
     コンテキストメニュー / ノード詳細 / Reference Panel）の文字が判読できる
8. ADR 昇格: 実装完了後 `docs/adr/YYYYMMDD-NN-app-css-modularization-and-light-theme.md`
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

## 未解決の問い / 決めないこと

- **light パレットの具体値**: 本 Design Doc では「意味トークン名は共通、
  `themes.css` で light 値を与える」方針のみ決め、各色の最終 hex は実装 PR で
  決定する（コントラスト比 AA を満たすことを条件とする）。
- **Monaco エディタのテーマ連動**: 今回は対象外。app が light のときエディタを
  light テーマにするかは別 Issue。
- **SVG 図の再テーマ化**: out of scope（`packages/core` レンダラの色見直し）。
  別 Issue を起こす想定。
- **テーマ切替のクイックトグル**: 今回は Settings 内のセレクタのみ。ツールバー
  等への即時トグル配置は将来検討。
