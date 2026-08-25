---
id: ADR-2562
title: Dependabot トリアージ 2026-08-17（@types/vscode と engines.vscode を同値に固定し VS Code stable に追随させる）
status: accepted
date: 2026-08-18
topic: build
scope:
  packages: [app, cli, core, i18n, lsp, nest, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2447, ADR-769, ADR-2397, ADR-199, ADR-784]
assumptions:
  - "file: scripts/ci/vscode-version-policy.test.ts"
  # 本 ADR が決めたのは engines.vscode と @types/vscode を同値に保ち stable に
  # 追随させることで、1.125.0 というリテラルの版ではない（ADR-2628）。同値である
  # ことは上の vscode-version-policy.test.ts が版定数を持たずに検証している。
  - "grep: packages/vscode/package.json :: \"vscode\": \"\\^1\\."
  - "grep: packages/vscode/package.json :: \"@types/vscode\": \"\\^1\\."
  - "grep: packages/vscode-e2e/.vscode-test.mjs :: version: \"stable\""
---

# ADR-2562: Dependabot トリアージ 2026-08-17（@types/vscode と engines.vscode を同値に固定し VS Code stable に追随させる）

- **日付**: 2026-08-18
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2562](https://github.com/kompiro/karasu/pull/2562)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2554](https://github.com/kompiro/karasu/pull/2554) / [#2555](https://github.com/kompiro/karasu/pull/2555) / [#2556](https://github.com/kompiro/karasu/pull/2556) / [#2557](https://github.com/kompiro/karasu/pull/2557) / [#2558](https://github.com/kompiro/karasu/pull/2558) / [#2559](https://github.com/kompiro/karasu/pull/2559) / [#2560](https://github.com/kompiro/karasu/pull/2560) / [#2561](https://github.com/kompiro/karasu/pull/2561)
  - 差し替え PR: [#2563](https://github.com/kompiro/karasu/pull/2563)（`engines.vscode` + `@types/vscode` を 1.125 へ、追随規則の機械チェック付き）
  - 直前の triage: [ADR-2447](2447-dependabot-triage-2026-08-10.md)
  - 回収した action item: [ADR-769](769-update-dependencies-20260420.md)
  - `@types/node` の先行を許す前例: [ADR-199](199-update-dependencies-20260331.md) / [ADR-2397](2397-node-24-baseline.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 関連 TPL: [TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md) / [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-08-17（月）の weekly バッチ。npm から 8 件が起票され、[ADR-2447](2447-dependabot-triage-2026-08-10.md)
で 8 に引き上げた `open-pull-requests-limit` の枠をちょうど埋めた。`security` ラベル付きは
ゼロで、純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。
**サプライチェーン上の懸念はゼロだった**。lifecycle script の新規追加なし、cooldown 7 日は
全件充足、既知 advisory の該当なし。lock に**新規パッケージ名が増えた PR は 1 件もなく**、
version の収束・付け替えだけだった。publisher の変化 2 件（radix / mocha）はどちらも
手動 publish から CI publish + provenance attestation への移行で、attestation が付く方向。

判断が要ったのは供給側ではなく、**CI red 3 件の理由が揃っていなかった**点である。同じ red でも
片方は再実行で消える flake、もう片方は rebase でも `@dependabot recreate` でも直らない
構造的失敗で、区別しないと flake を理由に採れる bump を止めるか、通らない PR を
rebase で押し込もうとすることになる。

## 決定

**8 件すべてを採用した。うち #2559 のみ差し替え PR ([#2563](https://github.com/kompiro/karasu/pull/2563))
で入れ、あわせて「`@types/vscode` と `engines.vscode` は常に同値とし、その版は CI が
検証している VS Code 版（stable）に追随させる」を規則として立て、機械チェックを置いた。**

| PR | 依存 | 判断 | 反映 |
| --- | --- | --- | --- |
| #2554 | `@radix-ui/react-dialog` 1.1.15 → 1.1.23 | 採用 | そのままマージ |
| #2555 | `@vscode/test-electron` 2.5.2 → 3.1.0（major） | 採用 | そのままマージ（**最初に**） |
| #2556 | `@types/node` 25.6.0 → 26.2.0（major） | 採用 | そのままマージ（#2555 の後） |
| #2557 | `marked` 18.0.2 → 18.0.9 | 採用 | そのままマージ |
| #2558 | `@vitejs/plugin-react` 6.0.1 → 6.0.5 | 採用 | そのままマージ |
| #2559 | `@types/vscode` 1.116.0 → 1.125.0 | 採用（bot PR は close） | [#2563](https://github.com/kompiro/karasu/pull/2563) |
| #2560 | `@radix-ui/react-tooltip` 1.2.8 → 1.2.16 | 採用 | そのままマージ |
| #2561 | `mocha` 11.7.5 → 11.8.0 | 採用 | そのままマージ |

却下はゼロなので `@dependabot ignore` は設定していない。

## 理由

### `@types/vscode` は engines と同値でしか動かせない。ならば規則にする

#2559 の CI 失敗だけは実因だった。「VS Code WebView (ExTester)」ジョブが
`packages/vscode-e2e/extester-bootstrap.mjs` 経由で `vsce.createVSIX()` を呼び、vsce が
`@types/vscode` の**宣言レンジ**を `engines.vscode` と突き合わせて拒否する:

```
Error: @types/vscode ^1.125.0 greater than engines.vscode ^1.111.0.
Either upgrade engines.vscode or use an older @types/vscode version
```

Dependabot は `devDependencies` しか書き換えず `engines` に触らない。bot ブランチに人手で
コミットを足しても `@dependabot recreate` で失われる。つまり **bot が作れる diff の形では
正しい変更にならない**ので、差し替え PR の適用条件（`.claude/rules/dependabot.md`）に
そのまま当たる。「単に rebase が要る」との違いはここで、構造的に CI を通せるか否かで分けた。

そして毎回の `@types/vscode` bump で同じ判断が要るのは無駄なので、規則に畳んだ。
**VS Code は週次リリースで自動更新される**ため最新 API 水準に追いつくコストが低く、
型を追随させれば拡張は「自分が公称する API 水準ちょうど」で typecheck される。
[ADR-769](769-update-dependencies-20260420.md) が 1.110 → 1.116 のときに
「`engines.vscode` の pin が意図した出荷対象と合っているか確認する」という action item を
残していたが未回収で、今回それが hard failure として顕在化した。規則化でこの item を閉じる。

### 「CI ≥ floor」は数字を比べずに成立している。それを壊さないことだけ守ればよい

`packages/vscode-e2e/.vscode-test.mjs` は既に `version: "stable"` を意図的に選んでいる
（「Track upstream stable so each weekly VS Code release is exercised by this suite」）。
最新の VS Code は公開済みのどの `@types/vscode` よりも必ず新しいので、これがある限り
「CI は floor 以上の host で検証している」は誰も数字を比べずに成り立つ。

`scripts/ci/vscode-version-policy.test.ts` はこれを 4 点で守る:

1. `@types/vscode` を宣言する全 workspace manifest が同じレンジであること。宣言箇所は
   手書きの一覧ではなく manifest の走査で見つける（[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)）
2. `engines.vscode` がそのレンジと**同値**であること。vsce は片方向しか拒否しないので、
   floor が types より低い側（公称した host の API 面を typecheck していない状態）も検出する
3. `.vscode-test.mjs` が `stable` を追い続けていること。ここに版を pin すると上の性質が
   無料で成立しなくなるので、その時点で落として比較を明示させる
4. 宣言が実際に見つかったことの sanity 検査

**バージョン定数はテストに置かない。** 置くと sweep 対象が 4 箇所目に増え、まさにこのテストが
取り締まる bump のたびにテスト自身がずれる。[ADR-2397](2397-node-24-baseline.md) の
`node-version-policy.test.ts` が `NODE_MAJOR` を定数で持つのとは逆の形で、これは意図的である。
Node の baseline は自分の意思で上げる toolchain の選択だが、VS Code の floor は upstream の
release に追随する従属変数だからである。

利用者への影響として、VS Code 1.111〜1.124 の環境は Marketplace から新版を取得できなくなる。
週次自動更新の製品なので実害は小さいと判断した。`karasu-vscode` の changeset は minor。

### red の内訳を分けたことで、再実行ではなくマージ順で解けた

#2556 / #2558 の「VS Code extension host」失敗は、VS Code 1.133.0 のバイナリ（331.71 MB）
ダウンロード中の `Error: aborted` だった。再実行で #2558 は green になったが
**#2556 は同じ箇所で 2 回とも落ちた**。

原因は `@vscode/test-electron` 2.5.2 の既知バグで、
[microsoft/vscode-test#340](https://github.com/microsoft/vscode-test/pull/340)（3.0.0 に収録）が
報告する症状と失敗ログが一致する。`unzipVSCode`（`lib/download.ts`）が checksum 検証の
promise を先に作りながら成功パスでしか `await` していないため、stream が中断すると
`streamToBuffer` の reject は retry ループが拾う一方、同じ stream に listener を張っている
`validateStream` の reject が誰にも観測されず unhandled rejection でプロセスごと落ちる。
**「attempt 1 of 3」を印字した直後に死ぬ**のはこのためで、retry は構造的に効かない。

`@vscode/test-cli` は `mustResolve(this.config.dir, '@vscode/test-electron')` で
**workspace の宣言から** test-electron を解決する（`out/cli/platform/desktop.mjs`）ので、
#2555 を先にマージすれば extension host ジョブに直接効く。再実行を繰り返すのではなく
マージ順で解いた。

これは `@vscode/test-electron` の major bump を「低リスクだから採用」ではなく
「このバッチを止めている flake の修正だから最初に採用」に変える発見だった。
3.0.0 の破壊的変更は `engines.node` が `>=16` → `>=22` になったことだけで
（[upstream #345](https://github.com/microsoft/vscode-test/pull/345) が明言）、CI は Node 24、
各 package の `engines.node` は `>=22.12` なので充足する。

なお upstream は 3.x のタグを打たず `CHANGELOG.md` も 2.5.2 で止まっているため
Dependabot PR 本文の changelog は空だったが、npm の 3.0.0 / 3.1.0 は default branch の
実コミットに対応し publisher も 2.5.2 と同じ `microsoft1es` で、配布主体の変化はない。

### 新規パッケージの判定は lock の依存エッジで行った

「lock に増えたパッケージ名はゼロ」は、解決バージョンの集合比較ではなく
`snapshots:` の `parent -> dep = resolved` を base / head で突き合わせて確かめた。
集合比較では **#2561 のように既にグラフにある版への付け替え**が検出できない。
`mocha@11.8.0` は `@vscode/test-cli@0.0.15`（`mocha: ^11.7.6`）経由で base lock に既にあり、
この PR が実際に行うのは `vscode-extension-tester` のエッジを 11.7.5 → 11.8.0 に
付け替えて二重化を解消することだった。

この形の改善は #2554（`react-focus-guards` / `react-focus-scope`）、
#2560（`@floating-ui/*` と radix の popper 系）、#2558（`@rolldown/pluginutils`）にもあり、
いずれも [TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md) の
「判定はバージョンが揃っているかではなく解決されるファイルが 1 つかで行う」に沿う方向である。

### `@types/node` の 2 major 先行は前例の範囲内

#2556 は root + 8 packages の 9 manifest を一括で bump する。型定義のみで runtime 成果物には
入らず、依存ツリーの変化は `@types/node` 内部の `undici-types` `~7.19.0` → `~8.3.0` だけ。

[ADR-199](199-update-dependencies-20260331.md) は Node 22 稼働時に `@types/node` を
22 → 25（3 major 先行）へ上げることを typecheck green を根拠に採用している。今回は Node 24 に
対して 2 major 先行で、当時より狭い。Check ジョブ（lint / knip / typecheck / test:coverage /
build を全パッケージ）は green で、[#2446](https://github.com/kompiro/karasu/issues/2446) の
修正により `packages/lsp` と `packages/vscode` も typecheck 対象に入っている。

### marked の patch 列は実質的な hardening

#2557 の 7 patch のうち 3 本が計算量の修正（18.0.6 の inline link href の O(n²) backtracking、
18.0.7 の HTML block close / tilde interrupt と inline tokenizer の masked source 再構築）。
CVE は割り当てられていないが、`packages/app`（`ChatPane.tsx` / `NodeDetailPanel.tsx`）と
`packages/vscode`（`preview-panel.ts`）が user 由来の markdown を描画するので実質的な
hardening にあたる。18.0.0–18.0.1 対象の
[GHSA-6v9c-7cg6-27q7](https://github.com/advisories/GHSA-6v9c-7cg6-27q7) は patched 版が
18.0.2 なので現行版で既に解消済みだった。

## 却下した案

### #2559 を保留し、`@types/vscode` を `^1.111.0` に据え置く

`engines.vscode` を動かさずに済むが、Dependabot は毎週同じ PR を出し続け、そのたびに
同じ red と同じ判断を繰り返すことになる（止めるには `@dependabot ignore this dependency` が
必要で、それは採用ではなく却下の手段である）。拡張が公称する API 水準と typecheck している
水準がずれたままになるのも、そのずれこそ [ADR-769](769-update-dependencies-20260420.md) の
action item が指していたものなので選ばなかった。

### 機械チェックにバージョン定数（`VSCODE_VERSION = "^1.125.0"`）を置く

`node-version-policy.test.ts` と形を揃えられるが、`@types/vscode` の bump ごとに
テスト自身の編集が要る 4 箇所目の sweep 対象になる。定数を持つ意味があるのは
「自分の意思で決めた baseline から外れていないか」を守る場合で、upstream の release に
追随する従属変数にはそぐわない。同値であることだけを検査する形にした。

### #2556 を再実行し続けて green を待つ

2 回とも同じ箇所で落ちており、原因が `@vscode/test-electron` 2.5.2 の
retry を無効化するバグだと分かった時点で、再実行は期待値の低い賭けになった。
#2555 を先に入れて原因を取り除く順序にした。

## バッチ外に残した課題

open な Dependabot alert が 1 件ある。`nanoid < 3.3.18`
（[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)、high、2026-08-13 検知）。
lock には `postcss@8.5.25 -> nanoid 3.3.17`（脆弱）と `postcss@8.5.26 -> nanoid 3.3.18`（patched）が
併存し、`pnpm-workspace.yaml` の `overrides:` に `nanoid` は無い。transitive のため
Dependabot は version update PR を起票しておらず、本バッチのどの PR でも解消しない。
`/hane:security-alert` の対象として別に処理する。
