---
id: ADR-2628
title: ADR の assumptions に caret レンジの完全な版を書かない（機械チェックで落とす）
status: accepted
date: 2026-08-25
topic: adr-tooling
scope:
  packages: []
  concerns: [ci, dependencies]
related_to: [ADR-2623, ADR-2115, ADR-1338, ADR-2447, ADR-2562, ADR-788, ADR-1642, ADR-1077, ADR-2337, ADR-2472, ADR-2564, ADR-2440, ADR-1829]
assumptions:
  - "file: scripts/ci/adr-assumption-version-policy.test.ts"
  - "symbol: scripts/ci/adr-assumption-version-policy.test.ts :: pinsRangeToFullVersion"
  - "grep: .claude/rules/adr.md :: ## assumptions に書くこと"
---

# ADR-2628: ADR の assumptions に caret レンジの完全な版を書かない（機械チェックで落とす）

- **日付**: 2026-08-25
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#2628](https://github.com/kompiro/karasu/issues/2628)
  - 直接の引き金: [ADR-2623](2623-dependabot-triage-2026-08-25.md)（2026-08-25 の triage。#2614 が本件で red）
  - 同じ形の 1 度目: [ADR-1338](1338-fast-uri-override-pin.md) → [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)（`fast-uri`）
  - 同じ形の 2 度目: [ADR-2447](2447-dependabot-triage-2026-08-10.md)（`oxfmt` / `vitest`）
  - assumptions の設計: [ADR-788](788-adr-knowledge-graph.md)
  - assumptions だけを更新する前例: [ADR-1642](1642-en-ja-example-parity.md)
  - 版定数を持たない policy test の前例: [ADR-2562](2562-dependabot-triage-2026-08-17.md)
  - ADR ツールの所在: [ADR-1077](1077-adr-config-externalization.md)
  - 関連 TPL: [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md) / [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)
  - 運用ルール: `.claude/rules/adr.md`「assumptions に書くこと」

## 背景

`assumptions:` は、ADR が依拠する前提が崩れたときに CI を落とすための仕組みである
（[ADR-788](788-adr-knowledge-graph.md)）。これが機能するのは、**表明されているものが
その ADR の決定そのもの**であるときに限る。

2 度、決定ではなくリテラルの依存版が書かれ、2 度とも「決定は何も変わっていないのに
routine な Dependabot bump で CI が落ちる」という同じ事故になった。

- [ADR-1338](1338-fast-uri-override-pin.md) は `fast-uri: \^3\.1\.2` と patch 番号を書いた。
  [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) が緩めた。
