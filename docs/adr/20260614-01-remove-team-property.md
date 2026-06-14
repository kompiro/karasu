---
id: ADR-20260614-01
title: service / domain の `team` プロパティを削除する
status: accepted
date: 2026-06-14
topic: core-concepts
depends_on:
  - ADR-20260323-03
related_to:
  - ADR-20260511-04
scope:
  packages: [core, i18n, app, vscode]
assumptions:
  - "grep: packages/core/src/parser/parser.ts :: team-property-removed"
  - "grep: packages/i18n/src/en.ts :: teamPropertyRemoved"
---

# ADR-20260614-01: service / domain の `team` プロパティを削除する

- **日付**: 2026-06-14
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1564](https://github.com/kompiro/karasu/issues/1564)
  - [ADR-20260323-03](20260323-03-organization-diagram.md)（`team` プロパティを deprecate した決定。本 ADR はその廃止計画を完了させる）
  - [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理語彙は「効果を持つ / 警告される / open set と明文化」のいずれか）
  - コード: `packages/core/src/{parser/parser.ts,resolver/warnings.ts,types/ast.ts,renderer/*}`、`packages/i18n/src/*`

## 背景

`service` / `domain` に書ける文字列プロパティ `team "..."` は、オーナーチームを記録する最初の手段だった。[ADR-20260323-03](20260323-03-organization-diagram.md) で `organization` ブロック + `owns` を導入した際に deprecate され（§7「将来のバージョンで削除する」）、約 3 か月 deprecation warning を出し続けてきた。

この間オーナーシップの表現は `team` プロパティと `organization`/`owns` の 2 系統に分かれたままで、相互検証もなく（`service.team "X"` と `owns`（別チーム）が食い違っても気づけない）、ドキュメント（`docs/spec/`）も deprecation と矛盾して `team` プロパティを推奨し続けていた。ADR-20260323-03 の廃止計画を完了させ、オーナーシップ表現を `organization`/`owns` に一本化する。

設計検討の詳細（4 案の比較）は Issue #1564 と、本 ADR に集約した Design Doc（同 PR で削除）に基づく。

## 決定

`service` / `domain` の `team` プロパティを削除し、出現時は **error 診断 `team-property-removed`** を出してパースを継続する（値は捨てる）。オーナーチームの解決と描画は `organization`/`owns`（ownerIndex）のみを source とする。`team` キーワード自体は `organization` の `team` ブロック用に存続する。

## 理由

- **TPL-20260610-01 に整合**: 受理する語彙は「効果を持つ / 警告される / open set」のいずれかでなければならない。黙って受理して無視する（silent-ignore）案はこの観点に反するため、error として明示的に警告する。
- **オーナーシップ表現の一本化**: 2 系統の併存と食い違いの余地が構造的に消える。`realizes`（物理↔論理）と対称に `owns`（組織↔論理/物理）が唯一の所有関係になる。
- **消し漏れ防止**: AST から `team?: string` を削除することで、renderer のフォールバック参照を TypeScript の typecheck が機械的に検出でき、移行漏れを防げる。
- **十分な移行期間**: deprecation warning を約 3 か月出しており、CLI は 0.x。error 診断はパースを止めず移行先（`organization`/`owns`）を明示する。

## 却下した案

- **silent-ignore（黙って無視）**: 受理するが効果も警告もない語彙を生み、TPL-20260610-01 に反する。ユーザーは無視に気づけない。
- **deprecation の延長（現状維持）**: 2 系統併存・相互検証なしの問題が残り、ADR-20260323-03 の「将来削除」が宙吊りのまま。
- **error は出すが AST フィールドは残す**: 「error と言いながら値は描画される」矛盾が生じ、owner 表示の一本化も typecheck による消し漏れ検出も得られない。

## 影響範囲・マイグレーション

- 既存ユーザーは `service`/`domain` の `team "X"` を `organization { team t { owns X } }` へ移行する。チーム連絡先は `team` ブロックの `link` で表現する（`docs/spec/tags-annotations.md` の更新済みコンベンション参照）。
- `organization` ブロックを持たず `service.team` だけで owner ラベルを出していた図は、移行するまでラベルが描画されなくなる（移行を促す方針として許容）。
