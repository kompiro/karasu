---
id: ADR-3595
title: docs/adr/README.md の手書き一覧をやめ、topic の語彙と生成物への入口にする
status: accepted
date: 2026-11-07
topic: adr-tooling
related_to: [ADR-788, ADR-3289, ADR-3416]
assumptions:
  - "grep: docs/adr/README.md :: effective\\.md#adr-tooling"
  - "grep: docs/adr/README.md :: graph/adr-tooling\\.md"
  - "symbol: scripts/lint/concept-adr-refs.ts :: parseTopicLinks"
  - "symbol: scripts/lint/concept-adr-refs.ts :: parseEffectiveTopics"
  - "grep: lefthook.yml :: docs/adr/effective\\.md,docs/adr/graph/\\*\\.md"
---

# ADR-3595: docs/adr/README.md の手書き一覧をやめ、topic の語彙と生成物への入口にする

- **日付**: 2026-11-07
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3595](https://github.com/kompiro/karasu/issues/3595)（PR [#3587](https://github.com/kompiro/karasu/pull/3587) で CodeRabbit が新しい ADR の README 追記を求めたのが発端）。Design Doc PR [#3603](https://github.com/kompiro/karasu/pull/3603)、実装 PR [#3611](https://github.com/kompiro/karasu/pull/3611)
  - 生成物を正本の写しにした決定: [ADR-788](788-adr-knowledge-graph.md)
  - 生成物を毎日の再生成 PR で更新する決定: [ADR-3416](3416-regenerate-adr-index-daily-pr.md)
  - 姉妹の作業: TPL の README 表を生成した索引に置き換えた [ADR-3289](3289-tpl-index-daily-regeneration.md)
  - 関連 TPL: [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（「どこからも消す」は検索で閉じる）、[TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md)（正典は 1 か所）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（整合の検査は両側の変更で起動する）

## 背景

`docs/adr/README.md` の冒頭は「新しい ADR を追加した際は、このインデックスにもエントリを追加すること」と書いていた。
しかし手書きの一覧は ADR の集合から大きく離れていた（2026-11-04 時点）。

|             | README の一覧 | 実際（frontmatter）                                              |
| ----------- | ------------- | ---------------------------------------------------------------- |
| トピック別  | 146 件        | `effective.md`（accepted かつ非 superseded）450 件               |
| Not adopted | 5 件          | `status: not_adopted` 7 件（2 件が載っていない）                 |
| 合計の掲載  | 151 件        | ADR ファイル 482 件                                              |

誰もこの手順を踏んでおらず、それでも困っていなかったのは、読者が実際に使う一覧が別にあるからである。
ADR-788 が frontmatter を正本にし、`effective.md` と `graph.md` / `graph/<topic>.md` を生成物にした。
それでも一文は残っていたので、規則を文字どおり読むレビュアーは追記を求め続けた（#3587 の CodeRabbit）。
2/3 が欠けた一覧に 1 件足しても一覧は正しくならず、手順だけが残る。

README は一覧のほかに、topic の見出しと説明（`docs/process.md` が「各 topic が何を含むかは README の見出しで判断する」と指す）、
`> Derives from` の back-ref（`scripts/lint/concept-adr-refs.ts` が検査する）、`adr.config.json` の `topics` と一致する見出し
（`.claude/rules/adr-topics.md`）という役割を持っていた。一覧をやめても、これらは残す必要がある。

## 決定

README から ADR の一覧（トピック別の `- [ADR-n]` 行と「ステータス別 > Not adopted」）と追記の指示を消し、
topic の語彙と生成物への入口にする。

- 残すもの: ADR の置き方（`<n>-<slug>.md`）、`## トピック別` の見出し、各 topic の見出し・説明・`> Derives from`
- 足すもの: 各 topic の `effective.md#<topic>` と `graph/<topic>.md` へのリンク、冒頭の一覧の場所の説明、`not_adopted` / `superseded` を frontmatter の `status:` で探す grep
- `concept-adr-refs.ts` を広げ、各 topic の節が上の 2 つのリンクを持つことを error で検査する。リンク先がまだ無いときは warning にする（下記）
- `lefthook.yml` の `concept-adr-refs` の glob に `docs/adr/effective.md` と `docs/adr/graph/*.md` を足す（TPL-1480）

## 理由

- 追記する手順そのものが無くなるので、ずれる場所が無くなる。正本は frontmatter 1 か所で、一覧はそこからの生成物だけになる（TPL-2005）
- ADR-788 の「frontmatter を正本、その他は生成物」と同じ線を README にも引く。新しい仕組みを足さない
- topic の語彙・説明・`> Derives from` が残るので、`process.md` / TEMPLATE / lint / rule の参照を変えずに済む
- README と既存の lint の拡張だけで閉じ、`@kompiro/adr-tools` のリリースを待たない
- 新しく置くリンクを見る検査が他に無い。docs site の `check-links` は ADR を範囲外にし、`record-source-paths.ts` は `docs/adr/**` を走査しない。`concept-adr-refs.ts` はすでに README を topic ごとに読み、`topics` も読んでいるので、ここに足すのが最も小さい

### リンク先が無いときは warning にする

Design Doc は、生成物がどの topic にも見出しとファイルを出す前提で、リンク先の不在も検査の失敗にするとしていた。実装時に adr-tools を読むと、
この前提は成り立たなかった。`effective.md` の `## <topic>` は現役の ADR を持つ topic にだけ、`graph/<topic>.md` は ADR を持つ topic にだけ出る。
ADR の PR は生成物を含めない（ADR-3416）ので、失敗にすると、topic を足す PR が次の再生成 PR まで通らなくなる。

そこで判定を分けた。README のリンクの欠落は書き損じなので error、リンク先の不在は再生成で解消する一時的な状態なので warning にする。
実 repo に warning が無いことを確かめるテストは、名前どおり `Related ADR topics` の注釈の warning だけを見るように絞った。

## 却下した案

- **README の一覧を再生成 PR で生成する**: README を開くだけでタイトルが並ぶが、`effective.md` と同じ一覧の生成先が 2 つになる。手書きの説明と生成部分が同じファイルに混ざり、再生成 PR は生成物だけを変える前提（`check-generated.ts`、ADR-3416）なので、マーカー区間の扱いを adr-tools と karasu の両方に足すことになる。adr-tools のリリースも要る
- **欠けている 325 件を手で埋め、追記の指示を残す**: 一度だけ直るが、ずれた原因（誰も踏まない手順）が残るので、また同じだけずれる
- **README を消し、topic の説明を `adr.config.json` に移す**: `concept-adr-refs.ts`・`lefthook.yml`・AT 1389・`.claude/rules/adr-topics.md`・`process.md` など、README の見出しを前提にした参照をすべて作り直すことになり、一覧の問題を解くのに対して変更が大きすぎる

## 受け入れた帰結

- README を開いただけでは ADR のタイトルが並ばず、1 クリック先の `effective.md` を見る必要がある
- 「Not adopted」を一目で見る面が無くなり、grep の 1 行で代える
- README に一覧が戻ってこないことは機械で守らない。追記の指示を消せば戻す動機が無く、`- [ADR-` 行の有無を検査するガードは守る価値に対して重い。再発したら検討する
