# Dependabot トリアージ 2026-08-31 — exact peer の相方が PR 枠から溢れた

- **日付**: 2026-08-31
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2663](https://github.com/kompiro/karasu/pull/2663) / [#2664](https://github.com/kompiro/karasu/pull/2664) / [#2665](https://github.com/kompiro/karasu/pull/2665) / [#2666](https://github.com/kompiro/karasu/pull/2666) / [#2667](https://github.com/kompiro/karasu/pull/2667) / [#2668](https://github.com/kompiro/karasu/pull/2668) / [#2669](https://github.com/kompiro/karasu/pull/2669) / [#2670](https://github.com/kompiro/karasu/pull/2670)
  - 直前の triage: [ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)
  - 同じ vitest peer 問題の前例: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)（`open-pull-requests-limit` を 5 → 8 に引き上げ、差し替え PR [#2438](https://github.com/kompiro/karasu/pull/2438) で 9 manifest を同時に動かした）
  - 差し替え PR の判定基準: `.claude/rules/dependabot.md`「判定語彙」
  - rebase は差し替えの理由にならない: [ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - override 置き場と `minimumReleaseAge`: [ADR-2401](../adr/2401-pnpm-11-migration.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」
  - 関連 TPL: 該当なし（`docs/test-perspectives/` を `dependencies` / `dependabot` で検索して 0 件）

## 背景・課題

2026-08-31（月）の weekly バッチ。npm から 8 件が起票され、[ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
で 8 に引き上げた `open-pull-requests-limit` の枠をちょうど埋めた（[ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)
の 2026-08-25 バッチに続いて 2 週連続の飽和）。`security` ラベル付きはゼロ、
`gh api repos/kompiro/karasu/dependabot/alerts` の open も 0 件で、純粋な version update バッチ。
**8 件すべて CI green・`MERGEABLE CLEAN`。**

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。

**供給側（配布主体・改ざん）の懸念はゼロだった。** 判断が要ったのは 2 点、
どちらも repo 側の事情である。

1. **[#2667](https://github.com/kompiro/karasu/pull/2667) は exact peer の相方が同じバッチに居ない。**
   ADR-2447 が枠を 5 → 8 に引き上げてまで防ごうとした形が、その 8 の枠で再発した。
2. **[#2668](https://github.com/kompiro/karasu/pull/2668) は 0.x の 29 マイナー跨ぎ**（`@anthropic-ai/sdk`
   0.91.1 → 0.120.0）で、唯一の app runtime 依存。

## 現状（インベントリ）

| PR | 依存 | from → to | 種別 | direct/transitive | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#2670](https://github.com/kompiro/karasu/pull/2670) | `@types/node` | 26.2.0 → 26.3.0 | minor | direct (dev, 9 manifest) | green | low | 採用（そのまま） |
| [#2669](https://github.com/kompiro/karasu/pull/2669) | `vite` | 8.1.5 → 8.2.2 | minor | direct (dev, app) | green | low | 採用（そのまま） |
| [#2668](https://github.com/kompiro/karasu/pull/2668) | `@anthropic-ai/sdk` | 0.91.1 → 0.120.0 | minor ×29 (0.x) | direct (**prod**, app) | green | **medium** | 採用（そのまま） |
| [#2667](https://github.com/kompiro/karasu/pull/2667) | `@vitest/coverage-v8` | 4.1.10 → 4.1.11 | patch | direct (dev, 6 manifest) | green | low（供給側）/ **要対処**（peer） | 採用（**差し替え PR**） |
| [#2666](https://github.com/kompiro/karasu/pull/2666) | `lucide-react` | 1.31.0 → 1.34.0 | minor | direct (prod, app) | green | low | 採用（そのまま） |
| [#2665](https://github.com/kompiro/karasu/pull/2665) | `@vitejs/plugin-react` | 6.0.5 → 6.1.0 | minor | direct (dev, app) | green | low | 採用（そのまま） |
| [#2664](https://github.com/kompiro/karasu/pull/2664) | `@testing-library/user-event` | 14.6.4 → 14.6.6 | patch | direct (dev, app) | green | low | 採用（そのまま） |
| [#2663](https://github.com/kompiro/karasu/pull/2663) | `@types/react-dom` | 19.2.4 → 19.2.5 | patch（react group） | direct (dev, app) | green | low | 採用（そのまま） |

### 供給側の事実（npm registry 実測）

| パッケージ@版 | 公開日 | 経過 | publisher / provenance | lifecycle script |
| --- | --- | --- | --- | --- |
| `@types/node@26.3.0` | 2026-08-24 | 7d | `types`（Microsoft bot） / なし | なし |
| `vite@8.2.2` | 2026-08-20 | 12d | `vitebot` ほか / **attested** | なし |
| `@anthropic-ai/sdk@0.120.0` | 2026-08-19 | 12d | Anthropic 13 名 / **attested** | なし |
| `@vitest/coverage-v8@4.1.11` | 2026-08-18 | 13d | GitHub Actions / **attested** | なし |
| `lucide-react@1.34.0` | — | — | `ericfennis` / **attested** | なし |
| `@vitejs/plugin-react@6.1.0` | — | — | `yyx990803` / `vitebot` / **attested** | なし |
| `@testing-library/user-event@14.6.6` | — | — | testing-library 18 名 / **attested** | なし |
| `@types/react-dom@19.2.5` | 2026-08-23 | 8d | `types`（Microsoft bot） / なし | なし |

- **install / postinstall / prepare の新規追加はゼロ。**
- **cooldown 7 日は全件充足**（最短は `@types/node@26.3.0` の 7 日ちょうど）。
  pnpm 側の `minimumReleaseAge: 1440`（[ADR-2401](../adr/2401-pnpm-11-migration.md)）も全件充足。
- **配布主体の変化・リポジトリ移管はゼロ。** `@types/*` の provenance なしは
  DefinitelyTyped の常態で、publisher は Microsoft の `types` bot のまま。
- **既知 advisory の該当なし**（open alert 0 件）。
- **`pnpm-workspace.yaml` の `overrides:` との衝突なし。** 関係するのは
  `vite@8: ^8.0.16`（8.2.2 は満たす）・`postcss: ^8.5.18`（vite 8.2.2 が要求する
  `^8.5.26` は内側）・`esbuild: ^0.28.1`（0.28.2 は満たす）で、
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` の条件には当たらない。

### lock の依存エッジ差分

解決版の集合比較では既にグラフにある版への乗り換えを取り逃がすため、
`pnpm-lock.yaml` の `importers` / `snapshots` から peer suffix を剥がした
**依存エッジ**を base と PR head で比較した。

| PR | 追加エッジ | 削除エッジ | ツリーに**新規で入る**パッケージ名 |
| --- | --- | --- | --- |
| #2663 | 22 | 22 | なし |
| #2664 | 2 | 2 | なし |
| #2665 | 3 | 3 | なし |
| #2666 | 2 | 2 | なし |
| #2667 | 25 | 6 | なし |
| #2668 | 7 | 4 | `standardwebhooks`, `@stablelib/base64`, `fast-sha256` |
| #2669 | 33 | 39 | `@rolldown/binding-android-arm-eabi` |
| #2670 | 18 | 18 | なし |

新規パッケージ名は 2 PR・計 4 件のみで、どちらも upstream の変更内容と一致した（後述）。

## 制約・前提

- 判定語彙は **採用 / 保留 / 却下** の 3 値、反映手段（そのままマージ / 差し替え PR）は別軸
  （`.claude/rules/dependabot.md`）。差し替え PR は「採用」の一形態であり、
  `@dependabot ignore` は設定しない。
- 差し替え PR を使うのは **bot が作れる diff の形では正しい変更にならないとき**に限る。
  「rebase が要るだけ」は理由にならない（[ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md)）。
- Dependabot は `docs/adr/` を触らないので、ADR 側の追随が要る bump は構造的に
  bot ブランチでは green にできない。今回は該当なし（`adr:check-assumptions` は全件 green）。
- 対象版は rebase で繰り上がりうる（[ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)）。
  マージ直前に PR タイトルで分析済みの版と一致することを確認する。

## 現時点の方針

**8 件すべて採用する。却下・保留はゼロ。** ただし
[#2667](https://github.com/kompiro/karasu/pull/2667) だけは bot PR を close し、
**`vitest` と同時に動かす差し替え PR** で入れる。

### #2667 — exact peer の相方が PR 枠から溢れた（今回の唯一の実質判断）

`@vitest/coverage-v8@4.1.11` の peer 宣言は **`vitest: "4.1.11"` の完全一致ピン**である
（`@vitest/browser: "4.1.11"` も同様。repo は `@vitest/browser` を使っていない）。
一方 repo の 9 manifest はすべて `"vitest": "^4.1.10"` のままで、#2667 の lock は

```
pnpm-lock.yaml:9213  '@vitest/coverage-v8@4.1.11(vitest@4.1.10)':
```

と、**upstream が保証しない組み合わせを固定している**。`strict-peer-dependencies` を
有効にしていないので install は通り、CI も green になる。
**CI green は「upstream の契約を満たしている」ことを意味しない**（ADR-2447 の再掲）。

`vitest@4.1.11` は **2026-08-18 公開で npm の `latest`**、cooldown 7 日も満たしており、
オファーされない理由は upstream 側には無い。実際 `@vitest/coverage-v8@4.1.11` は
同じ 2026-08-18 の同一リリースで、**両者は同時にオファー可能だった**。
にもかかわらず `vitest` の PR は存在しない（open / closed とも 0 件）。

原因は **`open-pull-requests-limit: 8` の飽和**である。今回のバッチは #2663〜#2670 の
ちょうど 8 件で枠を埋めており、`vitest` はそこから溢れた。
これは [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md) が

> peer で結ばれた依存の片方だけが枠に入ると、枠が空くのを待つ間に片方をマージした
> 時点で不整合が固定される。これは待って解消する種類の問題ではない。

と書いて枠を 5 → 8 に引き上げた、まさにその形の再発である。**引き上げは発生確率を
下げただけで、形そのものは残っていた。**

したがって処理は ADR-2447 の #2438 と同じにする — **#2667 を close し、差し替え PR で
`vitest` を 9 manifest、`@vitest/coverage-v8` を 6 manifest、いずれも `^4.1.11` へ
同一コミットで揃える。** これは `.claude/rules/dependabot.md` が差し替え PR の典型として
挙げる「peer が exact pin の相方を同一コミットで動かす必要がある場合」に該当する。

> **枠を更に広げる案は本 Doc では採らない。** ADR-2447 の 5 → 8 が示したとおり、
> 枠の引き上げは同じ再発を先送りするだけである。構造的な解は
> `.github/dependabot.yml` の `groups:` に `vitest` 系をまとめることだが、
> それは本トリアージの範囲外なので「次にやること」に切り出す。

### #2668 — 0.x の 29 マイナー跨ぎだが、使用 surface は動いていない

唯一 medium と判定した PR。`@anthropic-ai/sdk` は `packages/app` の **production 依存**で、
0.x では minor が破壊的変更の置き場になる。0.91.1（2026-04-24）から 0.120.0（2026-08-19）まで
**29 マイナー**、約 4 か月分を一度に跨ぐ。

**CHANGELOG の当該レンジに `⚠ BREAKING CHANGES` セクションは 1 件も無い。**
tarball の `CHANGELOG.md` で `0.120.0`（3 行目）から `0.91.1`（561 行目）までを走査した結果、
`BREAKING` の見出しはすべて 2400 行以降＝0.3x 世代のものだった。
レンジ内の `remove` 系エントリのうち API surface に触るのは 3 件で、いずれも repo に影響しない。

| エントリ | 影響 |
| --- | --- |
| remove unsupported `mid_conv_system` content block | 未使用 |
| remove retired Claude Opus 4.1 models / remove retired models | app が使う `claude-sonnet-4-6` は **0.120.0 の `Model` union に現存**（`resources/messages/messages.d.ts:2066`） |
| remove some nonfunctional types from the SDKs | typecheck green |

repo 側の使用 surface は狭い — `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`、
`client.messages.create`、`APIError`（`status` のみ参照）、型は
`Messages.MessageParam` / `ContentBlockParam` / `Tool` だけである
（`packages/app/src/hooks/useChatSession.ts` ほか）。いずれも SDK で最も安定した部分で、
`Check` job の `pnpm run typecheck` が green であることがその裏づけになる。

**新規 transitive 3 件は webhook 検証ヘルパーの連れで、変更内容と一致している。**
`standardwebhooks` は SDK 内で `resources/beta/webhooks.js` からのみ参照され、
app は webhooks を import しないので bundle には入らない。

| パッケージ | 素性 |
| --- | --- |
| `standardwebhooks@1.0.0` | standard-webhooks 公式実装。maintainer `tasn`。2024-03-04 公開（910 日前） |
| `@stablelib/base64@1.0.1` | StableLib（`dchest` = Dmitry Chestnykh）。2021-05-21 公開（1929 日前） |
| `fast-sha256@1.3.0` | 同じく `dchest`。2020-01-16 公開（2419 日前） |

`standardwebhooks` は `prepare: yarn run build` を持つが、**`prepare` は git 依存や
ソースからのビルド時にしか走らず、公開 tarball の install では実行されない**。
3 件とも公開から数年経った版で、直近公開版を掴まされたわけではない。

### #2669 — rolldown の platform binary が 1 つ増えただけ

`vite` 8.1.5 → 8.2.2 に伴い `rolldown` 1.1.5 → 1.2.5。新規名 1 件
`@rolldown/binding-android-arm-eabi@1.2.5` は **optional な platform binary** で、
rolldown 公式 org（`yyx990803` / `sapphi-red` ほか）・**attested**・lifecycle script なし。
同時に `@rolldown/binding-wasm32-wasi` が落ちており、増減はプラットフォーム対応表の
入れ替えとして筋が通る。ほかは既存パッケージの版移動のみ
（`@oxc-project/types` 0.139.0 → 0.146.0、`postcss` 8.5.25 → 8.5.26、`picomatch` 4.0.5 → 4.0.7）。

> **lock 上の `vite` 二重化（8.2.1 と 8.2.2）は #2669 が作るものではない。** main の時点で既に
> app 宣言の 8.1.5 と、他パッケージが vitest 経由で掴む 8.2.1 に割れており、#2669 後は
> 8.2.2 と 8.2.1 になる。本数は変わらないので、本 Doc では追わない。

### その他 4 件

- **#2670 `@types/node` 26.2.0 → 26.3.0** — 9 manifest。DefinitelyTyped、`undici-types ~8.3.0` のみ。
- **#2666 `lucide-react` 1.31.0 → 1.34.0** — アイコン追加のみ（`mail-clock` / `list-clock` /
  `square-dimensions` / `usb-c-port` / `audio-lines-off`）。エッジ差分も 2/2 で連れなし。
- **#2665 `@vitejs/plugin-react` 6.0.5 → 6.1.0** — 追加されたのは **experimental な
  native React Compiler 対応**で、`oxc-transform-react` を別途 install して
  `compiler: true` を渡したときだけ効く optional peer。repo は渡していないので挙動不変。
- **#2664 `@testing-library/user-event` 14.6.4 → 14.6.6** — bug fix 2 件
  （`pointerType` の既定値、keydown 中に focus が動いたときの tab 再ターゲット）。
- **#2663 `@types/react-dom` 19.2.4 → 19.2.5** — react group。22 エッジは
  すべて radix-ui の peer suffix 書き換えで、新規名なし。

### 反映手順

1. **#2670（`@types/node`）を最初にマージする。** 9 manifest に効き、`vitest` / `vite`
   スナップショットの peer suffix に最も広く現れるので、ここを先に畳むと後続の
   conflict が減る。
2. **#2669（`vite`）→ #2663（`@types/react-dom`）** の順。どちらも peer suffix の
   書き換えが広い。
3. 残り **#2668 / #2666 / #2665 / #2664** を任意順でマージ。
4. conflict したら `@dependabot rebase`。**rebase 後は PR タイトルで対象版が
   繰り上がっていないか確認する**（[ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)）。
5. **#2667 を close** し、差し替え PR を出す:
   - `vitest` を `^4.1.11` へ（9 manifest: root, app, cli, core, docs-site, i18n, lsp, nest, vscode）
   - `@vitest/coverage-v8` を `^4.1.11` へ（6 manifest: app, cli, core, docs-site, i18n, nest）
   - `pnpm install` 後、lock で `@vitest/*` が単一版に畳まれることを確認する
   - 判定は「採用」なので `@dependabot ignore` は設定しない

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（app の Chat 機能が使う SDK 版が上がるが、使用 API は不変）。
- ドキュメント更新: なし。
- テスト・examples への影響: なし。`packages/app/src/hooks/useChatSession.cancel.test.tsx` は
  `@anthropic-ai/sdk` を `vi.mock` しているので SDK 版に依存しない。

## 却下した案 / 保留

**却下・保留はゼロ。**

#2667 の扱いについて、採らなかった案が 3 つある。

- **#2667 をそのままマージする** — lock に `@vitest/coverage-v8@4.1.11(vitest@4.1.10)` が
  固定される。CI は green だが upstream の契約は満たさない。ADR-2447 が既に退けた案。
- **#2667 を保留し、枠が空いた次週に `vitest` と揃うのを待つ** — 待てば解消する形に見えるが、
  枠は 2 週連続で飽和しており、次週も `vitest` が枠に入る保証がない。
  「待って解消する種類の問題ではない」（ADR-2447）。
- **`open-pull-requests-limit` を更に引き上げる** — 5 → 8 で防げなかった以上、
  9 以上にしても同じ再発を先送りするだけ。枠は確率を下げるだけで、
  peer の同時性を保証しない。

## 次にやること

**`vitest` 系を `.github/dependabot.yml` の `groups:` にまとめる。**
今回で 2 度目（[ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md) → 本 Doc）であり、
どちらも「exact peer の相方が PR 枠から溢れ、差し替え PR で人手で揃えた」という同じ形をしている。
`react` group（版が一致しないと throw する）と `lsp` group（protocol 版が食い違うと
position がずれる）は既に同じ理由で存在しており、**`vitest` + `@vitest/coverage-v8` は
peer が exact pin である以上、枠ではなく group で結ぶのが筋**である。

group 化すれば枠 1 つで両者が届くため、`open-pull-requests-limit` の飽和圧も同時に下がる。
本トリアージの範囲外なので、別 Issue に切り出して追う。
