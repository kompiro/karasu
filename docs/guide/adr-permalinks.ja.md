# ADR から karasu の構造へリンクする（permalink）

> [English](adr-permalinks.md) · **日本語**（このファイル）

アーキテクチャ上の判断をしたら、その結果の構造を in-repo の `.krs` に記録し、
ADR（Architecture Decision Record）から**それにリンク**する — こうすると判断の
読者がその図を開ける。本レシピは、そのリンクを**再現・監査可能**な形で書くため
の規約であり、opaque で死んだ URL を貼らないためのものである。

karasu のホスト版アプリ（**karasu-nest**）の **🔗 Share** ボタンは、プロジェクト
全体（`.krs` ＋ その `.krs.style`）を自己完結した URL にエンコードする。本ガイド
が答えるのは*その URL を ADR にどの形で貼り、隣に何を書くか*だけである。

## 一行で言うと

**正（source of truth）は自己完結した `/s?s=<payload>` URL を貼る。** 短縮 URL
（taka でも他のシュリンカでも）は任意の差し替え可能な*別名*であり、正にはしない。

## なぜ `/s?s=` payload が正なのか

Share ボタンは同じプロジェクトに対して 2 本の URL を作る:

| URL の形 | payload の置き場所 | ADR に貼る？ |
| --- | --- | --- |
| `https://karasu.kompiro.dev/#s=<payload>` | URL **fragment**（サーバへ送られない） | **不可** — fragment は unfurl できない（OGP クローラに届かない） |
| `https://karasu.kompiro.dev/s?s=<payload>` | URL **query**（サーバから見える） | **これが正** |

`<payload>` はプロジェクトを **URL に凍結**したもの — `.krs` を deflate 圧縮した
自己完結スナップショットである。この immutability こそ ADR が求めるもので、ADR は
*point-in-time* の記録だから、現在の（変わっているかもしれない）版ではなく
**判断時点**の構造を指すべきである。

`#s=`（fragment）ではなく **`/s?s=`（query）** を使うこと: query 形だけがサーバに
届き、共有ごとの OGP カード（リンクプレビュー）を返せて、Slack / Discord / X に
貼っても unfurl される。fragment 形はブラウザでは開けるが unfurl では何も出ない。

## 短縮は任意 — そして差し替え可能

`/s?s=` URL は長い（数百文字〜数 KB）。可読性のために **taka**
（`https://taka.kompiro.dev/<slug>`）や他のシュリンカで短縮してよい — server-side
302 で `/s?s=` 宛先へ飛ばす。

短縮 URL は**表示用の別名であって正ではない**ものとして扱う:

- 短縮 URL は **opaque** — `https://taka.kompiro.dev/TkrZQG` を見ても後の読者には
  何を指すか分からず、シュリンカのレコードが削除・期限切れになると、ADR は構造を
  失ったうえにそれを検出する術もない。
- 対して `/s?s=` payload はそれ自体が**構造**である — decode すれば `.krs` が戻る。
  だから ADR が payload を保持している限り、シュリンカが消えてもリンクは生き残る。

したがって: 正の記録は `/s?s=` payload に保ち、短縮 URL は利便のためだけに足す。
**短縮しない**（長い URL をそのまま貼る）のも完全に正当な選択である。

> **trust note**: `/s?s=` payload には図が入っている。短縮するとそのシュリンカ
> （taka の datastore や利用したサービス）が図を埋め込んだ URL を保持することに
> なる。機密性のある構造では**短縮しない**か、**自前のシュリンカ**を使うこと —
> 規約は図を第三者に預けることを強制しない。

## 任意: living source への辿り道

payload は凍結スナップショットである。**living** な `.krs`（repo 内の source of
truth）への辿り道も残すなら、リンクの隣に in-repo path を添える:

- `source: examples/payments/system.krs` — 構造の元になったファイル。
- [deep permalink](../spec/permalink.ja.md)（1 要素にドリルした状態で開くリンク）
  なら、対象要素を author-given な `id` で指す。例:
  `system.krs#krs-system-payment-api`。identity は常に `id` であり、`label` では
  ない。

これは任意の traceability で、payload 単体ですでにリンクは再現可能である。

## worked example

`examples/en/feature-samples/minimal.krs` の構造を共有した例:

- **正**（ADR に貼る）:
  `https://karasu.kompiro.dev/s?s=bZBBasMwEEWv8tG2NIYus-iilO66Kt1pI9uDM0QeF42SEkKgh-gJc5KM7DgmEBBC8_X-12iObpvUrV1VoWfhPsSVCV6sfqd-EM0pZNI18oagdh1JM_YhcotCguVnl3H--4ceNFOPJ7xAKe25IbVCD9JUoeygtiNdjdnfSpbIimALdVCKLITfDQlYhxgyS4dE0lIqp3rXFaeX6yOfU684egFiqCnCu1n8GhnvCo-5F3ykQbIFTp7FNeuFB073prfQbB94rvKd5Zb__Iqbz7vx543NbYIXyrCFmgY0Y5boThc`
- **短縮の別名**（任意・可読性のため）: `https://taka.kompiro.dev/<slug>`
- **source**（任意の traceability）: `examples/en/feature-samples/minimal.krs`

payload は構造そのものなので（decode すれば `.krs` が戻る）、短縮の別名を作らなく
ても・後で別名が切れても、正のリンクは生き残る。

## repo が `@kompiro/adr-tools` を使う場合

上記は **portable** な規約で、*何を書くか*だけを縛るので、任意の ADR ツール
（adr-tools / Log4brains / 素の Markdown / 無規約）と任意のファイル配置で動く。
ADR の*どこに*リンクを置くかは縛らない。

[`@kompiro/adr-tools`](https://www.npmjs.com/package/@kompiro/adr-tools) を採用した
repo は、より厳密で機械検証可能な形を得る: `permalink:` frontmatter フィールド
（`/s?s=` payload を正の値として持つ）＋生成される本文サマリ。karasu 自身の
`docs/adr/` はこれを reference 実装として使う — frontmatter スキーマは
`.claude/rules/adr.md` を参照。`permalink:` フィールドの検証（payload の decode、
任意 `source` の実在チェック、任意 `short` の解決チェック）は
[#1830](https://github.com/kompiro/karasu/issues/1830) で追う。

> Related TPLs: [TPL-20260630-02](../test-perspectives/TPL-20260630-02-adr-permalink-payload-is-canonical.md)
> — ADR permalink の正は自己完結 `/s?s=` payload であり、短縮 URL（taka 等）は
> 任意の別名で、必須依存にしてはならない。

## 関連

- [`docs/spec/permalink.ja.md`](../spec/permalink.ja.md) — deep-permalink アンカー文法（`#krs-<view>-<id>`）
- [LLM でリバースエンジニアリング](reverse-engineering-with-ai.ja.md) — `.krs` を生成して Share / `/render` する
- [図の共有（style・legend・CI）](05-communicating-diagrams.ja.md) — Share ボタン・`/render` 埋め込み・CI での鮮度維持
