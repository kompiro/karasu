---
id: ADR-2623
title: Dependabot トリアージ 2026-08-25 — ADR の assumptions に書いたリテラル依存版を緩める
status: accepted
date: 2026-08-25
topic: build
scope:
  packages: [app, cli, core, docs-site, lsp, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2562, ADR-2447, ADR-2115, ADR-1338, ADR-1593, ADR-1474, ADR-2401, ADR-2152, ADR-784]
assumptions:
  # 本 ADR の決定は「リテラルの依存版を assumptions に書かない」なので、
  # ここで literal な版を書くと自己矛盾する。caret pin の存在だけを表明する。
  - "grep: package.json :: \"oxfmt\": \"\\^0\\."
  - "grep: packages/docs-site/package.json :: \"astro\": \"\\^7\\."
---

# ADR-2623: Dependabot トリアージ 2026-08-25 — ADR の assumptions に書いたリテラル依存版を緩める

- **日付**: 2026-08-25
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2623](https://github.com/kompiro/karasu/pull/2623)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2614](https://github.com/kompiro/karasu/pull/2614) / [#2615](https://github.com/kompiro/karasu/pull/2615) / [#2616](https://github.com/kompiro/karasu/pull/2616) / [#2617](https://github.com/kompiro/karasu/pull/2617) / [#2618](https://github.com/kompiro/karasu/pull/2618) / [#2619](https://github.com/kompiro/karasu/pull/2619) / [#2620](https://github.com/kompiro/karasu/pull/2620) / [#2621](https://github.com/kompiro/karasu/pull/2621)
  - 差し替え PR: [#2626](https://github.com/kompiro/karasu/pull/2626)（oxfmt 0.63.0 + ADR-2447 の assumption 緩和）
  - assumption の版 pin を緩めた前例: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)（ADR-1338 の `fast-uri`）
  - 今回 assumption を緩めた ADR: [ADR-2447](2447-dependabot-triage-2026-08-10.md)
  - esbuild override の由来: [ADR-1593](1593-dependabot-security-2026-06-15.md)
  - override 運用ルール: [ADR-1474](1474-dependabot-security-2026-05-20.md) / [ADR-2401](2401-pnpm-11-migration.md)
  - rebase は差し替えの理由にならない: [ADR-2152](2152-dependabot-triage-2026-07-27.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 直前の triage: [ADR-2562](2562-dependabot-triage-2026-08-17.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-08-25（月）の weekly バッチ。npm から 8 件が起票され、[ADR-2447](2447-dependabot-triage-2026-08-10.md)
で 8 に引き上げた `open-pull-requests-limit` の枠をちょうど埋めた。`security` ラベル付きはゼロ、
`dependabot/alerts` の open も 0 件で、純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。

**サプライチェーン上の懸念はゼロだった。**

- **install / postinstall / prepare の新規追加はゼロ。** `esbuild` は 0.28.1 の時点で
  `postinstall: node install.js` を持っており 0.28.2 でも同一で、`allowBuilds` に明示済み。
- **配布主体の変化は 1 件のみ、しかも締まる方向。** `tsx` は 4.21.0 が人手 publish
  （provenance なし）だったのに対し、4.23.12 は GitHub Actions publish + SLSA provenance 付き。
- **cooldown 7 日は全件充足。** `oxfmt` の latest は 0.65.0、`lucide-react` は 1.34.0 だったが、
  cooldown を通過した版だけがオファーされていた。
- **既知 advisory の該当なし。**

判断が要ったのは供給側ではなく、**CI red 1 件の原因が upstream ではなく repo 側にあった**点である。

## 決定

**8 件すべてを採用した。却下・保留はゼロ。** うち [#2614](https://github.com/kompiro/karasu/pull/2614)
（oxfmt）のみ差し替え PR [#2626](https://github.com/kompiro/karasu/pull/2626) で入れ、あわせて
**ADR-2447 の `assumptions:` からリテラルの依存版（`oxfmt` / `vitest`）を外し、caret pin の
存在確認に緩めた。**

| PR | 依存 | from → to | 判断 | 反映 |
| --- | --- | --- | --- | --- |
| #2616 | `tsx` 4.21.0 → 4.23.12 | minor | 採用 | そのままマージ（最初に） |
| #2617 | `knip` 6.32.0 → 6.32.2 | patch | 採用 | そのままマージ |
| #2619 | `smol-toml` 1.7.1 → 1.8.0 | minor | 採用 | そのままマージ |
| #2618 | `lucide-react` 1.28.0 → 1.31.0 | minor | 採用 | そのままマージ |
| #2620 | `@testing-library/user-event` 14.6.3 → 14.6.4 | patch | 採用 | そのままマージ |
| #2615 | `astro` 7.2.0 → **7.2.3** | patch | 採用 | そのままマージ（rebase で 7.2.2 から繰り上がり） |
| #2621 | `esbuild` 0.28.1 → 0.28.2 | patch | 採用 | そのままマージ（最後に） |
| #2614 | `oxfmt` 0.62.0 → 0.63.0 | minor | 採用 | 差し替え PR [#2626](https://github.com/kompiro/karasu/pull/2626) |

却下はゼロなので `@dependabot ignore` は設定していない。

## 理由

### CI red の原因が repo 側なら、直すのは repo 側

#2614 の `Check` job で落ちていたのは 1 行だけだった。

```
✗ ADR-2447 :: grep: package.json :: "oxfmt": "\^0.62.0" — pattern not found in package.json
Checked 804 assumption(s): 798 OK, 1 failing, 5 manual-review.
```

**同じ job の `format:check` は 0.63.0 で通過していた。** [ADR-2447](2447-dependabot-triage-2026-08-10.md)
のときの 0.62.0 は整形の棚卸しを同梱する必要があって差し替え PR にしたが、今回はその理由は
成立しない。upstream 側も 0.62.0…0.63.0 間で oxfmt に入った変更は `sortImports` の
バリデーション分割 1 件だけで、`npm/oxfmt/CHANGELOG.md` は 0.63.0 の節を持たない
（oxlint v1.78.0 との合同リリース）。

つまり **bump 自体は無害で、落ちているのは repo 側の表明だけ**だった。

### リテラルの依存版は、そもそも ADR が表明したかった内容ではない

ADR-2447 が oxfmt について決めたのは「採用し、整形を同梱して入れる」であり、
vitest について決めたのは「peer が exact pin なので 9 manifest を揃えて動かす」である。
**`0.62.0` / `4.1.10` というリテラルの版は、どちらの決定の内容でもない。**
それを `assumptions:` に書いたために、決定は何も変わっていないのに次の bump で CI が落ちた。

そこで caret pin の存在確認（`"oxfmt": "\^0\.` / `"vitest": "\^4\.`）に緩めた。
これは [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) が ADR-1338 の
`fast-uri` に対して行ったのとまったく同じ判断で、ADR-1338 の緩和後の形をそのまま踏襲している。
`vitest` 側は今回まだ落ちていなかったが、**同じ形をしている以上、次の vitest bump で
同じ red が出る**ので同じコミットで緩めた。

反映が差し替え PR になったのは、Dependabot が `docs/adr/` を触らないため。bot の diff の形では
構造的に green にできない（`.claude/rules/dependabot.md`）。判断は「採用」なので
`@dependabot ignore` は設定していない。

### `find-process` は upstream の変更内容と一致していた

このバッチで唯一、lock に**新規のパッケージ名**が増えたのが #2615 だった。astro の
direct dependency として `find-process@^2.1.1` が増え、他は既存パッケージの別版か、その連れ
（`loglevel` / `@napi-rs/wasm-runtime` / `@astrojs/compiler-binding-wasm32-wasi` ほか）。

`find-process` の追加は astro 7.2.2 の
[#17671](https://github.com/withastro/astro/pull/17671)、「Docker コンテナ再起動後に無関係な
プロセスが PID を再利用していると `astro dev` が起動を拒む」修正で、lock ファイルの PID が
指すプロセスのコマンド名を確認するために入っている。**新規依存と変更内容が一致している**
（説明の付かない依存追加ではない）。

`find-process` 自体は 2016 年初版・30 版・maintainer は初版からの `yibn2008` で移管なし、
依存は `chalk` / `loglevel` / `commander`、**lifecycle script なし**。2.1.1 は 2026-03-17 公開で
バッチの 5 か月前。provenance attestation は無いが、直近 publish の版を掴まされたわけではなく、
`minimumReleaseAge: 1440`（[ADR-2401](2401-pnpm-11-migration.md)）も充足する。リスク low と判断した。

### advisory の脆弱範囲と override の floor を突き合わせた

`esbuild` は `pnpm-workspace.yaml` の `overrides` にも載っている
（[ADR-1593](1593-dependabot-security-2026-06-15.md): GHSA-gv7w-rqvm-qjhr high /
GHSA-g7r4-m6w7-qqqr low、どちらも fixed in 0.28.1）。`.claude/rules/dependabot.md` の指示どおり
突き合わせた結果、脆弱範囲 `< 0.28.1` に対して floor は `^0.28.1` で**既に脆弱範囲の外側**、
かつ 0.28.2 は `^0.28.1` を満たすので `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` は起きない。
override は触らずに済んだ。

### 唯一の production 依存 `smol-toml` は、変更 surface が使用箇所の外だった

#2619 だけが production 依存（`packages/core` の `dependencies`）で、
`packages/core/src/translate/wrangler.ts` が `parse` のみを使う。1.8.0 の feat は
`stringify` の Temporal 対応なので、挙動変化の実質的な surface は 1.7.2 の parser 性能
refactor に限られる。ここは `packages/core/src/translate/wrangler.test.ts` が押さえており、
CI は green だった。security 面でも 1.7.1 が GHSA-7w5x-hrqm-74c2 の修正版で floor は満たしていた。

## 結果

マージ順は「lock の peer suffix を最も広く畳む #2616（tsx）を最初に」とした。想定どおり
#2616 のマージで #2615 と #2621 が conflict し、`@dependabot rebase` で回復した
（[ADR-2152](2152-dependabot-triage-2026-07-27.md): rebase が要るだけでは差し替えの理由にならない）。
#2615 のマージで #2621 が再び conflict し、2 度目の rebase を要した。

**設計時の予測が 2 点外れた。どちらも実際は良い方向だった。**

1. **`esbuild` の重複は解消した。** Design Doc では「override の floor `^0.28.1` が 0.28.1 の
   残存を許すので #2621 をマージしても重複は残る」と書いたが、main の lock から
   `esbuild@0.28.1` は消え、0.28.2 の 1 本に畳まれた。0.28.1 を掴んでいたのは `tsx@4.21.0` と
   vite 2 インスタンスであり、**#2616 で tsx が 4.23.12 に畳まれた時点で 0.28.1 の consumer が
   消えていた**。lock hygiene の予測は、その版を掴んでいる consumer が同じバッチで動くかどうかを
   見ないと外れる。
2. **`smol-toml` も 1.8.0 の 1 本に畳まれた。** 「#2619 単体では 1.7.1 と 1.8.0 が並ぶ」と
   書いたが、`knip` 6.32.2（`^1.7.1`）と astro 7.2.3 が同じバッチで動いたため、1.7.1 の
   consumer が残らなかった。

**#2615 は rebase で対象版が 7.2.2 から 7.2.3 へ繰り上がった。** 7.2.3 は 2026-08-18 公開で、
rebase 時点でちょうど cooldown 7 日を満たしたため Dependabot が拾い直した。分析済みの版と
実際にマージした版がずれるので、7.2.3 を改めて確認した: publisher・provenance・lifecycle
script は 7.2.2 と同一、依存は 53 件で**数も名前も変わらず**、`@astrojs/internal-helpers`
0.10.2 → 0.10.3 / `@astrojs/markdown-satteri` 0.3.5 → 0.3.6 / `unifont` ~0.7.4 → ~0.7.5 の
版移動のみ。内容は patch fix 群で、唯一目を引く server 側 request handling の内部 refactor
（未公開の `app.pipeline` / `AppPipeline` export の削除）は adapter 向けであり、
docs-site は adapter 無しの静的 Starlight ビルドなので該当しない。

> **rebase は対象版を動かしうる。** cooldown を採用している以上、rebase 待ちの間に次の版が
> cooldown を通過すれば Dependabot はそちらへ乗り換える。分析した版と実際にマージする版が
> 同じであることは、マージ直前に PR タイトルで確認する。

## 却下した案 / 保留

**却下・保留はゼロ。**

assumption の扱いについては、採らなかった案が 2 つある。

- **`^0.63.0` に書き換える** — 次の oxfmt bump でまた red になり、同じ作業が毎回発生する。
  ADR-2115 が ADR-1338 に対して既に退けた案。
- **assumption から oxfmt 行を削除する** — ADR-2447 が「oxfmt を採用した」ことの live check を
  失う。緩めれば表明は保てるので、削除する理由がない。

`esbuild` の override floor を dedup 目的で `^0.28.2` に上げる案も検討して見送った。
`overrides` block は [ADR-1474](1474-dependabot-security-2026-05-20.md) が定めるとおり
advisory remediation の floor 置き場であり、floor は既に脆弱範囲の外側にあるので、
dedup を理由に動かすのは筋が違う。結果としても、上記のとおり重複は floor を触らずに解消した。

## 次にやること

**リテラルの依存版を `assumptions:` に書くのをやめる。** 今回で 2 度目
（ADR-1338 → ADR-2115、ADR-2447 → 本 ADR）であり、どちらも「決定の内容ではない値を
表明したせいで、決定が変わっていないのに CI が落ちた」という同じ形をしている。
`.claude/rules/adr.md` に明文化するかは [#2628](https://github.com/kompiro/karasu/issues/2628) で追う。
