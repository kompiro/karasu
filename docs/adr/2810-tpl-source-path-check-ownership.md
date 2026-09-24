---
id: ADR-2810
title: TPL 本文のソースパス照合を `@kompiro/tpl-tools` へ移し、Required な `Check` から走らせる
status: accepted
date: 2026-09-21
topic: testing
related_to:
  - ADR-2648
  - ADR-1357
  - ADR-2687
  - ADR-1192
scope:
  packages: []
  concerns: [ci]
assumptions:
  - "file: scripts/lint/record-source-paths.ts"
  - "grep: scripts/lint/record-source-paths.ts :: export const SCANNED_DIRS = \\[\"docs/acceptance\", \"docs/design\"\\]"
  - "file: scripts/lint/tpl-validate-owns-tpl-dir.test.ts"
  - "grep: package.json :: \"@kompiro/tpl-tools\": \"\\^0\\."
  - "grep: package.json :: --source-prefix packages --source-prefix scripts"
  - "grep: .github/workflows/ci.yml :: pnpm run tpl:validate"
  - "grep: .github/workflows/at-check-coverage.yml :: pnpm run tpl:validate"
  - "file: docs/test-perspectives/TPL-2810-two-implementations-agree-only-when-measured.md"
---

# ADR-2810: TPL 本文のソースパス照合を `@kompiro/tpl-tools` へ移し、Required な `Check` から走らせる

