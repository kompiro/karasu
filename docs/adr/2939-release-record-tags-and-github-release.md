---
id: ADR-2939
title: リリースごとにパッケージのタグを push し、release-YYYY-MM-DD の GitHub Release を 1 つ作る
status: accepted
date: 2026-09-28
topic: build
related_to:
  - ADR-1315
  - ADR-1316
  - ADR-1370
  - ADR-1758
  - ADR-2786
scope:
  packages: [cli, core, vscode]
  concerns: [ci, deployment]
assumptions:
  - "file: scripts/release/github-release.mts"
  - "symbol: scripts/release/github-release.mts :: pickReleaseTagName"
  - "grep: .github/workflows/release.yml :: group: release-record"
  - "grep: .github/workflows/vscode-release.yml :: group: release-record"
  - "grep: .github/workflows/vscode-release.yml :: -G'\"version\":'"
---

# ADR-2939: リリースごとにパッケージのタグを push し、release-YYYY-MM-DD の GitHub Release を 1 つ作る

- **日付**: 2026-09-28
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2939](https://github.com/kompiro/karasu/issues/2939)（決定の経緯は Issue のコメント）
  - 実装 PR: [#2943](https://github.com/kompiro/karasu/pull/2943)（タグと Release の記録）、[#2952](https://github.com/kompiro/karasu/pull/2952)（Release 本文の上限対応）
  - [ADR-1370](1370-release-flow-actions-driven.md)（Prepare → release PR → マージで publish）、[ADR-1316](1316-vscode-marketplace-publish.md)（Marketplace publish）、[ADR-1758](1758-vscode-changeset-versioning.md)（拡張を changesets の版管理に載せる）、[ADR-1315](1315-release-automation-changesets.md)（changesets 採用・independent versioning）
  - 関連 TPL: [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)
  - 後続: 月次リリーストレイン [#2922](https://github.com/kompiro/karasu/issues/2922)

## 背景

2026-09-27 に karasu 0.7.0 / @karasu-tools/core 0.3.0 / karasu-vscode 0.2.0 を出した時点で、それまでの npm と Marketplace のリリースは 1 つも repo に記録が残っていなかった。repo のタグと GitHub Release は言語仕様の `krs-spec-v1.0` だけだった。

原因は、`changeset publish` がタグを runner 上で作るだけで、どこも push していなかったこと。`karasu-vscode` は private パッケージで `privatePackages.tag: false` のため、タグ自体が作られていなかった。何が出たかは npm、Marketplace、各パッケージの `CHANGELOG.md` からしか辿れなかった。

公開履歴を照合すると、repo の「版を上げたコミット」と実際の公開も一致していなかった。

- karasu 0.2.0 は npm 上で 2021 年の旧パッケージと衝突し、我々の版は公開されていない（その後 0.6.0 に上げて出した）
- karasu-vscode 0.1.1 は一度も公開されていない
- karasu-vscode 0.1.2 は版を上げたのが `695aa5c1`、公開は `b6930f69` の時点の main から

月次リリーストレイン（#2922）を始める前に、最初のトレインから記録が残る状態にする必要があった。

## 決定

1. **リリース 1 回につき GitHub Release を 1 つ作り、タグ名を `release-YYYY-MM-DD` にする。** 日付はリリース PR のマージコミットの UTC 日付。同じ日に 2 回目以降があれば `-2`、`-3` を付ける。本文は、そのコミットに付いたパッケージのタグごとに、各 `CHANGELOG.md` の該当版の節を並べる。
2. **パッケージのタグは `<name>@<version>`（`karasu@0.7.0`、`@karasu-tools/core@0.3.0`、`karasu-vscode@0.2.0`）を、公開に成功した版にだけ付ける。**
   - npm: `release.yml` の publish ジョブが `changeset publish` の作ったタグ（公開できた版だけ）を出力し、別の `record` ジョブ（`contents: write`）がリリースコミットへ push する。npm の公開権限を持つジョブは `contents: read` のまま。
   - VS Code 拡張: `vscode-release.yml` の Marketplace publish が成功したあと、`record` ジョブが `karasu-vscode@X.Y.Z` を打つ。pre-release はタグを打たない（[#2940](https://github.com/kompiro/karasu/issues/2940)）。
3. **Release はタグから毎回作り直す。** `scripts/release/github-release.mts` はコミットに付いたパッケージのタグを集めて Release を作るか、既にあれば本文を置き換える。拡張の追記も同じスクリプトの再実行で行う。2 つの workflow の `record` ジョブは concurrency グループ `release-record`（`cancel-in-progress: false`、`queue: max`）で直列にする。
4. **拡張は、拡張の現在の版を設定したコミットからビルドする。** main の先頭からビルドすると、リリース後に入った次回分の変更が拡張に混ざるため。タグもそのコミットに打つ。
5. **Release 本文を 120,000 文字の予算に収める。** GitHub は 125,000 文字を超える本文を HTTP 422 で拒否する。超える場合は各パッケージの節を変更の区切り（箇条書きの先頭か `###` 見出し）で切り、全文はそのコミットの `CHANGELOG.md` へのリンクで示す。短い節が使わなかった予算は長い節に回す。
6. **過去のリリースは、実際に公開された時点のコミットにタグを付けて Release を作った（2026-09-28 実施）。**

   | Release | タグ | コミット |
   | --- | --- | --- |
   | `release-2026-06-18` | `karasu-vscode@0.1.0` | `41a6b1eb` |
   | `release-2026-06-19` | `karasu@0.1.0`, `@karasu-tools/core@0.1.0` | `c492b8fc` |
   | `release-2026-06-25` | `@karasu-tools/core@0.2.0` | `695aa5c1` |
   | `release-2026-06-25-2` | `karasu@0.6.0`, `karasu-vscode@0.1.2` | `b6930f69` |
   | `release-2026-06-25-3` | `karasu-vscode@0.1.3` | `f8ce5722` |
   | `release-2026-09-27` | `karasu@0.7.0`, `@karasu-tools/core@0.3.0`, `karasu-vscode@0.2.0` | `9e12cbc0` |

   `karasu@0.1.0` は CI の publish が失敗し同日に手元から公開されたため、公開元のコミットを特定できない。リリース PR のコミット `c492b8fc` に付けた。公開されていない karasu 0.2.0 と karasu-vscode 0.1.1、changesets 導入前の仮公開 karasu 0.0.1 は対象外にした。

## 理由

- **タグの存在を「公開できた」ことの記録にする。** タグは公開の成功の後にしか打たないので、タグがあれば公開されている。公開に失敗した版にタグが残らない（TPL-2786: 判定できないものを通過扱いにしない）。一部のパッケージだけ公開に失敗した場合も、公開できた分のタグは集めて push する。
- **Release をリリース 1 回で 1 つにしたのは、利用者が 1 か所を見れば済むため。** パッケージごとの Release だと、同じ日に出た CLI と拡張の変更が別ページに分かれる。
- **日付のタグ名にしたのは、版がパッケージごとに独立しているため。** ADR-1315 / ADR-1758 の independent versioning は維持する（lockstep 化の #2936 は採らなかった）。共通の版番号が無いので、どのパッケージが上がっても同じ規則で付けられる日付を使う。
- **書き込み権限を別ジョブに分けたのは、npm の公開権限を持つジョブの権限を広げないため。**
- **Release をタグから毎回作り直すのは、追記の差分管理をしないため。** 再実行しても結果が変わらない。

## 却下した案

- **共通の版 `vX.Y.Z` をタグ名にする。** 3 パッケージを同じ版に揃える lockstep（#2936 / #2938）を前提にした案。lockstep を採らないと決めたので、共通の版が存在しない。
- **パッケージのタグごとに Release を作る。** 1 回のリリースが複数ページに分かれる。
- **publish ジョブで直接タグを push する。** npm の公開権限を持つジョブに `contents: write` を足すことになる。
- **2 つの `record` ジョブの競合を、作成失敗時のやり直しで吸収する。** 失敗した側が持つ本文は自分の見つけたタグの分だけなので、やり直しで上書きすると相手の節を消しうる。直列化すれば、後のジョブは常に全タグから作り直す経路に乗る。

## 影響

- `docs/release.md` の「リリースの流れ」と「VS Code 拡張のリリース」に、タグと Release の記録を追記した（#2943）。
- 月次リリーストレイン（#2922）は、この記録の上に載る。
