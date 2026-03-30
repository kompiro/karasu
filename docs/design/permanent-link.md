# Permanent Link — org→system Navigation for Domain-Owned Services

- **日付**: 2026-03-30
- **ステータス**: 検討中
- **関連**: [Issue #110](https://github.com/kompiro/karasu/issues/110), [Issue #92](https://github.com/kompiro/karasu/issues/92)

## 背景・課題

Issue #110 では、org ビューのチームカードに表示される `owns` リスト内のドメイン名をクリックしたとき、そのドメインの詳細ビューへ直接ナビゲートしたい、というユーザー要求がある。

現状の問題:

1. **逆引きインデックスがない**: `ownerIndex` は `serviceId → teamId` の単方向マップのみ。`nodeId → viewPath`（例: `EC → ["Payment", "EC"]`）の逆引き手段がない。
2. **ナビゲーション先が曖昧**: system 階層内でノード ID の一意性が保証されていないため、`EC` という ID だけではどのビューパスに対応するか特定できない可能性がある。
3. **永続化できない**: 現在のビュー状態（`activeView + viewPath`）は URL に反映されないため、特定のビューへのリンクを共有・復元できない。

Issue #110 が解決しようとするのは主に (1)(2) だが、将来の共有リンク機能も見据えると (3) も同時に設計スコープに含める価値がある。

## 制約・前提

- `packages/core` は Pure TS（DOM 非依存）であり、ナビゲーション状態の管理は `packages/app` の責務
- 現在の `viewPath: string[]` はすでに階層パスの考え方を持っている（例: `[]` = system, `["Payment"]` = Payment サービスビュー, `["Payment", "EC"]` = EC ドメインビュー）
- `owns` リストに登場する ID は現在フリーテキストであり、パーサーは system 階層との整合性を検証しない
- ブラウザ環境（`packages/app`）では URL hash（`location.hash`）が利用可能

## 解決すべき論点

設計は次の 2 つの独立した問題に分解できる。

### 論点 A: nodeId → viewPath の解決方法

`owns: EC` をクリックしたとき、`EC` が system 階層のどこにあるかを特定する手段が必要。

### 案 A-1: `core` にノードパスインデックスを追加

`packages/core` のパース後処理として、`nodePathIndex: Map<string, string[]>` を `KrsFile` に追加する。

```ts
// KrsFile への追加フィールド
nodePathIndex: Map<string, string[]>;
// 例: "EC" → ["Payment", "EC"]
//     "Payment" → ["Payment"]
```

ビルド方法:

```ts
function buildNodePathIndex(systems: SystemNode[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  function walk(node: KrsNode, path: string[]) {
    const currentPath = [...path, node.id];
    index.set(node.id, currentPath);
    for (const child of node.children) walk(child, currentPath);
  }
  for (const system of systems) {
    // system 自体は path に含めない（viewPath の先頭は system の子から始まる）
    for (const child of system.children) walk(child, []);
  }
  return index;
}
```

- **メリット**: `app` 側のロジックがシンプル。`owns: EC` クリック時に `index.get("EC")` するだけ。
- **デメリット**: 同一 ID が複数箇所に存在すると最後の書き込みで上書きされ、サイレントに誤ナビゲートする。

### 案 A-2: `app` 側でオンザフライ検索

パース結果は変更せず、`app` 側でクリック時に system 階層を再帰検索する。

```ts
function findNodePath(systems: KrsNode[], targetId: string): string[] | null {
  function walk(node: KrsNode, path: string[]): string[] | null {
    const current = [...path, node.id];
    if (node.id === targetId) return current;
    for (const child of node.children) {
      const found = walk(child, current);
      if (found) return found;
    }
    return null;
  }
  for (const system of systems) {
    for (const child of system.children) {
      const found = walk(child, []);
      if (found) return found;
    }
  }
  return null;
}
```

- **メリット**: `core` の型定義・パーサーを変更しない。
- **デメリット**: 毎回 O(n) 探索。`app` と `core` の責務が混在する。

### 案 A-3: `owns` に完全パス参照を許容する構文拡張（採用しない）

`.krs` の `owns` に `service/domain` 形式のパス参照を追加する。

```
team backend {
  owns: Payment/EC  # パス形式
}
```

- **メリット**: 曖昧さが構文レベルで排除される。
- **デメリット**: 破壊的な構文変更。既存の `.krs` ファイルとの互換性を壊す。Issue #110 のスコープを大幅に超える。
- **採用しない理由**: 実際には「異なるサービスが同名の決済ドメインを持つ」ケースでも、各ドメインに異なる ID を設定し（例: `PaymentCore`, `OrderPayment`）、`label` で共通の表示名（例: `"決済"`）を付けることで対処できる。ID の一意性はユーザーの設計責務であり、構文を拡張して強制する必要はない。

---

### 論点 B: 永続リンクの形式

特定のビュー状態（`activeView` + `viewPath`）をエンコードする形式。

### 案 B-1: URL hash (`location.hash`)

```
#system/Payment/EC   → activeView=system, viewPath=["Payment","EC"]
#org/backend         → activeView=org, orgPath=["backend"]
#deploy/production   → activeView=deploy, selectedDeployBlockId="production"
```

- **メリット**: サーバー不要。ページリロードで状態復元。共有可能。ブラウザ履歴に乗る。
- **デメリット**: アプリ起動時に hash を解析して状態を初期化するロジックが必要。

### 案 B-2: AppState のフィールドのみで完結（URL 非使用）

永続リンクとは呼ばず、単に「org ビューのクリックが system ビューのナビゲーションを呼び出す」だけにする。

```ts
dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
dispatch({ type: "SET_VIEW_PATH", path: ["Payment", "EC"] });
```

- **メリット**: 最小変更。Issue #110 の要求を満たす最短経路。
- **デメリット**: 「永続リンク」の性質がなく、リロードで状態が消える。Issue タイトルの "permanent link" の意図に反する可能性。

### 案 B-3: URL search params

```
?view=system&path=Payment,EC
```

- **メリット**: 構造が明示的でデバッグしやすい。
- **デメリット**: Vite + React SPA ではサーバー側のルーティング設定が必要になる場合がある。hash よりも変更コストが高い。

## 比較

| | A-1 (core にインデックス) | A-2 (app でオンザフライ検索) | A-3 (構文拡張) |
|---|---|---|---|
| core への変更 | KrsFile フィールド追加 | なし | パーサー・型変更 |
| app への変更 | lookup のみ | 再帰検索実装 | lookup のみ |
| ID 重複時の動作 | warning + 最初のパス採用 | 最初のマッチ | 構文エラー |
| 将来の拡張性 | ◎ | △ | ◎（ただしコスト高） |
| 採用 | **採用** | — | **採用しない** |

| | B-1 (URL hash) | B-2 (状態のみ) | B-3 (search params) |
|---|---|---|---|
| Issue #110 の要求 | ◎ | ◯（要確認） | ◎ |
| 実装コスト | 中 | 低 | 中〜高 |
| リロード後の復元 | ◯ | ✗ | ◯ |
| SPA との相性 | ◎ | ◎ | △ |

## 現時点の方針

**A-1（core にインデックス追加）+ B-1（URL hash）** の組み合わせを推奨する。

理由:
- A-1 は `ownerIndex` と同じ設計パターンで一貫性がある。パース時に一度構築すれば検索コストがゼロ。
- B-1 は Issue タイトルの「permanent link」という意図に最も合致し、将来の共有リンク機能の基盤になる。
- 両者とも段階的に実装でき、A-1 → B-1 の順で独立して PR を分割できる。

### Phase 1: nodePathIndex の実装（A-1）

1. `packages/core` に `buildNodePathIndex()` を追加し、`KrsFile.nodePathIndex` フィールドとして公開
2. ID の一意性・存在確認チェックを 3 段階で実装する（すべて `nodePathIndex` 構築と同時に行う）:
   - **同一 parent の children 内での重複** → `error`（team ID の重複と同じ扱い）
   - **異なるスコープ間（例: `Payment/EC` と `Order/EC`）での重複** → `warning`（`nodePathIndex` では最初のパスを採用）
   - **`owns` に記載された ID が system 階層に存在しない** → `warning`（未解決参照）
3. `owns: EC` クリック時に `nodePathIndex.get("EC")` でパスを解決し、`SET_ACTIVE_VIEW + SET_VIEW_PATH` を dispatch

### Phase 2: URL hash による永続リンク（B-1）

1. `AppState` から URL hash へのシリアライズ関数と、hash から `AppState` への復元関数を実装
2. アプリ起動時に hash を解析して初期ビュー状態を設定
3. ビュー状態変化時に hash を更新

## 未解決の問い

なし。すべての論点は方針が固まった。
