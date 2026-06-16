# en/ja で example を揃える（docs gallery + アプリの Samples）

- **Issue**: [#1642](https://github.com/kompiro/karasu/issues/1642)
- **PR**: #（作成後に記入）
- **日付**: 2026-06-16
- **ステータス**: 検討中

## 背景・課題

docs サイトの Examples gallery（#1640）と、アプリの Reference → Samples タブは、`examples/` の `.krs` をレンダリングして見せる。`examples/` のシナリオ系は**ラベルが日本語**なので、英語ロケールの面（gallery の `/examples/`、Samples タブの英語表示）でも日本語の図が出る。`getting-started` だけ `getting-started-en` の対があり英語化済み。

en/ja のユーザーがそれぞれ自言語の図を見られるよう、**シナリオ example の英語版を用意し、docs gallery とアプリの両方に反映する**。本 Design Doc は、(1) `examples/` の構造、(2) アプリ側 bundling の反映範囲と方式、を決める。translate（ラベルの英訳作業そのもの）は実装で行う。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| examples 構造 | ja 版は `examples/<name>/`（root 直下）。英語は `examples/getting-started-en/` だけが例外的に存在 |
| ja ラベルのシナリオ | `payment-platform`(42) `org`(44) `client-mcp`(27) `hr-tool`(26) `deploy`(24) `migration`(23) `org-only`(11) `multi-file-system`(11) `deploy-org`(5) `deploy-only`(4)。`feature-samples` は既に英語ラベル |
| docs gallery | #1640 で per-locale の `entry`/`githubDir`（`resolveEntry`）に対応済み。`getting-started` ページのみ en/ja 別ソースを描画 |
| アプリ bundling | `packages/core/src/builtins/examples.ts` が一部を文字列同梱（`getting-started`(+`_EN`), `ec-platform`, `client-mcp`, `deploy-only`, `org-only`, `multi-file-system`, `feature-samples`）。`hr-tool` 等 gallery 専用のものは非同梱 |
| ロケール選択（既存precedent） | `packages/core/src/builtins/reference.ts` の `samplesByView`: `system` は `locale === "ja" ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN`、**`deploy` は `DEPLOY_ONLY_PROJECT`・`org` は `ORG_ONLY_PROJECT` でロケール非対応（常に日本語）** |
| 同期ルール | `.claude/rules/examples-sync.md` + `/update-examples`。`examples.ts` は対応ファイルと **byte 一致**（`packages/core/src/examples.test.ts` の drift ガード、#1344） |

## Related TPLs

- [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — 正典（`examples/`）↔ 再掲（`examples.ts` 同梱文字列）の同期。本設計はこの byte 一致ガードの上で en 版を増やす。
- [TPL-20260616-01](../test-perspectives/TPL-20260616-01-docs-pipeline-link-anchor-resolution.md) — docs 取り込みパイプライン（gallery 側）。

## 制約・前提

- **構造は `examples/<lang>/<name>/`**（決定済み）。英語版は `examples/en/<name>/`。`getting-started-en` も `examples/en/getting-started` へ移行して統一する。
- **ja 版は当面 `examples/<name>/`（root）のまま**。ja を `examples/ja/` へ動かすと、`examples-sync` マッピング表・全 docs リンク・アプリ同梱パス・テストに広範な ripple が出るため、本 PR では対象外（非対称を許容。完全対称化は将来の別作業）。
- en/ja は **構造を同一**に保つ（ペアの drift を避ける）。各 example が ja/en の対になり、編集時に両方の同期が要る（`getting-started` ペアと同じ保守コストの拡大）。
- 新規 `.krs` は diagnostics-clean。`examples/feature-samples/` には触れない（既に英語 + byte 一致ガード）。
- docs gallery は #1640 の per-locale 機構をそのまま使う（manifest の en `entry`/`githubDir` を `examples/en/...` に向ける）。

## 検討した選択肢

### 構造（決定済み）

`examples/en/<name>/`（lang/name）を採用。`<name>-en/` 兄弟ディレクトリ案は multi-file の import 配線が分かりづらく、`getting-started-en` の既存例外も解消できないため却下。

### アプリ側 bundling の反映範囲

英語版を「どこまでアプリに同梱・ロケール切替するか」が論点。アプリで example が露出する面は 2 つ:

- **A. Reference → Samples タブ**（`reference.ts` の `samplesByView`）: view ごとに system=getting-started / deploy=deploy-only / org=org-only を表示。`system` だけロケール切替済み。
- **B. ProjectMode の初期シード**（`useProjectInitialization.ts`）: 起動時に開くスタータープロジェクト（getting-started / client-mcp / multi-file-system / feature-samples 等）。

**案1: Samples タブのロケール切替を完成させる（推奨）**
`deploy-only` / `org-only` に `_EN` を足し、`samplesByView` の `deploy` / `org` も `locale` で切替。英語ユーザーの Samples タブが 3 view とも英語になる。範囲が小さく、既存 precedent（getting-started）と同型。

**案2: 同梱プロジェクト全部に `_EN` を用意**
client-mcp / multi-file-system のシードも en 化。網羅的だが、シードは「最初に開くサンプル」で必ずしもロケール対訳が要るわけではなく、同梱物と保守が倍増する。

## 比較

| 観点 | 案1（Samples タブ完成） | 案2（全同梱 en 化） |
| --- | --- | --- |
| 英語ユーザー体験 | Samples タブが全 view 英語 | シードも英語 |
| 追加同梱（examples.ts） | +2（deploy-only, org-only） | +4〜（client-mcp, multi-file-system…） |
| 保守（drift ペア） | 小 | 大 |
| docs gallery への影響 | なし（gallery は別途 10 例 en 化） | なし |

## 現時点の方針

- **docs gallery**: シナリオ 10 例すべてを `examples/en/<name>/` で英語化し、manifest の en エントリを向ける（gallery は en/ja 完全対応）。
- **アプリ**: **案1** を採用。`deploy-only` / `org-only` に `_EN` を足し `samplesByView` をロケール切替（`getting-started` は対応済み）。シードプロジェクト（client-mcp / multi-file-system）の en 化は当面見送る（未解決の問い参照）。
- `getting-started-en` → `examples/en/getting-started` へ移行し、`examples-sync.md` マッピング表・`examples.ts`・docs manifest・参照を更新。
- `examples.ts` への追加・移動は `examples-sync` ルールに従い byte 一致を保つ（`/update-examples` または同等手順）。

### 実装の指針

1. `git mv examples/getting-started-en examples/en/getting-started`。参照（manifest / examples.ts コメント・パス / docs リンク）を grep して張り替え。
2. `examples/en/<name>/` を 10 シナリオ分作成（ja から構造コピー + ラベル英訳）。multi-file は dir 内で import 完結。
3. docs-site manifest: 各シナリオページの en `entry`/`githubDir` を `examples/en/<name>` に。
4. `examples.ts`: `DEPLOY_ONLY_PROJECT_EN` / `ORG_ONLY_PROJECT_EN` を追加し `reference.ts` の `samplesByView` で `locale` 切替。`examples-sync.md` マッピング表に追記。
5. テスト: gallery render smoke（per-locale で `examples/en` を拾う）/ `examples.test.ts` の byte 一致 / `reference.ts` の Samples タブ locale テスト（`ReferenceContent.test.tsx` を en deploy/org に拡張）。
6. AT: `docs/acceptance/1642-en-ja-examples.md`。
7. ADR 昇格: 実装完了後に昇格、本 Design Doc は同 PR で削除。

## 未解決の問い

- **シードプロジェクト（client-mcp / multi-file-system）の en 化**: ProjectMode の起動シードまで en/ja 切替するか。当面は見送り（案1）でよいか、それとも揃えるか。
- **ja の `examples/ja/` への移行**: 完全対称（lang/name を ja にも適用）を将来やるか。今回は ripple 回避で root 据え置き。
