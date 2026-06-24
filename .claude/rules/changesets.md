---
paths:
  - "packages/core/**/*.ts"
  - "packages/core/**/*.tsx"
  - "packages/cli/**/*.ts"
---

# Changeset Rules

公開パッケージ（`karasu` CLI / `@karasu-tools/core`）のソースを変更する PR では
**changeset の追加を忘れない**ためのルール。背景は [ADR-20260512-05](../../docs/adr/20260512-05-release-automation-changesets.md)（changesets 採用）と `docs/process.md` 「リリース運用」。

> ⚠️ **changeset はマージしても自動生成されない。** 開発者が PR の中で
> `pnpm changeset` を手で実行して `.changeset/<name>.md` を作り、PR に含める。
> 付け忘れると次のリリースで bump されず公開されない（実例: #1754 で
> #1727 / #1721 / #1736 / #1741 / #1748 / #1749 / #1698 を遡って backfill した）。

## changeset が必要な変更

版管理対象パッケージ（`karasu` / `@karasu-tools/core` / `karasu-vscode`）の
**利用者から見える**変更を入れる PR:

- 新しい構文・タグ・アノテーション、診断（diagnostic）の追加・変更
- レンダリング／レイアウト／スタイル解決の挙動変更（見た目が変わるもの）
- CLI のコマンド・出力・公開 API の変更
- VS Code 拡張固有の挙動・UI 変更
- 利用者に影響するバグ修正

## changeset が不要な変更

- 内部リファクタ・テストのみ・コメント／docs のみ
- 版管理対象外パッケージのみの変更（`@karasu-tools/app` / `lsp` / `e2e` /
  `vscode-e2e` — `.changeset/config.json` の `ignore`）
- ADR / Design Doc のみ（`docs/**`）

## 書き方 — どのパッケージを名指すか

```
pnpm changeset
```

依存の **cascade 非対称性**に注意（実測・詳細は
`docs/design/vscode-changeset-versioning.md`）。changesets は `dependencies` の
dependent は版 bump するが、`devDependencies` は範囲更新のみで bump しない:

| 変更箇所 | 名指すパッケージ | 自動 cascade |
| --- | --- | --- |
| `packages/core`（利用者向け） | **`@karasu-tools/core` と `karasu` の両方** | core → `karasu-vscode` に patch |
| `packages/cli` 固有 | `karasu` | なし |
| `packages/vscode` 固有 | `karasu-vscode` | なし |

> core の変更を `"karasu"` だけに付けると、core を実 dependency に持つ
> `karasu-vscode` が bump されず、拡張に core 変更が乗っても版が上がらない取り
> こぼしになる。CLI は core を `devDependency`（esbuild バンドル）にしているため
> `@karasu-tools/core` の bump が CLI に cascade せず、`karasu` の明示が別途要る。

`.changeset/*.md` の frontmatter 例（core 変更）:

```markdown
---
"@karasu-tools/core": minor
"karasu": minor
---

<利用者目線で何が変わったかを1〜2文。関連 Issue/PR/ADR を参照>
```

bump レベルの目安:

| 変更 | レベル |
| --- | --- |
| 新機能・新構文・挙動追加（`feat`） | `minor` |
| バグ修正・表示微修正（`fix`） | `patch` |
| 破壊的変更（v1.0 前は原則避ける） | `major` |

同じパッケージに複数 changeset がある場合は**最上位**の bump が採用される。

## 確認

```
pnpm changeset status          # 未リリースの bump 対象を表示
pnpm changeset status --since=main   # ブランチに changeset が含まれるか
```

PR を出す前に `pnpm changeset status` で意図した bump になっているか確認する。

## リリースとの関係

changeset を**溜める**のが PR の責務、**消費**するのはリリース時
（`release-prepare.yml` の `changeset version`）。リリース手順は
`docs/process.md` 「リリースの流れ」を参照。

> 将来 changeset-bot（GitHub App）を導入すれば、PR への付け忘れを
> 自動でコメント検出できる（`docs/process.md` 末尾の TODO）。
