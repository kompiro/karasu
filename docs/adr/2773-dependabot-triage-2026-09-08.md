---
id: ADR-2773
title: Dependabot トリアージ 2026-09-08 — repo 側の宣言が bot の届かない所にある 2 件
status: accepted
date: 2026-09-08
topic: build
scope:
  packages: [app, docs-site, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2753, ADR-2562, ADR-2474, ADR-2401, ADR-2397, ADR-2333, ADR-2152, ADR-784, ADR-128, ADR-2687]
assumptions:
  - "file: scripts/ci/vscode-version-policy.test.ts"
  - "grep: package.json :: oxlint --deny-warnings"
  - "grep: .oxlintrc.json :: \"correctness\": \"error\""
  - "grep: packages/vscode-e2e/extester-bootstrap.mjs :: downloadCode"
  - "grep: pnpm-workspace.yaml :: overrides:"
---

# ADR-2773: Dependabot トリアージ 2026-09-08 — repo 側の宣言が bot の届かない所にある 2 件

- **日付**: 2026-09-08
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2773](https://github.com/kompiro/karasu/pull/2773)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2763](https://github.com/kompiro/karasu/pull/2763) / [#2764](https://github.com/kompiro/karasu/pull/2764) / [#2765](https://github.com/kompiro/karasu/pull/2765) / [#2766](https://github.com/kompiro/karasu/pull/2766) / [#2767](https://github.com/kompiro/karasu/pull/2767) / [#2768](https://github.com/kompiro/karasu/pull/2768) / [#2769](https://github.com/kompiro/karasu/pull/2769) / [#2770](https://github.com/kompiro/karasu/pull/2770)
  - 保留に伴う follow-up Issue: [#2782](https://github.com/kompiro/karasu/issues/2782)（ExTester 8.26.0 が cooldown を満たす 2026-09-14 以降に floor 1.134 へ）
  - 取りやめた差し替え PR: [#2779](https://github.com/kompiro/karasu/pull/2779)（floor だけ上げたが ExTester の対応窓に阻まれ close）
  - #2769 の差し替え PR: [#2784](https://github.com/kompiro/karasu/pull/2784)（bump + React 指摘 21 箇所の処置）
  - その起点 Issue: [#2775](https://github.com/kompiro/karasu/issues/2775)
  - 同型の前例（見落としていた）: [ADR-2333](2333-dependabot-triage-2026-08-04.md)（oxlint の新規則を規則ごとに分類して収める）
  - 直前の triage: [ADR-2753](2753-dependabot-triage-2026-09-07.md)
  - `@types/vscode` ↔ `engines.vscode` 同値ポリシーと前例の差し替え PR: [ADR-2562](2562-dependabot-triage-2026-08-17.md)
  - Node baseline: [ADR-2397](2397-node-24-baseline.md)
  - 判定語彙 / 差し替え PR: [ADR-2474](2474-dependabot-replacement-pr-vocabulary.md)
  - rebase は差し替えの理由にならない: [ADR-2152](2152-dependabot-triage-2026-07-27.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

[ADR-2753](2753-dependabot-triage-2026-09-07.md) のバッチをマージして枠が空いた直後に、
Dependabot が 8 件を起票した（`open-pull-requests-limit: 8` を再び飽和。**4 週連続**）。
すべて npm、`security` ラベルはゼロ、`dependabot/alerts` の open も 0 件で、
純粋な version update バッチである。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず 8 件すべてを upstream まで遡った。
**供給側（配布主体・改ざん）の懸念はゼロだった** — 新規 publisher なし、リポジトリ移管なし、
lifecycle script の新規追加なし、cooldown 7 日は全件充足、既知 advisory の該当なし。
**バッチ全体で lock に新規登場したパッケージ名は 1 件もない**（`@asamuzakjp/nwsapi` が
消える方向の増減が 1 件あるだけ）。

一方で **2 件が CI 落ちで、どちらも同じ形**だった。**Dependabot が書き換えられない宣言が
同じ repo の中にあり、bot の diff がその片側だけを動かす。** 前者は
[ADR-2562](2562-dependabot-triage-2026-08-17.md) が既に解を決めており、後者は今回が初出である。

## 決定

**7 件を採用し、1 件を保留した。却下はゼロ。**

**2 件は反映作業の中で判断が変わった。どちらも triage 時に見えていなかった制約が、
実装に着手して初めて出たためである。**

- [#2768](https://github.com/kompiro/karasu/pull/2768): 採用（差し替え PR）→ **保留**。
  差し替え PR [#2779](https://github.com/kompiro/karasu/pull/2779) まで出したが、
  `engines.vscode` が ExTester の対応窓に縛られることが判明した（下記「反映中に判明した制約」）。
- [#2769](https://github.com/kompiro/karasu/pull/2769): 保留 → **採用（差し替え PR）**。
  是正に必要な設定を oxlint 1.76 が受け付けず、bump と同梱するしかなかった（下記）。

| PR | 依存 | from → to | 種別 | 判断 | 反映 |
| --- | --- | --- | --- | --- | --- |
| [#2770](https://github.com/kompiro/karasu/pull/2770) | `@types/node` 26.3.0 → 26.4.0 | minor | 採用 | そのままマージ（最初に） |
| [#2767](https://github.com/kompiro/karasu/pull/2767) | `@radix-ui/react-tabs` 1.1.13 → 1.1.21 | patch ×8 | 採用 | そのままマージ |
| [#2764](https://github.com/kompiro/karasu/pull/2764) | `@testing-library/react` 16.3.2 → 16.3.3 | patch | 採用 | そのままマージ |
| [#2766](https://github.com/kompiro/karasu/pull/2766) | `jsdom` 29.0.2 → 30.0.1 | **major** | 採用 | rebase 1 回の後マージ |
| [#2765](https://github.com/kompiro/karasu/pull/2765) | `astro` 7.2.9 → 7.2.10 | patch | 採用 | rebase 2 回の後マージ |
| [#2763](https://github.com/kompiro/karasu/pull/2763) | `@vitejs/plugin-react` 6.1.0 → 6.1.1 | patch | 採用 | rebase 1 回の後マージ |
| [#2768](https://github.com/kompiro/karasu/pull/2768) | `@types/vscode` 1.125.0 → 1.134.0 | minor ×9 | **保留** | bot PR は close。[#2782](https://github.com/kompiro/karasu/issues/2782) に畳む |
| [#2769](https://github.com/kompiro/karasu/pull/2769) | `oxlint` 1.76.0 → 1.80.0 | minor ×4 | 保留 → **採用**（bot PR は close） | 差し替え PR [#2784](https://github.com/kompiro/karasu/pull/2784)。経緯は下記 |

却下がゼロなので `@dependabot ignore` はどこにも設定していない。

## 理由

### 供給側と advisory の確認結果

`published` は 8 件すべて 7 日以上前で、cooldown（[ADR-784](784-update-dependencies-20260421.md)）を
満たしている。メンテナ一覧の異常・新規 publisher・所有権移管はいずれにも無い。
install スクリプトの新規追加もゼロ（`jsdom` の `prepare` は 29.0.2 と同一で、
registry tarball の install では走らない）。

advisory は直接依存に加えて `jsdom` が連れてくる要注意パッケージも解決版で確認した。
**移行先を脆弱範囲に含むものは 1 件も無い** — `tough-cookie` は 6.0.2（脆弱範囲 `< 4.1.3`）、
`undici` は 7.29.0 据え置き（脆弱範囲 `>= 7.0.0, < 7.28.0`）、`astro` は 7.2.10（`< 6.1.10`）。

override との突き合わせは、**当初 `package.json` の `pnpm.overrides` を見て「空」と判断した
のが誤り**だった。pnpm 11 はそのフィールドを読まず、正本は `pnpm-workspace.yaml` の
`overrides:` である（[ADR-2401](2401-pnpm-11-migration.md)、`.claude/rules/dependabot.md`
「override はどこにあるか」）。そこには 23 件の floor が並んでおり、うち 5 件が今回のバッチに
関わる。改めて突き合わせた結果は下記のとおりで、**すべて floor を満たしており
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` は発生しなかった**（CI の
`pnpm install --frozen-lockfile` が全件 green だったことと整合する）。

| override | 解決版 | 判定 |
| --- | --- | --- |
| `undici: ^7.28.0` | 7.29.0（`jsdom` 経由） | 満たす |
| `sharp: ^0.35.0` | 0.35.4（`astro` 経由） | 満たす |
| `js-yaml@4: ^4.3.1` | 4.3.2（`astro` 経由） | 満たす |
| `vite@8: ^8.0.16` | 8.2.2 | 満たす |
| `postcss: ^8.5.18` | 8.5.26 | 満たす |

**同じ誤りが [ADR-2753](2753-dependabot-triage-2026-09-07.md) にもある。** 当該 ADR の
「`pnpm-workspace.yaml` の `overrides:` は空」という記述は事実に反する。あちらのバッチで
直接 bump した `svgo` は `svgo: ^4.0.2` として override に載っており、
**`.claude/rules/dependabot.md`「override 付き直接依存」の形に当たっていた**。
結果として解決版 4.1.0 は `^4.0.2` を満たすため mismatch は起きなかったが、
「起こり得ない」と書いた根拠は誤りで、正しくは「floor を満たしたので起きなかった」である。
ADR 本文は当時の記録として書き換えない（[ADR-2687](2687-adr-body-is-immutable.md)）ので、
訂正を本 ADR に置く。

再発防止として、override の突き合わせは `package.json` ではなく
`pnpm-workspace.yaml` を見ること。`scripts/ci/pnpm-config-location.test.ts` は
`package.json` に `pnpm` フィールドが復活していないことを検査するが、
**読み手が誤った側を見ることは検査しない。**

依存エッジは peer suffix を落として base とヘッドで突き合わせた。8 件すべてで
**新規パッケージ名の追加はゼロ**。名前の増減は `jsdom` 30 が `@asamuzakjp/nwsapi` を
落とす 1 件だけで、削除方向である。

### #2768: 半移動はガードが設計どおり捕まえた

`packages/vscode/package.json` の `engines.vscode` は Dependabot が触れない 3 つ目の宣言で、
`@types/vscode` だけが動くと 2 箇所で落ちる。

```
scripts/ci/vscode-version-policy.test.ts
  × keeps engines.vscode equal to the @types/vscode range
    AssertionError: expected '^1.125.0' to be '^1.134.0'

VS Code WebView (ExTester)
  Error: @types/vscode ^1.134.0 greater than engines.vscode ^1.125.0.
```

これは**予見済みの失敗**である。ガード自身のヘッダが以下を書いている。

> Two of the three sites are `devDependencies` entries, which Dependabot rewrites on
> its own; `engines.vscode` it cannot touch. So the natural failure mode is a
> half-move (...) This guard fails first, in the unit run, naming the file.

[ADR-2562](2562-dependabot-triage-2026-08-17.md) が「3 箇所を同時に動かす差し替え PR」を
正解と決めているので、判断はその適用にすぎない。判定は**採用**であり `@dependabot ignore` は
設定しない。

ただし **VS Code の要求バージョンが 1.125 → 1.134 に上がる（9 マイナー）点は
プロダクト判断**なので、依存更新の副作用としてではなく明示的に採った。

### 反映中に判明した制約 — floor は ExTester の対応窓にも縛られる

差し替え PR [#2779](https://github.com/kompiro/karasu/pull/2779) を出したところ、
WebView E2E が拡張のインストールで落ちた。

```
Unable to install extension 'karasu-tools.karasu-vscode' as it is not compatible with VS Code '1.131.0'.
```

`packages/vscode-e2e/extester-bootstrap.mjs` は `extester.downloadCode("max")` を呼んでおり、
`max` は latest stable ではなく **インストールされている `vscode-extension-tester` が
`supportedVersions` で宣言する最大の VS Code 版**に解決される。したがって:

> **`engines.vscode` は、pin されている `vscode-extension-tester` の `vscode-max` を超えられない。**

これは `scripts/ci/vscode-version-policy.test.ts` が見ている同値制約とは別の、
floor に対する 2 本目の制約である。[ADR-2562](2562-dependabot-triage-2026-08-17.md) の
「stable に追随させれば CI が floor 以上で検証する」という推論に穴があったわけではない。
その推論が対象にしているのは `.vscode-test.mjs`（extension host ジョブ。`version: "stable"` を
毎回取得し、同じコミットで 1.136.1 上を 11 passing で通った）であって、ExTester ジョブは
そもそもその設定を読んでいない。

### #2768 を保留に改めた理由 — 2 つのポリシーが衝突した

floor を上げるには ExTester を上げる必要があるが、どちらの版もリポジトリのポリシーの
片方を破る。

| `vscode-extension-tester` | 公開 | cooldown 7 日 | `vscode-max` | advisory |
| --- | --- | --- | --- | --- |
| 8.24.0（現在） | 2026-08-03 | ○ | 1.131.0（floor 1.134 に届かない） | クリーン |
| 8.25.0 | 2026-08-31 | ○ | 1.135.0 | **`extract-zip@2.0.1` を新規に連れてくる** |
| 8.26.0 | 2026-09-07 | **×（1 日）** | 1.136.1 | クリーン（`unzipper@0.12.5` に回帰） |

`extract-zip` は **CVE-2026-56876 / GHSA-jmr9-qjv8-65gv（high）が未修正**で、
`vulnerable_version_range` が `<= 2.0.1`、`first_patched_version` は `null`、
そして 2.0.1 が最新である。ExTester upstream 自身が 8.26.0 で `extract-zip` をやめて
`unzipper` に戻しており、同じ結論に至ったと読める。

8.25.0 を採れば未修正の high advisory を devDeps に取り込むことになり、8.26.0 を採れば
公開 1 日の版をマージすることになる。後者は
[ADR-784](784-update-dependencies-20260421.md) の cooldown が
まさに捕まえようとしているもの（改ざん検知前の取り込み）である。

**どちらも採らず、延期した。** 8.26.0 が 7 日を満たす **2026-09-14** 以降に、
ExTester 8.26.0 と floor 1.134 を 1 つの PR で入れる（[#2782](https://github.com/kompiro/karasu/issues/2782)）。
**代償は型定義が 6 日間 1 段古いままになることだけで、どちらのポリシーも破らない。**
[#2779](https://github.com/kompiro/karasu/pull/2779) は close したが、manifest と changeset の
編集はそのまま再利用できる。

changeset について。[#2563](https://github.com/kompiro/karasu/pull/2563) 由来の
`.changeset/vscode-engines-follow-types.md` は未リリースのまま「1.125 に上げる」と書いており
（`karasu-vscode` は 0.1.3）、floor を動かす PR ではこれを書き換える。新規 changeset を足すと
同じリリースノートに「1.125 に上げる」「1.134 に上げる」が並んで矛盾して読めるためである。

### #2769: 新しい規則が拾った信号は、消さずに別 PR で受ける

oxlint は 1.76 → 1.80 の間に React 規則を追加し、その一部を `correctness` に入れた。
`.oxlintrc.json` は `categories.correctness: "error"` / `suspicious: "warn"`、root の lint script は
`oxlint --deny-warnings packages/ scripts/` なので、**repo 側の設定を一切変えていないのに
新規規則が自動的に fatal になる**。

診断 24 件（error 16 + warning 8）は **21 の一意な箇所・17 ファイル**に散っており、
すべて `packages/app` 配下である（`ProjectModeApp.tsx:37` だけが 4 回報告されるため
診断数と箇所数が食い違う）。内訳は `react(refs)` 4 / `react(set-state-in-effect)` 6 /
`react(globals)` 2 / `react(immutability)` 1 / `react(exhaustive-effect-dependencies)` 6 /
`react(memo-dependencies)` 2。

指摘は typo 級ではなく、render 中の ref 参照と effect 内の同期 setState という
React の実行時挙動に関わるものである。そこで当初は **「bump は保留し、是正を別 PR で受ける」**
と決め、是正 Issue [#2775](https://github.com/kompiro/karasu/issues/2775) を起票した。

#### その順序は成立しなかった — 設定が bump より先に入らない

保留の前提として「是正 PR の CI は oxlint 1.76 で走るので検証にならず、検証は
bump PR 側で起きる」ことは書いていた。しかし実装に着手して分かったのは、
**そもそも是正 PR を単独で出せない**ということである。

21 箇所のうち 3 件は test harness（`RegistryProbe`）由来で、解は `.oxlintrc.json` の
test override である。ところが **oxlint 1.76 はその規則名を知らず、設定ごと拒否する**:

```
x Rule 'globals' not found in plugin 'react'
x Rule 'immutability' not found in plugin 'react'
```

設定は bump より先に入れられず、bump は是正より先に入れられない。**同梱は好みではなく強制**で、
判断は保留から **採用（差し替え PR [#2784](https://github.com/kompiro/karasu/pull/2784)）** に変わった。
bot PR は close し、`@dependabot ignore` は設定していない。

#### 前例を見落としていた

この結論には [ADR-2333](2333-dependabot-triage-2026-08-04.md) が 1.61 → 1.76 の bump で
既に到達していた（「修正が bump と同一コミットに載る必要がある」）。**本 ADR を書いた時点で
ADR-2333 を参照せず、既存の前例に反する判断を根拠なしに書いた。** 過去決定の確認は
`/hane:start-dev` のステップ 4.3 が拾ったが、それは triage が終わったあとだった。

**triage の判断は、実装着手時と同じ強度で過去 ADR を確認してから書く。** 依存更新は
ファイル編集を伴わないので `.claude/rules/` の `paths:` では発火せず、`.claude/rules/dependabot.md`
の入口宣言も「本ファイルを読む」までしか言っていない。今回の見落としはその隙間で起きた。

#### 処置は規則ごとに分けた

[#2784](https://github.com/kompiro/karasu/pull/2784) は ADR-2333 の方法に従い、21 箇所を
6 クラスに分けて処置を変えた。`react(refs)` は effect への移動と lazy state、
`set-state-in-effect` 6 件は render での導出・`useSyncExternalStore`・`key` による remount・
cancellation guard、依存配列は module scope への巻き上げと実参照化、
残る 3 件のトリガー依存は理由付きの inline disable。**off にしたのは test harness 由来の
3 件だけ**で、それが規則を殺していないことを ADR-2333 と同じ手法で逆検証した。

### #2766: major の breaking change は Node 下限 1 点だけだった

jsdom 30.0.0 の breaking change は Node.js の下限が
`^22.22.2 || ^24.15.0 || >=26.0.0` に上がったことのみで、他は CSS 周りの機能追加と修正である。

- CI と devcontainer は Node 24（`scripts/ci/node-version-policy.test.ts` が 21 の workflow で
  検査。[ADR-2397](2397-node-24-baseline.md)）。`"24"` は最新の 24.x に解決されるので
  `^24.15.0` を満たす。
- `jsdom` は `packages/app`（`"private": true`）の devDependency だけで公開パッケージに入らない。
  `packages/core` / `packages/cli` の `engines.node: ">=22.12"` は影響を受けない。
- `packages/app` の vitest 一式が jsdom 上で green。

## 却下した案

### #2769 の指摘是正を bump と同じ PR に同梱する（差し替え PR）

当初これを却下した。理由は「ツールチェーンの bump と 17 ファイルの React 実装変更が
同じ diff に混ざり、レビューで分離できなくなること」である。

**この却下は誤りだった。** 実装([#2784](https://github.com/kompiro/karasu/pull/2784))に
着手して分かったのは、**同梱は選択肢ではなく強制だ**ということである。21 箇所のうち 3 件は
test harness 由来で、解は `.oxlintrc.json` の test override だが、**oxlint 1.76 はその規則名を
知らず設定ごと拒否する**:

```
x Rule 'globals' not found in plugin 'react'
x Rule 'immutability' not found in plugin 'react'
```

設定は bump より先に入れられず、bump は是正より先に入れられない。1 コミットにしかならない。

同じ結論に [ADR-2333](2333-dependabot-triage-2026-08-04.md) が 1.61 → 1.76 の bump で
既に到達しており、そこでは「修正が bump と同一コミットに載る必要がある」ことを理由に
差し替え PR を選んでいる。**本 ADR を書いた時点で ADR-2333 を参照しておらず、
既存の前例に反する判断を根拠なしに書いた。** 着手前に過去決定を確認する手順
（`/hane:start-dev` ステップ 4.3）が拾ったのは、この triage が終わったあとだった。

### #2769 の新規規則を `.oxlintrc.json` で off にして bump だけ入れる

**全件を一律に off にする案として却下した。** 理由は、規則を切った状態は緑になるので
是正されたかを CI が言わなくなること。

ただし当初この節は「off は期限付きの負債に使うべきでない」と一般論で書いており、
これも [ADR-2333](2333-dependabot-triage-2026-08-04.md) を見落としていた。ADR-2333 は
`no-underscore-dangle` 85 件を **off にし、「規約の緩和であり判断である」と明示する**形で
収めている。**規則ごとに分類して、クラスごとに処置を変えるのが本 repo の確立した方法**であり、
off はその選択肢の 1 つである。

[#2784](https://github.com/kompiro/karasu/pull/2784) はその方法に従い、21 箇所を
6 クラスに分けて処置を変えた。off にしたのは test harness 由来の 3 件だけで、
**それが規則を殺していないことを ADR-2333 と同じ手法で逆検証した** — 外側の束縛を
書き換える probe を置き、非 test ファイルでは今も error になり test ファイルでのみ
沈黙することを確認した。

### #2768 を却下し `@types/vscode` を 1.125 に恒久的に据え置く

VS Code の下限を上げずに済む。**却下した理由は、ポリシーが「同値」であって
「古いまま維持」ではないこと。** 型定義が古いままだと 1.126 以降の API を型安全に使えない。
今回の保留は 2026-09-14 という期日を持つ延期であって、この案とは別物である。

### #2768 のために `vscode-extension-tester` 8.25.0 を入れる

cooldown 7 日は満たす（公開 8 日）。**却下した理由は、未修正の high advisory
（CVE-2026-56876、`extract-zip@2.0.1`、patched 版なし）を devDeps に取り込むこと。**
`vscode-e2e` は公開しない package で、展開対象も Microsoft / Google のエンドポイントから
取得するアーカイブなので実害は考えにくいが、**6 日待てば advisory を持たない 8.26.0 が
使える以上、取り込む理由がない。**

### #2768 のために `vscode-extension-tester` 8.26.0 を今すぐ入れる

advisory はクリーンで対応窓も足りる。**却下した理由は公開 1 日であること。**
cooldown 7 日（[ADR-784](784-update-dependencies-20260421.md)）は
改ざんが検知される前に取り込むことを避けるための規定で、手動 bump だからといって
免除される性質のものではない。Dependabot が同じ版を提案してきたら 7 日待つのに、
人手なら待たなくてよい理由はない。

## 積み残し

**floor に対する 2 本目の制約は機械で見られていない。** `engines.vscode` が
`@types/vscode` と同値であることは `scripts/ci/vscode-version-policy.test.ts` が検査するが、
それが ExTester の `supportedVersions` の窓に収まっているかは誰も見ていない。
違反すると 90 秒の E2E ジョブが「拡張が非互換」と言って落ちるだけで、原因が floor 側にあると
読み取れない。同値と同じく unit run で落ちてファイル名を名指しする形にできるが、
[#2782](https://github.com/kompiro/karasu/issues/2782) を bump に絞るため今回は入れていない。

**`--deny-warnings` と linter の自動 bump は相性が悪い。** upstream が `suspicious` や
`correctness` に規則を足すたび、こちらのコードが 1 行も変わっていなくても CI が赤くなる。
今回は保留で受けたが、同じことは oxlint の次の minor でも起きる。規則追加を段階的に
受け入れる形（新規規則を一度観測してから昇格させる）が要るかどうかは、再発回数を見て判断する。
