---
id: ADR-2472
title: Dependabot トリアージ 2026-08-13 — 判定軸を CI の色から「upstream の欠陥か自分側の gate か」に置く
status: accepted
date: 2026-08-13
topic: build
scope:
  packages: [app, cli, core, docs-site, nest, vscode]
  concerns: [dependencies, ci, security]
related_to: [ADR-2474, ADR-2447, ADR-2397, ADR-2333, ADR-2318, ADR-784]
assumptions:
  # 本 ADR が決めたのは tailwindcss と @tailwindcss/vite を 4.x で対に保つことで
  # あって、4.3.3 というリテラルの patch 版ではない（ADR-2628）。
  - "grep: packages/app/package.json :: \"tailwindcss\": \"\\^4\\."
  - "grep: packages/app/package.json :: \"@tailwindcss/vite\": \"\\^4\\."
  - "grep: scripts/ci/node-version-policy.test.ts :: ENGINES_FLOOR = \"22.12\""
  - "file: scripts/ci/node-version-policy.test.ts"
---

# ADR-2472: Dependabot トリアージ 2026-08-13 — 判定軸を CI の色から「upstream の欠陥か自分側の gate か」に置く

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2472](https://github.com/kompiro/karasu/pull/2472)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2463](https://github.com/kompiro/karasu/pull/2463) / [#2464](https://github.com/kompiro/karasu/pull/2464) / [#2465](https://github.com/kompiro/karasu/pull/2465) / [#2466](https://github.com/kompiro/karasu/pull/2466) / [#2467](https://github.com/kompiro/karasu/pull/2467) / [#2468](https://github.com/kompiro/karasu/pull/2468) / [#2469](https://github.com/kompiro/karasu/pull/2469) / [#2470](https://github.com/kompiro/karasu/pull/2470) / [#2471](https://github.com/kompiro/karasu/pull/2471)
  - 差し替え PR: [#2476](https://github.com/kompiro/karasu/pull/2476)（tailwind の対 bump）/ [#2480](https://github.com/kompiro/karasu/pull/2480)（knip 6.32.0 + 棚卸し）
  - 直前の triage: [ADR-2447](2447-dependabot-triage-2026-08-10.md)
  - Node ベースライン: [ADR-2397](2397-node-24-baseline.md)（本 ADR が下限を 22.12 に refine）
  - cooldown 迂回の先例: [ADR-2318](2318-dependabot-triage-2026-08-03.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 派生 Issue: [#2474](https://github.com/kompiro/karasu/issues/2474) → [ADR-2474](2474-dependabot-replacement-pr-vocabulary.md)（反映手段の呼称を「差し替え PR」に統一）
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`

## 背景

2026-08-13（木）の Dependabot バッチ。npm 8 件 + github_actions 1 件の計 9 件。
`dependabot/alerts` の open は 0 件で、security update を含まない純粋な version
update バッチだった。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 9 件を upstream まで
遡って分析した。**サプライチェーン上の懸念はゼロだった。** publisher / provenance /
lifecycle script / 依存ツリーの変化 / 既知 advisory を全件確認し、install /
postinstall / prepare の新規追加も配布主体の不審な変化も無かった。cooldown
（全 semver レベル 7 日）も全件充足。全 PR の diff は `package.json` +
`pnpm-lock.yaml` のみ（github_actions は workflow の SHA 1 行）。

にもかかわらず「そのままマージ」で済んだのは 9 件中 5 件だけだった。
**2 件が CI red、1 件が CI green のまま lockfile に不整合を固定する**状態で、
残り 1 件は major の互換性判断を要した。

### なぜ木曜に届いたのか

`.github/dependabot.yml` は `weekly` / `monday` なので、素直に読めば木曜に
バッチは来ない。Dependabot の update job（`event=dynamic`）の履歴を見ると、
**weekly の枠は毎週月曜 21:43 UTC 前後に固定**されており（08-03 / 08-10 /
07-27 が全て 21:43）、本バッチを作った木曜 13:36 UTC の run はスケジュール外の
re-run だった。火〜日いずれの曜日にも full manifest の run が出ており、
このリポジトリでは以前から日常的に起きている。

9 件がまとまった理由は 2 つ:

1. **月曜から PR 枠が満杯だった。** 月曜 08-10 の run が npm 枠 8 を使い切り、
   最後まで残った LSP の 2 件（ADR-2447 で [#2337](https://github.com/kompiro/karasu/issues/2337)
   に畳んで保留）が 2026-08-12 15:27 に close されて初めて枠が空いた。
   9 件のうち 7 件は月曜時点で既に cooldown を満たしていたのに枠が無かった。
2. **残り 2 件は当日ちょうど cooldown が明けた。** `astro` 7.2.0 と `knip`
   6.32.0 はどちらも 2026-08-06 公開で、適格になるのは 08-13。

**スループットの律速はスケジュールではなく `open-pull-requests-limit`。**
月曜に枠を使い切る → 消化するまで新規は出ない → 空いた直後の run でまとめて
届く。ADR-2447 が「limit を 8 に上げたら同じ日に第 2 弾が 3 件届いた」と
記録したのと同じ現象が、今回は「保留 PR を閉じた翌日に 9 件」という形で出た。

## 決定

**9 件すべてを採用した。5 件はそのままマージ、2 件は修正を添えてマージ、
2 件は bot PR を close して差し替え PR で入れた。却下はゼロ。**

| PR | 依存 | 判断 | 反映 |
| --- | --- | --- | --- |
| #2463 | `azure/login` 3.0.1 | 採用 | そのままマージ |
| #2465 | `fflate` 0.8.3 | 採用 | そのままマージ |
| #2467 | `vscode-extension-tester` 8.24.0 | 採用 | そのままマージ |
| #2470 | `@testing-library/user-event` 14.6.3 | 採用 | そのままマージ |
| #2471 | `@vscode/test-cli` 0.0.15 | 採用 | そのままマージ |
| #2469 | `commander` 15.0.0 | 採用 | Node 下限 22.12 の sweep を同 PR に同梱 |
| #2468 | `astro` 7.2.0 | 採用 | ADR-2447 の版追跡 assumption を削除して同梱 |
| #2466 | `@tailwindcss/vite` 4.3.3 | 採用（bot PR は close） | [#2476](https://github.com/kompiro/karasu/pull/2476) — `tailwindcss` と対で bump |
| #2464 | `knip` 6.32.0 | 採用（bot PR は close） | [#2480](https://github.com/kompiro/karasu/pull/2480) — 検出 22 件の棚卸しを同梱 |

却下がゼロなので `@dependabot ignore` は設定していない。

あわせて **公開パッケージの Node 下限を `>=22` から `>=22.12` に上げた**
（ADR-2397 の refine。後述）。

## 理由

### CI の色は upstream の健全性を測っていない

今回それが 3 回出た。

- **#2468 / #2464 は red だが、原因はどちらも repo 側の gate。**
  #2468 は ADR-2447 の assumption が astro の版を完全一致で grep していたため、
  #2464 は knip 6.7.0 が検出範囲を広げたため。upstream は健全だった。
  red を理由に却下すると、直すべき自分側の問題を先送りすることになる。
- **#2466 は green だが、lockfile に Tailwind の二重化を固定する。**
  green を理由にそのままマージすると、upstream が保証しない組み合わせが残る。

したがって判定軸を **「CI が何色か」ではなく「upstream に欠陥があるか / 自分側に
直すべきものがあるか」** に置く。前者だけが却下・保留の理由になり、後者は
**直してから採用**する。今回 9 件すべてが採用に落ち着いたのは、upstream 側の
欠陥が 1 件も無かったことの帰結であって、甘く見たからではない。

### peer が exact pin の依存は片方だけ取ると green のまま壊れる（ADR-2447 の再発）

`@tailwindcss/vite@4.3.3` は `tailwindcss` を **exact pin `4.3.3`** で持つ
（`@tailwindcss/node` / `@tailwindcss/oxide` も同様）。一方 `packages/app` は
`@tailwindcss/vite` と `tailwindcss` を**両方**宣言している。bot PR は
プラグインだけを上げるので、manifest に残った `tailwindcss: ^4.3.0` は 4.3.0 に
解決され、lockfile に CSS エンジンが 2 版同居する。

```
#2466 head:  tailwindcss@4.3.0  ← app importer が ^4.3.0 → 4.3.0
             tailwindcss@4.3.3  ← @tailwindcss/vite@4.3.3 の exact pin
#2476:       tailwindcss@4.3.3  ← のみ
```

`strict-peer-dependencies` を有効にしていないので install も CI も通る。
ADR-2447 が `@vitest/coverage-v8` / `vitest` で下した判断と同じ形なので、
同じ処方（両方の宣言を 1 コミットで動かす）を適用した。

**ADR-2447 の教訓は 3 日で再発した。** peer / exact pin は特定のパッケージの
性質ではなく構造なので、今後も同じ形で出る。bot PR を見たら「相手側の宣言が
manifest にあるか」を確認する。

### assumption は決定を検査するもので、依存の現在版を追跡する装置ではない

ADR-2447 の frontmatter には
`grep: packages/docs-site/package.json :: "astro": "\^7.1.6"` があった。
ADR-2447 の決定は「PR 枠を 8 に広げる」「peer で結ばれた依存は対で動かす」で
あり、astro 7.1.6 の採用はその決定の帰結ではなく同じバッチで処理した独立の
1 件にすぎない。バージョン完全一致の grep を置いたため、**正常な依存更新の
たびに ADR が false-positive で落ちる**構造になっていた。今回それが起きた。

astro と `lucide-react` の版追跡 assumption を削除した。`open-pull-requests-limit: 8`
（決定そのもの）、`vitest ^4.1.10` / `oxfmt ^0.62.0`（「9 manifest を揃えた」
「整形を同梱した」という決定の検査）は残した。

**今後の triage ADR には「単に採用した bump のバージョン」を assumption に
書かない。** 本 ADR の assumption に `tailwindcss ^4.3.3` を置いているのは、
それが「対で動かした」という決定そのものの検査だからで、版の追跡ではない
（片方だけ動けば grep が落ちる）。

### 公開パッケージの Node 下限は 22.12 に上げる（ADR-2397 の refine）

`commander@15.0.0` は ESM only 化に伴い `engines: node >=22.12.0` を宣言する。
karasu の CLI は `"type": "module"` で commander を `import` するため、
`require(esm)` を前提とした 22.12 要件は**機能的には効かない**。しかし
`packages/cli` が `>=22` と宣言し続けると、Node 22.0〜22.11 の利用者に
誤った適合シグナルを出す。

下限を動かすにあたり、ADR-2397 の
`scripts/ci/node-version-policy.test.ts` が **「workspace 全体が単一の下限を
共有し、esbuild の `--target` もそれに一致する」** ことを機械的に縛っている
点が効いた。`packages/cli` だけ上げた最初の試みはこの guard に落ちた。
guard が想定どおり半端な sweep を捕まえた形なので、`packages/core` の
`engines`、`--target` 2 箇所、guard の定数まで含めて 22.12 に揃えた。

**これは ADR-2397 の reverse ではなく refine。** ADR-2397 の原則は
「公開パッケージの下限は **EOL したラインだけ**を落とす」であり、22.12 は
同じ Node 22 maintenance LTS ライン（2027-04 まで）**内**の絞り込みなので、
ラインは 1 つも落ちていない。下流のうち Node 22 を使っている利用者は
22 のままでいられる。ADR-2397 の assumption はこの新しい値に更新した。

guard の定数は major 精度から minor 精度に広げ、比較を文字列全体で行うように
した。`>=22` と `>=22.12` は別の約束であり、major だけを見る比較では半端な
sweep を clean と誤判定するため。

### 人手の再解決は cooldown を迂回する（ADR-2318 の再確認、本バッチで 2 回）

ADR-2318 が「人手で bot PR を再提出するときは素の `pnpm install` が cooldown を
迂回しうる」と記録したとおりの事象が、**このバッチだけで 2 回起きた。**

| 箇所 | 引かれた版 | 公開日 | 意図した版 |
| --- | --- | --- | --- |
| #2468 の rebase 再解決 | `astro@7.2.1` | 2026-08-11 | 7.2.0 |
| #2480（差し替え PR）の初回解決 | `knip@6.32.2` | 2026-08-11 | 6.32.0 |

どちらも caret レンジ（`^7.2.0` / `^6.32.0`）に対して `pnpm install` が
**range 内の最新**を選ぶために起きる。cooldown は Dependabot 側の機能なので、
lockfile を人手で解決した時点で効力を失う。

2 回目のほうが示唆的だった。#2480 では knip を実際に走らせて
「検出が 22 件から 0 件になり exit 0」まで確認していたが、**確認したのは
ツールの挙動であって解決された版ではなかった。** 6.32.2 でも 6.32.0 でも
出力は同じなので、挙動の確認では版のずれを検出できない。

**bot PR に手を入れた時点で、cooldown を守る責任は bot から人間に移る。**
再解決したら次の 2 つを確認する。片方だけでは足りない。

1. **意図した版に留まっているか** — `grep -nE "^  <pkg>@" pnpm-lock.yaml`。
   caret のまま解決すると最新に飛ぶので、いったん exact pin で解決してから
   caret に戻す（pnpm は既存の解決がレンジを満たす限り維持する）。
2. **他が巻き込まれていないか** — lockfile の依存エッジ diff を main と取る。
   解決版の集合比較では既存グラフ内の版への乗り換えを見落とす。

### 差し替え PR は古い main から切ると lockfile を巻き戻す

#2480 の初回 push には、cooldown とは別の欠陥もあった。ブランチを切った時点の
main には #2467（`vscode-extension-tester`）と #2469（`commander`）が未マージで、
その古いベースの上で `pnpm install` を回したため、**main が既に持っていた
`commander@15.0.0` / `c8@12` / `got@15` サブツリーを lockfile から落とす**
差分になっていた。

GitHub 上は `MERGEABLE` と表示される。lockfile の当該行は main 側にしか
無いので git の 3-way merge は衝突を報告せず、マージ自体は成立してしまう。
**衝突が出ないことと、意図した lockfile になることは別。**

検出は「マージ後の姿を先に作って確かめる」で行った。`origin/main` に detached
worktree を作ってブランチをマージし、そこで `pnpm install --frozen-lockfile` と
依存エッジ diff を回す。差し替え PR を出したら、CI の色だけでなくこの確認を
通してからマージする。

## 却下した案

### 案: bot ブランチに手を入れず、#2466 / #2464 を `@dependabot recreate` で直す

`recreate` は同じロジックで PR を作り直すだけなので、`@tailwindcss/vite` 単独
bump も knip の検出 22 件も変わらない。bot が作れる差分の形が問題なので、
容れ物を替えないと解けない。

### 案: #2464（knip）を保留して follow-up Issue に送る

**先送りにならないので採らなかった。** root manifest は既に
`"knip": "^6.6.0"` の **caret** で、6.32.0 は range 内にある。6.6.0 に留まって
いたのは lockfile がそう固定していたからにすぎず、**次に何らかの理由で lock が
再解決されれば、この PR とは無関係に同じ 22 件が噴き出す**。原因が特定できて
いる今が片付けどきだった。

### 案: ADR-2447 の astro assumption を `^7.2.0` に更新する（削除ではなく）

次の astro bump でまた落ちる。問題は値ではなく「版を assumption に書いた」
ことなので、値の更新では解けない。

### 案: Node 下限は `>=22` のまま据え置く

commander の 22.12 要件は ESM import では効かないので実害は小さく、この案も
成り立つ。採らなかったのは、`packages/cli` が npm 公開パッケージであり、
**宣言と実際に動くランタイムがずれた状態を残すこと自体がコスト**だから。
ADR-2397 の原則に抵触しない（ラインを落とさない）ことも確認できたため、
正確に宣言する側に倒した。

## 影響

- **利用者**: `karasu` / `@karasu-tools/core` の必要 Node が 22.12 以上になる。
  Node 22 ライン自体は落ちていないので、22.x 利用者は patch 更新で足りる。
- **`fflate` 0.8.3** は app の runtime 依存。Zip64 extra field の buffer
  over-read 修正を含み、untrusted な zip を読む `import-project-zip.ts` に
  とっては取り込む利のある修正だった。
- **`azure/login` 3.0.1** は PowerShell 入力のクォート漏れを塞ぐ hardening。
  SHA pin 運用なので、bot の書き換え先が annotated tag `v3.0.1` の指す commit
  と一致することを dereference して確認した。
- **knip の検出 22 件**のうち 19 件は `export` を外して解消した。
  `packages/core/src/index.ts` は star ではなく明示的な名前で re-export して
  いるため、いずれも公開 API ではなく下流への破壊ではない。
- 残した configuration hint 3 件（`.css` / `.astro` / `.mdx`）は `project` glob
  を広げる別変更に送った。knip は hint があっても exit 0 で、CI は落ちない。

## 未解決

- ~~本 ADR の執筆時点でこの反映手段は「人手 PR」と呼んでいたが、「却下」と
  紛らわしく、書いた人を指していて中身を指していなかった。~~
  [ADR-2474](2474-dependabot-replacement-pr-vocabulary.md) で
  **差し替え PR** に改名し、本 ADR の記述もそれに合わせた（解決済み）。
- ADR-2447 に残した `vitest ^4.1.10` / `oxfmt ^0.62.0` の assumption も、
  値としては版を含むため次の bump で落ちうる。「決定を検査している」と
  判断して今回は残したが、落ちた時点で同じ整理（決定の検査に書き換えるか
  削除するか）が要る。
