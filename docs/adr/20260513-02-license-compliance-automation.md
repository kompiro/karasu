---
id: ADR-20260513-02
title: "OSS リリースのライセンス順守を allowlist CI と自動生成 THIRD_PARTY_NOTICES で機械化する"
status: accepted
date: 2026-05-13
topic: build
related_to:
  - ADR-20260512-05
scope:
  packages:
    - cli
    - vscode
  concerns:
    - ci
    - deployment
assumptions:
  - "file: scripts/ci/license-allowlist.ts"
  - "file: scripts/ci/check-license-allowlist.ts"
  - "file: scripts/ci/generate-third-party-notices.ts"
  - "file: CONTRIBUTING.md"
  - "grep: package.json :: \"check:licenses\": \"tsx scripts/ci/check-license-allowlist.ts\""
  - "grep: package.json :: \"gen:notices\": \"tsx scripts/ci/generate-third-party-notices.ts packages/cli packages/vscode\""
  - "grep: .github/workflows/ci.yml :: License allowlist"
  - "grep: packages/cli/package.json :: \"prebuild\": \"tsx ../../scripts/ci/generate-third-party-notices.ts .\""
  - "grep: packages/vscode/package.json :: \"prebuild\": \"tsx ../../scripts/ci/generate-third-party-notices.ts .\""
  - "grep: .github/PULL_REQUEST_TEMPLATE.md :: Dependency & license impact"
  - "grep: .gitignore :: THIRD_PARTY_NOTICES.md"
---

# ADR-20260513-02: OSS リリースのライセンス順守を allowlist CI と自動生成 THIRD_PARTY_NOTICES で機械化する

