# AT: `[index]` stores are excluded from the `shared-infra-fan-in` smell

- **日付**: 2026-06-23
- **関連 Issue**: [#1733](https://github.com/kompiro/karasu/issues/1733)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`,
  `docs/concepts.md`(+`.ja.md`)

## 受け入れ条件

`database [index]`（[ADR-20260623-04](../adr/20260623-04-vector-store-vs-database.md)）は派生の検索 / 二次インデックス（read model）であり、複数 service が共有しても database-per-service smell ではない。`[external]` と同様に `shared-infra-fan-in` から除外する。

- [x] `[index]` データベースを 2 つ以上の service が参照しても `shared-infra-fan-in` warning を出さない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `shared-infra-fan-in warning` › `excludes [index] stores — a shared derived search index is not the smell (#1733)`

- [x] `[index]` でない（正本の）`database` を複数 service が共有する場合は従来どおり `shared-infra-fan-in` を出す（既存挙動の非退行）

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `shared-infra-fan-in warning`（既存ケース群: 共有 database / queue / storage を検出）

## 備考（スコープ外）

- `index-without-source` 診断（#1733 のもう一方）は **won't-do** とした。karasu のモデルに「index の feed 元（source）」を表す関係が無く、機械判定の土台が無いため。将来 index の feed 関係を語彙化する設計が出れば再検討する。
