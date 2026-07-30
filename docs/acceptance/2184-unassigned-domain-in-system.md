# AT: system 直下の domain にも `unassigned-domain` を出す

- **日付**: 2026-07-30
- **関連 Issue**: [#2184](https://github.com/kompiro/karasu/issues/2184)（発見元: [#2165](https://github.com/kompiro/karasu/issues/2165) / [PR #2183](https://github.com/kompiro/karasu/pull/2183)）
- **関連 ADR**: [ADR-2184](../adr/2184-unassigned-domain-placement-parity.md)（本件の決定。設計は [PR #2194](https://github.com/kompiro/karasu/pull/2194) の Design Doc として起こし、本 ADR に集約）
- **関連 spec**: [`docs/spec/syntax.md`](../spec/syntax.md) §Nesting placement / [`docs/spec/diagnostics.md`](../spec/diagnostics.md) §Assignment & cohesion
- **前提 ADR**: [ADR-2165](../adr/2165-logical-containment-rules.md)（`canContain` が containment 規則の正典）、[ADR-681](../adr/681-top-level-service-rendering.md)（`(Unassigned)` 擬似 system）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze — warning に留める根拠）
- **関連 TPL**: [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)（本件で新設。チェックリストの「同じ意味の全綴りをテストに入れる」を AT-C で満たす）、[TPL-2165](../test-perspectives/TPL-2165-containment-rule-has-single-definition.md)、[TPL-1160](../test-perspectives/TPL-1160-top-level-orphans.md)
- **対象ファイル**:
  - `packages/core/src/resolver/warnings.ts`（`detectUnassignedDomains`）
  - `packages/core/src/resolver/warnings.test.ts`
  - `docs/spec/syntax.md` / `syntax.ja.md`、`docs/spec/diagnostics.md` / `.ja.md`

> スコープは **診断の走査範囲のみ**。`(Unassigned)` 擬似 system の適用範囲、
> `unassigned-*` family の他 kind、言語 v2.0 での error 化は対象外。

## 受け入れ条件

- [x] AT-A: `system EC { domain Ordering {} }` が `unassigned-domain` を 1 件出し、`domainId` / `label` / `loc` が宣言そのものを指す

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `unassigned-domain warning` › `warns for a domain declared directly inside a system (#2184)`

- [x] AT-B: トップレベル形は従来どおり警告する（回帰防止）

  > ✅ Automated — 同 describe › `warns for each top-level domain`

- [x] AT-C: 「service に未割り当て」を表す**全綴り**（トップレベル / `system` 直下）が同じ診断を出す

  > ✅ Automated — 同 describe › `warns for an unassigned domain written at %s`（`it.each` の 2 配置）

- [x] AT-D: `service` 直下の domain は、その service が `system` の中にあっても警告されない

  > ✅ Automated — 同 describe › `does not warn for domains nested inside services` / `does not warn for a domain inside a service that is itself inside a system`

- [x] AT-E: `canContain` 外の入れ子（`client { domain … }`）は `node-not-in-context` のみで、`unassigned-domain` と二重報告しない

  > ✅ Automated — 同 describe › `leaves a domain outside canContain to node-not-in-context, without double-reporting`

- [x] AT-F: 出荷している `examples/**/*.krs` に新しい警告が出ない（system 直下 domain は 0 件）

  > ✅ Automated — `packages/core/src/examples.test.ts` › `%s declares no domain directly inside a system`（全 shipped `.krs`）

- [ ] AT-G: app の警告パネルに `unassigned-domain` が warning として表示され、その domain は `(Unassigned)` 枠ではなく**元の system の中**に描かれたままである

  > 🖐 手動確認 — `pnpm dev` で `index.krs` に `system EC { domain Ordering { usecase PlaceOrder {} } }` を入力し、警告パネルの表示とキャンバス上の配置を確認する

- [ ] AT-H: VS Code 拡張の Problems パネルに同じ診断が Warning（Error ではない）として出る

  > 🖐 手動確認 — 拡張ホストで同じ `.krs` を開く

- [x] AT-I: 検出器の親 kind 集合が `canContain` から導出されており、`canContain` に domain の親が増えたら検知できる

  > ✅ Automated — 同 describe › `covers every parent canContain lets hold a domain`（`LOGICAL_CONTAINMENT` から算出した集合を assert。増えたら fail し、綴りケースの追加を促す）

- [x] AT-J: 2 つの綴りが混在するとき、警告はソース順に並ぶ（格納先の順ではない）

  > ✅ Automated — 同 describe › `reports in source order when the two spellings are mixed`

## 備考

診断（「service に割り当てられていない」）と描画（`(Unassigned)` 枠）は別の関心事として
切り分けた。AT-G が「警告は出るが枠には入らない」を明示的に確認するのはそのため —
両者を揃えると renderer に手が入り、既存の図の見た目が変わる（[ADR-2184](../adr/2184-unassigned-domain-placement-parity.md) 却下案 B）。

warning の追加は additive なので言語 v1.0 freeze（ADR-1314）に抵触しない。ただし今日
無言のファイルに新しく警告が出るため、`.changeset/` で `minor` として公開する。
