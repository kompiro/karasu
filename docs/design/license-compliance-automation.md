# License-compliance automation for the OSS launch

- **日付**: 2026-05-12
- **Issue**: #1320（親: #1302 OSS launch Phase 1/2）
- **ステータス**: 完了（実装着手可）
- **関連**: #1306（初回 NOTICE 監査 — bundle 必要な upstream NOTICE は現状なし）, #1312（CONTRIBUTING.md）, #1316（VS Code Marketplace publish — `.vsix` に notices 必須）, [`docs/design/release-automation.md`](./release-automation.md)（changesets による publish）, [ADR-20260512-02](../adr/20260512-02-dependabot-batch-2026-05-12.md) 系（Dependabot cooldown）

## 背景・課題

OSS 公開（#1302）に伴い、サードパーティ依存のライセンス順守を「事故らない・低労力」な仕組みに落とす必要がある。具体的には 2 つの異なるリスクがある:

1. **コピーレフトの混入**: GPL/AGPL 系の依存を気づかず取り込むと、karasu 自体の配布条件に波及しうる。PR 単位で機械的に弾きたい。
2. **upstream LICENSE テキストの再配布漏れ**: MIT も Apache-2.0 も「コードを再配布するとき upstream の LICENSE 全文を同梱する」ことを要求する。karasu の配布物のうち **他者のコードを実際にバンドルしているのは `packages/vscode`**（`vsce package` が `esbuild` バンドル済みの `out/extension.js` に `marked` / `vscode-languageclient` を取り込む）。`packages/cli` は現状 `tsc` でコンパイルするだけで依存は npm install 時に解決されるため「再配布」には当たらないが、#1320 は「publishable package ごとに notices ファイル」を要求しており、CLI も対象に含める（実害は薄いが将来 bundle 方式に変えた場合への保険＋情報提供）。

Apache-2.0 §4(d) の **NOTICE 条項**は別の話で、これは upstream が `NOTICE` ファイルを持つ場合のみ発火する。#1306 の監査時点で prod 依存に該当なし。ただし依存が変わるたびに見直す必要がある（恒久的な仕組みが要る）。

現状:

- `.github/workflows/` に license チェックは無い。`CONTRIBUTING.md` は未作成（#1312 で本格版を作る予定）。
- `scripts/ci/` には Playwright flaky summary しか無い。新規スクリプトは `oxlint`（`scripts/` 配下を lint）・`vitest`（`scripts/vitest.config.ts`）の対象になる。
- `pnpm@10.33.0`。`pnpm licenses list --prod --json` はライセンス文字列をキーにした `{ [spdx]: PkgInfo[] }` を返す（`name` / `versions` / `paths` / `license` / `author` 等を含むが**ライセンス全文は含まない** — 全文は `paths` 配下の `LICENSE` ファイルを読む必要がある）。

## 制約・前提

- pnpm workspaces モノレポ。CI は GitHub Actions。fork でも基本ビルド/テストが通ること（#1302 §2）。→ チェックは追加の secret なしで動くこと。
- メンテナ実質 1 人・"best-effort, no SLA"。重い専任プロセスは不可。allowlist の更新は稀。
- `release-automation.md` の publish フローはまだ未実装（`release.yml` 無し、`@karasu-tools/core`/`lsp` は `private: true` のまま）。本デザインは publish フローに依存しないが、生成した notices ファイルが `npm publish` / `vsce package` の成果物に含まれるよう **`files` / `.vscodeignore` / `prepack` 側の手当て**を最小限行う。
- `.krs` spec のバージョンとパッケージのバージョンは別軸（#1302）。本件はバージョニングには触れない。
- 言語ポリシー（CLAUDE.md）: ドキュメントは日本語、生成物・CI メッセージ・`CONTRIBUTING.md`・PR テンプレートは英語。

## 検討した選択肢

### Task 1（コピーレフト混入防止）の手段

#### 案 1-A: 自前スクリプト + `pnpm licenses list --json`（採用）

`scripts/ci/check-license-allowlist.ts` が `pnpm licenses list --prod --json` を実行し、トップレベルのライセンスキーを allowlist と照合。SPDX 式（`(MIT OR Apache-2.0)` 等）は簡易評価する（`OR` ⇒ どれか 1 つ allowed なら可、`AND` ⇒ 全部 allowed なら可）。allowlist 外があれば dep 名・version・該当 SPDX・対処先（`CONTRIBUTING.md`）を出力して `exit 1`。

- **メリット**: 依存ゼロ（pnpm 同梱機能のみ）。出力メッセージを自由に作れる（受け入れ基準「clear message」を満たす）。SPDX 評価ロジックを純関数に切り出して `scripts/ci/license-allowlist.test.ts` で fixture テストできる。
- **デメリット**: SPDX 式の評価を自前で持つ（ただし allowlist 運用なので「未知の式は fail（人間が見る）」で十分安全側に倒せる）。

