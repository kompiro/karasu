---
id: ADR-2782
title: VS Code の floor を 1.137 に上げ、ExTester の vscode-max を上限として機械チェックする
status: accepted
date: 2026-09-28
topic: vscode
scope:
  packages: [vscode, vscode-e2e]
  concerns: [dependencies, ci]
depends_on: [ADR-2562]
related_to: [ADR-2773, ADR-2877, ADR-784, ADR-2628]
assumptions:
  - "file: scripts/ci/vscode-version-policy.test.ts"
  - "grep: scripts/ci/vscode-version-policy.test.ts :: vscode-max"
  - "grep: packages/vscode-e2e/extester-bootstrap.mjs :: downloadCode\\(\"max\"\\)"
  - "grep: packages/vscode/package.json :: \"vscode\": \"\\^1\\."
---

# ADR-2782: VS Code の floor を 1.137 に上げ、ExTester の vscode-max を上限として機械チェックする

- **日付**: 2026-09-28
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2782](https://github.com/kompiro/karasu/issues/2782)
  - 実装 PR: [#2964](https://github.com/kompiro/karasu/pull/2964)
  - 追随規則（types == engines、stable に追随）: [ADR-2562](2562-dependabot-triage-2026-08-17.md)
  - 上限制約の発見と保留: [ADR-2773](2773-dependabot-triage-2026-09-08.md)
  - ExTester 8.27.0 の採用（供給側の確認）: [ADR-2877](2877-dependabot-triage-2026-09-22.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)

## 背景

[ADR-2562](2562-dependabot-triage-2026-08-17.md) は `engines.vscode` と `@types/vscode` を
同値に保ち、最新の `@types/vscode` に追随させると決めた。同値は
`scripts/ci/vscode-version-policy.test.ts` が検査している。

[ADR-2773](2773-dependabot-triage-2026-09-08.md) で、floor にはもう 1 本の制約があると
判明した。`packages/vscode-e2e/extester-bootstrap.mjs` は `extester.downloadCode("max")` を
呼ぶ。`max` は latest stable ではなく、インストール済みの `vscode-extension-tester` が
`supportedVersions` で宣言する最大版（`vscode-max`）である。floor がこれを超えると、
WebView E2E が `Unable to install extension ... not compatible with VS Code '<max>'` で落ちる。
当時は ExTester の候補がどれも cooldown か advisory のポリシーを破るため、floor 1.134 への
引き上げを保留し、#2782 に送った。あわせて「上限側は機械で見られていない」を積み残しに
挙げていた。

#2782 に着手した 2026-09-28 時点で状況は変わっていた。

- ExTester は #2872（[ADR-2877](2877-dependabot-triage-2026-09-22.md)）で 8.27.0 に上がって
  おり、`supportedVersions` は `vscode-min 1.135.0` / `vscode-max 1.137.0`。#2782 の手順
  「ExTester を 8.26.0 に上げる」は不要になった
- `@types/vscode` は 1.136.0 / 1.137.0 / 1.138.0 が公開済みで、1.138.0 は `vscode-max` を超える
- #2782 が書き換え対象にしていた changeset `vscode-engines-follow-types.md`（1.125 への引き上げ）は
  karasu-vscode 0.2.0 ですでにリリース済みだった

## 決定

**floor（`engines.vscode` と `@types/vscode`）を `^1.137.0` に上げる。あわせて「floor は
インストール済み ExTester の `vscode-max` を超えない」を `vscode-version-policy.test.ts` に
加え、同値と同じく unit run で検査する。**

floor の選び方は「ADR-2562 の追随規則に従って最新の `@types/vscode` を採る。ただし
ExTester の `vscode-max` と cooldown 7 日の両方を満たす範囲で」となる。

## 理由

- **1.137 は追随規則と両制約を同時に満たす最大値。** 1.137.0 は 2026-09-09 公開で
  cooldown を満たし、`vscode-max 1.137.0` とちょうど一致する。1.138.0 以降は上限を超える。
  #2782 自身も「1.134 か、それより新しい版のどちらでもよい」と書いていた
- **1.134 に留める理由がない。** ADR-2773 が 1.134 を挙げたのは、当時 Dependabot が
  提案していた版だったからで、1.134 という値そのものに意味はない。1.134 に留めると、
  型定義が 3 版古いまま、次の bump で同じ差し替え PR が要る
- **上限の検査を今入れる理由は、floor が上限に張り付いたこと。** floor 1.137 は
  `vscode-max` と同値なので、次に Dependabot が `@types/vscode` 1.138 以降を提案した時点で
  必ずこの制約に当たる。ガードが無いと、失敗は 90 秒の E2E ジョブで「拡張が非互換」として
  現れ、原因が manifest 側にあると読み取れない。ガードは manifest 名と直し方
  （floor を下げるか、`packages/vscode-e2e/package.json` の ExTester を上げる）を示して落ちる
- **上限はインストール済みパッケージから読み、定数を置かない。** ADR-2562 が同値チェックに
  版定数を置かなかったのと同じ理由である。`vscode-max` は ExTester の bump に従って動く
  従属変数で、定数にするとテスト自身が sweep 対象に加わる。読む先は
  `packages/vscode-e2e/node_modules/vscode-extension-tester/package.json` で、CI の Check
  ジョブは filter なしの `pnpm install --frozen-lockfile` を実行するので存在する
- **下限（`vscode-min`）は検査しない。** `downloadCode("max")` は常に `vscode-max` を取得し、
  floor がそれ以下であればインストールできる。floor が `vscode-min` を下回っても E2E は
  壊れない（現に 1.125 の floor で 8.27.0 の E2E は通っていた）

### lock は手で編集した

`@types/vscode` の宣言を `^1.137.0` にして `pnpm install` すると、caret により
1.138.0 が解決される。加えて無関係な `vite` のエントリも再解決された。lock は
`@types/vscode@1.137.0` の specifier / version / resolution の行だけを書き換え、
`pnpm install --frozen-lockfile` が受理することで整合を確かめた。

1.138.0 が解決されても vsce は宣言レンジしか見ないので packaging は通るが、
「拡張が公称する API 水準ちょうどで typecheck する」という ADR-2562 の趣旨から外れる。
また `pnpm exec` は manifest の変更を検知すると install を自動で走らせ、lock を
再解決する。manifest を一時的に書き換えて検証する場合は、その後に lock を確認する。

### changeset は新規に起こした

#2782 は未リリースの changeset を書き換える前提だったが、それは 0.2.0 で出荷済みだった。
リリースノート上で「1.125 に上げる」と「1.137 に上げる」は別の版に載るので矛盾しない。
`.changeset/vscode-floor-1-137.md`（karasu-vscode、minor）を追加した。

## 却下した案

### #2782 の記載どおり floor を 1.134 にする

上記「理由」のとおり、1.134 は当時の Dependabot の提案版にすぎず、追随規則からは 1.137 が導かれる。

### ガードを別 Issue に切り出し、本 PR を bump に絞る

#2782 は bump に絞る方針で書かれていた。しかし floor が `vscode-max` と一致したことで、
次の `@types/vscode` の提案で確実にこの制約に当たる。別 Issue に回すと、その提案が
ガードより先に来たときに ADR-2773 と同じ E2E の失敗から原因を辿り直すことになるので、
同じ PR に入れた。
