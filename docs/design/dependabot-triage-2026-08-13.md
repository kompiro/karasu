# Dependabot トリアージ 2026-08-13

- **日付**: 2026-08-13
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2463](https://github.com/kompiro/karasu/pull/2463) / [#2464](https://github.com/kompiro/karasu/pull/2464) / [#2465](https://github.com/kompiro/karasu/pull/2465) / [#2466](https://github.com/kompiro/karasu/pull/2466) / [#2467](https://github.com/kompiro/karasu/pull/2467) / [#2468](https://github.com/kompiro/karasu/pull/2468) / [#2469](https://github.com/kompiro/karasu/pull/2469) / [#2470](https://github.com/kompiro/karasu/pull/2470) / [#2471](https://github.com/kompiro/karasu/pull/2471)
  - 直前の triage: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)（peer で結ばれた依存は人手 PR で対に戻す）
  - その前の triage: [ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`

## 背景・課題

2026-08-13（木）の Dependabot バッチ。`open-pull-requests-limit: 8` に対し npm 8 件 +
github_actions 1 件の計 9 件が開いている。`dependabot/alerts` の open は 0 件で、
security update を含まない純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 9 件を upstream まで遡って
分析した。

**サプライチェーン上の懸念はゼロだった。** publisher / provenance / lifecycle script /
依存ツリーの変化 / 既知 advisory を全件確認し、install / postinstall / prepare の
新規追加も、配布主体の不審な変化も無かった。cooldown（全 semver レベル 7 日）も全件充足。
全 9 PR の diff は `package.json` + `pnpm-lock.yaml`（github_actions は workflow の
SHA 1 行）のみで、ソースへの混入は無い。

一方で **2 件が CI red**、**1 件が CI green のまま lockfile に不整合を固定する**状態で、
「そのままマージ」だけでは片付かない。ADR-2447 で学んだ peer exact pin の罠が、
今回は `@tailwindcss/vite` で再発している。

## 現状（インベントリ）

| PR | 依存 | from → to | 種別 | 適用先 | CI |
| --- | --- | --- | --- | --- | --- |
| [#2463](https://github.com/kompiro/karasu/pull/2463) | `azure/login` | 3.0.0 → 3.0.1 | patch | `.github/workflows/` ×2 | pass |
| [#2464](https://github.com/kompiro/karasu/pull/2464) | `knip` | 6.6.0 → 6.32.0 | minor | root（dev） | **fail**（Knip） |
| [#2465](https://github.com/kompiro/karasu/pull/2465) | `fflate` | 0.8.2 → 0.8.3 | patch | `packages/app`（**runtime**） | pass |
| [#2466](https://github.com/kompiro/karasu/pull/2466) | `@tailwindcss/vite` | 4.3.0 → 4.3.3 | patch | `packages/app` | pass（が不整合） |
| [#2467](https://github.com/kompiro/karasu/pull/2467) | `vscode-extension-tester` | 8.23.0 → 8.24.0 | minor | `packages/vscode-e2e` | pass |
| [#2468](https://github.com/kompiro/karasu/pull/2468) | `astro` | 7.1.6 → 7.2.0 | minor | `packages/docs-site` | **fail**（ADR assumption） |
| [#2469](https://github.com/kompiro/karasu/pull/2469) | `commander` | 14.0.3 → 15.0.0 | **major** | `packages/cli`（runtime） | pass |
| [#2470](https://github.com/kompiro/karasu/pull/2470) | `@testing-library/user-event` | 14.6.1 → 14.6.3 | patch | `packages/app`（dev） | pass |
| [#2471](https://github.com/kompiro/karasu/pull/2471) | `@vscode/test-cli` | 0.0.10 → 0.0.15 | 0.0.x | `packages/vscode-e2e` | pass |

（`Playwright` の pending は path filter による skip 用 stub。ADR-20260623-05/06 参照）

### 公開日と cooldown（基準日 2026-08-13、7 日）

| 依存 | 対象版の公開日 | 経過 | より新しい版 |
| --- | --- | --- | --- |
| `azure/login` 3.0.1 | 2026-08-04 | 9 日 | — |
| `knip` 6.32.0 | 2026-08-06 | 7 日 | 6.32.1 (08-10) / 6.32.2 (08-11) — cooldown 内 |
| `fflate` 0.8.3 | 2026-05-16 | 89 日 | — |
| `@tailwindcss/vite` 4.3.3 | 2026-07-16 | 28 日 | — |
| `vscode-extension-tester` 8.24.0 | 2026-08-03 | 10 日 | — |
| `astro` 7.2.0 | 2026-08-06 | 7 日 | 7.2.1 (08-11) — cooldown 内 |
| `commander` 15.0.0 | 2026-05-29 | 76 日 | — |
| `@testing-library/user-event` 14.6.3 | 2026-08-03 | 10 日 | 14.6.4 (08-11) — cooldown 内 |
| `@vscode/test-cli` 0.0.15 | 2026-06-22 | 52 日 | — |

全件 7 日を満たす。より新しい版が offer されていないのは cooldown が効いているためで、
次回バッチで追いつく。

### なぜ木曜に届いたのか

`.github/dependabot.yml` は `interval: weekly` / `day: monday` なので、素直に読めば
木曜にバッチは来ない。実際の Dependabot update job（`event=dynamic`）の履歴を見ると
理由が分かる。

```
2026-08-13T13:36:51Z  Thursday   ← 本バッチ 9 件を作った run
2026-08-10T22:43:43Z  Monday
2026-08-10T21:43:43Z  Monday     ← weekly スケジュール枠
2026-08-03T21:43:50Z  Monday     ← weekly スケジュール枠
2026-07-27T21:43:53Z  Monday     ← weekly スケジュール枠
```

**weekly の枠は毎週月曜 21:43 UTC 前後に固定されている**（08-03 / 08-10 / 07-27 が
いずれも 21:43）。本バッチを作った木曜 13:36 UTC の run はその枠ではなく、
**スケジュール外の re-run** である。ログを遡ると火・水・木・金・土・日いずれの曜日にも
full manifest の run が出ており、このリポジトリでは以前から日常的に起きている。

そのうえで「なぜ今まとめて 9 件なのか」は 2 つの要因が重なっている。

1. **月曜から PR 枠が満杯だった。** 月曜 08-10 の run が npm 枠 8 を使い切り、
   最後まで残った [#2432](https://github.com/kompiro/karasu/pull/2432) /
   [#2433](https://github.com/kompiro/karasu/pull/2433)（LSP 9 → 10。ADR-2447 で
   [#2337](https://github.com/kompiro/karasu/issues/2337) に畳んで保留）が
   **2026-08-12 15:27 に close** されて初めて枠が空いた。その後の最初の full run が
   本バッチ。上の cooldown 表のうち 7 件（`fflate` / `commander` / `@vscode/test-cli` /
   `@tailwindcss/vite` / `user-event` / `vscode-extension-tester` / `azure/login`）は
   **月曜時点で既に cooldown を満たしていたのに枠が無くて出せなかった**もの。
2. **残り 2 件は本日ちょうど cooldown が明けた。** `astro` 7.2.0 と `knip` 6.32.0 は
   どちらも 2026-08-06 公開で、適格になるのは 08-06 + 7 = 08-13。
   月曜には原理的にオファーできなかった。

**つまりスループットの律速はスケジュールではなく `open-pull-requests-limit`。**
月曜に枠を使い切る → 消化するまで新規は出ない → 空いた直後の run でまとめて届く、
という挙動になる。ADR-2447 が「バッチ途中で limit を 8 に上げたら同じ日に第 2 弾が
3 件届いた」と記録したのと同じ現象が、今回は「保留 PR を閉じた翌日に 9 件」という
形で出ている。

この観察は運用上 2 つの含みを持つ:

- **保留 PR を開いたまま放置すると、その分だけ次のバッチが遅れる。** #2432 / #2433 を
  2 日間開けておいた結果、cooldown を 2 か月以上前に満たしていた `fflate` や
  `commander` の offer もその間止まっていた。保留の判断をしたら
  （ADR-2447 のように）Issue に畳んで **PR は閉じる**のが枠を空ける意味でも正しい。
- **バッチが来た曜日から中身を推測しない。** 木曜に届いたからといって
  「臨時の security update」ではない。曜日は枠が空いたタイミングを反映しているだけで、
  緊急度の指標にはならない。

> off-schedule run そのものの発火条件は GitHub が公開していないため、
> 「枠が空いたこと」が直接のトリガかどうかは断定しない。確実なのは、
> 枠が空いていなければこの run も PR を作れなかったという点。

## 制約・前提

- 判断は「マージ可否」まで。実際の反映（マージ / close / 人手 PR）はユーザーの採否決定後。
- `packages/cli` は npm 公開パッケージ（`karasu`）なので、その依存の major は
  利用者の実行環境に波及する。
- CI red の 2 件はいずれも **upstream の欠陥ではなく repo 側の gate** が原因。
  この区別を判断の軸にする。

## リスク分析（全 9 件）

### 共通で確認したこと

1. **lifecycle script**: 全 8 npm パッケージの `scripts` を対象版で取得。
   `install` / `postinstall` / `preinstall` は **1 件も存在しない**
   （`hasInstallScript: false`）。`prepack` を持つのは `@vscode/test-cli` /
   `vscode-extension-tester` / `fflate` の 3 件だが、いずれも publish 時のビルドで
   consumer 側では走らない。
2. **依存ツリーの変化**: `pnpm-lock.yaml` の `packages:` キー集合を peer suffix を
   剥がして base と比較し、**名前ごと新規に増えたパッケージ**を抽出した
   （解決版の集合比較では既存グラフ内の版への乗り換えを見落とすため）。
   新規に現れた名前は延べ 25 件で、うち見慣れないものは 2 件のみ:
   - `chunk-data@0.1.0` — sindresorhus、2025-10-20 初版。`got@15` の依存。
   - `tagged-tag@1.0.0` — sindresorhus、2024-05-03 初版。`type-fest@5` の依存。

   いずれも `got` / `type-fest` の正規の依存チェーン上にあり、typosquat ではない。
   残りは `enhanced-resolve` / `string-width` / `wrap-ansi` / `jiti` /
   `uint8array-extras` / `smol-toml` など既知の常用パッケージ。
3. **advisory**: 8 パッケージすべて GitHub Advisory を照会。`astro` 以外は 0 件。
   `astro` の既知 advisory は最新でも `first_patched: 7.1.0`（`< 7.0.6` 系が中心）で、
   **現行の 7.1.6 に影響する未修正 advisory は無い**。今回の 7.2.0 は security fix ではない。
4. **provenance**: `@testing-library/user-event@14.6.3` と `astro@7.2.0` は SLSA
   provenance attestation あり。他 6 件は無し（前版も同様で、今回の変化ではない）。

### #2463 `azure/login` 3.0.0 → 3.0.1 — risk: low

- 変更は 1 PR のみ: [Azure/login#599](https://github.com/Azure/login/pull/599)
  「Escape single quotes in PowerShell login script inputs」。
  入力値のクォート漏れによるスクリプト注入を塞ぐ **hardening 修正**で、
  こちらが取り込むべき方向の変更。
- repo は SHA pin 運用。bot の書き換え先
  `f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca` が annotated tag `v3.0.1` の指す
  commit と一致することを `git/tags` の dereference で確認済み。
  **タグの付け替えでも別 commit の混入でもない。**
- 適用先は `vscode-release.yml` と `azure-identity-bootstrap.yml`。
  いずれも OIDC で Entra ID にログインする箇所で、PowerShell 経路は使っていないが
  修正を入れて損はない。

**推奨: マージ**

### #2465 `fflate` 0.8.2 → 0.8.3 — risk: low

`packages/app` の **runtime 依存**（`import-project-zip.ts` /
`export-project-zip.ts` / `inline-share.ts`）なので最も慎重に見た。

- 2024-02-07 → 2026-05-16 と 2 年超の間隔、かつ maintainer は `101arrowz` 単独。
  版としては「久しぶりのリリース」で、通常なら警戒対象。
- tarball 差分を取得して確認した結果は **CHANGELOG どおりの内容**:
  Zip64 extra field の buffer over-read 修正、`Z_SYNC_FLUSH` 対応、
  cross-realm `Uint8Array` での `zip`/`zipSync` 修正、TS 5.7+ の型修正、
  圧縮ストリーム完了後のメモリ削減。`package.json` の変化は
  `exports` への `"./package.json"` 追加と devDependencies の更新のみ。
- 差分に `eval` / `Function()` / `fetch` / 外部 URL / `process.env` /
  `child_process` の**新規**混入は無い。grep が拾った `worker_threads` と
  `new Worker(..., {eval: true})` は 0.8.2 にも存在する fflate 既存の
  非同期ワーカー実装で、UMD バンドル再生成により差分行として現れただけ。
- npm の `time` を見ると `0.4.9` / `0.5.4` / `0.6.11` / `0.7.5` に
  2026-07-20 の timestamp が付いている（旧 minor 系列それぞれの最終 patch）。
  ただし **karasu が使う 0.8.3 は 2026-05-16 published で、
  GitHub の release `v0.8.3`（2026-05-16, author `101arrowz`）と一致**する。
  旧系列への backport publish と解釈でき、対象版の素性には影響しない。
- **Zip64 buffer over-read 修正は、app が読む zip が信頼できない入力である
  以上こちら側にも利のある修正**。取り込む理由が積極的にある。

**推奨: マージ**

### #2470 `@testing-library/user-event` 14.6.1 → 14.6.3 — risk: low

- publisher が `kentcdodds` 等の個人から **`GitHub Actions`（trusted publishing）**
  に変わり、SLSA provenance が付いた。Dependabot は「a new releaser」と警告するが、
  これは**配布経路の強化であって劣化ではない**。
- 差分は dist 全体の再ビルド（TS の downlevel 出力差）と README 更新が大半。
  混入パターンの grep はヒット無し（拾ったのは `offset ?? ...` の downlevel 展開）。
- `dependencies` は空のまま。lockfile の変化も本体 1 行のみ。

**推奨: マージ**

### #2471 `@vscode/test-cli` 0.0.10 → 0.0.15 — risk: low

- Dependabot が「`microsoft1es` a new releaser」と警告する。これは Microsoft の
  1ES（One Engineering System）リリースパイプラインのアカウント
  （`npmjs@microsoft.com`）で、既存の `vscode-bot` と並ぶ **Microsoft 組織の
  正規 publisher**。乗っ取りを示す兆候ではない。
- CHANGELOG は 0.0.12 までしか無く 0.0.14 / 0.0.15 の記載が欠けるので tarball 差分を確認。
  **コード差分は mocha 10→11 API 追従のみで、実質は依存更新**:
  `c8` 9→11 / `chokidar` 3→5 / `glob` 10→13 / `minimatch` 9→10 / `mocha` 10→11 /
  `yargs` 17→18 / `supports-color` 9→10。加えて `overrides` に
  `diff: ^8.0.4` と `serialize-javascript: ^7.0.6` を追加（既知脆弱版の締め出し）。
- `engines` が `node >= 18` → **`node >= 22`** に上がる。CI は全 workflow が
  Node 24 なので影響なし。
- lockfile では `glob@7/8` `minimatch@3/5` `inflight` `fs.realpath` 等の
  古い transitive **18 件が消える**。依存グラフは縮む方向。

**推奨: マージ**

### #2467 `vscode-extension-tester` 8.23.0 → 8.24.0 — risk: low

- Red Hat の release。`--locale` 対応、`extester.config.json` 対応、
  custom page object 対応、welcome screen skip 修正など。
  リリースノートの内容と依存更新の範囲が一致している。
- lockfile 新規は `got@15` 系（`chunk-data` / `lowercase-keys` / `type-fest@5` /
  `tagged-tag` / `uint8array-extras`）と `yargs@18` 系（`cliui` / `string-width` /
  `wrap-ansi` / `get-east-asian-width`）。すべて既知チェーン。
- `js-yaml` は `5.2.3` を新たに引くが、これは `vscode-extension-tester` 自身の
  `js-yaml: ^5.2.2` 宣言によるもの。[ADR-20260618-02](https://github.com/kompiro/karasu/pull/1676) で
  排除した `js-yaml@3.14.2` の再導入では**ない**（3.x は復活していない）。
- `packages/vscode-e2e` 専用の devDependency で、配布物には載らない。
- 注記: aarch64 の devcontainer では ExTester をローカル実行できないため、
  検証は CI の ExTester ジョブに依存する（本 PR では pass 済み）。

**推奨: マージ**

### #2469 `commander` 14.0.3 → 15.0.0 — risk: medium（互換性）

サプライチェーン面は clean（maintainer 変化なし、依存ゼロ、lifecycle script なし、
lockfile 追加は `commander@15.0.0` 1 件のみ）。判断が要るのは **major の互換性**。

upstream の breaking change は 3 つ:

1. **ESM only 化**（CJS 実装を廃止）
2. **Node.js v22.12.0 以上が必須**（`require(esm)` のため）
3. `--no-*` オプションの既定値挙動: 正負両方のオプションを定義した場合、
   単独の `--no-*` のときだけ既定 `true` を設定する

karasu 側の適合性:

| 観点 | 状態 |
| --- | --- |
| ESM | `packages/cli` は `"type": "module"`、esbuild も `--format=esm`。`commander` は `--external:commander` でバンドル外なので ESM import がそのまま走る。**問題なし** |
| Node 版 | build target は `node22`。CI は Node 24。**ただし `packages/cli` に `engines` 宣言が無い** |
| `--no-*` | `packages/cli/src` で `commander` を使うのは `index.ts` と `translate/cli-options.ts`。正負ペアのオプション定義は使っていないため影響なし |

残る論点は **`engines` の欠落**。`karasu` は npm 公開パッケージなので、
Node 22.0〜22.11 の利用者が入れると実行時に落ちる。実害は小さい
（22.12 は 2024-12 リリースで、22.x の LTS 系列としては十分に枯れている）が、
`engines: { "node": ">=22.12" }` を `packages/cli/package.json` に足しておくと
npm 側で警告が出せる。

**推奨: マージ + `engines` 追記**（追記は同 PR でも別 PR でも可。下記「方針」参照）

### #2466 `@tailwindcss/vite` 4.3.0 → 4.3.3 — risk: medium（**ADR-2447 の再発**）

サプライチェーン面は clean。問題は **CI green のまま lockfile に不整合を固定する**こと。

- `packages/app/package.json` は `@tailwindcss/vite: ^4.3.0` と
  `tailwindcss: ^4.3.0` を **両方** 宣言している。
- `@tailwindcss/vite@4.3.3` の依存は `tailwindcss` の **exact pin `4.3.3`**
  （`@tailwindcss/node@4.3.3` / `@tailwindcss/oxide@4.3.3` も同様）。
- bot PR は `@tailwindcss/vite` だけを `^4.3.3` に上げるので、
  manifest に残った `tailwindcss: ^4.3.0` は 4.3.0 に解決されたままになる。

実際の lockfile を確認した結果:

```
base (origin/main):   tailwindcss@4.3.0             （1 つ）
PR #2466 head:        tailwindcss@4.3.0             ← app importer が ^4.3.0 → 4.3.0
                      tailwindcss@4.3.3             ← @tailwindcss/vite@4.3.3 の exact pin
```

**CSS エンジンが 2 版同居する。** `strict-peer-dependencies` を有効にしていないので
install も CI も通るが、Vite プラグインが読む Tailwind と app が宣言する Tailwind が
食い違った状態が lock に焼き付く。これは ADR-2447 で
`@vitest/coverage-v8` / `vitest` について下した判断と**同じ形**。

ADR-2447 の結論「peer / exact pin で結ばれた依存は片方だけ取らず、
相手側の宣言も一緒に動かす」をそのまま適用する。

**推奨: bot PR は close し、`@tailwindcss/vite` と `tailwindcss` を
両方 `^4.3.3` に上げる人手 PR を出す**

### #2468 `astro` 7.1.6 → 7.2.0 — risk: low（upstream）／要 repo 側修正

サプライチェーン面は clean。SLSA provenance あり。7.2.0 の中身は
`astro preview --background` 追加、`logger.entrypoint` の相対パス対応、
`AstroPrerenderer.render()` の戻り値型の拡張など。`packages/docs-site` は
`astro build` でしか使っていないので機能面の影響は無い。

lockfile では `rollup@4.62.0` と各プラットフォーム binding、`shiki@4.4.2` /
`@shikijs/*` が **38 件消える**（vite 8 系への集約）。新規は
`@napi-rs/wasm-runtime` / `smol-toml` の 2 件のみ。依存グラフは縮む。

**CI fail の原因は upstream ではなく repo 側の ADR assumption**:

```
✗ ADR-2447 :: grep: packages/docs-site/package.json :: "astro": "\^7.1.6"
  — pattern not found
```

前回の triage で書いた [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md) の
assumption が **astro のバージョンを完全一致で grep している**ため、
次に astro が上がった瞬間に必ず落ちる。今回まさにそれが起きた。

これは assumption の書き方の問題で、2 段階の対処がありうる:

1. **最小**: ADR-2447 の assumption を `"astro": "\^7.2.0"` に更新する。
   → 次の astro bump でまた落ちる。
2. **恒久**: そもそも「astro が特定版である」ことは ADR-2447 の**決定内容ではない**
   （ADR-2447 の決定は「PR 枠を 8 に広げる」「peer 依存は対で動かす」であり、
   astro 7.1.6 は単に採用した bump の 1 つ）。バージョン追跡が目的の
   assumption ではないので、`docs-site` の astro assumption 自体を**削除**するのが筋。
   同 ADR の `lucide-react` / `oxfmt` / `vitest` の assumption も同じ性質を持つが、
   `vitest` と `oxfmt` は「9 manifest を揃えた」「整形を同梱した」という
   **決定そのもの**を守る assumption なので残す価値がある。

**推奨: assumption を修正したうえでマージ**（案 2 を推す。下記「方針」参照）

### #2464 `knip` 6.6.0 → 6.32.0 — risk: low（upstream）／要 repo 側クリーンアップ

サプライチェーン面は clean（maintainer は `webpro` 単独で変化なし、
lifecycle script なし、新規 transitive は `get-tsconfig` / `jiti` / `smol-toml` の
既知 3 件のみ、残りは `oxc-parser` / `oxc-resolver` の binding 更新）。

**CI fail の原因は knip 6.7.0 の breaking change**:

> - Dropped `--include-libs` → this is now the default and only behavior
> - Dropped `--isolate-workspaces` → this is now the default and only behavior

検出範囲が広がった結果、`pnpm knip` が 22 件を報告して落ちる:

| 種別 | 件数 | 内容 |
| --- | --- | --- |
| Unlisted dependencies | 3 | `packages/vscode-e2e` の 3 ファイルが `vscode` を import（workspace isolation が既定になったため露出） |
| Unused exports | 2 | `RECOGNIZED_RESOURCE_OPERATIONS`, `CLIENT_RESOURCE_KINDS` |
| Unused exported types | 17 | `SystemViewData` / `NodePorts` / `ExpandedFrame` / `TarEntry` 他 |
| Configuration hints | 4 | `@resvg/resvg-wasm` を `ignoreDependencies` から外せる、等 |

**ここで重要なのは、この状態が bot PR を close しても回避できないこと。**
`package.json` の宣言は既に `"knip": "^6.6.0"` の **caret** であり、
6.32.0 は range 内にある。今 6.6.0 に留まっているのは lockfile が
そう固定しているからにすぎない。**次に何らかの理由で lock が再解決されれば、
この PR とは無関係に同じ 22 件が噴き出す。** 先送りしても消えない負債で、
むしろ「原因が特定できている今」が片付けどき。

クリーンアップの中身自体は難しくない（未使用 export の削除か
`knip.json` への意図的な除外、`vscode` の `ignoreDependencies` 追加）が、
19 件の要否判断は依存分析であって bot PR に混ぜる作業ではない。

**推奨: bot PR は close し、knip 6.32.0 への追従 + 検出結果の棚卸しを
1 本の人手 PR（または follow-up Issue）で行う**

## 現時点の方針

**9 件中 6 件をそのままマージ、1 件は assumption 修正を添えてマージ、
2 件は bot PR を close して人手 PR に置き換える。却下はゼロ。**

| PR | 依存 | 判断 | 反映方法 |
| --- | --- | --- | --- |
| #2463 | `azure/login` 3.0.1 | 採用 | そのままマージ |
| #2465 | `fflate` 0.8.3 | 採用 | そのままマージ |
| #2467 | `vscode-extension-tester` 8.24.0 | 採用 | そのままマージ |
| #2470 | `@testing-library/user-event` 14.6.3 | 採用 | そのままマージ |
| #2471 | `@vscode/test-cli` 0.0.15 | 採用 | そのままマージ |
| #2469 | `commander` 15.0.0 | 採用 | マージ + `packages/cli` に `engines: node >=22.12` |
| #2468 | `astro` 7.2.0 | 採用 | ADR-2447 の astro assumption を削除してからマージ |
| #2466 | `@tailwindcss/vite` 4.3.3 | 採用（bot PR は close） | 人手 PR で `tailwindcss` も `^4.3.3` に |
| #2464 | `knip` 6.32.0 | 採用（bot PR は close） | 人手 PR で 6.32.0 + 検出 22 件の棚卸し |

却下はゼロなので `@dependabot ignore` は設定しない。

### 判断の軸

**CI red / green は upstream の健全性を測っていない。** 今回それが 3 回出た:

- #2468 と #2464 は red だが、原因はどちらも **repo 側の gate**
  （ADR assumption の書き方、knip の検出範囲拡大）で、upstream は健全。
  red を理由に却下すると、直すべき自分側の問題を先送りすることになる。
- #2466 は green だが、**lockfile に Tailwind の二重化を固定する**。
  green を理由にそのままマージすると、upstream が保証しない組み合わせが残る。

したがって判断は「CI の色」ではなく
「**upstream に問題があるか / 自分側に直すべきものがあるか**」で分ける。
前者が却下・保留の理由になり、後者は**直してから採用**する。

### #2468 の assumption 削除について

ADR-2447 の `assumptions` から
`grep: packages/docs-site/package.json :: "astro": "\^7.1.6"` を**削除**する案を推す。

- ADR-2447 の決定は「`open-pull-requests-limit` を 8 に上げる」と
  「peer で結ばれた依存は対で動かす」。astro 7.1.6 の採用はその決定の帰結ではなく、
  同じバッチで処理した独立の 1 件にすぎない。
- assumption は「その ADR の決定が今も成り立っているか」を検査するもの。
  依存の**現在版を追跡する**装置ではない。バージョン完全一致の grep を置くと、
  正常な依存更新のたびに ADR が false-positive で落ちる。今回がその実例。
- 同 ADR の `lucide-react` も同じ性質なので、あわせて削除するのが一貫する。
  一方 `open-pull-requests-limit: 8`（決定そのもの）、`vitest ^4.1.10` /
  `oxfmt ^0.62.0`（「9 manifest を揃えた」「整形を同梱した」という決定の検査）は残す。

この整理は今回のバッチ限りの話ではなく、**今後の triage ADR で
「単に採用した bump のバージョン」を assumption に書かない**という運用に効く。
ADR 昇格時に本 ADR の決定として明記する。

### 実装の指針（採否決定後）

1. そのままマージする 5 件（#2463 / #2465 / #2467 / #2470 / #2471）を
   `gh pr checks` 確認のうえ squash merge。
2. #2469 をマージし、`packages/cli/package.json` に
   `"engines": { "node": ">=22.12" }` を追加する PR を出す
   （commander 15 の Node 要件に合わせる）。
3. ADR-2447 の `assumptions` から astro / lucide-react の版追跡 grep を削除し、
   `pnpm exec adr check-assumptions` が green になることを確認してから #2468 をマージ。
4. #2466 を close し、`packages/app/package.json` の `@tailwindcss/vite` と
   `tailwindcss` を同時に `^4.3.3` に上げる PR を出す。
   `pnpm install` 後に lockfile へ `tailwindcss@4.3.0` が残らないことを確認する。
5. #2464 を close し、knip 6.32.0 追従 PR（または follow-up Issue）を起こす。
   検出 22 件それぞれについて「消す / `knip.json` で意図的に除外する」を判断する。
6. ADR 昇格: 本 Design Doc を `docs/adr/<PR番号>-dependabot-triage-2026-08-13.md`
   に昇格し、同じ PR で本ファイルを削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `commander` 15 により `karasu` CLI の必要 Node が
  22.12 以上になる（実質 22.x LTS の後半以降）。それ以外は dev / build 依存で
  配布物に影響しない。`fflate` は app の runtime 依存だが patch で API 変化なし。
- ドキュメント更新: なし（`docs/release.md` の運用に変更なし）。
- テスト・examples への影響: なし。knip 追従 PR で未使用 export を削除する場合、
  その範囲でコード変更が生じる。

## 未解決の問い / 決めないこと

- **knip の 22 件をどこまで消すか**は本 Design Doc では決めない。
  bot PR を close して人手 PR / Issue に送る、という切り分けだけを決める。
- **`packages/cli` の `engines` 追加を #2469 と同 PR にするか別 PR にするか**は
  ユーザーの好みに委ねる。Dependabot のブランチに直接コミットすると
  bot が recreate したときに失われるため、別 PR を推す。
- ADR-2447 の assumption を削るか更新するかは上記のとおり**削除**を推すが、
  「版を追跡し続けたい」意図が元々あったなら更新に倒してもよい。
