---
id: ADR-3196
title: Dependabot トリアージ 2026-10-14：npm 6 件を採用し、Radix は 4 件を揃える差し替え PR、actions/* は gh-aw の生成物を除く差し替え PR で入れ、download-artifact と gh-aw-actions は却下する
status: accepted
date: 2026-10-14
topic: build
related_to:
  - ADR-3069
  - ADR-2753
  - ADR-2671
  - ADR-2474
  - ADR-784
  - ADR-2839
  - ADR-3421
scope:
  packages: [app, cli, core, docs-site, e2e, i18n, lsp, nest, vscode, vscode-e2e]
  concerns: [ci, dependencies, security]
---

# ADR-3196: Dependabot トリアージ 2026-10-14：npm 6 件を採用し、Radix は 4 件を揃える差し替え PR、actions/* は gh-aw の生成物を除く差し替え PR で入れ、download-artifact と gh-aw-actions は却下する

- **日付**: 2026-10-14
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3196](https://github.com/kompiro/karasu/pull/3196)（本 ADR に昇格し削除）
  - Radix の差し替え PR: [#3199](https://github.com/kompiro/karasu/pull/3199)（#3191 / #3194 の差し替え）
  - `actions/*` の差し替え PR: [#3200](https://github.com/kompiro/karasu/pull/3200)（#3184 / #3186 の差し替え）
  - `.lock.yml` の drift ガードを `actions/*` に広げる: [#3201](https://github.com/kompiro/karasu/issues/3201)
  - 対象 Dependabot PR: [#3184](https://github.com/kompiro/karasu/pull/3184) / [#3185](https://github.com/kompiro/karasu/pull/3185) / [#3186](https://github.com/kompiro/karasu/pull/3186) / [#3187](https://github.com/kompiro/karasu/pull/3187) / [#3188](https://github.com/kompiro/karasu/pull/3188) / [#3189](https://github.com/kompiro/karasu/pull/3189) / [#3190](https://github.com/kompiro/karasu/pull/3190) / [#3191](https://github.com/kompiro/karasu/pull/3191) / [#3192](https://github.com/kompiro/karasu/pull/3192) / [#3193](https://github.com/kompiro/karasu/pull/3193) / [#3194](https://github.com/kompiro/karasu/pull/3194) / [#3195](https://github.com/kompiro/karasu/pull/3195)
  - 前回トリアージ: [ADR-3069](../adr/3069-dependabot-triage-2026-10-05.md)
  - gh-aw の再生成規則: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)、`.claude/rules/dependabot.md`
  - exact pin の組を groups で結ぶ: [ADR-2671](../adr/2671-dependabot-triage-2026-08-31.md)
  - 差し替え PR の語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)

## 背景

2026-10-14（水）に起票された weekly バッチ。npm 8 件、github-actions 4 件の計 12 件。`security` ラベル付きの PR は無く、
対応する open alert も無い（security update ではない）。週次 workflow は ADR-2839 で schedule を止めているため所見 Issue も
PR コメントも無く、upstream の追跡は最初から行った。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- publisher: from 版と to 版で変化なし。provenance を失ったものも無い（`std-env` / `@types/node` / `monaco-editor` /
  `es-module-lexer` / `mdast-util-*` は前後とも provenance なしで、従来どおり）
- lifecycle script（`preinstall` / `install` / `postinstall` / `prepare`）: to 版にも移動した transitive にも追加ゼロ
- 既知 advisory: to 版すべてで該当ゼロ（GitHub Advisory API の `affects=<pkg>@<ver>`）
- action の pin: 4 件とも PR の sha は upstream の tag が指す commit と一致し、PR 内の全 workflow で sha と版コメントが揃っている
- 依存エッジ: lock の snapshot を peer suffix を落として merge-base（`c8539472`）と PR ヘッドで突き合わせた（`security-alert`
  skill の edges 手順）。**main に存在しないパッケージ名が新しく入る PR は 1 件も無い**。すべて既存パッケージの版移動

判断が必要になったのは供給側ではなく、**bot の diff の形**に関する 3 点である。

1. `actions/*` の bump が gh-aw の生成物 `.lock.yml` の `uses:` 行まで書き換える（#3184 / #3185 / #3186）。ADR-2753 が
   gh-aw-actions について却下した「生成物の部分編集」と同じ型だが、規則と drift テストは `actions/*` を扱っていない
2. Radix の 2 件（#3191 / #3194）は、`react-dialog` / `react-tooltip` が exact pin で持つ primitive と版が割れ、同じ
   primitive が lock に 2 版ずつ並ぶ
3. cooldown 7 日（168 時間）に満たない時点での起票を 3 件観測した（#3184 / #3185 / #3186）

CI が red なのは #3187 だけで、`gh-aw-lock-consistency.test.ts` が規則どおり止めたもの。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#3195](https://github.com/kompiro/karasu/pull/3195) | `tsx` | 4.23.12 → 4.23.15 | patch | green | low | 採用（そのままマージ） |
| [#3192](https://github.com/kompiro/karasu/pull/3192) | `@types/node` | 26.6.2 → 26.6.4 | patch | green | low | 採用（そのままマージ） |
| [#3188](https://github.com/kompiro/karasu/pull/3188) | `vitest` / `@vitest/coverage-v8`（vitest group） | 5.0.2 → 5.0.3 | patch | green | low | 採用（そのままマージ） |
| [#3190](https://github.com/kompiro/karasu/pull/3190) | `@astrojs/starlight` | 0.42.4 → 0.42.5 | patch | green（docs build は CI 外、ローカルで確認済み） | low | 採用（そのままマージ） |
| [#3189](https://github.com/kompiro/karasu/pull/3189) | `monaco-editor` | 0.56.0 → 0.57.0 | 0.x minor | green | low | 採用（そのままマージ） |
| [#3193](https://github.com/kompiro/karasu/pull/3193) | `@anthropic-ai/sdk` | 0.124.0 → 0.131.0 | 0.x minor | green | low | 採用（そのままマージ） |
| [#3191](https://github.com/kompiro/karasu/pull/3191) | `@radix-ui/react-tabs` | 1.1.21 → 1.1.22 | patch | green | low | 採用（**差し替え PR**: Radix 4 件を 1 コミットで揃える） |
| [#3194](https://github.com/kompiro/karasu/pull/3194) | `@radix-ui/react-dropdown-menu` | 2.1.24 → 2.1.25 | patch | green | low | 採用（同上） |
| [#3184](https://github.com/kompiro/karasu/pull/3184) | `actions/upload-artifact` | 7.0.1 → 7.0.2 | patch | green | low | 採用（**差し替え PR**: 生成物以外の workflow だけ上げる） |
| [#3186](https://github.com/kompiro/karasu/pull/3186) | `actions/setup-node` | 7.0.0 → 7.1.0 | minor | green | low | 採用（同上。cooldown 充足の 10-15 02:52Z 以降） |
| [#3185](https://github.com/kompiro/karasu/pull/3185) | `actions/download-artifact` | 8.0.1 → 8.0.2 | patch | green | low | **却下**（触るのが生成物だけ。gh-aw の再生成で入れる） |
| [#3187](https://github.com/kompiro/karasu/pull/3187) | `github/gh-aw-actions/setup` | 0.89.21 → 0.91.5 | minor | Check red（想定どおり） | low | **却下**（規則どおり。今回は再生成も不要） |

## PR ごとの分析

### #3184 / #3185 / #3186: `actions/*` が gh-aw の `.lock.yml` を書き換える

**3 件に共通する問題**: `dependabot-triage.lock.yml` と `security-alert-sweep.lock.yml` は `gh aw compile` の生成物で、
2 行目の `gh-aw-manifest` と冒頭の `# Custom actions used:` に、使う action の sha と版が記録されている。bot は `uses:` 行だけを
書き換えるので、マージすると manifest は旧版のまま残る。さらに gh-aw v0.89.21 のコンパイラが内蔵する pin
（`pkg/workflow/data/action_pins.json`）は upload-artifact v7.0.1 / download-artifact v8.0.1 / setup-node v7.0.0 なので、
次に `gh aw compile` を回すと旧版へ戻る。

CI がこれを止めないのは、`scripts/ci/gh-aw-lock-consistency.test.ts` が照合するのが `.github/aw/actions-lock.json` にある repo
（`github/gh-aw-actions/setup` だけ）で、`actions/*` を見ないからである。`actions/*` の bump が `.lock.yml` に及んだのは gh-aw
導入（#2661）以降で今回が初めてで、過去の ADR に先例は無い。

| PR | 触るファイル | 生成物以外 |
| --- | --- | --- |
| #3184 upload-artifact | `.lock.yml` 2 本 + `e2e.yml` / `e2e-nightly.yml` / `vscode-e2e.yml` / `vscode-screenshots.yml` | 4 本 |
| #3186 setup-node | `.lock.yml` 2 本 + 通常の workflow 19 本 | 19 本 |
| #3185 download-artifact | `.lock.yml` 2 本だけ | 0 本 |

このため、#3184 と #3186 は**生成物以外の workflow だけを上げる差し替え PR** で採用し、#3185 は却下する。`.lock.yml` の
`actions/*` は、それらの版を pin に持つ gh-aw の正式版で再生成するときに上がる（v0.91.12 が最初だが prerelease）。

#### #3184 `actions/upload-artifact` 7.0.1 → 7.0.2

**判定: low / 採用（差し替え PR）。**

- 差分（4 commits / 7 files）: `action.yml` は不変（`node24`）。`dist/` は `@actions/artifact` 6.2.0 → 6.3.1 の取り込みだけで、
  HTTP 429 の `Retry-After` 尊重、retry 待ちの上限 120 秒、User-Agent への `ACTIONS_ORCHESTRATION_ID` 付加、
  Content-Disposition の `filename*` 対応（basename のサニタイズは維持）。新しいホスト、`eval`、`child_process` の追加なし
- 配布側: release author `tunc-d` はこの repo の release を初めて出す人（v7.0.1 は `yacaovsnc`）。ただし upstream PR
  #821 / #822 は actions の maintainer が approve しており、commit は verified。同じ人が actions/toolkit で `@actions/artifact`
  6.3.x を作り、npm には GitHub Actions trusted publishing + provenance で出ている。repo の移管なし。
  `tunc-d` が GitHub 社員かどうかは未確認
- release 2026-10-07T10:08Z

#### #3186 `actions/setup-node` 7.0.0 → 7.1.0

**判定: low / 採用（差し替え PR）。cooldown を満たす 2026-10-15T02:52Z 以降に出す。**

- 差分（22 commits / 31 files）: input / output / default は不変（`package-manager-cache` の default は true のまま、`node24`）。
  `src` の変更は 3 点:
  1. `node-version-file` の解決を `path.resolve` にする（絶対パスを許す）
  2. version file として mise.toml の parse を試す（新しい bundle 依存 `smol-toml`、provenance 付き）
  3. official build の manifest 取得を 3 回 retry し、install 後に `node --version` と tool-cache のディレクトリ名を照合する
- `@actions/cache` 6.3.0 で runner の `ACTIONS_CACHE_MODE` を読むようになった（未設定なら従来どおり）
- dist を前後で比べ、URL ホストの集合は不変、`eval` / `new Function` は 0 件、`child_process` の参照数は同数
- 当方への影響: 全 workflow が `node-version: "24"` を指定し、version file を使わない。通常の workflow は `cache: "pnpm"` を明示し、
  `.lock.yml` は `package-manager-cache: false`。`registry-url` / `NODE_AUTH_TOKEN` は使っていない。新しい版照合は CI green で通っている
- 配布側: release author `v-gowridurgad` は v7.0.0 / v6.4.0 と同じ人。commit verified
- **release は 2026-10-08T02:52Z で、起票時点（10-14T05:59Z）では 6 日 3 時間**（後述「cooldown の観測」）

#### #3185 `actions/download-artifact` 8.0.1 → 8.0.2

**判定: low / 却下。パッケージに問題は無いが、PR の差分が生成物の部分編集だけで構成されている。**
`@dependabot ignore` は設定しない（却下の理由は版ではなく diff の形にあるため）。

- 差分（5 commits / 22 files）: `action.yml` は不変。`@actions/artifact` 6.3.1（upload と同じ 429 対応）、`@octokit/request` 10.0.8
  経由で `json-with-bigint` 3.5.3（MIT、JSON の stringify / parse の置き換えで、ネットワーク・env・exec のコードは無い）、
  `@azure/storage-blob` 12.31.0。新しい URL の追加なし
- release 2026-10-07T10:09Z。既知の GHSA-cxww-7g56-2vh6 は `>= 4.0.0, < 4.1.3` で該当しない

### #3187 `github/gh-aw-actions/setup` 0.89.21 → 0.91.5

**判定: low / 却下。規則（ADR-2753）どおり bot PR は閉じる。今回は再生成 PR も作らない。**

- CI の red は `gh-aw-lock-consistency.test.ts` の 2 テストだけ（job ログで確認。他の 53 test file は pass）
- sha は本物: annotated tag `v0.91.5`（tagger `github-actions[bot]`）の commit と一致
- **v0.89.21 より後の `gh aw` CLI はすべて prerelease**（v0.89.22、v0.90.x、v0.91.0〜v0.91.12）。`releases/latest` は v0.89.21 を
  返す。gh-aw-actions 側は全版を prerelease=false で出すため、Dependabot はこの区別がつかない。前回（ADR-3069）と同じ構図
- cooldown を満たす正式版の最新は v0.89.21 で、現行の pin と同じなので、再生成する版が無い
- 将来の再生成で 2 つの workflow に当たりうる変更（release notes から。両 workflow が `sandbox` / `github-app` / `post-steps` /
  `runtimes` / `mcp-servers` を使わないことは grep で確認）:
  - v0.90.3「`add-comment` は triggering target を解決できないと失敗する」: 両 workflow は `workflow_dispatch` で
    `add-comment: target: "*"` を使う。agent が番号を指定するので影響しない見込みだが未確認
  - v0.91.5「threat-detection の provider 設定を engine ごとに分離」: 当方は `threat-detection.engine` を
    `copilot/claude-haiku-4.5` に固定しているので、再生成時に detection job を確認する
  - v0.91.5「action pin の対応表を compiler 生成 workflow にも適用」: `.lock.yml` の `actions/*` の pin が動く
- advisory: gh-aw の 11 件と gh-aw-actions の 1 件は、すべて影響範囲が ≤ 0.89.17

### #3191 `@radix-ui/react-tabs` 1.1.21 → 1.1.22 / #3194 `@radix-ui/react-dropdown-menu` 2.1.24 → 2.1.25

**判定: low / 採用。ただし bot PR のままでは同じ primitive が 2 版ずつ並ぶので、`react-dialog` / `react-tooltip` を含む 4 件を
1 コミットで上げる差し替え PR で入れる。**

変更内容（radix-ui/primitives の各 package の CHANGELOG）:

- tabs 1.1.22: `Tabs.Trigger` が state を変える前に focus を移す（Content 内要素の blur が先に発火する）。karasu は
  `Tabs.Content` を使っていない（EditTabBar / DiagramTabBar / ReferenceContent は Trigger のみ）
- menu 2.1.25 / focus-scope 1.2.0: modal layer の中に portal された非 modal layer が focus を奪い返されて操作できなくなる
  不具合の修正（`FocusScopeBranchProvider` の追加）
- slot 1.4.0: `aria-describedby` の結合と RSC 互換。コード差分は `concatAriaDescribedby` の追加だけ

**版が割れる理由**: `packages/app` の Radix 依存は dialog / dropdown-menu / tabs / tooltip の 4 件で、どれも primitive を exact pin
で持つ。bot は 1 件ずつ PR を作るので、#3194 をマージすると `react-dialog@1.1.23` と `react-tooltip@1.2.16` が持つ旧版と並び、
`react-primitive` 2.1.10 / 2.1.11、`react-slot` 1.3.3 / 1.4.0、`react-dismissable-layer` 1.1.19 / 1.1.20、`react-focus-scope`
1.1.16 / 1.2.0 などが 2 版ずつ lock に入る（pr-3194 の lock で確認）。

DismissableLayer の layer stack と body の `pointer-events` の退避・復元、FocusScope の stack は module 単位で持たれている。
版が 2 つあると「Escape 1 回で両方の layer が閉じる」「Dropdown から Dialog を開いたあと body が `pointer-events:none` のまま残る」
などが起こりうる（推論で、再現はしていない）。**現行コードにはその経路が無い**: Dialog を使う 6 ファイル（Translate / Share /
CommandPalette / SnapshotPicker / PasteCompare / ProjectPicker）は Dropdown / Tooltip / Tabs を含まず、Dropdown の item から Radix
Dialog は開かず、Tooltip は EditPaneToolbar にしか無い。実害は低いが、組み合わせが生まれた時点で黙って壊れる種類の潜在リスクである。

**揃える先**: 同じ release train（2026-10-05T23:08〜23:10Z、cooldown 充足）で `react-dialog@1.2.0` と `react-tooltip@1.3.0` が出ており、
`npm view` の依存は slot 1.4.0 / primitive 2.1.11 / dismissable-layer 1.1.20 / focus-scope 1.2.0 で tabs 1.1.22 / dropdown-menu 2.1.25
と一致する（tooltip 1.3.0 は `react-visually-hidden` 1.2.12 を持ち込む）。10-12 の次の train（dialog 1.3.x / tooltip 1.4.x）は
cooldown 未達で対象外。dialog / tooltip の bot PR が出ていないのは、npm の `open-pull-requests-limit: 8` が今回の 8 件で埋まった
ためと推定する（未確認）。

**再発防止**: `.github/dependabot.yml` に `@radix-ui/*` の group を足す。exact pin の相方を同時に動かす必要がある組は、枠ではなく
groups で結ぶという ADR-2671 の方針（react / lsp / vitest group と同じ型）に当たる。差し替え PR に同梱する。

供給側: 全 Radix の to 版が GitHub Actions + provenance で from と同じ、install script なし、peerDependencies 不変（React 19.3 は範囲内）。
差分は source map 以外は小さく、危険パターンなし。

### #3188 `vitest` / `@vitest/coverage-v8` 5.0.2 → 5.0.3

**判定: low / 採用。** bug fix のみ（browser / cache / vm、jsdom 30.1 の Blob 対応など）。

- **`why-is-node-running` が 3.2.2 → 3.2.1 に下がるのは upstream の意図した pin**。vitest 5.0.3 は依存を `^3.2.1` から exact の
  `3.2.1` に変えた（commit f6c9a4977「pin `why-is-node-running` to `3.2.1` to avoid users running into `ERR_PNPM_TRUST_DOWNGRADE`」）。
  3.2.1 は provenance 付きで 3.2.2 は無い（publisher はどちらも `jkoops`）。3.2.2 の差分は WeakRef 化と stack 取得の変更だけで、
  deprecated でもない。当方は `trustPolicy` を設定していないので、元々この問題には当たっていない
- vitest は oxc への移行で chunk 名が総入れ替えになり diff は約 65k 行。tarball を展開して危険パターンを数え直し、`child_process`
  11/11、`new Function` 1/1、`fetch(` 6/6、`atob(` 1/1 と 5.0.2 と同数。bin / scripts の差分なし
- 移動した transitive: `chai` 6.3.0（`keys()` の重複キー修正）、`std-env` 4.3.0（Copilot agent の検出追加）、`magic-string` 1.4.3、
  `tinybench` 6.2.1。危険パターンなし。公開日はいずれも 10-07 以前

### #3190 `@astrojs/starlight` 0.42.4 → 0.42.5（`packages/docs-site`）

**判定: low / 採用。** 0.42.5 の変更はマケドニア語の翻訳追加（#4227）だけで、npm diff は `translations/mk.js` の追加と並べ替え。

- override は `components.Footer` だけで、Default Footer を包む構造なので変更は届かない
- **CI は docs site をビルドしない**ので、PR ブランチと main でローカルビルドして比べた。install / build とも成功、73 ページ生成、
  check-links（34 ページ）pass、Pagefind は 73 HTML を索引。WARN は両方とも同じ既存の 2 件だけ
- `dist` の差分（astro の scoped class hash と generator 版表記を正規化した後）は 4 ページ（`spec/style` と
  `guide/05-communicating-diagrams` の en / ja）だけで、` ```css ` 指定のコードブロックの色付けが変わる。expressive-code が新たに
  解決する shiki 4.5.0（tm-grammars 更新）の CSS grammar によるもので、`.krs.style` の例の一部はプレーンテキストに、別の例では
  property 名の色付けが改善する。見た目だけの変化で、目視は未確認
- 移動した transitive: `@astrojs/mdx` 8.0.3、`@astrojs/markdown-satteri` 0.4.3、`@astrojs/internal-helpers` 0.12.0（js-yaml をやめて
  既存の `yaml` を使う）、`shiki` / `@shikijs/*` 4.5.0、`postcss` 8.5.29、`nanoid` 3.3.20、`es-module-lexer` 3.0.3、`mdast-util-*`。
  `@napi-rs/wasm-runtime` 1.2.5 は memfs / buffer polyfill の再 bundle で、wasm32 用の依存元からしか使われない。危険パターンなし、
  公開日はいずれも 10-07 以前

### #3189 `monaco-editor` 0.56.0 → 0.57.0（`packages/app`）

**判定: low / 採用。** 0.57.0 に Breaking Changes は無い（`wordWrapIndicator` などの追加）。

- 当方の利用（`packages/app/src/monaco-setup.ts` ほか）: `editor.defineTheme`、`languages.register` / `setMonarchTokensProvider`、
  `KeyMod` / `KeyCode`、worker は `new URL("monaco-editor/editor/editor.worker.js", import.meta.url)`。**package.json の `exports` は
  前後で完全に同一**で、worker の参照先も存在する
- **同梱 DOMPurify が 3.4.8 → 3.4.15 に上がる**。monaco は DOMPurify を `esm/vs/base/browser/dompurify/dompurify.js` に同梱しており、
  `pnpm-workspace.yaml` の override `dompurify: ^3.4.16` はこの同梱コピーには効かない。3.4.15 に残る advisory 2 件
  （GHSA-p98j-92pf-mc4p / GHSA-6688-9rhm-gjv2）はどちらも low で `IN_PLACE` モード限定、monaco の `domSanitize.js` は
  `RETURN_DOM_FRAGMENT` を使うので該当しない。0.56 同梱の 3.4.8 はより多くの advisory の範囲内にあり、この bump は改善である
- 危険パターンの増加なし。publisher `microsoft1es` で不変、provenance は前後とも無いので tarball とソースの一致は未確認

### #3193 `@anthropic-ai/sdk` 0.124.0 → 0.131.0（`packages/app`）

**判定: low / 採用。** 0.x の minor を 7 つ跨ぐが、当方の使う API には当たらない。

- 互換性に関わりうる変更: `lib/tools/CompactionControl` の削除（0.129）、pagination export の type-only 化と exports map への
  `"./lib/internal/*": null` 追加（0.127）、未使用の `idempotency` option の削除（0.125）、GA model での `betas` の deprecate（0.129）
- 当方の利用は `packages/app/src/hooks/useChatSession*` だけで、`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`、
  非 streaming の `messages.create(..., { signal })`、`APIError`、型 `MessageParam` / `ContentBlockParam` / `Tool`。tool runner /
  beta / stream / pagination は使っていない。0.131 の tarball にこれらが残ることを確認した。`MODEL = "claude-sonnet-4-6"` は deprecate
  対象（Sonnet 4.5）ではない
- diff（1683 files）の新規は生成された API resource が中心。`eval` / `new Function` / 新しいホストなし
- publisher は両版とも GitHub Actions（OIDC）+ provenance、attestation の repo / workflow / commit は tag `sdk-v0.131.0` と一致

### #3192 `@types/node` 26.6.2 → 26.6.4

**判定: low / 採用。** 型のみ（crypto の params、zlib の `pledgedSrcSize`、dgram のコメント）。`undici-types ~8.9.0` は不変、scripts は空。
publisher は `types`（DefinitelyTyped の bot）で従来どおり provenance なし、2026-10-01 公開。

### #3195 `tsx` 4.23.12 → 4.23.15

**判定: low / 採用。** bug fix のみ（transform cache の上限、Node 24 の `require(esm)` での CJS bridge 復元ほか）。`esbuild: ~0.28.0` は
不変（lock は 0.28.2、esbuild の advisory はすべて `< 0.28.1`）。dist は重複 chunk が消えて縮小、危険パターンは減少のみ。GitHub Actions
+ provenance で、attestation の commit は tag `v4.23.15` と一致。scripts / lint 用の devDependency で bundle には入らない。

## cooldown の観測

cooldown は全 semver レベル 7 日（ADR-784）だが、次の 3 件は 7 × 24 時間に満たない時点で起票された。

| PR | release | 起票 | 経過 |
| --- | --- | --- | --- |
| #3184 upload-artifact v7.0.2 | 2026-10-07T10:08Z | 2026-10-14T05:58Z | 6 日 20 時間 |
| #3185 download-artifact v8.0.2 | 2026-10-07T10:09Z | 2026-10-14T05:58Z | 6 日 20 時間 |
| #3186 setup-node v7.1.0 | 2026-10-08T02:52Z | 2026-10-14T05:59Z | 6 日 3 時間 |

Dependabot が日付単位で丸めて判定している可能性が高い（未確認）。npm 8 件は全件 7 日以上経過していた。#3184 / #3185 はこの文書の
作成時点（10-14T12Z）で 7 日を過ぎている。#3186 は 10-15T02:52Z まで待ってから差し替え PR に入れる。設定で直せる性質のものでは
ないので、今回は記録に留め、採用時に 168 時間を人が確かめる。

## 範囲外: open な security alert

トリアージ中に open の Dependabot alert を 4 件確認した。どれも transitive で、bot PR は起票されていない。

| alert | package（lock） | 依存元 | advisory | 脆弱範囲 | patched |
| --- | --- | --- | --- | --- | --- |
| #92 | `shell-quote` 1.10.0 | `launch-editor` 2.14.1 | critical: GHSA-pqg4-j6r4-53mv（`quote()` の command injection） | `>= 1.8.4, < 1.11.0` | 1.11.0 |
| #93 | `sharp` 0.35.4 | `astro` 7.3.3 | high: GHSA-wq5f-xc86-pv6w（同梱 librsvg の CVE） | `< 0.35.5` | 0.35.5 |
| #86 | `http-cache-semantics` 4.2.0 | | high | `<= 4.2.0` | 未公開 |
| #85 | `braces` 3.0.3 | | high | `<= 3.0.3` | 未公開 |

**#93 は `pnpm-workspace.yaml` の override `sharp: ^0.35.0` の floor が脆弱範囲の内側にある**（`.claude/rules/dependabot.md`
「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」の型）。#92 / #93 は patched 版が出ているので、
本トリアージとは別に `security-alert` skill の手順で扱う。#85 / #86 は前回（ADR-3069）から変わらず patched 版待ち。

## 決定

**npm 6 件は bot PR をそのままマージし、Radix 2 件は dialog / tooltip を含む 4 件を揃える差し替え PR、`actions/*` の 2 件は gh-aw の
生成物を除く差し替え PR で採用し、download-artifact と gh-aw-actions/setup は却下する。**

| PR | 判定 | 反映 |
| --- | --- | --- |
| #3195 / #3189 / #3193 / #3192 / #3188 / #3190 | 採用 | bot PR をマージ。lock が衝突するので 1 件ずつ入れ、衝突した PR には `@dependabot rebase` を掛けて CI を通し直した |
| #3191 / #3194 Radix | 採用 | bot PR を close。tabs 1.1.22 / dropdown-menu 2.1.25 / dialog 1.2.0 / tooltip 1.3.0 を 1 コミットで上げ、`dependabot.yml` に `@radix-ui/*` の `radix` group を足す差し替え PR [#3199](https://github.com/kompiro/karasu/pull/3199) で入れる。lock の全 `@radix-ui/*` が 1 版に揃い、Radix 以外の依存エッジは動かない。`@dependabot ignore` は設定しない |
| #3184 upload-artifact / #3186 setup-node | 採用 | bot PR を close。`.lock.yml` を除く workflow だけを上げる差し替え PR [#3200](https://github.com/kompiro/karasu/pull/3200) 1 本で入れる（setup-node の cooldown が満ちる 10-15T02:52Z までは draft）。`@dependabot ignore` は設定しない |
| #3185 download-artifact | 却下 | bot PR を close。`.lock.yml` は gh-aw の正式版での再生成で上がる。`@dependabot ignore` は設定しない |
| #3187 gh-aw-actions/setup | 却下 | bot PR を close。正式版の最新が現行 pin（v0.89.21）なので再生成 PR は作らない |

follow-up:

- `gh-aw-lock-consistency.test.ts` を `.lock.yml` の `gh-aw-manifest` にある全 action と `uses:` の突き合わせに広げ、
  `.claude/rules/dependabot.md` に `actions/*` の bot PR が `.lock.yml` を触るときの扱いを足す（[#3201](https://github.com/kompiro/karasu/issues/3201)）
- security alert #92 / #93 は `security-alert` skill で別に処理する

### 理由

- 採用 10 件は、publisher・provenance・lifecycle script・依存エッジ・advisory のいずれにも懸念が無かった
- Radix の 2 件は、bot が作れる 1 件ずつの diff では exact pin の相方（dialog / tooltip）を動かせず、正しい変更にならない。これは
  差し替え PR を使う典型（`.claude/rules/dependabot.md`「判定語彙」）
- `actions/*` の 3 件は版ではなく diff の形の問題で、生成物を部分編集すると manifest と食い違い、次の再生成で戻る。ADR-2753 の
  理由をそのまま適用する
- #3187 は前回と同じく、Dependabot が prerelease を区別できないことによる提案で、入れるべき正式版が無い
- #3190 は CI が docs site をビルドしないため、ローカルビルドの比較を採用の条件にした

## 却下した案

### Radix の bot PR 2 件をそのまま入れ、dialog / tooltip の提案を次の週に待つ

現行コードには版の割れで壊れる経路が無いので、実害は出ない。ただし dialog / tooltip の提案は npm の枠（8 件）が空くまで
来ない可能性があり、その間 primitive が 2 版のまま残る。group を足さない限り、次の Radix の release train でも同じ割れ方が
毎回起きる。

### `actions/*` の bot PR をそのままマージする

CI は通るが、`.lock.yml` の `uses:` と同じファイルの `gh-aw-manifest` が食い違ったまま main に入り、次の `gh aw compile` で
黙って旧版に戻る。ADR-2753 が gh-aw-actions/setup について退けたのと同じ理由で退ける。

### `actions/*` の bot PR に人手で `.lock.yml` を戻すコミットを足す

次の rebase / recreate で失われる。差し替え PR が規則上の正しい形である。

### #3187 の再生成で Dependabot の要求版 v0.91.5 を入れる

v0.91.5 は `gh aw` CLI で prerelease 扱いで、現行は正式版を使っている。v0.90 / v0.91 系に正式版が出て cooldown を満たしたら、
次の Dependabot 提案で改めて扱う。

## 残した問い

- #3190 で docs site の CSS コードブロックの色付けが一部変わる件は目視していない。docs 側のフェンスを `krs-style` に寄せれば
  この揺れは消えるが、本件の範囲外とした
