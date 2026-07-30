---
id: TPL-2005
title: "keystone・permalink の coined 用語は単一の正典（docs/glossary.md）を持つ — 他 doc は再定義せず参照する"
status: active
date: 2026-07-16
applicable_to:
  - "keystone 由来の用語（read / record split・funnel / retained・record-as-byproduct・source of truth / 描画層・supply → share → explore）や permalink family（deep / repo-backed / ref-pinned / inline snapshot）を定義・言い換えする文を追加・変更するとき"
  - "PRD（docs/prd/keystone-primary-path.md）・ロードマップ（docs/roadmap.md）・permalink epic・ADR で上記の用語を説明したくなったとき（定義を再掲する誘惑）"
  - "docs/glossary.md / docs/glossary.ja.md の項目を追加・変更するとき、および permalink 機構が変わって permalink.md / design doc / ADR 側の記述が動いたとき"
  - "新しく壁打ち・PRD で load-bearing な語彙を coin したとき（恒久的な定義場所を最初から決めるため）"
  - "version vocabulary（互換性の軸・notation tier / annotation の主語区別・言語版表記）を定義・言い換えする文を追加・変更するとき — この語彙の正典は docs/glossary.md ではなく docs/roadmap.md §version vocabulary（ADR-2124）"
known_consumers:
  - check-links（packages/docs-site/scripts/check-links.ts）
  - glossary（docs/glossary.md · docs/spec/glossary.md）
discovered_from:
  - root_cause_file: "docs/glossary.md"
  - root_cause_adr: "docs/adr/1829-adr-permalink-convention.md"
related_to:
  - TPL-1296
  - TPL-1621
topic: build
scope:
  packages:
    - docs-site
---

# TPL-2005: keystone・permalink の coined 用語は単一の正典を持つ

## 観点

keystone 壁打ち（[#1825](https://github.com/kompiro/karasu/pull/1825)）が coin した
load-bearing な用語 — **read / record split**・**funnel / retained**・
**record-as-byproduct**・**source of truth / 描画層**・**supply → share → explore** と
permalink family（**deep** / **repo-backed** / **ref-pinned** / **inline snapshot**）— は、
PRD・permalink epic（[#1826](https://github.com/kompiro/karasu/issues/1826)）・ロードマップ・
ADR にまたがって使われる。定義を各所に散らして書くと、片方だけ更新されて**静かに drift**
する（[#1831](https://github.com/kompiro/karasu/issues/1831) が起票された動機そのもの）。

これは [`docs/glossary.md`](../glossary.md)（keystone・permalink 用語集）を**単一の正典**とし、
**他ドキュメントは定義を再掲せず用語集を参照する**ことで防ぐ。TPL-1296 が
「spec doc ↔ in-app reference」の dual-representation に対してやっていることを、
「coined 用語の定義 ↔ それを使う PRD / roadmap / epic / ADR」の軸に広げたもの。

構造として次の 2 つの規定がある:

1. **定義は用語集一本**。PRD・roadmap・epic・ADR で用語を*使う*のは良いが、その場で
   *定義し直さない*。定義が要る箇所は `docs/glossary.md` の当該項目へリンクする。
   PRD（旧「用語集」節）は定義を持たず用語集への back-ref だけを残す。
2. **用語集は機構ドキュメントと矛盾しない**。permalink family の各項目は
   [`docs/spec/permalink.md`](../spec/permalink.md)（deep anchor contract）・repo-backed /
   ref-pinned の design doc・permalink ADR に機構が住む。用語集はそれらへリンクし、
   定義がリンク先と食い違わないようにする（TPL-1296 の「再掲は正典と矛盾しない」）。

この 2 つに加え、用語集は 2 面（EN `docs/glossary.md` / JA `docs/glossary.ja.md`）と
モデリング言語用語集 [`docs/spec/glossary.md`](../spec/glossary.md) との相互リンクを持つ。
in-site リンク（published ページ間）は `check-links`（TPL-1621）が解決を縛るが、
**用語集が参照する PRD / roadmap / design doc / ADR は unpublished なので GitHub URL に
rewrite され、check-links の検査対象外**である点に注意 — これらのリンク切れは機械検出
されないので、リンク先ファイルの rename / 削除（例: design doc の ADR 昇格）時は用語集の
リンクを手で追随させる。

## 想定される失敗モード

- ロードマップや新しい ADR で「funnel / retained とは…」と定義を書き直し、用語集の定義と
  ニュアンスがずれる（例: 用語集は「nest = funnel、再訪の主軸ではない」だが、別 doc で
  「nest = retained core」と書いてしまう — keystone 壁打ちで実際に一度誤った線）。
- permalink の機構が変わった（例: repo-backed が ref-less default HEAD を採るように
  なった）のに用語集の説明が旧機構のまま残り、`permalink.md` / design doc と矛盾する。
- design doc（repo-backed-ref-pinned-permalink.md 等）が ADR に昇格して削除されたのに、
  用語集の GitHub URL リンクが 404 のまま残る（check-links は unpublished リンクを検査
  しないため気づけない）。
- 新しく PRD で語彙を coin したが恒久的な定義場所を決めず、その doc の中だけに定義が
  埋もれて後続の Issue 展開時に散逸する（#1831 と同じ状況の再発）。
- `docs/glossary.md` を PUBLISHED_EN_FILES に足したが `.ja.md` の相互リンクや sidebar
  登録（astro.config.mjs）を忘れ、片言語だけ / orphan ページになる。

## チェックリスト

keystone / permalink の用語を扱う doc を変更するときに確認する:

- [ ] 用語の**定義**を書いているなら、それは `docs/glossary.md` か。他 doc では定義せず
      用語集へリンクしているか。
- [ ] `docs/glossary.md` / `.ja.md` の permalink 項目が `docs/spec/permalink.md`・repo-backed /
      ref-pinned の design doc・permalink ADR の機構と矛盾していないか。
- [ ] EN / JA 両ファイルを更新したか。両者と `docs/spec/glossary.md`（モデリング言語用語集）
      との相互リンクが生きているか。
- [ ] 用語集が参照する unpublished doc（PRD / roadmap / design doc / ADR）を rename / 削除
      したなら、用語集側のリンクを追随させたか（check-links は検出しない）。
- [ ] `pnpm --filter docs-site check-links` が通るか（published ページ間のリンク・アンカー解決）。
- [ ] 新規 published ページを足したなら PUBLISHED_EN_FILES + astro.config.mjs sidebar +
      `.ja.md` sibling が揃っているか。

## 派生元

- 恒久的な定義場所の原則: [`docs/glossary.md`](../glossary.md)（本 TPL が守らせる正典）。
- 起票の動機: [#1831](https://github.com/kompiro/karasu/issues/1831)（coined 用語の drift 懸念）。
- 用語の初出: PRD [`docs/prd/keystone-primary-path.md`](../prd/keystone-primary-path.md)。
- permalink 機構の正典: [`docs/spec/permalink.md`](../spec/permalink.md) /
  [ADR-1829](../adr/1829-adr-permalink-convention.md)。
