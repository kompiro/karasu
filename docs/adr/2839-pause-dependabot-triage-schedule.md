---
id: ADR-2839
title: dependabot-triage workflow の週次 cron を止め、dispatch で運用する
status: accepted
date: 2026-09-15
topic: build
refines:
  - ADR-2658
related_to:
  - ADR-903
  - ADR-2687
scope:
  concerns: [ci, dependencies]
assumptions:
  - "file: .github/workflows/dependabot-triage.md"
  - "grep: .github/workflows/dependabot-triage.md :: #\\s+- cron:"
---

# ADR-2839: dependabot-triage workflow の週次 cron を止め、dispatch で運用する

- **日付**: 2026-09-15
- **ステータス**: 決定済み
- **関連**:
  - 再開の条件を追う Issue: [#2839](https://github.com/kompiro/karasu/issues/2839)
  - 所見の不足: [#2838](https://github.com/kompiro/karasu/issues/2838)
  - threat detection が結論を出さない: [#2786](https://github.com/kompiro/karasu/issues/2786)
  - 比較に使った手動トリアージ: [#2836](https://github.com/kompiro/karasu/pull/2836)
  - W1 を schedule で回すと決めた ADR: [ADR-2658](2658-gh-aw-dependency-automation.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

[ADR-2658](2658-gh-aw-dependency-automation.md) は、Dependabot PR の週次トリアージの下ごしらえ（W1）を
gh-aw の scheduled workflow（`0 22 * * 1`）に任せた。2026-09-14 のバッチでは cron 実行（run 34902446245）の後に、
同じ workflow を dispatch で再実行（run 34968824898）し、手動トリアージ [#2836](https://github.com/kompiro/karasu/pull/2836) の代わりになるかを試した。

分かったことは 2 つある。

- **所見が採否を決めた論点に届いていない。** npm registry に届かない（shell が許可されていない）、CI の結果を
  読めない、lock の依存エッジ差分を取らない、の 3 点で、#2827 の判断に効いた事実がすべて抜けた（[#2838](https://github.com/kompiro/karasu/issues/2838)）。
- **threat detection が一度も結論を出していない。** 9/14 と 9/15 はいずれも `engine_error` で、`continue-on-error`
  により safe outputs は検査を通らないまま公開された（[#2786](https://github.com/kompiro/karasu/issues/2786)）。

## 決定

**W1 の cron をコメントアウトし、`workflow_dispatch` だけで運用する。** 再開は [#2839](https://github.com/kompiro/karasu/issues/2839) で扱い、
#2838 の解消（または schedule 実行には不要という判断）と、#2786 で threat detection が結論を出すようになることを
条件とする。

cron の行は削除せず、W2（`security-alert-sweep.md`）と同じ形でコメントとして残す。assumption の
`#\s+- cron:` は、誰かが cron を黙って戻したときに本 ADR の前提が崩れたことを検出する。

## 理由

- **止めるコストが小さい。** Dependabot の cooldown が 7 日あるので、下ごしらえが月曜の翌朝に自動で揃っていなくても
  判断は遅れない。必要なバッチでは Actions タブから dispatch すれば同じ所見が得られる。
- **現状の所見は、無人で回すほどの価値に届いていない。** #2836 との比較で、所見はトリアージの一次調査を
  置き換えられなかった。検査されない出力が定期的に公開される状態も合わせて解消される。

## 却下した案

- **workflow を削除する**: #2838 の改善と #2786 の調査には dispatch できる workflow が要る。再開の手順も
  コメントアウトを戻して再コンパイルするだけにしておきたい。
- **schedule を残したまま #2838 と #2786 を直す**: 直るまでの間、採否の判断に届かない所見と、検査を通らない
  出力が毎週公開され続ける。直すための試行は dispatch で足りる。

## 影響

- `.github/workflows/dependabot-triage.lock.yml` から `schedule` が消える。gh-aw のコンパイラは schedule を持つ
  workflow にだけ agent ジョブの `concurrency` を付けるので、その 3 行も消える。workflow 全体の
  `concurrency`（`queue: max`）は残る。dispatch 専用の W2 の lock と同じ形である。
- `docs/release.md` と `.claude/rules/dependabot.md` の記述を「dispatch のみ」に揃えた。トリアージは
  `/hane:dependabot` で従来どおり行う。
- ADR-2658 の本文は書き換えない（[ADR-2687](2687-adr-body-is-immutable.md)）。W1 の起動方法に限って本 ADR が上書きし、
  判定は人が行う・workflow は書き込み範囲を宣言で縛る、という残りの決定は変わらない。
  そのため frontmatter は `supersedes` ではなく `refines: [ADR-2658]` で結ぶ。`supersedes` にすると ADR-2658 が
  `superseded` になり、W2 や safe outputs の宣言といった有効な決定まで `effective.md` から外れる。