#### 案 1-B: `license-checker` / `license-checker-rseidelsohn` 等の既存ツール

npm にある定番。`--onlyAllow` で allowlist 指定可。

- **メリット**: 実績あり。
- **デメリット**: devDependency が増える（supply-chain 面積が増える — #1302 はむしろ依存を絞りたい文脈）。pnpm の symlink レイアウトと相性問題が出ることがある。出力フォーマットの自由度が低い。pnpm が公式に `licenses list` を持つ今、外部ツールを足す動機が薄い。

#### 案 1-C: GitHub の dependency-review-action

GitHub 公式 action。PR の依存差分に対して license / 脆弱性をチェックでき、`deny-licenses` を指定できる。

- **メリット**: メンテ不要。差分ベースなので速い。
- **デメリット**: GitHub Advisory DB の license データに依存し、pnpm workspace の `workspace:*` や一部パッケージで license が `null` になりがち。Dependency Graph が有効でないと動かない（private 期間の挙動も読みづらい）。allowlist（ポジティブリスト）ではなく denylist 運用で、未知ライセンスをすり抜けるリスク。**補完としては有用**だが主防御には弱い。

→ **案 1-A を採用**。1-C は将来 public 化後に「追加の安全網」として足す余地あり（本件スコープ外、`CONTRIBUTING.md` か follow-up に書く）。

### Task 2（THIRD_PARTY_NOTICES 生成）の手段

#### 案 2-A: `oss-attribution-generator` 等の既存ジェネレータ

- **メリット**: 既製。
- **デメリット**: メンテ状況がまちまち。devDependency 増。pnpm レイアウト非対応のものがある。出力に LICENSE 全文が入らないものもある（結局自前で path 走査が要る）。

#### 案 2-B: 自前スクリプト `scripts/ci/generate-third-party-notices.ts`（採用）

`generate(packageDir)`:
1. `pnpm --filter <pkgName> licenses list --prod --json` を実行（そのパッケージの prod 依存ツリーのみ）。
2. 各依存について `paths[0]` 配下から LICENSE ファイル候補（`LICENSE` / `LICENCE` / `COPYING` ± `.md` / `.txt`、大文字小文字無視）を読む。見つからなければ `License: <spdx>（license file not found）` の 1 行で代替。
3. `workspace:*` の内部パッケージ（karasu 自身、Apache-2.0）は除外。
4. `<packageDir>/THIRD_PARTY_NOTICES.md` に「name@version + SPDX + 区切り + LICENSE 全文」を連結して書き出す。

CLI 引数で対象パッケージディレクトリのリストを受ける（`packages/vscode packages/cli`）。

- **メリット**: 依存ゼロ。LICENSE 全文を確実に含められる（受け入れ基準を満たす）。pnpm の `paths` を使うのでレイアウト問題なし。純粋ヘルパ（LICENSE ファイル探索・markdown 整形）を `scripts/ci/generate-third-party-notices.test.ts` でテストできる。
- **デメリット**: 自前メンテ。ただしロジックは小さい。

#### ビルドパイプラインへの結線

- **`packages/vscode/package.json` の `build`**: 先頭に `tsx ../../scripts/ci/generate-third-party-notices.ts .` を追加（pnpm script なら root の `node_modules/.bin` が PATH に乗るので `tsx` を直接呼べる）。`.vscodeignore` は現状空 → package ルートの `THIRD_PARTY_NOTICES.md` は `.vsix` に入る（README.md 以外の `.md` も vsce はデフォルトで含める）。
- **`packages/cli/package.json`**: `build` の先頭に同様の生成を追加。`files: ["dist", "THIRD_PARTY_NOTICES.md"]` を追加し、`prepack: "pnpm run build"` で `npm publish` 前に必ず再生成。
  - 注: `release-automation.md` は core/lsp/cli の `private` 解除や `files` 整備を #1315 のスコープとしている。本件では **cli の `files`/`prepack` のみ**最小で触り、core/lsp は触らない（cli はバンドルに最も近く notices の主対象なため）。重複したら #1315 とマージ時に調整。
- **`.gitignore`**: `THIRD_PARTY_NOTICES.md` を追加（生成物・コミットしない）。
- **CI**: `.github/workflows/ci.yml` の `check` job に notices 生成のスモーク（`pnpm --filter karasu-vscode run build` 経由で間接的にカバーされるなら追加不要）。少なくとも `check:licenses` ステップは追加する。

### Task 3（NOTICE 再監査の仕組み化）

- **PR テンプレート**（`.github/PULL_REQUEST_TEMPLATE.md`）に `## Dependency & license impact` セクションを追加:
  - `[ ] N/A — no production dependency added or major-bumped`
  - `[ ] New / major-bumped prod dep: its SPDX is in the CONTRIBUTING.md allowlist (CI \`check:licenses\` passes)`
  - `[ ] If a new Apache-2.0 dep was added, checked upstream for a \`NOTICE\` file and merged it into our \`NOTICE\` if present`
