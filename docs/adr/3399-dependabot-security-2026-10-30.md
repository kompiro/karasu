---
id: ADR-3399
title: Dependabot security alert 2026-10-30（qs と serialize-javascript の override floor を修正版へ上げ、launch-editor を override し、@azure/msal-node は @azure/identity 4.14.1 が公開から 1 日経ってから lock 更新で上げる）
status: accepted
date: 2026-10-30
topic: build
scope:
  packages: [docs-site, vscode, vscode-e2e]
  concerns: [security, dependencies]
related_to: [ADR-2115, ADR-2401, ADR-2628, ADR-3203]
assumptions:
  # 決定は patched な系列へ floor を置くことであって、そのときの patch 番号ではない（ADR-2628）。
  - "grep: pnpm-workspace.yaml :: qs: \\^6\\."
  - "grep: pnpm-workspace.yaml :: serialize-javascript: \\^7\\."
  - "grep: pnpm-workspace.yaml :: launch-editor: \\^2\\."
  - "grep: pnpm-workspace.yaml :: minimumReleaseAge: 1440"
---

# ADR-3399: Dependabot security alert 2026-10-30（qs と serialize-javascript の override floor を修正版へ上げ、launch-editor を override し、@azure/msal-node は @azure/identity 4.14.1 が公開から 1 日経ってから lock 更新で上げる）

