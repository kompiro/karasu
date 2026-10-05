# Dependabot トリアージ 2026-10-05

- **日付**: 2026-10-05
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3060](https://github.com/kompiro/karasu/pull/3060) / [#3061](https://github.com/kompiro/karasu/pull/3061) / [#3062](https://github.com/kompiro/karasu/pull/3062) / [#3063](https://github.com/kompiro/karasu/pull/3063) / [#3064](https://github.com/kompiro/karasu/pull/3064) / [#3065](https://github.com/kompiro/karasu/pull/3065) / [#3066](https://github.com/kompiro/karasu/pull/3066) / [#3067](https://github.com/kompiro/karasu/pull/3067) / [#3068](https://github.com/kompiro/karasu/pull/3068) / [#2973](https://github.com/kompiro/karasu/pull/2973)（前回から保留）
  - VS Code floor の追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)
  - 前回トリアージ: [ADR-2983](../adr/2983-dependabot-triage-2026-09-29.md)
  - gh-aw の再生成規則: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)、`.claude/rules/dependabot.md`
  - VS Code floor と ExTester の `vscode-max`: [ADR-2782](../adr/2782-vscode-floor-capped-by-extester.md)
  - 差し替え PR の語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)

## 背景・課題

2026-10-05（月）の weekly バッチ。npm 7 件、github-actions 2 件、前回から保留中の #2973 を合わせて 10 件を対象にする。
`security` ラベル付きの PR はない。週次 workflow は ADR-2839 で schedule を止めているため所見 Issue も PR コメントもなく、
upstream の追跡は最初から行った。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `github/gh-aw-actions/setup` v0.90.0（2026-09-28 23:18Z、ちょうど 7 日）
- publisher: from 版と to 版で変化なし。`jsdom` / `mocha` / `vitest` / `@astrojs/starlight` は GitHub Actions の
  OIDC trusted publishing で SLSA provenance 付き。`yaml`（eemeli）/ `knip`（webpro）/ LSP 群（microsoft1es）は
  従来から provenance なしのまま
- lifecycle script（`preinstall` / `install` / `postinstall`）: to 版にも新規 transitive にも追加ゼロ
- 既知 advisory: to 版すべてで該当ゼロ
- 新しいパッケージ名が入るのは #3066 の `micromark-util-edit-map` と #3064 の `find-up-simple` の 2 件（後述）

