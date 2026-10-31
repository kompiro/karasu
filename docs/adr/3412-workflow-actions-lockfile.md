---
id: ADR-3412
title: GitHub Actions の依存を actions.lock で固定し、検証を required check にする
status: accepted
date: 2026-10-30
topic: build
scope:
  concerns: [ci, security, dependencies]
related_to: [ADR-128, ADR-1866, ADR-2658, ADR-2753]
assumptions:
  - "file: .github/workflows/actions.lock"
  - "grep: .github/workflows/verify-lockfile.yml :: gh actions-lock --verify"
  - "grep: .gitignore :: !\\.github/workflows/actions\\.lock"
---

# ADR-3412: GitHub Actions の依存を actions.lock で固定し、検証を required check にする

- **日付**: 2026-10-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3412](https://github.com/kompiro/karasu/issues/3412)、PR [#3413](https://github.com/kompiro/karasu/pull/3413)
  - gh-aw の生成物の恒久的な扱い: Issue [#3415](https://github.com/kompiro/karasu/issues/3415)
  - [ADR-128](128-dependabot.md)（Dependabot による依存更新）
  - [ADR-1866](1866-e2e-required-status-check.md)（path filter 付きの required check と paired stub）
  - [ADR-2658](2658-gh-aw-dependency-automation.md)、[ADR-2753](2753-dependabot-triage-2026-09-07.md)（gh-aw の `.lock.yml` は `gh aw compile` で動かす）
  - [Workflow dependency lockfiles](https://docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles)

## 背景

remote の action を指す workflow の `uses:` は、すべて `owner/repo@<sha> # vX.Y.Z` の形で commit SHA に固定していた。これは直接の依存しか守らない。
固定した composite action が内部で `some/action@v1` を使っていれば、その `v1` が付け替えられたときに
付け替え後のコードが job で動く（2026-03 の `aquasecurity/trivy-action` から `setup-trivy` への事例）。

2026-10-28 に GitHub Actions の workflow lockfile（`.github/workflows/actions.lock`）が GA になった。
lockfile は直接・推移的な action をすべて commit SHA と owner / repository の ID で記録し、runner が job の開始時に
照合する。GitHub の secure-use の指針も、lockfile を第一に、SHA 固定を代替として勧めるようになった。

## 決定

workflow が使う action は、直接・推移的なものを含めて `actions.lock` に固定する。workflow の `uses:` は
`owner/repo@vX.Y.Z` の完全なタグで書き、`verify-lockfile.yml`（`gh actions-lock --verify`）を PR ごと・main への push・
週次で走らせて main ruleset の required check（`verify`）にする。

## 理由

- **推移的な依存まで固定できる。** inline の SHA 固定では、action が内部で使う action を固定する手段がない。
  lockfile はそれも commit と owner / repository の ID で記録する。移行時点で推移的な依存は
  `actions/upload-pages-artifact@v5.0.0` が使う `actions/upload-artifact@bbbca2d…`（v7.0.0）の 1 つで、これは upstream が
  既に SHA で固定していた。lockfile が足したのは、その記録と ID の照合、upstream がタグに替えたときの保護である
- **固定先は変わっていない。** 13 個の action すべてで、lockfile が記録した commit は移行前の inline の SHA と一致した。
  移行は版を動かさず、守る範囲だけを広げた
- **lockfile に載らない workflow はタグをそのまま解決する。** runner が照合するのは lockfile に載った workflow だけで、
  workflow を足して `gh actions-lock` を忘れると、その workflow は付け替え可能なタグで動く。
  これを merge の前に止めるのが required check の役目で、`verify` が落ちたまま main に入らない
- **`paths:` を付けずに全 PR で走らせる。** job は数秒で終わるので、ADR-1866 の paired stub（path filter 付きの
  required check が永久 pending にならないための skip workflow）を足すより単純である。週次の実行は、workflow を
  編集しないあいだに upstream でタグが動いたことを拾う
- **拡張は tag で固定する。** `gh extension install github/gh-actions-lock --pin v0.4.0`。拡張は事前ビルドの
  バイナリで SHA を指定できないが、v0.4.0 は immutable release で asset を差し替えられない。job は `contents: read`・
  `persist-credentials: false` で secret を持たず、最悪でも検査が誤って通るだけである

### 運用

- workflow を追加・削除・改名したとき、または `uses:` を手で変えたときは、リポジトリのルートで `gh actions-lock` を
  実行して lockfile を commit する。手順は `docs/release.md`「GitHub Actions の依存（actions.lock）」
- `./.github/actions/purge-preview-deployments` は `run:` ステップしか持たないので、lockfile の対象外で警告だけが出る。
  remote の action を使い始めたら `--verify` がエラーにするので、そのときに `--migrate-local-actions`（`./…` を同じリポジトリの `$/…` に書き換えて lockfile の対象にする）か `--ignore-local-actions` を決める
- 個人のグローバル gitignore が `*.lock` を無視していても lockfile が `git status` に出るよう、`.gitignore` に
  `!.github/workflows/actions.lock` を置く

### gh-aw の生成物（暫定、#3415）

`gh actions-lock` は gh-aw の `.lock.yml` の `uses:` もタグに書き換える。`gh aw compile` は常に `@<sha> # vX` を出力する
ので、2 つのツールが同じ行で食い違う。恒久的な扱いは #3415 で決め、それまでは次のとおりにする。

- 再生成は `gh aw compile` の後に `gh actions-lock` を実行する 2 段にする（`.claude/rules/dependabot.md`）。
  この間、commit した `.lock.yml` は `gh aw compile` の出力と一致しない。ADR-2753 の「再コンパイルしても差分が出ない」
  ことは、`gh actions-lock` を当てる前の出力に対してだけ確かめる。これは #3415 が解くまで受け入れる代償である
- `scripts/ci/gh-aw-lock-consistency.test.ts` は、`actions.lock` が固定しているタグを SHA 固定の代わりとして通す。
  `.github/aw/actions-lock.json` に載っていない action（compiler が既定で使う `actions/*`）も、40 桁の SHA か
  `actions.lock` が固定するタグでなければ落とす。載っている action は、manifest コメントの SHA と版が
  `actions-lock.json` の項目と一致しなければ落とす。タグ形の setup の `uses:` も `compiler_version` と照合し、`actions.lock` と `.github/aw/actions-lock.json` が
  同じ SHA を記録していることも確かめる。ADR-2753 で却下した形（`uses:` だけを上げた bot PR）をこのテストが落とす性質は、これで保つ

## 却下した案

- **inline の SHA 固定を続ける。** 推移的な依存が守れないという、移行の理由そのものが残る
- **lockfile を入れつつ `uses:` は SHA のまま残す。** `gh actions-lock` は実行するたびに SHA をタグへ書き換え、
  lockfile を手で書くことは前提にない。gh-aw の 2 ファイルだけ SHA に戻す案も同じ理由で成り立たなかった
- **`paths:` を残して paired stub を足す。** 数秒の job のために workflow を 1 本増やす理由がない
- **Actions 設定の「Require actions to be pinned to a full-length commit SHA」を有効にする。** GitHub の文書では、
  lockfile に載った workflow はこの条件を満たすとされている。required check だけで lockfile に載らない workflow の
  merge を止められるので、今回は設定を足さなかった。挙動は確かめていない
