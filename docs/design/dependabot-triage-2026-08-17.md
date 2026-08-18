# Dependabot トリアージ 2026-08-17

- **日付**: 2026-08-17
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2554](https://github.com/kompiro/karasu/pull/2554) / [#2555](https://github.com/kompiro/karasu/pull/2555) / [#2556](https://github.com/kompiro/karasu/pull/2556) / [#2557](https://github.com/kompiro/karasu/pull/2557) / [#2558](https://github.com/kompiro/karasu/pull/2558) / [#2559](https://github.com/kompiro/karasu/pull/2559) / [#2560](https://github.com/kompiro/karasu/pull/2560) / [#2561](https://github.com/kompiro/karasu/pull/2561)
  - 直前の triage: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - `@types/node` の先行を許す前例: [ADR-199](../adr/199-update-dependencies-20260331.md) / [ADR-2397](../adr/2397-node-24-baseline.md)
  - `engines.vscode` の未回収 action item: [ADR-769](../adr/769-update-dependencies-20260420.md)
  - 差し替え PR: [#2563](https://github.com/kompiro/karasu/pull/2563)（`engines.vscode` と `@types/vscode` を 1.125 へ、追随規則の機械チェック付き）
  - 関連 TPL: [TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md)（片側 bump と module コピー二重化の観点） / [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（sweep は検索で閉じる）
  - コード: `packages/vscode/package.json`, `packages/vscode-e2e/extester-bootstrap.mjs`, `packages/vscode-e2e/.vscode-test.mjs`, `pnpm-workspace.yaml`

## 背景・課題

2026-08-17（月）の weekly バッチ。npm ecosystem から 8 件が起票され、
`open-pull-requests-limit: 8`（[ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)）の枠を
ちょうど埋めている。`security` ラベル付きの PR はゼロで、純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。
判定語彙は **採用 / 保留 / 却下**、反映手段は **そのままマージ / 差し替え PR** の別軸で扱う。

CI は 3 件が red だが、**内訳は「同一のネットワーク flake が 2 件」と「実因が 1 件」**で、
red の理由が揃っていない。ここを区別しないと、flake を理由に採用可能な bump を止めるか、
逆に構造的に通らない PR を rebase で押し込もうとすることになる。

## 現状（インベントリ）

| PR | 依存 | 種別 | scope | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#2554](https://github.com/kompiro/karasu/pull/2554) | `@radix-ui/react-dialog` 1.1.15 → 1.1.23 | patch 列 | dev (app) | green | low | 採用（そのままマージ） |
| [#2555](https://github.com/kompiro/karasu/pull/2555) | `@vscode/test-electron` 2.5.2 → 3.1.0 | **major** | dev (vscode-e2e) | green | low | 採用（そのままマージ） |
| [#2556](https://github.com/kompiro/karasu/pull/2556) | `@types/node` 25.6.0 → 26.2.0 | **major** | dev (9 manifest) | red（flake） | low | 採用（再実行して green を確認） |
| [#2557](https://github.com/kompiro/karasu/pull/2557) | `marked` 18.0.2 → 18.0.9 | patch 列 | runtime (app, vscode) | green | low | 採用（そのままマージ） |
| [#2558](https://github.com/kompiro/karasu/pull/2558) | `@vitejs/plugin-react` 6.0.1 → 6.0.5 | patch 列 | dev (app) | red（flake） | low | 採用（再実行して green を確認） |
| [#2559](https://github.com/kompiro/karasu/pull/2559) | `@types/vscode` 1.116.0 → 1.125.0 | minor | dev (vscode, vscode-e2e) | **red（実因）** | medium | 採用（差し替え PR [#2563](https://github.com/kompiro/karasu/pull/2563)） |
| [#2560](https://github.com/kompiro/karasu/pull/2560) | `@radix-ui/react-tooltip` 1.2.8 → 1.2.16 | patch 列 | dev (app) | green | low | 採用（そのままマージ） |
| [#2561](https://github.com/kompiro/karasu/pull/2561) | `mocha` 11.7.5 → 11.8.0 | minor | dev (vscode-e2e) | green | low | 採用（そのままマージ） |

### 全件に共通するサプライチェーン確認

| 観点 | 結果 |
| --- | --- |
| install / postinstall / prepare の新規追加 | **ゼロ**。`@vscode/test-electron` の `prepare=husky` は 2.5.2 にも存在し、tarball install では実行されない |
| lock に増えたパッケージ**名** | **全 8 件でゼロ**。version の収束・付け替えのみ |
| cooldown 7 日 | 全件充足。最も新しい `@types/node@26.2.0` が 2026-08-07 公開（10 日経過） |
| 既知 advisory | 対象 8 パッケージに未修正の該当なし |
| 配布主体の変化 | 2 件（radix / mocha）。いずれも手動 publish → CI publish + provenance attestation への移行 |

新規パッケージ名の判定は、解決バージョンの集合比較ではなく **lock の依存エッジ diff**
（`snapshots:` の `parent -> dep = resolved` を base / head で突き合わせる）で行った。
集合比較では #2561 のように「既にグラフにある版への付け替え」が検出できない。

配布主体の変化 2 件はどちらも改ざんの方向ではない:

- **radix**: `chancestrickland`（手動）→ `GitHub Actions`。CHANGELOG 1.1.21 が
  「以前の版は CI 外で手動 publish されたため provenance が無かった。同じコードを CI 経由で
  再 release して attestation を付ける」と明記している。実際に `dist.attestations` が
  1.1.15 の `false` から 1.1.23 の `true` に変わっている
- **mocha**: `voxpelli` → `GitHub Actions`。attestation は 11.7.5 の時点で既に付いており、
  publisher が個人アカウントから CI へ移っただけ

## 制約・前提

- 判定は 採用 / 保留 / 却下 の 3 値。差し替え PR は「採用」の一形態で、使うのは
  **bot が作れる diff の形では正しい変更にならないとき**に限る（`.claude/rules/dependabot.md`）。
  「単に rebase が要る」「flake で red」は差し替えの理由にならない
- security floor の正本は `pnpm-workspace.yaml` の `overrides:`。本バッチの 8 パッケージは
  いずれも `overrides:` に載っていないため、`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` の失敗モードは
  発生しない
- `engines.vscode` を動かすかどうかは拡張の最低 VS Code 版を決める製品判断であり、
  依存更新のリスク分析だけでは決められない（out of scope として本 doc では判断材料のみ出す）

## PR ごとのリスク分析

### #2554 `@radix-ui/react-dialog` 1.1.15 → 1.1.23（low / 採用）

8 本の patch を跨ぐ。実質的な変更は次の 4 点で、いずれも修正方向:

- 1.1.16: 閉じた dialog の pointer-events、iOS の text selection / input 編集、
  content 消失時に `aria-controls` が存在しない要素を指す問題
- 1.1.17: extension UI の overlay による外側クリックで dialog が閉じてしまう問題
- 1.1.20: title / description 未描画時の ARIA 参照切れ。あわせて tree-shaking 改善のため
  各 part を `/* @__PURE__ */` 化し、`Component.displayName = ...` を named render 関数に置換
- 1.1.23: 1.1.22 までに入った React Server Components 非互換の破壊的変更を revert

1.1.20 の `displayName` 廃止は、テストが `displayName` で要素を引いていると影響しうる唯一の点。
Check（vitest 全パッケージ）と Playwright がいずれも green なので実測では問題ない。

lock 側の効果は二重化の解消（`react-focus-guards` 1.1.3 + 1.1.6 → 1.1.6、
`react-focus-scope` 1.1.7 + 1.1.16 → 1.1.16）で、[TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md)
の観点では望ましい方向。

### #2555 `@vscode/test-electron` 2.5.2 → 3.1.0（low / 採用（major））

**3.0.0 の破壊的変更は `engines.node` が `>=16` → `>=22` になったことだけ。**
upstream の version bump PR（[microsoft/vscode-test#345](https://github.com/microsoft/vscode-test/pull/345)）本文が
「several bugfixes, dependency bumps, and the feature to add custom stdout/stderr streams.
The version bump is a major version bump due to the engine now requiring Node 22 at minimum.」と
明言している。CI は全ワークフローで Node 24、公開パッケージの `engines.node` は `>=22.12` なので充足する。

**Dependabot PR 本文の changelog が空である点は upstream 側の運用による**もので、
配布主体の異常ではない。microsoft/vscode-test は `v2.5.2` 以降タグを打っておらず、
`CHANGELOG.md` も 2.5.2（2024-04-09）で更新が止まっている。一方 npm の 3.0.0 / 3.1.0 は
default branch の実コミット（`3.0.0 (#345)` 2026-06-05、`Bump package version to 3.1.0` #351
2026-07-24）に対応し、publisher は 2.5.2 と同じ `microsoft1es`、repository も移管されていない。

2.5.2 → 3.1.0 の実コード差分は 33 commits で、内容は download の中断・checksum 拒否での
プロセスクラッシュ修正、Windows のスペース処理、macOS の `CFBundleExecutable` 解決、
Insiders の再ダウンロード修正など。依存ツリーの変化は `semver` 7.7.4 → 7.8.5 のみ。

**「VS Code extension host」ジョブが green** なので、3.1.0 で実際にテストが走ることは実測済み。

**さらに、3.0.0 は今回のバッチを止めている flake そのものの修正を含む。**
[microsoft/vscode-test#340](https://github.com/microsoft/vscode-test/pull/340)
（2026-05-29 merge、3.0.0 に収録）が報告している症状は #2556 / #2558 の失敗ログと一致する:

```
- Downloading (242.87 MB)
✖ Error downloading, retrying (attempt 1 of 3): aborted
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
```

原因は `unzipVSCode`（`lib/download.ts`）で checksum 検証の promise を先に作りながら
成功パスでしか `await` していないこと。stream が中断すると `streamToBuffer` の reject は
retry ループが拾うが、同じ stream に listener を張っている `validateStream` の reject が
誰にも観測されず unhandled rejection でプロセスごと落ちる。**「attempt 1 of 3」を印字した
直後に死ぬ**のはこのためで、retry は構造的に効かない。修正は `checksum.catch(() => {})` で
観測だけしておくもの。

`@vscode/test-cli` は `mustResolve(this.config.dir, '@vscode/test-electron')` で
**workspace の宣言から** test-electron を解決する（`out/cli/platform/desktop.mjs`）ので、
`packages/vscode-e2e` の devDependency を 3.1.0 に上げれば extension host ジョブに直接効く。

### #2556 `@types/node` 25.6.0 → 26.2.0（low / 採用（major、CI 再実行））

root + 8 packages の 9 manifest を一括で bump する。型定義のみで runtime 成果物には入らない。
依存ツリーの変化は `@types/node` 内部の `undici-types` `~7.19.0` → `~8.3.0` のみで、
lock に増えたパッケージ名はゼロ。

**型が runtime より先行する点は前例の範囲内。** [ADR-199](../adr/199-update-dependencies-20260331.md)
は Node 22 稼働時に `@types/node` を 22 → 25（3 major 先行）へ上げることを typecheck green を
根拠に採用している。今回は Node 24 に対して 2 major 先行なので、当時より狭い。
Check ジョブ（lint / knip / typecheck / test:coverage / build を全パッケージ）は green で、
[#2446](https://github.com/kompiro/karasu/issues/2446) の修正により `packages/lsp` と
`packages/vscode` も typecheck 対象に入っている。

**CI red の原因は依存差分と無関係。** 「VS Code extension host」ジョブが VS Code 1.133.0 の
バイナリ（331.71 MB）ダウンロード中に `Error: aborted` で落ちている。同じバッチの他 6 PR では
同一ジョブが green なので、ネットワーク flake と判断した。

再実行では #2558 は green になったが **#2556 は同じ箇所で 2 回目も落ちた**。これは
`@vscode/test-electron` 2.5.2 の既知バグで、retry が unhandled rejection に負ける構造
（#2555 の節を参照）。**#2555 を先にマージすれば直る**ので、順序で解く。

### #2557 `marked` 18.0.2 → 18.0.9（low / 採用）

7 本の patch。**うち 3 本が計算量の修正**で、`packages/app`（`ChatPane.tsx` /
`NodeDetailPanel.tsx`）と `packages/vscode`（`preview-panel.ts`）が user 由来の markdown を
描画する以上、実質的な hardening にあたる:

- 18.0.6: inline link href 正規表現の O(n²) backtracking
- 18.0.7: HTML block close / tilde interrupt 正規表現の O(n²)、inline tokenizer の
  masked source 再構築の O(n²)

CVE / GHSA は割り当てられていない。18.0.0–18.0.1 を対象とする
[GHSA-6v9c-7cg6-27q7](https://github.com/advisories/GHSA-6v9c-7cg6-27q7)（high、OOM DoS）は
patched 版が 18.0.2 なので、現行版で既に解消済み。

残りは parser の細かい挙動修正（setext heading、blockquote 継続、pedantic モードの emphasis、
extension が false を返したときの checkbox renderer フォールバックなど）。

lock の変化は `marked` 単体のみ。`monaco-editor@0.56.0` 由来の `marked@14.0.0` は据え置きだが、
該当 advisory はない（`GHSA-p9wx-2529-fp83` の脆弱範囲は `< 0.3.17`）。

### #2558 `@vitejs/plugin-react` 6.0.1 → 6.0.5（low / 採用（CI 再実行））

4 本の patch。6.0.2 は型のみ、6.0.4 は `NODE_ENV=production` で `vite dev` したときの
`$RefreshSig$ is not defined` 修正、6.0.5 は 6.0.3 で入った react compiler preset filter の
性能退行の修正。karasu は react compiler を有効にしていないので 6.0.3 の退行の影響は受けていない。

依存は `@rolldown/pluginutils` が `1.0.0-rc.7`（exact）→ `^1.0.1` に変わる。
**1.0.1 は base lock に既に存在していた版**なので、これも二重化の解消であって新規流入ではない。

CI red は #2556 と同一の VS Code バイナリ DL flake。

### #2559 `@types/vscode` 1.116.0 → 1.125.0（medium / 採用（差し替え PR））

**この PR の CI 失敗だけは実因で、rebase でも `@dependabot recreate` でも直らない。**

```
Error: @types/vscode ^1.125.0 greater than engines.vscode ^1.111.0.
Either upgrade engines.vscode or use an older @types/vscode version
```

機構は次の通り:

1. 「VS Code WebView (ExTester)」ジョブが `pnpm --filter @karasu-tools/vscode-e2e run test:webview` を走らせる
2. その中で `packages/vscode-e2e/extester-bootstrap.mjs` が `vsce.createVSIX()` を呼ぶ
3. vsce は `@types/vscode` の**宣言レンジ**と `engines.vscode` を突き合わせ、前者が後者より
   新しければ package 化を拒否する
4. bot は `packages/*/package.json` の `devDependencies` しか書き換えないので、
   `packages/vscode/package.json` の `engines.vscode: "^1.111.0"` は据え置かれる

bot ブランチに人手で `engines.vscode` のコミットを足しても `@dependabot recreate` で失われる
（`.claude/rules/dependabot.md`）。つまり **取り込むなら差し替え PR**（`engines.vscode` と
`@types/vscode` を 1 コミットで動かす）以外の形が無い。

供給側のリスクはゼロに近い。DefinitelyTyped の `types` account 発行、lifecycle script なし、
依存ゼロ、`.d.ts` のみ。lock に増えたパッケージ名もない。

判断が要るのは供給側ではなく、**拡張の最低 VS Code 版を 1.111 → 1.125 に上げてよいか**という点で、
**上げる**と決めた（下の「決定: VS Code 版の追随規則」）。差し替え PR
[#2563](https://github.com/kompiro/karasu/pull/2563) が `engines.vscode: ^1.125.0` と
`@types/vscode: ^1.125.0` を 1 コミットで入れる。#2559 は close 済み。判定は採用なので
`@dependabot ignore` は設定しない。

1.111〜1.124 の利用者は Marketplace から新版を取得できなくなるが、VS Code は週次リリースで
自動更新されるため実害は小さい。

[ADR-769](../adr/769-update-dependencies-20260420.md) が 1.110 → 1.116 のときに
「`engines.vscode` が 1.116 未満なら、その pin が意図した出荷対象と合っているか確認する」という
action item を残していたが未回収で、今回それが hard failure として顕在化した。
規則にして機械チェックを置くことで、この action item は今回で閉じる。

### #2560 `@radix-ui/react-tooltip` 1.2.8 → 1.2.16（low / 採用）

#2554 と同じ radix のリリース列（provenance 付き CI 再 publish を含む）に乗っている。
lock 側では `@floating-ui/{core,dom,react-dom,utils}` と radix の
`react-arrow` / `react-popper` / `react-use-rect` / `react-use-size` / `rect` の二重化が解消される。

### #2561 `mocha` 11.7.5 → 11.8.0（low / 採用）

機能追加は `--fail-hook-affected-tests` の 1 件のみで、opt-in フラグなので既定動作は変わらない。
残りは CI / サイトの chore。

**この PR は「解決バージョンの集合」だけを見ると変化が見えにくい。**
`mocha@11.8.0` は base lock に既に存在していた（`@vscode/test-cli@0.0.15` が
`mocha: ^11.7.6` を要求するため）。この PR が実際に行うのは
`vscode-extension-tester@8.24.0` のエッジを `mocha 11.7.5` → `11.8.0` に付け替えることで、
結果として mocha の二重化が解消し、`yargs@17.7.2` が lock から消える。
[TPL-2456](../test-perspectives/TPL-2456-module-instance-scoped-identity.md) の
「判定はバージョンが揃っているかではなく解決されるファイルが 1 つかで行う」に沿った改善。

`serialize-javascript` も 7.0.5 + 7.1.0 → 7.1.0 に収束する。`pnpm-workspace.yaml` の
override floor `serialize-javascript: ^7.0.5` は満たしたまま
（[GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) の patched 版は 7.0.5）。

## 現時点の方針

**8 件すべて採用。保留・却下はゼロ。**

- **採用（そのままマージ）**: 7 件。#2554 / #2555 / #2557 / #2560 / #2561 と、
  CI 再実行後の #2556 / #2558
- **採用（差し替え PR）**: 1 件。#2559 は close し、
  [#2563](https://github.com/kompiro/karasu/pull/2563) で `engines.vscode` とセットで入れる
- **却下**: 0 件。`@dependabot ignore` は設定しない

peer で結ばれた組は本バッチに含まれていないが、**マージ順に 1 つ意味がある**:

1. **#2555 を先に**。`@vscode/test-electron` 3.0.0 が extension host ジョブの
   ダウンロード flake そのものを直す（#2555 の節）。#2556 は再実行 2 回とも同じ箇所で
   落ちており、再実行を繰り返すより先に原因を入れる方が早い
2. 残りは任意順。#2556 は 9 manifest に触るのでコンフリクトしやすく、最後に回すのが無難

## 決定: VS Code 版の追随規則

**`@types/vscode` と `engines.vscode` は常に同値とし、その版は CI が検証している
VS Code 版に追随させる。**

VS Code は週次リリースで自動更新されるので、最新 API 水準に追いつくコストが低い。
`packages/vscode-e2e/.vscode-test.mjs` は既に `version: "stable"` を意図的に選んでおり
（「Track upstream stable so each weekly VS Code release is exercised by this suite」）、
これが「CI は常に floor 以上の host で検証している」を数字を比べずに成立させている。
最新の VS Code は、公開済みのどの `@types/vscode` よりも必ず新しいためである。

`scripts/ci/vscode-version-policy.test.ts`（#2563）が次を検査する:

1. `@types/vscode` を宣言する全 workspace manifest が同じレンジであること。
   宣言箇所は手書きの一覧ではなく manifest の走査で見つける
   （[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)）
2. `engines.vscode` がそのレンジと**同値**であること。vsce は片方向しか拒否しないので、
   floor が types より低い側も検出する
3. `.vscode-test.mjs` が `stable` を追い続けていること。ここに版を pin すると
   「CI ≥ floor」が無料で成立しなくなるので、その時点で落として比較を明示させる
4. 宣言が実際に見つかったことの sanity 検査

**バージョン定数はテストに置かない。** 置くと sweep 対象が 4 箇所目に増え、
まさにこのテストが取り締まる bump のたびにテスト自身がずれる。
[ADR-2397](../adr/2397-node-24-baseline.md) の `node-version-policy.test.ts` が
`NODE_MAJOR` を定数で持つのとは逆の形にしている。Node は自分の意思で上げる toolchain の
baseline だが、VS Code の floor は upstream の release に追随する従属変数だからである。

## バッチ外の発見: nanoid の open alert

本バッチとは別に、**open な Dependabot alert が 1 件ある**:

| # | GHSA | severity | package | 脆弱範囲 | patched | 検知 |
| --- | --- | --- | --- | --- | --- | --- |
| 68 | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | high | `nanoid` | `< 3.3.18` | 3.3.18 | 2026-08-13 |

lock には `postcss@8.5.25 -> nanoid 3.3.17`（脆弱）と `postcss@8.5.26 -> nanoid 3.3.18`（patched）が
併存している。transitive のため Dependabot は version update PR を起票しておらず、
本バッチのどの PR でも解消しない。`pnpm-workspace.yaml` の `overrides:` に `nanoid` は無い。

これは `/hane:security-alert` の対象で、本 triage とは別に処理する。

## 未解決の問い

- なし。`engines.vscode` の運用は上の「決定: VS Code 版の追随規則」で閉じた
