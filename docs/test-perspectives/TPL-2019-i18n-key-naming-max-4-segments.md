---
id: TPL-2019
title: "i18n key は <feature>.<sub-feature?>.<element>.<state> の最大 4 段命名規約に従う"
status: active
date: 2026-07-18
applicable_to:
  - "`packages/i18n/src/types.ts` の `Translations` 型に新しい key を追加するとき"
  - "既存の feature（`preview`, `chat`, `settings` など）配下に新しい UI サーフェス（ダイアログ・サブパネル・ツールバー内の機能グループ）を追加し、その専用文字列を i18n 化するとき"
  - "spec（`docs/spec/i18n.md`）の key naming 規約自体を変更するとき — その改訂が既存 273 key と drift しないことを確認する"
known_consumers:
  - types-ts
  - en-ts
  - ja-ts
discovered_from:
  - root_cause_file: "docs/spec/i18n.md"
  - issue: "#2019"
related_to:
  - TPL-1296
topic: app-ui
scope:
  packages:
    - i18n
---

# TPL-2019: i18n key は最大 4 段命名規約に従う

## 観点

`docs/spec/i18n.md` の key naming 規約は `<feature>.<sub-feature?>.<element>.<state>`
の dot-separated 形式（sub-feature は省略可、最大 4 段）を定める。この規約は
2026-07-18 の改訂（#2019 Point 6）で「最大 3 段」から「最大 4 段」へ緩和された —
`preview.share.dialog.*`（15 key）・`preview.export.*.*`（8 key）・
`chat.patch.apply.button` / `chat.patch.reject.button` など、feature 内に独立した
UI サーフェスが複数生まれるケースで sub-feature セグメントが一貫して使われていた
実態を追認したものである。

この規約が守られなくなる失敗モードは 2 方向ある:

1. **新規 key が段数上限を超える** — sub-feature の下にさらに孫階層を作り
   5 段以上の key を追加してしまう（例:
   `preview.share.advanced.privateUrl.hint` のような積み上げ）。
2. **sub-feature の乱用** — 1〜2 個の element.state しか持たない機能に対して
   不要な sub-feature を導入し、flat な `<feature>.<element>.<state>` で
   済むはずの key を無駄に長くする。

どちらも機械的に検出できる規約なので、放置すると spec の規定と実装が
再び drift し、今回と同じ「spec を実態に合わせて事後緩和する」サイクルを
繰り返すことになる。

## 想定される失敗モード

- 新機能の PR で `Translations` 型に 5 段以上の key（例:
  `preview.share.advanced.target.hint`）を追加し、レビューで見落とされる。
- sub-feature を安易に導入し、`chat.patch.apply.button` のような 1 セット
  だけの機能に `chat.action.apply.button` のような冗長な階層を作る。
- spec の key naming 規約を将来さらに改訂する際、既存 273 key（4 段以内）
  との整合を確認せずに規約だけ変えてしまい、spec と実装が再び乖離する。
- 4 段化の妥当性を確認せず、機械的な段数カウントだけで PR を通す
  （sub-feature 導入基準—「このまとまりで element.state が複数生まれるか」—
  の judgement を無視する）。

## チェックリスト

`Translations` 型（`packages/i18n/src/types.ts`）に新しい key を追加する
PR で確認する:

- [ ] key の dot-segment 数が 4 以下か（`<feature>.<sub-feature?>.<element>.<state>`）。
- [ ] sub-feature を導入するなら、そのまとまりだけで element.state キーが
      複数生まれるか（1〜2 個で済むなら flat な 3 段に収める）。
- [ ] sub-feature の下にさらに孫階層（5 段目）を作っていないか。
- [ ] `docs/spec/i18n.md` の key naming 規約と実際の命名が一致しているか
      （spec を読まずに直感で命名していないか）。

## 派生元 spec

- [`docs/spec/i18n.md`「key naming 規約」](../spec/i18n.md#key-naming-規約)
  （本 TPL が守らせる正典。2026-07-18 に 3→4 段へ改訂、#2019 Point 6）
