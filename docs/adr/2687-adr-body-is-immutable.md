---
id: ADR-2687
title: ADR 本文は不変 — リンクの張り替えも本文編集として禁じる
status: accepted
date: 2026-09-02
topic: adr-tooling
authors: [kompiro]
related_to: [ADR-2648, ADR-706, ADR-830]
scope:
  packages: []
  concerns: [ci]
assumptions:
  - "grep: .claude/rules/adr.md :: 張り替えも本文編集である"
  - "grep: scripts/lint/record-source-paths.ts :: IS NOT SCANNED"
  - "file: scripts/lint/record-source-paths.ts"
---

# ADR-2687: ADR 本文は不変 — リンクの張り替えも本文編集として禁じる

- **日付**: 2026-09-02
- **ステータス**: 決定済み
- **Issue**: [#2687](https://github.com/kompiro/karasu/issues/2687)（表面化したのは [#2606](https://github.com/kompiro/karasu/pull/2606)）
- **関連**:
  - [ADR-2648](2648-record-source-path-guard.md)（記録が存在しないソースパスを指したら CI を落とす。`docs/adr/**` を除外した）
  - [ADR-706](706-rename-preview-column.md)（改名時に ADR 本文を変えないと決めた前例）
  - [ADR-830](830-adr-language-policy.md)（ADR の書き方の正本の所在）

## 背景

`.claude/rules/adr.md` が同じ問いに 2 つの答えを持っていた。

不変性の条項は「旧 ADR を書き換えず、新 ADR で `supersedes` する。旧 ADR は歴史的記録として残す」と書く。一方、auto-merge の適用条件に置かれた昇格の条項は「その Design Doc を指していた参照を、新 ADR に張り替える差分（**ディレクトリは問わない**）… 繋ぎ直すのは昇格の一部であって、別の判断ではない」と書く。「ディレクトリは問わない」は `docs/adr/**` に届くので、昇格 PR が既存 ADR の本文を編集してよいことになる。

#2606 が実際にそうした。ADR-2578 の「関連」行が、この PR 自身が削除する design doc を指していたので、新しい ADR-2592 へ張り替えた。レビューで不変性条項違反として報告され、どちらの条項も実在するため、規則の側を決める必要が生じた。

**CI は既に片側に立っていた。** [ADR-2648](2648-record-source-path-guard.md) のガード `scripts/lint/record-source-paths.ts` は、記録が存在しないソースパスを名指ししたら落ちる。その走査対象から `docs/adr/**` を意図的に外し、理由をファイル冒頭に書いている — 本文は当時の記録であり、現在の指し先は frontmatter が持つので、本文を放置しても失われるものは無い。つまり機械の側は「ADR 本文の staleness を受け入れる」と決めていた。散文の規則だけが両方を言っていた。

## 決定

**ADR 本文は着地後に編集しない。リンクの張り替えも本文編集として扱う。**

例外は supersede されたときの body ステータス行 1 つだけで、これは `pnpm adr:validate` が frontmatter 側と対で検査する。

現在の参照は frontmatter（`related_to` / `superseded_by`）が持ち、`pnpm adr:regenerate` が `graph.md` と `effective.md` に反映する。張り替えは ADR 本文**以外**のあらゆる記録に対して引き続き許可する。

## 理由

- **CI と規則が同じ線を引く。** ADR-2648 のガードは走査対象を「真であり続けることを期待される記録」（`docs/acceptance` / `docs/test-perspectives` / `docs/design`）に限り、ADR 本文を外した。張り替えの可否も同じ線に揃えれば、境界は 1 本になる。2 箇所で別々に引くと、今回のように食い違う
- **「張り替えだけ」は境界として保たない。** #2606 の差分は純粋な差し替えを超えて「本 ADR は方向を決め、構築の詳細はそちらが記録する」という関係の解釈を足していた。リンクの差し替えに要らない一文で、判断で線を引くと緩む実例そのものである（`.claude/rules/README.md` チェックリスト 5「単一の判定条件に畳む」）
- **frontmatter が既に役割を果たしている。** #2606 は同じ差分で `related_to: ADR-2592` を足しており、本文の一文が無くても ADR-2578 から ADR-2592 への到達性は失われない。しかも frontmatter は機械可読で、graph に出る
- **判定が観測可能な事実になる。** 「その行が frontmatter より下か」だけで決まり、書き手の自己判断が要らない

## 却下した案

### 現状維持（張り替えは昇格の一部として許可し続ける）

読者が旧 ADR から後継へ本文だけで辿れる利点はある。却下したのは、境界が判断であり続けるためである。実測すると **360 本の ADR のうち 97 本（26%）が既に本文を初版から変えている**。「ADR 本文は歴史的記録」は運用として既に守られておらず、許可条項がその漏れ口になっていた。CI がガードを持たない面なので、緩みを検出する手段も無い。

### 本文の張り替えを許し、ガードの走査対象に `docs/adr/**` を足す

規則と CI を揃えるもう一方の解。**張り替えを許す側に揃える**案だが、ADR-2648 がその走査除外を明示的に決めたばかりであり、除外理由（本文は当時の記録）は本 ADR の決定と同じ前提に立つ。覆すなら ADR-2648 を supersede する必要があり、そこまでの利益が無い。

### 既存 97 本を遡って戻す

**採らない。** 戻す作業自体が本文編集であり、決定と矛盾する。それらが含む dead path は ADR-2648 が受け入れると決めた 28 件に含まれる。本 ADR は以後にのみ適用する。

## 帰結

- 昇格 PR は、旧 ADR の本文に残る design doc への参照を**そのまま残す**。読者はその行から現物に辿り着けないが、`related_to` と `docs/adr/graph.md` が経路を持つ
- auto-merge の適用条件から「ADR 本文の張り替え」が外れる。他ディレクトリの張り替えは条件のまま残るので、[#2259](https://github.com/kompiro/karasu/issues/2259) が止まった形は再発しない
- 既存 97 本との不一致が残る。本 ADR は方針を今後に適用するもので、過去を整合させるものではない
