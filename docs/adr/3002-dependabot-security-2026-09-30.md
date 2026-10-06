---
id: ADR-3002
title: Dependabot security alert 2026-09-30（5 つの override floor がすべて新しい advisory の脆弱範囲の内側だったので、修正版へ上げた）
status: accepted
date: 2026-09-30
topic: build
scope:
  concerns: [security, dependencies]
related_to: [ADR-2985, ADR-2813, ADR-2693, ADR-2564, ADR-2404, ADR-2401, ADR-2115, ADR-2628]
assumptions:
  # 決定は patched な系列へ caret で floor を置くことであって、そのときの
  # patch 番号ではない（ADR-2628 / ADR-2813）。
  - "grep: pnpm-workspace.yaml :: brace-expansion@2: \\^2\\."
  - "grep: pnpm-workspace.yaml :: brace-expansion@5: \\^5\\."
  - "grep: pnpm-workspace.yaml :: dompurify: \\^3\\."
  - "grep: pnpm-workspace.yaml :: fast-uri: \\^3\\."
  - "grep: pnpm-workspace.yaml :: markdown-it: \\^14\\."
---

# ADR-3002: Dependabot security alert 2026-09-30（5 つの override floor がすべて新しい advisory の脆弱範囲の内側だったので、修正版へ上げた）

