# ADR から karasu の構造へリンクする（permalink）

> [English](adr-permalinks.md) · **日本語**（このファイル）

アーキテクチャ上の判断をしたら、その結果の構造を in-repo の `.krs` に記録し、
ADR（Architecture Decision Record）から**それにリンク**する — こうすると判断の
読者がその図を開ける。本レシピは、そのリンクを**復元・監査可能**な形で書くための
規約であり、opaque で死んだ URL を貼らないためのものである。

karasu のホスト版アプリ（**karasu-nest**）の **🔗 Share** ボタンは、プロジェクト
全体（`.krs` ＋ その `.krs.style`）を自己完結した URL にエンコードする。本ガイド
が答えるのは*そのリンクを ADR にどの形で貼り、隣に何を記録するか*である。

## 一行で言うと

**構造への短縮 permalink（taka）と、その元になった in-repo `.krs` の `source` を
記録する。** repo 内の `.krs` が source of truth で、permalink は便利な pointer、
`source` は shortener が消えても ADR を復元可能に保つ。

## `.krs` source が記録・permalink は pointer

karasu の構造の source of truth は URL ではなく **repo 内の `.krs`** である。ADR
permalink は読者がその構造をレンダリング済みで*見る*ためのワンクリックにすぎない。
だから常にリンクの隣に **`source`**（in-repo `.krs` の path）を記録する — そうすれば
URL や shortener に何が起きても ADR を repo から再構成できる。`source` を必須にし、
リンク単体では不十分とするのはこのためである。

## `/s?s=` の共有 URL を短縮する — `#s=` は不可

Share ボタンは同じプロジェクトに対して 2 本の URL を作る:

| URL の形 | payload の置き場所 | 短縮・貼付する？ |
| --- | --- | --- |
| `https://karasu.kompiro.dev/#s=<payload>` | URL **fragment**（サーバへ送られない） | **不可** — fragment は unfurl できない（OGP クローラに届かない） |
| `https://karasu.kompiro.dev/s?s=<payload>` | URL **query**（サーバから見える） | **これを taka が指す** |

**`/s?s=`（query）** 形を taka（`https://taka.kompiro.dev/<slug>`、server-side 302）
で短縮する。短縮リンクの宛先は **query 形でなければならない** — query 形だけがサーバ
に届き、共有ごとの OGP カード（リンクプレビュー）を返せて、Slack / Discord / X に
貼っても unfurl されるからである。`#s=`（fragment）はブラウザでは開けるが unfurl
では何も出ない — 短縮も貼付もしないこと。

## permalink の 2 つの形

| 形 | 長所 | trade-off |
| --- | --- | --- |
| **taka 短縮リンク** *(karasu の選択)* | クリーンで ADR に載る小ささ | クリックのリンクは taka を*経由*して解決する — なので `source` と併記し、taka が消えたら repo から再構成する |
| **凍結 `/s?s=` payload** | immutable・shortener 不要（モデル全体が URL に埋まる） | **数 KB** に及びうる — ADR に置くには大きすぎる |

karasu は **taka 短縮リンク + `source`** を記録し、生の payload は**インライン
しない**。再現性は `source` の `.krs`（ADR の commit 時点）から得る。source の真の
ref-pin は [#1828](https://github.com/kompiro/karasu/issues/1828) で別途追う。

> **trust note**: 短縮リンクの背後の `/s?s=` スナップショットには図が入っており、
> taka の datastore がその宛先を保持する。機密性のある構造では**短縮しない**
> （長い URL を許容する）か、**自前のシュリンカ**を使うこと — 規約は図を第三者に
> 預けることを強制しない。

## 1 要素を指す（deep permalink）

[deep permalink](../spec/permalink.ja.md)（1 要素にドリルした状態で開くリンク）は、
対象要素を author-given な `id` で指す。例: `source` に
`system.krs#krs-system-payment-api`。identity は常に `id` であり、`label` では
ない。

## worked example

`examples/en/feature-samples/minimal.krs` の構造を共有した例:

- **permalink**（ADR に貼る）: `https://taka.kompiro.dev/<slug>` — taka 短縮リンク。
- **解決先**（taka が 302 する `/s?s=` スナップショット）:
  `https://karasu.kompiro.dev/s?s=bZBBasMwEEWv8tG2NIYus-iilO66Kt1pI9uDM0QeF42SEkKgh-gJc5KM7DgmEBBC8_X-12iObpvUrV1VoWfhPsSVCV6sfqd-EM0pZNI18oagdh1JM_YhcotCguVnl3H--4ceNFOPJ7xAKe25IbVCD9JUoeygtiNdjdnfSpbIimALdVCKLITfDQlYhxgyS4dE0lIqp3rXFaeX6yOfU684egFiqCnCu1n8GhnvCo-5F3ykQbIFTp7FNeuFB073prfQbB94rvKd5Zb__Iqbz7vx543NbYIXyrCFmgY0Y5boThc`
- **source**（必須・記録）: `examples/en/feature-samples/minimal.krs`。

読者がクリックするのは短縮リンク、`source` は短縮リンクが切れても構造を復元可能に
保つもの。

## 2 つの層: portable convention (L1) と adr-tools reference (L2)

あなたの ADR は**あなたの** repo に**あなたの**規約で存在する — karasu はそこに
ファイル配置や frontmatter スキーマを強制できない。karasu ユーザーは adr-tools /
Log4brains / 素の Markdown など、それぞれ*どこに*参照を置くかの流儀が異なる ADR を
持ちうる。そこで規約を 2 層に分ける: 全ユーザーが従える層と、ツールを opt-in した
repo 向けのより厳密な層である。

- **L1 — portable convention（上記すべて）**。*何を記録するか*だけを縛る: 構造への
  短縮 permalink ＋ **必須 `source`**。ADR の*どこに*リンクを置くかは縛らないので、
  任意の ADR ツール・任意の配置で動く。これが baseline — 従えば、ツールに依らず
  ADR のリンクは復元可能に保たれる。
- **L2 — adr-tools reference 実装**。[`@kompiro/adr-tools`](https://www.npmjs.com/package/@kompiro/adr-tools)
  を採用した repo は、L1 のより厳密で機械検証可能な形を得る: `permalink:` frontmatter
  フィールド（taka `short` ＋ 必須 `source`）＋生成される本文サマリで、ツールが検証
  する。リンクの*置き場所*を固定し、linter で強制できる。karasu 自身の `docs/adr/` は
  L2 を dogfooding 兼 L1 の reference 実装として使う — frontmatter スキーマは
  `.claude/rules/adr.md` を参照。

要するに **L1 が規則（短縮リンク ＋ `source` を記録する）、L2 はそれを満たす強制手段の
一つ**である。adr-tools を使わないなら、ADR フォーマットが参照を置く場所に L1 を適用
すればよい — ツールなしで同じ耐久性が得られる。L2 の `permalink:` の検証（`source` の
`.krs` 実在・`short` の解決）は [#1830](https://github.com/kompiro/karasu/issues/1830)
で追う。

> Related TPLs: [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)
> — ADR permalink は record ではなく pointer。shortener や URL の形が消えても構造が
> 残るよう、常に in-repo `.krs` の `source` を記録する。

## 関連

- [`docs/spec/permalink.ja.md`](../spec/permalink.ja.md) — deep-permalink アンカー文法（`#krs-<view>-<id>`）
- [LLM でリバースエンジニアリング](reverse-engineering-with-ai.ja.md) — `.krs` を生成して Share / `/render` する
- [図の共有（style・legend・CI）](05-communicating-diagrams.ja.md) — Share ボタン・`/render` 埋め込み・CI での鮮度維持