- [ADR-2447](2447-dependabot-triage-2026-08-10.md) は `"oxfmt": "\^0.62.0"` と
  `"vitest": "\^4.1.10"` を書いた。oxfmt 0.63.0 の PR
  [#2614](https://github.com/kompiro/karasu/pull/2614) が `798 OK, 1 failing` で落ち、
  [ADR-2623](2623-dependabot-triage-2026-08-25.md) が緩めた。

**この失敗はサイズの割に高くつく。** Dependabot は `docs/adr/` を触らないので、bot PR は
その形のままでは green にできない。red の原因が upstream ではなく自分たちの表明だと
気づく人が要り、そのうえで同じ bump を運ぶ差し替え PR を出すことになる。2 度とも、
どの決定も変えない PR を 1 本消費した。

## 決定

**`assumptions:` で caret / tilde のレンジを assert するときは major で止める。**
リポジトリ全体を走査する機械チェックでこれを落とす。

判断基準は 1 つ、**caret / tilde の直後に `major.minor.patch` が続いていたら違反**。

```
- "grep: package.json :: \"oxfmt\": \"\\^0.62.0\""   # 0.63.0 で落ちる
+ "grep: package.json :: \"oxfmt\": \"\\^0\\."      # 0.x のあいだ成立する
```

置き場所は 3 つ:

| 何を | どこに |
| --- | --- |
| 機械チェック | `scripts/ci/adr-assumption-version-policy.test.ts`（全 ADR 走査） |
| 書く前に届く規則 | `.claude/rules/adr.md`「assumptions に書くこと」 |
| 経緯 | 本 ADR |

あわせて **既存の違反 8 件を同じ PR で緩めた**（下表）。本文は書き換えず `assumptions:`
だけを更新している（[ADR-1642](1642-en-ja-example-parity.md) と同じ扱い）。

| ADR | 緩めた assumption | 後 |
| --- | --- | --- |
| [ADR-2337](2337-lsp-pair-upgrade-protocol-parity.md) | `vscode-languageserver` / `vscode-languageclient` `\^10.1.0` | `\^10\.` |
| [ADR-2472](2472-dependabot-triage-2026-08-13.md) | `tailwindcss` / `@tailwindcss/vite` `\^4.3.3` | `\^4\.` |
| [ADR-2562](2562-dependabot-triage-2026-08-17.md) | `vscode` / `@types/vscode` `\^1\.125\.0` | `\^1\.` |
| [ADR-2564](2564-dependabot-security-2026-08-18.md) | `nanoid` `\^3\.3\.18` / `brace-expansion@5` `\^5\.0\.9` | `\^3\.` / `\^5\.` |

## 理由

### caret を assert しながら後ろを固定するのは、同じ行での矛盾

caret は「後ろは動いてよい」という宣言である。その後ろを assumption に書くと、
同じ 1 行が「動いてよい」と「動いてはいけない」を同時に言うことになる。
major で止めれば、表明の内容は「この依存は当該 major に caret で pin されている」に
なり、これは**まさに ADR が決めたこと**で、かつ caret が許す bump では壊れない。

### exact pin は対象外にした

`"pkg": "1.2.3"` のように caret を持たない pin は、その版に凍結したこと自体が決定である。
版は assumption の内容そのものなので書いてよい。判定を「caret / tilde を伴うか」に
落としたことで、この区別が規則の側で表現できている。

この線引きは実測で決めた。単純に `major.minor.patch` を弾く案だと
[ADR-2440](2440-blueoak-license-allowlist.md) の `BlueOak-1.0.0` が引っかかる。
これは SPDX 識別子であって版ではなく、bump もされない。main の 806 entry に対して
caret 判定は**真陽性 8 / 偽陽性 0**、素朴な判定は偽陽性 2 だった。

### 列挙ではなく走査で閉じた

チェックは `docs/adr` を読んで全 ADR を回る。今 assumptions を持つ ADR を書き出す形に
すると、次に足された ADR が最初から穴になる（[TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)）。
生成物（`effective.md` / `graph.md`）と `TEMPLATE.md` は `assumptions:` を持たない、
あるいはコメントアウトされているので、名指しの除外を書かずに自然に外れる。

チェックが走る場所も 2 経路ある。`adr-validate.yml` は `docs/adr/**` で発火して
`test:scripts` を回すので**新しい ADR は必ず通る**。`ci.yml` は `docs/**` を
`paths-ignore` するかわりに `test:coverage` 経由で回すので、**チェック自体を触る
変更が通る**。どちらか片方では片側が盲点になる（[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、
[ADR-1829](1829-adr-permalink-convention.md) の permalink チェックと同じ配線）。

### 3 案のうち機械チェックを採った

Issue [#2628](https://github.com/kompiro/karasu/issues/2628) では 3 案を並べた。
`.claude/rules/adr.md` への明文化と、ADR 昇格チェックリストへの追加と、機械チェック。
**記憶に依存しないのは 3 番目だけ**なので、これを本体にした。規則は補助として同じ PR で
書いた。違反したときは test が直し方を示すが、それは違反した後にしか届かないので、
書く前に読まれる層にも同じことを置いてある（`.claude/rules/README.md` の層の使い分け）。

## 却下した案 / 保留

- **`major.minor.patch` を無条件に弾く** — 偽陽性 2 件（ADR-2440 の SPDX 識別子）。
  除外リストで潰すこともできるが、リストは次の識別子で破れる。
- **`@kompiro/adr-tools` の `adr validate` 側に入れる** — 保留。karasu の
  `adr:validate` は外部パッケージ（[ADR-1077](1077-adr-config-externalization.md)）なので、
  そこに入れると本件の解決がリリース待ちになる。karasu 側の policy test は
  `scripts/ci/*-policy.test.ts` という既存の型（[ADR-2562](2562-dependabot-triage-2026-08-17.md)）に
  そのまま乗るので、まずこちらで閉じた。他 repo にも効く汎用ルールではあるので、
  upstream 提案は [kompiro/adr-tools#32](https://github.com/kompiro/adr-tools/issues/32) に立てた。
  採用されたら本 repo の test は薄くできる。
- **ADR 昇格チェックリストに項目を足すだけ** — 人間が覚えている前提に戻るので、
  2 度起きた事故に対しては弱い。
