---
id: TPL-20260615-02
title: "診断の不在を assert するテストは severity でスコープする（info register は open set）"
status: active
date: 2026-06-15
applicable_to:
  - "「パースがクリーン / 警告が出ない」ことを assert する UI / E2E / unit テスト"
  - "WarningPanel など複数 severity を同一 class / 同一リストでレンダリングする UI に対する assertion"
  - "resolver diagnostic を件数 (count) で検証するテスト（toHaveCount(0) / length === 0 など）"
known_consumers:
  - playwright-tests
  - warning-panel
related_to:
  - TPL-20260514-08
  - TPL-20260510-13
discovered_from:
  - issue: "#1608"
  - root_cause_file: "packages/e2e/tests/at-0047-infra-nodes-system-diagram.spec.ts:66"
topic: testing
scope:
  packages:
    - app
    - e2e
    - core
---

# TPL-20260615-02: 診断の不在を assert するテストは severity でスコープする（info register は open set）

## 観点

テストで「このモデルには問題がない」ことを確認したいとき、検証対象は
**自分が気にしている severity の診断だけ**にスコープする。karasu の `info`
register は **将来追加されうる open set**（スタイル流派の事実を載せる場所 —
[[TPL-20260514-08]]）であり、「すべての診断 = 0」を assert すると、無関係な
新 info 診断が一つ増えただけでテストが落ちる。

UI 側では `WarningPanel` が `warning` と `info` の両 severity を同じ
`.warning-item` class でレンダリングする（`.warning-item--warning` /
`.warning-item--info` で区別）。したがって `.warning-item` 件数で
「警告ゼロ」を表現すると info も巻き込む。"parse regression" を検出したいなら
`.warning-item--warning` に絞る。core / unit 側で診断配列を数えるときも
`warnings.filter(w => warningSeverity(w.kind) === "warning")` のように
severity で絞ってから件数を見る。

fixture の .krs が**意図せず** info 診断を誘発する場合（例: 2 サービスが同一
store を共有して `shared-infra-fan-in` を出す）も、fixture を書き換えて回避する
のではなく、assertion を severity でスコープする方が堅牢 — fixture の現実味
（クロスサービス edge など）を保ったまま、将来の info 診断追加に対しても壊れない。

## 想定される失敗モード

- 新しい `info` 診断を core に追加した PR は緑なのに、**別ファイルの無関係な
  E2E / AT** が次回の nightly で初めて落ちる（#1608: `shared-infra-fan-in` 追加 →
  AT-0047 の `toHaveCount(0)` 破綻）。発見が遅れ、原因 PR から時間が空いて
  切り分けコストが上がる。
- 「診断ゼロ」assertion が事実上「新しい info 診断を一切追加するな」という
  暗黙の制約として働き、本来 register 的に正しい info 診断の追加が阻害される。
- 逆に severity を見ずに件数だけ緩めると、本物の `warning` 退行を見逃す。

## チェックリスト

診断の不在 / 件数を検証するテストを書く・直すときに確認する:

- [ ] 検証したいのは `warning`（退行）か、`info` も含む全件か、明示しているか
- [ ] UI なら `.warning-item--warning`、core なら `warningSeverity()` で severity を絞っているか
- [ ] fixture の .krs が意図せず info 診断（`shared-infra-fan-in` / `domain-dispersal` 等）を誘発していないか確認し、誘発する場合でも assertion 側でスコープしているか
- [ ] 新しい `info` 診断を core に追加する PR では、`.warning-item` を全件数える既存テストがないか grep して確認したか

## 既知の対処パターン

- E2E: `expect(panel.locator(".warning-item--warning")).toHaveCount(0)`
  （`.warning-item` 全件ではなく severity 修飾子で絞る）。AT-0047 で採用。
- core / unit: `result.warnings.filter(w => warningSeverity(w.kind) === "warning")`
  を数える。

## 関連テスト

- `packages/e2e/tests/at-0047-infra-nodes-system-diagram.spec.ts`
- `packages/app/src/components/WarningPanel.test.tsx`（severity 別 class の検証）
