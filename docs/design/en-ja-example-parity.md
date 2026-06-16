# en/ja で example を揃える（docs gallery + アプリの Samples）

- **Issue**: [#1642](https://github.com/kompiro/karasu/issues/1642)
- **PR**: [#1644](https://github.com/kompiro/karasu/pull/1644)
- **日付**: 2026-06-16
- **ステータス**: 検討中

## 背景・課題

docs サイトの Examples gallery（#1640）と、アプリの Reference → Samples タブは、`examples/` の `.krs` をレンダリングして見せる。`examples/` のシナリオ系は**ラベルが日本語**なので、英語ロケールの面（gallery の `/examples/`、Samples タブの英語表示）でも日本語の図が出る。`getting-started` だけ `getting-started-en` の対があり英語化済み。

en/ja のユーザーがそれぞれ自言語の図を見られるよう、**シナリオ example の英語版を用意して docs gallery を en/ja 完全対応にする**。docs-site 公開を前提にすると、アプリは網羅同梱を持つ必要が薄く、**最小シードに徹する**（網羅カタログは gallery が担う）。本 Design Doc は、(1) `examples/` の構造、(2) アプリ同梱をどこまでに留めるか、を決める。translate（ラベルの英訳作業そのもの）は実装で行う。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| examples 構造 | ja 版は `examples/<name>/`（root 直下）。英語は `examples/en/getting-started/` だけが例外的に存在 |
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
- **language-neutral な集合は lang セグメントを付けず据え置く**: `feature-samples`（英語ラベルの構文デモ + byte 一致ガード）は `examples/en/feature-samples/` のまま、`ec-platform`（段階チュートリアル）も既存運用を尊重（移行対象は「ロケール対訳を持つ／持たせる example」に限る。詳細は実装の指針）。
- en/ja は **構造を同一**に保つ（ペアの drift を避ける）。各 example が ja/en の対になり、編集時に両方の同期が要る（`getting-started` ペアと同じ保守コストの拡大）。
- 新規 `.krs` は diagnostics-clean。`examples/en/feature-samples/` の中身には触れない（既に英語 + byte 一致ガード）。
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

「英語版をどこまでアプリに同梱するか」より一段上の問い: **docs-site gallery が公開されるなら、アプリは example を網羅同梱する必要があるか？** アプリで example が露出する面は 2 つ:

- **A. Reference → Samples タブ**（`reference.ts` の `samplesByView`）: view ごとに system=getting-started / deploy=deploy-only / org=org-only を表示。`system` だけロケール切替済み。
- **B. ProjectMode の初期シード**（`useProjectInitialization.ts`）: 起動時に開くスタータープロジェクト。

アプリ同梱が docs-site で**代替できない**価値は「オフライン/自己完結な初回起動」「Samples のインライン参照」「core と同ビルドでのバージョン整合」の 3 点に限られる。網羅カタログは gallery が担えるので、アプリは**最小シードに徹する**のが筋。

**案A: アプリ同梱を最小に固定（採用）**
アプリの同梱・ロケール切替は **getting-started（ja/en、対応済み）だけ**。`deploy-only` / `org-only` / シードの `_EN` は**足さない**（Samples タブの deploy/org は当面 ja 許容）。網羅 en/ja は docs-site gallery に寄せ、gallery/URL からの取り込みは follow-up [#1646](https://github.com/kompiro/karasu/issues/1646) とする。

**案B: 同梱を en/ja 網羅（不採用）**
`deploy-only`/`org-only`/seed まで `_EN` 化。アプリ単体で完結するが、同梱物・保守ペアが増え、gallery と役割が重複する。docs-site 公開を前提にすると重複投資。

## 比較

| 観点 | 案A（アプリ最小・採用） | 案B（同梱網羅） |
| --- | --- | --- |
| 網羅カタログ | docs-site gallery が担う | アプリにも重複 |
| 追加同梱（examples.ts） | 0（getting-started は既存） | +4〜 |
| 保守（drift ペア） | 最小 | 大 |
| 英語ユーザーの Samples タブ | system=英語 / deploy・org=日本語（当面許容） | 全 view 英語 |
| オフライン初回起動 | 維持 | 維持 |

## 現時点の方針

- **構造**: `examples/<lang>/<name>/`（ja / en 完全対称）。`feature-samples` 等の language-neutral 集合は据え置き。
- **docs gallery（網羅の主役）**: シナリオ 10 例を ja/en 両方で `examples/ja|en/<name>/` 化し、manifest の ja/en エントリを向ける（gallery は en/ja 完全対応）。
- **アプリ（最小シードに徹する・案A）**: 新たな `_EN` 同梱は**しない**。getting-started（対応済み）のみ。Samples タブの deploy/org が日本語のままなのは許容。`getting-started` の移動に伴う `examples.ts` パス更新だけは行う。
- **gallery/URL からの取り込み**は follow-up [#1646](https://github.com/kompiro/karasu/issues/1646)（最小シードの置き換えではなく上乗せ）。
- `examples.ts` への移動・パス変更は `examples-sync` ルールに従い byte 一致を保つ（`/update-examples` または同等手順）。

### 実装の指針（フェーズ分け推奨）

レビュー容易性のため、できれば以下を分けてコミット／PR する:

- **Phase A — en 版の追加 + gallery 反映**（ripple 小、アプリは最小変更）:
  1. `examples/en/<name>/` を 10 シナリオ分作成（構造コピー + ラベル英訳）。`getting-started-en` → `examples/en/getting-started`。multi-file は dir 内で import 完結。
  2. docs-site manifest の en `entry`/`githubDir` を `examples/en/...` に。
  3. `getting-started-en` 移動に伴う `examples.ts` のパス／`examples-sync.md` マッピング更新のみ（**新規 `_EN` 同梱は足さない**）。
- **Phase B — ja を `examples/ja/` へ移行**（ripple 大、上記「影響範囲」の全張り替え）。`getting-started` → `examples/ja/getting-started`。docs リンク・manifest・examples.ts・テストを一括更新。
- **共通**: テスト（gallery render smoke は per-locale で `examples/ja|en` を拾う / `examples.test.ts` byte 一致）、AT `docs/acceptance/1642-en-ja-examples.md`、実装完了後に ADR 昇格（本 Design Doc は同 PR で削除）。
