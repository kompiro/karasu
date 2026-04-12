# ADR-0032: 移行期における重複ドメイン ID の共存を `@deprecated` + `@migration_target` で許容する

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #477, [docs/spec/tags-annotations.md](../spec/tags-annotations.md)

## 背景

ドメイン移行を計画する際、旧サービスと新サービスが同一ドメイン ID を持つ期間が生まれる。たとえば `LegacyService.Contract` を `NewService.Contract` に移行するとき、移行途中のアーキテクチャ図には両方のドメインを同時に描きたい。

しかし #451 以降、同一システム内の重複ドメイン ID はエッジ参照の曖昧性回避のためエラーとして扱われており、移行期の意図的な共存にはこの制約を選択的に解除する手段が必要になった。

## 決定

同一システム内で同じ ID を持つ domain が複数存在する場合、少なくとも一方に `@deprecated` または `@migration_target` アノテーションが付いていれば重複を**許容**する。どちらにもマーキングがなければ従来通りエラー。

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated { -> Billing }
  }
  service NewService {
    domain Contract @migration_target { -> Billing }
  }
}
```

`nodePathIndex` の優先順位は `@migration_target` 側を優先する（移行先が「現在の正」）。どちらにもマーキングがない、または `@deprecated` のみの場合は先に現れた方を優先（従来動作）。

## 理由

- `@deprecated` / `@migration_target` はいずれも既存のアノテーション語彙であり、新しい構文要素を追加しない
- アノテーションは「ライフサイクル・状態のメタ情報」という定義に合致する
- ドメインはビジネス概念を指し示す識別子のため、移行中も同じ ID を保持することに意味がある。サービスはアーキテクチャ上の実装単位であり移行時に形を変えることが多いため、重複許容をドメイン限定にする非対称性は意味的に正当化される
- 同 ID ペアの `@deprecated` 側を移行元、`@migration_target` 側を移行先とみなすことで、将来の AI チャット連携（「どのチームが担当しているか」）にも対応できる
- `@migration_target` のデフォルトスタイル（⚠バッジ、opacity 0.6 等）がそのまま使える

## 却下した案

### `[deprecated]` タグ

タグは「アーキテクチャ上の位置・役割」を表す概念（`[external]`、`[async]` など）であり、ライフサイクル状態を表すために使うことは定義と矛盾する。`@deprecated` アノテーションが既に存在する中で同じ意味を別の構文で追加することも避けたい。

### `@deprecated` 単独での重複許容

記述は簡潔だが、移行方向（どちらが旧でどちらが新か）が視覚的に明示されない。AI チャット連携で「移行先」の特定ができない。

### `migrates_to NewService.Contract` プロパティの導入

移行先情報が最も豊富になるが、新プロパティ構文とパス表現の導入が必要でパーサー変更コストが大きい。現時点では不要。

## 実装への影響

1. `packages/core/src/parser/parser.ts` — 重複許容条件を `annotations.includes("deprecated") || annotations.includes("migration_target")` に変更。`nodePathIndex` の優先順位を調整
2. `packages/core/src/builtins/default-style.ts` — `domain[deprecated]` スタイルルールを削除
3. `packages/core/src/builtins/reference.ts` — `deprecated` タグ登録を削除
4. `docs/spec/tags-annotations.md` — `[deprecated]` タグの記述を削除し、domain での `@deprecated` / `@migration_target` 使用例を追記
