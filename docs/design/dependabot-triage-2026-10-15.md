# Dependabot トリアージ 2026-10-15

- **日付**: 2026-10-15
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3227](https://github.com/kompiro/karasu/pull/3227) / [#3228](https://github.com/kompiro/karasu/pull/3228) / [#3229](https://github.com/kompiro/karasu/pull/3229) / [#3230](https://github.com/kompiro/karasu/pull/3230) / [#3231](https://github.com/kompiro/karasu/pull/3231) / [#3232](https://github.com/kompiro/karasu/pull/3232) / [#3233](https://github.com/kompiro/karasu/pull/3233) / [#3234](https://github.com/kompiro/karasu/pull/3234) / [#3235](https://github.com/kompiro/karasu/pull/3235)
  - 前回（10-14 第 2 波）: [#3221](https://github.com/kompiro/karasu/pull/3221)（`open-pull-requests-limit` を 25 へ。Design Doc `dependabot-triage-2026-10-14-second-batch.md` は ADR 昇格待ち）
  - `fast-uri` の override: [ADR-1338](../adr/1338-fast-uri-override-pin.md)、[ADR-2693](../adr/2693-dependabot-security-2026-09-03.md)、[ADR-3002](../adr/3002-dependabot-security-2026-09-30.md)
  - assumption の書き方: [ADR-2628](../adr/2628-adr-assumption-version-policy.md)、本文は触らない: [ADR-2687](../adr/2687-adr-body-is-immutable.md)
  - gh-aw の `.lock.yml` は再生成で上げる: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)（`.claude/rules/dependabot.md`）

## 背景

2026-10-15（木）09:33–09:36 UTC に Dependabot PR が 9 件起票された（github-actions 1 件、npm 8 件）。#3221 で npm の
`open-pull-requests-limit` を 8 → 25 に上げたマージ（09:32）の直後で、#3221 の Design Doc が「未起票」として挙げた 8 件が
そのまま出た。security update ではない（`security` ラベル無し、open な Dependabot alert は 0 件）。

**供給側（配布主体・改ざん）の懸念は見つからなかった。**

- **publisher / maintainer**: 8 件とも from 版と to 版で publisher の種類は変わらない。`knip`（個人アカウント `webpro`）と
  `@vscode/vsce`（`microsoft1es`）は前後とも provenance なしで、過去の版も同じ。他は GitHub Actions OIDC + SLSA provenance。
  maintainer の追加は `@anthropic-ai/sdk` の 2 名（どちらも `@anthropic.com`）だけ
- **publish workflow の変化**: 2 件あり、どちらも upstream が理由を書いている。
  `@anthropic-ai/sdk` 0.132.1 は `create-releases.yml`（push）から `publish-npm.yml`（`workflow_dispatch`、保護された
  `production-release` environment）へ移った（リリースノート「ci: publish every package from the publish workflow」）。
  `lucide-react` は 1.51.0 から日次の schedule 起動になった（lucide#4911）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。`jsdom` の `prepare: wireit` は前後同じで、registry install では走らない
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval` / `new Function` /
  `process.env` / 外部 URL で grep し、該当箇所を読んだ。意図の説明できない変化は無かった（PR ごとの節に記す）
- **既知 advisory**: to 版すべてで該当ゼロ。逆に `vite` 8.3.3 は advisory 3 件の修正版である（後述）
- **公開からの経過**: すべての to 版と、transitive で新しく入る版が cooldown 7 日を超えている
  （最も新しいのは `lucide-react@1.53.0` の 10-08 06:15 と `@anthropic-ai/sdk@0.132.1` の 10-08 03:20）
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた（`security-alert`
  skill の edges 手順）。**main の lock に無いパッケージ名が新しく入る PR は 0 件**。#3235 は逆に 100 近いパッケージ名を
  lock から消す

判断が必要なのは供給側ではなく、**bot の diff の形では CI を通せない 2 件**と、**修正版 floor の扱い 1 件**、
**再生成で入れる gh-aw 1 件**である。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#3228](https://github.com/kompiro/karasu/pull/3228) | `@anthropic-ai/sdk`（app、runtime） | 0.131.0 → 0.132.1 | 0.x minor | green | low | 採用（そのままマージ） |
| [#3231](https://github.com/kompiro/karasu/pull/3231) | `lucide-react`（app、runtime） | 1.42.0 → 1.53.0 | minor | green | low | 採用（そのままマージ） |
| [#3232](https://github.com/kompiro/karasu/pull/3232) | `astro`（docs-site） | 7.3.3 → 7.3.7 | patch | green | low | 採用（そのままマージ。docs-site のビルドはローカルで確認済み） |
| [#3233](https://github.com/kompiro/karasu/pull/3233) | `@playwright/test`（root / e2e） | 1.63.0 → 1.64.0 | minor | green | low | 採用（そのままマージ） |
| [#3234](https://github.com/kompiro/karasu/pull/3234) | `jsdom`（app、test） | 30.1.1 → 30.1.2 | patch | green | low | 採用（そのままマージ） |
| [#3230](https://github.com/kompiro/karasu/pull/3230) | `vite`（app） | 8.3.0 → 8.3.3 | patch（security 修正） | green | low | 採用（**差し替え PR**: `vite@8` の override floor を同時に上げる） |
| [#3229](https://github.com/kompiro/karasu/pull/3229) | `knip`（root） | 6.38.0 → 6.40.0 | minor | Check red（knip の config hint） | low | 採用（**差し替え PR**: `knip.json` の entry を 1 つ外す） |
| [#3235](https://github.com/kompiro/karasu/pull/3235) | `@vscode/vsce`（vscode / vscode-e2e） | 3.9.2 → 4.0.0 | major | Check red（ADR-1338 の assumption） | low | 採用（**差し替え PR**: ADR-1338 の assumption を直す） |
| [#3227](https://github.com/kompiro/karasu/pull/3227) | `github/gh-aw-actions/setup` | 0.89.21 → 0.91.6 | 0.x minor | Check red（gh-aw lock 整合） | 対象外 | 却下（規則どおり。再生成は 10-21 以降） |

## PR ごとの分析

### #3235 `@vscode/vsce` 3.9.2 → 4.0.0

**vsce 4.0.0 は既に lock にある。** #3225（ExTester 8.28.1）で `vscode-extension-tester` の依存として入った。この PR は
`packages/vscode` / `packages/vscode-e2e` の直接宣言を `^4.0.0` に寄せ、3.9.2 の部分木を lock から消すだけである。

- リリースノート（[v4.0.0](https://github.com/microsoft/vscode-vsce/releases/tag/v4.0.0)、09-14 公開）: Node 22 への
  baseline 引き上げ、依存の置き換え（`keytar` → `@napi-rs/keyring`、`markdown-it` → `marked` + `parse5`、`glob` →
  `tinyglobby`、`chalk` / `form-data` / `cheerio` / `tmp` などの除去）、旧 PAT 資格情報の移行、OIDC trusted publishing
- karasu が使うのは `vsce package --no-dependencies` / `vsce publish --no-dependencies`（`packages/vscode/package.json`）と、
  `vscode-release.yml` の `vsce show <id> --json`、`vsce publish --azure-credential --no-dependencies [--pre-release]`。
  4.0.0 でもすべて残っている（コマンド 13 個・オプション 85 個が 3.9.2 と同じ）。CI の Node は 24
- 新しいコードの `execFile` は、既存の PAT を keyring へ移すための `secret-tool lookup`（Linux）と固定の PowerShell
  `CredRead`（Windows）だけ。`oidc.js` が呼ぶのは `ACTIONS_ID_TOKEN_REQUEST_URL` と Marketplace の token endpoint
- **未確認**: `markdown-it` → `marked` で、`.vsix` に入る README のリンク・画像の書き換えが変わるか。差し替え PR で
  `vsce package` の出力を main と比べる

**CI が落ちる理由は vsce ではなく ADR-1338 の assumption である。** 3.9.2 が持っていた `@secretlint/node` →
`@secretlint/config-loader` → `ajv` → `fast-uri` の経路が 4.0.0 で無くなり、`fast-uri` が lock から消える。ADR-1338 の
`grep: pnpm-lock.yaml :: fast-uri: 3\.` が成立しなくなる。同じ理由で、`pnpm-workspace.yaml` の override のうち
**`fast-uri` / `form-data` / `linkify-it` / `markdown-it` の 4 つは対象のパッケージが lock から無くなる**。

| 案 | 内容 | 評価 |
| --- | --- | --- |
| **A. override は残し、ADR-1338 の lock 側 assumption を外す（推奨）** | ADR-1338 の frontmatter から `pnpm-lock.yaml` の行を除き、理由をコメントに書く | override は効く対象が無いあいだは何もしない。同じパッケージが別経路で戻ったときに floor としてそのまま効く。ADR-2693 / ADR-3002 の assumption（`pnpm-workspace.yaml` 側）も成立し続ける |
| B. 4 つの override を外し、関係する ADR を supersede する | override と、ADR-1338 / ADR-2693 / ADR-3002 などの assumption を整理する | lock は痩せた状態で正直になるが、ADR を 3 本以上 supersede する。戻ってきたときの floor も失う |

A は ADR-2623 が ADR-2447 の、#3226 が ADR-3077 の assumption を緩めた前例と同じ扱いで、ADR の本文は触らない（ADR-2687）。
bot の diff には ADR の修正が含まれないので、**差し替え PR で bump と assumption の修正を同梱する**。

### #3229 `knip` 6.38.0 → 6.40.0

Check は knip の config hint 1 件で落ちる（`treatConfigHintsAsErrors: true`）:
`src/viewer/main.tsx  packages/app  knip.json  Remove redundant entry pattern`。

- hint を生んだのは Dependabot が飛ばした **6.39.0** の [knip#1988](https://github.com/webpro-nl/knip/pull/1988)
  「resolve nested HTML entry points in multi-page apps」。Vite plugin が `build.rollupOptions.input` を entry として読み、
  入力が `.html` ならその `<script type="module" src>` も entry にするようになった。6.40.0 は root 絶対パスの `src` を
  Vite の root から解決する修正
- karasu では `build:viewer` の `vite build --config vite.viewer.config.ts` → `rollupOptions.input: "viewer.html"` →
  `<script type="module" src="/src/viewer/main.tsx">` の経路を knip が自力で辿れるようになり、`knip.json` の明示 entry が
  重複になった
- `src/serve-main.tsx` は `vite.serve.config.ts` の `transformIndexHtml` 内の文字列置換でしか辿れないので entry に残す
- publisher は `webpro` で provenance なし。5.0.0 / 6.0.0 / 6.30.0 / 6.38.0 も同じで、maintainer も 1 名のまま

**差し替え PR** で bump と `knip.json` の app ワークスペースの `entry` から `src/viewer/main.tsx` を外す変更を 1 コミットに入れる。

### #3230 `vite` 8.3.0 → 8.3.3（`packages/app`）

**8.3.3 は vite の repo に 10-06 に公開された advisory 3 件の修正版で、現在の 8.3.0 は 3 件とも脆弱範囲に入る**
（GitHub の global advisory DB にはまだ載っておらず、Dependabot alert も出ていない）。

| advisory | severity | 脆弱範囲（8.x） | 内容 |
| --- | --- | --- | --- |
| GHSA-rq7h-c2jc-7f22 | medium | `>=8.3.0, <=8.3.2` | project path が system path と一致すると `server.fs.allow` 外のファイルを配信しうる |
| GHSA-vfpm-58rq-9qcg | medium | `>=8.3.0, <=8.3.2` | `?vite-wasm-instance` で `server.fs` 外のファイルの先頭 4 byte が漏れる |
| GHSA-9jrq-w75r-8gcw | low | `>=8.3.0, <=8.3.2` | custom middleware 経由の cross origin script 実行 |

いずれも dev server の問題で、karasu で vite を使うのは `packages/app` の dev / build だけ（CLI や出荷物は vite を実行しない）。
リリースノートに BREAKING は無く、tarball の差分は `dist` と `package.json` だけ（vendored の `cross-spawn` が `tinyexec`
に置き換わり `node:child_process` の import が移動、`launch-editor` が Windows の UNC パスを拒否）。

**override floor が脆弱範囲の内側にある。** `pnpm-workspace.yaml` の `vite@8: ^8.0.16` は [ADR-1652](../adr/1652-dependabot-security-2026-06-16.md) で置いたもので、
今回の範囲に入る。bot の diff は `packages/app` の宣言だけを上げるため、lock には `astro` / `vitest` / `vitefu` 経由の
`vite@8.3.0` が残る（#3230 の lock で確認。#3232 の lock でも `vitest` / `@vitejs/plugin-react` 側は 8.3.0 のままで、
2 本を順に入れても 8.3.0 が消える保証は無い）。`.claude/rules/dependabot.md` の
「advisory の脆弱範囲を override / 宣言レンジと突き合わせる」は alert 対応の規則だが、advisory が既に公開されて
いるので同じ考え方で先回りする。

**差し替え PR** で `packages/app` の `vite` を `^8.3.3` に、override を `vite@8: ^8.3.3` に上げ、lock から 8.3.0 が消えた
ことを `grep -c "vite@8.3.0" pnpm-lock.yaml` = 0 で確かめる。8.3.4（10-08 12:07 公開、10-15 12:07 に cooldown を越えた）も
確認した: 機能 1 件と修正のみ、provenance あり、追加行に `child_process` / `eval` / 外部 URL なし。差し替え PR の
lock が 8.3.4 になっても問題ない。

### #3232 `astro` 7.3.3 → 7.3.7（`packages/docs-site`）

- 7.3.4–7.3.7 はすべて patch。i18n のドメインルーティングが `security.allowedDomains` に従う、不正なエンコーディングの
  request に 400、`checkOrigin` の修正などの hardening を含む
- 7.3.6（withastro/astro#18099）で frontmatter の YAML パーサが `js-yaml` から `yaml` に替わった。**CI は docs-site を
  ビルドしない**（root の `build` は docs-site を含まず、Docs Preview は Dependabot PR で skip される）ので、ローカルで
  main と #3232 の両方で `pnpm --filter @karasu-tools/docs-site run build` を実行した。どちらも成功し 73 ページ。
  Astro の版文字列と `_astro/` のハッシュを正規化すると **73 ページすべての HTML が一致**した
- transitive: `tinyclip` 0.1.15 → 1.0.3（`powershell` → `powershell.exe` と stdin のエラーハンドラだけ）、`am-i-vibing`
  0.4 → 0.5（検出対象に 1 件追加）、`obug` 2 → 3（exports-only への整理）、`es-module-lexer` 2 → 3（astro が `^3.0.2` を要求。
  2.3.2 は他の利用元のために残る。前後とも `guybedford` の手動 publish で provenance なし）、`sharp` 0.35.5（main は #3204 で既に 0.35.5）。
  provenance と maintainer はすべて前の版と同じ
- 7.3.7 で astro が `rolldown ^1.2.11` を直接依存に持つ（lock には vite 経由で既存）

### #3233 `@playwright/test` 1.63.0 → 1.64.0

- ブラウザ: Chromium 153 → 156、Firefox 155 → 157、WebKit 26.6 → 27.2。ダウンロード元のホストは変わらない
- BREAKING（[v1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0)）を `packages/e2e/playwright.config.ts`
  と突き合わせた: device descriptor の `screen` が転送される（`Desktop Chrome` を使うが `window.screen` / `matchMedia` /
  `toHaveScreenshot` は使っていない）、hidden iframe 内の要素が hidden 扱い（対象の iframe は表示状態）、
  `--update-snapshots=missing` の終了コード（未使用）。`webServer` / `reuseExistingServer`、既定 timeout、reporter は不変
- PR の Playwright ジョブは green（9m10s）。provenance は前後とも `publish_release.yml` の tag build

### #3228 `@anthropic-ai/sdk` 0.131.0 → 0.132.1（`packages/app`、runtime）

追加（新モデル ID、toolset の型、capability / lifecycle フィールド）と修正（消費済み JSONL stream の再 iterate が throw、
空の path parameter で request 前に throw）。Text Completions API が deprecated。karasu が使うのは
`packages/app/src/hooks/useChatSession.ts` の `client.messages.create` だけで、どれにも当たらない。新しい
`security-node.js` は既存の `internal/node` shim 経由の fs / path で、`browser` フィールドが stub に差し替えるため
ブラウザの bundle には入らない。

### #3231 `lucide-react` 1.42.0 → 1.53.0（`packages/app`、runtime）

karasu が import するアイコンは `ChevronRight`（`components/ui/breadcrumb.tsx`）と `X`（`components/ui/dialog.tsx`）の 2 つで、
どちらも 1.53.0 に残り、モジュールの差分はライセンスヘッダの版文字列だけ。`.d.ts` の比較で削除された export は 0、
追加 177。改名（`Building2` → `BuildingComplex` など 5 件）は旧名が alias として残る。runtime のファイル（`Icon` /
`createLucideIcon` など）はライセンスヘッダだけの変化。`@types/react` が optional peer になった。

### #3234 `jsdom` 30.1.1 → 30.1.2（`packages/app`、test）

修正と性能改善のみ（computed style の陳腐化、focus、メモリリーク、30.1.0 の回帰 2 件、Unicode 18 の IDN）。transitive で
`data-urls` 7 → 8、`whatwg-url` 16 → 17.2、`tr46` 6 → 7 が major だが、どれも変更は Node の engine 下限の引き上げ
（`^22.14.0 || >=24.0.0`）と Unicode 18 のテーブル再生成。jsdom 自体が既に `^22.22.2 || ^24.15.0` を要求している。
`tr46@7.0.0` は初めて OIDC + provenance で publish された（6.0.0 は手動）。`@exodus/bytes` 1.16.0 は前後とも `chalker` の
手動 publish で provenance なし、GitHub の tag は npm publish の約 20 秒前に作られている。

### #3227 `github/gh-aw-actions/setup` 0.89.21 → 0.91.6

`.claude/rules/dependabot.md`「gh-aw の `.lock.yml` は bot PR ではなく再生成で上げる」に当たる。bot は 2 つの `.lock.yml`
の `uses:` 行だけを書き換え、`compiler_version` と `.github/aw/actions-lock.json` は v0.89.21 のままなので、
`gh-aw-lock-consistency.test.ts` が落ちる。**却下して close する**。

再生成で入れる版も、今は選べない。github/gh-aw の v0.89.22–v0.91.11 はすべて prerelease で（前回 ADR-3196 と同じ状況）、
非 prerelease の v0.91.12（10-14 04:49）と v0.92.0（10-15 04:47）はまだ cooldown 内である。0.89.22–0.92.0 の変更は
ネットワーク既定の縮小（read-only な agent workflow の既定を network なしに）、MCP gateway image の digest 固定、
`pull_request_target` の strict 化、GitHub App token の scope 明示など hardening が中心。**v0.91.12 が cooldown を越える
10-21 以降に `gh aw compile` で再生成する**（そのとき `permissions:` / `GH_AW_INFO_ALLOWED_DOMAINS` / `ghcr.io` の image 版を読む）。
これは本トリアージの範囲外の作業として残す。

## rebase で版が変わるもの

前回（#3214 lefthook）、`@dependabot rebase` が PR を作り直した時点で cooldown を満たした新しい版に上がり、気づかずに
マージした。今回の対象で、**10-15 16:00 UTC 時点で既に cooldown を越えた新しい版がある**のは次の 2 つ:

- `astro` 7.3.8（10-08 15:41）: esbuild を Vite の Oxc / Rolldown に置き換える内部リファクタ（withastro/astro#18263。
  変更ファイル 676）を含む。provenance あり、追加行に意図の説明できない `child_process` / `eval` / 外部 URL は無い
  （URL は移動したファイルのコメント）。**rebase で 7.3.8 になったら、上の docs-site のビルド比較をやり直してから
  マージする**
- `vite` 8.3.4: 差し替え PR で入る（上記で確認済み）

10-16 中に cooldown を越えるもの: `lucide-react` 1.54.0（06:18）、`knip` 6.41.0（07:57）、`@anthropic-ai/sdk` 0.133.0
（15:44）。rebase がそれ以降になったら、マージ前に PR タイトルの版を確かめ、変わっていればその版の差分を確認する。

## 当初の方針

1. **そのままマージ（5 件）**: #3228 / #3231 / #3232 / #3233 / #3234。すべて `pnpm-lock.yaml` を触り、bot PR のベースは
   #3204（sharp）のマージより前なので、1 件ずつ `@dependabot rebase` → CI green → squash merge。マージ直前に PR タイトルの
   版がトリアージした版と同じかを確かめる
2. **差し替え PR（3 本）**。bot PR は close し、「採用」なので `@dependabot ignore` は設定しない
   - vite: `packages/app` の `vite` `^8.3.3` + override `vite@8: ^8.3.3`（#3230 を close）
   - knip: `knip` `^6.40.0` + `knip.json` の entry 修正（#3229 を close）
   - vsce: `@vscode/vsce` `^4.0.0`（vscode / vscode-e2e）+ ADR-1338 の assumption 修正（案 A）+ `.vsix` の README の比較（#3235 を close）
   - lockfile は main の lock を起点に `pnpm install --config.minimum-release-age=10080` で作る（前回の学び）
3. **却下（1 件）**: #3227 を close する。再生成は 10-21 以降
