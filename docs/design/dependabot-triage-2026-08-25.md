# Dependabot トリアージ 2026-08-25 — 全 8 件採用、oxfmt だけ ADR assumption の版 pin で CI red

- **日付**: 2026-08-25
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2614](https://github.com/kompiro/karasu/pull/2614) / [#2615](https://github.com/kompiro/karasu/pull/2615) / [#2616](https://github.com/kompiro/karasu/pull/2616) / [#2617](https://github.com/kompiro/karasu/pull/2617) / [#2618](https://github.com/kompiro/karasu/pull/2618) / [#2619](https://github.com/kompiro/karasu/pull/2619) / [#2620](https://github.com/kompiro/karasu/pull/2620) / [#2621](https://github.com/kompiro/karasu/pull/2621)
  - 直前の triage: [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md)
  - assumption の版 pin を緩めた前例: [ADR-2115](../adr/2115-dependabot-security-2026-07-22-second-batch.md)（ADR-1338 の `fast-uri` パッチ番号を緩めた）
  - 今回 assumption が壊れる ADR: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
  - esbuild override の由来: [ADR-1593](../adr/1593-dependabot-security-2026-06-15.md)（GHSA-gv7w-rqvm-qjhr / GHSA-g7r4-m6w7-qqqr、fixed in 0.28.1）
  - override 運用ルール: [ADR-1474](../adr/1474-dependabot-security-2026-05-20.md) / [ADR-2401](../adr/2401-pnpm-11-migration.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景・課題

2026-08-25（月）の weekly バッチ。npm から 8 件が起票され、[ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
で 8 に引き上げた `open-pull-requests-limit` の枠をちょうど埋めた。`security` ラベル付きはゼロ、
`dependabot/alerts` の open も 0 件で、純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 8 件を upstream まで遡って分析した。

**サプライチェーン上の懸念はゼロだった。** publisher / provenance / lifecycle script /
依存ツリーの変化 / 既知 advisory を全件確認した結果:

- **install / postinstall / prepare の新規追加はゼロ。** `esbuild` は 0.28.1 の時点で
  `postinstall: node install.js` を持っており、0.28.2 でも同一（新規追加ではない）。
  この postinstall は `allowBuilds: esbuild: true` で既に明示許可済み。
- **配布主体の変化は 1 件のみ、しかも締まる方向。** `tsx` は 4.21.0 が人手 publish
  （`_npmUser: hirokiosame`、provenance なし）だったのに対し、4.23.12 は GitHub Actions
  publish + SLSA provenance attestation 付きになった。他 7 件は publisher 不変。
- **cooldown 7 日は全件充足。** 最も新しい `to` 版でも `astro@7.2.2`（2026-08-13 公開、
  12 日経過）。`oxfmt` の latest は既に 0.65.0、`lucide-react` は 1.34.0 だが、
  cooldown が効いて 7 日以上経過した版だけがオファーされている。
- **既知 advisory の該当なし。** `dependabot/alerts` の open は 0 件。

一方、判断が要る点が 2 つあった。

1. **#2614（oxfmt）だけ CI red**。原因は upstream ではなく repo 側の
   [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md) の `assumptions` が
   `"oxfmt": "^0.62.0"` というリテラルの版を pin していること。bot の diff では構造的に
   green にできない。
2. **lock に新規パッケージ名が増える PR が 1 件ある**（#2615 の `find-process` ほか）。
   直前バッチ（ADR-2562）ではゼロだったので、今回は追加分を個別に確認した。

## 現状（インベントリ）

| PR | 依存 | from → to | 種別 | 位置 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#2614](https://github.com/kompiro/karasu/pull/2614) | `oxfmt` | 0.62.0 → 0.63.0 | minor | root devDep | **red** | low | 採用（差し替え PR） |
| [#2615](https://github.com/kompiro/karasu/pull/2615) | `astro` | 7.2.0 → 7.2.2 | patch | docs-site devDep | green | low | 採用（そのままマージ） |
| [#2616](https://github.com/kompiro/karasu/pull/2616) | `tsx` | 4.21.0 → 4.23.12 | minor | root + docs-site devDep | green | low | 採用（そのままマージ、**最初に**） |
| [#2617](https://github.com/kompiro/karasu/pull/2617) | `knip` | 6.32.0 → 6.32.2 | patch | root devDep | green | low | 採用（そのままマージ） |
| [#2618](https://github.com/kompiro/karasu/pull/2618) | `lucide-react` | 1.28.0 → 1.31.0 | minor | app dep | green | low | 採用（そのままマージ） |
| [#2619](https://github.com/kompiro/karasu/pull/2619) | `smol-toml` | 1.7.1 → 1.8.0 | minor | **core の production dep** | green | low | 採用（そのままマージ） |
| [#2620](https://github.com/kompiro/karasu/pull/2620) | `@testing-library/user-event` | 14.6.3 → 14.6.4 | patch | app devDep | green | low | 採用（そのままマージ） |
| [#2621](https://github.com/kompiro/karasu/pull/2621) | `esbuild` | 0.28.1 → 0.28.2 | patch | cli / lsp / vscode devDep | green | low | 採用（そのままマージ、#2616 の後） |

## 検討した選択肢

### #2614（oxfmt 0.62.0 → 0.63.0）— CI red の扱い

`Check` job は `pnpm exec adr check-assumptions` で落ちている。落ちているのは 1 件だけ:

```
✗ ADR-2447 :: grep: package.json :: "oxfmt": "\^0.62.0" — pattern not found in package.json
Checked 804 assumption(s): 798 OK, 1 failing, 5 manual-review.
```

**同じ job の `format:check` は green を通過している。** つまり oxfmt 0.63.0 は現在の
コードベースに対して整形差分を出さない。[ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
のときの 0.62.0 は整形の棚卸しを同梱する必要があって差し替え PR にしたが、**今回は
その理由は成立しない**。upstream 側も、0.62.0…0.63.0 間で oxfmt に入った変更は
`refactor(oxfmt,formatter): split sortImports validation and use type enum` の 1 件だけで、
`npm/oxfmt/CHANGELOG.md` は 0.63.0 の節を持たない（0.63.0 は oxlint v1.78.0 との合同リリース）。

残る問題は assumption の版 pin だけである。選択肢は 3 つ。

| 案 | 内容 | 評価 |
| --- | --- | --- |
| A | assumption を `^0.63.0` に書き換える | 次の oxfmt bump でまた red。同じ作業が毎回発生する |
| B | assumption から oxfmt 行を削除する | ADR-2447 が「oxfmt を採用した」事実の live check を失う |
| C | **assumption を版非依存に緩める**（`"oxfmt": "\^0\.` の存在確認に落とす） | ADR-2447 の主張を保ったまま以後の bump で壊れない |

**C を推す。** [ADR-2115](../adr/2115-dependabot-security-2026-07-22-second-batch.md) が
ADR-1338 の `fast-uri` に対してまったく同じ判断をしている前例がある。ADR-2447 が
oxfmt について表明したかったのは「oxfmt を formatter として採用し、bump 時は整形を
同梱して入れる」であって、`0.62.0` というリテラルの minor 版ではない。

ADR-2447 は `"vitest": "\^4.1.10"` も同じ形で pin しており、**次に vitest が bump された
瞬間に同じ red が再発する**。同じ PR で両方緩めるのが安い。

反映手段は **差し替え PR**。Dependabot は `docs/adr/` を触れないので、bot の diff の形では
構造的に green にできない（`.claude/rules/dependabot.md`「bot が作れる diff の形では
正しい変更にならないとき」に該当）。判断は「採用」なので `@dependabot ignore` は設定しない。

### #2615（astro 7.2.0 → 7.2.2）— lock に増える新規パッケージ

このバッチで唯一、lock に**新規のパッケージ名**が増える PR。増えるのは 9 件:

`find-process@2.1.1` / `loglevel@1.9.2` / `@napi-rs/wasm-runtime@1.2.3` /
`@astrojs/compiler-binding-wasm32-wasi@0.3.2` / `es-module-lexer@2.3.2` /
`magic-string@1.2.0` / `ohash@2.0.12` / `unifont@0.7.5` / `smol-toml@1.8.0`

うち **`find-process` だけが astro の direct dependency の新規追加**（`^2.1.1`）で、
他は既存パッケージの別版か、その推移的な連れ。`find-process` の追加は release note で
説明が付く: astro 7.2.2 の
[#17671](https://github.com/withastro/astro/pull/17671)「Docker コンテナ再起動後に無関係な
プロセスが PID を再利用していると `astro dev` が起動を拒む」修正で、lock ファイルの PID が
指すプロセスのコマンド名を確認するために入った。**変更内容と新規依存が一致している。**

`find-process` 自体の素性:

- 2016-01 初版、30 版、maintainer は `yibn2008`（初版からの著者）で移管なし
- 依存は `chalk` / `loglevel` / `commander` の 3 つ、いずれも主流
- **lifecycle script なし**（`scripts` は dev / build / test のみで、install 系はゼロ）
- 2.1.1 は 2026-03-17 公開で、このバッチの 5 か月前。provenance attestation は無い

provenance が無い点は弱いが、公開から 5 か月経過した既存版であり、直近に publish された
版を掴まされているわけではない。`minimumReleaseAge: 1440`（ADR-2401）も充足する。
**リスク low と判断する。**

7.2.1 / 7.2.2 の中身は全 20 件が patch fix（CSS HMR、view transitions、incremental build の
hash 安定化、content collection の reference 検証など）。docs-site は starlight 経由の静的
ビルドのみで、影響範囲は build に閉じる。

### #2619（smol-toml 1.7.1 → 1.8.0）— このバッチで唯一の production 依存

`packages/core` の `dependencies` にあり、[`packages/core/src/translate/wrangler.ts`](../../packages/core/src/translate/wrangler.ts)
が `parse` だけを使う（`wrangler.toml` の読み取り）。

中身は 2 版ぶん:

- **1.7.2** — parser の性能改善 refactor + sourcemap publish の revert
- **1.8.0** — `stringify` が Temporal オブジェクトを扱えるようになる（feat）

**karasu が使うのは `parse` のみで、1.8.0 の feat は `stringify` 側**。したがって挙動変化の
実質的な surface は 1.7.2 の parser refactor に限られる。ここは
[`packages/core/src/translate/wrangler.test.ts`](../../packages/core/src/translate/wrangler.test.ts)
が押さえており、CI は green。

security 面では 1.7.1 が GHSA-7w5x-hrqm-74c2 の修正版なので、floor は既に満たしている。

なお #2619 単体では lock に `smol-toml` が **1.7.1 と 1.8.0 の 2 版並ぶ**。1.7.1 側の
consumer は `knip`（`^1.7.1`）と `@astrojs/internal-helpers` で、#2615 / #2617 を併せて
マージすると astro 側は 1.8.0 に寄る。どちらの版も GHSA-7w5x-hrqm-74c2 の修正後なので、
**残っても security 上の問題はない**（収束は結果として起きればよい、という扱い）。

### #2621（esbuild 0.28.1 → 0.28.2）— override floor との関係

`esbuild` は `pnpm-workspace.yaml` の `overrides` にも `^0.28.1` で載っている
（[ADR-1593](../adr/1593-dependabot-security-2026-06-15.md): GHSA-gv7w-rqvm-qjhr high /
GHSA-g7r4-m6w7-qqqr low、どちらも fixed in **0.28.1**）。

`.claude/rules/dependabot.md` の指示どおり advisory の脆弱範囲と自分の pin を突き合わせた:

- 脆弱範囲は `< 0.28.1`、override の floor は `^0.28.1` → **floor は脆弱範囲の外側**
- 0.28.2 は `^0.28.1` を満たす → `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` は起きない
- 実際 `pnpm install --frozen-lockfile` は #2621 の CI で通っている

0.28.2 の中身は tree shaking / CSS minify / top-level await / logical assignment lowering の
correctness fix 群で、いずれも既定の挙動を正す方向。

**観測した lock hygiene の事実（本バッチの判断対象外）**: main の lock には既に
`esbuild@0.28.1` と `esbuild@0.28.2` が両方存在する。0.28.1 側の consumer は
`tsx@4.21.0` と vite 2 インスタンスで、#2621 をマージしてもこの重複は解消しない
（override の floor `^0.28.1` が 0.28.1 の残存を許すため）。**これは security の問題ではなく**
（floor は既に脆弱範囲の外）、`overrides` block は ADR-1474 が定めるとおり advisory
remediation のための floor 置き場なので、dedup 目的で floor を動かすのは筋が違う。
本バッチでは触らず、事実の記録に留める。

### マージ順

lock の peer suffix が絡む依存が 2 組ある。

- **#2616（tsx）を最初に。** main の lock は `tsx@4.21.0` と `tsx@4.22.4` の 2 版を持ち、
  vite の peer suffix にそれが焼き込まれている。#2616 は両方を `4.23.12` 1 本に畳む。
  #2621 の lock diff は現状 vite の peer を `tsx@4.22.4` → `tsx@4.21.0` に付け替える
  無関係な churn を含んでおり、#2616 を先に入れればこの churn は消える。
- **#2615（astro）と #2617（knip）は #2619（smol-toml）と lock 上で交差する。** 順序は問わないが、
  後続は Dependabot の rebase が要る。

それ以外は独立。競合したら `@dependabot rebase` で足りる（`ADR-2152`: 単に rebase が
必要なだけでは差し替えの理由にならない）。

## 現時点の方針

**8 件すべて採用。却下・保留はゼロ。**

うち **#2614 のみ差し替え PR** で入れ、同じ PR で ADR-2447 の `assumptions` から
リテラルの版 pin（`oxfmt` / `vitest`）を外す。残り 7 件は bot PR をそのままマージする。

推奨する反映順:

1. #2616（tsx）
2. #2621（esbuild）/ #2615（astro）/ #2617（knip）/ #2619（smol-toml）/ #2618（lucide-react）/ #2620（user-event）
3. #2614 の差し替え PR（oxfmt ^0.63.0 + ADR-2447 の assumption 緩和）→ #2614 を close

却下はゼロなので `@dependabot ignore` は設定しない。

## 未解決の問い

- ADR の `assumptions` にリテラルの依存版を書く運用そのものを止めるか。今回で 2 度目
  （ADR-1338 → ADR-2115、ADR-2447 → 本件）であり、triage のたびに同じ red を踏む。
  「bump のたびに壊れる assumption は書かない」を `.claude/rules/adr.md` に明文化するか、
  ADR 昇格時のチェック項目にするかは、この PR のレビューで決めたい。
