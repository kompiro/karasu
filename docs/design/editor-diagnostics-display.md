# Editor Diagnostics Display

- **日付**: 2026-03-26
- **ステータス**: 検討中
- **関連**: [ADR-0047](../adr/0047-interactive-svg-rendering.md) — インタラクティブ SVG レンダリング

## 背景・課題

構文エラー（Diagnostic）は現在 PreviewPane の左下にオーバーレイ表示（`diagnostic-banner`）されるが、
ユーザーは Editor を見ながら入力するため気づきにくい。

また、致命的パースエラー時も前回の正常状態の図を保持するため、
入力に問題が起きていることに気づかないまま編集が続くケースがある。

## 制約・前提

- `Diagnostic`（パーサー由来）と `Warning`（リゾルバー由来）は役割が異なる
  - `Diagnostic`: 構文の問題 → **Editor の問題**
  - `Warning`: 設計上の懸念（domain-dispersal, style-conflict など） → **Diagram の問題**
- `Diagnostic.loc` は行・列ともに正確に追跡されている（Lexer が 1 文字単位で追跡）
  - UI は現在 `line` のみ表示しており `column` は未使用だが、Monaco マーカー API に渡せる
- EditorPane は `@monaco-editor/react` を使用しており、`setModelMarkers()` API で波線を引ける
- diagnostic-banner は新しい仕組みが安定するまで残す

## 検討した選択肢

### 案1: Monaco マーカー（スクイグル）のみ

`setModelMarkers()` で行・列精度の波線を Editor に表示。ホバーでメッセージ。

- メリット: IDE として自然。行・列レベルで正確に位置を示せる
- デメリット: Preview 側で気づく手段がなくなる（diagnostic-banner を残す間は問題なし）

### 案2: Preview エラーオーバーレイ

`error` / `warning` severity の Diagnostic がある場合、Preview を半透明暗転して
エラーアイコン＋件数を表示する。前回の図は透けて参照できる。

- メリット: 致命的エラー時に「壊れている」ことが一目でわかる
- デメリット: warning 時も暗転するので、軽微な warning で常にオーバーレイが出ることに注意

### 案3: Problems パネル（Editor 下部のエラー一覧）

Diagnostic を Editor ペインの下に常時一覧表示。クリックでジャンプ。

- メリット: 全エラーを一覧で確認できる
- デメリット: WarningPanel との役割の使い分けがユーザーに伝わりにくい（VS Code でも起きている問題）
  → 今回は採用しない

## 採用方針

案1（Monaco マーカー）と案2（Preview オーバーレイ）を組み合わせる。

```
[EditorPane]
  ← Diagnostic[] を prop で受け取る
  ← setModelMarkers() で行・列精度の波線
  ← ホバーでエラーメッセージ tooltip

[PreviewPane]
  ← Diagnostic に error/warning がある場合、半透明暗転オーバーレイを表示
  ← アイコン＋件数（例: ⛔ 2 errors, 1 warning）
  ← diagnostic-banner は当面維持
```

### オーバーレイの発動条件

- `error` severity: オーバーレイ表示（致命的エラー）
- `warning` severity: オーバーレイ表示（VS Code など一般的な IDE でも見られる挙動）
- 両方なし: オーバーレイなし

### データフロー変更

```
[useKarasu / useOrgView]
  diagnostics: Diagnostic[]
        ↓
[App コンポーネント]
  ├─ EditorPane: diagnostics prop を追加
  └─ PreviewPane: 既存の diagnostics prop（変更なし）
```

EditorPane 側での実装:
- `useEffect` で `diagnostics` が変化するたびに `setModelMarkers()` を呼ぶ
- Monaco の severity: `error` → `MarkerSeverity.Error`, `warning` → `MarkerSeverity.Warning`
- loc の `column` は 1-based（Lexer が 1-based で追跡、Monaco も 1-based）なのでそのまま渡せる

## 未解決の問い

- WarningPanel（`Warning` 型）の `loc` フィールドも未表示。別 Issue で対応予定
- diagnostic-banner をいつ削除するか（新仕組み安定後に判断）
