---
paths:
  - "packages/core/**/*.ts"
  - "packages/core/**/*.tsx"
  - "packages/cli/**/*.ts"
  - "packages/vscode/**/*.ts"
  - "packages/vscode/**/*.tsx"
  - "packages/i18n/**/*.ts"
---

# Changeset Rules

**到達状態**: 版管理対象パッケージ（`karasu` CLI / `@karasu-tools/core` /
`karasu-vscode`）の利用者から見える変更を含む PR には `.changeset/<name>.md` が
含まれ、`pnpm changeset status --since=main` が意図したパッケージと bump レベルを
表示する。PR を出す前にこのコマンドで確認する。

changeset はマージしても自動生成されない — 開発者が PR の中で `pnpm changeset` を
実行して `.changeset/<name>.md` を作り、PR に含める。付け忘れると次のリリースで
bump されず公開されない（実例: #1754 で 7 PR 分を遡って backfill した）。
背景は [ADR-1315](../../docs/adr/1315-release-automation-changesets.md)（changesets 採用）と
`docs/release.md`。

## changeset が必要な変更

版管理対象パッケージの**利用者から見える**変更を入れる PR:

- 新しい構文・タグ・アノテーション、診断（diagnostic）の追加・変更
- レンダリング／レイアウト／スタイル解決の挙動変更（見た目が変わるもの）
- CLI のコマンド・出力・公開 API の変更
- VS Code 拡張固有の挙動・UI 変更
- 利用者に影響するバグ修正

## changeset が不要な変更

- 内部リファクタ・テストのみ・コメント／docs のみ
- 版管理対象外パッケージのみの変更（`@karasu-tools/app` / `lsp` / `e2e` /
  `vscode-e2e` — `.changeset/config.json` の `ignore`）

> `@karasu-tools/i18n` も `ignore` だが、**judgement は「利用者から見えるか」で行う**。
> ignore されたパッケージは bump もカスケードもしないので、そこでの挙動変更は
> 版管理対象のどれか（例: `karasu`）を**手で名指し**しないと永久に公開されない。i18n の
> 変更で changeset が要るのはこのため（#2535 で取りこぼしかけた）。
- ADR / Design Doc のみ（`docs/**`）

## 書き方 — どのパッケージを名指すか

```
pnpm changeset
```

**版を揃えるのは `fixed` グループ、名指しは CHANGELOG のため。** 版管理対象の 3 パッケージ
（`karasu` / `@karasu-tools/core` / `karasu-vscode`）は `.changeset/config.json` の `fixed`
グループに入っており、どれを名指した changeset でも 3 つとも同じ版に bump される
（[ADR-2936](../../docs/adr/2936-lockstep-package-versioning.md)）。以前の「名指し忘れると
bump されない」取りこぼしは起きない。ただし changeset の本文が載るのは名指したパッケージの
`CHANGELOG.md` だけなので、**その変更が利用者に見えるパッケージをすべて名指す**:

| 変更箇所 | 名指すパッケージ |
| --- | --- |
| `packages/core`（利用者向け） | `@karasu-tools/core` / `karasu` / `karasu-vscode`（CLI と拡張は core を同梱している） |
| `packages/cli` 固有 | `karasu` |
| `packages/vscode` 固有 | `karasu-vscode` |

> bump レベルはグループ全体で最上位のものが採用される。

`.changeset/*.md` の frontmatter 例（core 変更）:

```markdown
---
"@karasu-tools/core": minor
"karasu": minor
"karasu-vscode": minor
---

<利用者目線で何が変わったかを1〜2文。関連 Issue/PR/ADR を参照>
```

bump レベルの目安:

| 変更 | レベル |
| --- | --- |
| 新機能・新構文・挙動追加（`feat`） | `minor` |
| バグ修正・表示微修正（`fix`） | `patch` |
| 破壊的変更（v1.0 前は原則避ける） | `major` |

複数の changeset がある場合は、グループ全体で**最上位**の bump が採用される。

## 確認

```
pnpm changeset status          # 未リリースの bump 対象を表示
pnpm changeset status --since=main   # ブランチに changeset が含まれるか
```

## リリースとの関係

changeset を**溜める**のが PR の責務、**消費**するのはリリース時
（`release-prepare.yml` の `changeset version`）。リリース手順は
`docs/release.md`「リリースの流れ」を参照。

> 将来 changeset-bot（GitHub App）を導入すれば、PR への付け忘れを
> 自動でコメント検出できる（`docs/release.md` 末尾の TODO）。
