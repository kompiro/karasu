---
id: ADR-3586
title: Dependabot security alert 2026-11-03（@azure/msal-node は ADR-3399 のとおり @azure/identity 4.14.1 への lock 更新で直し、glob と minimatch は修正版が新 major だけなので alert を open のまま保留する）
status: accepted
date: 2026-11-03
topic: build
scope:
  packages: [docs-site, lsp, vscode, vscode-e2e]
  concerns: [security, dependencies]
related_to: [ADR-3399, ADR-3575, ADR-2337, ADR-2401]
---

# ADR-3586: Dependabot security alert 2026-11-03（@azure/msal-node は ADR-3399 のとおり @azure/identity 4.14.1 への lock 更新で直し、glob と minimatch は修正版が新 major だけなので alert を open のまま保留する）

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#3586](https://github.com/kompiro/karasu/issues/3586)
  - 修正 PR: [#3587](https://github.com/kompiro/karasu/pull/3587)（本 ADR を同梱）
  - #102 の方針を決めた回: [ADR-3399](./3399-dependabot-security-2026-10-30.md)（2 本目の PR が出ないまま #3399 が close されていた）
  - 同じ日の Dependabot トリアージ: [ADR-3575](./3575-dependabot-triage-2026-11-02.md)（LSP 11 も `minimatch ^10.2.6` のままと記録）
  - LSP の client / server を対で上げる不変条件: [ADR-2337](./2337-lsp-pair-upgrade-protocol-parity.md)
  - override の置き場と `minimumReleaseAge`: [ADR-2401](./2401-pnpm-11-migration.md)

## 背景

`state == open || auto_dismissed` で集めた alert は 3 件だった。

| Alert | パッケージ         | severity | advisory            | 関係 / scope         | 脆弱範囲                   | 修正版 | main の解決版   |
| ----- | ------------------ | -------- | ------------------- | -------------------- | -------------------------- | ------ | --------------- |
| #102  | `@azure/msal-node` | high     | GHSA-xcx6-jx8p-x3h5 | transitive / runtime | `>= 5.0.0-beta.0, < 7.1.0` | 7.1.0  | 6.0.1           |
| #104  | `glob`             | medium   | GHSA-3g3m-2fjr-6pw4 | transitive / runtime | `>= 9.0.0, <= 14.0.1`      | 14.0.2 | 10.5.0 / 13.0.6 |
| #105  | `minimatch`        | medium   | GHSA-g3hv-75wg-m249 | transitive / runtime | `< 11.0.1`                 | 11.0.1 | 9.0.9 / 10.2.6  |

3 件とも `pnpm-workspace.yaml` の `overrides:` にも、どの `packages/*/package.json` の宣言にも現れない
（`grep -rn` で確認）。自分の pin が脆弱範囲の内側に残っている形は無い。

#102 は ADR-3399 で「`@azure/identity` 4.14.1 が `minimumReleaseAge` を満たしてから lock 更新で上げる。2 本目の PR が
#3399 を閉じる」と決めていた。ところが 2 本目の PR は出ないまま #3399 が close され、alert だけが open で残っていた。
#104 と #105 は 2026-10-31 に起票された新しい alert である。

## 決定

**#102 は ADR-3399 の方針どおり、`@azure/identity` を 4.13.3 → 4.14.1 へ上げる lock 更新だけで直す。** override も
宣言の変更も足さない。**#104 と #105 は lock を動かさず、alert を open のまま保留する。** dismiss もしない。

| Alert                   | 対応                                                           | 結果                                                     |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| #102 `@azure/msal-node` | `pnpm update -r --depth Infinity @azure/identity`（lock のみ） | msal-node 6.0.1 → 7.1.2                                  |
| #104 `glob`             | 保留（open のまま）                                            | 利用元が glob 14 に移れば lock の更新で自然に閉じる      |
| #105 `minimatch`        | 保留（open のまま）                                            | 利用元が minimatch 11 に移れば lock の更新で自然に閉じる |

## 理由

### #102: identity が宣言レンジ内で msal-node を 7 系へ運ぶ

`@azure/identity@4.14.1` は `@azure/msal-node` を `^7.1.0` で宣言する（4.13.3 は `^6.0.0`）。利用元の宣言
（`@vscode/vsce@4.0.0` の `^4.13.2`、`unstorage` の optional peer `^4.6.0`）のレンジ内にあるので、upstream が支える経路で
msal-node が major を越える。ADR-3399 が msal-node だけの override を却下した理由（identity 4.13.3 を宣言外の major に
押し上げ、壊れてもリリースまで気づけない）は今も同じ。

lock の依存エッジの差分（peer suffix を落として main と比較）で動いたのは、`@azure/identity` 4.13.3 → 4.14.1、
`@azure/msal-node` 6.0.1 → 7.1.2、`@azure/msal-common` 16.14.1 → 16.15.0 と、identity 4.14.1 が自分で上げた
`open` 10.2.0 → 11.0.4 とその依存（`wsl-utils` 0.1.0 → 1.0.1、`default-browser` 5.5.0 → 5.5.1、新規の `is-in-ssh` 1.0.0）だけ。
`@vscode/vsce` と `unstorage` の指す identity が 4.14.1 に替わる。

供給側の確認:

- publisher は from と to で同じ（identity は `microsoft1es`、msal は `azuread`、`open` 系は `sindresorhus`）。
  どれも provenance なしで従来どおり。lifecycle script はゼロ
- グラフに新しく入る名前は `is-in-ssh` だけ。2025-11-12 公開の `sindresorhus` のパッケージで、中身は `SSH_*` 環境変数を
  読む 3 行
- tarball 差分の追加行を `child_process` / `eval(` / `process.env` / `fetch(` / `execFile` / 外部 URL などで grep した。
  ヒットは Azure の設定用環境変数（`AZURE_AUTHORITY_HOST` など）、Microsoft のログイン endpoint と managed identity の
  metadata endpoint（`169.254.169.254`）、`open` / `wsl-utils` のブラウザ起動と WSL のパス変換で、どれも各パッケージの役割どおり
- 新しく解決される 7 版すべてで advisory はゼロ
- 公開からの経過: `@azure/identity@4.14.1` は 10-29 22:16 公開で、PR 時点で約 5 日。Dependabot の cooldown（7 日、
  version update が対象）には届かないが、`minimumReleaseAge`（1 日）は満たす。security fix なので ADR-3399 が決めたとおり
  1 日を待つ側に揃えた。msal-node 7.1.2 は 10-27 公開

当方で msal-node のコードが走るのは `vsce publish --azure-credential`（VS Code 拡張のリリース workflow）だけで、
docs site の `unstorage` は Azure ドライバを使わない（ADR-3399）。

### #104 / #105: 修正版が新 major にしか無く、強制すると出荷物が壊れる

修正版は minimatch 11.0.1 と glob 14.0.2 だけで、旧 major への backport は無い（minimatch 10.x の最終は 10.2.6、
glob 13.x の最終は 13.0.6）。利用元 9 件（`@typescript-eslint/typescript-estree`、`@vscode/test-cli`、`@vscode/vsce`、
mocha 11 / 12、`test-exclude`、`vscode-languageclient`、`vscode-extension-tester`、glob 自身）は、最新版でもまだ
`minimatch ^10` / `glob ^13` を宣言している。

minimatch 11 と glob 14 は API を削る major である。

- minimatch 11 は `makeRe()`・`Minimatch#regexp`・`AST`・`matchOne()` などを削除した。**VS Code 拡張に同梱される
  `vscode-languageclient@11.0.0` は `lib/common/fileOperations.js` で `Minimatch#makeRe()` を呼ぶ**
- glob 14 は `walk()` の戻り値を配列に変え、`MatchRecord#entries()` を削除し、`path-scurry` 3 を要求する

override で minimatch@9/@10 と glob@10/@13 を新 major に押し上げると、出荷物の languageclient が実行時に壊れうる。
dev 用の利用元も、新 major で動くことを upstream が保証していない組み合わせになる。

一方で、悪用の条件は当方では満たされない。

- #105 は攻撃者が glob パターンを渡せることが条件。当方のパターンはすべて repo の設定（vitest の coverage、mocha の spec、
  `.vscodeignore`、typescript-eslint の `allowDefaultProject`）か、karasu 自身の LSP server から来る。karasu の server は
  `workspace.fileOperations` を登録しないので、languageclient の minimatch の経路はそもそも走らない
  （`packages/lsp/src` と `packages/vscode/src` を grep）
- #104 は `signal` / `AbortSignal.timeout()` で walk の時間を区切る呼び出しが条件。利用元のどれも glob に `signal` を渡さない
- `vscode-languageclient` 以外の利用元はすべて開発時だけ使う

alert を open のまま残すのは、利用元が新 major に移って lock の解決版が修正版になれば、alert が自動で `fixed` になるからである。
open のあいだは毎週の Dependabot トリアージで目に入る。

## 却下した案

### minimatch / glob を override で新 major に押し上げる

**却下**。上の「出荷物が壊れる」のとおり。CI では `fileOperations` の経路が走らないので、壊れても検出されない。

### #104 / #105 を `tolerable_risk` で dismiss する

**却下**。通知は止まるが、利用元が新 major に移っても alert は戻らず、修正版が lock に入ったかを誰も見なくなる。
dismiss は人間の明示的な判断として残るので、後の収集（`open || auto_dismissed`）からも外れる。

### #102 を msal-node だけの override で直す

**却下**（ADR-3399 と同じ）。identity 4.13.3 の宣言 `^6.0.0` の外へ msal-node を押し上げる。identity 4.14.1 が宣言レンジ内で
同じ修正を運ぶので、override を足す理由が無い。

## 影響

- 公開物への影響なし。`@azure/identity` は `@vscode/vsce` 経由の開発時依存と docs site の optional peer で、
  VS Code 拡張にも CLI にも同梱されない。changeset は付けない
- 次の VS Code 拡張のリリース（`vsce publish --azure-credential`）は msal-node 7.1.2 で走る。`vsce package` は手元で通った
- #104 / #105 は、毎週の Dependabot トリアージで利用元の宣言（`minimatch` / `glob` の range）を確認する。
  `vscode-languageclient` が minimatch 11 に移るときは ADR-2337 の LSP group として届く