- **`CONTRIBUTING.md`**（新規・最小版。#1312 が本格版を作る前提でその中に「License compliance」節を置く）:
  - allowlist の一覧と根拠
  - `check:licenses` が落ちたときの対処フロー（① 代替ライブラリを探す ② どうしても必要なら allowlist 変更の ADR を提案しレビューを得る — allowlist の変更は ADR 必須）
  - `THIRD_PARTY_NOTICES.md` が build で自動生成される旨（手で編集しない）
  - 「Annual license re-audit」note（`pnpm licenses list --prod --long` を年 1 回見る／Apache-2.0 §4(d) NOTICE の発火条件）
- Dependabot の major bump も PR テンプレート経由で同じチェックに乗る（Dependabot PR にもテンプレートが適用される）。専用 `dependabot-major.md` は作らず PR テンプレート 1 本に集約（管理対象を増やさない）。
- **allowlist の変更は ADR を要する**（壁打ちの結論）。allowlist にライセンスを追加/削除するときは `docs/adr/` に ADR を起こす。`CONTRIBUTING.md` にもその旨を明記し、「`check:licenses` が落ちたら ① 代替を探す ② どうしても必要なら ADR を提案してレビューを得る」というフローにする。

## 比較（要約）

| 観点 | 採用案 | 却下案との差 |
|---|---|---|
| Task 1 手段 | 自前 + `pnpm licenses list` | 外部ツール（依存増・pnpm 相性）/ dependency-review-action（denylist・GH Graph 依存）より安全側＆軽量 |
| Task 2 手段 | 自前スクリプト（LICENSE 全文を path から収集） | 既製ジェネレータ（メンテ不安・全文欠落・pnpm 非対応）を回避 |
| notices の対象 | vscode（必須）＋ cli（保険） | core/lsp は #1315 に委ね本件では触らない |
| 再監査 | PR テンプレートのチェック項目 1 本＋年次手動 | 専用チェックリストファイルを増やさない |
| 安全網 | （将来）dependency-review-action を follow-up | 今は scope 外と明記 |
| 文書配置 | 最小 `CONTRIBUTING.md` の「License compliance」節（#1312 が後で本格版に統合） | issue 文面 "Document ... in CONTRIBUTING.md" に合わせる |
| allowlist 変更 | ADR 必須 | 軽量な「issue + 承認」より監査証跡を優先 |

## 現時点の方針

上記の採用案で実装する。成果物:

1. `scripts/ci/license-allowlist.ts`（allowlist 定数 + `findDisallowed` 純関数）, `scripts/ci/check-license-allowlist.ts`（CI エントリ）, `scripts/ci/license-allowlist.test.ts`
2. `scripts/ci/generate-third-party-notices.ts`（`generate(packageDir)` + CLI）, `scripts/ci/generate-third-party-notices.test.ts`
3. root `package.json`: `"check:licenses": "tsx scripts/ci/check-license-allowlist.ts"`（必要なら `"gen:notices"` も）
4. `.github/workflows/ci.yml`: `check` job に `License allowlist` ステップ
5. `packages/vscode/package.json` / `packages/cli/package.json`: `build` に notices 生成を結線、cli に `files` / `prepack`
6. `.gitignore`: `THIRD_PARTY_NOTICES.md`
7. `CONTRIBUTING.md`（License compliance 節）, `.github/PULL_REQUEST_TEMPLATE.md`（Dependency & license impact 節）
8. `docs/acceptance/1320-license-compliance-automation.md`（人手検証項目: GPL 依存を入れた PR が分かりやすいメッセージで CI 落ち / `vsce package` の `.vsix` に読める notices ファイルが入る）

TPL: `docs/test-perspectives/` に CI/tooling 系の該当観点は現状なし。allowlist の SPDX 式評価は「未知の式は fail に倒す」設計で安全側のため proactive TPL は起こさない（必要なら実装時に再判断）。

実装完了後、本デザインドキュメントは ADR へ昇格させる（`docs/adr/`）。

## 決定事項（壁打ちの結論）

1. **文書配置**: 本件で最小の `CONTRIBUTING.md`（「License compliance」節のみ）を新規作成する。#1312 がこれを本格版に統合する。`docs/license-compliance.md` 案は不採用（#1320 の文面に合わせる）。
2. **notices の対象**: `packages/vscode`（必須・実際に bundle）と `packages/cli`（情報提供＋将来 bundle 化への保険）の両方で生成・同梱する。
3. **allowlist の変更には ADR を要する**: ライセンスの追加/削除は `docs/adr/` に ADR を起こす。`CONTRIBUTING.md` の「対処フロー」にも明記。
4. **dependency-review-action は本件スコープ外**: public 化後の追加の安全網として follow-up に残す（`CONTRIBUTING.md` に一言）。
