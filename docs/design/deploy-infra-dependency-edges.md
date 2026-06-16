# deploy view に service→infra 依存エッジを描く

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1658](https://github.com/kompiro/karasu/issues/1658)
  - PR: #（このあと採番）
  - 関連 ADR: [ADR-20260616-09](../adr/20260616-09-infra-physical-realize.md)（deploy unit が infra を realize / `store` kind）, [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（infra を論理層の first-class node へ）
  - 関連 Issue: [#423](https://github.com/kompiro/karasu/issues/423)（deploy diagram restructure — 根本モデル探索）
  - 関連 TPL: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（同一導出を2表現で持つときの drift）
  - コード: `packages/core/src/view/deploy-view-extract.ts`（`extractDeployView`）, `packages/core/src/view/view-extract.ts`（`deriveInfraEdges`）

## 背景・課題

[ADR-20260616-09](../adr/20260616-09-infra-physical-realize.md)（#1632）で deploy unit が共有 infra ノード
（`database` / `queue` / `storage`）を `realizes` できるようになり、`store` kind を新設した。`store` が
`database OrderDB` を realize すると、deploy view では `OrderDB` のコンテナ内に `store` ユニットが描かれる。

しかし **「その `OrderDB` に依存している service」から store への線は deploy view に描かれない**。
service が論理上 infra に依存する関係は system view では描かれる（`service → database` の合成エッジ）が、
deploy view には伝わらない。結果として「何が `OrderDB` を裏付けるか」は見えるが「誰が `OrderDB` に依存するか」が
物理図から読めない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| deploy view の ghost edge 導出 | `extractDeployView`（`deploy-view-extract.ts:97-108`）が **生の `system.edges`** のうち、両端が realize 先（deploy unit を持つ id）であるものだけを ghost edge にする |
| service→infra 依存の所在 | `deriveInfraEdges`（`view-extract.ts:192`、private）が usecase の `resource <Infra>.<Sub>` 参照を辿って `{from: service, to: infra}` の**合成エッジ**を作る。これは **system view slice** にのみ存在し、生の `system.edges` には無い |
| deploy レイアウト | `layoutDeploy`（`deploy-layout.ts`）が ghost edge を Longest Path Layering で層化。依存先（`to`）が下層に来る |
| ghost edge の表示条件 | 「両端が realize 済み」のときだけ描く（`realizesTargets` フィルタ） |
| infra-kind の集合 | `INFRA_KIND_SET`（`types/ast.ts`、#1648 で単一情報源化済み） |

なぜ伝わらないか: `extractDeployView` は引数として **生の `systems: SystemNode[]`** を受け取り、`system.edges`
だけを見る。`deriveInfraEdges` が作る合成エッジは view-extract 側で計算され、deploy view 側からは参照されない。

## 制約・前提

- **現モデル（service-as-container + ghost edge）の上で実装する**（[#423](https://github.com/kompiro/karasu/issues/423) で
  deploy view の根本モデル（層状 vs container）を見直す可能性があるが、本 Issue は現モデル上の改善とする）。
  ただし **service→infra 依存の *導出* はどちらのモデルでも必要**で、モデル依存なのは「ghost edge として描く」視覚部分のみ。
- **後方互換**: 既存 deploy view（infra を realize しないファイル）の描画は不変であること。
- **runtime-contract 層の境界**: 依存関係の可視化であり、トポロジ（リージョン/AZ/ノード）には踏み込まない。
- **out of scope**: infra 依存エッジを service→service とは別スタイルで描く視覚的差別化（将来の polish）。

## 検討した選択肢

### 案1: `extractDeployView` 内で service→infra 依存を再導出して ghost edge に加える（推奨）

`deriveInfraEdges` の中核（resource ref → `service→infra` ペア）を **export 可能な共有純関数**に切り出し、
`extractDeployView` がそれを `systems` から呼んで、得た合成エッジを既存の ghost edge 集合に合流させる。
既存の「両端 realize 済み」フィルタと layered layout はそのまま再利用する。

**メリット**

- system view と deploy view が **同じヘルパー**で依存を導出する → 2 表現の drift を防ぐ（[TPL-20260519-02]）。
- `extractDeployView` のシグネチャ変更なし（`systems` から導出できる）。呼び出し側 5 箇所を触らない。
- 既存の ghost edge フィルタ・layout を再利用 → 変更が小さく、store コンテナは依存先として自然に下層へ。

**デメリット**

- 依存導出を「2 回」走らせる（system view 用と deploy view 用）。ただし純関数で安価、view ごとに 1 回。

### 案2: 計算済みの system view slice の合成エッジを `extractDeployView` に渡す

system view 構築時に得た合成 `service→infra` エッジを、引数として `extractDeployView` に渡す。

**メリット**

- 導出が 1 回で済む。

**デメリット**

- `extractDeployView` のシグネチャ変更 + 呼び出し側 5 箇所（`index.ts` ×3, `drill-down-svg.ts`, `build-drawio-project.ts`）の配線変更。
- deploy view が system view の中間生成物に結合し、独立性が下がる。view slice のどのエッジ集合を渡すかの取り回しが煩雑。

## 比較

| 観点 | 案1 再導出（共有ヘルパー） | 案2 slice を渡す |
| --- | --- | --- |
| 変更量 | 小（ヘルパー export + extractDeployView 内 ~10 行） | 中（signature + 呼び出し 5 箇所） |
| drift 耐性 | ◎（単一ヘルパー） | ○（同一データだが配線依存） |
| view 独立性 | ◎ | △（deploy が system slice に結合） |
| 計算回数 | view ごと 1 回（純関数で安価） | 1 回 |

## Related TPLs

- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — 同じ依存導出を system view と deploy view の 2 箇所で持つと drift する。共有ヘルパー化 + 両 view が同じ結果を返す parity テストでフェンスする。
- [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) — 合成エッジの「両端 realize 済み」表示条件は AST→view→layout で一貫させる。

## 現時点の方針

**案1 を採る。** `deriveInfraEdges` の中核を共有ヘルパー（例: `deriveServiceInfraEdges(children)` を
`view-extract.ts` から export、または `view/infra-edges.ts` に移動）にし、`extractDeployView` がそれを呼んで
合成 `service→infra` エッジを ghost edge 集合に合流させる。

決定事項（Issue の design questions への回答）:

- **両端 realize 必須**: service も infra も deploy unit を持つときだけエッジを描く（既存 service→service ghost edge と一貫）。
  片方しか realize されていなければエッジは出ない（コンテナが無いので自然に脱落）。
- **視覚**: 既存 ghost edge スタイルを流用。infra 依存を別スタイルにするのは out of scope（将来 polish）。
- **#423 との関係**: 中核の依存導出はモデルに依らず必要なので今実装する。ghost edge という *見せ方* は現モデル前提で、
  #423 が層状モデルへ移行する場合は視覚部分のみ再検討対象（導出ヘルパーは流用可能）と明記する。

### 実装の指針

1. `view-extract.ts`: `deriveInfraEdges`（private）を **export された共有純関数**に切り出す
   （`children: KrsNode[] → KrsEdge[]` のまま、または `{from, to}[]` を返す軽量版）。view-extract 自身も同じ関数を使い続ける。
2. `deploy-view-extract.ts` `extractDeployView`: `systems` の各 system について共有ヘルパーで `service→infra` エッジを導出し、
   既存の ghost edge ループに合流させる（同じ「両端 realize 済み」フィルタを適用）。重複は `from->to` キーで dedup。
3. テスト:
   - `deploy-view-extract.test.ts`: store が realize する infra に、別の service（realize 済み）が依存しているとき ghost edge が出る / 片方しか realize されていないと出ない。
   - parity: system view と deploy view が同じ `service→infra` 集合を導出することを 1 ソースから確認（共有ヘルパー）。
4. AT: `docs/acceptance/1658-deploy-infra-dependency-edges.md` — `service ECommerce`（usecase が `resource OrderDB.OrderTable`）+ `store` が `OrderDB` を realize + `oci` が `ECommerce` を realize する `index.krs` で、deploy view に ECommerce コンテナ→OrderDB コンテナの ghost edge が描かれる。
5. ADR 昇格: 実装 PR で `docs/adr/<番号>-deploy-infra-dependency-edges.md` に昇格し本 Design Doc を同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: infra を realize しないファイルは ghost edge 集合が変わらず**不変**。infra を realize するファイルでのみ新規エッジが増える（前方互換）。
- ドキュメント更新: `docs/spec/syntax.md` の deploy 節に「realize された infra への service 依存が deploy view に描かれる」旨を 1 行追記（任意）。
- テスト・examples への影響: deploy view テスト追加。ec-platform 等に実例を足すかは任意。

## 未解決の問い / 決めないこと

- infra 依存エッジを service→service と視覚的に区別するか（別色/別ラベル）→ 今回は区別せず、必要なら follow-up。
- #423 が層状モデルを採用した場合の ghost edge の扱い → #423 側で決める。本 Issue は導出ロジックを提供する位置づけ。
