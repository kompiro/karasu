---
id: ADR-20260326-03
title: "Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ"
status: accepted
date: 2026-03-26
topic: app-ui
depends_on:
  - ADR-20260320-01
scope:
  packages:
    - app
  domains:
    - ui
    - diagnostics
---

# ADR-20260326-03: Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ

- **日付**: 2026-03-26
- **ステータス**: 決定済み
- **関連**: [ADR-20260320-01](20260320-01-interactive-svg-rendering.md)

## 背景

構文エラー（`Diagnostic`）は従来 PreviewPane の左下に `diagnostic-banner` としてオーバーレイ表示されていたが、ユーザーは Editor を見ながら入力するため気づきにくかった。また致命的パースエラー時も前回の正常状態の図を保持するため、入力に問題が起きていることに気づかないまま編集が続くケースがあった。

`Diagnostic`（パーサー由来）と `Warning`（リゾルバー由来）は役割が異なる：

- `Diagnostic` → **Editor の問題**（構文）
- `Warning` → **Diagram の問題**（設計上の懸念）

## 決定

Monaco マーカー（案1）と Preview エラーオーバーレイ（案2）を組み合わせる。

### 1. Monaco マーカー（スクイグル）

`EditorPane` が `Diagnostic[]` を prop で受け取り、`useEffect` で変化するたびに `setModelMarkers()` を呼んで行・列精度の波線を引く。ホバーでエラーメッセージを表示する。

- `error` severity → `MarkerSeverity.Error`
- `warning` severity → `MarkerSeverity.Warning`
- `Diagnostic.loc.column` は Lexer が 1-based で追跡しており Monaco も 1-based のためそのまま渡せる

### 2. Preview エラーオーバーレイ

`error` または `warning` severity の Diagnostic がある場合、Preview を半透明暗転して「⛔ 2 errors, 1 warning」のようなアイコン + 件数を表示する。前回の図は透けて参照できる。

### 3. `diagnostic-banner` は当面維持

新仕組みが安定するまで既存のバナー表示を残す。削除タイミングは別途判断する。

## 理由

- **IDE としての自然さ**: Monaco マーカーは行・列レベルで正確に位置を示せ、「この箇所にエラーがある」が直感的に伝わる
- **致命的エラー時の気づき**: Preview を暗転することで「壊れている」ことが一目でわかる。前回の図が透けて見えるので編集の文脈も失わない
- **Lexer の column 情報活用**: すでに 1 文字単位で追跡されている column 情報を、Monaco へそのまま渡せる
- **両者の組み合わせ**: Editor と Preview の両方で問題が見えることで、どちらのペインを見ていてもエラーに気づける

## 却下した案

### 案3: Problems パネル（Editor 下部のエラー一覧）

Diagnostic を Editor ペインの下に常時一覧表示する案。`WarningPanel` との役割の使い分けがユーザーに伝わりにくい（VS Code でも同じ問題が起きている）ため採用しない。

## 残課題

- `WarningPanel` の `Warning.loc` フィールドも未表示。別 Issue で対応予定
- `diagnostic-banner` の削除タイミングは新仕組み安定後に判断