CI が red なのは 3 件。#3060 は `gh-aw-lock-consistency.test.ts` が規則どおり止めたもの、#2973 は
`vscode-version-policy.test.ts` が ADR-2782 どおり止めたもの、#3064 は mocha と関係のない app E2E の flake である。

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として `origin/main` と PR ヘッドで突き合わせた
（`security-alert` skill の edges 手順）。「新規パッケージ」は lock の `packages:` に main で存在しなかったキーを指す。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#3065](https://github.com/kompiro/karasu/pull/3065) | `yaml` | 2.9.0 → 2.9.1 | patch | green | low | 採用（そのままマージ） |
| [#3067](https://github.com/kompiro/karasu/pull/3067) | `knip` | 6.37.0 → 6.38.0 | minor | green | low | 採用（そのままマージ） |
| [#3063](https://github.com/kompiro/karasu/pull/3063) | `vitest` / `@vitest/coverage-v8`（vitest group） | 5.0.1 → 5.0.2 | patch | green | low | 採用（そのままマージ） |
| [#3062](https://github.com/kompiro/karasu/pull/3062) | LSP group（4 件） | 10.1.1 → 10.1.2 ほか | patch | green | low | 採用（そのままマージ） |
| [#3068](https://github.com/kompiro/karasu/pull/3068) | `jsdom` | 30.0.1 → 30.1.1 | minor | green | low | 採用（そのままマージ） |
| [#3066](https://github.com/kompiro/karasu/pull/3066) | `@astrojs/starlight` | 0.41.6 → 0.42.4 | 0.x minor | green（docs build は CI 外、ローカルで確認済み） | low | 採用（そのままマージ） |
| [#3061](https://github.com/kompiro/karasu/pull/3061) | `cloudflare/wrangler-action` | 4.0.0 → 4.1.3 | minor | green | low | 採用（そのままマージ） |
| [#3064](https://github.com/kompiro/karasu/pull/3064) | `mocha` | 11.8.0 → 12.0.2 | **major** | Playwright red（flake、再実行中） | low | 採用（再実行で green を確認してマージ） |
| [#3060](https://github.com/kompiro/karasu/pull/3060) | `github/gh-aw-actions/setup` | 0.89.17 → 0.90.0 | minor | Check red | low | **却下**（`gh aw compile` の再生成 PR で入れる） |
| [#2973](https://github.com/kompiro/karasu/pull/2973) | `@types/vscode` | 1.137.0 → 1.138.0 | minor | Check / ExTester red | low | **却下**（追随方針を #3070 で見直す。close） |

## PR ごとの分析

### #3064 `mocha` 11.8.0 → 12.0.2（`packages/vscode-e2e`、major）

**判定: low / 採用。major だが vscode-e2e の使い方は 12.x の breaking change に当たらない。**

12.x の breaking change と当方の状況:

- Node の floor が `^20.19.0 || >=22.12.0` になる。CI は Node 24 で、ExTester 自体が `>=22` を要求している
- `type: module` 化（ESM の `bin/`、`bin/_mocha` 削除）、yargs から `util.parseArgs` への置き換え
- CI では `--forbid-only` が既定で有効になる。`packages/vscode-e2e/tests` に `.only` は無い
- `.mocharc.json` が使うのは ui / timeout / color / reporter だけで、いずれも残っている

どの mocha が使われるか:

- `vscode-extension-tester@8.27.0` は mocha を同梱せず peer `mocha: >=5.2.0` を `require("mocha")` で読む。lock 上
  `vscode-extension-tester@8.27.0(mocha@12.0.2)` に解決されるので、この devDep が ExTester の実行に使われる
  （ESM パッケージの CJS `require` は Node 24 で動く）
- `@vscode/test-cli@0.0.15` は自前で `mocha: 11.8.0` に依存しており、lock に残る。extension host のジョブは影響を受けない
- **PR 上の ExTester ジョブは mocha 12.0.2 で `.mocharc.json` を読み込み、21 件通過している**

供給側: 12.0.2 は GitHub Actions OIDC + provenance（11.8.0 と同じ）、maintainer（joshuakgoldberg / mark-wiemer）不変、
2026-09-17 公開。`npm diff` は約 43k 行で大半が ESM 化。`child_process`（bin の `spawn`）と `eval`（worker での
シリアライズ済みオプション）はどちらも移動しただけで、ネットワーク処理の追加は無い。

依存エッジ: 新しいパッケージ名は `find-up-simple@1.0.1`（sindresorhus、2025-03 公開、provenance なしは同作者の通例）。
ほかに `is-path-inside@4.0.0`、`workerpool@10.0.3`、`serialize-javascript@7.1.2`（provenance 付き、
GHSA-gfhx-hw2g-v5hg の patched 版）が入る。

**CI の red について**: 落ちたのは app の E2E `at-0054-deprecated-domain-migration.spec.ts:73` 1 件だけで、
起動 helper（`fixtures/editor.ts` の `replaceEditorContent` の `toPass`）で 15 秒の timeout に達した（191 passed / 1 failed、
`retries: 0`）。lock の変化は mocha の subtree だけで `packages/e2e` は使わない。`e2e.yml` の直近 300 run で AT-0054 が
落ちたのはこれ 1 回きりで、nightly の直近 10 run も全部通っている。flake と判断して失敗ジョブを再実行した。
**マージは再実行で green になったことを確認してから行う。**

### #3060 `github/gh-aw-actions/setup` 0.89.17 → 0.90.0

**判定: low / 却下。規則どおり bot PR は閉じ、`gh aw compile` の再生成 PR で入れる。**

`.claude/rules/dependabot.md`「gh-aw の `.lock.yml` は bot PR ではなく再生成で上げる」（ADR-2753）に当たる。
bot は `uses:` 行しか書き換えないため、`gh-aw-lock-consistency.test.ts` が 2 件の不一致で止めた（想定どおり）。

- sha は本物: `v0.90.0` の annotated tag は commit `a65c3ae1…` を指し、PR の pin と一致する
- **v0.90.0 は prerelease**: `gh aw` CLI の v0.90.0（2026-09-28）は `prerelease=true`。現行の v0.89.17 は正式版で、
  正式版の最新は **v0.89.21**（2026-09-23）。その後の v0.90.1 / v0.90.3 も prerelease
- 0.89.22 は docker-sbx / gVisor の sandbox runtime を削除する breaking change を含む。当方の
  `dependabot-triage.md` / `security-alert-sweep.md` は `sandbox` / `runtime` を設定していないので該当しない
- 権限変更の告知は無い

再生成 PR で入れる版は、prerelease を避けて **v0.89.21** を推奨する（規則は Dependabot の要求版と違う版を入れることを許し、
その理由を PR 本文に書くことを求めている）。v0.90 系の正式版が出たら、次の Dependabot 提案で改めて扱う。
`@dependabot ignore` は設定しない（却下の理由は版ではなく bot の diff の形にあるため）。

### #2973 `@types/vscode` 1.137.0 → 1.138.0（前回から保留）

**判定: low / 却下（close）。パッケージに問題は無いが、bot の提案の仕方が floor の制約と構造的に噛み合わない。**

- ADR-2782 の前提だった ExTester の上限は、`vscode-extension-tester@8.28.0`（2026-10-02 公開）と 8.28.1（10-05 公開）で
  `vscode-min 1.138.0` / `vscode-max 1.140.0` になった。lock は 8.27.0（max 1.137.0）のままなので CI は red
- cooldown: 8.28.0 は 2026-10-09、8.28.1 は 10-12 に満たす。publisher は 8.27.0 と同じ `rhdevelopers-ci`
- `@types/vscode` は 1.139 が無く、1.140.0（10-01 公開、10-08 に cooldown 充足）が出ている

**保留を続けない理由**: ADR-2562 は floor を「最新の `@types/vscode`」に追随させ、ADR-2782 はそれを ExTester の `vscode-max`
以下に抑える。`@types/vscode` は VS Code stable と同日に出るが、ExTester の `vscode-max` はそれより遅れて上がり、さらに
両方に cooldown 7 日が掛かる。Dependabot は常に最新の `@types/vscode` だけを提案するので、提案はほぼ毎回上限を超えて
起票時点で red になる。ExTester が追いつく頃には次の VS Code が出ており、保留して待つ運用ではいつまでも入らない
可能性がある（#2973 は 2026-09-28 から保留していた）。

**今後の方針**（[#3070](https://github.com/kompiro/karasu/issues/3070) で ADR にする）:

- floor の目標値を、cooldown を満たした ExTester の `vscode-max` にする。floor は VS Code stable より少し古い版を追う
- floor を上げるきっかけは `vscode-extension-tester` の Dependabot PR とし、ExTester の bump と floor の引き上げを同じ
  コミットにした差し替え PR で入れる（bot はこの対の diff を作れない）
- `.github/dependabot.yml` で `@types/vscode` の version update を `ignore` する（security update は対象外）

最初の適用は ExTester ^8.28 + floor ^1.140.0 になる見込み。#2973 は close する。`@dependabot ignore` のコメントは使わず、
抑止は #3070 の `dependabot.yml` 変更で行う（設定ファイルに理由と一緒に残すため）。

### #3068 `jsdom` 30.0.1 → 30.1.1

**判定: low / 採用。前回保留した #2976（30.1.0）の regression は 30.1.1 で直っており、#2976 は closed（superseded）。**

- 30.1.1 のリリースノート先頭が jsdom#4347（Radix メニューが window blur で閉じる regression）の修正。CI の Check（前回 red
  だった `PreviewPane` / `PreviewColumn` / `FacetSelector` のテストを含む）は green
- 供給側: OIDC + provenance、maintainer 不変、2026-09-22 公開。30.1.0 → 30.1.1 の `npm diff` は約 90 ファイルで、
  変化した `require` は `node:` prefix への移行と `helpers/focusing` の再構成だけ。`child_process` / `eval` /
  ネットワーク処理の追加は無い
- 依存エッジ: 新しいパッケージ名は無い。`whatwg-url` 17.1.2、`w3c-xmlserializer` 6.0.0、`html-encoding-sniffer` 7.0.0、
  `@asamuzakjp/*`、`@csstools/*` などの版移動。`symbol-tree` と `lru-cache@11.5.2` が抜ける
- 30.1.2（10-04 公開、cooldown 未達）は 30.1.0 由来の残り 2 件（巨大 DOM の構築が遅い、負の CSS サイズ値を拒否する）を直す。
  急ぐものではなく、次回以降の bot 提案で扱う

### #3066 `@astrojs/starlight` 0.41.6 → 0.42.4（`packages/docs-site`）

**判定: low / 採用。0.42.0 の breaking change は当方の使い方に当たらず、docs build はローカルで確認した。**

- 0.42.0 の breaking change: `tagline` オプションの削除（未使用）、モバイルメニューの markup 変更（`starlight-menu-button` /
  `data-mobile-menu-expanded` を参照する CSS / override は無い）、astro ≥ 7.2.10 が必要（当方は 7.3.3）、古いブラウザ
  （Chrome < 116 / Safari < 17 / Firefox < 125）のサポート終了。override は `Footer` だけで、契約は変わっていない。
  starlight-* プラグインは使っていない
- **CI の穴（前回と同じ）**: bot PR の CI は docs site をビルドしない。PR ブランチで
  `pnpm --filter @karasu-tools/docs-site run build` を実行し、71 ページのビルド、check-links（34 ページ）、Pagefind 索引の
  生成が通ることを確認した。WARN 2 行は main でも同じものが出る（新しい warning は無い）
- 供給側: 0.41.6 から 0.42.4 まで全版 OIDC + provenance。0.42.0 から `dist/` のコンパイル済み JS を配布する形に変わった。
  `child_process` は既存の git「最終更新日」helper がコンパイルされたもの
- 依存エッジ: 538 本減って 135 本増える（`@astrojs/mdx` 8 で remark / mdx / estree / gfm の連鎖が落ちる）。新しいパッケージ名は
  `micromark-util-edit-map@1.0.0` 1 件（2026-09-26 公開、micromark の maintainer wooorm、micromark の monorepo 由来、
  provenance なし、install script なし、micromark 4.0.3 が引き込む）
- 副次効果: vite の peer 経由で `@types/node` が workspace 全体で 26.5.1 → 26.6.3、24.13.3 → 24.19.0 に動く（型のみ）
- 未確認: ページの見た目（モバイルメニュー・footer の描画）は目視していない

### #3061 `cloudflare/wrangler-action` 4.0.0 → 4.1.3

**判定: low / 採用。Cloudflare の API token を扱う action なので dist の差分まで確認した。**

- pin は正しい: 5 つの workflow すべてで `953926a2… # v4.1.3`。upstream の `v4.1.3` annotated tag を辿ると同じ commit に
  着く（tag と commit が unsigned なのはこの repo の通常のリリース形態）
- `action.yml`: `preview-*` 出力 5 件の追加と説明文 2 箇所の変更だけで、入力は変わらない
- `dist/index.mjs`（126 行）: 新しいコードは `wrangler preview` コマンドのときだけ動く（出力の解析、`GITHUB_TOKEN` があれば
  GitHub Deployment と job summary を作る）。`exec` 失敗時に wrangler の stderr をログに出すようになった。
  **`apiToken` / secret の扱いと、当方のコマンドで使うネットワークの宛先は変わっていない**
- 既定の wrangler 版は `"4"` のまま。当方は `wranglerVersion` を指定しておらず、`pages deploy` と `deploy` だけを使う。
  `preview` は使わないので「Wrangler 4.136.3 以上が必要」は該当しない
- v4.1.0 / v4.1.1（09-22）は壊れた publish（upstream #454）で、4.1.2 / 4.1.3 がリリース手順を直した。commit は Cloudflare の
  maintainer と github-actions[bot]。v4.1.3 は 2026-09-24 リリース
- 未確認: 実際の deploy は動かしていない。main にマージ後、最初の deploy / preview の成功で確かめる

### #3062 LSP group

**判定: low / 採用。VS Code 拡張としてユーザーに配布される依存。**

- 版: `vscode-languageserver` 10.1.1 → 10.1.2、`vscode-languageserver-protocol` 3.18.3 → 3.18.4、
  `vscode-languageserver-textdocument` 1.0.14 → 1.0.15、`vscode-languageclient` 10.1.1 → 10.1.2。連動して
  `vscode-jsonrpc` 9.0.2 → 9.0.3、`vscode-languageserver-types` 3.18.3 → 3.18.4。新しいキーはこれらの版移動だけ
- publisher は全版 `microsoft1es` で不変（provenance は前後とも無し）。2026-09-24/25 公開
- client の `engines.vscode` は `^1.91.0` のままで、当方の `^1.137.0` と両立する
- 変更: semantic token の delta で未知の previous result id を受けたら full result に戻す、server の `console.info` を
  connection の logger へ送る（stdio の破損防止）、client が jsonrpc の接続ログを output channel に出す。`packages/lsp/src` に
  `console.info` / `console.log` は無く、client は `TransportKind.ipc` で起動するので影響は無い
- 注記: 各パッケージの `prepublishOnly` が「secure pipeline からのみ publish 可」のガードから `npm run all:publish` に
  変わった（upstream #1847「Azure Artifacts への publish を有効化」）。publish 経路の変更で、install には影響しない。
  publisher のアカウントは同じ

### #3063 `vitest` / `@vitest/coverage-v8` 5.0.1 → 5.0.2

**判定: low / 採用。** バグ修正のみ。publisher は OIDC + provenance で不変、2026-09-25 公開。`dist` が import する外部
モジュールの集合は前後で同一で、約 100k 行の diff は chunk hash の改名、`eval` / `new Function` の箇所も同じ。新しいキーは
`magic-string@1.4.2`、`tinybench@6.2.0`、`tinyexec@1.3.1`（いずれも provenance 付き）。

注記: `why-is-node-running` が 2.3.0 → 3.2.2 と major で動く。3.2.2 は 2025-01-08 公開の安定版で、publisher は `mafintosh` から
`jkoops`（listed maintainer で 3.x 系をすべて publish している）に変わる。provenance は前後とも無し。依存ゼロになり、
`siginfo` と `stackback` が lock から抜ける。

### #3065 `yaml` 2.9.0 → 2.9.1（`packages/core` / `packages/cli` の runtime 依存）

**判定: low / 採用。**

- publisher は唯一の maintainer `eemeli` で不変（provenance は前後とも無し）、2026-09-11 公開
- 差分は `nodes/Alias.js` と `compose/resolve-flow-scalar.js`（と browser 版）だけ。既存の `maxAliasCount`（リソース枯渇対策）の
  チェックを merge の解決中に見つかった alias にも効くよう移した。import の追加・ネットワーク・`eval` は無い
- GHSA は付いていない（yaml の既存 advisory は 2 件ともこの範囲より下）。upstream #685 の本文は確認できなかった
- karasu は merge key を使わない: `packages/core/src/translate/` は `parse` / `parseAllDocuments` をオプションなしで呼び、
  YAML 1.2 は既定で `<<` を解決しないので、変更箇所に到達しない
- `yaml@2.9.1` は knip 経由で既に lock にあり、新しいキーは無い

### #3067 `knip` 6.37.0 → 6.38.0

**判定: low / 採用。** plugin の追加（Turborepo ほか）と既存 plugin の修正。publisher `webpro` で不変（provenance なしは従来から）、
2026-09-23 公開。新しい transitive の版は `smol-toml@1.9.0`（provenance 付き、版移動）だけ。

## 範囲外: open な security alert 2 件

トリアージ中に open の Dependabot alert を 2 件確認した。どちらも transitive で、bot PR は起票されていない。

| alert | package | advisory | 脆弱範囲 | patched |
| --- | --- | --- | --- | --- |
| #85 | `braces`（lock は 3.0.3） | high: 深いネストのパターンでスタック枯渇（DoS） | `<= 3.0.3` | 未公開 |
| #86 | `http-cache-semantics`（lock は 4.2.0） | high: `max-stale` の扱いでユーザー間のキャッシュ応答が漏れうる | `<= 4.2.0` | 未公開 |

patched 版が出ていないため、今は override で上げる先が無い。`pnpm-workspace.yaml` の `overrides:` にはどちらも載っていない。
patched 版が出た時点で `security-alert` skill の手順で別に扱う。

## 現時点の方針

| PR | 判定 | 反映 |
| --- | --- | --- |
| #3065 / #3067 / #3063 / #3062 / #3068 / #3066 / #3061 | 採用 | bot PR をそのままマージ。lock が衝突するので 1 件ずつ入れ、各マージの後に次の PR へ `@dependabot rebase` を掛けて CI を通し直す（#3061 は lock を触らない） |
| #3064 `mocha` | 採用 | flake の再実行で green を確認してから、上と同じ順番待ちでマージ |
| #3060 `gh-aw-actions/setup` | 却下 | bot PR を close し、`gh aw compile` の再生成 PR を v0.89.21（正式版の最新）で出す。`@dependabot ignore` は設定しない |
| #2973 `@types/vscode` | 却下 | bot PR を close。floor の追随方針を #3070 で見直し、ExTester の bump と対にした差し替え PR で上げる |

### 理由

- 採用 8 件は、publisher・provenance・lifecycle script・依存エッジ・advisory・cooldown のいずれにも懸念が無かった
- #3064 は major だが、breaking change はどれも vscode-e2e の使い方に当たらず、ExTester のジョブが mocha 12.0.2 で通っている
- #3060 は版ではなく bot の diff の形の問題で、規則（ADR-2753）が却下と再生成を決めている。v0.90.0 は prerelease なので、
  再生成では正式版の v0.89.21 を入れる
- #2973 は最新の `@types/vscode` を追う提案と ExTester の上限が構造的に噛み合わず、保留では解消しない。追随の起点を ExTester に移す（#3070）
- #3066 は CI が docs site をビルドしないため、PR ブランチでのローカルビルドを採用の条件にした

## 却下した案

### #3060 の bot PR に再生成コミットを足して通す

bot ブランチに人手でコミットを足しても、次の recreate / rebase で失われる。差し替え PR（再生成 PR）が規則上の正しい形である。

### #3060 の再生成で Dependabot の要求版 v0.90.0 を入れる

v0.90.0 は `gh aw` CLI 側で prerelease 扱いで、現行は正式版を使っている。prerelease を入れる利点（step summary の改善など）は
当方の 2 workflow（dispatch のみ）にとって小さい。

### #2973 を保留のまま次回に持ち越す

次回（10-12）に ExTester 8.28 と `@types/vscode` 1.140 がたまたま揃う見込みはあるが、それは今月の巡り合わせにすぎない。
VS Code の次の stable が出れば同じ保留がまた始まるので、方針側を直す（#3070）。
