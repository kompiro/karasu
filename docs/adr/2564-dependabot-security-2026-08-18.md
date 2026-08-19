---
id: ADR-2564
title: Dependabot security alert 2026-08-18（auto-dismiss された 2 件が脆弱版のままだった。floor を上げ、収集クエリの前提を改める）
status: accepted
date: 2026-08-18
topic: build
scope:
  packages: [app, docs-site]
  concerns: [security, dependencies]
related_to: [ADR-2562, ADR-2404, ADR-2390, ADR-2401, ADR-1474]
assumptions:
  - "grep: pnpm-workspace.yaml :: nanoid: \\^3\\.3\\.18"
  - "grep: pnpm-workspace.yaml :: brace-expansion@5: \\^5\\.0\\.9"
---

# ADR-2564: Dependabot security alert 2026-08-18（auto-dismiss された 2 件が脆弱版のままだった。floor を上げ、収集クエリの前提を改める）

- **日付**: 2026-08-18
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2564](https://github.com/kompiro/karasu/issues/2564)
  - 修正 PR: [#2565](https://github.com/kompiro/karasu/pull/2565)
  - 直前の triage: [ADR-2562](2562-dependabot-triage-2026-08-17.md)（alert #68 を「バッチ外」として記録した）
  - 同じ失敗型の先例: [ADR-2390](2390-dependabot-security-2026-08-07.md)（`js-yaml`）/ [ADR-2404](2404-dependabot-security-2026-08-08.md)（`dompurify`）
  - override の運用規則: [ADR-1474](1474-dependabot-security-2026-05-20.md) / 置き場は [ADR-2401](2401-pnpm-11-migration.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

[ADR-2562](2562-dependabot-triage-2026-08-17.md) が「バッチ外」として送った `nanoid` の
alert を処理しようとしたところ、**open な alert は 0 件**だった。GitHub の auto-triage が
development スコープとして自動 dismiss していたためで、**脆弱版は lock に残ったままだった**。

| alert | package | severity | advisory | 脆弱範囲 | patched | lock の解決 | 経路 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #68 | `nanoid` | high | GHSA-2v37-7h3g-55p8 | `< 3.3.18` | 3.3.18 | **3.3.17** | `postcss@8.5.25` ← `vite@8.1.5` |
| #63 | `brace-expansion` | high | GHSA-rgw5-rvv9-x895 | `>= 4.0.0, < 5.0.9` | 5.0.9 | **5.0.8** | `minimatch@10.2.6` |

どちらも直接依存の宣言は無く、純粋な transitive だった。

**#68 は本日のバッチマージ中に状態が変わった。** 同日午前は `state: open` / `scope: runtime`
だったが、14:49:51 に `auto_dismissed` / `scope: development` になった。依存グラフが動いた
結果であって、脆弱版が消えたわけではない。

**#63 のほうが問題だった。** `pnpm-workspace.yaml` に `brace-expansion@5: ^5.0.8` が既にあり、
脆弱範囲 `>= 4.0.0, < 5.0.9` はこの floor を含む。`.claude/rules/dependabot.md` が
`js-yaml`（`^4.3.0` vs `< 4.3.1`、[ADR-2390](2390-dependabot-security-2026-08-07.md)）と
`dompurify`（`^3.4.12` vs `<= 3.4.12`、[ADR-2404](2404-dependabot-security-2026-08-08.md)）の
実例として名指ししている型の 3 例目である。2026-08-04 に dismiss されてから 2 週間、
誰の視界にも入らないまま残っていた。

## 決定

**2 件とも floor を修正版へ上げた。あわせて、security alert の収集クエリを
`state == "open"` に限定しない方針に改める。**

| alert | 修正方法 | 変更 |
| --- | --- | --- |
| #68 | override を新設 | `nanoid: ^3.3.18` |
| #63 | 既存 floor の引き上げ | `brace-expansion@5: ^5.0.8` → `^5.0.9` |

`brace-expansion` の `@1` / `@2` キーは据え置いた。advisory の脆弱範囲は 4.0.0 以降なので、
これらは範囲外である。

収集側は、`auto_dismissed` を含めて取得したうえで「lock の解決版が脆弱範囲に入っているか」で
判定する。GitHub の auto-triage 規則そのものは狭めない。

## 理由

### 「open な alert が 0 件」は「脆弱版が無い」ではない

auto-dismiss は GitHub が**通知ノイズを減らすために**下す判断で、パッケージが安全になった
ことの証明ではない。`state == "open"` だけを収集する手順は、この 2 つを同一視している。
実際 #63 は 2 週間その死角に入っていた。

これは override が「今の解決を矯正する道具であって、もう安全であることの証明ではない」
（`.claude/rules/dependabot.md`）のと同じ構図である。**判定に使ってよいのは、advisory の
脆弱範囲と実際の解決版・宣言レンジの突き合わせだけ**で、alert の state も override の存在も
その代理にはならない。

規則そのものを狭めなかったのは、auto-triage が減らしているノイズには価値があるからである。
dev スコープの alert を毎回 open で受けると、実害の無いものが常時並ぶ。**見落としの原因は
規則ではなく、規則の出力を「対応不要」と読み替えていた収集クエリのほうにある。**
収集手順は `/hane:security-alert`（[kompiro/hane](https://github.com/kompiro/hane)）が持つので、
そちらへ起票した。

### `nanoid` は postcss ではなく nanoid 自身を pin する

脆弱な `nanoid` は `postcss@8.5.25` からしか届かず、`postcss: ^8.5.18` は既に override に
あるので、postcss の floor を `^8.5.26` に上げても（postcss が 1 版に畳まれる副作用つきで）
直せた。

そうしなかったのは、**どの postcss が nanoid を引くかに依存しない形にしたかった**ためである。
override ブロックの但し書き「most entries exist because a GHSA had no other way to reach a
transitive dep」が言う通り、このブロックは advisory が名指しするパッケージを押さえる場所で、
中間ノードを押さえる場所ではない。

### 巻き込みは lock の依存エッジで確かめた

`name@version` を集合として before / after で比べる方法は、**消費側が「グラフに既にある別
バージョン」へ乗り換えた場合を検出できない**。peer suffix を落として
`owner -> dep -> resolved` を突き合わせた結果、実際に動いた解決は 2 本だけだった:

```
BEFORE  minimatch@10.2.6 brace-expansion 5.0.8
AFTER   minimatch@10.2.6 brace-expansion 5.0.9
BEFORE  postcss@8.5.25 nanoid 3.3.17
AFTER   postcss@8.5.25 nanoid 3.3.18
```

（`brace-expansion@5.0.x -> balanced-match` の 1 組は snapshot キーの改名で、
`balanced-match` の版は両側とも 4.0.4。）

### CI が触らない領域を手で確かめた

`postcss` は `packages/docs-site` の astro / tailwind 経由でも効くが、docs-site は root の
`build` スクリプトに入っていない（`test` には入っている）。lock が動いた領域のうち
build されないものが残るのは退行が merge 後に出る形なので、docs-site のビルドを手で回した
（71 ページ clean）。`packages/cli/THIRD_PARTY_NOTICES.md` は再生成しても差分が出ず、
出荷物の依存集合が変わっていないことを確認した。changeset は起こしていない。

## 却下した案

### `postcss` の floor を `^8.5.26` に上げて nanoid を間接的に直す

postcss が 1 版に畳まれる副作用は好ましいが、**advisory が名指ししていないパッケージで
脆弱性を塞ぐ形**になる。postcss 側の依存が将来動いたときに、この override が
nanoid を守っている理由が読み取れなくなる。畳み込み自体が要るなら、security とは別の
理由で別途行う。

### auto-triage 規則を狭め、high 以上は dev スコープでも dismiss しないようにする

見落としは確実に減るが、**GitHub 側の設定を変えても手順の前提は直らない**。
`state == "open"` で収集する限り、次に別の理由（severity の再評価、スコープの再計算）で
dismiss されたものは同じように消える。#68 が今日 runtime から development へ移ったことが
示す通り、この分類は動く。直すべきは判定の根拠のほうである。

### alert を根拠つきで `dismiss` する

どちらも修正版が存在し、override だけで解決でき、巻き込みもゼロだった。
緩和策を選ぶ理由が無い。

## 残した観察

`brace-expansion@1: ^1.1.18` は lock に 1.x の解決を 1 件も持たない（現在の解決は 2.1.4 と
5.0.9 のみ）。無害だが、override が実際には何も矯正していない状態である。今回は security の
判断と混ぜないため触っていない。棚卸しするなら別途。