- **日付**: 2026-09-30
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#3002](https://github.com/kompiro/karasu/issues/3002)
  - 修正 PR: [#3003](https://github.com/kompiro/karasu/pull/3003)
  - 同じ失敗型の先例: [ADR-2985](2985-dependabot-security-2026-09-29.md)（`undici`）/ [ADR-2813](2813-dependabot-security-2026-09-12.md)（`js-yaml`）/ [ADR-2693](2693-dependabot-security-2026-09-03.md)（`fast-uri` / `qs`）/ [ADR-2564](2564-dependabot-security-2026-08-18.md)（`brace-expansion`）/ [ADR-2404](2404-dependabot-security-2026-08-08.md)（`dompurify`）
  - override の置き場: [ADR-2401](2401-pnpm-11-migration.md)、キーのスコープと caret 運用: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

`/hane:security-alert` で `open` と `auto_dismissed` の alert を収集したところ、9 件が残っていた。
すべて transitive なので security update PR は起票されていない。

| alert | state | package | severity | CVSS | advisory | 脆弱範囲 | patched | 当時の override | lock の解決 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#78](https://github.com/kompiro/karasu/security/dependabot/78) | open | `brace-expansion` 2.x | high | 7.5 (`A:H`) | GHSA-6j4f-fj2g-mc7p / CVE-2026-102276 | `>= 2.0.0, < 2.1.5` | 2.1.5 | `brace-expansion@2: ^2.1.4` | 2.1.4 |
| [#80](https://github.com/kompiro/karasu/security/dependabot/80) | open | `brace-expansion` 2.x | high | 7.5 (`A:H`) | GHSA-qhr7-859c-m2p7 / CVE-2026-102278 | `>= 2.0.0, < 2.1.6` | 2.1.6 | 同上 | 2.1.4 |
| [#82](https://github.com/kompiro/karasu/security/dependabot/82) | open | `brace-expansion` 2.x | medium | 5.3 (`A:L`) | GHSA-q2hr-2g5m-vwhr / CVE-2026-102277 | `>= 2.0.0, < 2.1.7` | 2.1.7 | 同上 | 2.1.4 |
| [#77](https://github.com/kompiro/karasu/security/dependabot/77) | **auto_dismissed** | `brace-expansion` 5.x | high | 7.5 | GHSA-6j4f-fj2g-mc7p | `>= 4.0.0, < 5.0.10` | 5.0.10 | `brace-expansion@5: ^5.0.9` | 5.0.9 |
| [#79](https://github.com/kompiro/karasu/security/dependabot/79) | **auto_dismissed** | `brace-expansion` 5.x | high | 7.5 | GHSA-qhr7-859c-m2p7 | `>= 4.0.0, < 5.0.11` | 5.0.11 | 同上 | 5.0.9 |
| [#81](https://github.com/kompiro/karasu/security/dependabot/81) | open | `brace-expansion` 5.x | medium | 5.3 | GHSA-q2hr-2g5m-vwhr | `>= 4.0.0, < 5.0.12` | 5.0.12 | 同上 | 5.0.9 |
| [#84](https://github.com/kompiro/karasu/security/dependabot/84) | open | `dompurify` | low | なし | GHSA-p98j-92pf-mc4p | `>= 3.4.13, <= 3.4.15` | 3.4.16 | `dompurify: ^3.4.13`（`packages/app` は `^3.4.15` を宣言） | 3.4.15 |
| [#83](https://github.com/kompiro/karasu/security/dependabot/83) | open | `fast-uri` | medium | 4.8 | GHSA-hrr3-gc8f-f4qj / CVE-2026-86472 | `>= 3.0.0, < 3.1.8` | 3.1.8 | `fast-uri: ^3.1.6` | 3.1.7 |
| [#76](https://github.com/kompiro/karasu/security/dependabot/76) | open | `markdown-it` | medium | なし | GHSA-253c-mchw-3w2r | `< 14.3.1` | 14.3.1 | `markdown-it: ^14.2.0` | 14.3.0 |

- `brace-expansion` の 3 件は、ネストした brace と `parseCommaParts` の無制限再帰（スタック枯渇）と、
  `{a},b}` の書き換えにかかる二次時間。いずれも可用性のみ。
- `dompurify` は `IN_PLACE` モードでノードを除去する `afterSanitize` hook を使うと、切り離された
  subtree の event handler が生きたまま残る DOM XSS。
- `fast-uri` は percent-encode された octet 経由で host の大文字小文字の正規化が一貫しない。
- `markdown-it` は `linkify: true` のときに二次時間の経路が 2 つあり、数百 KB の入力で event loop が
  数十秒止まる。

**5 つの override はすべて既にあり、どの floor も今回の脆弱範囲の内側にあった。**
floor に「その時点の patched 版」を書く運用の帰結として、[ADR-2813](2813-dependabot-security-2026-09-12.md)
以降毎回名指ししてきた型である。今回は 1 回のバッチに 5 キーが同時に出た。

#77 と #79 は development scope として `auto_dismissed` になっていたが、lock には脆弱な 5.0.9 が
残っていた。`state == "open"` だけを収集していれば 5.x 系の floor は据え置かれ、#81 だけを見て
`^5.0.12` に上げるか、見落とすかのどちらかになっていた。

## 決定

**5 つの override の floor を修正版へ上げた。** `dompurify` の直接依存の宣言も同じ commit で上げた。

| 変更 | lock の解決 |
| --- | --- |
| `brace-expansion@2: ^2.1.4` → `^2.1.7` | `minimatch@9.0.9` の edge が 2.1.4 → **2.1.7** |
| `brace-expansion@5: ^5.0.9` → `^5.0.12` | `minimatch@10.2.6` の edge が 5.0.9 → **5.0.12** |
| `dompurify: ^3.4.13` → `^3.4.16`、`packages/app` の宣言 `^3.4.15` → `^3.4.16` | app と `monaco-editor@0.56.0` の edge が 3.4.15 → **3.4.16** |
| `fast-uri: ^3.1.6` → `^3.1.8` | `ajv@8.20.0` の edge が 3.1.7 → **3.1.8** |
| `markdown-it: ^14.2.0` → `^14.3.1` | `@vscode/vsce@3.9.2` の edge が 14.3.0 → **14.3.2** |

patched 版はどれも `minimumReleaseAge`（1 日、[ADR-2401](2401-pnpm-11-migration.md)）より古い。

## 理由

### `brace-expansion` はメジャー別のキーを据え置いた

lock には 1.x / 2.x / 5.x が共存している。advisory の範囲は 2.x と 4.x〜5.x で、1.x は含まない。
[ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) のとおり、スコープ付きのキーで
該当メジャーの floor だけを上げ、`brace-expansion@1` は触らなかった。

### `dompurify` は宣言も同時に上げた

override が効いている限り実解決は同じだが、`packages/app` の `^3.4.15` を据え置くと、override を
外した瞬間に脆弱な 3.4.15 を満たしうる宣言が残る。override は宣言の正しさの代わりにはしない
（[ADR-2404](2404-dependabot-security-2026-08-08.md)）。

自前の 3 か所の呼び出し（`NodeDetailPanel` / `EdgeDetailPanel` / `ChatPane`）はどれも既定設定の
`DOMPurify.sanitize(raw)` で、`IN_PLACE` も hook も使っていないので、脆弱な形ではない。
`monaco-editor` も同じ `dompurify` に解決しており、こちらの使い方は安く監査できないので、
到達性の評価ではなく修正版への引き上げで閉じた。

### 巻き込みは lock の依存エッジで確かめた

peer suffix を落とした `owner dep version` の diff で、意図した edge 以外に動いたのは次の 2 つだった:

```
@asamuzakjp/css-color / @asamuzakjp/dom-selector / jsdom@30.0.1   lru-cache 11.5.2 → 11.5.3
@vitest/coverage-v8@5.0.1                                         magicast  0.5.4  → 0.5.5
```

どちらもテスト用の開発依存で、ビルド出力には入らない。`pnpm build` / `pnpm test` は通った。
対象の脆弱版（`dompurify@3.4.15` / `fast-uri@3.1.7` / `brace-expansion@2.1.4` / `brace-expansion@5.0.9` /
`markdown-it@14.3.0`）について `grep -c` はすべて 0。

### CI が触らない経路を手で確かめた

`markdown-it` の消費者は `@vscode/vsce` だけで、VSIX のパッケージングにしか使われない。default の
`build` / `test` はこの経路を通らないので、`pnpm --filter karasu-vscode run package` を手で回し、VSIX が
作れることを確認した。

出荷される実行コードの変更は `dompurify` の patch 1 つで、版管理対象パッケージの利用者から見える
挙動は変わらないため、changeset は起こしていない（[ADR-2813](2813-dependabot-security-2026-09-12.md) /
[ADR-2985](2985-dependabot-security-2026-09-29.md) と同じ扱い）。

## 却下した案

### lock だけ再解決して override は据え置く

5 キーとも既存の caret が修正版を含むので、再解決だけでも当座は patched 版に上がる。だが脆弱版が
満たしうる解として残り、グラフが動いたときに戻れてしまう（[ADR-2693](2693-dependabot-security-2026-09-03.md)）。

### `auto_dismissed` の #77 / #79 はそのままにする

development scope であることは優先度の判断にはなるが、脆弱版が lock に残っている事実は変わらない。
同じ floor の引き上げ（`^5.0.12`）で #81 と一緒に閉じるので、分ける理由が無い。

### 到達性が低いものを根拠つきで `dismiss` する

`markdown-it`（`vsce` のパッケージング時のみ）や `brace-expansion`（ビルドツール内の glob）は到達性が
低い。それでも修正版が存在し、floor の引き上げだけでビルド出力に影響する巻き込み無しに解決できた。
緩和策を選ぶ理由が無い。
