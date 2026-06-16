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

- **構造は `examples/<lang>/<name>/`（ja / en とも、完全対称）**。ja は `examples/<name>/`（root）から `examples/ja/<name>/` へ移行、en は `examples/en/<name>/`。`getting-started-en` → `examples/en/getting-started`、`getting-started` → `examples/ja/getting-started`。
- **language-neutral な集合は lang セグメントを付けず据え置く**: `feature-samples`（英語ラベルの構文デモ + byte 一致ガード）は `examples/feature-samples/` のまま、`ec-platform`（段階チュートリアル）も既存運用を尊重（移行対象は「ロケール対訳を持つ／持たせる example」に限る。詳細は実装の指針）。
- en/ja は **構造を同一**に保つ（ペアの drift を避ける）。各 example が ja/en の対になり、編集時に両方の同期が要る（`getting-started` ペアと同じ保守コストの拡大）。
- 新規 `.krs` は diagnostics-clean。`examples/feature-samples/` の中身には触れない（既に英語 + byte 一致ガード）。
- docs gallery は #1640 の per-locale 機構をそのまま使う（manifest の ja/en `entry`/`githubDir` を `examples/ja|en/...` に向ける）。

### 影響範囲（ja を動かす ripple — 大きい）

ja を `examples/ja/` へ動かすのは repo 横断のリネームで、以下すべての張り替えが要る。**レビュー容易性のため「ja 移行」は独立したコミット（理想的には独立 PR）に分ける**ことを推奨:

- `.claude/rules/examples-sync.md` のマッピング表（全パス）
- `packages/core/src/builtins/examples.ts` の path / コメント、`packages/core/src/examples.test.ts` の参照パス
- `docs/guide/**`・`docs/spec/**`・`docs/concepts*`・`README*` 内の `../../examples/<name>/...` リンク多数
- docs-site gallery manifest（#1640）と `githubDir`
- アプリ同梱・シードのパス参照

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

- **構造**: `examples/<lang>/<name>/`（ja / en 完全対称）。`feature-samples` 等の language-neutral 集合は据え置き。
- **docs gallery**: シナリオ 10 例を ja/en 両方で `examples/ja|en/<name>/` 化し、manifest の ja/en エントリを向ける（gallery は en/ja 完全対応）。
- **アプリ**: Samples タブの locale 切替を完成（`deploy-only` / `org-only` に `_EN`、`samplesByView` を locale 切替）し、**シードプロジェクト（client-mcp / multi-file-system）も `_EN` を用意して locale 切替**（getting-started は対応済み）。
- `examples.ts` への追加・移動・パス変更は `examples-sync` ルールに従い byte 一致を保つ（`/update-examples` または同等手順）。

### 実装の指針（フェーズ分け推奨）

レビュー容易性のため、できれば以下を分けてコミット／PR する:

- **Phase A — en 版の追加 + 反映**（ripple 小）:
  1. `examples/en/<name>/` を 10 シナリオ分作成（構造コピー + ラベル英訳）。`getting-started-en` → `examples/en/getting-started`。multi-file は dir 内で import 完結。
  2. docs-site manifest の en `entry`/`githubDir` を `examples/en/...` に。
  3. `examples.ts`: `DEPLOY_ONLY_PROJECT_EN` / `ORG_ONLY_PROJECT_EN` と、シードの `CLIENT_MCP_PROJECT_EN` / `MULTI_FILE_SYSTEM_PROJECT_EN` を追加。`reference.ts` の `samplesByView` と `useProjectInitialization` を locale 切替。`examples-sync.md` に追記。
- **Phase B — ja を `examples/ja/` へ移行**（ripple 大、上記「影響範囲」の全張り替え）。`getting-started` → `examples/ja/getting-started`。docs リンク・manifest・examples.ts・テストを一括更新。
- **共通**: テスト（gallery render smoke は per-locale で `examples/ja|en` を拾う / `examples.test.ts` byte 一致 / `ReferenceContent.test.tsx` を en deploy/org・seed に拡張）、AT `docs/acceptance/1642-en-ja-examples.md`、実装完了後に ADR 昇格（本 Design Doc は同 PR で削除）。
