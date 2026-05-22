---
id: ADR-20260429-03
title: 凡例 ref のフォールバック swatch（in-use なら描画する）
status: accepted
date: 2026-04-29
topic: styling
related_to: [ADR-20260322-01]
assumptions:
  - "file: packages/core/src/legend/usage.ts"
  - "symbol: packages/core/src/legend/usage.ts :: collectLegendUsage"
  - "symbol: packages/core/src/legend/usage.ts :: legendRefHasUsage"
  - "grep: packages/core/src/renderer/svg-builder.ts :: legendMuted"
---

# ADR-20260429-03: 凡例 ref のフォールバック swatch（in-use なら描画する）

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#999](https://github.com/kompiro/karasu/issues/999)（Investigate: `[human]` annotation does not appear in the legend）
  - 実装 PR [#1003](https://github.com/kompiro/karasu/pull/1003)
  - 関連 AT-0833（凡例構文の本体）, AT-0999（本変更の受け入れテスト）
  - 関連 ADR [ADR-20260322-01](./20260322-01-builtin-style-and-reference.md)（builtin スタイル + 構造化リファレンス）
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

karasu の凡例ブロック（`legend "凡例" { ref [human] "人間ユーザー" ... }`）には、resolver と renderer の判定に食い違いがあった:

- **resolver** (`packages/core/src/resolver/warnings.ts`): ref のターゲットが「実ノードに付いている」または「`.krs.style` に何らかの selector がある」なら resolved とみなし、`legend-ref-unresolved` 警告を出さない。
- **renderer** (`packages/core/src/renderer/svg-builder.ts`): `background-color` または `badge-color` を返すスタイル規則がある場合のみ swatch 色を返し、それ以外は `null` → entry を凡例から黙って除去。

`[human]` のように **意味的アノテーション**（`docs/spec/tags-annotations.md` で「No effect on default style」と明示）は、実ノードに付いていれば resolver は OK と判定するが、builtin に painting rule が無いため renderer が黙って drop する。ユーザーは警告も出ないのに凡例に出ない理由を見つけられない。

## 決定

renderer に **「in-use ならフォールバック swatch を描く」** ロジックを追加し、resolver と renderer の「ref が resolved か」の定義を一致させる。

- 新規モジュール `packages/core/src/legend/usage.ts` に `LegendUsage` 型 + `collectLegendUsage(file)` + `legendRefHasUsage(target, usage)` を集約し、resolver / renderer の双方から呼び出す（SSOT）。
- `buildLegendFooter` / `resolveLegendRefColor` に optional な `LegendUsage` を渡せるようにする。
- 解決チェーン:
  1. `.krs.style` に matching rule があり `background-color` / `badge-color` を持つ → その色を使う（**従来通り**）
  2. ref のターゲットが実ノードに付いている（`legendRefHasUsage(target, usage) === true`）→ neutral fallback swatch（legend muted text と同色）（**新挙動**）
  3. それ以外 → `null` → 凡例から drop（**従来通り。`legend-ref-unresolved` 警告が出る**）
- フォールバック色は legend 内の muted text に既に使っている色（`palette.legendMuted`）を流用し、別定数を新設しない。
- spec の `docs/spec/syntax.md` / `syntax.ja.md` の凡例「色の解決」節に汎用ルールとして追記。`tags-annotations.md` の `[human]` 行は触らない。

## 理由

- **cascade を一切触らない**: `[human]` に対して builtin スタイル規則を追加する案だと、tag selector の specificity (10) > 種別 selector (1) のため、ユーザーカスタム `user { ... }` が `[human]` 付きノードで上書きされる regression が発生する。フォールバックは凡例の描画にしか影響しないので、ノードの見た目は完全に保たれる。
- **resolver と renderer の判定を一致させる**: 同じ `legendRefHasUsage` ヘルパーを両方が呼ぶ形にし、「警告が出ないのに表示されない」という分かりにくい挙動を消す。
- **将来の semantic annotation にもそのまま効く**: `[ai]` や、ユーザーが自分で定義する意味的タグでも自動的に凡例に出る。個別の builtin 規則追加が要らない。
- **unresolved-ref drop の動作維持**: `@gone` のように実ノードにも `.krs.style` にも存在しない ref は従来通り drop され、AT-0833 系列の既存挙動を維持する。

## 却下した案

### 案 A: builtin に `[human]` 規則を追加
`[human] { background-color: #1D4ED8 }` を builtin に追加する。
- 却下理由: tag selector の specificity が種別 selector より高いため、ユーザーが `.krs.style` で `user` を再定義しても `[human]` 付きノードだけ builtin が勝つ regression が発生。spec の「No effect on default style」方針とも衝突。

### 案 B: resolver を strict にする
ref の resolved 判定から「実ノードに付いている」を外し、`.krs.style` に rule がある場合のみ resolved とみなす。
- 却下理由: ユーザーに「凡例に載せたいなら `.krs.style` に書け」と要求するのは user-hostile。`[human]` は spec で「style に影響しない」と書いているのに警告が出るのは二重に意味不明。

### 案 D: example から `ref [human]` を削除する
Getting Started の凡例ブロックから `ref [human]` を消す。
- 却下理由: 症状を隠すだけ。ユーザーが自分の `.krs` で同じことをすれば同じ問題が再発する。

## 影響範囲

| 領域 | 影響 |
| --- | --- |
| `packages/core/src/legend/usage.ts` (新規) | `LegendUsage` + `collectLegendUsage` + `legendRefHasUsage` |
| `packages/core/src/renderer/svg-builder.ts` | `buildLegendFooter` / `resolveLegendRefColor` シグネチャに optional `usage` を追加 |
| `packages/core/src/renderer/svg-renderer.ts`, `org-renderer.ts` | `RenderOptions` / `OrgRenderOptions` に `legendUsage?: LegendUsage` を追加 |
| `packages/core/src/renderer/deploy-renderer.ts` | 変更なし（`DeployRenderOptions extends RenderOptions` 経由） |
| `packages/core/src/resolver/warnings.ts` | `detectUnresolvedLegendRefs` をリファクタし `collectLegendUsage` を呼ぶ形に統一 |
| `packages/core/src/index.ts` | `compile()` で `collectLegendUsage(krsFile)` を一度作って 3 レンダラーへ流す |
| `docs/spec/syntax.md` / `syntax.ja.md` | 凡例「色の解決」節に汎用ルール 1 行追加 |
| `.krs` / `.krs.style` 構文 | 変更なし |
| 既存スナップショット | painting rule のあるエントリは bit-identical。新挙動は「ref が in use だが painting rule なし」というケースのみ |
