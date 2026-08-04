---
id: ADR-2341
title: Security alert 2026-08-04 — brace-expansion / fast-uri を override の floor 引き上げで解決する
status: accepted
date: 2026-08-04
topic: build
scope:
  packages: [core, app, cli, lsp, vscode]
  concerns: [dependencies, security]
related_to: [ADR-2333, ADR-1038, ADR-2115]
---

# ADR-2341: Security alert 2026-08-04 — brace-expansion / fast-uri を override の floor 引き上げで解決する

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2341](https://github.com/kompiro/karasu/issues/2341)
  - 修正 PR: [#2342](https://github.com/kompiro/karasu/pull/2342)
  - 同日の version update triage: [ADR-2333](2333-dependabot-triage-2026-08-04.md)
  - security update の即時起票と重複 PR の扱い: [ADR-1038](1038-dependabot-security-2026-04-29.md)
  - override と lockfile の不整合による失敗モード: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - 運用ルール: `.claude/rules/dependabot.md`
  - コード: `package.json`（root `pnpm.overrides`）, `pnpm-lock.yaml`

## 背景

open な Dependabot security alert が 5 件あった。**5 件とも high severity・transitive 依存・
runtime scope**である。

| alert | package | advisory | CVE | 脆弱範囲 | patched |
| --- | --- | --- | --- | --- | --- |
| #61 | `brace-expansion` | GHSA-rgw5-rvv9-x895 | CVE-2026-69152 | `< 1.1.18` | 1.1.18 |
| #62 | `brace-expansion` | GHSA-rgw5-rvv9-x895 | CVE-2026-69152 | `>= 2.0.0, < 2.1.4` | 2.1.4 |
| #60 | `brace-expansion` | GHSA-mh99-v99m-4gvg | CVE-2026-14257 | `< 1.1.17` | 1.1.17 |
| #59 | `brace-expansion` | GHSA-mh99-v99m-4gvg | CVE-2026-14257 | `>= 2.0.0, < 2.1.3` | 2.1.3 |
| #65 | `fast-uri` | GHSA-7p8r-x3mc-p8w7 | CVE-2026-18446 | `>= 3.0.0, < 3.1.5` | 3.1.5 |

`brace-expansion` の 2 件はいずれも DoS（CWE-400 / CWE-770）で、**CVE-2026-69152 は
CVE-2026-14257 の修正を迂回する後続の脆弱性**である。したがって major ごとに高いほうの floor
まで上げれば、その major の alert 2 件が同時に閉じる。`fast-uri` は backslash を authority
introducer として解釈させる host confusion（CWE-436）。

**5 件とも対応する Dependabot PR は存在しなかった。** transitive 依存であり bump すべき直接の
宣言行が `package.json` に無いため、Dependabot は security update PR を合成できない
（`.claude/rules/dependabot.md` および本 skill が主対象とするケース）。

一方で 3 パッケージとも **root `pnpm.overrides` で既に floor 管理下にあり**、単に floor が
patched version より低いだけだった:

```
"brace-expansion@1": "^1.1.16",   → 1.1.16 に解決（要 >= 1.1.18）
"brace-expansion@2": "^2.1.2",    → 2.1.2 に解決（要 >= 2.1.4）
"fast-uri": "^3.1.4",             → 3.1.4 に解決（要 >= 3.1.5）
```

## 決定

**root `pnpm.overrides` の floor を patched version 以上へ引き上げて 5 件すべてを解決した。**

```diff
-"brace-expansion@1": "^1.1.16",
-"brace-expansion@2": "^2.1.2",
+"brace-expansion@1": "^1.1.18",
+"brace-expansion@2": "^2.1.4",
 "brace-expansion@5": "^5.0.8",
-"fast-uri": "^3.1.4",
+"fast-uri": "^3.1.5",
```

**`brace-expansion` のキーは major ごとにスコープしたまま維持する。**

## 理由

### transitive 依存なので override が正しい手段

direct 依存なら該当 `package.json` の宣言を bump すればよいが、5 件とも transitive であり
宣言行が存在しない。pnpm workspace では root `pnpm.overrides` が唯一の解決手段になる。
既に同じ機構で floor 管理されていたため、**新しい仕組みを足すのではなく既存 floor の
引き上げ**で済んだ。

### `brace-expansion` のキーを major スコープに保つ理由

依存ツリーには `brace-expansion` の major が **1 / 2 / 5 の 3 系統**共存している。
無印キー（`"brace-expansion": "^5.0.8"` のような形）で巻き上げると、**どちらの advisory も
影響しない `@5` 系統まで major 境界をまたいで強制昇格**してしまう。advisory の脆弱範囲が
含む major だけにキーをスコープするのが正しい。

実測でもスコープが効いていることを確認した — 修正後も `brace-expansion@5.0.8` は据え置きで、
lockfile の差分は `brace-expansion` と `fast-uri` の 2 パッケージ以外に 1 行も及んでいない。

`fast-uri` は 3.x 系統しかツリーに存在しないため無印キーのままでよい（スコープすべき
対象が無い）。

### cooldown は適用しない

`.github/dependabot.yml` の cooldown は全 semver レベル 7 日だが、**security update は
`schedule` も `cooldown` も参照しない**（[ADR-1038](1038-dependabot-security-2026-04-29.md)）。
patched version は 2026-07-30 / 07-31 公開で 7 日未満だが、脆弱性を抱えたまま待つ理由はない。

### サプライチェーン確認

floor 引き上げで入る版が改ざんされていないことを確認した。**修正版の publisher は現在
ツリーに入っている版と同一**で、`scripts` の集合も同一、**install 時の lifecycle script は
無い**:

| package | 現在 | 修正版 | publisher |
| --- | --- | --- | --- |
| `brace-expansion` | 1.1.16 / 2.1.2 | 1.1.18 / 2.1.4 | `juliangruber`（同一） |
| `fast-uri` | 3.1.4 | 3.1.5 | `matteo.collina`（同一） |

provenance attestation は無いが、**置き換え前の版にも無い**ため劣化ではない。

### 過去の判断の失効

かつて「`brace-expansion` は修正版が存在しないため alert を意図的に open のままにする」と
判断した経緯があるが、**2026-07-30 に両 advisory とも patched version が公開されたため
この判断は失効している**。当時の判断は「upstream patch が出たら floor を引き上げる」という
条件付きのものであり、その条件が満たされた。

### alert #64（`postcss`）は自然解消した

トリアージ開始時点では `postcss`（medium, GHSA-fxqj-rqcc-2cmp, patched 8.5.23）も open
だったが、[ADR-2333](2333-dependabot-triage-2026-08-04.md) の version update バッチを
反映する過程で解消した。`vite` 8.1.5 が `postcss` を `^8.5.17` に要求し、既存 override
`"postcss": "^8.5.18"` と合わせて 8.5.25 に解決されたため。**本 ADR では何も操作していない。**

## 却下した案

### 案: 無印キー `"brace-expansion": "^5.0.8"` で一括して上げる

**却下** — 記述は 1 行で済むが、どちらの advisory も影響しない `@1` / `@5` 系統まで major
境界をまたいで昇格させる。脆弱性対応が無関係な breaking change を持ち込むのは筋が悪い。

### 案: alert を `dismiss` する

**却下** — 5 件とも runtime scope の high であり、patched version が存在する。dismiss の
正当な理由（修正版が無い・到達不能なコードパス）のいずれにも当たらない。

### 案: `brace-expansion` / `fast-uri` を直接依存に昇格させて bump する

**却下** — 使っていないパッケージを宣言することになり、依存グラフの実態と宣言が乖離する。
override は「他者の依存の版を締める」ための機構であり、この用途にそのまま合致している。

## 未解決 / 今後

- `pnpm.overrides` の floor は **advisory が出るたびに手で引き上げる運用**になっている。
  floor が patched version を下回っていることを検知する仕組みは無く、今回も alert が
  気づく契機だった。alert 自体が検知器として機能しているので当面は許容するが、
  override エントリ数が増え続けるようなら棚卸しの仕組みを検討する。
