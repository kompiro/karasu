---
paths:
  - "docs/acceptance/**/*.md"
---

# AT レコードを書くときのルール

**到達状態**: `pnpm at:check-coverage` が finding ゼロで通る（marker / krs fence /
design-doc references のすべて）。

`docs/acceptance/**` の書き方の正本はこのファイル。`docs/process.md` は
`docs/acceptance/` がどういう置き場かだけを持ち、書き方はここに集約している。

## 自動化アノテーションの書式

自動化されたケースは、`/hane:acceptance-test` スキルの「自動化アノテーション」節に
従って `> ✅ Automated — <path> › <test name>` 形式の blockquote を箇条書き直下に
添える。`at:check-coverage` はこの形を canonical として検査する。

## 設計根拠は Issue で指す（`docs/design/` を指さない）

Design Doc は ADR に昇格した時点で削除される。AT から `docs/design/` を指すと、
**規約上いつか必ず切れるアドレス**を記録に埋め込むことになる。

代わりに **Issue を指す**。Issue は削除されず、design PR と実装 PR の両方へ辿れる。
ADR が既にあるならそれも併記する:

```markdown
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)
- **設計 (ADR)**: [ADR-2259](../adr/2259-permalink-payload-cap.md)
```

実装 PR の時点ではまだ ADR が無いので Issue だけでよい。ADR の番号は起点 Issue 番号と
一致する規約（[ADR-2188](../../docs/adr/2188-tpl-issue-number-ids.md)）だが、
**ファイルが存在しないうちにリンクを書かない** — 前方参照は切れたリンクと区別が
つかない。昇格 PR で `- **設計 (ADR)**: …` を足す。

強制は `pnpm at:check-coverage`（`--strict` で落ちる）。決定は
[ADR-2348](../../docs/adr/2348-at-records-point-at-issues.md)。

## 手動項目の到達先は本番 URL

`🧑 Manual` 項目は**一度 OK にして終わるものではない**（実機確認は再実行される前提で、
チェックは常に未チェックのまま置かれる）。そのため到達先には、記録より寿命の短い参照を
書かない。

| 対象 | 書く URL |
| --- | --- |
| app | `https://karasu.kompiro.dev/`（`deploy.yml` が main への push で更新） |
| docs-site | `https://kompiro.github.io/karasu/`（`pages.yml` が main への push で更新） |

**ローカル dev サーバの起動コマンドも、ブランチ名入りの Cloudflare preview URL も
書かない。** 前者は読み手にチェックアウトを要求し、後者は PR がマージされた時点で
404 になる。PR 内で変更を先に見たいときは preview を使ってよいが、それは PR 本文の
Preview URL 欄の役割であって、AT に残す情報ではない。

## 埋める `.krs` スニペットは fence で主張を宣言する

手順に書いた `.krs` は誰も実行しないため、放っておくと文法から静かにズレる。
`at:check-coverage` が ` ```krs ` ブロックを実際に parse するので、情報文字列で
そのスニペットが何を主張しているかを宣言する。

| fence | 主張 | ガード |
|-------|------|--------|
| ` ```krs ` | 現行文法で通る完全なモデル | parse エラーゼロを検証 |
| ` ```krs fragment ` | 抜粋（ファイル全体ではない） | parse しない |
| ` ```krs invalid ` | 意図的に不正な入力（診断のデモ） | いまも parse エラーが出ることを検証 |

`invalid` を逆向きにも検証するのは、文法が緩んで例が例でなくなる変化も拾うため。

## 観点

到達先の 2 節（Issue を指す / 本番 URL）はどちらも同じ観点の適用である — 記録は、
記録より長生きするアドレスを指す
（[TPL-2254](../../docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。
`.krs` fence は
[TPL-2047](../../docs/test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)。
