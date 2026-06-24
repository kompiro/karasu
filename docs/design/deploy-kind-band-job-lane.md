# Deploy view: job lane（kind band 第一歩）

- **日付**: 2026-06-24
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1738](https://github.com/kompiro/karasu/issues/1738)
  - 関連 ADR: [ADR-20260408-02](../adr/20260408-02-deploy-layout-hierarchical-dag.md)（Longest Path Layering）、[ADR-20260327-01](../adr/20260327-01-deployment-diagram-design.md)（deploy diagram design / flat container grouping / ghost edges）、[ADR-20260616-12](../adr/20260616-12-deploy-infra-dependency-edges.md)（service→infra ghost edges）
  - 関連 Design Doc: [balanced-grid-sibling-layout](balanced-grid-sibling-layout.md)（#1737 — 同層内の格子化。本設計と直交・補完）
  - 関連 TPL: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)（display-mode cross-surface）、[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（scoped glance）。実装 PR で proactive TPL を 1 件起こす予定（後述）
  - コード: `packages/core/src/renderer/deploy-layout.ts`, `packages/core/src/view/deploy-view-extract.ts`, `packages/core/src/renderer/layout-types.ts`

## 背景・課題

deploy view のレイアウトは **dependency-driven** で、kind ベースのグループ化を持たない（ADR-20260408-02）。

- ユニットは `realizes`（どの論理要素を実装するか）で container にまとめられ、container は ghost edge 上の Longest Path Layering で縦に層化される。
- deploy unit kind（`ast.ts` `DeployNodeKind`）: `war | jar | oci | lambda | function | assets | job | artifact | store`。
- `realizes` を持たないユニットは既に最下段（`__unclassified__` container）に集まる。

`hato` の deploy view を描画して観測した症状:

- **store（infra）は既に最下部にクラスタする** — store は依存のリーフなので自然に沈む（emergent な infra 帯）。
- **compute（oci）は最上部** — 依存の根。
- **`job`（cron）が散らばる** — `weekly-feedback` / `weekly-memory` は上段、`daily-retitle` は中段、というように、各 job が `realizes` するドメインの依存深度で配置されるため。**これが最も明確な可読性ギャップ**で、スケジュール job が一つの運用グループとして読めない。

つまり動機は **semantic grouping / cross-face consistency** であって幅ではない（幅は ADR-20260408-02 で解決済み）。

## 現状（インベントリ）

| 観点 | 現状 | 参照 |
| --- | --- | --- |
| container 化 | `realizes` ごとに container。複数 realize は重複配置 | `deploy-view-extract.ts` `extractDeployView` |
| 層化 | ghost edge 上の Longest Path Layering（BFS, layer = max(pred)+1） | `deploy-layout.ts` `assignLayers` (66-111) |
| 同層内配置 | barycenter ソート + `MAX_LAYER_WIDTH`(1200px) でサブロー折り返し | `deploy-layout.ts` (205-271) |
| unclassified | `realizes` 無しを `__unclassified__` container として最下段に | `deploy-layout.ts` (273-316) |
| kind 情報 | `unit.kind` は `LayoutNode.kind` まで伝播するが、container 層・layout では未使用 | `deploy-layout.ts:245,292`, `layout-types.ts` |
| ghost edge | service→service（system.edges）+ service→infra（`deriveInfraEdges`）。両端 realize 必須 | ADR-20260616-12 |
| 既存テスト | `deploy-layout.test.ts`（層化・wrap・unclassified）, `at-0049-deploy-layer-wrap.spec.ts`（layer 0 wrap） | — |

## 制約・前提

- **deploy view は物理ビュー** — その価値は依存 DAG（何が何を実行するか）。compute を一律帯に潰すと DAG が壊れる（Issue が #1724 的な全 kind 帯化を退ける理由）。
- **後方互換**: job を含まない `.krs` の描画は不変。
- **`realizes` ラベルの保持**: job は `realizes` 先のドメイン/サービス名の container に入る（hato の `Feedback`/`Memory`/`Journaling`）。帯化は **job-only container を帯に移す**のであって、個々のユニットを再グループ化しない。
- **決定性**: 同一入力 → 同一 SVG（ADR-20260408-02 と同じ原則）。
- **#1737 依存**: balanced-grid（#1737, `status: implementing`）が同じ `deploy-layout` の同層内配置（205-271 行）を触るため、本実装は **#1737 マージ後**に着手し、共通化された配置関数を再利用する。
- **out of scope**: deploy 幅（ADR-20260408-02 済）、kind color/style-system 統合（#30）、視覚スイムレーン/背景帯（候補 D）、store/infra 帯の正式コード化（候補 B、本設計では見送り）。

## 検討した選択肢

Issue の候補 A〜D を踏まえ、壁打ちで以下を確定した。

### 案 A: 全 kind 帯（compute → store → job 一律）

**却下** — 依存 DAG を平坦化し deploy view の核を壊す。store は既にクラスタするので一部冗長。`realizes` container と競合。

### 案 C: job lane のみ（採用）

job-only container だけを Longest Path Layering の DAG から外し、専用の **job 帯** に集める。compute は依存 DAG のまま、store は自然に沈むので触らない。最小変更で観測された痛点（job の散らばり）を直撃する。

**メリット**

- 変更量が小さく、既存の層化ロジック（compute/store）に手を入れない。
- `realizes` ラベルを保持したまま job を一塊にできる。
- 候補 B（infra 帯の正式化）へ段階的に拡張できる。

**デメリット**

- 帯をまたぐ ghost edge（job が他サービス/infra に依存する稀ケース）のルーティングが必要。
- 「emergent な store 帯」と「明示的な job 帯」が混在し、帯の扱いが非対称（B で解消する余地）。

### 案 D: 視覚スイムレーンのみ

**却下** — 低リスクだが job の散らばり（本質的痛点）を解決しない。位置を動かさないため。

## 現時点の方針

**案 C を採用する** — job-only container を DAG から外して専用帯に集約する。compute/store の依存 DAG はそのまま。

**なぜ job だけで store を含めないか（C ≠ B の原則的根拠）**: job の DAG 位置は *accidental* — `realizes` 先ドメインの依存深度で決まるだけで、それ自体に意味がない（だから散らばって読めない）。一方 store の DAG 位置は *meaningful* — ADR-20260616-12 が意図的に service→infra 依存エッジを描いており、「どの service がどの store に依存するか」を層の近接で表す。store を帯に抜くとこの依存シグナルを捨ててしまう。つまり **job ≠ store**: job の帯化は無意味な配置を意味ある運用グループに変える純粋な改善だが、store の帯化は意味ある依存構造の破壊になる。これが候補 B を見送る根拠でもある。

壁打ちで以下を確定した。

1. **帯の判定単位**: container が **job-only**（その container のユニットが全て `kind === "job"`）なら帯対象。混在 container（job + 他 kind）は帯に入れず DAG に残す（`realizes` ラベル単位の一塊を崩さないため）。
2. **帯の位置**: compute/store の依存 DAG の **下**、`__unclassified__` row の **上**。運用系タスクが一塊で読める。
3. **依存エッジを持つ job container（稀）**: job-only である限り依存の有無に関わらず帯に集める。ghost edge は帯をまたいでルーティングする（帯の一貫性を優先、実装も単純）。
4. **帯の視覚表現**: 位置クラスタ化に加え、帯に軽いキャプションラベル（i18n、例「Scheduled jobs」）を付ける。`__unclassified__` がラベルを描画する前例に倣い「なぜ集まっているか」を読み取れるようにする。背景色・style-system 統合（#30）・視覚スイムレーン（候補 D）は本 PR では行わない（`data-kind-band="job"` 属性だけ出して将来に備える）。
5. **#1737 balanced-grid との順序**: #1737（同じ deploy-layout の同層内配置を触る、現在 `status: implementing`）の **マージ後**に実装する。共通化された同層内配置関数を再利用し、job 帯内の格子化を無償で得るとともにコンフリクトを避ける。

### 実装の指針

> 本設計（design doc）の合意後、別 worktree で実装する。以下は実装 PR の指針。

0. **前提（着手条件）** — #1737 のマージを待ち、その同層内配置関数の上に実装する（本 design doc の「#1737 依存」制約）。
1. **container への kind-band メタ付与** — `deploy-view-extract.ts` で各 container が job-only かを判定し、`DeployViewSlice` の container に `kindBand?: "job"` を持たせる（将来 `"infra"` 等に拡張可能な enum）。混在 container は付与しない。
2. **`deploy-layout.ts` の層化を 2 段に** —
   - `assignLayers` には **job-only でない** container だけを渡す（compute/store の DAG はそのまま）。
   - DAG 配置の最終 Y の下に **job 帯**を 1 つのバンドとして配置する。**#1737 が共通化する同層内配置関数をそのまま呼び**、barycenter / `MAX_LAYER_WIDTH` サブロー折り返し / balanced-grid を再利用する（帯専用の配置ロジックを複製しない）。
   - その下に従来どおり `__unclassified__` row。
3. **帯キャプション** — job 帯に i18n ラベル（例「Scheduled jobs」）を描画する。`__unclassified__` の `UNCLASSIFIED_LABEL` 描画に倣う。文言は `packages/i18n` に追加（en/ja）。
4. **型** — `layout-types.ts` の `ContainerRect`（必要なら `LayoutNode`）に `kindBand?` を追加（optional、後方互換）。SVG で `data-kind-band="job"` を出せるようにする（将来の style/visual band 用フックだが、本 PR では layout 配置 + キャプションのみ）。
5. **ghost edge** — 既存の edge-routing をそのまま使う。帯越しエッジが描けることをテストで担保。
6. **AT**: `docs/acceptance/1738-deploy-job-lane.md` を新規作成。TC 案:
   - job-only container が複数あるとき、全て同一帯（同じ Y バンド）に並ぶ。
   - compute（oci）container は従来どおり DAG 上段、store は下段に残る（job 帯導入で不変）。
   - job + 他 kind の混在 container は帯に入らず DAG に残る。
   - job container が他サービスに依存する場合でも帯に残り、ghost edge が描かれる。
   - 帯キャプションが描画される（en/ja 両ロケール）。
   - job を含まない `.krs` の描画が従来と不変（後方互換）。
   - e2e（`packages/e2e`）: deploy view で job 帯のノード群が compute 群より下・unclassified より上に来ることを `boundingBox` で検証（`at-0049-*` 流）。
7. **proactive TPL（実装 PR で同梱）** — 「kind ベースで一部 container を DAG から外して帯に移すとき、全ユニットが**ちょうど一度**配置される（drop / 重複なし）こと、帯をまたぐ ghost edge の端点が保たれること」を観点化する。`deriveInfraEdges` 共有（TPL-20260519-02）や scoped-glance（TPL-20260510-21）と関連付ける。
7. **ADR 昇格**: 実装完了後 `docs/adr/YYYYMMDD-NN-deploy-kind-band-job-lane.md` として昇格し、本 Design Doc は同 PR で削除する。ADR は ADR-20260408-02 / ADR-20260327-01 を `related_to` し、「kind による第二の階層化軸を job のみ導入」と明記する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: job を含む deploy view の縦配置が変わる（job が帯に集まる）。job を含まない図は不変。
- ドキュメント更新: `docs/spec/` に deploy view の記述があれば job 帯の挙動を追記（要確認）。`docs/concepts*.md` は論理/物理分離の原則のみで、帯は実装詳細のため原則更新不要。
- テスト・examples への影響: `deploy-layout.test.ts` に帯テストを追加。job を含む example（`hato` 系など）のスナップショットがあれば再生成。

## 未解決の問い / 決めないこと

壁打ちで以下を確定したため、当初の未解決 3 点のうち 2 点（視覚表現・#1737 順序）は「現時点の方針」に取り込んだ。残る意図的な非決定は 1 点のみ:

- **候補 B（store/infra 帯の正式コード化）は本設計では決めない** — store の DAG 位置は service→infra 依存という意味を持つ（上述 C ≠ B の根拠）ため、現状 emergent に沈むままで C が痛点を解消する。job 帯の運用実績を見てから B を別 Issue で評価する。
- **将来の視覚レイヤ**: 背景帯・色・style-system 統合（#30）・視覚スイムレーン（候補 D）は本 PR では行わない。`data-kind-band="job"` 属性を出すので、後から layout を再設計せずに視覚レイヤを足せる。

### 確定済み（参考: 当初の未解決から移動）

- **視覚表現** → 位置クラスタ + 帯キャプション（背景色なし）。
- **#1737 との順序** → #1737 マージ後に実装し、共通配置関数を再利用（帯内も格子化が効く）。
