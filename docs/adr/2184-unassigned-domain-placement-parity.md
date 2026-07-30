---
id: ADR-2184
title: 同じモデリング状態を表す配置には同じ診断を出す — `system` 直下の domain にも `unassigned-domain` を発行する
status: accepted
date: 2026-07-30
topic: resolver
depends_on:
  - ADR-2165
  - ADR-1314
related_to:
  - ADR-681
  - ADR-702
  - ADR-1567
  - ADR-1639
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/resolver/warnings.ts :: detectUnassignedDomains"
  - "symbol: packages/core/src/resolver/warnings.ts :: UNASSIGNING_DOMAIN_PARENTS"
  - "symbol: packages/core/src/builtins/reference-data.ts :: LOGICAL_CONTAINMENT"
  - "file: packages/core/src/view/unassigned-system.ts"
  - "grep: docs/spec/syntax.md :: Nesting placement"
---

# ADR-2184: 同じモデリング状態を表す配置には同じ診断を出す — `system` 直下の domain にも `unassigned-domain` を発行する

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2184](https://github.com/kompiro/karasu/issues/2184)
  - 発見元: [#2165](https://github.com/kompiro/karasu/issues/2165) / [PR #2183](https://github.com/kompiro/karasu/pull/2183)（`domain` を system 直下に書ける配置として文書化した際に表面化）
  - Design Doc: `docs/design/unassigned-domain-placement-parity.md`（[PR #2194](https://github.com/kompiro/karasu/pull/2194)。本 ADR に集約して削除）
  - 実装 PR: [#2210](https://github.com/kompiro/karasu/pull/2210)
  - 前提 ADR: [ADR-2165](2165-logical-containment-rules.md)（`canContain` が containment 規則の正典）、[ADR-1314](1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）
  - 関連 ADR: [ADR-681](681-top-level-service-rendering.md) / [ADR-702](702-top-level-infra-rendering.md)（`(Unassigned)` 擬似 system）、[ADR-1567](1567-rule-diagnostic-separation-and-catalog.md)（規則 ↔ 診断）、[ADR-1639](1639-user-system-scoped.md)（top-level 配置規則）
  - TPL: [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)（#2194 で新設）、[TPL-2165](../test-perspectives/TPL-2165-containment-rule-has-single-definition.md)
  - AT: `docs/acceptance/2184-unassigned-domain-in-system.md`
  - コード: `packages/core/src/resolver/warnings.ts`

## 背景

ADR-2165 で `domain` の配置は 3 通りに整理された。うち**ファイル直下**と **`system` 直下**は、
どちらも「まだ service に割り当てられていない domain」という同じモデリング状態を表す
（ADR-2165 の決定文がそう述べている）。

ところが `unassigned-domain` はファイル直下にしか出なかった。`detectUnassignedDomains` が
`file.domains` だけを走査していたためで、`system EC { domain Ordering {} }` は無言だった。
著者が選んでいるのは**綴り**であって**意味**ではないのに、綴りで診断の有無が変わる。

さらに、同じ規則について 3 つの記述が食い違っていた:

| どこ | 何と言っていたか |
| --- | --- |
| 実装（`detectUnassignedDomains`） | `file.domains` のみ = ファイル直下だけ |
| warning 文言（`warning.unassignedDomain.message`） | `Domain "X" is not assigned to any service` = 親 kind の話 |
| `docs/spec/diagnostics.md` | `A domain sits at top level with no team assignment.` = ファイル直下 **かつ** team の話 |

warning 文言は「service に割り当てられていない」と言っており、これは system 直下の domain にも
そのまま当てはまる。カタログの `team assignment` は、この診断が team と無関係である以上、誤り。

ADR-2165 はこの非対称を spec に明記したうえで #2184 に分離した（「今回は決めない」）。

## 決定

**`unassigned-domain` は「親が `service` でない domain」に対して発行する。対象は
`canContain` が `domain` の親として認める配置とファイル直下で、`system` 直下も含む。
`(Unassigned)` 擬似 system の適用範囲は変えない（トップレベル形のみ）。**

個別の判断:

- **診断は綴りで分けない**。ファイル直下と `system` 直下は同じ意味なので同じ警告を出す。
  そうしないと、ユーザーは意味を変えずにノードを移動するだけで警告を消せてしまい、診断が
  設計上の指摘ではなく「書き方の癖への注意」に成り下がる。
- **描画は揃えない**。`synthesizeUnassignedSystem()`（ADR-681 / ADR-702）は「描画先の
  container を持たないノードに枠を与える」機構であって「未割り当ての標識」ではない。
  system 直下の domain には既に描画先がある。**診断と framing は別の関心事**であり、
  片方だけ対称になるのが正しい。
- **走査範囲は `canContain` から導出する**。`UNASSIGNING_DOMAIN_PARENTS` を
  `LOGICAL_CONTAINMENT` から算出する（`domain` を子に持てる kind から `service` を除く）。
  `system` を直書きすると、将来 `canContain` に domain の親が増えたとき検出器だけが
  取り残される（TPL-2184 が挙げる失敗モードそのもの）。
- **`canContain` 外の入れ子は二重報告しない**。`client { domain … }` は既に
  `node-not-in-context` が出るので、`unassigned-domain` は重ねない。
- **warning のままとし error 化しない**。言語 v1.0 は freeze 済み（ADR-1314）。追加は
  additive で、今日パースが通るファイルは通り続ける。

## 理由

- **文言と実装が一致する**。`Domain "X" is not assigned to any service` は両方の綴りで真。
  逆に非対称を維持する案では、この文（karasu が伝えたい設計上の指摘そのもの）を
  「top-level にある」という配置の説明に弱める必要が出る。診断の意味を実装の走査範囲に
  合わせて縮めるのは順序が逆で、実装を意味に合わせる方が筋が通る。
- **`unassigned-*` family の意味が揃う**。`unassigned-usecase` は既に「service 直下の
  usecase」を、その service がどこにあっても警告している。この family が意味するのは
  「ファイル直下にある」ではなく「**あるべき親 kind の下にいない**」であり、`domain` だけが
  その読みから外れていた。
- **freeze に抵触しない**。warning は additive。出荷している `examples/**/*.krs` に
  system 直下 domain は 0 件で、`examples.test.ts` の fence がその状態を維持する。
- **規則の定義が 1 つになる**（TPL-2165）。走査範囲を `canContain` から導出したので、
  配置規則の追加は `canContain` の編集だけで parser・診断の双方に効く。

## 却下した案

### 案 A: 非対称を仕様として確定させる（文言整理のみ）

`unassigned-domain` はファイル直下専用と spec に書き切り、#2184 を「意図どおり」で閉じる。
実装変更ゼロだが、warning 文言を「top-level にある」に弱める必要が生じ、本来伝えたい
「service に割り当てられていない」という指摘が言語から消える。同じモデリング状態が綴り
次第で診断されない状態も残る。

### 案 B: 警告 + `(Unassigned)` サブフレームで完全パリティ

system 直下の domain も system 内の `(Unassigned)` サブフレームに包んで描画する。診断と
描画が完全に揃う一方、renderer に手が入り既存の図の見た目が変わる。`(Unassigned)` は
「描画先の無い orphan に枠を与える」機構であり、描画先があるノードに適用するのは ADR-681 の
設計意図から外れる。「service に入れるほどでもない domain を system 直下にざっと置く」という
下書き用途（ADR-2165 が正当と認めた使い方）も、余分な枠で読みにくくなる。

### 案 C: warning params に `placement` を足す

`placement: "top-level" | "system"` を持たせ、UI 側で文言や quick-fix を出し分ける。現時点で
出し分ける consumer が無く、params は warning の公開 API なので使い道が決まる前に増やすと
外せない。必要になった時点で additive に足せる。

## 実装への影響

1. **更新** `packages/core/src/resolver/warnings.ts` — `UNASSIGNING_DOMAIN_PARENTS` を
   `LOGICAL_CONTAINMENT` から導出し、`detectUnassignedDomains` がその親 kind の直下 domain と
   `file.domains` を対象にする。警告は source offset 順に整列する（2 つの綴りが混在するとき
   格納先の順で並ばないように）。
2. **更新** `docs/spec/syntax.md` / `syntax.ja.md` §Nesting placement — 決定した規則と、
   診断と framing を分ける理由を記述。
3. **更新** `docs/spec/diagnostics.md` / `.ja.md` — `unassigned-domain` 行の
   `team assignment` 誤りを訂正し、2 配置で発火することを明記。
4. **テスト** `warnings.test.ts` — 両綴りの table-driven ケース、二重報告なし、
   `canContain` 由来の親集合ガード、source 順。`examples.test.ts` に出荷資産 fence。
5. **AT** `docs/acceptance/2184-unassigned-domain-in-system.md`。

## 備考

言語 v2.0 で `system` 直下 `domain` を error にするかは決めない。ADR-2165 が `canContain` に
載せた正当な配置であり、本 ADR は「正当だが未割り当て」という読みを前提にしている。
`unassigned-*` family の他 kind（service / infra）は走査範囲が現状で正しく、将来
`canContain` に配置が足されたときの再発は TPL-2184 が受ける。
