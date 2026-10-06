---
id: ADR-2985
title: Dependabot security alert 2026-09-29（`undici` の override floor が脆弱範囲の内側だったので `^7.29.1` に上げた）
status: accepted
date: 2026-09-29
topic: build
scope:
  concerns: [security, dependencies]
related_to: [ADR-1694, ADR-2813, ADR-2693, ADR-2564, ADR-2404, ADR-2390, ADR-2401, ADR-2115, ADR-2628]
assumptions:
  # 決定は patched な系列へ caret で floor を置くことであって、そのときの
  # patch 番号ではない（ADR-2628 / ADR-2813）。
  - "grep: pnpm-workspace.yaml :: undici: \\^7\\."
---

# ADR-2985: Dependabot security alert 2026-09-29（`undici` の override floor が脆弱範囲の内側だったので `^7.29.1` に上げた）

- **日付**: 2026-09-29
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#2985](https://github.com/kompiro/karasu/issues/2985)
  - 修正 PR: [#2986](https://github.com/kompiro/karasu/pull/2986)
  - 発見の経緯（同日の Dependabot トリアージ）: [#2983](https://github.com/kompiro/karasu/pull/2983)
  - この `undici` override を導入した ADR: [ADR-1694](1694-dependabot-security-2026-06-19.md)
  - 同じ失敗型の先例: [ADR-2813](2813-dependabot-security-2026-09-12.md)（`js-yaml`）/ [ADR-2693](2693-dependabot-security-2026-09-03.md) / [ADR-2564](2564-dependabot-security-2026-08-18.md) / [ADR-2404](2404-dependabot-security-2026-08-08.md) / [ADR-2390](2390-dependabot-security-2026-08-07.md)
  - override の置き場: [ADR-2401](2401-pnpm-11-migration.md)、キーのスコープと caret 運用: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

2026-09-28 の weekly Dependabot バッチをトリアージしている途中で、open の security alert を 1 件見つけた。
transitive なので security update PR は起票されていない。

| alert | package | severity | CVSS | advisory | 脆弱範囲 | patched | 当時の override | lock の解決 | 経路 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#75](https://github.com/kompiro/karasu/security/dependabot/75) | `undici` | medium (5.9) | `AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H` | GHSA-3wwx-pv8p-q78v / CVE-2026-85024 | `>= 7.28.0, < 7.29.1` | 7.29.1 | `undici: ^7.28.0` | **7.29.0**（1 edge）/ 7.29.1（2 edge） | `@vscode/vsce` → `cheerio` |

undici の WebSocket client は、permessage-deflate の展開サイズ上限を超えたあとに壊れた DEFLATE block を
受け取ると、内部の `InflateRaw` から `error` listener を外したまま `Z_DATA_ERROR` を発火し、Node.js の
プロセスごと落ちる。悪意ある WebSocket サーバーが接続 1 本で client を落とせる。可用性のみに効く
（`C:N/I:N`）。

**override は既にあり、その floor が advisory の脆弱範囲の内側にあった。**
`undici: ^7.28.0` は [ADR-1694](1694-dependabot-security-2026-06-19.md) が当時の patched 版として
置いたもので、今回の範囲 `>= 7.28.0` はちょうどその floor から始まる。
[ADR-2564](2564-dependabot-security-2026-08-18.md) が名指し、[ADR-2813](2813-dependabot-security-2026-09-12.md) が
「floor に patch 番号を書く運用の帰結」とした型の 6 例目である。

## 決定

**override の floor を修正版へ上げた。**

| alert | 変更 | lock の解決 |
| --- | --- | --- |
| #75 | `undici: ^7.28.0` → `^7.29.1` | `cheerio@1.2.0` の edge が 7.29.0 → **7.29.1** |

`undici` はどの manifest でも直接依存として宣言されていないので、同時に引き上げるべき宣言レンジは
存在しなかった。キーは無印のまま据え置いた。

修正 PR [#2986](https://github.com/kompiro/karasu/pull/2986) は CI（ExTester を含む）を通ってマージされ、alert #75 は
2026-09-29 13:16Z に `fixed` になった。

## 理由

### 無印キーのままでよい

lock に居る `undici` は 7.x だけである。`jsdom` は `undici ^8.10.2` を要求しているが、この無印 override が
7.x に寄せている（本 ADR 以前からの状態で、今回の変更では動かない）。advisory の範囲も 7.x に閉じているので、
スコープを付けても付けなくても解決は同じになる。キーの形を変えるのは本 alert の範囲外とした。

### 巻き込みは lock の依存エッジで確かめた

peer suffix を落として `owner -> dep -> resolved` を突き合わせた結果、動いたのは意図した 1 本だけだった:

```
BEFORE  cheerio@1.2.0   undici 7.29.0
AFTER   cheerio@1.2.0   undici 7.29.1
```

7.29.1 は変更前から lock に存在していた（`jsdom` / `unifont` 経由）ので、集合比較では
「`undici@7.29.0` が 1 件消えた」としか見えない形である（[ADR-2564](2564-dependabot-security-2026-08-18.md)）。
`grep -c "undici@7.29.0" pnpm-lock.yaml` は 0。

### CI が触らない経路を手で確かめた

動いた edge は `@vscode/vsce` → `cheerio` で、VSIX のパッケージングにしか使われない。default の
`build` / `test` はこの経路を通らないので、`pnpm --filter karasu-vscode run package` を手で回し、VSIX が
作れることを確認した。拡張の配布物には `undici` は入らない。`vsce` が WebSocket client を使う経路も無く、
実際の到達性は低い。それでも脆弱版を満たしうる解として残す理由は無い。

出荷される実行コードは変わらないので changeset は起こしていない（[ADR-2813](2813-dependabot-security-2026-09-12.md) と同じ扱い）。

## 却下した案

### lock だけ再解決して override は据え置く

`^7.28.0` は 7.29.1 を含むので、再解決だけでも当座は patched 版に上がる。実際、同日の jsdom PR
[#2976](https://github.com/kompiro/karasu/pull/2976) は再解決の副作用でこの edge を 7.29.1 に寄せていた。
だが 7.29.0 が満たしうる解として残り、グラフが動いたときに戻れてしまう
（[ADR-2693](2693-dependabot-security-2026-09-03.md)）。#2976 は jsdom の regression で保留になったので、
それを当てにする選択肢もそもそも無かった。

### alert を根拠つきで `dismiss` する

到達性は低いが、修正版が存在し、floor の引き上げだけで巻き込みゼロで解決できた。緩和策を選ぶ理由が無い。

## 残した観察

この alert は `security-alert-sweep`（gh-aw）ではなく、依存更新のトリアージ中に `dependabot/alerts` を
手で確認して見つかった。[#2690](https://github.com/kompiro/karasu/issues/2690)（sweep が alert を読めない）は
open のままで、ADR-2813 と同じく「突き合わせが人の実行回数に依存している」例がまた 1 件増えた。
