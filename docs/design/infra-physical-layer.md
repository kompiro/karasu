# infra block keyword を物理層の要素として表現できるようにすべきか

- **日付**: 2026-06-16
- **ステータス**: 検討中（案B + kind 設計 B-2 で方針確定、実装 PR で ADR 昇格予定）
- **関連**:
  - 引き金 Issue: [#1632](https://github.com/kompiro/karasu/issues/1632)
  - PR: [#1645](https://github.com/kompiro/karasu/pull/1645)
  - 関連 ADR: [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（database/queue/storage を論理層の first-class node に昇格）
  - 関連 TPL: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（共有語彙の dual representation）
  - 関連 Issue: [#423](https://github.com/kompiro/karasu/issues/423)（deploy diagram restructure）, [#1626](https://github.com/kompiro/karasu/issues/1626)（infra keyword vs shape tag）, [#1314](https://github.com/kompiro/karasu/issues/1314)（Syntax v1.0 spec freeze）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectUnresolvedRealizes`）

## 背景・課題

infra block keyword（`database` / `queue` / `storage`、leaf の `table` / `queue-item` / `bucket`）は
[ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md) で論理層の first-class node に
昇格した。現状これらは **論理層にしか存在しない**: system view の依存 tier に描かれ、service が
それらに *依存する*（`service → database` edge）という関係を表す。

一方、物理層は `deploy` block であり、その unit（`war` / `oci` / `lambda` / `job` …）は
`realizes` で論理層に紐づく。しかし `realizes` の解決対象は **`service` / `domain` の id に限定** されている
（`packages/core/src/resolver/warnings.ts` の `detectUnresolvedRealizes`、valid id 集合は service / domain のみ）。
`realizes` の先に `database` / `queue` / `storage` の id を書くと、現状は `unresolved-realizes` warning になる。

> **正味の帰結**: 共有データストアの *物理的な実体* を表現する手段が無い。
> 例:「論理上の `database OrderDB` は本番では managed な RDS Postgres インスタンスとして動く」
> 「`queue OrderEvents` は SQS queue として実体化される」を `.krs` で書けない。

この壁打ちの問いは: **infra block keyword を物理層の要素として表現／紐付けできるようにすべきか**。
具体的には、deploy diagram 上で「どの concrete な managed service がこの論理ストアを realize するか」を
（service を `realizes` するのと同じように）モデルに書けるようにすべきか。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| infra node の所属層 | 論理層のみ。system view の依存 tier に描画（ADR-20260405-05） |
| `realizes` の解決対象 | `service` / `domain` の id のみ（`detectUnresolvedRealizes`）。infra id は `unresolved-realizes` warning |
| deploy unit kind | `war` / `jar` / `oci` / `lambda` / `function` / `assets` / `job` / `artifact`（`reference-data.ts`） |
| 物理⇄論理の binding 動詞 | `realizes`（物理→論理。UML Realization 相当） |
| `[external]` との関係 | infra node に `[external]` 可（boundary 外の managed store を表現済み） |
| 既存の境界規定 | `docs/concepts.ja.md` §「物理インフラのトポロジ…はモデリングしない」— `deploy` は **ランタイム契約層** で止める |

## 制約・前提

- **境界規定との整合が最重要**: `docs/concepts.ja.md`（L532-548）は、物理インフラのトポロジ
  （リージョン・AZ・クラスタ・ノード）を対象外とし、`deploy` は「どのコード成果物がどのランタイム形態で
  動くか」という **ランタイム契約層** で止めると明言している。本検討はこの線を越えてはならない。
- **Syntax v1.0 freeze（#1314）が迫っている**: `deploy` / `realizes` のセマンティクスを freeze する前に、
  この拡張を「v1.0 に入れる / v1.x 以降 / 永久に入れない」を決め切る必要がある。後方非互換になりうる
  変更（`realizes` の対象拡大）は freeze 後だと入れづらい。
- **後方互換**: 現状 `realizes <infraId>` は warning になる。これを valid にするのは前方互換（既存ファイルを壊さない）。
  ただし「warning だったものが意味を持つ」ので、診断とビューの両方に影響する。
- **out of scope**: DB スキーマモデリング、リージョン/AZ/ノードのトポロジ、IaC 構成の取り込み。

## 検討した選択肢

### 案A: 現状維持（infra は論理層のみ）

infra node は論理層に閉じたまま。データストアの物理的実体は IaC / クラウドツールの責務とし、karasu は
追わない。`realizes <infraId>` は引き続き warning。

**メリット**

- 境界規定（ランタイム契約層で止める）と完全に整合。語彙が増えない。
- managed store は team が deploy する成果物を持たないことが多く、物理層に置く動機が弱い。
- v1.0 freeze に対して「決めない」コストが最小。

**デメリット**

- 論理⇄物理の対応表に「唯一 realize できない node 種別（infra）」という非対称が残る。
- 「この DB は本番では何で動くのか」という頻出の問いに karasu が答えられない。

### 案B: `realizes` の対象を infra node に拡張

deploy unit が `realizes <infraId>`（`database` / `queue` / `storage`）を書けるようにする。
valid id 集合に infra id を追加し、deploy view で infra node の container 内に物理 unit を描く。

**メリット**

- 文法追加ゼロ。既存の論理⇄物理動詞 `realizes` を再利用。最小の変更。
- service の realize と完全に対称。学習コストが低い。

**デメリット**

- 既存 deploy unit kind（`war` / `oci` …）は「コード成果物」を表す。managed RDS を `oci` で realize するのは
  意味的に歪。kind の意味が曖昧になる。
- 「論理 infra を realize する物理は何 kind か」という新しい設計問題を誘発する（案C と結合しがち）。

### 案C: 物理側に managed-resource 専用 kind を追加

deploy 側に「概念的に managed なデータストア実体」を表す kind（例: `managed` / あるいは `db` / `bucket` を
物理 unit として）を追加し、それが論理 infra node を `realizes` する。

**メリット**

- 「コード成果物の deploy」と「managed store の実体」を kind レベルで区別でき、案B の意味的歪みを回避。
- 物理層に「何が動くか」の情報が増え、deploy diagram の説明力が上がる。

**デメリット**

- 語彙が増える（freeze 直前に新 kind を追加するコスト）。
- ランタイム契約層の境界に最も近づく。「managed service 種別を書く」ことが
  インフラ構成モデリングへの第一歩になり、境界が侵食されるリスク（concepts.ja.md L526 の懸念そのもの）。

### 案D: `[external]` の意味づけで代替（物理層を増やさない）

物理的実体の関心の多くは「boundary 外の managed か / boundary 内で自前運用か」に集約される、という立場。
それは既に infra node への `[external]` tag で表現できる。新たな物理層表現は足さず、`[external]` の
ドキュメント・描画を強化する。

**メリット**

- 既存語彙のみ。境界規定を一切動かさない。
- 「自前 DB か managed か」という最頻出の区別はこれで足りるケースが多い。

**デメリット**

- 「どの managed service か（RDS / Cloud SQL / SQS …）」までは表現できない。`[external]` は boolean 的。
- 物理⇄論理の対応表の非対称（案A のデメリット）は解消しない。

## 比較

| 観点 | 案A 現状維持 | 案B realizes拡張 | 案C 専用kind | 案D external強化 |
| --- | --- | --- | --- | --- |
| 文法変更量 | なし | 小（解決対象拡大） | 中（kind 追加） | なし |
| 後方互換 | ◎ | ○（warning→意味付与） | ○ | ◎ |
| 境界規定との整合 | ◎ | ○ | △（侵食リスク） | ◎ |
| 表現力（どの managed か） | × | ○ | ◎ | × |
| 対応表の非対称解消 | × | ◎ | ◎ | × |
| v1.0 freeze への収まり | ◎ | ○ | △ | ◎ |

## 確定した方針

**案B（`realizes` の対象を infra node に拡張）を採る。** deploy unit が `realizes <infraId>` を
書けるようにする。中心的な論拠:

1. **「どの DBMS / どの managed 形態か」は論理層の関心ではなく物理層の関心である。**
   論理層の `database OrderDB` は「OrderDB という共有ストアが存在し、service がそれに依存する」ことだけを表す。
   それが PostgreSQL なのか MySQL なのか、RDS なのか Aurora なのか、自前 EC2 上の Postgres なのかは、
   *実プロダクトをどう動かすか* の話であり、deployment 層が `realizes` で受け持つのが自然。
   service を `oci` / `lambda` が realize するのと完全に対称で、infra node だけ realize 対象外という
   現状の非対称（valid-id が service/domain のみ）を解消する。
2. **境界規定（ランタイム契約層）を越えない。** concepts.ja.md が対象外とするのは
   トポロジ（リージョン・AZ・クラスタ・ノード）であって、「どの concrete な runtime form で動くか」は
   まさに `deploy` の **ランタイム契約層** そのもの。「Aurora PostgreSQL 15 として動く」は
   「OCI image として動く」と同じ抽象度の記述であり、`deploy` が既に扱っている層に収まる。
   ストアの物理実体を `deploy` に置くことは境界の侵食ではなく、既存境界の対称な適用である。
3. **`[external]`（案D）では不足。** `[external]` は boundary の内外という boolean しか表せず、
   「RDS か Aurora か」までは書けない。ユーザーが表現したいのはこの具体度なので案D 単独では要件を満たさない。

**kind 設計は (B-2)（store 専用 kind の新設）で確定。** 成果物 kind（`war` / `oci` …）に managed store を
混ぜず、kind で区別する。具体は下記「確定した設計」。

## 確定した設計（B-2）

### 文法

- 新しい deploy unit kind **`store`**（managed data store の物理実体）を追加する。`store` は
  `database` / `queue` / `storage` の論理 infra node を `realizes` する。
- プロパティは `["label", "type", "realizes"]`。`type` は具体技術の**自由記述**
  （`"Aurora PostgreSQL 15"` / `"Amazon SQS"` / `"S3"` …）。controlled vocabulary は設けない
  （列挙を始めるとトポロジ寄りの構成記述に滑るため。`@deprecated(until:)` の
  graceful degradation と同じく自由記述で受ける）。`runtime` / `schedule` は持たない
  （managed store にコード成果物のランタイム形態の概念は薄い）。

```krs
deploy "production" {
  store OrderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB        // 論理 infra `database OrderDB` を realize
  }
  store EventBus {
    type "Amazon SQS"
    realizes OrderEvents    // `queue OrderEvents` を realize
  }
}
```

- 既存 kind（`oci` 等）も `realizes <infraId>` を書けるようにはする（valid 化のみ）。ただし
  「managed store は `store` で書く」のが推奨スタイルで、spec にそう記す。

### セマンティクス・描画

- `realizes <infraId>` は valid（現状の `unresolved-realizes` warning を出さない）。
- deploy view で、infra node を realize 先とする `store`（や他 unit）を、その infra の container 内に
  描く。service の realize と同じ描画経路を使う。
- アイコンは既存の `database` アイコン（cylinder 系）を流用し、新規 SVG asset は追加しない。

### 後方互換

前方互換。これまで warning だった `realizes <infraId>` が valid になるだけで、既存ファイルは壊れない。
infra を realize していなかったファイルの描画・診断は不変。

## 実装の指針（コード調査済みの確定リスト）

新 kind `store` は **deploy kind を列挙する全 6 箇所**を同時更新する（enum member addition）:

1. `packages/core/src/types/ast.ts` — `DeployNodeKind` union に `"store"`（`DeployNodeProperties` の `type?` は既存）
2. `packages/core/src/parser/parser.ts` — `DEPLOY_KEYWORDS` に `"store"`（`DEPLOY_PROPERTY_KEYWORDS` の `type` は既存・変更不要）
3. `packages/core/src/builtins/reference-data.ts` — `deployUnitKinds` に `store`（`properties: ["label","type","realizes"]`）
4. `packages/core/src/builtins/icon-theme.ts` — `{ kind: "store", icon: "database", scope: "deploy" }`（既存アイコン流用）
5. `packages/core/src/builtins/default-style.ts` — `store {}` スタイルブロック（badge-label + 色、light/dark の 2 箇所）
6. `packages/core/src/exporter/drawio/drawio-style.ts` — `store` の色 override

`realizes` の infra 拡張:

7. `packages/core/src/resolver/warnings.ts` `detectUnresolvedRealizes` — valid-id 集合に infra を追加。
   `collectIds` の kind 判定に `database` / `queue` / `storage` を加え、かつ top-level の
   `file.databases` / `file.queues` / `file.storages` バケットを明示ループで追加する
   （top-level infra は `system.children` ではなくこれらのバケットに入るため両方必要）。
8. `packages/core/src/view/deploy-view-extract.ts` — `serviceLabelMap` に infra node のラベルを追加し、
   infra を realize する unit が infra container 配下に描画されるようにする。

> renderer / layout / `translate/k8s.ts` / `translate/compose.ts` は container id にポリモーフィックで
> **変更不要**（translate は `store` kind を生成しない）。

ドキュメント:

9. `pnpm gen:reference` で `docs/spec/syntax.md`（+ja）の `deploy-unit-kinds` 表を再生成（`store` 行が自動追加）。
10. `docs/spec/syntax.md`（+ja）の deploy / realizes 節に「deploy unit は infra node も realize できる」「`store` kind の用途と推奨」を加筆。
11. `docs/concepts.md`（+ja）の物理層の説明に infra realize を反映（**ランタイム契約層の範囲内**であり、トポロジは依然 out of scope と明記）。

テスト / TPL / AT:

12. unit: `warnings.test.ts`（`store` → infra realize で warning 0 / typo は warning）、
    `deploy-view-extract.test.ts`（infra container 生成）、parser deploy test（`store` 受理）、
    `reference-data` / `icon-theme` の既存 parity テストが新 kind を拾うこと。
13. TPL（back-ref）: 新 deploy kind 追加は「enum member を全表現で同時更新」リスクなので
    [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) を spec に back-ref。
    `realizes` の対象種別拡大は [TPL-20260510-10](../test-perspectives/TPL-20260510-10-cross-reference-validation.md) も該当 → 併記（双方向）。
14. AT: `docs/acceptance/1632-infra-physical-realize.md` — `store` が `database` を realize する `index.krs` で
    (a) `unresolved-realizes` 警告ゼロ、(b) deploy view に infra container として描画。

ADR 昇格:

15. 実装 PR で `docs/adr/1632-infra-physical-realize.md` に昇格し（B-2 決定を記録）、本 Design Doc を同 PR で削除する。

## Related TPLs

- [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) — enum メンバー（deploy kind）追加時は全表現を同時更新する。`store` 追加で 6 箇所を同期。
- [TPL-20260510-10](../test-perspectives/TPL-20260510-10-cross-reference-validation.md) — クロス参照（`realizes`）の解決対象を拡張するとき、全 valid kind を網羅して検証する。
- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — `reference-data` の deploy kind と icon-theme / default-style の整合（既存 parity テストでフェンス）。

## 影響範囲・マイグレーション

- 既存ユーザーへの影響: 前方互換（これまで warning だった `realizes <infraId>` が valid になる）。既存ファイルは壊れない。
- ドキュメント更新: `docs/spec/syntax.md`（+ja）, `docs/concepts.md`（+ja）, `docs/spec/diagnostics.md`（`unresolved-realizes` の対象記述）。
- テスト・examples への影響: deploy 周りの resolver / view テストを追加。ec-platform 等の examples への infra realize 実例追加は**任意**（別 PR 可）。

## 決めないこと（実装後の判断に送る）

- v1.0 freeze（#1314）に本機能を含めるか v1.x に送るかは**ロードマップ判断**。`realizes` の
  セマンティクス拡張なので freeze 前に入れるのが望ましいが、実装完了後に #1314 / `docs/roadmap.md` 側で確定する。
- examples（ec-platform）への `store` 実例追加の要否・タイミング。
