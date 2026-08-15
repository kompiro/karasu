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
| ` ```krs ` | 現行文法で通る完全なモデル | parse エラーゼロ **かつ deprecation クラスの warning ゼロ**を検証 |
| ` ```krs fragment ` | 抜粋（ファイル全体ではない） | parse しない |
| ` ```krs invalid ` | 意図的に不正な入力（診断のデモ） | いまも parse エラーが出ることを検証 |

`invalid` を逆向きにも検証するのは、文法が緩んで例が例でなくなる変化も拾うため。

deprecation クラスは **code が `-deprecated` で終わる warning**（`krs-fence-deprecated-form`
として報告）。撤去予定の形を教えるドキュメントは、撤去の日まで error にならないので
黙って残る — AT-0007 は organization / team / member の positional label を #2133 から
#2208 までそうやって教え続けた（[ADR-2208](../../docs/adr/2208-positional-label-error-promotion.md)）。
新しい deprecation を出す側は、この判定に自動で乗ることを前提にしてよい（コードの形で
判定するので一覧の更新は要らない）。教えたい形が deprecated になったら、
`fragment` に逃がさず**プロパティ形式など現行の推奨形に書き換える**。

## `.krs` の例を裸の ``` fence に入れない

具体的な id を持つ宣言行（`service ECommerce {`、`deploy "production" {`）か、エッジ
行（`ECommerce -> Payment "..."`）を含む裸の fence は `krs-fence-untagged` として
報告される。#2415 の 2 ブロックはどちらも裸 fence だったため、タグ付き fence だけを
見ていた当時のガードを素通りした。

裸のままでよいのは **擬似文法**（`user <id> [<human|ai>] {`）・ディレクトリツリー・
シェルセッションなど、そもそも `.krs` ではないもの。placeholder は id ではないので
自動的に判定から外れる。

番号付き手順の中に置く**インデントされた fence も対象**（CommonMark どおり 3 スペース
まで）。body は fence 自身のインデント分だけ落として parse されるので、手順の
レイアウトはそのままでよい。

## 抜粋にするか、包んで完全にするか

`fragment` は検証されないので、**2〜4 行の wrapper で完全にできるなら包む**。
`oci` / `store` は `deploy` の中、root 直書きのエッジは `system` の中でしか成立しない
ので、包むのは水増しではなく仕様どおりの提示になる。プロパティ 1 つを見せる焦点例
（`usecase` の `operations` など）だけを `fragment` にする。
