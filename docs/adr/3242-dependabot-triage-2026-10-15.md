---
id: ADR-3242
title: Dependabot トリアージ 2026-10-15：npm 5 件をそのまま採用し、vite（override の floor 引き上げ）・knip（entry 修正）・vsce（利用元のいない override の削除）は差し替え PR で入れ、gh-aw-actions は却下する
status: accepted
date: 2026-10-16
topic: build
related_to:
  - ADR-3246
  - ADR-1338
  - ADR-3196
  - ADR-1652
  - ADR-2753
  - ADR-2474
  - ADR-784
  - ADR-3421
scope:
  packages: [app, docs-site, e2e, vscode, vscode-e2e]
  concerns: [ci, dependencies, security]
---

# ADR-3242: Dependabot トリアージ 2026-10-15：npm 5 件をそのまま採用し、vite（override の floor 引き上げ）・knip（entry 修正）・vsce（利用元のいない override の削除）は差し替え PR で入れ、gh-aw-actions は却下する

- **日付**: 2026-10-16
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3242](https://github.com/kompiro/karasu/pull/3242)（本 ADR に昇格し削除）
  - 差し替え PR: [#3244](https://github.com/kompiro/karasu/pull/3244)（vite）/ [#3245](https://github.com/kompiro/karasu/pull/3245)（knip）/ [#3247](https://github.com/kompiro/karasu/pull/3247)（vsce）
  - override の削除: [ADR-3246](./3246-drop-overrides-left-by-vsce-4.md)（Issue [#3246](https://github.com/kompiro/karasu/issues/3246)。ADR-1338 を supersede）
  - 対象 Dependabot PR: [#3227](https://github.com/kompiro/karasu/pull/3227) / [#3228](https://github.com/kompiro/karasu/pull/3228) / [#3229](https://github.com/kompiro/karasu/pull/3229) / [#3230](https://github.com/kompiro/karasu/pull/3230) / [#3231](https://github.com/kompiro/karasu/pull/3231) / [#3232](https://github.com/kompiro/karasu/pull/3232) / [#3233](https://github.com/kompiro/karasu/pull/3233) / [#3234](https://github.com/kompiro/karasu/pull/3234) / [#3235](https://github.com/kompiro/karasu/pull/3235)
  - 前回トリアージ: [ADR-3196](./3196-dependabot-triage-2026-10-14.md)、10-14 第 2 波は [#3221](https://github.com/kompiro/karasu/pull/3221)
  - `vite@8` の override を置いた ADR: [ADR-1652](./1652-dependabot-security-2026-06-16.md)
  - gh-aw の再生成規則: [ADR-2753](./2753-dependabot-triage-2026-09-07.md)、`.claude/rules/dependabot.md`
  - 差し替え PR の語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)、cooldown 7 日: [ADR-784](./784-update-dependencies-20260421.md)

## 背景

2026-10-15（木）09:33–09:36 UTC に Dependabot PR が 9 件起票された（github-actions 1 件、npm 8 件）。#3221 で npm の
`open-pull-requests-limit` を 8 → 25 に上げた直後で、#3221 の Design Doc が「未起票」として挙げた 8 件がそのまま出た。
security update ではない（`security` ラベル無し、open な Dependabot alert は 0 件）。

**供給側（配布主体・改ざん）の懸念は見つからなかった。**

- **publisher / maintainer**: 8 件とも from 版と to 版で publisher の種類は変わらない。`knip`（個人アカウント `webpro`）と
  `@vscode/vsce`（`microsoft1es`）は前後とも provenance なしで、過去の版も同じ。他は GitHub Actions OIDC + SLSA provenance。
  maintainer の追加は `@anthropic-ai/sdk` の 2 名（どちらも `@anthropic.com`）だけ
- **publish workflow の変化**: 2 件あり、どちらも upstream が理由を書いている。`@anthropic-ai/sdk` 0.132.1 は
  `create-releases.yml`（push）から `publish-npm.yml`（`workflow_dispatch`、保護された `production-release` environment）へ
  移った。`lucide-react` は 1.51.0 から日次の schedule 起動になった（lucide#4911）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。`jsdom` の `prepare: wireit` は前後同じで、registry install では走らない
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval` / `new Function` /
  `process.env` / 外部 URL で grep し、該当箇所を読んだ。意図の説明できない変化は無かった
- **既知 advisory**: to 版すべてで該当ゼロ。逆に `vite` 8.3.3 は advisory 3 件の修正版である
- **公開からの経過**: すべての to 版と、transitive で新しく入る版が cooldown 7 日を超えていた
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base と各 PR ヘッドで突き合わせた。main の lock に無い
  パッケージ名が新しく入る PR は 0 件

| PR | 依存 | from → to | CI | リスク | 判定 |
| --- | --- | --- | --- | --- | --- |
| #3228 | `@anthropic-ai/sdk`（app、runtime） | 0.131.0 → 0.132.1 | green | low | 採用（そのままマージ） |
| #3231 | `lucide-react`（app、runtime） | 1.42.0 → 1.53.0 | green | low | 採用（そのままマージ） |
| #3232 | `astro`（docs-site） | 7.3.3 → 7.3.7（rebase で 7.3.8） | green | low | 採用（そのままマージ） |
| #3233 | `@playwright/test`（root / e2e） | 1.63.0 → 1.64.0 | green | low | 採用（そのままマージ） |
| #3234 | `jsdom`（app、test） | 30.1.1 → 30.1.2 | green | low | 採用（そのままマージ） |
| #3230 | `vite`（app） | 8.3.0 → 8.3.3 | green | low | 採用（差し替え PR #3244） |
| #3229 | `knip`（root） | 6.38.0 → 6.40.0 | Check red | low | 採用（差し替え PR #3245） |
| #3235 | `@vscode/vsce`（vscode / vscode-e2e） | 3.9.2 → 4.0.0 | Check red | low | 採用（差し替え PR #3247） |
| #3227 | `github/gh-aw-actions/setup` | 0.89.21 → 0.91.6 | Check red | 対象外 | 却下 |

## 決定

**npm 5 件（#3228 / #3231 / #3232 / #3233 / #3234）はそのままマージし、vite・knip・vsce は bot の diff では正しい変更に
ならないので差し替え PR で入れ、gh-aw-actions の bot PR は却下して再生成に回す。** 差し替え PR はすべて「採用」なので
`@dependabot ignore` は設定しない。

### vite（#3230 → #3244）: override の floor も上げる

8.3.3 は vite の repo に 10-06 に公開された advisory 3 件の修正版で、当時の 8.3.0 は 3 件とも脆弱範囲に入っていた
（GitHub の global advisory DB には未掲載で、Dependabot alert は出ていなかった）。

| advisory | severity | 脆弱範囲（8.x） | 内容 |
| --- | --- | --- | --- |
| GHSA-rq7h-c2jc-7f22 | medium | `>=8.3.0, <=8.3.2` | project path が system path と一致すると `server.fs.allow` 外のファイルを配信しうる |
| GHSA-vfpm-58rq-9qcg | medium | `>=8.3.0, <=8.3.2` | `?vite-wasm-instance` で `server.fs` 外のファイルの先頭 4 byte が漏れる |
| GHSA-9jrq-w75r-8gcw | low | `>=8.3.0, <=8.3.2` | custom middleware 経由の cross origin script 実行 |

いずれも dev server の問題で、karasu で vite を実行するのは `packages/app` の dev / build だけである。`pnpm-workspace.yaml`
の `vite@8: ^8.0.16`（ADR-1652）は今回の脆弱範囲の内側にあり、bot の diff は `packages/app` の宣言だけを上げるため、
`astro` / `vitest` / `vitefu` 経由の `vite@8.3.0` が lock に残る。alert 対応の規則（`.claude/rules/dependabot.md`
「advisory の脆弱範囲を override / 宣言レンジと突き合わせる」）を先回りして適用し、宣言と override を両方 `^8.3.3` にした。
lock は 8.3.4（10-08 公開、修正と機能 1 件、provenance あり）に解決し、`vite@8.3.0` は 0 件になった。

### knip（#3229 → #3245）: 重複になった entry を外す

bot PR は knip の config hint 1 件で落ちた（`treatConfigHintsAsErrors: true`）。hint を生んだのは Dependabot が飛ばした
6.39.0 の webpro-nl/knip#1988 で、Vite plugin が `build.rollupOptions.input` と HTML 入力の module script を entry として
読むようになった。karasu では `build:viewer` → `vite.viewer.config.ts` → `viewer.html` → `src/viewer/main.tsx` を knip が
自力で辿れるようになり、`knip.json` の明示 entry が重複になった。`src/serve-main.tsx` は `transformIndexHtml` 内の文字列置換で
しか辿れないので残す。

### vsce（#3235 → #3247）: 利用元のいなくなった override を外す

vsce 4.0.0 は #3225 の ExTester 8.28.1 経由で既に lock にあり、直接依存がそこへ寄ると 3.9.2 の部分木が抜ける。その結果
`fast-uri` / `form-data` / `linkify-it` / `markdown-it` の override は対象が lock から無くなり、ADR-1338 の assumption
（lock に `fast-uri` がある）が落ちた。4 つの override を外し、ADR-1338 を supersede する決定は ADR-3246 に記録した。
karasu が使う vsce のコマンドとフラグは 4.0.0 でもすべて残っており、`.vsix` を main と比べると README / manifest /
`extension.js` / `server.js` はバイト単位で一致した（差分は同梱される `package.json` の `@vscode/vsce` の行だけ）。

### gh-aw-actions（#3227）: 却下し、10-21 以降に再生成する

bot は 2 つの `.lock.yml` の `uses:` 行だけを書き換え、`compiler_version` と `.github/aw/actions-lock.json` を v0.89.21 の
まま残すので、`gh-aw-lock-consistency.test.ts` が落ちる（ADR-2753 の規則どおり却下）。github/gh-aw の v0.89.22–v0.91.11 は
すべて prerelease で、非 prerelease の v0.91.12（10-14 公開）と v0.92.0（10-15 公開）はトリアージ時点で cooldown 内だった。
v0.91.12 が cooldown を越える 10-21 以降に、版を pin して再生成する（その時点でより新しい非 prerelease 版があればそちら）。

```bash
v=v0.91.12   # より新しい非 prerelease 版を選んだら、ここをその版にする
gh extension install github/gh-aw --force --pin "$v"
gh aw version   # "$v" であること。これが PR に書く版になる
gh aw compile
git add .github && gh aw compile && git diff --quiet -- .github   # 2 回目で差分が出ない
npx vitest run --config scripts/vitest.config.ts ci/gh-aw-lock-consistency.test.ts ci/agentic-workflow-safety.test.ts
```

0.89.22–0.92.0 の変更は hardening が中心（read-only な agent workflow の既定を network なしに、MCP gateway image の digest
固定、`pull_request_target` の strict 化、GitHub App token の scope 明示）。再生成の diff では `permissions:` /
`GH_AW_INFO_ALLOWED_DOMAINS` / `ghcr.io` の image 版を読む。

## 理由

- **そのままマージした 5 件**は upstream の変更が修正中心で、karasu の使い方に当たる破壊的変更が無かった:
  - `@anthropic-ai/sdk`: 追加と修正。karasu が使うのは `client.messages.create` だけ
  - `lucide-react`: karasu が import する `ChevronRight` / `X` は残り、削除された export は 0
  - `@playwright/test`: 1.64 の BREAKING（device の `screen` 転送、hidden iframe の扱い、`--update-snapshots=missing`）は
    `packages/e2e` の使い方に当たらない
  - `jsdom`: 修正のみ。transitive の major（`data-urls` / `whatwg-url` / `tr46`）は Node の engine 下限の引き上げで、jsdom 自体が既に要求している範囲
  - `astro`: CI は docs-site をビルドしないので、ローカルで main と比べた（後述）
- **差し替え PR の 3 件**は、bot の diff の形では正しい変更にならない（ADR-2474 の定義どおり）。vite は override の floor、
  knip は設定ファイル、vsce は override と ADR を、bump と同じコミットで動かす必要があった

## 反映

ユーザー判断（2026-10-15）: vite は override の floor も上げる。vsce は利用元のいなくなった override を外して ADR を
supersede する（Design Doc が推奨した「override を残し assumption だけ緩める」案から変更）。差し替え PR は 3 本に分ける。

- そのままマージ: #3231 → #3228 → #3233 → #3234 → #3232 の順に `@dependabot rebase` → CI green → squash merge
  （10-16 00:05 〜 01:09 UTC）。毎回マージの前に、PR タイトルの版と、rebase 後の lock の依存エッジを main と比べた
  - #3233 では、直前にマージした #3228 が持ち込んだ `@babel/runtime` 7.29.10 へ `@testing-library/dom` が乗り換えた
    （10-07 公開、OIDC + provenance、helper 2 つの修正だけ）
  - **#3232 は rebase で astro 7.3.8 になった**（トリアージ時点で既に cooldown を越えていたので予想していた）。7.3.8 は
    esbuild を Vite の Oxc / Rolldown に置き換える内部リファクタを含む。7.3.7 から新しく入る版は `vite` 8.3.4、`undici`
    7.30.0（v7 系のバックポート修正のみ、maintainer 同じ、provenance あり）、`verkit` 0.5.0（provenance あり、maintainer 同じ）。
    docs-site を main と 7.3.8 の両方でビルドし、Astro の版文字列と `_astro/` のハッシュを正規化すると 73 ページの HTML が
    すべて一致し、WARN も main と同じ 2 件だったので、そのままマージした（7.3.7 でも同じ比較をして一致していた）
- 差し替え PR: #3244（10-16 14:42 UTC）→ #3247（14:55 UTC）→ #3245（15:10 UTC）の順にマージ。1 本マージするごとに残りへ main を
  取り込み、lockfile をテキストマージせず main の lock を起点に `pnpm install --config.minimum-release-age=10080` で作り直した
- 却下: #3227 を close した

## 運用上の学び

- **lock を作り直すたびに、宣言した直接依存も cooldown を越えた最新版へ動きうる。** #3245 では、10-16 に main の lock から
  作り直した時点で knip 6.41.0（10-16 07:57 UTC に cooldown を越えた）に解決し、`formatly` 0.11.4 / `oxc-parser` 0.153.0 も
  入った。どれもトリアージで見ていない版だったので、`pnpm add -D -w knip@6.40.0` で lock を 6.40.0 に戻した（宣言は
  `^6.40.0` のまま）。依存エッジを比べるときに bump 対象のパッケージ自身の行を除外していたため、最初はこの変化を見落とした。
  比べるときは bump 対象の行も含め、版が動いたらその版を確認するか lock を戻す
- `@dependabot rebase` で版が上がる件（ADR-3196 の後続、#3214 の lefthook）は、トリアージの時点で「rebase の時点で
  cooldown を越えている新しい版」を一覧にしておくと、マージ前に確認すべき版が先に分かる。今回は astro 7.3.8 を事前に
  確認しておき、rebase 後は差分の確認とビルド比較だけで済んだ

## 却下した案

### vsce: override を残し、ADR-1338 の lock 側の assumption だけを外す

Design Doc の当初の推奨。変更は ADR-1338 の frontmatter 1 行で済むが、残るのは効いているかを機械で確かめられない floor で、
戻ってきたときに古い floor がそのまま効くことは、その floor が新しい advisory の脆弱範囲に入りうる以上、利点にならない
（ADR-3246「却下した案」）。

### vite: bot PR をそのままマージする

`packages/app` の宣言だけが 8.3.3 になり、`astro` / `vitest` / `vitefu` 経由の `vite@8.3.0` が lock に残る。dev server の
advisory なので実害は小さいが、override の floor が脆弱範囲の内側に残ると、override を外したときや別経路で同じことが起きる。

## 残したこと

- gh-aw の再生成（10-21 以降、上の手順）
- `uuid` の override は main の時点で既に利用元がいない。vsce とは関係が無いので ADR-3246 の範囲に入れていない
