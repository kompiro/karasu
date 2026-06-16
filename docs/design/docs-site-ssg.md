# docs/ から静的ドキュメントサイトを構築する SSG 選定

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1575](https://github.com/kompiro/karasu/issues/1575)
  - 関連 Issue: [#1574](https://github.com/kompiro/karasu/issues/1574)（rendered diagram 埋め込み）, [#1302](https://github.com/kompiro/karasu/issues/1302)（public 化）
  - 関連 ADR: [ADR-20260425-01](../adr/20260425-01-i18n-default-policy.md)（i18n default policy）, [ADR-20260420-03](../adr/20260420-03-i18n-rollout.md)（i18n rollout）, [ADR-20260407-04](../adr/20260407-04-cloudflare-deployment-and-byok-ai.md)（Cloudflare preview deploy）
  - 関連 TPL: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（doc ↔ source-of-truth の同期）。本設計で proactive TPL を 1 件起こす（後述「未解決の問い」）
  - コード: `.github/workflows/pages.yml`, `site/`, `docs/guide/`, `docs/spec/`, `docs/concepts.md`

## 背景・課題

ガイド 5 章（PR #1561, merged）・syntax/style/tags リファレンス・concepts が
すべて `docs/` 配下の markdown として揃った。一方で公開面の `site/` は手書きの
単一ランディングページ（`index.html` + `styles.css`）のままで、`pages.yml` は
`site/` をビルドなしでそのまま GitHub Pages にアップロードしているだけ。

そのため、せっかくの bilingual ガイド／リファレンス群がサイト上で読めない。
`docs/` を single source of truth に保ったまま、ナビゲーション・i18n・`krs`
シンタックスハイライト・検索を備えた**ドキュメントサイト**へ育てたい。

この設計の主目的は **静的サイトジェネレータ（SSG）の選定**と、
**`docs/` の markdown をフォークせずにサイト化するコンテンツパイプライン**の
方針を決めることである。実装は Phase 1（ガイド／リファレンス／concepts の公開）
に絞る。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 公開サイト | `site/`（手書き single-page）。`pages.yml` が `site/**` 変更時に `site/` を verbatim で Pages へアップロード（ビルド無し） |
| PR preview | `preview.yml` が `@karasu-tools/app`（web app）を Cloudflare Pages へ。docs サイトとは別系統 |
| コンテンツ | `docs/guide/01–05`（en + `.ja.md`）, `docs/spec/{syntax,style,tags-annotations,i18n}`, `docs/concepts.md`, `examples/`（16 ディレクトリ） |
| i18n 規約 | 同一ディレクトリ co-located。`foo.md` = en / `foo.ja.md` = ja。各ページ冒頭に手書きの language switcher（`> English（this file） · [日本語](xxx.ja.md)`） |
| リンク規約 | repo-relative（`../spec/syntax.md`, `../../examples/payment-platform/`）。アンカーは markdown 見出しの自動 slug ではなく **明示的な `<a id="...">`**（例: `concepts.md` に 8 箇所、`#goals-and-non-goals` 等を guide から参照） |
| ハイライト資産 | `packages/vscode/syntaxes/krs.tmLanguage.json` / `krs-style.tmLanguage.json`（TextMate grammar）。Shiki がそのまま消費できる形式 |
| ビルド基盤 | repo 全体が Vite + React、pnpm@10 workspaces |

## 制約・前提

- **single source of truth は `docs/`**。サイト用に markdown を複製してコミット
  しない（生成物は gitignore）。`docs/` を編集すればサイトに反映される。
- **i18n 規約 `.md` = en / `.ja.md` = ja を尊重**する（ADR-20260425-01 /
  ADR-20260420-03）。サイトは en をベース、ja を alternate とし、per-page の
  language switcher を出す。
- **repo-relative リンクと `<a id>` アンカーをサイト URL へ正しく書き換える**。
  これが最大の技術リスク（リンク先 `.md` → サイトルート、`#anchor` 保持、
  `examples/` への相対リンクの扱い）。
- **`krs` / `krs.style` の fence を既存 TextMate grammar 経由でハイライト**する。
- 既存ランディング（`site/index.html` の世界観）はサイト home として温存する。
- **out of scope（Phase 2 以降）**: examples gallery + rendered diagram 埋め込み
  （#1574 依存）, `@karasu-tools/app` の playground 埋め込み, versioned docs。
- Pages の公開可視性（private repo では public 化 or 有料プランが必要）は #1302
  と調整。本設計はビルド／パイプラインに限定し、可視性は扱わない。

## 検討した選択肢

評価軸:

1. **i18n** — `.md` / `.ja.md` 規約への適合と language switcher
2. **Shiki + custom `krs` grammar** — TextMate grammar を first-class で消費できるか
3. **検索** — ビルトインまたは容易な追加
4. **repo との親和性** — Vite / React エコシステムとの相性、Phase 2 の React 製
   playground 埋め込みのしやすさ
5. **コンテンツパイプライン** — `docs/` をフォークせず取り込む難易度

### 案1: Astro Starlight

Astro 製のドキュメント特化テーマ。content collection に markdown を置く。

**メリット**

- **ドキュメント特化**: サイドバー・ToC・language switcher・前後ページナビが
  デフォルトで揃う。手書き switcher を捨てて Starlight 標準に寄せられる。
- **i18n が first-class**: locale ごとにルーティング・UI 翻訳・fallback を持つ。
- **Shiki ネイティブ + custom grammar**: `expressiveCode` / Shiki に
  `krs.tmLanguage.json` を langs として渡せる。
- **検索ビルトイン**: Pagefind が標準同梱（静的・追加サービス不要）。
- **React island**: Astro は React コンポーネントを島として埋め込める。Phase 2 で
  `@karasu-tools/app`（React）を "Try it" として載せやすい。
- Vite ベース（Astro の内部）で repo の tooling と素地が近い。

**デメリット**

- i18n は **ディレクトリベース**（`src/content/docs/en/...`, `.../ja/...`）。
  co-located `.md` / `.ja.md` 規約と形が違うため、取り込み時に locale 別 dir へ
  振り分ける sync ステップが要る。
- Astro 自体が新規依存（repo にまだ無い）。学習コストは小。

### 案2: VitePress

Vue 製・Vite ネイティブの軽量 SSG。

**メリット**

- **最軽量・最も Vite ネイティブ**。`srcDir` を柔軟に指定でき、markdown 中心。
- Shiki ビルトイン（custom grammar も `markdown.languages` で渡せる）。
- i18n・ローカル検索（minisearch）ビルトイン。

**デメリット**

- テーマ／コンポーネントが **Vue**。Phase 2 の React playground 埋め込みが
  Starlight より不利（Vue ラッパ越しになる）。
- i18n もロケール別ルートが基本で、co-located 規約とのギャップは Starlight と同程度。
- ドキュメント UX（サイドバー自動生成等）は Starlight ほど "電池込み" ではなく、
  サイドバー構成を手で書く部分が増える。

### 案3: Docusaurus

React 製の老舗ドキュメント SSG。

**メリット**

- React ベースで repo と言語が一致。MDX・i18n・versioning が堅牢。

**デメリット**

- **Webpack ベース**で repo の Vite tooling から外れる。ビルドが重い。
- ハイライトは **Prism がデフォルト**で Shiki は plugin 任せ。`krs` grammar 流用が
  他案より遠い。
- i18n は `i18n/<locale>/...` の翻訳 dir 構造で、co-located 規約からの距離が最大。
- フル機能ゆえ重厚で、Phase 1 のスコープには過剰。

## 比較

| 観点 | Astro Starlight | VitePress | Docusaurus |
| --- | --- | --- | --- |
| i18n（`.md`/`.ja.md` 適合） | ◎ first-class（要 dir 振り分け） | ○（要 dir 振り分け） | △ 翻訳 dir 構造で距離大 |
| Shiki + custom `krs` grammar | ◎ ネイティブ | ◎ ネイティブ | △ Prism 既定、Shiki は plugin |
| 検索 | ◎ Pagefind 同梱 | ◎ minisearch 同梱 | ○ Algolia 想定/ローカル plugin |
| Vite/React 親和（Phase 2 playground） | ◎ React island | △ Vue テーマ | ○ React だが Webpack |
| ドキュメント UX（電池込み） | ◎ | ○ | ◎ |
| 依存の軽さ・ビルド速度 | ○ | ◎ | △ |
| コンテンツパイプライン難易度 | 同等（sync + link rewrite が必要） | 同等 | 同等〜やや重 |

## 現時点の方針

**案1: Astro Starlight を採用する** — 評価軸のうち重みの大きい i18n・Shiki custom
grammar・検索がすべて first-class で、ドキュメント UX が電池込み（手書き switcher
やサイドバーを Starlight 標準に寄せられる）。加えて React island により Phase 2 の
`@karasu-tools/app` 埋め込みが最も素直。VitePress は最軽量だが Vue テーマが Phase 2
で不利、Docusaurus は Webpack 依存と Prism 既定で repo の方針から最も遠い。

3 案とも「`docs/` を複製せず取り込む」ために **ビルド時の content sync + リンク／
アンカー書き換え**が必要な点は同等であり、ここが実装の主リスク。SSG の差では
解消されないため、sync ステップを自前で持つ前提で最も上物の強い Starlight を選ぶ。

### 実装の指針

`packages/docs-site/`（新 workspace）として独立させる。

1. **scaffold**: `packages/docs-site/` に Astro + Starlight を導入（pnpm workspace に
   追加）。`astro.config.mjs` で `locales: { root: { lang: 'en' }, ja: {...} }`、
   Shiki に `krs` / `krs-style` の TextMate grammar を `langs` として登録。
2. **content sync スクリプト**（主リスク）: `docs/` の markdown を Starlight の
   content collection（`src/content/docs/{en,ja}/...`）へ生成する build 前段。
   - `.md` → en ロケール、`.ja.md` → ja ロケールへ振り分け。
   - **repo-relative リンク書き換え**: `../spec/syntax.md` → サイト URL、
     `.ja.md` リンク → ja ロケール URL。`examples/` へのリンクは（Phase 1 では）
     GitHub の該当パスへ向ける（gallery は Phase 2）。
   - **`<a id="...">` アンカー保持**: 明示アンカーをそのまま出力に残し、
     `#goals-and-non-goals` 等のページ内リンクを壊さない。
   - 生成物は gitignore（`docs/` が canonical、複製はコミットしない）。
   - remark/rehype plugin として実装するか、独立した前処理スクリプトにするかは
     実装時に決める（どちらでも sync の責務は同じ）。
3. **link/anchor 検証**: ビルド時に未解決の repo-relative リンク・存在しない
   アンカーで **fail** させる（broken-link チェック）。これを proactive TPL 化する
   （後述）。
4. **`pages.yml` 更新**: `pnpm --filter @karasu-tools/docs-site build` を走らせて
   `dist` をアップロードするステップに差し替え。トリガを `site/**` から
   `docs/**` + `examples/**` + docs-site config + `pages.yml` へ拡張。
5. **home の温存**: 既存ランディング（`site/index.html` の内容）を Starlight の
   home ページとして移植 or そのまま splash として温存。
6. **AT**: `docs/acceptance/` に新規ファイル。TC は:
   - ガイド 01–05 / spec / concepts が en・ja 両方でビルド・到達できる
   - language switcher で同一ページの en ↔ ja を往復できる
   - repo-relative リンク（`../spec/...`）と `<a id>` アンカー（`#goals-and-non-goals`）
     がサイト URL で解決する
   - `krs` / `krs.style` fence がハイライトされる（grammar 由来の token クラスが付く）
   - 未解決リンク／アンカーがあるとビルドが fail する
7. **ADR 昇格**: 実装完了後 `docs/adr/<番号>-docs-site-ssg.md` として昇格し、
   本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（公開サイトの拡充のみ。`docs/` の編集体験は不変）。
- ドキュメント更新: `docs/process.md` に docs-site のビルド／プレビュー手順を追記。
  各ガイドの手書き language switcher は Starlight 標準へ寄せるか温存するかを実装時に判断
  （GitHub 上の素の markdown でも読めるよう、当面は手書き switcher を残す方が安全）。
- テスト・examples への影響: なし（Phase 1 は examples を gallery 化しない）。

## 未解決の問い / 決めないこと

- **proactive TPL（実装 PR で起こす）**: 「`docs/` を別系統（サイト・生成物）へ
  取り込むパイプラインは、repo-relative リンクと明示アンカーの未解決をビルド時に
  検出して fail させる」。link/anchor 解決が壊れてもビルドが緑のままだと、サイト上で
  サイレントに 404 が出る構造的リスクがあるため、TPL-20260511-02（doc ↔ source の
  同期）の系として proactive TPL を起こす。本 Design Doc PR ではなく、パイプライン
  実装と同じ PR で同梱する。
- 手書き language switcher を Starlight 標準へ完全移行するか、GitHub 素読み互換の
  ために temporarily 残すか（実装時に決める）。
- examples を build 時に `karasu render` して埋め込むか（#1574 の SVG を消費するか）
  は Phase 2 に送る。
- versioned docs・playground 埋め込み・search の高度化は Phase 2 以降。
