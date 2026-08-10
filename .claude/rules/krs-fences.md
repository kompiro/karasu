---
paths:
  - "docs/acceptance/**/*.md"
  - "docs/spec/**/*.md"
  - "docs/guide/**/*.md"
  - "docs/concepts*.md"
---

# ドキュメントに `.krs` を埋めるときのルール

**到達状態**: `pnpm run lint:krs-fences` が finding ゼロで通る。

```
pnpm run lint:krs-fences
```

ドキュメントの `.krs` は誰も実行しないので、放っておくと静かに文法から外れる。
このガードが `docs/{acceptance,spec,guide}/**` と `docs/concepts*.md` の全 fence を
実際に parse する。観点は
[TPL-2047](../../docs/test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)。

## fence に主張を書く

判定基準は 1 つ、**その fence が現行文法で通る完全なモデルだと主張するかどうか**。

| fence | 主張 | ガード |
|-------|------|--------|
| ` ```krs ` | 現行文法で通る完全なモデル | parse エラーゼロを検証 |
| ` ```krs fragment ` | 抜粋（ファイル全体ではない） | parse しない |
| ` ```krs invalid ` | 意図的に不正な入力（診断のデモ） | いまも parse エラーが出ることを検証 |

`invalid` を逆向きにも検証するのは、文法が緩んで例が例でなくなる変化も拾うため。

## `.krs` の例を裸の ``` fence に入れない

具体的な id を持つ宣言行（`service ECommerce {`、`deploy "production" {`）を含む裸の
fence は `krs-fence-untagged` として報告される。#2415 の 2 ブロックはどちらも裸 fence
だったため、タグ付き fence だけを見ていた当時のガードを素通りした。

裸のままでよいのは **擬似文法**（`user <id> [<human|ai>] {`）・ディレクトリツリー・
シェルセッションなど、そもそも `.krs` ではないもの。placeholder は id ではないので
自動的に判定から外れる。

## 抜粋にするか、包んで完全にするか

`fragment` は検証されないので、**2〜4 行の wrapper で完全にできるなら包む**。
`oci` / `store` は `deploy` の中、root 直書きのエッジは `system` の中でしか成立しない
ので、包むのは水増しではなく仕様どおりの提示になる。プロパティ 1 つを見せる焦点例
（`usecase` の `operations` など）だけを `fragment` にする。
