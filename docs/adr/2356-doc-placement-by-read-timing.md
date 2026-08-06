---
id: ADR-2356
title: 開発規約は「いつ読まれるか」で置き場を決める — 常時 / 発火時 / 編集時の 3 層
status: accepted
date: 2026-08-05
topic: build
authors: [kompiro]
refines: [ADR-2351]
related_to:
  - ADR-2348
  - ADR-2331
scope:
  packages: []
assumptions:
  - "file: docs/process.md"
  - "file: docs/release.md"
  - "file: .claude/rules/README.md"
  - "grep: docs/process.md :: 規約の所在"
  - "grep: .claude/rules/spec-audit.md :: proactive TPL"
---

# ADR-2356: 開発規約は「いつ読まれるか」で置き場を決める — 常時 / 発火時 / 編集時の 3 層

- **日付**: 2026-08-05
- **ステータス**: 決定済み
- **関連**:
  - 起点 PR: [#2354](https://github.com/kompiro/karasu/pull/2354)（`docs/release.md` の切り出し）/ [#2356](https://github.com/kompiro/karasu/pull/2356)（編集時規約の移設）。対応する Issue は無い
  - [ADR-2351](2351-process-md-holds-instructions.md)（process.md は「今どうするか」だけを持つ。本 ADR はその未決 2 件に答える）
  - [ADR-2348](2348-at-records-point-at-issues.md)（AT は Issue を指す。移設した規約の 1 つ）、[ADR-2331](2331-adr-automerge-scope.md)
  - 層の定義: `.claude/rules/README.md`「どの層に書くか」
  - 地図: `docs/process.md`「規約の所在」

## 背景

ADR-2351 は process.md から経緯を外して 35,677 → 29,305 バイトにしたが、未決を 2 つ残した。リリース運用と Dependabot 運用を切り出すか、そして `.claude/rules/` との棲み分けをどうするか。

残っていた内容を「誰がいつ読むか」で見ると、性質の違う 3 種類が 1 ファイルに同居していた。

- **全員が毎回読む必要があるもの** — ドキュメントの置き場、ブランチ戦略、Issue ラベル、PR フロー。着手前に知っていないと動けない。
- **特定の作業をするときだけ要るもの** — リリース手順、Dependabot PR の処理。リリースを出さない大多数のセッションには不要。
- **特定のファイルを編集するときだけ要るもの** — AT の書式、ADR の昇格手順、spec に節を足すときの proactive TPL、スライス追跡。

`CLAUDE.md` が「作業開始時は必ず `docs/process.md` を読む」と指定しているため、**3 種類すべてが毎セッションのコンテキストに載っていた**。

さらに 2 つは移設ですらなく重複だった。`.claude/rules/program-slices.md` は process.md のスライス節の完全な上位互換で、しかも末尾から process.md を指し返していた。`.claude/rules/adr.md` も内容の大半を持ちながら残りを process.md に委ねていた。

## 決定

**開発規約は「いつ読まれるか」で置き場を決める。3 層に分け、同じ規約を 2 か所に置かない。**

| 層 | 読まれるタイミング | 置き場 | 例 |
| --- | --- | --- | --- |
| 常時 | セッション開始時（`CLAUDE.md` が指定） | `docs/process.md` | ライフサイクル、ブランチ戦略、Issue ラベル、PR フロー |
| 発火時 | その作業を始めたとき | `docs/*.md`（`release.md` 等） | リリース手順、Dependabot PR の処理 |
| 編集時 | 該当ファイルを編集するとき（`paths:` trigger） | `.claude/rules/*.md` | AT の書式、ADR 昇格、spec の proactive TPL、スライス追跡 |

- **`docs/process.md` は「規約の所在」表を持つ。** 何がどこにあり、何で発火するかを 1 か所で引ける状態を保つ。移設しても地図は失わない。
- **編集時の規約は `.claude/rules/*` が正本。** process.md 側にコピーを残さない。
- **発火時の手順を `.claude/rules/` に置かない。** rules は `paths:` にマッチする**ファイル編集**でしか発火しないので、ファイルを編集しない作業（リリース、PR トリアージ）には届かない。Dependabot の運用が `.claude/rules/dependabot.md` ではなく `docs/release.md` にあるのはこの理由である（rules 側は入口の宣言とショートカットに留める）。

適用結果: `docs/process.md` は 29,305 → 12,659 バイト。ADR-2351 と合わせて 35,677 → 12,659（-65%）。

## 理由

- **読まれる頻度がコストを決める。** ADR-2351 と同じ原理を、経緯ではなく規約そのものに適用した。リリース手順は正しい内容であっても、リリースしないセッションが読めば純粋な浪費である。
- **`.claude/rules/README.md` が既に答えを書いていた。** 「指示は『変えたい行動の直前に、短く、毎回届く』層に置くほど効く」。編集時の規約を process.md に置くのは、効きが最も弱い層（`CLAUDE.md` / `docs/`）に、最も効く層（`paths:` trigger）が使えるものを置いていたということである。コンテキスト削減は副産物で、本来の理由は**届くタイミング**にある。
- **重複が実際に発生していた。** 4 ブロックのうち 2 つは移設ではなく単一正本化だった。2 か所に同じ規約があると、片方だけ更新されて必ず乖離する。`program-slices.md` が process.md を指し返していたのは、どちらが正本か決まっていなかった証拠である。
- **地図さえ残れば移設は損をしない。** 「規約の所在」表があるので、どこに何があるかは常時層から 1 ホップで引ける。表そのものは 12 行で、移設した 7 KB より遥かに安い。

## 却下した案

- **process.md を分割せず、内容だけさらに削る** — ADR-2351 の続きとして自然だが、削れるのは表現であって、リリース手順の**内容**は削れない。読む必要がない人に読ませている構造は変わらない。
- **Dependabot 運用も `.claude/rules/dependabot.md` に移す** — 編集時層に寄せれば一貫するが、あのルールは `.github/dependabot.yml` の編集で発火するので、**Dependabot PR をトリアージする瞬間には届かない**。発火条件と必要になる瞬間が噛み合わない移設は、規約を届かなくするだけである。
- **`CLAUDE.md` の「必ず読む」を外す** — 最大の削減になるが、常時層が消えると着手前に知るべきことが誰にも届かなくなる。ADR-2351 でも同じ理由で却下した。
- **`.claude/rules/` を増やさず `docs/` を細かく分ける** — doc は参照時にしか読まれないので、編集の直前に自動で届く性質が得られない。`paths:` trigger を使わない理由が無い。

## 未決（本 ADR の範囲外）

- **常時層に残った規約の再点検** — ブランチ戦略や Issue ラベルの一部は `CLAUDE.md` と重複している。3 層の外側にある `CLAUDE.md` との棲み分けは別途。
- **発火時層のカバレッジ** — 現在 `docs/release.md` だけ。QA チェックリストや sibling repo の clone 手順も発火時に近いが、短いので常時層に残している。増えたら見直す。
