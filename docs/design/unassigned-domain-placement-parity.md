# 同じモデリング状態を表す配置スペルに同じ診断を出す（system 直下の `domain` と `unassigned-domain`）

- **日付**: 2026-07-30
- **ステータス**: 検討中（[PR #2194](https://github.com/kompiro/karasu/pull/2194)）
- **関連**:
  - 引き金 Issue: [#2184](https://github.com/kompiro/karasu/issues/2184)（`unassigned-domain` が system 直下の domain に出ない）
  - 発見元: [#2165](https://github.com/kompiro/karasu/issues/2165) / [PR #2183](https://github.com/kompiro/karasu/pull/2183)（`domain` を system 直下に書ける配置として文書化した際、この非対称が表面化した）
  - 関連 ADR: [ADR-2165](../adr/2165-logical-containment-rules.md)（`canContain` が containment 規則の正典）、[ADR-681](../adr/681-top-level-service-rendering.md) / [ADR-702](../adr/702-top-level-infra-rendering.md)（`(Unassigned)` 擬似 system）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）、[ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（規則 ↔ 診断の対応）
  - 関連 TPL: [TPL-20260510-01](../test-perspectives/TPL-20260510-01-top-level-orphans.md)、[TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)、[TPL-20260730-02](../test-perspectives/TPL-20260730-02-containment-rule-has-single-definition.md)、[TPL-20260730-03](../test-perspectives/TPL-20260730-03-equivalent-placements-share-one-diagnostic.md)（本 PR で新設）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectUnassignedDomains`）
  - spec: `docs/spec/syntax.md` §Nesting placement、`docs/spec/diagnostics.md` §Assignment & cohesion

## 背景・課題

ADR-2165（PR #2183）で `domain` の配置は 3 通りに整理された。うち **ファイル直下**と
**`system` 直下**の 2 つは、どちらも「まだ service に割り当てられていない domain」という
**同じモデリング状態**を表す。ADR-2165 の決定文にもそう書いてある。

ところが診断は片方にしか出ない。

```ts
import { compile } from "@karasu-tools/core";

compile(`domain Ordering { usecase PlaceOrder {} }`);
// → warnings: [{ kind: "unassigned-domain", ... }]

compile(`system EC {
  domain Ordering { usecase PlaceOrder {} }
}`);
// → warnings: []   ← 同じ意味なのに無言
```

著者が選んだのは**綴り**であって**意味**ではないのに、綴りで診断の有無が変わる。
ADR-2165 はこの非対称を spec に明記したうえで本 Issue に分離した（「今回は決めない」）。
本 Design Doc はその持ち越し分を決める。

もう 1 つ、同じ規則について **3 つの記述が食い違っている**ことも今回の対象に含める:

| どこ | 何と言っているか |
| --- | --- |
| 実装（`detectUnassignedDomains`） | `file.domains` のみ = ファイル直下だけ |
| warning 文言（`warning.unassignedDomain.message`） | `Domain "X" is not assigned to any service` = 親 kind の話 |
| `docs/spec/diagnostics.md` | `A domain sits at top level with no team assignment.` = ファイル直下 **かつ** team の話 |

warning 文言は「service に割り当てられていない」と言っており、これは system 直下の
domain にもそのまま当てはまる。diagnostics カタログの `team assignment` は、この診断が
team とは無関係である以上、単純に誤り。

## 現状（インベントリ）

### `domain` の 3 配置

| 配置 | AST 上の格納先 | `unassigned-domain` | `(Unassigned)` 擬似 system | `node-not-in-context` |
| --- | --- | --- | --- | --- |
| ファイル直下 | `file.domains` | 出る | 包まれる | — |
| `system` 直下 | `system.children` | **出ない** | 包まれない（実 system 内に描画） | 出ない（`canContain` に載っている） |
| `service` 直下 | `service.children` | 出ない（正しく割り当て済み） | — | — |

`REFERENCE_DATA.nodeKinds` で `domain` を子に持てるのは `system` と `service` の 2 つだけ
（ADR-2165 で `canContain` が正典になった）。したがって「service 直下ではない domain」は
上の表の上 2 行に尽きる。それ以外の入れ子（`client { domain … }` など）は `canContain` に
無いので `node-not-in-context` warning が既に出ている。

### `unassigned-*` family の実装

| 検出器 | 走査範囲 | それが正しい理由 |
| --- | --- | --- |
| `detectUnassignedService` / `Database` / `Queue` / `Storage` / `Client` | top-level のみ | これらの kind は `system` 直下が**正当な home**。system 内にあるのは未割り当てではない |
| `detectUnassignedUsecases` | `system` 内の service も `file.services` も走査 | 「親が domain でない usecase」を、その service がどこにあっても警告する |
| `detectUnassignedDomains` | **top-level のみ** | ← `domain` の home は `service` であって `system` ではない。ここだけ family の意味とズレている |

`unassigned-usecase` は既に「top-level 限定ではない」先例になっている。この family が
意味しているのは「ファイル直下にある」ではなく「**あるべき親 kind の下にいない**」であり、
`domain` だけがその読みから外れている。

### `(Unassigned)` 擬似 system の役割

`synthesizeUnassignedSystem()`（ADR-681 / ADR-702）は「描画先の container を持たない
orphan に枠を与える」機構であって、「未割り当てであることを示す」機構ではない。
system 直下の domain には既に実 system という描画先があるので、この機構の適用対象外
である。つまり **warning と `(Unassigned)` framing は別の関心事**であり、片方を揃えたから
といってもう片方も揃える必然性はない。

### 出荷資産への影響

`examples/**/*.krs` を走査したところ、`system` 直下に `domain` を書いているファイルは
**0 件**。警告を広げても shipped サンプルは 1 件も新たに警告しない。

## 制約・前提

- **言語 v1.0 は freeze 済み**（ADR-1314）。warning の追加は additive で、今日パースが
  通るファイルは通り続ける。error 化は選択肢に入れない
- **`(Unassigned)` 擬似 system の適用範囲は変えない**。これを system 直下にも広げると
  既存の図の見た目が変わる（後方互換の観点でコストが跳ね上がる）
- **`canContain` が containment 規則の正典**（ADR-2165 / TPL-20260730-02）。診断側が
  独自の配置リストを持つなら、それは `canContain` と同期していなければならない
- **既存ファイルに新しく warning が出る**。エラーではないが利用者から見える変化なので、
  spec とカタログの文言を同時に直し、changeset に載せる
- out of scope: `unassigned-service` / infra 系検出器の走査範囲の見直し（現状で正しい）、
  言語 v2.0 での error 化、`system` 直下 `domain` という配置自体の是非

## 検討した選択肢

### 案1: 非対称を仕様として確定させる（文言整理のみ）

`unassigned-domain` はファイル直下専用の診断であると spec に書き切り、#2184 を
「意図どおり」で閉じる。`diagnostics.md` の `team assignment` 誤りだけ直す。

**メリット**

- 実装変更ゼロ。既存ファイルに新しい warning が出ない
- 「`(Unassigned)` 枠に入る」という描画上の驚きを予告する診断、という読みでは筋が通る

**デメリット**

- warning 文言（`is not assigned to any service`）と規則が食い違ったままになるので、
  文言も「top-level にある」に書き換える必要がある。すると「service に割り当てられて
  いない」という本来伝えたい設計上の指摘が言語から消える
- 同じモデリング状態が綴り次第で診断されない状態が残る。ユーザーは診断を消すために
  `system` の中へ移動するという、意味を変えない回避ができてしまう
- `unassigned-usecase` の先例と family の意味が割れる

### 案2: 警告を `system` 直下にも広げる（描画は据え置き）— 採用

`detectUnassignedDomains` が `file.domains` に加えて各 `system.children` の直下 `domain`
も対象にする。`(Unassigned)` 擬似 system の適用範囲は変えない。

**メリット**

- warning 文言が実装と一致する（`is not assigned to any service` は両方の綴りで真）
- 綴りではなく意味で診断される。ADR-2165 が「同じことを表す」と決めた 2 配置が、
  下流でも同じ扱いになる
- `unassigned-usecase` と family の意味が揃う（= 親 kind が違う、の意）
- additive で v1.0 freeze に抵触しない。examples への影響 0 件

**デメリット**

- 今日無言のファイルに warning が出る。ユーザーから見える変化である
- 「warning は出るが `(Unassigned)` 枠には入らない」という、診断と描画が一致しない
  状態を仕様として説明する必要がある（下の「実装の指針」で spec に明記する）

### 案3: 警告 + `(Unassigned)` サブフレームで完全パリティ

案2 に加え、system 直下の domain を system 内の `(Unassigned)` サブフレームに包んで描画する。

**メリット**

- 診断と描画が完全に揃う。ユーザーから見て 2 配置の区別が消える

**デメリット**

- renderer に手が入り、既存の図の見た目が変わる。後方互換のコストが最大
- `(Unassigned)` 擬似 system は「描画先の無い orphan に枠を与える」機構であり、
  描画先がある node に適用するのは ADR-681 の設計意図から外れる
- 「service に入れるほどでもない domain を system 直下にざっと置く」という
  下書き用途（ADR-2165 が正当と認めた使い方）が、余分な枠で読みにくくなる

### 案4: 案2 + warning params に `placement` を足す

`unassigned-domain` の params に `placement: "top-level" | "system"` を持たせ、UI 側で
文言や quick-fix を出し分けられるようにする。

**メリット**

- 将来 quick-fix（「この domain を service に入れる」）を配置ごとに変えられる

**デメリット**

- 現時点で出し分ける consumer が無い。params は warning の公開 API なので、使い道が
  決まる前に増やすと外せなくなる
- 出し分けが必要になった時点で追加すれば additive で済む（今決める必要がない）

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 実装変更量 | 文言のみ | `detectUnassignedDomains` 1 関数 | + renderer | 案2 + 型 |
| 既存ファイルへの影響 | なし | 新規 warning（examples は 0 件） | 新規 warning + 見た目変化 | 案2 と同じ |
| warning 文言との整合 | 文言を弱める必要あり | 一致する | 一致する | 一致する |
| `unassigned-*` family の一貫性 | 割れたまま | 揃う | 揃う | 揃う |
| ADR-681 の設計意図との整合 | 整合 | 整合（framing は据え置き） | 逸脱 | 整合 |
| v1.0 freeze | 抵触しない | 抵触しない | 抵触しない | 抵触しない |

## Related TPLs

- [TPL-20260730-02](../test-perspectives/TPL-20260730-02-containment-rule-has-single-definition.md) —
  containment 規則の定義は `canContain` 1 箇所。本件の診断側の配置リストも、そこから
  読める事実（`domain` の親は `system` / `service` のみ）に基づいて決める
- [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md) —
  検証側が列挙した集合から spec の許す kind が漏れる失敗モード。本件は「kind の漏れ」
  ではなく「**配置の漏れ**」で、形は同じだが対象軸が違う
- [TPL-20260510-01](../test-perspectives/TPL-20260510-01-top-level-orphans.md) —
  top-level orphan を全消費側で扱う。本件はその裏返しで、「orphan **ではない**が
  同義の綴り」が診断から漏れているケース
- [TPL-20260730-03](../test-perspectives/TPL-20260730-03-equivalent-placements-share-one-diagnostic.md)
  （本 PR で新設・proactive）— 同じモデリング状態を表す複数の配置は同じ診断を出す。
  3-Yes 判定: 横展開しうる（全 `unassigned-*` 検出器と将来の配置追加）／構造的に再発
  しうる（`canContain` に配置を足しても検出器は自動追従しない）／既存 TPL 未掲載
  （上 3 件はいずれも別の軸）

## 現時点の方針

**案2 を採用する。**

決め手は、warning が既に「`Domain "X" is not assigned to any service`」と言っていること。
これは system 直下の domain について**そのまま真**であり、案1 を採ると、この文（＝
karasu が伝えたい設計上の指摘そのもの）を「top-level にある」という配置の説明に
弱める必要が出てくる。診断の意味を実装の走査範囲に合わせて縮めるのは順序が逆で、
実装を意味に合わせる方が筋が通る。

`(Unassigned)` の framing を広げない（案3 を採らない）のは、あれが「未割り当てを示す
標識」ではなく「描画先の無い node に container を与える」機構だから。診断と描画で
関心事が違う以上、片方だけ揃えるのは非対称ではなく**正しい分離**であり、その旨を
spec に書く。

### 実装の指針

規則を一文で: **`domain` は親が `service` でないとき `unassigned-domain` を出す。
対象は `canContain` が `domain` の親として認める 2 つの配置（ファイル直下・`system`
直下）に限る。** `client { domain … }` のような `canContain` 外の入れ子は既に
`node-not-in-context` が出ているので、二重に報告しない。

1. `packages/core/src/resolver/warnings.ts` — `detectUnassignedDomains` が
   `file.domains` に加えて `system.children` の直下 `domain` を走査する
2. `packages/core/src/resolver/warnings.test.ts` — ケース追加（下の AT に対応）
3. `docs/spec/syntax.md` / `syntax.ja.md` §Nesting placement / §入れ子の配置 —
   「まだ同一に扱われていない（#2184 参照）」という段落を、決定した規則に差し替える。
   warning は両配置で出る／`(Unassigned)` framing は top-level のみで、その理由を書く
4. `docs/spec/diagnostics.md` / `.ja.md` — `unassigned-domain` 行の
   `sits at top level with no team assignment` を
   `is not assigned to a service (at top level, or directly inside a system)` に直す
5. `docs/test-perspectives/TPL-20260730-03-…md` — proactive TPL を新設し、spec 章末尾の
   `> Related TPLs:` と TPL 側の「## 派生元 spec」で相互リンクする
6. AT: `docs/acceptance/2184-unassigned-domain-in-system.md` を新設。TC は:
   - `system EC { domain Ordering {} }` が `unassigned-domain` を 1 件出す（id / label / loc）
   - top-level 形は従来どおり warning + `(Unassigned)` 枠（回帰防止）
   - `system { service S { domain D {} } }` は無言
   - `client { domain D {} }` は `node-not-in-context` のみで `unassigned-domain` は出ない
   - 🖐 app の警告パネルに出て、domain は元の system 内に描かれたまま
   - 🖐 VS Code の Problems パネルに Warning として出る
7. changeset: `@karasu-tools/core` / `karasu` を minor（core → `karasu-vscode` は cascade）
8. ADR 昇格: 実装完了後に `docs/adr/2184-unassigned-domain-placement-parity.md` として
   昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: `system` 直下に `domain` を書いているファイルに
  `unassigned-domain` warning が新しく出る。error ではないので図もパースも変わらない。
  警告を消したい場合の対処は「domain を service の下に移す」で、これは診断が意図している
  行動そのもの
- **ドキュメント更新**: `docs/spec/syntax.md` / `.ja.md`、`docs/spec/diagnostics.md` / `.ja.md`
- **テスト・examples への影響**: `examples/**/*.krs` は該当 0 件。既存テストで
  `system` 直下に `domain` を書いて warning 件数を assert しているものがあれば更新する
  （実装時に全パッケージのテストで確認する）
- **i18n**: 文言変更なし（現行の文が両配置で真）

## 未解決の問い / 決めないこと

- **言語 v2.0 で `system` 直下 `domain` を error にするか** — 決めない。ADR-2165 が
  `canContain` に載せた正当な配置であり、本 Design Doc は「正当だが未割り当て」という
  読みを前提にしている。roadmap §Syntax 2.0 の議論に委ねる
- **`unassigned-*` family 全体の走査範囲監査** — 今回は `domain` のみ。他の kind は
  現状の走査範囲が正しいことを上のインベントリで確認済みで、将来 `canContain` に
  配置が足されたときの再発は TPL-20260730-03 で受ける
- **warning params の `placement` 追加**（案4）— 出し分ける consumer が現れた時点で
  additive に足せるので今は入れない
