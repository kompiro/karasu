# ADR-20260411-03: ブラウザ履歴でのハイライト復元 — hash コロン拡張

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #425, [ADR-20260409-03](20260409-03-atomic-highlight-on-cross-navigation.md), [ADR-20260404-05](20260404-05-browser-history-navigation.md)

## 背景

ADR-20260409-03 (#422) でクロスナビゲーション時のハイライトが適用されるようになったが、`highlightedNodeId` は URL hash に反映されないためブラウザバック/フォワードでハイライトが失われていた。例: D ボタン → Deploy 図でハイライト → 別ビューに移動 → 戻る → Deploy 図は復元されるがハイライトなし、となっていた。

## 決定

既存の hash 形式を拡張し、コロン区切りでオプションの `highlightNodeId` を付加する。

```
#krs-deploy:ECommerce        → activeView=deploy, highlightNodeId="ECommerce"
#krs-deploy                  → activeView=deploy, highlightNodeId=null
#krs-system-root             → activeView=system, viewPath=[], highlightNodeId=null
#krs-org-root:ecTeam         → activeView=org, viewPath=[], highlightNodeId="ecTeam"
```

`buildHash` / `parseHash` をコロン対応に拡張し、`useHistoryNavigation` フックは `highlightedNodeId` を入力として受け取り、state↔hash 双方向同期に含める。popstate 時も `parsed.highlightNodeId` を `SET_ACTIVE_VIEW` の `highlightNodeId` に渡す。

## 理由

- **hash 専用アーキテクチャとの整合**: 現アーキテクチャは `history.pushState` で hash のみを更新しており、hash 内で完結できる方式が最も自然
- **後方互換**: コロンなしの旧形式 `#krs-deploy` はハイライトなしとして解釈できる
- **実装コスト最小**: `buildHash` / `parseHash` の変更が最小限で済み、`SET_ACTIVE_VIEW` は既に `highlightNodeId` フィールドを持つ（ADR-20260409-03）ため呼び出し側の変更も少ない
- **URL 可読性**: `#krs-deploy:ECommerce` は見た目で内容が読み取れる

## 却下した案

### クエリパラメータ `?highlightNodeId=ECommerce#krs-deploy`

現アーキテクチャは `pushState` で hash のみを更新するため、クエリ文字列が後続のビューに漏れ続ける（`?highlightNodeId=ECommerce#krs-system-root` など）。これを防ぐには全 hash 更新でクエリも同時に管理する必要があり、実装複雑度が大幅に上がる。

### hash 全体を JSON でエンコード（`#{"view":"deploy","h":"ECommerce"}`）

既存の hash 形式との後方互換がなく、ADR-20260404-05 の設計を大きく崩す。
