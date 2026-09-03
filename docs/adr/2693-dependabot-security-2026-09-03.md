---
id: ADR-2693
title: Dependabot security alert 2026-09-03（`fast-uri` / `qs` の override floor が脆弱範囲の内側だった。floor は「選ばれない」ではなく「届かない」を作る道具である）
status: accepted
date: 2026-09-03
topic: build
scope:
  concerns: [security, dependencies]
related_to: [ADR-2564, ADR-2404, ADR-2390, ADR-2401, ADR-2115, ADR-1474, ADR-1338, ADR-128]
assumptions:
  # 決定は patched な系列へ caret で floor を置くことであって、そのときの
  # patch 番号ではない（ADR-2628 / ADR-2115）。
  - "grep: pnpm-workspace.yaml :: fast-uri: \\^3\\."
  - "grep: pnpm-workspace.yaml :: qs: \\^6\\."
---

# ADR-2693: Dependabot security alert 2026-09-03（`fast-uri` / `qs` の override floor が脆弱範囲の内側だった。floor は「選ばれない」ではなく「届かない」を作る道具である）

- **日付**: 2026-09-03
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2693](https://github.com/kompiro/karasu/issues/2693)
  - 修正 PR: [#2694](https://github.com/kompiro/karasu/pull/2694)
  - 同じ失敗型の先例: [ADR-2390](2390-dependabot-security-2026-08-07.md)（`js-yaml`）/ [ADR-2404](2404-dependabot-security-2026-08-08.md)（`dompurify`）/ [ADR-2564](2564-dependabot-security-2026-08-18.md)（`brace-expansion`）
  - `fast-uri` の override 起源: [ADR-1338](1338-fast-uri-override-pin.md)
  - override の運用規則: [ADR-1474](1474-dependabot-security-2026-05-20.md) / 置き場は [ADR-2401](2401-pnpm-11-migration.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

Dependabot security alert が 3 件、いずれも transitive で残っていた。transitive なので
security update PR は 1 件も起票されていない。

| alert | package | severity | advisory | 脆弱範囲 | patched | 当時の override | lock の解決 | 経路 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #70 | `fast-uri` | high (7.5) | GHSA-fph4-wmhf-6fwf / CVE-2026-75899 | `>= 3.1.2, < 3.1.6` | 3.1.6 | `^3.1.5` | **3.1.5** | `ajv@8.20.0` |
| #69 | `fast-uri` | high (7.5) | GHSA-5jgf-p345-68v8 / CVE-2026-75931 | `>= 3.1.3, < 3.1.6` | 3.1.6 | `^3.1.5` | **3.1.5** | `ajv@8.20.0` |
| #71 | `qs` | medium (3.7) | GHSA-x5fp-wj9c-mxmx / CVE-2026-82562 | `>= 6.14.2, <= 6.15.3` | 6.16.0 | `^6.15.2` | **6.15.3** | `typed-rest-client@1.8.11` |

**両パッケージとも override は既にあり、両方の floor が advisory の脆弱範囲の内側にあった。**
[ADR-2390](2390-dependabot-security-2026-08-07.md) / [ADR-2404](2404-dependabot-security-2026-08-08.md) /
[ADR-2564](2564-dependabot-security-2026-08-18.md) が記録した型の 4 例目である。

`fast-uri` の 2 件はどちらも、**このリポが最初に pin する理由になった CVE の
incomplete-fix variant** だった（[ADR-1338](1338-fast-uri-override-pin.md) が扱った
CVE-2026-6322 / CVE-2026-13676 の続き）。#70 は `normalize()` / `resolve()` 1 回の呼び出しで
host の percent escape を 2 度 decode するため、`http://%256c%256f%2563%2561%256c%256
8%256f%2573%2574/` が `http://localhost/` になる。#69 は scheme-relative reference
（`//host/`）で IDN canonicalization を飛ばすため、`resolve()` の戻り値を再 parse すると
別の host になる。どちらも SSRF / allowlist 判定を素通りさせる形である。

自動化されている `security-alert-sweep`（gh-aw）はこの 3 件を読めていない。
secrecy policy により alert 一覧が空で返るためで、[#2690](https://github.com/kompiro/karasu/issues/2690)
として failure が起票されている。今回の sweep は手動で回した。

## 決定

**3 件とも override の floor を修正版へ上げた。**

| alert | 変更 | lock の解決 |
| --- | --- | --- |
| #70 / #69 | `fast-uri: ^3.1.5` → `^3.1.6` | 3.1.5 → **3.1.7** |
| #71 | `qs: ^6.15.2` → `^6.16.0` | 6.15.3 → **6.16.0** |

どちらも直接依存としての宣言は無く、同時に引き上げるべき宣言レンジは存在しなかった。

## 理由

### floor の仕事は「脆弱版が選ばれないこと」ではなく「届かないこと」

今回もっとも紛らわしかった点を残しておく。**引き上げ前の caret floor は、実は patched 版を
許していた。** `^3.1.5` は 3.1.6 を含むし、`^6.15.2` は 6.16.0 を含む。にもかかわらず lock は
3.1.5 / 6.15.3 に留まっていた。再解決を促すものが何も無かったからで、`pnpm update` を
打つだけでも当座は直った。

だから「floor は既に十分だった、lock が古いだけだ」と読みたくなるが、それは誤りである。
`^3.1.5` を据え置いたまま lock だけ直すと、**脆弱な 3.1.5 は依然として満たしうる解**として
残る。次にグラフが動いたとき、あるいは lock を作り直したときに戻れてしまう。

floor を上げて初めて **脆弱範囲が到達不能になる**。ADR-2564 が「override は今の解決を矯正
する道具であって、もう安全であることの証明ではない」と書いたことの裏返しで、
**override が証明になるのは floor が脆弱範囲の外にあるときだけ**である。
[ADR-2564](2564-dependabot-security-2026-08-18.md) の `brace-expansion@5: ^5.0.8`
（patched 5.0.9）もまったく同じ形だった。4 例に共通しているのはこの一点で、
「caret だから上がるはず」という期待が floor の点検を省かせている。

### `fast-uri` は 3.1.6 ではなく 3.1.7 に着地してよい

caret floor なので、advisory の patched 版そのものではなく系列の最新に解決される。
[ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) が
[ADR-1338](1338-fast-uri-override-pin.md) の assumption を patch 番号から系列
（`fast-uri: \^3\.`）へ緩めたのは、まさにこの着地を想定してのことである。
3.1.7 に既知の advisory が無いことは GitHub Advisory API で確認した。`qs@6.16.0` も同様。

### 中間ノード（`ajv`）ではなく advisory が名指すパッケージを押さえる

`fast-uri` は `ajv@8.20.0` からしか届かないので、`ajv` の floor を上げても直せた。
そうしなかったのは [ADR-2564](2564-dependabot-security-2026-08-18.md) が `nanoid` / `postcss`
で示した理由と同じで、override ブロックは advisory が名指すパッケージを押さえる場所であり、
中間ノードを押さえる場所ではない。`ajv` の依存が将来動いたとき、その override が
`fast-uri` を守っている理由が読み取れなくなる。

### 巻き込みは lock の依存エッジで確かめた

`name@version` を集合として比べる方法は、消費側が「グラフに既にある別バージョン」へ
乗り換えた場合を検出できない（[ADR-2564](2564-dependabot-security-2026-08-18.md)）。
peer suffix を落として `owner -> dep -> resolved` を突き合わせた結果、実際に動いたのは
意図した 2 本だけだった:

```
BEFORE  ajv@8.20.0             fast-uri 3.1.5
AFTER   ajv@8.20.0             fast-uri 3.1.7
BEFORE  typed-rest-client@1.8.11  qs     6.15.3
AFTER   typed-rest-client@1.8.11  qs     6.16.0
```

（`qs@6.15.3 -> qs@6.16.0` の snapshot キー改名に伴う 2 組は、`es-define-property` /
`side-channel` とも両側で同版。）

脆弱範囲のバージョンが lock に 1 件も残っていないことも別途 `grep -c` で確認した
（`qs@6.14.x`–`6.15.3` / `fast-uri@3.1.2`–`3.1.5` すべて 0）。

### CI が触らない領域を手で確かめた

`ajv` は `packages/docs-site` の astro 経由でも効くが、docs-site は root の `build` に
入っていない（`test` には入っている）。lock が動いた領域のうち build されないものを
残すと退行が merge 後に出るので、docs-site のビルドを手で回した（71 ページ clean）。

`packages/cli/THIRD_PARTY_NOTICES.md` は再生成しても差分が出なかった。出荷物の依存集合は
変わっていない。今回動いた 2 本はどちらも tooling 経路
（`ajv` ← secretlint、`qs` ← `azure-devops-node-api` ← `@vscode/vsce`）で、
出荷される実行コードではない。`pnpm changeset status --since=origin/main` も
bump 対象なしを返すので changeset は起こしていない。

## 却下した案

### lock だけ再解決して override は据え置く

`pnpm update fast-uri qs` で当座は patched 版に上がる。だが上の「floor の仕事」の通り、
脆弱版が満たしうる解として残り続ける。**alert を閉じる最短手が、次の再発の仕込みになる**形
なので採らない。

### 修正版に exact pin（`fast-uri: 3.1.6`）する

脆弱範囲を確実に外れるが、以後の patch を自分で追う必要が出る。このリポの override は
[ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) 以来 caret で系列に floor を
置く運用で統一されており、今回それを崩す理由が無い。

### alert を根拠つきで `dismiss` する

3 件とも修正版が存在し、override の floor 引き上げだけで解決でき、巻き込みもゼロだった。
緩和策を選ぶ理由が無い。

## 残した観察

`security-alert-sweep` が alert を読めない（[#2690](https://github.com/kompiro/karasu/issues/2690)）
ままだと、この型の見落としを機械で捕まえる経路が無い。ADR-2564 が
「見落としの原因は規則ではなく、規則の出力を『対応不要』と読み替えていた収集クエリのほう」と
書いた対策は `/hane:security-alert` 側に入ったが、**それを自動で回す側が今は止まっている**。
今回 4 例目が human-run で見つかったこと自体がその証拠なので、#2690 の優先度は
単なる workflow 修理より高く見てよい。
