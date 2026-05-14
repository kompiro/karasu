---
id: ADR-20260513-03
title: system にネストした service / domain の Named Import は明示的な path 構文で取り込む
status: accepted
date: 2026-05-13
topic: parser
related_to:
  - ADR-20260405-03
  - ADR-20260409-05
  - ADR-20260409-06
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/fs/import-resolver.ts"
  - "symbol: packages/core/src/types/ast.ts :: ImportIdPath"
  - "grep: packages/core/src/types/ast.ts :: \"import-path-not-found\""
  - "grep: packages/core/src/parser/parser.ts :: ImportIdPath"
---

# ADR-20260513-03: system にネストした service / domain の Named Import は明示的な path 構文で取り込む

- **日付**: 2026-05-13
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#927](https://github.com/kompiro/karasu/issues/927) — `feat(core): import system-nested service / domain (named import path syntax)`
  - 設計 PR: [#929](https://github.com/kompiro/karasu/pull/929)（旧 `docs/design/import-system-nested.md` — 本 ADR に集約して削除）
  - 実装 PR: [#946](https://github.com/kompiro/karasu/pull/946) — `feat(core): import path syntax for system-nested service / domain`
  - 先行する関連 PR: [#913](https://github.com/kompiro/karasu/pull/913)（`unresolved-realizes` 診断、validation gap を顕在化）, [#880](https://github.com/kompiro/karasu/pull/880)（`unresolved-handles`）
  - 関連 ADR: [ADR-20260405-03](20260405-03-wildcard-import-two-pass-resolution.md)（wildcard import）, [ADR-20260409-05](20260409-05-directory-import.md)（directory import）, [ADR-20260409-06](20260409-06-named-import-toplevel-service.md)（top-level service named import）
  - コード: `packages/core/src/fs/import-resolver.ts`、`packages/core/src/parser/parser.ts`、`packages/core/src/types/ast.ts`、`docs/spec/syntax.md`

## 背景

クロスファイルの参照（`realizes` / `handles`）を書くには、別ファイルの `system` 配下にネストされた `service` / `domain` を named import で取り込む必要がある。しかし当時の `mergeNamedImport` は `system` 直接子までしか走査せず、`system.service.domain` のような grandchild は `import-id-not-found` で到達できなかった。`parseNodeImport` も `Identifier` を 1 トークン受理するだけで、`A.B.C` のような path 構文は parse error になっていた。PR #913 で `unresolved-realizes` 診断を導入したことで、この validation gap が実害として顕在化した。

karasu のモデリングでは **同名 id の意図的な共存**が珍しくない。システム移行期に新旧 system が同じ `OrderService` を持つ、マルチテナント構成で `TenantA.Billing` / `TenantB.Billing` を並べる、`Order` / `Catalog` のような一般的なドメイン名が複数 system にまたがって登場する、といった通常の使い方がある（既存の `domain-dispersal` 警告が前提にしている状況）。

## 決定

**`import { A.B.C } from "..."` の明示 path 構文を最初から実装する。** 暗黙の再帰検索（bare id が descendants を勝手に探索）は採用しない。

- Parser: id list で `Identifier (Dot Identifier)*` を受理する。bare id `Foo` は `["Foo"]`、`A.B.C` は `["A", "B", "C"]` として `ImportIdPath = string[]` に保持し、`ImportDeclaration.ids: ImportIdPath[]` に格納する。
- Resolver: 長さ 1 は既存 bare id 解決（top-level / direct child / system / `deploy.nodes`）。長さ 2 以上は path 走査で、各セグメントを直前で解決したノードの `children` から id 一致で線形検索する（kind は問わない）。
- 新規診断 `import-path-not-found`: いずれかのセグメントで外れたら `{ path, failedAt, importPath, lastResolvedId? }` を返す。bare id の `import-id-not-found` はそのまま残す。
- 解放範囲: `import { ECPlatform }` / `import { ECPlatform.ECommerce }` / `import { ECPlatform.ECommerce.Order }` / `import { ECPlatform.ECommerce.Order.PlaceOrder }`（usecase まで連結可能）。
- 後方互換: 既存の bare id 形式（`import { ECommerce }`）はそのまま受理。`.krs` の書き換えは不要。

## 理由

- **同名 id の意図的共存に正面から対応できる**: 暗黙の再帰検索を入れると、システム移行・マルチテナント・一般名ドメインといった通常の使い方で `import-id-ambiguous` が量産されてしまう。最初から path で意図を書ける道を整備するほうがユーザー体験が良い。
- **明示性が読み手に有利**: 誰がどこから何を取り出すかが import 文だけで分かる。`grep` / LSP go-to で追うときも path が手掛かりになる。
- **後方互換**: bare id は `["Foo"]` として表現するだけで挙動が変わらないため、既存 `.krs` を一切壊さない。
- **段階拡張に開いている**: kind 厳格モードや LSP completion（`import { Sys.<カーソル>` で children 補完）は別 Issue で追加できる。loose な id 一致から始めるのは「緩める方が難しい」原則に沿う。
- **AT-0068（import 越しの参照は警告しない）**を grandchild まで成立させ、PR #913 で導入した `unresolved-realizes` / `unresolved-handles` の validation gap を閉じる。

## 却下した案

- **案 B — ドキュメント主導（`import { ECPlatform }` で system 丸ごと取り込む書き方を canonical とする）**: 実装ゼロで済むが、「`Order` だけ欲しい」のに不要な兄弟ノードまで merged に流入する。複数 system が同名 id を持つ曖昧性は解決しない。却下。
- **案 C — bare id の再帰検索のみ**: 構文変更ゼロで「名前で指す」直感に合うが、karasu が許容する同名 id 共存と相性が悪く `import-id-ambiguous` が頻発する。曖昧解消の手段が無いので結局 path 構文を後付けすることになる。却下。
- **案 D — ハイブリッド（再帰 + path）**: Phase 1 で再帰、Phase 2 で path を追加。最終的な表現力は同じだが、Phase 1 と Phase 2 の間に「曖昧性を解消する手段が無い」期間ができる。最初から明示 path を出すほうがユーザー体験が一貫する。却下。

## 影響範囲

- **AST**: `ImportDeclaration.ids` の型が `string[]` から `ImportIdPath[] = string[][]` に変わる。AST consumer（formatter / patch / LSP）はリスト要素の型に追随する。
- **診断**: `import-path-not-found` を診断辞書に追加。LSP / app の error 表示はキーに応じてメッセージを localize する（既存の i18n 配線に乗る）。
- **spec / examples**: `docs/spec/syntax.md` に path 構文と同名 id 共存例（システム移行）を追記。AT-0068 を grandchild のシナリオで更新。
- **LSP completion** は本 ADR のスコープ外。follow-up Issue で扱う。
