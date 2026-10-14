---
paths:
  - "docs/acceptance/**/*.md"
---

# AT レコードを書くときのルール

**到達状態**: `pnpm at:check-coverage` が finding ゼロで通る（marker と design-doc
references の両方）。埋めた `.krs` は `pnpm run lint:krs-fences` が別途 parse する。

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

## AT が答えるのは「その Issue が実現できたか」

**到達状態**: 各受け入れ条件が Issue の達成を判定していて、判定手段が自動テストで足りるなら
手動項目は存在しない（`## 手動確認` は `N/A — 自動テストですべて覆っている`）。

AT は**チケットが実現できたかを評価するテスト**であって、人が目で見た記録ではない。
自動テストで判定できる条件は、それで充足している — 同じ条件を手動項目に写して二重に置かない。

手動項目を書くのは、**判定そのものに実機が要るとき**だけ。見た目の確認、拡張ホストの挙動など、
自動テストが原理的に届かない範囲に限る。

**こちらから起こせない事象を待つ項目は書かない。** 「本番で X が失敗したら確認する」は
実施時期がこちらの手にないため再実行できず、未チェックのまま「まだやっていない」のか
「実施不能」なのかが永久に区別できない。その経路を観測したいなら、**事象を起こせる手段**
（再現ハーネス、強制失敗の経路）を作る側で解く — AT の項目にしても検証は 1 度も走らない。

## 手動項目は、マージ前に確かめられるものだけ

**到達状態**: どの手動項目も、その PR の preview かローカルの checkout で確かめられ、
マージ前に PR の Manual Verification Checklist で消化されている。

判断基準は 1 つ、**その項目をマージ前に確かめられるかどうか**。PR テンプレートが
Manual Verification Checklist と Post-merge follow-ups を分ける基準と同じである。
マージ後にしか確かめられない検査はマージを止められないので、受け入れテストとして
機能しない。

| 確かめられる場所 | どこに書くか |
| --- | --- |
| その PR の preview、またはローカルの checkout | AT の手動項目。マージ前に PR の Manual Verification Checklist へ写してチェックする |
| 本番にしか現れないもの（デプロイ設定、OAuth、カスタムドメインなど） | AT には書かない。PR の Post-merge follow-ups に置き、Issue へ載せる |

**AT は手動項目の定義を持ち、チェックは PR で入れる。** AT の `- [ ]` は常に未チェックの
まま置き、「この領域を変える PR が確かめる項目の一覧」として読む。チェック済みの状態は、
それを確かめた PR の Manual Verification Checklist に残る。

## 手動項目には入力と期待結果を書き、URL は書かない

AT に書くのは、**何を開いて何を見るか**（埋めた `.krs`、操作、期待する見え方）までで、
どの URL で開くかは書かない。確かめる場所はその PR の preview かローカルの checkout で、
preview の URL は PR 本文の Preview URL 欄に出る。

**ブランチ名入りの preview URL も、本番 URL も、ローカル dev サーバの起動コマンドも
書かない。** preview URL は PR がマージされた時点で 404 になる。本番 URL を書くと、
マージ後にしか確かめられない検査だと読める（上の節）。app で開く入力は `index.krs` として
開く前提で書く（app はそれ以外のファイル名を開かない）。

## 埋める `.krs` スニペットは fence で主張を宣言する

正本は `.claude/rules/krs-fences.md`（AT・spec・guide・concepts に共通、
`pnpm run lint:krs-fences` が検証する）。手順に書いた `.krs` も例外ではない。

## 観点

「Issue を指す」と「URL は書かない」はどちらも同じ観点の適用である。記録は、
記録より長生きするアドレスを指す
（[TPL-2254](../../docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。
手動項目をマージ前に限る決定は [ADR-3169](../../docs/adr/3169-at-manual-items-before-merge.md)。
`.krs` fence は
[TPL-2047](../../docs/test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)。
