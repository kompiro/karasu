# team アノテーション対応と `@migration_target` による primary owner 選択

- **日付**: 2026-06-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1583](https://github.com/kompiro/karasu/issues/1583)
  - 親 Issue: [#1566](https://github.com/kompiro/karasu/issues/1566)
  - 関連 ADR: [ADR-20260615-01](../adr/20260615-01-ownership-during-migration.md)（`duplicate-owner-assignment` を info に下げ first-wins を採用。本設計はその「却下した案: `@migration_target` 優先」を team アノテーション対応とセットで実装する続き）、[ADR-20260411-02](../adr/20260411-02-deprecated-domain-migration-coexistence.md)（domain 側の migration-coexistence precedent）、[ADR-20260615-04](../adr/20260615-04-migration-intent-fields.md)（migration intent fields）
  - 関連 TPL: [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（診断 register は fact / style で決める）、本 PR で起こす proactive TPL（後述）
  - コード: `packages/core/src/parser/parser.ts`（`indexTeams` / `buildOwnerIndex` / `buildNodePathIndex`）、`packages/core/src/types/ast.ts`（`TeamNode`）

## 背景・課題

同じノードを複数の `team` が `owns` する状態は、逆コンウェイ戦略の過渡期（移行元チームから移行先チームへの引き継ぎ中）に正当に発生する事実である。ADR-20260615-01（#1566）はこれを踏まえ `duplicate-owner-assignment` を **error → info** に下げた。ただし `ownerIndex` は 1:1（`Map<nodeId, teamId>`）であり、カードや組織クエリで返す「主オーナー」を 1 つに決める必要がある。#1566 は最小実装として **first-wins**（最初に `owns` した team が主）を採った。

一方、論理構造側の `domain` 移行共存では `buildNodePathIndex` が既に **`@migration_target` を勝たせる**（`nodePathIndex` の winner を移行先 domain にする）。組織構造側でも対称に、引き継ぎ中の主オーナーは **移行先チーム（`@migration_target`）** にしたい。これが #1566 で「却下した案」として #1583 に分離された理由。

しかし現状 `team` ブロックは **アノテーションを持てない**：`TeamNode` に `annotations` フィールドが無く、parser も team ブロックで `@...` を読まない。よって本設計は (1) team アノテーション対応の追加、(2) それを使った `ownerIndex` の優先解決、の 2 段を扱う。

## 現状（インベントリ）

| 観点 | 現状 | 場所 |
| --- | --- | --- |
| `TeamNode` 型 | `annotations` なし（`kind/id/label/properties{owns}/children/loc`） | `ast.ts:306` |
| team ブロック parse | label 文字列のみ読み、`@...` を読まない | `parseTeamBlock` `parser.ts:1634` |
| アノテーション parse | `parseAnnotations()` は汎用。`@name(key: "v")` を解釈し `ANNOTATION_PARAM_KEYS`（`migration_target:{from}` 既存）で param 検証 | `parser.ts:1350` / `:76` |
| ownerIndex 構築 | `indexTeams` が first-wins。重複時に info `duplicate-owner-assignment` を発火（`existingTeam` = 採用中の主） | `parser.ts:1771` |
| domain 優先 precedent | `@migration_target`=2 > 無印=1 > `@deprecated`=0、tie は first-wins。domain は親 service のアノテーションを **継承** して priority を計算 | `buildNodePathIndex` `parser.ts:1854-1879` |
| i18n メッセージ | `"<id>" is owned by more than one team; "<existingTeam>" is kept as its primary owner` (en/ja) | `en.ts:319` / `ja.ts:318` |
| node badge 描画 | アノテーション由来の `badgeIcon/badgeLabel/badgeColor`（resolved style）を circle+text で描く。diff-state ラップあり | `svg-renderer.ts:742-836` |
| badge style 解決 | default-style の `@deprecated{}` / `@migration_target{}` ルールが `nodeStyleKey(id, annotations)` 経由で node に適用される | `default-style.ts:49-65` / `style-resolver.ts:152` |
| org node styling | `collectOrgNodes` は `{id, kind}` のみ（annotations 無し）。`orgNodeSelectorMatches` は **annotation セレクタを弾く**（`sel.annotations.length>0 → false`）→ 現状 team に badge ルールが当たらない | `style-resolver.ts:381-399` / `:298-306` |
| org team 描画 | `renderTeamCard`（grid/icon）/ `renderTreeTeamCard`（tree）。box+label のみ、badge 無し | `org-renderer.ts:194-309` / `org-tree-renderer.ts:211-288` |

## 制約・前提

- **後方互換**: 既存 `.krs` は team にアノテーションを書いていない。`annotations` は空配列デフォルトで、無印 team の優先度は従来どおり（1）。重複が無ければ挙動は不変。
- **`ownerIndex` は 1:1 を維持**（ADR-20260615-01 の決定）。lossy さは info 診断で明示する。
- **info `duplicate-owner-assignment` は引き続き発火する**（#1566 / 受け入れ条件）。severity も info のまま。
- **domain 側のロジックにミラーする**: priority 値（2/1/0）と tie=first-wins を `nodePathIndex` と揃える。差異を作らない。
- **team には親継承を入れない**（後述の論点）。domain は親 service を継承するが、所有の優先度は「`owns` を宣言した team 自身」のアノテーションで決めるのが自然。
- **in scope**: org view で team の `@migration_target` / `@deprecated` を badge 表示する（#1583 item 4。node 側の migration badge と同じ仕組みにミラーする）。

## 検討した選択肢

### 軸 A: ownerIndex の優先解決の実装方式

#### 案 A-1: `indexTeams` 内でインライン優先スワップ（priority Map を併走）

`buildOwnerIndex` から `index: Map<nodeId, teamId>` と `priority: Map<nodeId, number>` を渡し、再帰中に重複を見つけたら priority を比較して高い方を主に差し替える（tie は first-wins）。info 診断は従来どおり発火し、`existingTeam` は **スワップ後の主**（= 解決後の primary）を指すようにする。

```ts
private indexTeams(teams, index, priority) {
  for (const team of teams) {
    const p = migrationPriority(team.annotations);
    for (const ownedId of team.properties.owns) {
      if (index.has(ownedId)) {
        if (p > priority.get(ownedId)!) { index.set(ownedId, team.id); priority.set(ownedId, p); }
        this.diagnostics.push({ severity: "info", code: "duplicate-owner-assignment",
          params: { nodeId: ownedId, existingTeam: index.get(ownedId)! }, loc: team.loc });
      } else { index.set(ownedId, team.id); priority.set(ownedId, p); }
    }
    this.indexTeams(subteams, index, priority);
  }
}
```

**メリット**

- `buildNodePathIndex` の既存パターンと構造が揃う（priority Map 併走・スワップ・tie first-wins）。
- 差分が小さい。診断発火箇所も従来のまま。
- `existingTeam` が解決後の主を指すのでメッセージが事実と一致する（スワップ後に `index.get` を読むため）。

**デメリット**

- 3 チーム以上が同じノードを owns し、宣言順が priority 昇順だと、中間の重複診断が「その時点の主」を指す（最後の診断が最終 primary を指す）。やや冗長だが各行は「その時点の事実」として正しい。

#### 案 A-2: 2 フェーズ（収集 → 解決）

再帰で `Map<nodeId, {teamId, priority, loc}[]>` を集め、ノードごとに最高 priority（tie=first-wins）で winner を選び、重複したノードに対して info 診断を **1 件だけ** 発火。

**メリット**

- ノードあたり診断 1 件で冗長さがない。winner が一意に確定してから診断を出せる。

**デメリット**

- 中間データ構造が増え、`buildNodePathIndex`（インライン方式）とパターンが揃わない。diff も大きい。
- 既存テスト（重複 2 team で info 1 件）は両案で満たせるため、追加の利点は限定的。

### 軸 B: org view での render（#1583 item 4）

#### 案 B-1: priority-only（今回は index 解決のみ。badge を出さない）

#### 案 B-2: team の `@migration_target` / `@deprecated` を org view に badge 表示する

## 比較

| 観点 | A-1 インライン | A-2 2 フェーズ |
| --- | --- | --- |
| 既存 precedent との一貫性 | ◎（`buildNodePathIndex` と同形） | △ |
| 変更量 | 小 | 中 |
| 診断の冗長さ | 3+ 重複で中間診断が出る | ノードあたり 1 件 |
| メッセージ整合 | 解決後 primary を指す | 解決後 primary を指す |

| 観点 | B-1 priority-only | B-2 badge |
| --- | --- | --- |
| スコープ | 小（parser/index + spec に閉じる） | 大（org renderer / view まで波及） |
| Issue の要請 | "for now" で許容 | 将来の別 Issue 向き |

## Related TPLs

- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — `duplicate-owner-assignment` を info に保つ根拠（fact vs style）。本設計でも severity は info を維持。
- **本 PR で起こす proactive TPL（予定）**: 「migration 共存の重複に対し 1:1 index が単一 winner を選ぶときは `@migration_target` が勝ち、tie は first-wins。これを `nodePathIndex` と `ownerIndex` の **両方** で一貫させる」。`docs/concepts` の fact-vs-style 原則と ADR-20260411-02 / ADR-20260615-01 から導かれるが未 TPL 化で、将来 3 つ目の 1:1 index が追加されたときにルールが揃わない再発リスクがある（3-Yes: 横展開する / 構造的に再発する / 既存 TPL 未掲載）。`docs/spec/tags-annotations.md` の team アノテーション節と双方向リンクする。

## 現時点の方針（確定）

- **軸 A は案 A-1（インライン優先スワップ）を採用** — 既存 `buildNodePathIndex` と構造を揃えられ、差分が小さく、メッセージも解決後 primary を指せる。共通化のため module-level helper `migrationPriority(annotations)` を新設し、`buildNodePathIndex` の ternary もこれに寄せて重複を排除する。
- **軸 B は案 B-2（badge も今回出す）を採用** — node 側の migration badge と同じ仕組みを org view の team にミラーする。Issue item 4 を今回のスコープに含める。
- **親継承はしない** — `owns` を宣言した team 自身の `@migration_target` のみで優先度を決める（所有の主体は宣言した team）。domain↔service の継承はミラーしない。

### 実装の指針

**パート 1: parse + ownerIndex 優先解決（軸 A）**

1. `ast.ts`: `TeamNode` に `annotations: string[]` と `annotationParams?: Record<string, Record<string, string>>` を追加（`BaseNodeFields` に揃える）。
2. `parser.ts` `parseTeamBlock`: label 後・`{` 前で `parseAnnotations()` を呼び、`annotations` / `annotationParams`（空なら省略）を返り値に格納。
3. `parser.ts`: module-level `migrationPriority(annotations: readonly string[]): number` を新設。`indexTeams` / `buildOwnerIndex` に priority Map を通して案 A-1 を実装（親継承なし＝team 自身の annotations のみ）。`buildNodePathIndex` の domain priority もこの helper に置き換え。
4. `reference-data.ts` および `TeamNode` リテラルを作る test fixture 群に `annotations: []` を追加（型変更の機械的追従）。

**パート 2: org view の badge レンダリング（軸 B）**

5. `style-resolver.ts`: `OrgNodeDescriptor` に `annotations: string[]` を追加し、`collectOrgNodes` で `team.annotations` を載せる（member は `[]`）。`orgNodeSelectorMatches` を node 側 (`nodeSelectorMatches`) と同様に annotation セレクタを `node.annotations.every(...)` でマッチさせる（現状の `sel.annotations.length>0 → false` を置換）。これで default-style の `@migration_target{}` / `@deprecated{}` ルールが team に当たり、resolved style に `badgeIcon/badgeLabel/badgeColor` が乗る。team ID は一意（`duplicate-team-id` は error）なので `nodeStyles.set(node.id, ...)` のみで足りる（qualified key 不要）。
6. badge SVG の共通化: `svg-renderer.ts:757-793` の current-badge 描画を小さな共有 helper（例 `renderer/badge.ts` の `badgeChildren(style, badgeX, badgeY, fallbackColor): string[]`）に切り出す。svg-renderer は従来どおり diff-state `<g>` でラップ、org renderer は素の `<g>` でラップ。diff-state / ghost ロジックは svg-renderer 側に残す（org の badge churn 表現は今回スコープ外）。
7. `org-renderer.ts` `renderTeamCard` / `org-tree-renderer.ts` `renderTreeTeamCard`: resolved team style に badge があれば helper で badge を描画（card 右上に配置）。

**パート 3: docs / tests / changeset**

8. `parser.test.ts`: team アノテーション parse / `@migration_target(from:)` param / 重複所有で `@migration_target` が勝つ（宣言順 前後 両方）/ `@deprecated` が負ける / 無印 tie は first-wins / info が依然発火、を網羅。
9. `style-resolver.test.ts`: `@deprecated` / `@migration_target` team が badge style（`badgeIcon` 等）を解決することを確認。`org-renderer.test.ts` / `org-tree-renderer.test.ts`: badge が SVG に出ることを確認。
10. `docs/spec/tags-annotations.md`「Team contact convention」節に team アノテーション + primary-owner 優先ルール + badge 表示の小節を追加。章末に `> Related TPLs:` 注釈。
11. proactive TPL を `test-perspective` スキルで起こし、spec と相互リンク。README index 更新。
12. `.changeset/` に変更概要を追加。
13. AT: parser/resolver/renderer はすべて unit test で自動検証可能。badge の **見た目** は人間確認の余地があるため、`docs/acceptance/` に最小 AT を 1 件起こすか検討（TC: `@migration_target` team が org view で → badge 付きで表示される）。
14. ADR 昇格: 実装完了後（`/start-dev` クリーンアップ）に `docs/adr/20260615-NN-team-annotations-owner-priority.md` として昇格し、本 Design Doc を同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（無印 team の優先度は 1 のまま、重複が無ければ ownerIndex 挙動不変。badge は team にアノテーションを付けた場合のみ出る）。重複時のみ主オーナーの選び方が first-wins → migration 優先 に変わるが、これは緩和・対称化方向。
- ドキュメント更新: `docs/spec/tags-annotations.md`、proactive TPL、README（TPL index）。
- テスト・examples への影響: `TeamNode` リテラルを持つ既存テストに `annotations: []` を追加（機械的）。examples への影響なし。

## 決定事項（未解決の問いの解消）

- **Q1（render）→ badge も今回出す**: node 側の migration badge と同じ仕組みを org view の team にミラーする（軸 B-2）。
- **Q2（親継承）→ 継承しない**: `owns` を宣言した team 自身の `@migration_target` のみで優先度を決める。所有の主体は宣言した team。
- **Q3（実装方式）→ 案 A-1（インライン優先スワップ）**。
- **Q4（PR 構成）→ 実装とバンドル**: 本 Design Doc は `feat/team-annotations` PR に含め、完了時に ADR へ昇格して Design Doc を削除する。
