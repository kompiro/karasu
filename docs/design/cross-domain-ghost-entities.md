# Cross-domain ghost entities in the entity view

- **日付**: 2026-07-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1911](https://github.com/kompiro/karasu/issues/1911)（PR 2b-2）、親 [#1870](https://github.com/kompiro/karasu/issues/1870)
  - 関連 ADR: [ADR-20260411-05](../adr/20260411-05-ghost-domain-edges.md)（ghost domain エッジ：両方向・bottom 配置・subLabel。ドメイン ID の error 級一意性を前提にしている）、[ADR-20260405-07](../adr/20260405-07-ghost-system-rendering.md)（ghost 描画の基本）
  - 関連ドキュメント: [`docs/design/domain-entity-modeling.md`](domain-entity-modeling.md)、[`docs/spec/permalink.md`](../spec/permalink.md) entity view 節
  - コード: `packages/core/src/view/view-extract.ts`（`extractEntityView` / `buildGhostDomains`）、`packages/core/src/renderer/layout.ts`（`placeGhostDomains` / ghost edge）

## 背景・課題

PR 2a/2b でドメイン単位の**エンティティビュー**を導入したが、v1 は **intra-domain
関連のみ**を描画する。`extractEntityView` は、あるドメインのエンティティが持つ関連 edge の
うち **参照先が同一ドメインの entity でないもの（cross-domain 関連）をドロップ**している:

```ts
for (const edge of entity.edges) {
  if (localEntityIds.has(edge.to)) childEdges.push(edge); // それ以外は捨てる
}
```

これはオンボーディングの動機（「担当ドメインのエンティティと関連を把握する」）に対して
不完全である。実システムでは Order → Customer のようにドメイン境界をまたぐ関連が普通に
あり、それが見えないとドメインの依存関係が伝わらない。参照先の foreign entity を
**ghost（半透明）ノード**として表示し、cross-domain 関連を描く。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ghost の描画機構 | `LayoutNode.ghost=true` のノードを `svg-renderer.ts` が `class="ghost-nodes" opacity=0.3` でまとめて muting。**style lookup ではなく layout-node フラグ方式**（2a review で tag 方式は却下＝ghost が実 entity と id を共有し実スタイルが返るため） |
| 既存 ghost パターン | `ghostUsers`（left）/`ghostSystems`（left-right）/`ghostDomains`（bottom）。`ViewSlice` に `ghostX / ghostXEdges` を持ち、`placeGhostX` が `layoutNodes.set(..., {ghost:true, subLabel})`、edge は `ghostXEdges` ループで `ghost:true` エッジ化 |
| ghost domain の方向 | ADR-20260411-05: **outgoing + incoming の両方向**。subLabel=親サービス名。ID で外部ドメインを特定できるのは **ドメイン ID がシステム内で error 級に一意**だから |
| **entity ID の一意性** | **warning 級のみ**（2a の `entity-anchor-collision`）。model-wide の {domain id}∪{entity id} 衝突を warning で報告するが error ではない。→ **entity ID だけで foreign entity を一意特定できない**（ghost domain との本質的な差） |
| 2 サーフェス | live app（`renderEntityView`）と静的バンドル（`collectEntityLevels`）は両方 `extractEntityView`+`render` を通るので、slice に ghost を足せば**両サーフェスが自動で ghost 表示**になる |

## 制約・前提

- **layout-node フラグ方式のみ**（tag/style 方式は却下済み）。foreign entity は `childNodes` に入れず専用 slice フィールドへ。
- foreign entity は他ドメインの子なので、ローカル entity と id 衝突しない限り `layoutNodes` Map で上書き事故は起きない（ghost domain と同じ「構造上の衝突回避」）。ただし entity ID は warning 級一意性しかない点に留意。
- **core-only**。renderer 変更なし（`svg-renderer.ts:372-382` が既に muting）。app 変更なし（2b-1 の live view/toggle がそのまま ghost を拾う）。
- v1 は **多重度・ジャンクション経由の間接関連は対象外**。edge が直接指す foreign entity のみ ghost 化する。
- 新 edge 構文は増やさない（domain-entity-modeling の v1 方針）。

## 検討した選択肢

### 論点 A: 表示する関連の方向

#### 案 A-1: outgoing のみ（自ドメインの entity → foreign entity）

自ドメインの entity が持つ edge のうち cross-domain のものだけを ghost 化する。
`extractEntityView` は既に自ドメインの entity を走査しているので、実装は最小
（ドロップしていた edge を拾うだけ）。

**メリット**

- 実装が最小・O(自ドメイン entity 数)。
- オンボーディングの主目的（「自分のエンティティが**何に依存するか**」）に直結。
- ghost が「自分が参照している先」に限定され、画面が散らからない。

**デメリット**

- 「**誰が自ドメインを参照しているか**（incoming）」は見えない。ドメインの役割理解には片手落ち。

#### 案 A-2: 両方向（ghost domain と同じ）

outgoing に加え、他ドメインの entity → 自ドメイン entity への edge も走査し、
参照元 foreign entity を ghost 化する。ADR-20260411-05 の ghost domain と一貫。

**メリット**

- ghost domain と挙動が一貫（学習コスト低）。
- ドメインの被参照（自分が何に使われているか）も見え、役割理解が深まる。

**デメリット**

- incoming 検出は **全ドメインの全 entity の edge を走査**（model-wide スキャン）。コスト増。
- 大きめのモデルで ghost が増え、エンティティビューの「一目で把握」という利点を薄める恐れ。

### 論点 B: foreign entity の解決（entity ID の非一意性）

`edge.to` は entity id 文字列。entity ID は **warning 級一意性**しかないため、
bare id 単独では model 全体で foreign entity を一意特定できない（ghost domain が
依拠する「domain ID が error 級に一意」という前提が entity には成り立たない）。

#### 案 B-1: first-match ＋ 既存 warning に委ねる

bare id で model 走査し最初にマッチした entity を採る。曖昧さは
`entity-anchor-collision` warning に委譲。**デメリット**: 同名 entity が別ドメインに
複数ある場合、意図しない相手を ghost 化し得る。

#### 案 B-2: 曖昧なら drop

複数マッチしたら edge をドロップ。**デメリット**: 相手が明確でも出なくなる。

#### 案 B-3: **限定子付き参照 `DomainId.EntityId`（採用）**

cross-domain 関連は `Order -> Customers.Customer` のように **`<DomainId>.<EntityId>`**
で参照する（bare id は同一ドメイン内 intra-domain 参照専用）。karasu の既存の
「境界をまたぐ参照は dot-notation」慣習（resource `OrderDB.orders`、cross-system
`SystemId.ServiceId`、cross-service domain edge）と一貫。DomainID は system 内で
error 級に一意なので、`Domain.Entity` は **曖昧性なく解決**できる。

**メリット**

- entity ID の非一意性を**構造的に解消**（first-match の当てずっぽうが不要）。
- 既存 dot-notation 慣習と一貫。parser 変更不要（dot-notation ターゲットは既にパース可能）。
- 「cross-domain 参照である」ことが .krs 上で明示され、意図が読める。

**デメリット**

- 著者は cross-domain 参照を明示的に限定子付きで書く必要がある（bare の cross-domain 参照は解決されず drop）。
- 解決規則が1つ増える（spec/tags-annotations への明記が必要）。

### 論点 C: sub-label（ghost に添える文脈）

ghost domain は subLabel=親サービス名。entity の文脈は **所属ドメイン**なので
subLabel=所属ドメインの label が素直。将来 `Service / Domain` の 2 段も検討余地。

## 現時点の方針（レビューで確定）

**論点 A: 両方向（案 A-2）** — ghost domain（ADR-20260411-05）と挙動を揃える。
自ドメインの entity が参照する foreign entity（outgoing）に加え、他ドメインの entity が
自ドメインの entity を参照している場合（incoming）もその参照元 foreign entity を ghost 化する。
依存・被依存の両面が見え、ドメインの役割理解が深まる。

**論点 B: 限定子付き参照 `DomainId.EntityId`（案 B-3）** — cross-domain 参照は
`Order -> Customers.Customer` と限定子付きで書く。DomainID が error 級一意のため
曖昧性なく解決でき、entity ID の非一意性を構造的に回避する。bare id は intra-domain
専用。既存 dot-notation 慣習と一貫。

**論点 C: subLabel=所属ドメイン label。**

### 実装の指針

1. `view-extract.ts`:
   - `GhostEntity { node: KrsNode; parentDomainLabel: string }` を追加。
   - `ViewSlice` に `ghostEntities: GhostEntity[]` + `ghostEntityEdges: KrsEdge[]`、`emptySlice()` に seed。
   - model 全体の domain index `Map<domainId, { domain: KrsNode; entities: Map<entityId, KrsNode> }>` を構築。限定子 `Domain.Entity` は「最後の `.` で分割 → 左=domainId で domain 特定 → 右=entityId で entity 特定」で解決。
   - `extractEntityView`（現ドメイン D、ローカル entity 集合 `localEntityIds`）:
     - **intra-domain**: `edge.to` が bare かつ `localEntityIds` に含まれる → `childEdges`（現状維持）。
     - **outgoing ghost**: D の entity の edge で `edge.to` が `Other.Foreign` 形かつ Other≠D に解決 → foreign を `ghostEntities`、edge を `ghostEntityEdges`。
     - **incoming ghost**: model 全 domain の entity を走査し、`edge.to` が `D.<localEntity>` に解決される edge を検出 → その参照元 entity を `ghostEntities`、edge を `ghostEntityEdges`。
     - 解決できない（resource/table/未定義/bare の非ローカル）edge は従来どおり drop。foreign entity は `childNodes` に入れない。重複は id で排除。
2. `layout.ts`:
   - `placeGhostEntities`（`placeGhostDomains` を写す、`ghost:true`、subLabel=`parentDomainLabel`、bottom 配置）を追加し `placeGhostDomains` の隣で呼ぶ。
   - ghost edge 生成に `ghostEntityEdges` ループを追加（`ghostDomainEdges` ブロックを写す、`ghost:true`）。edge の from/to は限定子付き id になり得るので、layoutNodes 参照時に foreign 側は bare entity id で引けるよう解決キーを合わせる（ghost node は bare entity id で `set` するか、限定子付きキーで揃える — 実装時に一方に統一）。
3. テスト:
   - `view-extract.test.ts`: outgoing `D1.entity -> D2.foreign` → foreign が `ghostEntities`・`childNodes` に無い / incoming `D2.x -> D1.local` → x が ghost / intra-domain bare は不変 / bare の cross-domain 参照は drop / resource dot-notation は ghost 化しない / 限定子 `Domain.Entity` が正しく解決。
   - `drill-down-svg.test.ts`: `renderEntityView` 出力に ghost entity が `class="ghost-nodes"`（opacity 0.3）で含まれる。
4. AT: `docs/acceptance/1907-entity-view-app.md` に cross-domain ghost 基準を追記（または `1911-...md` 新設）。
5. Docs / spec:
   - `extractEntityView` docstring の「ghost は後続」記述を更新。
   - **`docs/spec/syntax.md`（または tags-annotations）に「cross-domain entity 参照は `DomainId.EntityId`」という解決規則を明記** — dot-notation 慣習の一例として。これは spec 追記なので **proactive TPL を同 PR で 1 件起こす**（「cross-domain entity 参照は限定子付き / bare は intra-domain 専用」を破ったとき検出）。
   - `permalink.md`/`.ja.md` の entity view 節を必要に応じ更新。
6. ADR 昇格: 実装完了後 `docs/adr/YYYYMMDD-NN-cross-domain-ghost-entities.md` に昇格し本 Design Doc は同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: エンティティビューに cross-domain 関連の ghost が増える（追加のみ、intra-domain 表示は不変）。cross-domain 参照の**限定子付き記法**が新たに解決されるようになる（既存の bare 参照挙動は変えない＝後方互換）。changeset（`@karasu-tools/core` + `karasu`、minor）。
- ドキュメント更新: `docs/spec/syntax.md`（限定子解決規則）＋ proactive TPL、`extractEntityView` docstring、AT、必要なら permalink。
- テスト・examples への影響: なし（新 examples 不要。AT 用サンプルはテスト内インライン）。

## 未解決の問い / 決めないこと

- v2 以降（決めない）: 多重度タグ、ジャンクション経由の間接関連の ghost、`Service/Domain` 2 段 subLabel、限定子の nested domain（`Parent.Child.Entity`）対応。