- **日付**: 2026-05-13
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1320](https://github.com/kompiro/karasu/issues/1320)（OSS launch — license-compliance automation）
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（OSS 化ブレインストーミング）
  - 先行調査: [#1306](https://github.com/kompiro/karasu/issues/1306)（NOTICE 監査 — 当時点で upstream NOTICE は prod 依存になし）
  - 設計検討 PR: [#1364](https://github.com/kompiro/karasu/pull/1364)（旧 `docs/design/license-compliance-automation.md` — 本 ADR に集約して削除）
  - 実装 PR: [#1365](https://github.com/kompiro/karasu/pull/1365)
  - 関連 ADR: [ADR-20260512-05](20260512-05-release-automation-changesets.md)（changesets による publish 配線 — 本件で生成される `THIRD_PARTY_NOTICES.md` を `npm publish` / `vsce package` 成果物に含める前提）

## 背景

OSS 公開（#1302）に伴い、サードパーティ依存のライセンス順守を「事故らない・低労力」な仕組みに落とす必要があった。リスクは 2 種類:

1. **コピーレフトの混入**: GPL/AGPL 系の依存を気づかず取り込むと karasu 自体の配布条件に波及しうる。PR 単位で機械的に弾きたい。
2. **upstream LICENSE テキストの再配布漏れ**: MIT も Apache-2.0 も「コードを再配布するとき upstream の LICENSE 全文を同梱する」ことを要求する。karasu の配布物のうち他者のコードを実際にバンドルしているのは `packages/vscode`（`vsce package` が `esbuild` バンドル済みの `out/extension.js` に `marked` / `vscode-languageclient` を取り込む）。`packages/cli` は ADR-20260512-05 の決定で `esbuild --bundle --external:commander,chokidar,yaml` 形式に変わったが、external 指定された依存は npm install 時解決のため厳密には再配布に該当しない — それでも #1320 は publishable package ごとの notices 同梱を要求しており、情報提供＋将来 bundle 化への保険として CLI も対象に含めた。

Apache-2.0 §4(d) の **NOTICE 条項**は別軸で、upstream が `NOTICE` ファイルを持つ場合にのみ発火する。#1306 時点で prod 依存に該当なしだが、依存が変わるたび再確認が要る。

開始時点で `.github/workflows/` に license チェックは無く、`CONTRIBUTING.md` も未作成（#1312 が本格版を作る前提だったが先行する必要があった）。pnpm@10.33.0 の `pnpm licenses list --prod --json` は `{ [spdx]: { name, versions, paths, ... }[] }` を返し、**LICENSE 全文は含まない**（`paths` 配下を自前で読む必要がある）。

ツールの候補は (a) 自前スクリプト + `pnpm licenses list`、(b) `license-checker` 系の外部ライブラリ、(c) GitHub `dependency-review-action`、(d) `oss-attribution-generator` 系の既製ジェネレータ。比較・トレードオフの詳細は旧 `docs/design/license-compliance-automation.md`（#1364）にあるが、要点は次のとおり: 既製ツールは pnpm の symlink レイアウト相性問題が出やすく `THIRD_PARTY_NOTICES` 用には LICENSE 全文を取れないものが多い; `dependency-review-action` は denylist 運用＋ Advisory DB の license データに依存し pnpm workspace で `null` になる依存が出る; `pnpm licenses list --json` が公式機能として実用可能なため外部ツールを足す動機が薄い。

## 決定

1. **production-dependency の SPDX を allowlist で機械チェックする。** `scripts/ci/license-allowlist.ts` に `LICENSE_ALLOWLIST = [MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0, 0BSD, Unlicense, CC0-1.0]` と SPDX 式（`OR` / `AND` / `WITH` / 括弧）を再帰下降パーサで評価する純関数 `isLicenseAllowed` / `findDisallowed` を置く。`scripts/ci/check-license-allowlist.ts` が `pnpm licenses list --prod --json` を実行して照合し、disallowed があれば依存名・バージョン・該当 SPDX・`CONTRIBUTING.md` への誘導を出力して `exit 1`。`.github/workflows/ci.yml` の `check` job に `License allowlist` ステップとして組み込み、root `package.json` に `check:licenses` script を生やす。SPDX 式の評価は **未知の式は fail に倒す**（fail-closed）—「気づかず通る」より「気づいて allowlist を再検討する」を優先する。

2. **`THIRD_PARTY_NOTICES.md` を build で自動生成し、git-ignore する。** `scripts/ci/generate-third-party-notices.ts` が指定パッケージごとに `pnpm --filter <name> licenses list --prod --json` を実行し、各依存の `paths[0]` 配下から `LICENSE` / `LICENCE` / `COPYING` / `NOTICE`（拡張子付き含む、大文字小文字無視、`LICENSE` を最優先）を読んで全文を埋め込んだ markdown を書き出す。`@karasu-tools/*` の workspace 内部パッケージは除外（repo 自身の `LICENSE` で配布される）。`packages/cli` と `packages/vscode` の `package.json` に `"prebuild": "tsx ../../scripts/ci/generate-third-party-notices.ts ."` を追加して build 時に必ず再生成。`packages/cli` には `files: ["dist", "THIRD_PARTY_NOTICES.md"]` と `"prepack": "pnpm run build"` を追加し `npm publish` 時に必ず同梱。`packages/vscode` は `.vscodeignore` が空で vsce のデフォルト挙動により `.md` ファイルが `.vsix` に含まれることに依存する（追加設定不要）。生成物は `.gitignore` に `THIRD_PARTY_NOTICES.md` を追加してコミットしない。

3. **NOTICE 再監査と allowlist 変更ガバナンスは PR テンプレート＋ ADR で運用する。** `.github/PULL_REQUEST_TEMPLATE.md` に `Dependency & license impact` セクションを追加し、prod 依存追加・major bump 時の「allowlist 通過確認」と「Apache-2.0 dep の upstream `NOTICE` 確認」をチェック項目化する。`CONTRIBUTING.md`（新規・最小版）に「License compliance」節を置き、allowlist の出典・`check:licenses` 失敗時の対処（① 代替を探す ② どうしても必要なら **ADR を起こして allowlist 変更を提案**）・notices 生成の挙動・年次再監査の手順を記載する。**allowlist の追加/削除は ADR 必須**（軽量な issue + 承認では監査証跡が薄いため）。`#1312` が `CONTRIBUTING.md` の本格版を整える際に本節を取り込む前提とする。

4. **GitHub の `dependency-review-action` は本件スコープ外で、リポジトリ public 化（#1302 Phase 1）後のフォローアップに残す。** allowlist による主防御が走るため二重化の優先度は低く、Dependency Graph 有効化が前提のため private 期間の挙動が読みにくい。`CONTRIBUTING.md` 末尾に「将来検討」として一言残す。

## 理由

- **自前スクリプト + `pnpm licenses list --json` を選んだのは、外部ツールの supply-chain 面積を増やさずに済み、出力メッセージ（dep 名・SPDX・対処先）を CI 失敗時に自由に作り込めるから**。pnpm の `--json` 形式と `paths` 配列を直接使えば symlink レイアウト問題は起きない。SPDX 式の評価は小さな再帰下降パーサで足り、`scripts/ci/license-allowlist.test.ts` で `OR` / `AND` / 括弧優先・`WITH` 例外句・`+` 接尾辞・不正入力を網羅テストできる。
- **SPDX 評価を fail-closed にしたのは、license-compliance の文脈では「気づかず通る」リスクが「過剰に止まる」リスクを上回るから**。`SEE LICENSE IN ...` や `Unknown` のような pnpm が返しうる文字列、未知の式形は人間が見るべきものとして CI を止める。allowlist 自体に新ライセンスを足すには ADR が要るので、止まったときの動線も明確。
- **`THIRD_PARTY_NOTICES.md` を git-ignore して build で再生成するのは、依存と LICENSE 文の最新性を CI/publish flow に強制したいから**。コミット済みファイルは「最後に手で更新した時点」で固まりがちで、`vsce package` 直前に古い notices を `.vsix` に詰めるリスクがある。`prebuild` で必ず regenerate し、`prepack` で `pnpm run build` を呼ぶ cli は `npm publish` 時に再生成される。`.vsix` への取り込みは vsce が `.md` をデフォルトで含めることに依存するが、`.vscodeignore` が空なので意図的にこの挙動に乗っている — AT-1320-D で実物確認を残した。
- **`@karasu-tools/*` の workspace 内部パッケージを除外したのは、karasu repo 自身の `LICENSE` でカバーされ二重記載になるから**。`@karasu-tools/core` は ADR-20260512-05 で CLI に esbuild バンドルされるが npm 依存ゼロのため transitively 漏れる第三者ライセンスはない（将来 core に prod 依存を入れる場合は再確認）。
- **PR テンプレート 1 本に集約し専用ファイル（例: `dependabot-major.md`）を作らなかったのは、管理対象を増やさないため**。Dependabot PR にもテンプレートが適用されるので major bump はそこで拾える。`CONTRIBUTING.md` を最小版で先行作成したのは #1312 を待たずに `check:licenses` の失敗動線を文書化する必要があったため（allowlist 変更が ADR 必須なので、その入口を作る必要があった）。
- **allowlist 変更を ADR 必須にしたのは、ライセンスの追加/削除は「いつ・なぜ・誰が」が後から追えるべき判断だから**。`scripts/ci/license-allowlist.ts` の定数が source of truth で、`CONTRIBUTING.md` はミラー — 不整合を避けるためソースを ADR に紐付ける。

## 却下した案

### `license-checker` / `license-checker-rseidelsohn` 等の外部 license-allowlist ツール

`--onlyAllow` で allowlist 指定でき実績はあるが、devDependency が増えて supply-chain 面積が広がる（#1302 の方針と逆）。pnpm の symlink レイアウトで一部依存の license が読めない事例があり、出力フォーマットの自由度も低い。pnpm が公式に `licenses list` を持つ今、外部ツールを足す動機が薄い。

### GitHub `dependency-review-action` を主防御にする

PR の依存差分に対して license / 脆弱性を見る公式 action。メンテ不要・差分ベースで速いが、Advisory DB の license データに依存し pnpm workspace の `workspace:*` で license が `null` になる依存が出る。denylist 運用（`deny-licenses`）はポジティブリストではないため未知ライセンスがすり抜けるリスクがある。**主防御としては弱い** — public 化後の追加の安全網として将来検討。

### `oss-attribution-generator` 等の既製 notices ジェネレータ

メンテ状況がまちまちで pnpm 非対応のものがある。LICENSE 全文を含めない実装も多く、結局 `paths` 走査を自前で書く羽目になる。

### `THIRD_PARTY_NOTICES.md` をコミットする

リリース時点の正確性を上げ、PR で diff を確認できるメリットがあるが、(a) Dependabot 更新ごとに巨大な notices diff が PR に乗る、(b) 「最後に手で更新した時点」と build 成果物のズレが入りうる、というデメリットの方が大きい。`prebuild` で常時 regenerate する方が CI / publish に対する保証が強い。

### `CONTRIBUTING.md` を作らず `docs/license-compliance.md` を作る

`#1312` の本格 `CONTRIBUTING.md` との衝突は避けられるが、#1320 が "Document ... in CONTRIBUTING.md" と明記しており、「License compliance」節を後から `CONTRIBUTING.md` に取り込む際の差分が大きくなる。最小 `CONTRIBUTING.md` を先行させ #1312 でマージする方が綺麗。
