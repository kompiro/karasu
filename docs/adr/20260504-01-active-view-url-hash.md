---
id: ADR-20260504-01
title: ActiveView を追加するときは URL hash 対応もセットで行う
status: accepted
date: 2026-05-04
topic: navigation
related_to:
  - ADR-20260502-01
scope:
  packages:
    - app
assumptions:
  - "file: packages/app/src/hooks/useHistoryNavigation.ts"
  - "file: packages/app/src/state/app-reducer.ts"
  - "symbol: packages/app/src/hooks/useHistoryNavigation.ts :: buildHash"
  - "symbol: packages/app/src/hooks/useHistoryNavigation.ts :: parseHash"
  - "symbol: packages/app/src/state/app-reducer.ts :: ActiveView"
---

# ADR-20260504-01: ActiveView を追加するときは URL hash 対応もセットで行う

- **日付**: 2026-05-04
- **ステータス**: 決定済み
- **関連**:
  - 起票理由となった bug: Issue [#1094](https://github.com/kompiro/karasu/issues/1094) / 修正 PR [#1106](https://github.com/kompiro/karasu/pull/1106)
  - 直前のビュー追加例: ADR-20260502-01（CRUD マトリクスビュー）

## 背景

CRUD マトリクスビューを `ActiveView` の 4 つ目として追加した際（PR #1073）、`DiagramTabBar` への配線は入れたが `useHistoryNavigation.ts` の `buildHash` / `parseHash` への対応が漏れた。結果として:

- CRUD タブを開いても URL hash が更新されず、ブラウザ back/forward で戻れない / リロードで失われる
- `buildHash` の else 分岐が prefix を `"system"` にフォールバックさせる構造だったため、`activeView === "matrix"` で **silent に `#krs-system-root` を emit** していた。popstate でこれを parse すると System に復元され、Matrix の選択が消える（silent semantic drift）

`grep` / typecheck では検出できない種類の漏れだった。`ActiveView` ユニオンに値を追加するだけでは TypeScript が `buildHash` の else 分岐を網羅しているように見せかけてしまうのが原因。

## 決定

`packages/app/src/state/app-reducer.ts` の `ActiveView` ユニオンに新しい値を追加する PR は、以下のチェックリストを **同一 PR で** 満たすこと。

### 必須チェックリスト

新しい `ActiveView = "<view>"` を追加する際に、以下をすべて含めること:

1. **`buildHash` に明示的な分岐を追加する**
   - hash の形は drill-down の有無で 2 系統:
     - drill-down なし: `#krs-<view>`（例: `#krs-deploy`, `#krs-matrix`）
     - drill-down あり: `#krs-<view>-<nodeId>` または `#krs-<view>-root`（例: `#krs-system-Payment`, `#krs-org-root`）
   - **else 分岐に頼らない**。explicit な `if/else if` を追加する。
   - highlight サフィックス（`:nodeId`）と `?file=...` クエリは既存ラッパーがそのまま処理するので追加コードは不要。

2. **`parseHash` に対応する case を追加する**
   - `if (base === "#krs-<view>") return { activeView: "<view>", nodeId: null, ... };` の形で追加。
   - drill-down ありの view は既存の `/^#krs-(system|org)-(.+)$/` 正規表現を拡張するか、新しい match を追加する。

3. **テストを `useHistoryNavigation.test.ts` に追加する**
   - 最低 3 つ:
     - `buildHash("<view>", [])` の戻り値
     - `parseHash("#krs-<view>")` の戻り値
     - `parseHash(buildHash("<view>", []))` の round-trip
   - drill-down ありの view は viewPath / nodeId のケースも追加。
   - highlight 付き / `?file=` 付きのケースも検討。

4. **`PreviewColumn` などのレンダリング側を確認する**
   - 新 view が drill-down を持たない場合は preview-toolbar / breadcrumb 等を skip する分岐を追加する（CRUD タブが参考実装）。
   - `activeView === "system" ? ... : "deploy" ? ... : orgView` のような既存の三項チェーンに新 view が落ちると意図しない描画になりうるので、early-return で隔離するのが安全。

5. **AT に hash 検証項目を入れる**
   - 新 view を追加する Issue の AT には「タブ切替で URL が更新される」「リロードで復元される」項目を含める。

### 推奨

- `buildHash` の **else 分岐は将来的に廃止を検討**する。すべての `ActiveView` を explicit case にすると、新 view 追加時に未対応がコンパイルエラーになる（TypeScript の網羅性チェックが効く）。本 ADR では強制しないが、次に `ActiveView` を触る PR でリファクタの機会があれば実施を推奨。

## 理由

- **silent な semantic drift を予防する**。`#krs-system-root` を勝手に emit して System に復元される挙動は、ユーザーから見て「タブが消えた」だけで、エラーも warning も出ない。同種の漏れを repeating issue にしないために、ADR でルールとして固定化する。
- **チェックリスト形式にする** ことで、レビュアーが「他に何が要るか」を ADR を読まずに判断できる。
- **テストの最低 3 件を明記** することで「どこまで書けば十分か」の議論を毎回しなくて済む。
- **else 分岐廃止の推奨** は immediate な作業強制ではなく方向性として残す。リファクタの機会に拾えば良い。

## 却下した案

### lint ルールで網羅性を強制する

`ActiveView` ユニオンに新メンバーを追加したら自動で `buildHash` / `parseHash` に case 追加を要求する custom lint rule。実装コストが大きい割に、`ActiveView` 追加は年に数回の頻度なので投資対効果が低い。ADR 参照と PR レビューで足りる範囲。

### `buildHash` を switch 文に書き換えて網羅性チェックさせる

TypeScript の `never` 型チェックで未対応 case を検出させる案。技術的には可能だが、ADR を出した直後にリファクタを強制するのはスコープ過大。次回 `useHistoryNavigation` を触る PR で機会があれば実施を推奨にとどめる（上記）。

### ADR ではなく `.claude/rules/` のルールファイルに記述する

`.claude/rules/` は Claude Code の自動化ルール（hooks / commit ガイドライン等）の配置場所として運用しており、人間レビュアー向けの設計判断は ADR が適切な配置先。クロスリンクが必要であれば `.claude/rules/app-ui.md` から本 ADR にリンクを貼る方向で運用する。

## Follow-up

- 次に `ActiveView` を追加する PR が来たタイミングで、`buildHash` を網羅性チェック付きの switch 文にリファクタする option を検討する（強制ではない）。
