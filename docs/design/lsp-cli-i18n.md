# LSP / CLI の i18n — 互換ブリッジの廃止と headless ツールへの i18n 層の導入

- **日付**: 2026-05-19
- **Issue**: #1417
- **ステータス**: 検討中
- **関連**:
  - [ADR-20260420-03](../adr/20260420-03-i18n-rollout.md) — i18n ロールアウト（互換ブリッジを残した張本人。「将来課題」に本検討を明記している）
  - [docs/spec/i18n.md](../spec/i18n.md) — i18n ポリシー（「CLI / lsp / vscode … 現状は en のみ。本ドキュメントの範囲外」）
  - `packages/core/src/resolver/warning-legacy-format.ts` — 言語が混在している警告ブリッジ
  - `packages/core/src/parser/diagnostic-legacy-format.ts` — 診断ブリッジ
  - `packages/app/src/i18n/` — app の i18n ランタイム（`renderWarning` / `translate` / `en.ts` / `ja.ts`）
  - #1413 / PR #1414 — resolver warning を LSP に流し込み、VS Code 上で言語混在を可視化した変更

## 背景・課題

VS Code 拡張（および CLI の `karasu render`）が表示する resolver warning は、
**warning の種類によって英語と日本語が混在**している。同じ Problems パネルに

- `domain "Orphan" is not assigned to any service`（英語）
- `domain "Order" は複数の service の配下に登場します`（日本語）

が並ぶ。

### 根本原因（Issue #1417 の調査結果）

確定した。`packages/core/src/resolver/warning-legacy-format.ts` の `formatWarning()` は
ADR-20260420-03 の Phase B で導入された「一時的な互換ブリッジ」で、`WarningKind` ごとに
メッセージ文字列をハードコードしている。この文字列が単一言語に正規化されたことが一度もなく、
ブランチによって英語・日本語がまちまちになっている:

| 言語 | warning kind |
|---|---|
| 日本語 | `domain-dispersal`, `style-conflict`, `missing-runtime`, `missing-realizes`, `unresolved-realizes` |
| 英語 | 上記以外（約 25 ブランチ） |

`formatWarning()` の消費者は **LSP（`packages/lsp/src/diagnostics.ts`）と CLI
（`packages/cli/src/render.ts` / `diff.ts`）のみ**。app は別経路（`useFormattedWarning`
→ `packages/app/src/i18n/format-warning.ts` の `renderWarning`）を使うので影響を受けない。
これは Issue 本文の見立てどおり。

あわせて Issue の Q4（`formatDiagnostic()` に英語以外が紛れていないか）も確認した。
`diagnostic-legacy-format.ts` も**一様に英語ではない** — `app-project-compile-error`
（"プロジェクトのコンパイル中にエラーが発生しました"）と `app-org-parse-error`
（"パース中にエラーが発生しました"）の 2 ブランチが日本語。ただしこの 2 つは app が
合成する synthetic な `DiagnosticCode` で、LSP / CLI は発行しない。よって VS Code 上で
混在として見えるのは warning ブリッジのみだが、ブリッジとしては診断側も未正規化。

### なぜ「最小修正」では終わらせないか

最小修正（`formatWarning()` の日本語ブランチを英語に書き直す）でも混在は消える。
しかしそれは「LSP / CLI は英語固定」を追認するだけで、次の問題が残る:

- app は locale 追従、LSP / CLI は英語固定という非対称が固定化される。日本語ユーザーが
  VS Code を日本語表示で使っていても診断だけ英語になる。
- ブリッジ（`formatWarning` / `formatDiagnostic`）は ADR-20260420-03 で「Phase D 後に
  削除予定」と明言された一時コードだが、LSP / CLI が消費し続ける限り永久に残る。
- 翻訳文字列が app（`renderWarning`）と core（`formatWarning`）の 2 箇所に重複し、
  片方を直してももう片方がドリフトする（まさに今回の混在の温床）。

ADR-20260420-03 の「将来課題」は本検討をこう予告している:

> CLI が翻訳を使う時点で `packages/i18n/` への切り出しを再検討。ロケール解決は環境ごと
> （app: `localStorage` + `navigator.language`、CLI: `LANG`）に分かれる。

Issue #1417 はまさにその「CLI / LSP が翻訳を使う時点」にあたる。

## 制約・前提

- **`packages/core` は単体配布されうるパッケージ**。i18n.md より、core は app の翻訳
  テーブルを import してはならず、locale 依存文字列は呼び出し側からオプションで受け取る。
  → 翻訳テーブルを core に置く案はこの原則に反する。
- **LSP / CLI は React を持たない**。app の `useTranslation` / `LocaleProvider`
  （React Context）は使えない。`renderWarning` のように「`t` を引数で受け取る純関数」
  なら共有できる。
- **`Translations` 型・`en.ts` / `ja.ts`・`translate()`・`renderWarning` /
  `renderDiagnostic` は現状すべて `packages/app/src/i18n/` 配下**にあり、app（Vite /
  React）パッケージの一部。LSP / CLI が app パッケージを依存に加えるのは不適切。
