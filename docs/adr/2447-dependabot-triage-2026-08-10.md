---
id: ADR-2447
title: Dependabot トリアージ 2026-08-10 — PR 枠を 8 に広げ、peer で結ばれた依存は差し替え PR で対に戻す
status: accepted
date: 2026-08-11
topic: build
scope:
  packages: [app, cli, core, docs-site, i18n, lsp, nest, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-2440, ADR-2333, ADR-2318, ADR-784, ADR-1320]
assumptions:
  - "grep: .github/dependabot.yml :: open-pull-requests-limit: 8"
  # 特定の minor / patch 番号ではなく「caret で pin されている」ことを表明する。
  # 本 ADR が oxfmt / vitest について決めたのは採用と反映の形（整形の同梱、
  # 9 manifest の版揃え）であって、0.62.0 / 4.1.10 というリテラルの版ではない
  # （後続の bump のたびに assumption が壊れるのを避ける。ADR-2115 が
  # ADR-1338 に対して行ったのと同じ緩和）。
  - "grep: package.json :: \"oxfmt\": \"\\^0\\."
  - "grep: package.json :: \"vitest\": \"\\^4\\."
---

# ADR-2447: Dependabot トリアージ 2026-08-10 — PR 枠を 8 に広げ、peer で結ばれた依存は差し替え PR で対に戻す