- **日付**: 2026-10-30
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#3399](https://github.com/kompiro/karasu/issues/3399)
  - 修正 PR（qs / serialize-javascript / launch-editor）: [#3401](https://github.com/kompiro/karasu/pull/3401)（本 ADR を同梱）
  - 前回の security alert 対応: [ADR-3203](3203-dependabot-security-2026-10-14.md)
  - override のスコープ規則: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - override の置き場と `minimumReleaseAge`: [ADR-2401](2401-pnpm-11-migration.md)、assumptions の書き方: [ADR-2628](2628-adr-assumption-version-policy.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

2026-10-30 に `open` と `auto_dismissed` の alert を収集すると、6 件が `open` だった（`auto_dismissed` は 0 件）。すべて transitive で、
Dependabot の security update PR は 1 件も起票されていない。

| alert | package | severity | advisory | scope | 脆弱範囲 | patched | 解決版（main） | 利用元 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #103 | `qs` | medium | GHSA-6pq8-jhm2-2vcw / CVE-2026-110816 | runtime | `>= 6.7.0, <= 6.16.0` | 6.16.1 | 6.16.0 | `@vscode/vsce` → `typed-rest-client` |
| #102 | `@azure/msal-node` | high | GHSA-xcx6-jx8p-x3h5 / CVE-2026-109461 | runtime | `>= 5.0.0-beta.0, < 7.1.0` | 7.1.0 | 6.0.1 | `@vscode/vsce` / `astro`（`unstorage`）→ `@azure/identity@4.13.3`（`^6.0.0`） |
| #98 | `serialize-javascript` | low | GHSA-m5mm-p8h7-m29v / CVE-2026-115897 | runtime | `< 7.1.3` | 7.1.3 | 7.1.2 | vscode-e2e の `mocha` 11（`@vscode/test-cli`）/ 12（ExTester と直接の devDependency） |
| #96 | `launch-editor` | medium | GHSA-r825-w8mm-5pxw / CVE-2026-112944 | development | `<= 2.14.1` | 2.14.2 | 2.14.1 | `@changesets/cli`（`^2.14.1`） |
| #95 | `launch-editor` | high | GHSA-587h-7wmj-h5pm / CVE-2026-112942 | development | `<= 2.14.1` | 2.14.2 | 2.14.1 | 同上 |
| #94 | `launch-editor` | medium | GHSA-698v-4r3x-3vcv / CVE-2026-112943 | development | `<= 2.14.1` | 2.14.2 | 2.14.1 | 同上 |

宣言レンジとの突き合わせ（`grep -n '<pkg>' pnpm-workspace.yaml; grep -rn '"<pkg>"' package.json packages/*/package.json`）:

- `qs`: `overrides:` に `qs: ^6.16.0`。**floor 6.16.0 が脆弱範囲 `>= 6.7.0, <= 6.16.0` の内側にある**。直接依存の宣言は無い
- `serialize-javascript`: `overrides:` に `serialize-javascript: ^7.0.5`。**floor 7.0.5 が脆弱範囲 `< 7.1.3` の内側にある**。直接依存の宣言は無い
- `launch-editor` / `@azure/msal-node`: override も直接依存の宣言も無い

## 決定

**#103 と #98 は既存 override の floor を修正版へ上げ、#94〜#96 は `launch-editor: ^2.14.2` を override に足す。#102 は
`@azure/identity` を 4.14.1 へ上げる lock 更新で解決し、4.14.1 が `minimumReleaseAge` を満たす 2026-10-30T22:16Z 以降に別 PR で入れる。**

| alert | 方法 | 結果 |
| --- | --- | --- |
| #103 `qs` | 既存 override の floor 引き上げ `^6.16.0` → `^6.16.1` | 6.17.1 に解決 |
| #98 `serialize-javascript` | 既存 override の floor 引き上げ `^7.0.5` → `^7.1.3` | 7.1.4 に解決 |
| #94 / #95 / #96 `launch-editor` | 新しい override `launch-editor: ^2.14.2`（無印キー） | 2.14.2 に解決 |
| #102 `@azure/msal-node` | `@azure/identity` を宣言レンジ内で 4.14.1 へ（lock 更新、override は足さない） | 2 本目の PR で解決。#3399 はその PR で閉じる |

検証（1 本目の PR）:

- `grep -c` で `qs@6.16.0` / `serialize-javascript@7.1.2` / `launch-editor@2.14.1` がいずれも lock に 0 件
- lock の依存エッジ（peer suffix を落として `origin/main` と比較）で動いたのは、`typed-rest-client → qs`、`mocha 11 / 12 → serialize-javascript`、
  `@changesets/cli → launch-editor` と、それぞれの子のエッジだけ。副次的な移動は無い
- `pnpm build` / `pnpm test` が通る。qs を実際に通る経路として `vsce package` と `vsce show karasu-tools.karasu-vscode`（typed-rest-client で
  Marketplace に問い合わせる）を手元で実行し、どちらも成功した。`pnpm changeset status` も通る（launch-editor の利用元）
- serialize-javascript の利用元は vscode-e2e の mocha 2 系統で、mocha 11 は `@vscode/test-cli`（`pnpm --filter @karasu-tools/vscode-e2e test`）、
  mocha 12 は ExTester（`test:webview`）が使う。どちらも devcontainer（arm64）では走らないので、`vscode-e2e.yml` の 2 つの job で確認する

## 理由

### #103 qs / #98 serialize-javascript: floor を上げる

どちらも以前の security alert 対応で入れた floor が当時の patched 版で、その後の advisory で脆弱範囲の内側に入った。js-yaml / dompurify /
brace-expansion / sharp（ADR-3203）に続く、`.claude/rules/dependabot.md` が警告する形と同じである。新しいキーを足さず既存キーの floor を上げる。

- qs は caret の範囲で 6.17.1 に解決する（minor をまたぐ）。6.17.0 / 6.17.1 の変更は `stringify` の `WHATWG` format の追加と `parse` / `stringify`
  の修正だけで、公開 API の削除は無い。publisher は 6.16.0 と同じ `ljharb`（前後とも provenance なし）、install script なし、2026-10-28 公開で
  `minimumReleaseAge`（1 日）を満たす。利用元は vsce の typed-rest-client だけで、ビルド出力にも利用者に届く成果物にも出ない
- serialize-javascript は 7.1.4 に解決する。7.1.3 は advisory の修正に加えて `ignoreFunction` の挙動を変え、7.1.4 は nested function を含む
  method の serialize を直した。publisher は前後とも GitHub Actions + SLSA provenance、install script なし。利用元は mocha（テストランナー）だけ
- `mocha@11.8.0` は `serialize-javascript: ^6.0.2` を宣言しており、無印キーの override は 7 系をメジャー越えで押し込む。これは main の
  `^7.0.5` の時点で既にそうなっていて、本 PR で増えたものではない。advisory の脆弱範囲 `< 7.1.3` は 6.x をすべて含み、6 系に修正版は無いので、
  mocha 11 の下でもメジャーをまたぐ以外に脆弱版を外す手段が無い。mocha 11 を使う `vscode-test` の job が 7 系で通っていることが、この組み合わせの
  検証になる。#102 で msal-node のメジャー越えを却下したのとは条件が違う（そちらは宣言レンジ内の修正版が 1 日で使えるようになる）

### #94〜#96 launch-editor: 無印キーで override する

依存ツリーにある launch-editor は 2.x の 1 系統だけで、`@changesets/cli` の宣言 `^2.14.1` の範囲内に修正版がある。メジャーをまたぐ
巻き込みが起きないので、キーをスコープする必要は無い（ADR-2115 のスコープ規則）。2.14.2 の差分は Windows のコマンド組み立てと
エディタ引数の扱いの修正で、publisher は前後とも GitHub Actions + SLSA provenance、install script なし。lock の更新（`pnpm update`）でも
2.14.2 に寄るが、他の security floor と同じく override に置き、lock を作り直したときに脆弱版へ戻らないようにする。

### #102 @azure/msal-node: 親を宣言レンジ内で上げ、公開から 1 日待つ

msal-node `^7.1.0` を要求する最初の `@azure/identity` は 4.14.1 で、4.13.3 と 4.14.0 は `^6.0.0` を宣言している。4.14.1 は利用元すべての
宣言レンジ内にある（`@vscode/vsce@4.0.0` は `^4.13.2`、`unstorage` は `^4.6.0`）ので、identity を上げれば msal-node は宣言に沿って 7 系へ
移る。

ただし 4.14.1 の公開は 2026-10-29T22:16Z で、2026-10-30 の作業時点では `minimumReleaseAge: 1440` が lock への取り込みを拒否する。
この設定は ADR-2401 が supply-chain 対策として入れたもので、公開直後に差し替えられる版を避けるのが目的である。1 個の alert のために除外を
足す理由は無い。待つあいだの露出は低い:

- advisory が指すのは authorization code flow で、パラメータが攻撃者の endpoint に漏れうるという内容である
- 当方で msal-node に届くのは `vsce publish --azure-credential`（VS Code 拡張のリリース workflow）と、docs site のビルドで astro が読み込む
  `unstorage` の optional peer だけ。vsce が使うのは Azure CLI の credential で、authorization code flow を通らない
- 次の VS Code 拡張のリリースまでに 2 本目の PR を入れれば、該当の workflow がこの版で走ることも無い

## 却下した案

### `@azure/msal-node: ^7.1.0` を今 override する

alert はその日のうちに閉じるが、`^6.0.0` を宣言している identity 4.13.3 の下に msal-node 7 を押し込むことになる。メジャーをまたぐ組み合わせで
upstream が出していないもので、しかも使われるのは Marketplace への publish というリリース時にしか走らない経路である。壊れていても
リリースのときまで気づけない。待つのは 1 日で済む。

### 4 パッケージを 1 本の PR にまとめて、4.14.1 が使えるまで待つ

PR は 1 本で済むが、修正版が既に使える qs / serialize-javascript / launch-editor（high 1 件を含む）まで 1 日遅らせる理由が無い。

### `minimumReleaseAge` の除外に `@azure/identity@4.14.1` を足す

1 日の待ちを省くために supply-chain の検査を外すことになる。この設定は公開直後に取り下げられる版を lock に入れないためのもので、
今回のように待てば済む場面で外すと、例外が理由なく増えていく。

### serialize-javascript を 7.1.3 に exact で固定する

`minimumReleaseAge` を満たす最新の 7.1.4 を避ける理由が無い。floor だけを置き、caret の範囲で解決させる（他の override と同じ形）。
