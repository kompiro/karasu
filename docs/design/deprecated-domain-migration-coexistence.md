# 移行期における重複ドメイン ID の共存許容

- **日付**: 2026-04-11
- **ステータス**: 完了
- **関連**:
  - [Issue #477](https://github.com/kompiro/karasu/issues/477)
  - [docs/spec/tags-annotations.md](../spec/tags-annotations.md)

## 背景・課題

ドメイン移行を計画する際、旧サービスと新サービスが同一ドメイン ID を持つ期間が生まれる。
たとえば `LegacyService.Contract` を `NewService.Contract` に移行するとき、
移行途中のアーキテクチャ図には両方のドメインを同時に描きたい。

```krs
system OrderSystem {
  service LegacyService {
    domain Contract {
      -> Billing
    }
  }
  service NewService {
    domain Contract {
      -> Billing
    }
  }
}
```

しかし現在、同一システム内の重複ドメイン ID は **エラー** として扱われる（#451 で warning → error に昇格）。
エッジ参照（`-> Contract`）の解決が曖昧になるためであり、意図しない重複を早期に検出する設計判断だった。

移行期の意図的な共存は、この制約を選択的に解除する手段が必要になる。

---

## 制約・前提

- エッジ参照 `-> Contract` は解決可能であること（どちらかのドメインに到達できる）
- **非移行時**（どちらにも移行マーキングがない）の重複はエラーのままであること
- 廃止予定ドメインのエッジ（`LegacyService.Contract -> Billing`）も描画されること
- 廃止予定ドメインは視覚的に区別されること
- 既存の `@deprecated` / `@migration_target` アノテーションとの整合性を保つこと

---

## 検討した選択肢

### 案 1: `[deprecated]` タグを domain に追加

```krs
domain Contract [deprecated] {
  -> Billing
}
```

廃止予定ドメインに `[deprecated]` タグを付与し、重複を許容する。

**メリット:**
- 記述が簡潔
- `[external]` などの既存タグと構文が統一されている
- タグセレクタ `domain[deprecated]` でスタイルを独立して制御できる

**デメリット:**
- タグの定義（アーキテクチャ上の位置・役割）とライフサイクル状態（廃止予定）の混在
- 既存のアノテーション `@deprecated` と役割が重複する概念になる
- `service [deprecated]` との使い分けが不明確になる恐れがある

---

### 案 2: `@deprecated` アノテーションで重複を許容

```krs
domain Contract @deprecated {
  -> Billing
}
```

既存の `@deprecated` アノテーションを domain ノードで使用したとき、
重複ドメイン ID のエラーを抑制する。

**メリット:**
- 新しい構文要素を追加しない
- `@deprecated` は「廃止予定」という意味を既に持っており、意味的に自然
- デフォルトスタイル（⚠バッジ、opacity 0.6）がそのまま使える

**デメリット:**
- `@deprecated` に「重複 ID を許容する」という隠れたセマンティクスが加わる
- `service @deprecated` や `usecase @deprecated` との一貫性が崩れる
  （domain のみ特別な重複許容効果を持つことになる）
- domain 以外で `@deprecated` を使った場合の挙動との非対称性が生まれる

---

### 案 3: `@deprecated` + `@migration_target` のペアリング（採用案）

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated {   // ← 廃止予定
      -> Billing
    }
  }
  service NewService {
    domain Contract @migration_target {  // ← 移行先
      -> Billing
    }
  }
}
```

廃止予定側に `@deprecated`、移行先に `@migration_target` を付与し、
同 ID の domain ペアにおいていずれか一方に移行マーキングがあれば重複を許容する。

**メリット:**
- `@deprecated`・`@migration_target` はいずれも既存のアノテーション語彙であり、新しい構文要素を追加しない
- 移行の方向性（どちらが旧でどちらが新か）が視覚的に明示される
- 同 ID ペアの `@migration_target` 側を移行先とみなすことで、将来の AI チャット連携（「どのチームが担当しているか」）にも対応できる
- アノテーションは「ライフサイクル・状態のメタ情報」という定義に合致する

**デメリット:**
- 記述量が増える（両方のドメインを修正する必要がある）
- `@deprecated` / `@migration_target` に domain 限定の重複許容効果が加わる

---

### 案 4: `migrates_to` プロパティによる明示的な移行宣言

```krs
system OrderSystem {
  service LegacyService {
    domain Contract {
      migrates_to NewService.Contract
      -> Billing
    }
  }
  service NewService {
    domain Contract {
      -> Billing
    }
  }
}
```

廃止予定ドメインに `migrates_to <path>` プロパティを追加し、
移行先を明示することで重複を許容する。

**メリット:**
- 移行の方向性と移行先が完全に明示されており、最も情報量が多い
- `migrates_to` のある側が廃止予定であることが構文から自明

**デメリット:**
- 新しいプロパティ構文の追加が必要（パーサー変更コストが大きい）
- `migrates_to NewService.Contract` のパス表現を新たに定義する必要がある
- 移行先情報の活用というニーズのためだけに構文を増やすコストが高い

---

## 比較

| 軸 | 案1 `[deprecated]`タグ | 案2 `@deprecated` | 案3 `@deprecated`+`@migration_target` | 案4 `migrates_to` |
|----|----------------------|-------------------|--------------------------------------|-------------------|
| 既存語彙の活用 | ✗（新タグ） | ◎ | ◎ | ✗（新プロパティ） |
| 意味的一貫性 | △（タグ ≠ ライフサイクル） | ○ | ◎ | ◎ |
| 移行方向の明示 | ✗ | ✗ | ◎ | ◎ |
| 記述コスト | ◎（1か所） | ◎（1か所） | △（2か所） | △（1か所＋パス記述） |
| パーサー変更コスト | ○（小） | ○（小） | ○（小） | ✗（大） |
| 将来の AI チャット活用 | ✗ | △ | ◎ | ◎ |

---

## 現時点の方針

**案3（`@deprecated` + `@migration_target` のアノテーションペアリング）を採用する。**

### 重複許容の条件

同一システム内で同じ ID を持つ domain が複数存在する場合：

- 少なくとも一方に `@deprecated` または `@migration_target` が付いていれば重複を**許容**
- どちらにもマーキングがなければ**エラー**（従来通り）

### 採用理由

- `@deprecated`・`@migration_target` はいずれも既存のアノテーション語彙であり、新しい構文要素を追加しない
- アノテーションは「ライフサイクル・状態のメタ情報」という定義に合致する
- ドメインはビジネス概念を指し示す識別子であるため、移行中も同じ ID を保持することに意味がある。サービスはアーキテクチャ上の実装単位であり移行時に形を変えることが多いため、同 ID の重複許容はドメイン限定とする非対称性は意味的に正当化される
- 同 ID ペアのうち `@deprecated` 側を移行元、`@migration_target` 側を移行先とみなすことで、将来の AI チャット連携（「どのチームが担当しているか」）にも対応できる。`migrates_to` プロパティの追加は現時点では不要

### nodePathIndex の優先順位

- `@migration_target` が付いているドメインをインデックスの優先先とする（移行先が「現在の正」）
- どちらにもマーキングがない、または `@deprecated` のみの場合は先に現れた方を優先（従来動作）

### 案1（`[deprecated]` タグ）を却下した理由

タグは「アーキテクチャ上の位置・役割」を表す概念（`[external]`、`[async]` など）であり、
ライフサイクル状態（廃止予定）を表すために使うことは定義と矛盾する。
`@deprecated` アノテーションが既に存在する中で同じ意味を別の構文で追加することも避けたい。

### 実装への影響（PR #483 の修正内容）

現在の実装（`[deprecated]` タグ）から以下に変更する：

1. `packages/core/src/parser/parser.ts` — 重複許容条件を `tags.includes("deprecated")` から `annotations.includes("deprecated") || annotations.includes("migration_target")` に変更。`nodePathIndex` の優先順位を `@migration_target` 優先に調整
2. `packages/core/src/builtins/default-style.ts` — `domain[deprecated]` スタイルルールを削除（`@deprecated` の既存スタイルをそのまま使用）
3. `packages/core/src/builtins/reference.ts` — `deprecated` タグ登録を削除
4. `docs/spec/tags-annotations.md` — `[deprecated]` タグの記述を削除し、domain での `@deprecated` / `@migration_target` 使用例を追記

---

## 未解決の問い

なし。