- **日付**: 2026-08-11
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2431](https://github.com/kompiro/karasu/pull/2431) / [#2437](https://github.com/kompiro/karasu/pull/2437)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2424](https://github.com/kompiro/karasu/pull/2424) / [#2425](https://github.com/kompiro/karasu/pull/2425) / [#2426](https://github.com/kompiro/karasu/pull/2426) / [#2427](https://github.com/kompiro/karasu/pull/2427) / [#2428](https://github.com/kompiro/karasu/pull/2428) / [#2432](https://github.com/kompiro/karasu/pull/2432) / [#2433](https://github.com/kompiro/karasu/pull/2433) / [#2434](https://github.com/kompiro/karasu/pull/2434)
  - 反映 PR: [#2438](https://github.com/kompiro/karasu/pull/2438)（vitest）/ [#2439](https://github.com/kompiro/karasu/pull/2439)（oxfmt）
  - license の判断: [ADR-2440](2440-blueoak-license-allowlist.md)（BlueOak-1.0.0 の allowlist 追加）
  - 保留の引き継ぎ先: [#2337](https://github.com/kompiro/karasu/issues/2337)（LSP 9 → 10 のペア upgrade）
  - 派生 Issue: [#2446](https://github.com/kompiro/karasu/issues/2446)（CI が lsp / vscode を typecheck していない）
  - 直前の triage: [ADR-2333](2333-dependabot-triage-2026-08-04.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`

## 背景

2026-08-10（月）の weekly バッチ。`dependabot/alerts` の open は 0 件で、security update を
含まない純粋な version update バッチだった。`.claude/rules/dependabot.md` に従い、bump 種別を
問わず全件を upstream まで遡って分析した。

**サプライチェーン上の懸念はゼロだった。** publisher / provenance / lifecycle script /
依存ツリーの変化 / 既知 advisory を全件確認し、install / postinstall / prepare の新規追加も
配布主体の変化も無かった。cooldown（全 semver レベル 7 日）も全件充足。

一方で **CI green のまま不整合を lockfile に固定してしまう PR** と、
**CI red だが原因が upstream の意図的変更である PR** が混ざっており、
「そのままマージ」以外の判断が要った。

さらにバッチの途中で `open-pull-requests-limit` を上げた結果、同じ日に第 2 弾の
3 件が届いた。本 ADR は 2 つのバッチを 1 つの判断記録として扱う。

## 決定

**8 件中 6 件を採用し、LSP の 2 件を [#2337](https://github.com/kompiro/karasu/issues/2337) に畳んで保留した。**
あわせて **npm の `open-pull-requests-limit` を既定 5 から 8 に引き上げた。**

| PR | 依存 | 判断 | 反映 |
| --- | --- | --- | --- |
| #2424 | `@types/react` 19.2.18 / `@types/react-dom` 19.2.4 | 採用 | そのままマージ |
| #2426 | `@astrojs/starlight` 0.41.6 | 採用 | そのままマージ |
| #2428 | `lucide-react` 1.28.0 | 採用 | そのままマージ |
| #2434 | `astro` 7.1.6 | 採用 | そのままマージ |
| #2425 | `@vitest/coverage-v8` 4.1.10 | 採用（bot PR は close） | [#2438](https://github.com/kompiro/karasu/pull/2438) — `vitest` と同時に bump |
| #2427 | `oxfmt` 0.62.0 | 採用（bot PR は close） | [#2439](https://github.com/kompiro/karasu/pull/2439) — 整形を同梱 |
| #2432 | `vscode-languageserver` 10.1.0 | **保留** | #2337 |
| #2433 | `vscode-languageclient` 10.1.0 | **保留** | #2337 |

却下はゼロなので `@dependabot ignore` は設定していない。

## 理由

### peer で結ばれた依存は、片方だけ取ると CI green のまま壊れる

`@vitest/coverage-v8@4.1.10` の peer は `vitest: "4.1.10"` の**完全一致ピン**で、
repo は 9 manifest すべてが `vitest@^4.1.4` だった。pnpm は
`strict-peer-dependencies` を有効にしていないので、#2425 単体でも install は通り
CI も green になる。しかし lockfile には upstream が保証しない組み合わせと、
`@vitest/utils` の 4.1.4 / 4.1.10 二重化が残る。

**CI green は「upstream の契約を満たしている」ことを意味しない。** peer が exact pin の
パッケージを見たら、相手側の宣言も一緒に動かす。#2438 で 9 manifest すべてを 4.1.10 に
揃え、`@vitest/*` 7 パッケージが単一版に畳まれることを確認した。

Dependabot が `vitest` を同じバッチで出さなかったのは、後述の PR 枠が既定 5 に
張り付いていたためである。

### PR 枠 5 は「関連する依存が同じバッチに入らない」形で実害が出る

`open-pull-requests-limit` は未指定で既定 5 が効いており、npm の open PR が
ちょうど 5 件で飽和していた。単にオファーが遅れるだけなら待てばよいが、
**peer で結ばれた依存の片方だけが枠に入ると、枠が空くのを待つ間に片方をマージした
時点で不整合が固定される**。これは待って解消する種類の問題ではない。

8 に引き上げた。直近 3 回のバッチが 5 件で張り付いており真の需要が 5 を超えていること、
peer で結ばれた最大の組（vitest 系 3 パッケージ）が同じバッチに収まること、
1 回のトリアージで捌ける分量に留まることから決めた。github-actions 側は
週 1〜2 件で飽和実績がないため既定のままとした。cooldown は据え置き
（枠の広さと supply-chain 上の待機時間は独立した軸）。

引き上げ直後に 3 件が追加で届き、枠が実際に律速していたことが裏づけられた。

### formatter の bump は整形差分とセットでしか出せない

`oxfmt` 0.62.0 の Format check 失敗は、[oxc#25044](https://github.com/oxc-project/oxc/pull/25044)
（戻り型注釈つき arrow の hug）による意図的な整形変更で、`packages/core` の test 3 本が
再整形される。npm の CHANGELOG には現れない（`oxfmt` タグのコミットしか収録しないため、
`formatter/` タグの変更は `oxfmt_v0.61.0...oxfmt_v0.62.0` の compare でしか見えない）。

整形コミットは bot ブランチに置けない（`@dependabot recreate` で失われる、
`.claude/rules/dependabot.md`）。close して差し替え PR に畳むのが定石で、
[ADR-2333](2333-dependabot-triage-2026-08-04.md) の #2326 と同じ処理をした。

### LSP の 2 件は、片側ずつマージすると実験条件が壊れる

[ADR-2333](2333-dependabot-triage-2026-08-04.md) で先送りした #2337 のペア upgrade が、
Dependabot から**片側ずつ 2 本の PR として**降ってきた。分かれて来たことが結果的に
対照実験になり、#2337 が「機構未特定」としていた position drift を一段絞れた。

ExTester の失敗は毎回同じ 3 件（AT-0037-9 / AT-0038 TC-04 / AT-0039 TC-03）である。

| 状態 | server 側 protocol | client 側 protocol | ExTester |
| --- | --- | --- | --- |
| main | 3.17.5 | 3.17.5 | 通る |
| #2328（ADR-2333 で却下） | runtime 3.17.5・`packages/lsp` の import 3.18.2 | 3.17.5 | 同じ 3 件が落ちる |
| #2432（server のみ 10.1.0） | 3.18.2 | 3.17.5 | **全部通る** |
| #2433（client のみ 10.1.0） | 3.17.5 | 3.18.2 | 同じ 3 件が落ちる |

**版が食い違うと壊れるのではない。** server 3.18.2 × client 3.17.5 の skew は通る。
落ちる 2 例はどちらも「position を送り出す側が 3.18、受け取る側が 3.17.5」であり、
position が計算されないのではなく**ずれて計算される**という症状とも整合する。
機構の確定（position encoding negotiation かどうか）は #2337 の scope に残す。

片側だけマージしない理由は 2 つ。protocol が 1 版に collapse するのは両方上げたときだけで
#2337 の到達状態に届かないこと、そして先に server だけ入れると次の作業が
「9 → 10 のペア upgrade」ではなく「skew からの復旧」になり、上の 3 点の対照と
比較できなくなることである。#2432 が全 CI green でも、急いで入れる利得はない。

### license の判断は分離した

`vscode-languageclient@10.1.0` が `minimatch: ^10.2.5` を production 依存として持ち込み、
`minimatch` が 10.2.5 で ISC から BlueOak-1.0.0 に変更していたため、
[ADR-1320](1320-license-compliance-automation.md) の fail-closed な allowlist に掛かった。
これは依存更新の可否ではなくライセンス方針の判断なので、
[ADR-2440](2440-blueoak-license-allowlist.md) として独立に決めた（採用）。
#2433 のライセンス面のブロッカーは解消済みで、残るのは ExTester 3 件である。

## 却下した案

### #2425 / #2427 を bot PR のままマージする

#2425 は前述のとおり peer 不整合を固定する。#2427 は Format check が構造的に赤のままで、
bot ブランチに整形コミットを足しても recreate で消える。どちらも「マージできない」のではなく
「bot PR という容れ物では正しい形にできない」ため、close して差し替え PR に置き換えた。

### #2432 を単独でマージする

全 CI green なので技術的には可能だが、上記のとおり #2337 の到達状態に届かず、
対照実験の条件を壊す。dev 体験に効く更新でもなく急ぐ理由がない。

### PR 枠を無制限に近い値にする

枠を広げるほど取りこぼしは減るが、月曜のレビュー量が読めなくなる。
peer で結ばれた最大の組が収まる 8 で足りる。

## 影響

- 次回以降のバッチはレビュー対象が最大 8 件になりうる。
- `docs/release.md` と `.claude/rules/dependabot.md` は cooldown と schedule だけを
  規定しており PR 枠に触れていないので更新不要。
- cooldown 中だった新しい版（`lucide-react` 1.31.0 / `oxfmt` 0.63.0 /
  `@astrojs/starlight` 0.41.7）は次回以降のバッチで追いつく。
- `@astrojs/starlight` の PR は transitive の再解決で `@types/node` / `shiki` /
  `vite` の重複を増やしたが、後続の `oxfmt` PR の install で `shiki` 4.4.1 が
  4.4.2 に畳まれ一部は解消した。重複が増え続けるようなら別途 dedupe を検討する。

## 派生した気づき

`vscode-languageserver` 10 系では `Diagnostic.message` の型が `string` から
`string | MarkupContent` に広がり、`packages/lsp` の test で 9 箇所が型エラーになる。
にもかかわらず #2432 は全 CI green だった。**CI の Typecheck ステップが core / app / cli の
3 つだけで、`lsp` と `vscode` を検査していない**ためである。
本 ADR の範囲外の穴なので [#2446](https://github.com/kompiro/karasu/issues/2446) に切り出した。
