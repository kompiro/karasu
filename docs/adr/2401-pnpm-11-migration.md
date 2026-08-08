---
id: ADR-2401
title: pnpm 11 へ移行し、pnpm 設定の正本を pnpm-workspace.yaml に一本化する
status: accepted
date: 2026-08-08
topic: build
related_to:
  - ADR-1338
  - ADR-1474
  - ADR-2397
  - ADR-9020
scope:
  concerns: [ci, dependencies, security]
assumptions:
  - "grep: pnpm-workspace.yaml :: read-yaml-file@1:"
  - "grep: package.json :: \"packageManager\": \"pnpm@11\\."
  - "file: scripts/ci/pnpm-config-location.test.ts"
---

# ADR-2401: pnpm 11 へ移行し、pnpm 設定の正本を pnpm-workspace.yaml に一本化する

- **日付**: 2026-08-08
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2401](https://github.com/kompiro/karasu/issues/2401)
  - [ADR-1474](./1474-dependabot-security-2026-05-20.md)（transitive security alert を override で解決する運用ルール — 置き場が本 ADR で移る）
  - [ADR-1338](./1338-fast-uri-override-pin.md)（override による security 固定の前例）
  - [ADR-2397](./2397-node-24-baseline.md)（Node 24 baseline — pnpm 11 の要求 `>= 22.13` を満たす）
  - [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)

## 背景

pnpm 10.33.0 に留まっていた（当時の最新は 11.20.0、10 系最新も 10.34.5）。pnpm 11 は単なる版上げではなく、**このリポジトリが実際に使っている設定面を削除する**。

- `package.json` の `pnpm` フィールドを読まなくなる（[pnpm#10086](https://github.com/pnpm/pnpm/pull/10086)）。ここには transitive のセキュリティ floor 22 件が入っていた
- `onlyBuiltDependencies` 系が削除され `allowBuilds` に統合される
- `minimumReleaseAge` / `blockExoticSubdeps` / `strictDepBuilds` の既定値が変わる

とりわけ 1 番目が危険なのは、**pnpm がこれをエラーにせず、警告を出して続行する**点にある。設定は黙って無かったことになり、build は緑のままになる。Node 24 の devcontainer（ADR-2397）が pnpm 11.17.0 を同梱するようになったため、この警告は既に毎コマンド表示されていた。

## 決定

`packageManager` を `pnpm@11.20.0` に上げ、`overrides` と `allowBuilds` を `pnpm-workspace.yaml` に置く。`minimumReleaseAge` は **pnpm 既定の 1440（1 日）のまま**にする。設定の置き場は `scripts/ci/pnpm-config-location.test.ts` で機械的に縛る。

## 理由

- **移行の全リスクは overrides の移設に集中している。** 22 件の大半は GHSA 由来で、transitive に届く手段が override しか無かったもの（ADR-1474 以降）。そこで**二段階で検証した**: まず pnpm 10.33.0 のまま設定だけを移して `pnpm install --frozen-lockfile` が lockfile 無変更で通ることを確認し（pnpm 10 は両方の置き場を読む）、その後で版を上げた。これにより「置き場を移したせい」と「pnpm 11 のせい」を分離できる。結果は両段階とも lockfile がバイト単位で不変、overrides 22 件も同一、`js-yaml@4.3.1` / `dompurify@3.4.12` の解決も変わらず。
- **`minimumReleaseAge` は 7 日にしない。** Issue #2401 は「Dependabot cooldown の 7 日に揃える」と書いていたが、これは**スコープの取り違え**だった。cooldown は bot が**宣言依存**に対して起票する PR を遅らせる。`minimumReleaseAge` は install のたびに **lockfile 全 1479 エントリ**を検査し、誰も選んでいない transitive も対象にする。実際 10080 を設定すると、`rolldown@1.2.2` とその platform binding 13 件、`nanoid@3.3.17`（いずれも vite 経由の transitive、5 日前公開）が引っかかり、**CI を含む全 install が失敗した**。数字を揃えるとサプライチェーン上の選好が時間依存のビルドゲートに化ける。1 日は「公開直後の侵害版が数時間で yank される」という実際の攻撃には効き、そのコストが無い。
- **first-party パッケージは age check から除外する。** 1 日ポリシーは導入直後に実際に発火した: `@kompiro/adr-tools@0.0.11` が公開 1 時間で main に入り（[#2407](https://github.com/kompiro/karasu/pull/2407)）、install が落ちた。このポリシーが買っているのは「**他の誰か**が侵害された release に気づいて yank するまでの窓」であって、自分の repo から OIDC で公開していて他に利用者がほぼいないパッケージには、その「他の誰か」が存在しない。遅延は「修正を publish して即 karasu で採用する」ループを壊すだけで、見返りが無い。`minimumReleaseAgeExclude` に `@kompiro/adr-tools` と `@kompiro/tpl-tools` を置く。**この免除が成立するのは first-party である限り**なので、third-party をここに足してはいけない（floor を上げるか待つ）。
- **`allowBuilds` では拒否も明示する。** `strictDepBuilds` が既定 true になったため、postinstall を持つ未宣言パッケージは install エラーになる。`@vscode/vsce-sign` と `keytar` は pnpm 10 でも skip されていたので、`false` と明記して従来の挙動を保つ。
- **本当の危険はコードでなくドキュメントにあった。** ADR-1474 とそれを引用する約 10 本の security ADR、そして `.claude/rules/dependabot.md` が「root `package.json` の `pnpm.overrides`」と**ファイル名で**手順を書いている。`.claude/rules/dependabot.md` は Dependabot triage 中に自動で読み込まれる行動ルールで、まさに 22 件の floor を保守する作業の入口にある。放置すると、次の triage が floor を上げたつもりで何も起きず、緑のまま未修正の依存が残る。ルール側に置き場の節を新設し、ADR-1474 の運用ルールには注記を付けた（ADR 本文は歴史的記録として書き換えない）。
- **ガードは「`pnpm` フィールドが復活していないこと」を見る。** pnpm 自身が警告止まりである以上、CI で落ちる場所を 1 つ作らないと再発が観測できない。あわせて v11 が削除した設定キー 10 種と、`packageManager` が 11 以上であることも縛る（10 以下なら `pnpm` フィールドはまだ有効で、このガードは実態と無関係な形を強制することになる）。

## 却下した案

- **公式 codemod（`codemod run pnpm-v10-to-v11`）を使う。** 実行に TTY 承認が必要で（`Failed to get user input: The input device is not a TTY`）非対話環境で完走しない。加えて、承認を求められるのは実行時に `app.codemod.com` から取得したコードを `node -e` で走らせる操作だった。**サプライチェーンの pin 22 件を保全することが目的の変更で、そのために遠隔取得したコードに書き換えさせるのは筋が悪い。** 移行面は既に列挙し尽くしていて手作業で足りる規模であり、差分を全部読めるほうが価値が高い。
- **`minimumReleaseAge: 10080` + `minimumReleaseAgeExclude` で 7 日を維持する。** 上記の 16 件を除外すれば通るが、高頻度リリースの transitive が新たに入るたびに install が壊れ、除外を足す運用になる。ガードのつもりが運用負債になる。
- **10 系最新（10.34.5）に留まる。** 一行で済むが、v11 で消える設定を使い続ける状態が延びるだけで、移行コストは減らない。devcontainer が既に 11 を同梱している以上、警告も出続ける。
- **`engines.node` のように pnpm も段階的に上げる。** pnpm は開発ツールチェーンであって公開パッケージの利用者に対する約束ではないので、下限を刻む理由が無い（ADR-2397 が `engines.node` を 22 に留めたのとは事情が異なる）。

## 影響

- 初回 install は node_modules の purge を伴う（store が v11 / SQLite index に変わるため）。非対話環境では `CI=true` か `confirmModulesPurge: false` が要る。GitHub Actions は `CI` を立てるので CI 側の追加設定は不要。
- `changeset publish` は pnpm 11 では `pnpm publish` を native 実行し、npm CLI へ委譲しなくなる。OIDC の要件を支配するのが npm の版から pnpm の版へ移る（ADR-2397 / ADR-9020 の注記を参照）。次回リリースが実地の検証点になる。
- lockfile は `lockfileVersion: '9.0'` のまま変わらなかった（`patchedDependencies` を持たないため v11 の形式変更に該当しない）。