- **`Warning` / `Diagnostic` 型は `packages/core`** が所有する。`renderWarning` /
  `renderDiagnostic` はこの型に依存する。
- 言語ポリシー（決定済み・本検討で覆さない）: ツール出力のデフォルトは英語。日本語は
  環境が日本語ロケールのときのみ。これは i18n.md と `diagnostic-legacy-format.ts` の
  既定路線に一致する。
- ロケール解決元は環境ごとに異なる:
  - app: `localStorage['karasu-locale']` → `navigator.language` → `en`
  - LSP: `initialize` リクエストの `params.locale`（エディタの表示言語。VS Code は
    `vscode.env.language` を渡す）→ `en`
  - CLI: `LANG` / `LC_ALL` 環境変数 → `en`（将来 `--lang` フラグ）

## 検討した選択肢

論点は 2 つ: **(A) 共有翻訳テーブルの置き場所** と **(B) ロケール解決の実装**。

### 論点 A: 共有翻訳テーブルの置き場所

#### 案 A-1: `packages/i18n/` を新パッケージとして切り出す（推奨）

React 非依存の純 TS パッケージ `@karasu-tools/i18n` を新設し、以下を移す:

- `Translations` 型 / `TranslationParams`（`types.ts`）
- `en` / `ja` マップ（`en.ts` / `ja.ts`）
- `translate(locale, key, params)`（locale 解決 + en フォールバック）
- `renderWarning(w, t)` / `renderDiagnostic(d, t)`（`Warning` / `Diagnostic` →
  `FormattedWarning` / string の純関数）
- `Locale` 型と、環境非依存な部分のロケールユーティリティ

依存方向: `@karasu-tools/i18n` → `@karasu-tools/core`（`Warning` / `Diagnostic`
型のため）。app / lsp / cli はいずれも `@karasu-tools/i18n` を import する。

- app 側: React 層（`LocaleProvider` / `useTranslation` / `useFormattedWarning`）は
  `packages/app` に残し、データは `@karasu-tools/i18n` から取る。`useFormattedWarning`
  は共有 `renderWarning` を呼ぶだけになる。
- lsp 側: `onInitialize` で `params.locale` から `Locale` を解決し、`translate` を
  束ねた `t` を作って `renderWarning` / `renderDiagnostic` に渡す。
- cli 側: `LANG` から `Locale` を解決し、同様に `t` を作る。
- core 側: `formatWarning` / `formatDiagnostic` の 2 ブリッジを**削除**。

メリット:
- 翻訳文字列の単一情報源。app・lsp・cli が同じ `en.ts` / `ja.ts` を読む。今回の
  混在（重複定義のドリフト）が構造的に再発しなくなる。
- core は language-neutral のまま（i18n.md の原則を守る）。
- ADR-20260420-03 が予告した切り出しそのもの。実需（LSP / CLI）が出た今が適期。
- 一時ブリッジ 2 本を予定どおり削除でき、`@deprecated` の負債が消える。

デメリット:
- 新パッケージ追加で npm workspaces / tsconfig / ビルド設定の更新が必要。
- app の i18n ファイル群を移動する大きめの diff。インポートパスの一括書き換え。

#### 案 A-2: 翻訳テーブルを `packages/core` に置き、`formatWarning(w, locale)` にする

core が `en` / `ja` マップを持ち、ブリッジを `formatWarning(w, locale)` /
`formatDiagnostic(d, locale)` に拡張する。app も core のこの関数を呼ぶ。

メリット:
- 新パッケージ不要。変更が core に閉じる。

デメリット:
- **i18n.md の「core は locale 依存文字列を持たない／呼び出し側から受け取る」原則に
  正面から反する**。core に UI 寄りの翻訳テーブル（`en.ts` / `ja.ts` 全体）が載る。
- core の単体配布時に ja 翻訳が常時バンドルされる。
- app の React i18n 層と core の関数 i18n が二重になり、責務が不明瞭。

#### 案 A-3: 最小修正のみ（`formatWarning` を英語へ正規化）

ブリッジの日本語ブランチ 5 件（+ 診断 2 件）を英語に書き直す。

メリット: 最小 diff。混在は即解消。

デメリット: 「背景・課題」の「なぜ最小修正で終わらせないか」のとおり。ブリッジが恒久化し、
LSP / CLI が永久に英語固定。Issue #1417 で「proper」を選んだ意図に反する。

→ 本検討では A-3 は採らない（Issue で「proper」が選択された）。ただし **A-1 の段階的
着地の初手**として「正規化を兼ねた移行」を行うので、A-3 の作業自体は A-1 に内包される。

### 論点 B: ロケール解決の実装

#### LSP

`InitializeParams.locale` を読む。VS Code はエディタの表示言語（`vscode.env.language`）を
ここに渡す。`onInitialize` で 1 回解決してサーバ状態に保持する。

