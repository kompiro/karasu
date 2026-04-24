---
id: ADR-20260401-06
title: Domain Drift Detection — Scope and Detection Key
status: accepted
date: 2026-04-01
topic: resolver
depends_on:
  - ADR-20260312-03
scope:
  packages:
    - core
---

# ADR-20260401-06: Domain Drift Detection — Scope and Detection Key

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: Issue #237, [ADR-20260312-03](20260312-03-logical-physical-separation.md)

## 背景

Issue #237 は `examples/migration/` サンプルシナリオの設計中に、「legacy-to-new 移行で同じドメイン（例: `Payment`）が旧サービスと新サービスに存在する」ケースが検出されないという前提で起票された。コード調査の結果、`detectDomainDispersal` の実装には 2 つの別々の問題があった。

### 現状の実装（`resolver/warnings.ts`）

`detectDomainDispersal` は `domain.label ?? domain.id` → 親 service ID の Set をマップし、Set サイズが 1 を超えたときに warning を出していた。

**問題 1 — 検出キーが `label ?? id`、`id` ではない**

| シナリオ | 期待 | 実際 |
|---|---|---|
| 同じ `id`、同じ label | warn | warn ✓ |
| 同じ `id`、異なる label | warn | **silent** ✗ |
| 異なる `id`、同じ label | silent | **warn** ✗ |

`id` は karasu の正規識別子で、`label` は表示名（翻訳・省略・言い換えが許される）。`label ?? id` を使うと false negative / false positive の両方が生じる。

**問題 2 — システム境界が尊重されていない**

関数は `file.systems` を単一の共有 `domainToServices` マップで走査していた。異なる `system` ブロック間のドメインが互いに比較されていた。

## 決定

### 1. `system` 単位でスコープする

各 `system` ブロックは独立して分析され、異なる `system` 間のドメインは決して比較しない：

```krs
// No warning — 異なるシステム、意図的な並行モデリング
system LegacyPlatform {
  service OldBilling {
    domain Payment { label "決済（旧）" }
  }
}
system NewPlatform {
  service PaymentService {
    domain Payment { label "決済（新）" }
  }
}

// Warning — 同じシステム内でドメイン分散
system ECPlatform {
  service ECommerce {
    domain Payment { label "決済" }
  }
  service Checkout {
    domain Payment { label "決済処理" }  // ← warns
  }
}
```

### 2. 検出キーを `id` に変更

`node.label ?? node.id` から `node.id` へ変更する：

```krs
// Warns（同じ id、異なる label）
domain Payment { label "決済" }    // ECommerce 内
domain Payment { label "お支払い" } // Checkout 内 → warns

// 警告なし（異なる id、同じ label — タイプミスの可能性はあるが drift ではない）
domain PaymentA { label "決済" }
domain PaymentB { label "決済" }
```

### 3. クロスファイル検出は `compileProject()` で対応

コード変更不要。プロジェクトとしてコンパイルされるときは `ImportResolver.resolve()` が全 `KrsFile` をマージしてから `analyze()` が実行されるため、単一システムが複数ファイルに分散していても正しく検出される。

単一ファイル `compile()` パスは定義上単一ファイル限定。アーキテクチャをファイル分割する場合は `compileProject()` が正しいエントリポイント。この境界はドキュメント化する。

### 4. 実装変更

`packages/core/src/resolver/warnings.ts` に 2 つの変更：

1. `domainToServices` マップを system 単位にスコープする（各 `system` イテレーションごとにマップをリセット）
2. 検出キーを `node.label ?? node.id` から `node.id` に変更

`warnings.test.ts` に以下のカバレッジを追加：

- 同じ ID、異なる label → warn するべき
- 異なる ID、同じ label → warn しないべき
- 異なる system のドメイン → warn しないべき

## 理由

- **`system` はオーガナイゼーション境界**: C4 Model の Context 境界に相当する概念。legacy システムの `domain Payment` と新システムの `domain Payment` は同じビジネス概念を異なる組織が異なるライフサイクル段階で所有していることを意図的にモデリングしたもので、drift としてフラグするのは false positive であり警告への信頼を損ねる
- **`id` が正規識別子**: `label` は表示名として翻訳や言い換えが許されるため、検出の拠り所にしてはならない。`id` を使うことで「同じ ID、異なる label（= drift）」と「異なる ID、同じ label（= 表記揺れだが別エンティティ）」を正しく区別できる
- **クロスファイル検出はインポート解決後に既に機能する**: `compileProject()` 経由なら `ImportResolver.resolve()` が AST をマージしてから `analyze()` を呼ぶため、追加のクロスファイル処理は不要
- **オプトイン annotation を要求しない**: 同一システム内に同一ドメイン ID の service を置くことはほぼ常に非意図的なため、デフォルトで検出するのが妥当
- **`[external]` との特別対応なし**: `[external]` service を自分の system ブロック内に置いて所有サービスと並べるのはユーザーが共モデリングを選択した状況で、警告は依然適切

## 却下した案

### Q: クロスシステムのドメイン drift を検出するべきか？

No。`system` はオーガナイゼーション境界で、システム間の同一概念ドメインは意図的な並行所有を表す。検出は `system` 単位にスコープする。

### Q: オプトイン annotation にするか？

不要。system 単位スコープがデフォルトとして正しい。ユーザーが意図的に同一ドメイン ID を同じ system の異なる service に置くことはほぼない。

## `examples/migration/` への影響

移行シナリオは legacy と新 service を**別々の `system` ブロック**に配置して組織境界を正確にモデリングすべき。ドメイン drift は発火しない — これは移行期の意図的な並行所有として正しい挙動。

ドメイン drift 警告を examples で示すには、同一 system に同一ドメイン ID の 2 service を置く専用サンプルを作る。
