---
id: ADR-2671
title: Dependabot トリアージ 2026-08-31 — exact peer は枠ではなく group で結ぶ
status: accepted
date: 2026-08-31
topic: build
scope:
  packages: [app, cli, core, docs-site, i18n, lsp, nest, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2623, ADR-2628, ADR-2447, ADR-2401, ADR-2152, ADR-1474, ADR-784]
assumptions:
  # ADR-2628 のとおり、リテラルの依存版は書かない。本 ADR が決めたのは
  # 「bundle 増を承知で SDK を採用する」ことなので、caret pin の存在だけを表明する。
  - "grep: packages/app/package.json :: \"@anthropic-ai/sdk\": \"\\^0\\."
---

# ADR-2671: Dependabot トリアージ 2026-08-31 — exact peer は枠ではなく group で結ぶ

- **日付**: 2026-08-31
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2671](https://github.com/kompiro/karasu/pull/2671)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2663](https://github.com/kompiro/karasu/pull/2663) / [#2664](https://github.com/kompiro/karasu/pull/2664) / [#2665](https://github.com/kompiro/karasu/pull/2665) / [#2666](https://github.com/kompiro/karasu/pull/2666) / [#2667](https://github.com/kompiro/karasu/pull/2667) / [#2668](https://github.com/kompiro/karasu/pull/2668) / [#2669](https://github.com/kompiro/karasu/pull/2669) / [#2670](https://github.com/kompiro/karasu/pull/2670)
  - 差し替え PR: [#2673](https://github.com/kompiro/karasu/pull/2673)（`vitest` + `@vitest/coverage-v8` を 4.1.11 へ同時に）
  - follow-up Issue: [#2674](https://github.com/kompiro/karasu/issues/2674)（`vitest` 系を `groups:` にまとめる）
  - 同じ vitest peer 問題の前例: [ADR-2447](2447-dependabot-triage-2026-08-10.md)（枠を 5 → 8、差し替え PR [#2438](https://github.com/kompiro/karasu/pull/2438)）
  - 直前の triage: [ADR-2623](2623-dependabot-triage-2026-08-25.md)
  - assumptions に版を書かない方針: [ADR-2628](2628-adr-assumption-version-policy.md)
  - rebase は差し替えの理由にならない: [ADR-2152](2152-dependabot-triage-2026-07-27.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - override 置き場と `minimumReleaseAge`: [ADR-2401](2401-pnpm-11-migration.md)
  - override 運用ルール: [ADR-1474](1474-dependabot-security-2026-05-20.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-08-31（月）の weekly バッチ。npm から 8 件が起票され、[ADR-2447](2447-dependabot-triage-2026-08-10.md)
で 8 に引き上げた `open-pull-requests-limit` の枠をちょうど埋めた
（[ADR-2623](2623-dependabot-triage-2026-08-25.md) の 2026-08-25 バッチに続いて **2 週連続の飽和**）。
`security` ラベル付きはゼロ、`dependabot/alerts` の open も 0 件で、純粋な version update バッチ。
8 件すべて CI green・`MERGEABLE CLEAN`。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。

**供給側（配布主体・改ざん）の懸念はゼロだった。** 判断が要ったのは 2 点、どちらも repo 側の事情である。

1. **[#2667](https://github.com/kompiro/karasu/pull/2667) は exact peer の相方が同じバッチに居ない。**
   ADR-2447 が枠を引き上げてまで防ごうとした形が、その 8 の枠で再発した。
2. **[#2668](https://github.com/kompiro/karasu/pull/2668) は 0.x の 29 マイナー跨ぎ**
   （`@anthropic-ai/sdk` 0.91.1 → 0.120.0）で、唯一の app runtime 依存。

## 決定

**8 件すべてを採用した。却下・保留はゼロ。** うち [#2667](https://github.com/kompiro/karasu/pull/2667)
のみ bot PR を close し、**差し替え PR [#2673](https://github.com/kompiro/karasu/pull/2673) で
`vitest` と同時に**入れた。あわせて **`vitest` 系を `groups:` にまとめる follow-up を
[#2674](https://github.com/kompiro/karasu/issues/2674) に起票した。**

| PR | 依存 | from → to | 判断 | 反映 |
| --- | --- | --- | --- | --- |
| #2670 | `@types/node` 26.2.0 → 26.3.0 | minor | 採用 | そのままマージ（最初に） |
| #2663 | `@types/react-dom` 19.2.4 → 19.2.5 | patch（react group） | 採用 | そのままマージ |
| #2668 | `@anthropic-ai/sdk` 0.91.1 → 0.120.0 | minor ×29 (0.x) | 採用 | そのままマージ |
| #2666 | `lucide-react` 1.31.0 → 1.34.0 | minor | 採用 | そのままマージ |
| #2664 | `@testing-library/user-event` 14.6.4 → 14.6.6 | patch | 採用 | そのままマージ |
| #2669 | `vite` 8.1.5 → 8.2.2 | minor | 採用 | そのままマージ（rebase 1 回） |
| #2665 | `@vitejs/plugin-react` 6.0.5 → 6.1.0 | minor | 採用 | そのままマージ（rebase 2 回） |
| #2667 | `@vitest/coverage-v8` 4.1.10 → 4.1.11 | patch | 採用（bot PR は close） | 差し替え PR [#2673](https://github.com/kompiro/karasu/pull/2673) |

却下はゼロなので `@dependabot ignore` は設定していない。

## 理由

### exact peer は「枠を広げる」では守れない

`@vitest/coverage-v8@4.1.11` の peer 宣言は **`vitest: "4.1.11"` の完全一致ピン**である。
一方 repo の 9 manifest はすべて `"vitest": "^4.1.10"` のままで、#2667 の lock は

```
pnpm-lock.yaml:9213  '@vitest/coverage-v8@4.1.11(vitest@4.1.10)':
```

と、**upstream が保証しない組み合わせを固定していた**。`strict-peer-dependencies` を
有効にしていないので install は通り、CI も green になる。
**CI green は「upstream の契約を満たしている」ことを意味しない**（ADR-2447 の再掲）。

`vitest@4.1.11` は 2026-08-18 公開で npm の `latest`、`@vitest/coverage-v8@4.1.11` と
**同一リリース**であり、cooldown 7 日も満たしていた。オファーされない理由は upstream 側に無い。
にもかかわらず `vitest` の PR は存在しなかった（open / closed とも 0 件）。原因は
`open-pull-requests-limit: 8` の飽和で、今回のバッチ #2663〜#2670 がちょうど枠を埋め、
`vitest` がそこから溢れていた。

ADR-2447 は「peer で結ばれた依存の片方だけが枠に入ると不整合が固定される」として
枠を 5 → 8 に引き上げたが、**引き上げは発生確率を下げただけで、形そのものは残っていた。**
枠は 2 週連続で飽和しており、**どんな枠幅も pair の同時到着を保証しない。**

構造的な解は枠ではなく `groups:` である。`react` group（版が一致しないと throw する）と
`lsp` group（protocol 版が食い違うと position がずれる）は既に同じ理由で存在しており、
**exact peer はそれらと同じクラスの制約**なので、同じ機構で結ぶのが筋である。
group なら枠も 2 つでなく 1 つで済み、飽和圧も同時に下がる。本バッチの範囲外なので
[#2674](https://github.com/kompiro/karasu/issues/2674) に切り出した。

反映は ADR-2447 の #2438 と同じく差し替え PR にした
（`.claude/rules/dependabot.md` が挙げる「peer が exact pin の相方を同一コミットで
動かす必要がある場合」に該当する）。判定は「採用」なので `@dependabot ignore` は設定していない。

### 受け入れ基準は「版が畳まれたか」ではなく peer エッジそのもの

差し替え PR の検証を当初「lock で `@vitest/*` が単一版に畳まれること」と書いていたが、
これは**今回問題にしている `(vitest@4.1.10)` の形を弾けない**。基準を peer エッジ自体に改めた。
#2673 で実際に確認したのは次の 2 点である。

```
$ grep -n "'@vitest/coverage-v8@4.1.11(vitest@" pnpm-lock.yaml
9172:  '@vitest/coverage-v8@4.1.11(vitest@4.1.11)':

$ grep -c "@4.1.10" pnpm-lock.yaml
0
```

### 供給側は全件クリーンだった

- **8 件の直接 bump 対象に lifecycle script の新規追加はゼロ**（既存宣言もゼロ）。
- **cooldown 7 日は全件充足**（最短は `@types/node@26.3.0` の 7 日ちょうど）。
  pnpm 側の `minimumReleaseAge: 1440`（[ADR-2401](2401-pnpm-11-migration.md)）も充足。
- **配布主体の変化・リポジトリ移管はゼロ。**
- **既知 advisory の該当なし**（open alert 0 件）。
- **`pnpm-workspace.yaml` の `overrides:` との衝突なし**（`vite@8: ^8.0.16` / `postcss: ^8.5.18` /
  `esbuild: ^0.28.1` はいずれも新版を含む）。

transitive の判定は**解決版の集合比較ではなく lock の依存エッジ差分**（両側から peer suffix を
剥がす）で行った。ツリーに新規で入るパッケージ名は 2 PR・計 4 件のみで、どちらも upstream の
変更内容と一致した。

- **#2668**: `standardwebhooks@1.0.0` / `@stablelib/base64@1.0.1` / `fast-sha256@1.3.0`。
  webhook 検証ヘルパーの連れで、いずれも公開から数年（910〜2419 日）経った版。
  `standardwebhooks` は `prepare: yarn run build` を**宣言している**が、`prepare` は git 依存や
  ソースからのビルド時にしか走らず、**公開 tarball の install では実行されない**。
  「宣言の有無」と「install で走るか」、「直接 bump 対象」と「グラフ全体」は別の軸として扱う。
- **#2669**: `@rolldown/binding-android-arm-eabi@1.2.5`。rolldown 公式 org・attested の
  optional な platform binary で、同時に `@rolldown/binding-wasm32-wasi` が落ちている。

### `@anthropic-ai/sdk` は API surface ではなく bundle が動く

0.91.1 → 0.120.0 は 29 マイナー・約 4 か月分を一度に跨ぐが、**CHANGELOG の当該レンジに
`⚠ BREAKING CHANGES` セクションは 1 件も無い**（`BREAKING` の見出しはすべて 0.3x 世代）。
API surface に触る `remove` 系 3 件はいずれも影響しない — `mid_conv_system` は未使用、
retired models の削除に対して app が使う `claude-sonnet-4-6` は 0.120.0 の `Model` union に現存
（`resources/messages/messages.d.ts:2066`）、nonfunctional types の削除は typecheck green。
repo 側の使用 surface も `new Anthropic(...)` / `messages.create` / `APIError.status` と
3 つの型だけで、SDK で最も安定した部分である。

**動くのは bundle size のほうだった。** Design Doc は当初「app は webhooks を import しないので
`standardwebhooks` は bundle に入らない」と書いていたが、**これは誤りで、レビューで反証された。**
SDK の import 連鎖は静的かつコンストラクタ経由の live reference になっている。

```
client.mjs:925   this.beta = new API.Beta(this);          ← Anthropic の constructor
beta.mjs:47      this.webhooks = new WebhooksAPI.Webhooks(this._client);
webhooks.mjs:3   import { Webhook } from 'standardwebhooks';
```

`new Anthropic(...)` した時点で `Webhooks` は到達可能なので Rollup は落とせない。
app と同じ import 形で隔離した Vite production build の実測値:

| build | raw | gzip | `whsec_` / `standardwebhooks` |
| --- | --- | --- | --- |
| SDK 0.91.1 | 205.80 kB | 43.17 kB | なし |
| SDK 0.120.0 | 397.68 kB | 89.39 kB | **あり** |
| SDK 0.120.0（`standardwebhooks` を stub に alias） | 375.95 kB | 83.40 kB | なし |

**増分は +191.88 kB raw / +46.22 kB gzip（およそ倍）**、うち webhook ヘルパー 3 件の寄与は
+21.73 kB raw / +5.99 kB gzip で 1 割強。**主因は webhook ヘルパーではなく SDK 本体の
API surface 成長**（Files / Skills / computer use / browser use / managed agents）である。
SDK は client を通さず Beta を外せる import path を持たないので、この 6 kB を避ける手段は
版を止める以外に無い。**repo に bundle size の CI gate は無く、この増分は自動では検出されない。**

## 結果

マージ順は「peer suffix を最も広く畳むものを先に」とし、#2670（`@types/node`、9 manifest）を
起点に #2663 → #2668 → #2666 → #2664 を順にマージした。**5 件は conflict なしで通った。**

残り 2 件は rebase を要した（[ADR-2152](2152-dependabot-triage-2026-07-27.md) のとおり、
rebase が要るだけでは差し替えの理由にならない）。

- **#2669（`vite`）** — #2670 のマージ直後に conflict。`@dependabot rebase` 1 回で回復。
- **#2665（`@vitejs/plugin-react`）** — 2 回要した。1 回目の rebase 完了後、
  **#2669 のマージで再び conflict した**ため。

**設計時の予測が 1 点外れた。** Design Doc はマージ順を #2670 → #2669 → #2663 → 残りとし、
「peer suffix の書き換えが広いものを先に置けば後続の conflict が減る」と書いたが、
実際には **#2670 のマージ時点で #2669 と #2665 が即座に conflict した**ので、
その順序は成立しなかった。lock を触る PR どうしは順序に関わらず直列化するため、
**clean なものを先に流し、conflict したものを最後にまとめて rebase する**ほうが rebase 回数が減る。
今回はその形に切り替えた結果、rebase は #2669 に 1 回、#2665 に 2 回で済んだ。

**rebase による対象版の繰り上がりは起きなかった。** [ADR-2623](2623-dependabot-triage-2026-08-25.md)
で astro が 7.2.2 → 7.2.3 に動いた前例があるためマージ直前に PR タイトルを確認したが、
#2669 は 8.2.2、#2665 は 6.1.0 のままで、分析した版と実際にマージした版は一致した。

**レビューが供給側でない誤りを 1 件捕まえた。** 上記の tree-shaking の誤りは、
Design Doc の PR レビューで指摘され、隔離ビルドの実測で確定した。
この形（供給側は clean だが repo 側への影響評価を外す）は cooldown・provenance・
lifecycle script のどのチェックにも掛からない。

## 却下した案 / 保留

**却下・保留はゼロ。**

#2667 の扱いについて、採らなかった案が 3 つある。

- **#2667 をそのままマージする** — lock に `@vitest/coverage-v8@4.1.11(vitest@4.1.10)` が
  固定される。CI は green だが upstream の契約は満たさない。ADR-2447 が既に退けた案。
- **#2667 を保留し、枠が空いた次週に `vitest` と揃うのを待つ** — 枠は 2 週連続で飽和しており、
  次週も `vitest` が枠に入る保証がない。「待って解消する種類の問題ではない」（ADR-2447）。
- **`open-pull-requests-limit` を更に引き上げる** — 5 → 8 で防げなかった以上、9 以上にしても
  同じ再発を先送りするだけ。枠は確率を下げるだけで peer の同時性を保証しない。
  だから枠ではなく group（[#2674](https://github.com/kompiro/karasu/issues/2674)）を選んだ。

#2668 の bundle 増についても、採らなかった案が 1 つある。

- **#2668 を保留し、bundle 増を避ける** — 増分の主因は SDK 本体の API surface 成長なので、
  保留しても次のバッチに同じ増分が更に大きくなって戻ってくるだけである。
  `standardwebhooks` 分の 6 kB を避ける import path も SDK 側に無い。
  **保留は増分を消さず、跨ぐマイナー数を増やすだけ**なので採らない。
  bundle size を継続的に見るならそれは CI gate の話であり、トリアージとは別に起こすべきである。

## 次にやること

**`vitest` 系を `.github/dependabot.yml` の `groups:` にまとめる**
（[#2674](https://github.com/kompiro/karasu/issues/2674)）。今回で 2 度目
（[ADR-2447](2447-dependabot-triage-2026-08-10.md) → 本 ADR）であり、どちらも
「exact peer の相方が PR 枠から溢れ、差し替え PR で人手で揃えた」という同じ形をしている。
1 度目の対処が枠の引き上げで、それが効かなかったことが今回わかった以上、次は機構を変える。