- `params.locale` が `ja` で始まれば `ja`、それ以外・未指定は `en`。
- locale を動的に切り替える要件は当面なし（エディタ言語の変更は拡張機能の再起動を伴う）。

#### CLI

`LANG` / `LC_ALL` 環境変数を見る（`ja_JP.UTF-8` → `ja`）。`LC_ALL` を優先。

- 明示フラグ `--lang en|ja` は**本実装に含めない**。`LANG` / `LC_ALL` で足りるとの判断。
  将来 CI 出力の言語固定など具体的な要件が出た時点で別途追加する。

#### 共有ユーティリティ

`packages/app/src/i18n/locale.ts` は現在 `localStorage` / `navigator` 前提。
`@karasu-tools/i18n` には**環境非依存なコア**（`Locale` 型・`isLocale` ガード・
`"ja" で始まる文字列 → ja` の正規化関数）だけを置き、環境依存の解決
（`resolveLocale` for browser、`resolveLocaleFromEnv` for CLI、
`resolveLocaleFromInitParams` for LSP）は各パッケージ側、または i18n パッケージ内の
環境別エントリに分ける。

## 比較

| 観点 | A-1 新パッケージ | A-2 core に集約 | A-3 最小修正 |
|---|---|---|---|
| 言語混在の解消 | ○ | ○ | ○ |
| LSP / CLI が locale 追従 | ○ | ○ | ✗（英語固定） |
| 翻訳の単一情報源 | ○ | ○ | ✗（app と core で重複継続） |
| i18n.md の core 原則を守る | ○ | ✗ | ○ |
| 一時ブリッジの廃止 | ○ | △（関数は残る） | ✗ |
| 変更コスト | 大 | 中 | 小 |
| ADR-20260420-03 の将来課題への整合 | ○ | △ | ✗ |

→ **案 A-1 を推奨**。コストは大きいが、Issue #1417 が「proper」を要求しており、
ADR-20260420-03 が明示的に予告した切り出しでもある。

## Related TPLs

`docs/test-perspectives/` に i18n / `topic` 一致の既存 TPL は見当たらなかった。

本検討は「同一の構造化データ（`Warning` / `Diagnostic`）に対する表示文字列が複数箇所
（app の `renderWarning` と core の `formatWarning`）で重複し、片方だけ更新されて
ドリフトする」という再発しうる構造的欠陥を扱う。これは proactive TPL の候補:

- **観点案**: 「`Warning` / `Diagnostic` の表示文字列マッピングは単一情報源を持つこと。
  `WarningKind` / `DiagnosticCode` を `switch` で文字列化する関数が 2 つ以上存在する
  場合、片方の言語・文言が更新されてももう片方に伝播せず、消費者ごとに表示が割れる。」

A-1 実装 PR で `formatWarning` / `formatDiagnostic` を削除し情報源を 1 本化したうえで、
同 PR で上記 proactive TPL を起こす（`discovered_from.root_cause_adr: ADR-20260420-03`）。

## 現時点の方針

- 案 **A-1**（`packages/i18n/` 切り出し）を採用する。
- **段階ごとに独立した PR として着地させる**（各 PR は単体でマージ可能・機能的に無害）:
  1. `@karasu-tools/i18n` パッケージを新設し、app の `i18n/` から React 非依存部分
     （`types` / `en` / `ja` / `translate` / `renderWarning` / `renderDiagnostic` /
     `Locale` コア）を移設。app は新パッケージを参照するよう書き換え（app の挙動は不変）。
     この時点では「app だけが新パッケージを使う」中間状態になるが機能的に無害。
  2. LSP を `renderWarning` / `renderDiagnostic` + `InitializeParams.locale` 経由に
     切り替え。`formatWarning` / `formatDiagnostic` の LSP 呼び出しを除去。
  3. CLI を `renderWarning` / `renderDiagnostic` + `LANG` 経由に切り替え。
  4. 消費者がいなくなった `formatWarning` / `formatDiagnostic` を core から削除。
     proactive TPL を同 PR で起こす。
- CLI のロケール解決は `LANG` / `LC_ALL` 環境変数のみ。`--lang` フラグは入れない。
- `formatDiagnostic` の app-only synthetic code（`app-project-compile-error` /
  `app-org-parse-error`）は、新パッケージの `renderDiagnostic` が `Translations` に
  専用キーを持って出す。core のブリッジ削除（段階 4）と同時に解消する。
- 言語ポリシー（ツール出力デフォルト英語、環境が ja のときのみ ja）は i18n.md に
  追記して明文化する（現状「範囲外」と書かれている節を更新）。
- ADR 化: 実装着地後、本 Design Doc を ADR に昇格させ、ADR-20260420-03 の「将来課題」
  との関係を `depends_on` で示す。

## 未解決の問い

なし（CLI の `--lang`・PR 分割・synthetic diagnostic の扱いはいずれも「現時点の方針」に
反映済み）。
