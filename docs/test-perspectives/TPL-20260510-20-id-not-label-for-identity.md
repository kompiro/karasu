---
id: TPL-20260510-20
title: "identity 判定 / 比較 / 集約のキーには `id` を使い、`label` などの表示・翻訳文字列を使わない"
status: active
date: 2026-05-10
applicable_to:
  - "ノード / エッジ / 任意のモデル要素について「同じものか」を判定する resolver / detector / aggregator"
  - "重複検出 / クロスファイル参照 / マージ / グルーピングなど、要素の同一性に依存する処理"
  - "i18n 対象の文字列（`label` / annotation 表示名 / メッセージ）を扱うコード"
known_consumers:
  - resolver
  - warnings
  - view-extract
related_to:
  - TPL-20260510-10
  - TPL-20260510-07
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260510-20: identity 判定 / 比較 / 集約のキーには `id` を使い、`label` などの表示・翻訳文字列を使わない

## 観点

karasu のノードには **`id`（識別子）** と **`label`（表示名）** の責務分離がある。`id` は安定した識別子であり、`label` は人間に見せる表示文字列で、**翻訳・略称変更・表記ゆれが起こりうる** 性質を持つ（`docs/concepts.ja.md` 「ドメイン分散の検出 → 検出キー」）。

identity（同一性）に依存する処理 — 重複検出 / クロスファイル参照 / マージ / グルーピング / 警告の発火条件 — は **必ず `id` を比較する** 設計でなければならない。`label` を identity 判定に混ぜると、

- i18n でユーザーが日本語ラベルから英語ラベルに切り替えた瞬間、同一性が壊れる
- 略称を整える PR で identity が変わり、関連 warning が一斉に消える / 出る
- 表記ゆれ（全角/半角、空白、大小）で意図しない別物扱いになる
- export / import / round-trip で `label` が変質すると identity が追跡不能になる

ドメイン分散検出（`Order` が複数 service にまたがる）が `id` で判定するのは、まさにこの理由による。同じ原則を、新しい detector / resolver / aggregator を実装するときにも適用する必要がある。

## 想定される失敗モード

- 翻訳変更 / 略称改名で **過去の警告が突然消えたり / 突然出始めたり** する。コードの本質は変わっていないのに
- ラベルだけ違う「同じ id のノード」を **別物として集計** する（dispersion 検出が機能しない、aggregation が分裂する）
- 逆に、`id` は違うが `label` がたまたま一致する別ノードを **同一視** してしまう（false positive）
- export / format の round-trip で `label` が変わると identity が壊れる（→ TPL-02 round-trip と関連）

## チェックリスト

identity に関わる処理を実装・修正するとき、以下を確認する:

- [ ] 比較・集約・グルーピング・重複検出・参照解決のキーに **`id` のみ** を使っているか。`label` / annotation の表示部分 / 翻訳済み文字列を混ぜていないか
- [ ] cross-file / cross-system で参照を辿るときも `id` ベースか（`SystemId.ServiceId` のドット記法も id ベース）
- [ ] テストに **「`id` 同じ / `label` 違い」** と **「`id` 違い / `label` 同じ」** の両方の fixture が含まれているか。前者は同一視、後者は別物扱いされること
- [ ] i18n 経由で表示文字列を切り替えた状態でも、identity 系の処理結果が変わらないことを確認したか
- [ ] エラーメッセージや warning 文中に `id` を含めているか（`label` だけだとユーザーが「どのノードか」を辿れない）

## 既知の対処パターン

- detector / resolver の関数シグネチャを **`(id: string, ...)`** で書き、`label` を引数に取らない。`label` が必要なのは「警告メッセージに表示するため」だけで、判定ロジックの入力にはしない
- ノード型は `id: string` を required、`label?: string` を optional にしておき、resolver は `node.id` を直接使う（`node.label ?? node.id` のような fallback は **表示用のみ**）
- 警告メッセージは `id` を含めたうえで `label` を補助的に括弧書きで添える（例: `Order (注文ドメイン)`）。これでユーザーは i18n 表示が変わっても識別できる
- export / formatter で `label` を変換しても `id` は変えない（→ TPL-02 round-trip 保証 と整合）

## 関連テスト

- `packages/core/src/resolver/warnings.test.ts` — domain dispersion / unresolved-* 系
- `packages/core/src/view/view-extract.test.ts` — グルーピング系
- `docs/concepts.ja.md` 「ドメイン分散の検出 → 検出キー」
