---
id: ADR-2983
title: Dependabot トリアージ 2026-09-29：jsdom 30.1.0 は upstream の regression なので差し替えず 30.1.1 の bot 提案を待ち、@types/vscode 1.138 は ExTester の上限まで保留する
status: accepted
date: 2026-09-29
topic: build
related_to:
  - ADR-2782
  - ADR-2562
  - ADR-2671
  - ADR-2474
  - ADR-2152
  - ADR-784
  - ADR-2839
  - ADR-2877
scope:
  packages: [app, docs-site, vscode, vscode-e2e]
  concerns: [ci, dependencies]
assumptions:
  - "file: scripts/ci/vscode-version-policy.test.ts"
  - "grep: .github/workflows/docs-preview.yml :: Bot"
---

# ADR-2983: Dependabot トリアージ 2026-09-29：jsdom 30.1.0 は upstream の regression なので差し替えず 30.1.1 の bot 提案を待ち、@types/vscode 1.138 は ExTester の上限まで保留する

- **日付**: 2026-09-29
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2983](https://github.com/kompiro/karasu/pull/2983)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2971](https://github.com/kompiro/karasu/pull/2971) / [#2972](https://github.com/kompiro/karasu/pull/2972) / [#2973](https://github.com/kompiro/karasu/pull/2973) / [#2974](https://github.com/kompiro/karasu/pull/2974) / [#2975](https://github.com/kompiro/karasu/pull/2975) / [#2976](https://github.com/kompiro/karasu/pull/2976) / [#2977](https://github.com/kompiro/karasu/pull/2977) / [#2978](https://github.com/kompiro/karasu/pull/2978)
  - VS Code floor と ExTester の `vscode-max`: [ADR-2782](2782-vscode-floor-capped-by-extester.md)
  - `types == engines` の追随規則: [ADR-2562](2562-dependabot-triage-2026-08-17.md)
  - vitest group（exact peer を同一 PR に束ねる）: [ADR-2671](2671-dependabot-triage-2026-08-31.md)
  - 差し替え PR の語彙と「rebase だけでは差し替えない」: [ADR-2474](2474-dependabot-replacement-pr-vocabulary.md)、[ADR-2152](2152-dependabot-triage-2026-07-27.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 週次 workflow の schedule 停止: [ADR-2839](2839-pause-dependabot-triage-schedule.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-09-28（月）の weekly バッチ。npm 8 件で、github-actions は 0 件、`security` ラベルもゼロの
version update バッチである。週次 workflow は ADR-2839 で schedule を止めているため所見 Issue も
PR コメントも無く、upstream の追跡を最初から行った。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `oxlint` 1.85.0（2026-09-21 15:32Z 公開、PR 起票まで 7 日 6 時間）
- publisher: from 版と to 版で変化なし。`vitest` / `@vitest/coverage-v8` / `oxlint`（`@oxlint/binding-*` 含む）/
  `tailwind-merge` / `astro` / `jsdom` は GitHub Actions の OIDC trusted publishing で SLSA provenance 付き。
  `knip`（`webpro`）と `@types/*`（`types`）は従来から provenance なしのまま
- lifecycle script（`preinstall` / `install` / `postinstall`）: to 版にも新規 transitive にも追加ゼロ
- 既知 advisory: to 版すべてで該当ゼロ
- 新しいパッケージ名が入るのは #2977 の `verkit` 1 件だけ（後述）。他は既存パッケージの版移動

CI が red なのは 2 件。#2973 は repo 側の `vscode-version-policy.test.ts` が ADR-2782 どおりに止めたもので、
#2976 は jsdom 30.1.0 の regression（upstream が 30.1.1 で修正済み）である。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#2971](https://github.com/kompiro/karasu/pull/2971) | `vitest` / `@vitest/coverage-v8`（vitest group） | 5.0.0 → 5.0.1 | patch | green | low | 採用（そのままマージ） |
| [#2978](https://github.com/kompiro/karasu/pull/2978) | `@types/node` | 26.5.0 → 26.6.2 | minor | green | low | 採用（そのままマージ） |
| [#2974](https://github.com/kompiro/karasu/pull/2974) | `tailwind-merge` | 3.6.0 → 3.7.0 | minor | green | low | 採用（そのままマージ） |
| [#2972](https://github.com/kompiro/karasu/pull/2972) | `oxlint` | 1.82.0 → 1.85.0 | minor ×3 | green | low | 採用（そのままマージ） |
| [#2975](https://github.com/kompiro/karasu/pull/2975) | `knip` | 6.33.0 → 6.37.0 | minor ×4 | green | low | 採用（そのままマージ） |
| [#2977](https://github.com/kompiro/karasu/pull/2977) | `astro` | 7.3.1 → 7.3.3 | patch ×2 | green（docs build は CI 外、ローカルで確認済み） | low〜medium | 採用（そのままマージ） |
| [#2976](https://github.com/kompiro/karasu/pull/2976) | `jsdom` | 30.0.1 → 30.1.0 | minor | Check red | low | **保留**（30.1.0 は regression。30.1.1 で入れる） |
| [#2973](https://github.com/kompiro/karasu/pull/2973) | `@types/vscode` | 1.137.0 → 1.138.0 | minor | Check / ExTester red | low | **保留**（ExTester の `vscode-max` が 1.137 のまま） |

`@dependabot ignore` はどこにも設定しない。保留 2 件はどちらも「その版を入れない」ではなく
「今は入れる条件が揃っていない」である。

## PR ごとの分析

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として `origin/main` と PR ヘッドで突き合わせた
（`security-alert` skill の edges 手順）。「新規パッケージ」は lock の `packages:` に main で存在しなかったキーを指す。

**全 PR に共通する移動**: Dependabot の再解決で vitest の `vite` peer が 8.2.2 → 8.3.0 に寄り、
`vitest@5.0.0 → vite 8.2.2` / `@vitest/mocker@5.0.0 → vite 8.2.2` の peer variant が消える。
vite 8.3.0 は main の lock に既にあり（2026-09-10 公開、provenance 付き、ADR-2877 で採用済み）、新規キーは増えない。
全 PR が同じ lock の hunk を書き換えるため、**1 件ずつマージし、間に `@dependabot rebase` を挟む**必要がある。

### #2976 `jsdom` 30.0.1 → 30.1.0

**判定: low / 保留。30.1.0 は upstream の regression で、30.1.1 で直っている。**

CI の red は `PreviewPane.test.tsx`（edge context menu）、`PreviewColumn.test.tsx`（Docs / Export / Open all views
メニュー、locale=ja のツールバー）、`FacetSelector.test.tsx` の計 30 件前後。いずれも Radix の
`DropdownMenu` が開いた直後に閉じる。

原因（ローカル worktree で再現）:

1. jsdom 30.1.0 で `Node-impl.js` に `_removingSteps()` が入り、フォーカス中の要素が取り除かれると
   `_ownerDocument._lastFocusedElement = document` になる。その後の `element.focus()` が `window` に余計な
   `blur`（と `focusout`、誤った `relatedTarget`）を発火する
2. Radix Menu（`@radix-ui/react-menu`）は `window` の `blur` でメニューを閉じる
3. テスト間の `cleanup()` がフォーカス中のメニュー項目を取り除くため、次のテストでメニューを開くと即座に閉じる

単体で走らせると通り、ファイル内の順序で落ちる（順序依存）ことも確認した。upstream では
[jsdom#4347](https://github.com/jsdom/jsdom/issues/4347)（まさに Radix の close-on-window-blur）ほかが close 済みで、
30.1.1 のリリースノートに "Fixed spurious window `blur` and `focusout` events ... which regressed in v30.1.0" とある。
jsdom 30.1.1 を worktree に差し込むと 3 ファイル 162/162 が通る。**repo 側のコード・テストの修正は不要。**

供給側: 30.0.1 / 30.1.0 / 30.1.1 とも GitHub Actions OIDC + provenance、maintainer 6 名は不変、install script なし。
diff は 341 ファイル・143k 行だが大半は `lib/generated/idl/*` の再生成で、外部 `require` の追加・network・
`child_process`・`eval` の追加はない。transitive は `@asamuzakjp/css-color` 7.0.1、`@asamuzakjp/dom-selector` 9.2.1、
`@csstools/*`、`whatwg-url` 17.1.2、`bidi-js` 1.1.0 などの版移動で、新しいパッケージ名はゼロ。`bidi-js` 1.1.0 は
約 3 年ぶりのリリースだが publisher は同じで、差分に不審な追加はない。

**保留を選ぶ理由（差し替え PR にしない）**: 30.1.1 の公開は 2026-09-22 02:07Z で、PR 起票（09-28 21:48Z）時点では
cooldown 7 日まで 4 時間 19 分足りなかった。Dependabot が 30.1.0 を出したのは cooldown どおりの挙動で、30.1.1 は
2026-09-29 02:07Z に cooldown を満たした。次の weekly run（10-05）で 30.1.1 の PR が #2976 を supersede する見込み。
`.claude/rules/dependabot.md` は差し替え PR を「bot が作れる diff の形では正しい変更にならないとき」に限っており、
今回は形ではなく版の問題なので、bot の次回提案を待つのが規則どおりである。

- 代替案: `packages/app/package.json` を `"jsdom": "^30.1.1"` にする差し替え PR を今出す（`package.json` 1 行 +
  lock 約 60 行、ローカルで green を確認済み）。1 週間早く入るが、規則の例外になる
- 副次効果: この PR の再解決は `@vscode/vsce → cheerio → undici` を 7.29.0 → 7.29.1 に寄せ、open の security alert #75
  （GHSA-3wwx-pv8p-q78v）を解消する。ただし alert は本トリアージの範囲外として別に扱う（「範囲外」節）

### #2973 `@types/vscode` 1.137.0 → 1.138.0

**判定: low / 保留。パッケージ自体は問題なし、floor の上限（ADR-2782）が 1.137 のまま。**

`npm diff` は header の "VS Code 1.138 Extension API" と版・hash だけで、API 宣言の変化はない。publisher は `types` で不変。

CI の red は 2 つとも ADR-2782 の想定どおり:

- `scripts/ci/vscode-version-policy.test.ts`: `engines.vscode`（`^1.137.0`）と `@types/vscode`（`^1.138.0`）の不一致
- ExTester: `@types/vscode ^1.138.0 greater than engines.vscode ^1.137.0`

`engines.vscode` を 1.138 に上げるには `vscode-extension-tester` の `vscode-max` が 1.138 以上である必要があるが、
現行の 8.27.0（`latest`、2026-09-14 公開）は `vscode-min 1.135.0` / `vscode-max 1.137.0` で、それより新しい版は無い。
ExTester が `vscode-max >= 1.138` を出し、それが cooldown を満たした時点で、ExTester の bump と floor の引き上げを
まとめて入れる（ADR-2782 の手順どおり）。bot PR は open のまま残す。

### #2977 `astro` 7.3.1 → 7.3.3（`packages/docs-site`）

**判定: low〜medium / 採用。新規依存 `verkit` が入るが provenance は通っており、docs build はローカルで確認した。**

7.3.3 で astro は内部のバージョン処理を `semver` から **`verkit`**（astro PR #17651）に置き換えた。

- `verkit` 0.4.1: 作者・唯一の maintainer は sxzz（Vite / Vue エコシステムの maintainer で、astro PR の作者でもある）。
  2026-07-19 作成で約 10 週、週 約 850 万 DL。2026-09-18 に GitHub Actions + SLSA provenance（`sxzz/verkit`、
  `refs/tags/v0.4.1`）で公開。依存ゼロ、install script なし、`dist/` に network / `eval` / `child_process` なし
- 若い単独 maintainer のパッケージが、実績の厚い `semver` を置き換える点が弱い。provenance と upstream の意図的な
  採用を材料に、低〜中と評価した。`semver` は他の依存経由で lock に残る

他の版移動は `@astrojs/compiler-rs` 0.4.1（新しいプラットフォームバイナリ `compiler-binding-android-arm64` を含む、
provenance 付き）、`@clack/*`、`devalue`、`find-proc` 0.2.0、`magicast` など。astro の独自の vite 8.2.2 と
`rolldown@1.2.5` が消え、docs-site のビルドは既存の vite 8.3.0 に寄る。

**CI の穴**: `docs-preview.yml` は bot PR をスキップし、`reference-docs-check.yml` は `astro build` を回さない。
このため bot PR 上で docs site は一度もビルドされない。本トリアージで PR ブランチを worktree に取り出し、
`pnpm --filter @karasu-tools/docs-site run build` を実行して、71 ページのビルド・link check・Pagefind 索引生成が
通ることを確認した。7.3.2 の MDX 変更（`<script>` / `<style>` の動的な子を escape する）は、
`packages/docs-site/src` の `.mdx` に該当箇所が無いため影響しない。

### #2971 `vitest` / `@vitest/coverage-v8` 5.0.0 → 5.0.1

**判定: low / 採用。**

`@vitest/coverage-v8@5.0.1` の peer は `vitest: '5.0.1'` で、group により同一 PR で揃う。vitest の `npm diff` は
chunk hash の変更で 119k 行に膨らむが、hash を正規化すると約 2.1k 行で、`child_process` 参照（9）、
`new Function`（1）、`eval(`（0）の件数は変わらない。新規キーは `magic-string` 1.4.1 と `obug` 2.2.1 で、
どちらも provenance 付き・cooldown 充足。

### #2978 `@types/node` 26.5.0 → 26.6.2

**判定: low / 採用。** `.d.ts` のみ 649 行（tls `certificateCompression`、`node:vfs`、test runner `log()` など）。
新規パッケージなし。

### #2974 `tailwind-merge` 3.6.0 → 3.7.0（`packages/app` の runtime 依存）

**判定: low / 採用。** ユーザーに配布される依存だが依存ゼロで、`src/` の差分はリリースノート（logical sides
`ps` / `pe` 等の class group、`color()` / `light-dark()` の色判定、`themeKey` の公開）と一致する。
tooling 用の entry `./unstable-do-not-import` が増えるが app からは参照しない。provenance は
`refs/tags/tailwind-merge@3.7.0`（monorepo 化に伴うタグ形式の変更で、正当）。

### #2972 `oxlint` 1.82.0 → 1.85.0

**判定: low / 採用。** 既定ルールセットの変更はなく、既存ルール（`no-unused-vars`、`unicorn/prefer-at` など）の
検出が広がった。repo は `--deny-warnings` で回しており CI が green なので、現行コードで結果は変わっていない。
`@oxlint/binding-*` 19 件も同じ provenance（`oxc-project/oxc` の `release_apps.yml`）。ネイティブバイナリの中身は
監査できないため provenance を根拠にした。

### #2975 `knip` 6.33.0 → 6.37.0

**判定: low / 採用。** plugin 追加と解決の修正。6.35.1 から plugin config の読み込み失敗で exit 2 になるが、
CI の `pnpm run knip` は通る。transitive は `oxc-parser` 0.150.0、`zod` 4.6.5、`yaml` 2.9.1、
`@napi-rs/wasm-runtime` 1.2.4 / `@tybys/wasm-util` 0.10.4 などの版移動で、新しい名前はない。knip 本体は
provenance なし（従来から）。

## 範囲外: security alert #75（undici）

トリアージ中に open の Dependabot alert を 1 件確認した。bot PR は起票されていない。

- GHSA-3wwx-pv8p-q78v（medium）、`undici >= 7.28.0, < 7.29.1`、patched 7.29.1
- main の lock では `@vscode/vsce@3.9.2 → cheerio@1.2.0 → undici@7.29.0` が該当（VSIX パッケージングの build tooling で、
  拡張の配布物には入らない）
- `pnpm-workspace.yaml` の override `undici: ^7.28.0` は floor が脆弱範囲の内側にある
  （`.claude/rules/dependabot.md`「advisory の脆弱範囲を override / 宣言レンジと突き合わせる」に該当）

#2976 の再解決は偶然これを解消するが、#2976 は保留なので当てにしない。override の floor を `^7.29.1` に上げる
security PR を `security-alert` skill の手順で別に出した（Issue [#2985](https://github.com/kompiro/karasu/issues/2985)、
修正 PR [#2986](https://github.com/kompiro/karasu/pull/2986)。判断は同 Issue 番号の ADR に記録する）。

## 決定

**採用 6 件は bot PR をそのままマージし、jsdom と `@types/vscode` の 2 件は保留として open のまま残す。**
`@dependabot ignore` はどこにも設定しない。

| PR | 判定 | 反映 |
| --- | --- | --- |
| #2978 / #2971 / #2974 / #2972 / #2975 / #2977 | 採用 | bot PR をマージ。lock が衝突するため #2978 → #2971 → #2974 → #2972 → #2975 → #2977 の順に 1 件ずつ入れ、各マージの後に次の PR へ `@dependabot rebase` を掛けて CI を通し直した |
| #2976 `jsdom` | 保留 | open のまま。次回 weekly run が 30.1.1 の PR で supersede するのを待つ |
| #2973 `@types/vscode` | 保留 | open のまま。ExTester が `vscode-max >= 1.138` を出し cooldown を満たしたら、ExTester の bump と floor の引き上げを ADR-2782 の手順でまとめて入れる |

## 理由

- 採用 6 件は、publisher・provenance・lifecycle script・依存エッジ・advisory・cooldown のいずれにも懸念が無かった（「PR ごとの分析」）
- #2976 を差し替え PR にしなかったのは、bot の diff の形ではなく版の問題だからである。差し替え PR は「bot が作れる diff の形では
  正しい変更にならないとき」に限る（`.claude/rules/dependabot.md`、ADR-2474）。30.1.1 は bot 起票時点で cooldown 未達で、
  bot は規則どおりに動いている
- #2973 はパッケージ自体に問題は無く、ADR-2782 の上限（ExTester の `vscode-max`）が外れるまで入れられない。機械チェック
  （`vscode-version-policy.test.ts`）がそのとおり止めた
- #2977 は CI が docs site をビルドしないため、PR ブランチでのローカルビルドを採用の条件にした

## 却下した案

### #2976 を 30.1.1 の差し替え PR で今すぐ入れる

`packages/app/package.json` を `"jsdom": "^30.1.1"` にすれば、コード・テストの変更なしで CI は通る（ローカルで確認済み）。
1 週間早く入るが、devDependency のテスト環境で急ぐ理由が無く、規則の例外を作るほどの利得が無い。

### #2976 の regression に合わせて repo 側のテストを直す

原因は jsdom の regression（spec 上正しくない `blur`）で、upstream が既に直している。repo 側で回避を入れると、
30.1.1 を入れた後に不要なコードが残る。

## 残した観察

- 全 PR の再解決で vitest の `vite` peer が既存の 8.3.0 に寄る。lock が同じ hunk で衝突するので、weekly バッチは
  1 件ずつのマージと rebase が前提になる
- docs site のビルドは bot PR の CI に無い（`docs-preview.yml` は bot をスキップし、`reference-docs-check.yml` は
  `astro build` を回さない）。docs-site の依存を上げる bot PR は、今回のように手でビルドを確かめる必要がある