- **日付**: 2026-09-21
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2810](https://github.com/kompiro/karasu/issues/2810)（Adopt tpl-tools' body source-path check for docs/test-perspectives）
  - 設計 PR: [#2857](https://github.com/kompiro/karasu/pull/2857)（旧 `docs/design/tpl-source-path-check-ownership.md` — 本 ADR に集約して削除）
  - 実装 PR: [#2861](https://github.com/kompiro/karasu/pull/2861)
  - 上流: [kompiro/tpl-tools#17](https://github.com/kompiro/tpl-tools/issues/17), [#24](https://github.com/kompiro/tpl-tools/issues/24)（`@kompiro/tpl-tools` v0.0.10 で `tpl validate --source-prefix` として出荷）
  - 関連 ADR: [ADR-2648](2648-record-source-path-guard.md)（本ガードの決定。**本 ADR はその決定 5 と決定 6 を改訂する** — 決定 1〜4 は有効のまま）, [ADR-1357](1357-tpl-tools-extraction.md)（tpl-tools 切り出し）, [ADR-2687](2687-adr-body-is-immutable.md)（ADR 本文は不変）, [ADR-1192](1192-test-perspective-library.md)（TPL 運用）
  - 観点: [TPL-2810](../test-perspectives/TPL-2810-two-implementations-agree-only-when-measured.md)（本 ADR と同時に起こした proactive TPL）, [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md), [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)

## 背景

[ADR-2648](2648-record-source-path-guard.md) は「記録が名指すソースパスは working tree に
実在する」を機械で照合するガードを `scripts/lint/record-source-paths.ts` に置いた。走査対象は
`docs/acceptance` / `docs/test-perspectives` / `docs/design` の 3 ディレクトリである。その
決定 5 は、これを karasu の `scripts/lint/` で育てたうえで **TPL 分は上流に出す**と明記し、
追跡先を tpl-tools#17 としていた。

その上流化が済んだ。`@kompiro/tpl-tools` v0.0.10 が `tpl validate --source-prefix <dir>` を
出荷し、TPL 本文のインラインコードスパンを working tree と照合する。marker の綴りは
`absent-path-next-line` で意図的に同一なので、記録が repo 間を移動しても意味を保つ。

したがって `docs/test-perspectives` は同じ検査を 2 実装が持つ状態になった。#2810 が問うたのは
「両方走らせるか、ローカル側を絞って上流に任せるか」である。

## 決定

### 1. `docs/test-perspectives` の所有者を `@kompiro/tpl-tools` 1 つにする

`SCANNED_DIRS` を `["docs/acceptance", "docs/design"]` に絞る。TPL ディレクトリは
`pnpm run tpl:validate`（`--source-prefix packages --source-prefix scripts`）が単独で持つ。
**ADR-2648 決定 5 の「走査対象 3 ディレクトリ」はここで 2 ディレクトリに改訂される。**

判断の根拠は、2 実装が既に乖離していたという**実測**である。現行 corpus では両方とも
finding 0 件だが、緑同士の一致は規則の一致を意味しない。実在の `packages/` / `scripts/`
ツリーを symlink した fixture に差が出る入力を当てると、双方向に規則差が出た。

| ケース | local guard | `tpl validate --source-prefix` |
| --- | --- | --- |
| 素の不在パス | 報告 | 報告 |
| repo 固有の生成物セグメント（`test-results` 等） | 無視 | 報告 |
| `build` セグメント | 報告 | 無視 |
| block quote 内の fence のコードスパン | **報告（false positive）** | 無視 |
| block quote を通した marker | **報告（false positive）** | 無視 |
| 余った marker / 理由の無い marker | 報告 | 報告 |

**tpl-tools のほうが Markdown を正しく読む**（段落単位で読み、block quote と list item の中の
fence を認識し、宣言を block quote 越しに読む）。両方走らせると作者に当たるのは厳しい方では
なく**両方の和**で、TPL 本文に block quote の中の fence を書くと正しい記述なのに marker でしか
回避できなくなる。

### 2. `tpl:validate` を Required な `Check` の両ジョブから走らせる

`.github/workflows/ci.yml`（コード PR 側）と `.github/workflows/at-check-coverage.yml`
（docs PR 側）の `Check` job に `pnpm run tpl:validate` のステップを置く。
**ADR-2648 決定 6 の配線表はこの 2 行を加えて改訂される。**

決定 1 だけを実施すると、TPL 本文のソースパス照合は Required から外れる。Required な status
check の context は `Check` / `Validate` / `Reference docs` / `Playwright` の 4 つで、
`tpl-validate.yml` の job 名は `TPL validate`、ファイル自身が
「Still informative-only — not a required check yet」と書いていた。さらに同 workflow の
`paths:` は `docs/test-perspectives/**` に限られていたので、**コードだけを触る PR では
一切走らない**。ADR-2648 の発端である #2604（`packages/nest` の半分を削除し、8 件の記録が
消えたファイルを指したまま CI 全緑だった PR）と同じ形の変更が、また黙って通る状態に戻る。

これは新しい発明ではなく、`adr check-assumptions` が #1480 で既に取っている形である
（path-filter された `adr-validate.yml` はコード PR で走らないので、Required な `Check` にも
同じコマンドを置いて穴を塞いだ）。ruleset は変更しない — context 名 `Check` は既に Required
なので、既存 job にステップを足すだけで済む。

### 3. `tpl-validate.yml` を削除する

両 `Check` が同じコマンドを持つと完全に冗長になる。結果として `tpl validate` は workflow を
1 つ減らしながら Required に昇格し、frontmatter / README index の検証まで Required になる。

### 4. lefthook の `tpl-validate` hook から `glob` を外す

理由は `record-source-paths` hook と同一で、TPL のソースパスを腐らせるのは docs を 1 つも
触らないコード変更だから。`docs/test-perspectives/**` で gate するとその push を飛ばす。
約 140 の小さなファイルを読むだけなので毎 push でも十分安い。

### 5. 「なぜ見ないか」を宣言箇所に書き、機械で固定する

`record-source-paths.ts` のヘッダーに、`docs/adr/**` を外した理由の隣へ
`docs/test-perspectives/**` を外した理由を並べて書く。ADR-2648 決定 2 が
`docs/adr/**` について取ったのと同じ形で、「見落としだ」と読んで後から戻されないようにする。

加えて `scripts/lint/tpl-validate-owns-tpl-dir.test.ts` が、どれも「消えても緑」になる種類の
regression を落とす:

- 有効化フラグ（`--source-prefix`）が script に残っていること — **外れても `tpl validate` は
  成功終了する**。退役させた側の実装はもう無いので、外れた瞬間にそのディレクトリは誰にも
  検査されない
- 両 Required job がそのコマンドを実行すること
- 退役させた workflow が存在しないこと
- lefthook hook に path filter が戻っていないこと
- `absent-path-next-line` marker が両実装で同じ意味になること

## 理由

- **乖離が仮定ではなく実測だった** — 2 実装を同一 corpus へ当てて差分を取るまで、両方緑という
  事実しか無かった。測ると双方向に差があり、しかも 2 件はローカル側の読み違いだった。
  オーナーを 1 つにする根拠はここにある
- **決定 5 の継続であって反転ではない** — ADR-2648 は上流化を予定して tpl-tools#17 を張って
  いた。改訂されるのは走査対象の本数と配線表であって、ガードの設計思想（決定 1〜4）ではない
- **強制力を下げずに移せる形がある** — 既存の Required job にステップを足す形なら ruleset を
  触らずに済み、context を増やしたときのような merge 順序の制約が生まれない
- **整理が 1 つ進む** — `tpl-validate.yml` の「not a required check yet」という積み残しが、
  workflow を 1 つ減らす形で片付く

## 却下した案

- **両方走らせる（keep both）**: 差分は最小で強制力も現状維持だが、`docs/test-perspectives` が
  2 実装に二重検査されたままになる。上の表のとおり既に乖離しており、block quote の中に
  fence を書いた正しい TPL 本文が落ちる。ADR-2648 決定 5 が予定した上流化も永久に
  「済んでいない」状態で止まる。却下
- **Issue の記述どおり `SCANNED_DIRS` を絞るだけ（配線は変えない）**: 1 ディレクトリ 1 オーナーに
  なり false positive も消えるが、TPL 本文の照合が Required から外れ、コード PR では走らなく
  なる。#2604 と同じ形の変更が黙って通る状態に戻るので却下
- **`tpl-validate.yml` を Required context に追加する**: ruleset に context を足す変更は
  反映が merge 順序の制約になる（karasu#1866 の Playwright required 化で経験済み）。既存の
  Required job にステップを足せば同じ到達状態が得られるので却下
- **`tpl-validate.yml` を path-filter された companion として残す**: `adr-validate.yml` は
  そう残っているが、あちらは ADR frontmatter の検証という固有の仕事を持つ。こちらは両
  `Check` が同じコマンドを走らせるので、残しても CI 時間を使って同じ検査を繰り返すだけ。却下
- **`GENERATED_SEGMENTS` の repo 固有エントリを上流へ出す**: 今回は決めない。差（`test-results`
  等）は現行 corpus に実例が 0 件で、出たときに marker で宣言すれば足りる。実例が複数
  たまってから上流の Issue にする
- **`docs/acceptance` / `docs/design` も上流ツールに持たせる**: ADR-2648 決定 5 の理由
  （両ツールとも自分の corpus しか持たない）は変わっていない。ローカルガードは残る
- **`build` を `GENERATED_SEGMENTS` に足す**: `docs/acceptance` / `docs/design` 側の挙動変更に
  なるので本件のスコープ外。必要なら別 Issue で扱う

## 影響

- `docs/test-perspectives` を書くとき、コードスパンのソースパスは実在するか、
  `<!-- absent-path-next-line: <理由> -->` で宣言されているかのどちらかになる。判定するのは
  `tpl validate` で、block quote の中の fence や block quote 越しの宣言も正しく読まれる
- repo 固有の生成物セグメント（`test-results` / `playwright-report` / `screenshots` /
  `.astro` / `.vscode-test` / `preview-dist` / `THIRD_PARTY_NOTICES.md`）を TPL 本文で
  名指しすると、これまでと違って報告されうる。現行 corpus では 0 件で、出たら marker で宣言する
- ADR-1357 の `assumptions:` が持っていた `.github/workflows/tpl-validate.yml` への参照は
  `ci.yml` に張り替えた。同 ADR の**本文は触っていない**（ADR-2687）
- TPL-2254 の checklist と「既知の対処パターン」、TPL-2188 の「関連テスト」、
  `docs/test-perspectives/README.md` の Validator 節を、1 ディレクトリ 1 オーナーの形に更新した

## 関連 TPL

本 ADR と同じ PR で **[TPL-2810](../test-perspectives/TPL-2810-two-implementations-agree-only-when-measured.md)**
を proactive に起こした（bug は起きていない）。観点は「同じ検査の実装が 2 つになったら、
緑同士は一致の証明ではない — 差分 fixture で規則差を測り、移す先が merge を止められるかを
確かめてから片方を退役させる」で、今回の測定そのものを再利用可能な形にしたもの。

checklist の項目は `scripts/lint/tpl-validate-owns-tpl-dir.test.ts` に contract test として
同時に出荷してある（決定 5）。

設計時に参照した既存 TPL は
[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)
（gate 側で走らない検証は存在しない検証 — 決定 2 がこれの適用）と
[TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)
（記録は記録より長生きするアドレスを指す — 本ガード群の出発点）。
