# AT-1884: Group by team — multi-system root view でも grouping を適用する

- **日付**: 2026-07-13
- **Issue**: #1884（follow-up of #1858 / ADR-20260711-03）
- **PR**: (この PR)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（Group by: team P2a）
- **設計**: [ADR-20260716-02](../adr/20260716-02-group-by-team-multi-system-root-per-system-frames.md)
- **Related TPLs**:
  - [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列関数ファミリは parameter parity を保つ — 本 bug の直接の失敗クラス）
  - [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（全域性・端点保持）
- **対象**: `packages/core/src/renderer/layout.ts`（`layout` multi-system 分岐 + `layoutMultipleSystems`）

## 概要

`groupBy: "team"`（と `collapsedGroups`）は **multi-system root view** で黙って無視されていた。
`layout()` の multi-system 分岐が `layoutMultipleSystems` を呼ぶとき grouping 系オプションを渡して
おらず、grouping 機構は単一 system に focus したときの分岐にしか無かった。system が 2 つ以上あると
（= cross-system ghost エッジが存在する状況と一致する）root view は team 境界フレームも per-team
collapse も描かなくなり、利用者からは「ghost エッジがあると group-by-team が壊れる」ように見えていた。

本 AT は、**各 system フレームの内側**に P2a grouping を適用する修正（per-(system, team) フレーム）を
fence する。team が複数 system をまたいで `owns` する場合、各 system に 1 つずつフレームが描かれる
（cross-system をまたぐ 1 枚のフレームは scope 外 — `docs/design/system-view-grouping.md`）。

## 受け入れ条件

### AC-1: root view（≥2 system）で team フレームが描かれる

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "draws the team frames at the root (was 0 frames before the fix)"

- [x] Issue の repro（Shop + PaymentGateway、cross-system charge エッジ）で `groupBy: "team"` を渡すと
      `__group_payments__` / `__group_catalog__` のフレームが描かれ、`data-group="true"` が 2 個
- [x] どの team も所有しないノード（`PaymentService`）にはフレームが描かれない

### AC-2: 全ノードちょうど一度配置（TPL-20260624-02: totality）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "still lays every node out exactly once"

- [x] `Billing` / `Wallet` / `Search` / `PaymentService` がそれぞれちょうど 1 回描かれる（drop / 重複なし）

### AC-3: group-by off の root 出力は byte-identical（回帰なし）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "leaves the root ungrouped output byte-identical when group-by is off"; plus 全 core snapshot suite

- [x] `groupBy` 未指定・`undefined` の root 出力は従来どおり byte-identical（grouped パスは opt-in まで inert）

### AC-4: root view で team を畳むと stub に折り畳まれる

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "collapses a team to a stub at the root, folding its members"

- [x] `collapsedGroups: {payments}` で payments の members（Billing/Wallet）が `__group_collapsed_payments__`
      stub 1 個に畳まれ `payments (2)` を表示、catalog は展開・フレーム維持

### AC-5: system をまたぐ team は system ごとに 1 フレーム

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "frames a team that owns members in two systems once per system"

- [x] `payments` が Shop.Billing と PaymentGateway.PaymentService を `owns` するとき、payments フレームが
      各 system フレーム内に 1 つずつ（計 2 つ、同一ラベル・disjoint）描かれ、両ノードはそれぞれ 1 回配置

### AC-6: collapse した team の cross-system edge は stub に再アンカーされる（drop しない）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "re-anchors a cross-system edge from a collapsed team onto its stub"

- [x] cross-system edge の端点が collapse で stub に畳まれても、edge は drop されず stub に再アンカー
      されて描かれる（`data-edge-from="__group_collapsed_<team>__"` → cross-system target）— TPL-20260624-02
- [x] 非 collapse では従来どおり（`crossSystemRemap` 空 → byte-identical、authored parallel edge も温存）

### AC-7: system をまたぐ team を collapse すると system ごとに独立した stub を保つ

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — "keeps a distinct stub per system when a spanning team is collapsed"

- [x] 複数 system に owns が跨る team を collapse すると、各 system に 1 つずつ stub が描かれ
      （stub id は生成時点で `__group_collapsed_<sys>_<team>__` と system scope 化）、上書きで消えない（全域性）

### AC-8: 手動（描画の目視確認）

- [ ] **手動**: app で 2 つ以上の `system` と `organization`/`owns` を持つモデル（cross-system エッジあり）
      を開き、system view の Group by を Team に切替。root view で各 system フレームの内側に team 境界
      フレームが現れ、⊖ でチームを畳める。None に戻すと従来の side-by-side 表示に戻る。
