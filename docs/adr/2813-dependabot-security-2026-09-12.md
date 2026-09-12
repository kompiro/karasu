---
id: ADR-2813
title: Dependabot security alert 2026-09-12（`js-yaml` の floor が 2 度続けて脆弱範囲の内側だった。同じ key での再発は「その時点の patched 版」を書く運用の帰結である）
status: accepted
date: 2026-09-12
topic: build
scope:
  concerns: [security, dependencies]
related_to: [ADR-2693, ADR-2628, ADR-2564, ADR-2404, ADR-2390, ADR-2401, ADR-2115, ADR-1675, ADR-1474, ADR-1038]
assumptions:
  # 決定は patched な系列へ caret で floor を置くことであって、そのときの
  # patch 番号ではない（ADR-2628 / ADR-2115）。
  - "grep: pnpm-workspace.yaml :: js-yaml@4: \\^4\\."
---

# ADR-2813: Dependabot security alert 2026-09-12（`js-yaml` の floor が 2 度続けて脆弱範囲の内側だった。同じ key での再発は「その時点の patched 版」を書く運用の帰結である）

- **日付**: 2026-09-12
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2813](https://github.com/kompiro/karasu/issues/2813)
  - 修正 PR: [#2814](https://github.com/kompiro/karasu/pull/2814)
  - 同じ失敗型の先例: [ADR-2390](2390-dependabot-security-2026-08-07.md)（`js-yaml`、同一 key）/ [ADR-2404](2404-dependabot-security-2026-08-08.md)（`dompurify`）/ [ADR-2564](2564-dependabot-security-2026-08-18.md)（`brace-expansion`）/ [ADR-2693](2693-dependabot-security-2026-09-03.md)（`fast-uri` / `qs`）
  - この `js-yaml@4` override を導入した ADR: [ADR-1675](1675-jsyaml-readyamlfile-override.md)
  - override の運用規則: [ADR-1474](1474-dependabot-security-2026-05-20.md) / 置き場は [ADR-2401](2401-pnpm-11-migration.md)
  - override キーのスコープと caret 運用: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

Dependabot security alert が 1 件残っていた。transitive なので security update PR は起票されていない。

| alert | package | severity | CVSS | advisory | 脆弱範囲 | patched | 当時の override | lock の解決 | 経路 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#74](https://github.com/kompiro/karasu/security/dependabot/74) | `js-yaml` | high (7.5) | `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | GHSA-2883-xcg3-v3hh / CVE-2026-84375 | `>= 4.0.0, < 4.3.2` | 4.3.2 | `js-yaml@4: ^4.3.1` | **4.3.1**（4 edge）/ 4.3.2（9 edge） | `@astrojs/starlight` / `@kompiro/adr-tools` / `@kompiro/tpl-tools` / `mocha` |

`maxTotalMergeKeys` が空マッピングを数えないため、`{}` だけを並べた sequence を merge source に
すると、`totalMergeKeys` が increment されないまま `O(N * K)` の走査が走る。上限は設定されていても
発火しない。advisory の PoC は 50 KB の入力で ~180 ms に達し、そこから二次で伸びる。
可用性のみに効く（`C:N/I:N`）。

**override は既にあり、その floor が advisory の脆弱範囲の内側にあった。**
[ADR-2564](2564-dependabot-security-2026-08-18.md) が「再発する型」と名指した形の 5 例目であり、
**`js-yaml@4` という同一 key での 2 回目**である。6 週間前の
[ADR-2390](2390-dependabot-security-2026-08-07.md) が同じ key を `^4.3.0` から `^4.3.1` へ
引き上げており、その `^4.3.1` が今回そのまま脆弱範囲になった。

自動化されている `security-alert-sweep`（gh-aw）は今回も alert を読めていない
（[#2690](https://github.com/kompiro/karasu/issues/2690)、secrecy policy により一覧が空で返る）。
この型が [#2690](https://github.com/kompiro/karasu/issues/2690) 起票以降に見つかった 2 例は
どちらも手動実行によるものである。

## 決定

**override の floor を修正版へ上げた。**

| alert | 変更 | lock の解決 |
| --- | --- | --- |
| #74 | `js-yaml@4: ^4.3.1` → `^4.3.2` | 4.3.1 → **4.3.2**（4 edge） |

`js-yaml` はどの manifest でも直接依存として宣言されていないので、同時に引き上げるべき宣言
レンジは存在しなかった。キーは `@4` にスコープしたまま据え置いた。

## 理由

### 同じ key で 2 度起きたのは、floor に「そのときの patched 版」を書いているからである

[ADR-2693](2693-dependabot-security-2026-09-03.md) は「floor の仕事は脆弱版が選ばれないこと
ではなく届かないこと」と書いた。今回はその一段先が見える。**floor を引き上げる操作そのものが、
次の advisory の仕込みになっている。**

ADR-2390 の時点で `^4.3.1` は「脆弱範囲の外」だった。だが上流が同じ関数群
（merge key の数え上げ）を何度も直している以上、その系列の次の patch がまた advisory になる
確率は高い。実際 `js-yaml` の 4.x には 2026 年だけで `< 4.1.1` / `< 4.3.0` / `< 4.3.1` /
`< 4.3.2` と 4 本の advisory が積まれている。floor に patch 番号を書く運用は、**この列の
どこかを必ず指す**。

だから「floor を上げ忘れた」とは読まない。上げた結果として範囲の内側に戻ったのであり、
**上げる操作を続けるかぎり同じことが起きる**。防ぐ側の仕事は floor の値ではなく、
突き合わせを毎回走らせること（`.claude/rules/dependabot.md` の到達状態）と、その突き合わせを
機械で回すこと（[#2690](https://github.com/kompiro/karasu/issues/2690)）にある。

### caret のまま系列に floor を置き、exact pin にはしない

4.x に advisory が積み上がっている以上、exact pin（`js-yaml@4: 4.3.2`）にすれば「次の patch に
勝手に乗らない」は成立する。しかしそれは上流の修正にも乗らないということで、この列の性質からは
むしろ逆効果である。[ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) 以来の
caret 運用を崩す理由が無い。この ADR の `assumptions` も patch 番号ではなく系列
（`js-yaml@4: \^4\.`）で書いた（[ADR-2628](2628-adr-assumption-version-policy.md)）。

### キーは `@4` にスコープしたままにする

lock には `js-yaml@5.2.3` も居る（`vscode-extension-tester@8.24.0` 経由）。advisory の範囲は
3.x（`< 3.15.2`）と 4.x（`< 4.3.2`）のみで、5.2.3 は 5.x に出ている advisory
（`<= 5.1.0` / `<= 5.2.0` / `<= 5.2.1`）のいずれの範囲にも入っていない。無印キーにすれば
5.x まで巻き上げてしまうので、`@4` スコープを維持した。3.x は lock に 1 件も無い
（[ADR-1675](1675-jsyaml-readyamlfile-override.md) の `read-yaml-file@1: ^2.1.0` が経路を
断っている）ので、3.x 側の floor は起こしていない。

### 巻き込みは lock の依存エッジで確かめた

`name@version` の集合比較では、消費側が「グラフに既にある別バージョン」へ乗り換えた場合を
検出できない（[ADR-2564](2564-dependabot-security-2026-08-18.md)）。今回はまさにその形で、
**4.3.2 は変更前から lock に存在していた**（9 edge がそちらに解決していた）。集合だけ見ると
「`js-yaml@4.3.1` が 1 件消えた」としか見えない。

peer suffix を落として `owner -> dep -> resolved` を突き合わせた結果、動いたのは意図した 4 本
だけだった:

```
BEFORE  @astrojs/starlight@0.41.6   js-yaml 4.3.1
AFTER   @astrojs/starlight@0.41.6   js-yaml 4.3.2
BEFORE  @kompiro/adr-tools@0.0.13   js-yaml 4.3.1
AFTER   @kompiro/adr-tools@0.0.13   js-yaml 4.3.2
BEFORE  @kompiro/tpl-tools@0.0.9    js-yaml 4.3.1
AFTER   @kompiro/tpl-tools@0.0.9    js-yaml 4.3.2
BEFORE  mocha@11.8.0                js-yaml 4.3.1
AFTER   mocha@11.8.0                js-yaml 4.3.2
```

参照が消えた `js-yaml@4.3.1 -> argparse 2.0.1` の 1 本を除き、他の edge は動いていない
（`js-yaml@4.3.2 -> argparse 2.0.1` は両側で同一）。脆弱範囲のバージョンが lock に 1 件も
残っていないことも別途 `grep -c` で確認した（`js-yaml@4.0.0`〜`4.3.1` すべて 0、`3.x` は 0 件）。

### CI が触らない領域を手で確かめた

動いた 4 本のうち `@astrojs/starlight` は `packages/docs-site` の経路で、docs-site は root の
`build` に入っていない（`test` には入っている）。[ADR-2693](2693-dependabot-security-2026-09-03.md)
と同じ理由で docs-site のビルドを手で回した（71 ページ clean）。`@kompiro/adr-tools` /
`@kompiro/tpl-tools` は `pnpm adr:validate`（378 ADR）/ `pnpm tpl:validate`（139 TPL）で
直接動かした。`mocha` は `packages/vscode-e2e` にしか届かず、この aarch64 devcontainer では
ローカル実行できないので CI の ExTester ジョブに委ねた（PR #2814 で pass）。

4 本ともツール経路で、出荷される実行コードではない。`packages/cli/THIRD_PARTY_NOTICES.md` は
再生成しても差分が出ず、`pnpm changeset status --since=origin/main` も bump 対象なしを返す
ので changeset は起こしていない。

## 却下した案

### lock だけ再解決して override は据え置く

`^4.3.1` は 4.3.2 を含むので、`pnpm update js-yaml` でも当座は patched 版に上がる。だが
脆弱な 4.3.1 が満たしうる解として残り、グラフが動いたときに戻れてしまう
（[ADR-2693](2693-dependabot-security-2026-09-03.md)）。今回は 9 edge が既に 4.3.2 に
解決していたぶん、「もう直っている」と読み違えやすい形でもあった。

### 4.x を捨てて `js-yaml@5` に寄せる

5.x には今回の弱点が最初から無い。しかし 4.x を引いているのは上流 4 パッケージの側であり、
override で major をまたがせるのは [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
が退けた形そのものである。上流が自分で 5.x に移るのを待つ。

### alert を根拠つきで `dismiss` する

修正版が存在し、floor の引き上げだけで解決でき、巻き込みもゼロだった。緩和策を選ぶ理由が無い。

## 残した観察

`security-alert-sweep` が alert を読めない状態が [#2690](https://github.com/kompiro/karasu/issues/2690)
のまま 2 週間以上続いている。ADR-2693 が「#2690 の優先度は単なる workflow 修理より高く見てよい」と
書いた根拠は、今回さらに 1 例増えた。**同じ key で 2 度目が起きたこと**は、この突き合わせが
人の実行回数に依存しているかぎり抜けが出る、という追加の証拠として読める。
