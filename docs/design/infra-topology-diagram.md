# インフラトポロジーダイアグラム

- **日付**: 2026-04-14
- **ステータス**: レビュー待ち
- **関連**:
  - Issue #28
  - Issue #27 (deploy diagram — 本ドキュメントはここからスコープアウトされた領域を扱う)
  - `packages/core/src/parser/parser.ts`
  - `packages/core/src/renderer/deploy-renderer.ts`
  - `packages/app/src/components/DiagramTabBar.tsx`

## 背景・課題

karasu は現在 3 種類のダイアグラムを持つ: `system`（論理）、`deploy`（コード/ランタイムユニット）、`org`（組織）。`deploy` は「どのコード成果物がどのランタイムで動くか」を表すが、以下の情報は表現できない:

- prod / staging / dev など環境ごとの差異
- リージョン・アベイラビリティゾーン・クラスタといった物理的な入れ子構造
- 「本番は 3 AZ マルチリージョン、ステージングは単一 AZ」のような構成差

これらは Issue #27 で deploy 図からスコープアウトされ、Issue #28 として切り出された。インフラチームやオンコール担当者が「どこで何が動いているか」を俯瞰するための別レイヤーが必要。

## 制約・前提

- **既存の命名衝突**: parser.ts:42 の `INFRA_BLOCK_KINDS` は既に `database` / `queue` / `storage` の system 配下ノードに使われている。新ブロックに `infra` キーワードは使えない。
- 既存の `system` / `deploy` / `org` と直交した第 4 の diagram type として実装する（既存ダイアグラムに後付けで環境概念を挿入しない）。
- パーサーは手書き再帰下降。新ブロック追加は既存の `parseDeployBlock` パターンに倣う。
- レンダラーは diagram type ごとにモジュール分割されており、新規 `topology-renderer.ts` を追加する方針で統一できる。
- MVP は単一ダイアグラムの描画にフォーカスし、環境切り替え UI は V2 に回す。

## 提案

### 1. キーワード: `topology`

`infra` は既存用途と衝突するため、新ブロックのキーワードは **`topology`** とする。ユーザーに対しても「インフラトポロジーダイアグラム」と呼ぶ。

### 2. 構文（最小案）

```krs
topology prod "Production" {
  region us-east-1 {
    az us-east-1a {
      cluster main-k8s {
        node api-pool {
          hosts ApiServer
          hosts Worker
        }
      }
    }
    az us-east-1b {
      cluster main-k8s {
        node api-pool {
          hosts ApiServer
        }
      }
    }
  }
}

topology staging "Staging" {
  region us-east-1 {
    az us-east-1a {
      cluster main-k8s {
        node api-pool {
          hosts ApiServer
        }
      }
    }
  }
}
```

**ノード種別**（いずれも同じネスト可能コンテナ。種別はレンダリング時の装飾に使う）:

| Keyword | 意味 |
| --- | --- |
| `topology <id> "label"` | トップレベル（環境単位を想定するが強制はしない） |
| `region <id>` | 地理リージョン |
| `az <id>` | アベイラビリティゾーン |
| `cluster <id>` | K8s / ECS / オンプレ等のクラスタ |
| `node <id>` | 実行単位（ノードプール、VM、ベアメタル等） |

**`hosts <DeployUnitId>`**: ノード内に deploy ブロックで定義した unit ID を参照する。これにより topology 図は deploy 図の「どこで」を補完する役割を持つ。未定義 ID はパース時に warning。

**ネスト規則（MVP）**: `topology > region > az > cluster > node > hosts` の順序を推奨するが、パーサーとしては「任意の topology 子を任意の深さで許容」する（厳格な階層検証は V2）。これにより region を飛ばした簡易記述や、AZ を持たないオンプレ環境も表現可能。

### 3. 環境差分の扱い（MVP の割り切り）

prod と staging を「オーバーレイ」で表現せず、**独立した `topology` ブロック**として並記する方針を採る。理由:

- オーバーレイ構文を設計すると意思決定コストが大きく、Issue #28 のゴール（まず図を出す）から外れる
- 現実のインフラでは環境間で構造がそもそも異なる（AZ 数、リージョン数）ことが多く、差分表現より独立記述の方が書きやすい
- 重複が問題になったら後から `extends` や変数化を検討できる

### 4. レンダリング

- `packages/core/src/view/topology-view-extract.ts` — AST から `TopologyViewSlice` を抽出（deploy と同じパターン）
- `packages/core/src/renderer/topology-renderer.ts` — SVG を生成。入れ子矩形 + ラベル、`hosts` リンクは deploy ユニット ID のテキスト表示（MVP）
- `packages/core/src/index.ts:_compileCore` に `diagramType === "topology"` 分岐を追加
- 複数 topology ブロックが存在する場合、MVP では **全ブロックを縦並びで 1 つの SVG に描画**する（タブ切り替えは V2）

### 5. UI タブ

- `ActiveView` union に `"topology"` を追加（`packages/app/src/state/app-reducer.ts`）
- `DiagramTabBar.tsx` に Topology タブを追加。`hasTopologyDiagram` で存在判定しタブの有効/無効を切替
- `useTopologyView()` フックを `useDeployView` に倣って追加

### 6. 作業分解

1. **AST & 型定義**: `TopologyBlock`, `TopologyNode`, `HostsLink` を `packages/core/src/types/ast.ts` に追加
2. **Lexer / Parser**: `topology` / `region` / `az` / `cluster` / `node` / `hosts` のキーワード追加、`parseTopologyBlock()` 実装
3. **View extract**: `extractTopologyView()` — ノードツリーを平坦化しつつ階層情報を保持
4. **Renderer**: 入れ子矩形の再帰レイアウト（既存 layout.ts を流用検討）
5. **Compile dispatch**: `_compileCore` に分岐追加
6. **App UI**: タブ追加 + フック
7. **Example**: `examples/topology/` に prod/staging 並記のサンプルを追加
8. **Docs**: `docs/spec/syntax.md` / `docs/concepts.md` に topology セクションを追加

## 代替案

- **A. `deploy` ブロックを拡張して環境・リージョン概念を後付け** — 却下。deploy は「ユニット→ランタイム」マッピングに責務を限定したほうが読みやすく、既存ユーザーの図を壊す。
- **B. `environment` を最上位にし、その内部に deploy + topology を持たせる** — 却下。2 つの diagram type を絡めると設計コストが大きく、MVP のゴールから外れる。将来 environment overlay を入れる余地は残る。
- **C. キーワードを `infra` にし、既存の `INFRA_BLOCK_KINDS` をリネーム** — 却下。破壊的変更で既存 `.krs` を壊す。`topology` の方が意味も正確。

## アクセプタンステスト

`docs/acceptance/` に以下を追加する:

- **AT-topology-basic**: 1 つの `topology` ブロックをパースし、region → az → cluster → node の入れ子矩形が SVG に描画される
- **AT-topology-multi-env**: `topology prod` と `topology staging` を並記したファイルがパースでき、preview の Topology タブで両方描画される
- **AT-topology-hosts-link**: `hosts ApiServer` が deploy ブロックの `ApiServer` ユニットを参照し、未定義 ID の場合 warning が出る
- **AT-topology-tab-toggle**: topology ブロックを含まないファイルでは Topology タブが disabled、追加すると有効化される（人間確認項目）

## 未決事項 / V2 送り

- 環境切り替え UI（prod/staging のセレクタ）
- `hosts` のクリックで deploy タブへナビゲート
- 階層順序の厳格検証
- スタイルオーバーライド（`.krs.style` での topology 対応）
- ネットワーク境界・VPC・サブネット・ロードバランサーの表現
