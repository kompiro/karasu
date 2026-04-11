# ブラウザバック/フォワード時のハイライト復元 — hash 拡張

- **日付**: 2026-04-11
- **ステータス**: 完了
- **関連**:
  - [cross-nav-atomic-highlight.md](cross-nav-atomic-highlight.md) — クロスナビゲーション時のアトミックなハイライト（Issue #422）
  - [browser-history-navigation.md](browser-history-navigation.md) — URL hash ナビゲーション設計（Issue #278）
  - Issue #425 (本実装)

## 背景・課題

Issue #422 でクロスナビゲーション時のハイライト（D ボタン → Deploy 図、チームラベル → Org 図）が
正しく適用されるようになった。しかし `highlightedNodeId` は URL hash に反映されないため、
ブラウザバック/フォワードでハイライトが失われる。

**ユースケース**:

1. ユーザーが System 図の D ボタンをクリック → Deploy 図が開き、対応するサービスがハイライトされる
2. ユーザーが別ビュー（例: System）に移動
3. ブラウザの「戻る」ボタンを押す → Deploy 図が復元されるが**ハイライトがない**

## 制約・前提

- 現アーキテクチャは hash 専用ナビゲーション（`history.pushState` で hash のみ更新）
- `highlightedNodeId` の値は任意のノード ID 文字列（sanitize 前の生 ID）
- `SET_ACTIVE_VIEW` アクションはすでに `highlightNodeId?: string | null` フィールドを持つ（Issue #422 で追加済み）
- `parseHash` / `buildHash` は `useHistoryNavigation.ts` にエクスポート済みで単体テストが存在する

## 検討した選択肢

### 案1: クエリパラメータ（`?highlightNodeId=ECommerce#krs-deploy`）

クエリ文字列でハイライト ID を渡す。

**問題点**:

現アーキテクチャは `history.pushState` で hash のみを更新する。あるビューで
`?highlightNodeId=ECommerce#krs-deploy` の状態から次のビューに `pushState` すると、
クエリ文字列が後続のビューに**漏れ続ける**（例: `?highlightNodeId=ECommerce#krs-system-root`）。
これを防ぐには全ての hash 更新で `?highlightNodeId` も同時に管理する必要があり、実装複雑度が大幅に上がる。

→ **不採用**

---

### 案2: hash にコロン区切りでハイライト ID を付加（採用）

既存の hash 形式を拡張し、コロン区切りでオプションの `highlightNodeId` を付加する。

```
#krs-deploy:ECommerce          → Deploy 図、ECommerce をハイライト
#krs-system-root               → System 図、ハイライトなし
#krs-org-root:ecTeam           → Org 図、ecTeam をハイライト
#krs-deploy                    → Deploy 図、ハイライトなし（従来形式）
```

**メリット**:

- hash のみの変更で完結（クエリ文字列汚染なし）
- 既存の hash 形式と後方互換（コロンなし = ハイライトなし）
- `buildHash` / `parseHash` の変更が最小限
- `SET_ACTIVE_VIEW` に `highlightNodeId` フィールドがすでにあるため、呼び出し側の変更が少ない

**デメリット**:

- コロンが URL 的に若干異例（ただし hash 部分なので問題なし）
- `highlightedNodeId` と `nodeId`（ビューのパスナビゲーション用）が同時に存在する場合に
  `#krs-system-Payment:SomeHighlight` のような二重情報を持つ hash が生まれる

→ **採用**

---

### 案3: hash を JSON エンコード（`#{"view":"deploy","h":"ECommerce"}`）

hash 全体を JSON で表現する。

**問題点**: 既存の hash 形式との後方互換がなく、`browser-history-navigation.md` の設計を大きく崩す。

→ **不採用**

## 比較

| 観点 | 案1（クエリパラメータ） | 案2（hash コロン拡張） | 案3（JSON hash） |
|---|:---:|:---:|:---:|
| hash 専用アーキテクチャとの整合 | ✗ | ✅ | ✅ |
| 後方互換性 | △ | ✅ | ✗ |
| 実装コスト | 高 | 低 | 中 |
| クエリ文字列汚染リスク | あり | なし | なし |
| URL 可読性 | △ | ✅ | ✗ |

## 決定方針

**案2（hash コロン拡張）** を採用する。

hash 専用アーキテクチャへの適合度が最も高く、後方互換性も保たれる。
実装コストも最小。

## 実装設計

### hash 形式（拡張後）

```
#krs-deploy:ECommerce        → activeView=deploy, highlightNodeId="ECommerce"
#krs-deploy                  → activeView=deploy, highlightNodeId=null
#krs-system-root             → activeView=system, viewPath=[], highlightNodeId=null
#krs-org-root:ecTeam         → activeView=org, viewPath=[], highlightNodeId="ecTeam"
```

コロン（`:`）より後の部分が `highlightNodeId`。コロンがなければ `null`。

### `buildHash` の拡張

```ts
export function buildHash(
  activeView: ActiveView,
  viewPath: string[],
  isOrgTreeView = false,
  highlightNodeId?: string | null,
): string {
  let base: string;
  if (activeView === "deploy") base = "#krs-deploy";
  else if (activeView === "org" && isOrgTreeView) base = "#krs-org-tree";
  else {
    const prefix = activeView === "org" ? "org" : "system";
    base = viewPath.length === 0
      ? `#krs-${prefix}-root`
      : `#krs-${prefix}-${sanitizeId(viewPath[viewPath.length - 1])}`;
  }
  return highlightNodeId ? `${base}:${highlightNodeId}` : base;
}
```

### `parseHash` の拡張

```ts
export function parseHash(hash: string): {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
  highlightNodeId: string | null;
} | null {
  // コロン区切りで highlightNodeId を抽出
  const colonIdx = hash.indexOf(':', 1);
  let highlightNodeId: string | null = null;
  let base = hash;
  if (colonIdx !== -1) {
    highlightNodeId = hash.slice(colonIdx + 1) || null;
    base = hash.slice(0, colonIdx);
  }

  if (base === "#krs-deploy") return { activeView: "deploy", nodeId: null, isOrgTreeView: false, highlightNodeId };
  if (base === "#krs-org-tree") return { activeView: "org", nodeId: null, isOrgTreeView: true, highlightNodeId };
  const m = base.match(/^#krs-(system|org)-(.+)$/);
  if (!m) return null;
  const activeView = m[1] as "system" | "org";
  const nodeId = m[2] === "root" ? null : m[2];
  return { activeView, nodeId, isOrgTreeView: false, highlightNodeId };
}
```

### フック `useHistoryNavigation` の変更点

| 変更 | 内容 |
|---|---|
| 入力追加 | `highlightedNodeId: string \| null` を受け取る |
| Effect ③（state → hash） | `highlightedNodeId` を依存配列に追加し `buildHash` に渡す |
| Effect ①（初期 mount） | `parsed.highlightNodeId` を `SET_ACTIVE_VIEW` の `highlightNodeId` に渡す（ビューが変わる場合）、または `SET_HIGHLIGHTED_NODE` を dispatch する（ビューが同じ場合） |
| Effect ⑤（popstate） | `parsed.highlightNodeId` を同様に処理する |

### `AppShell` の変更点

`useHistoryNavigation` に `highlightedNodeId` を追加で渡す（state から取得済み）。
