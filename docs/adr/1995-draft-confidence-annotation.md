---
id: ADR-1995
title: 生成物の不確かさは @draft アノテーションで表す — ノード単位・水準は任意・罰を与えない
status: accepted
date: 2026-08-02
topic: core-concepts
authors: [kompiro]
refines: [ADR-1990]
related_to:
  - ADR-1314
  - ADR-1820
  - ADR-1568
  - ADR-2077
  - ADR-2124
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/annotations/draft-confidence.ts :: getDraftState"
  - "grep: packages/core/src/builtins/reference-data.ts :: name: \"draft\""
  - "grep: packages/core/src/parser/parser.ts :: draft: new Set"
---

# ADR-1995: 生成物の不確かさは `@draft` アノテーションで表す — ノード単位・水準は任意・罰を与えない

- **日付**: 2026-08-02
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1995](https://github.com/kompiro/karasu/issues/1995)（親: [#1990](https://github.com/kompiro/karasu/issues/1990)）
  - [ADR-1990](1990-karasu-nest-pivot-server-reverse.md) 決定 4（confidence マークは戦略ではなく正直さの層）。本 ADR はその notation を定める
  - [ADR-1568](1568-migration-intent-annotation-params.md)（annotation parameter と精度による graceful degradation）
  - [ADR-1314](1314-krs-spec-v1-freeze.md)（`.krs language v1.0` の freeze）、[ADR-2124](2124-version-vocabulary.md)（版語彙）
  - [ADR-2077](2077-reverse-bc-granularity.md)（BC 粒度既定 — 分解の誤りが継ぎ目に集中するという実測の出どころ）
  - TPL: [TPL-1995](../test-perspectives/TPL-1995-generated-content-is-marked-at-its-seams.md)（本 PR の proactive TPL）、[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)（builtin 追加 gate）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
  - spec: [`docs/spec/tags-annotations.md` § `@draft`](../spec/tags-annotations.md#draft--asserted-not-confirmed)

## 背景

ADR-1990 決定 4 は「出力は全ビュー＋confidence マーク」とし、confidence マークを「正直さの層であって戦略ではない」と位置づけた。しかし**どう書くか**は決めていない。gate spike [#1991](https://github.com/kompiro/karasu/issues/1991) は、生成された分解の誤りが全体に散らばらず**人間でも判断が割れる継ぎ目に集中する**ことを実測した。マークすべき場所はその継ぎ目である。

builtin 語彙の追加は [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) の 3 問を通す必要があり、同 TPL は**却下した候補も記録する**ことを求めている。本 ADR はその記録である。

## 決定

**`@draft`（任意で `@draft(confidence: "low"|"medium"|"high")`）を builtin の lifecycle アノテーションとして追加する。印はノード単位、水準は任意、印が付いていることによる不利益は一切与えない。**

3 問の答え:

1. **register** — lifecycle。`@new` / `@experimental` と同じく「レビュー過程における状態」を表す。要素が構造上何であるか（tag）でも、外在的な集合への所属（facet）でもない。
2. **既存表現** — 無い。`@experimental` は**対象の成熟度**を述べるもので、**こちらの記述に対する確信度**ではない。両者は独立に成り立つ（安定した機能を自信なく記述することも、実験的な機能を確信をもって記述することもある）。
3. **停止規則** — 「人が確認したか」という 1 つの二値軸。水準はその軸の refinement であって新しい軸ではないので、語彙が family に増殖しない。

付随する 3 つの設計判断:

- **ノード単位で、文書単位のスコアを持たない。** 文書に 1 つの数値を置くと、確信している大部分と怪しい少数が平均されて両方の情報が失われる。
- **裸の `@draft` で完結する。** 水準は refinement。印は人手レビューが**消す**ものであり、その削除が ADR-1990 決定 4 のラチェット（[#2228](https://github.com/kompiro/karasu/issues/2228)）そのものになるため、1 トークンで消せる形にする。
- **印に罰を与えない。** 低確度ノードに警告・降格・描画拒否を課さない。

## 理由

- **罰を与えないことが最も効く。** 低確度に警告を出せば、生成側は印を付けないほうが得になる。正直さに罰を課す設計は正直さを消すので、これは親切さではなく機構上の要請である。
- **粒度が実測に合っている。** 誤りが継ぎ目に集中するなら、印も継ぎ目に置くのが情報量が最大になる（ADR-2077 / #1991）。
- **消しやすさがラチェットの前提。** 消すのに構造変更が要る形にすると、レビュー済みでも印が残り、残った印は次の読み手に嘘をつく（[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md) と同型の drift）。
- **既知の 3 水準の外を受理する。** `low` / `medium` / `high` の外は opaque な表示専用値として保持する（`until` と同じ degradation — ADR-1568）。レビュアーの「ここは議論が割れた」は実在の情報で、弾けば機械が読めないコメントへ逃げる。
- **言語版は動かない。** `@<identifier>` は `.krs language v1.0` の文法で既に受理されるため、増えるのは tool-owned な builtin 語彙だけで ADR-1314 の freeze には触れない。

## 却下した案

- **`@experimental` を流用する** — register は合っているが問 2 で落ちる。対象の成熟度と記述への確信度は独立の軸で、流用すると「実験的な機能を確信をもって記述した」が書けなくなる。
- **文書単位の confidence スコア**（frontmatter / `system` プロパティに 1 つの数値） — 実装は最も軽いが、#1991 が示した「誤りは継ぎ目に集中する」という構造を平均で消してしまう。読み手はどこを疑えばよいか分からず、全部を疑うか全部を信じるかになる。
- **0.0〜1.0 の数値 confidence** — 一見精密だが、LLM の出す数値は較正されておらず、比較可能に見えて比較できない。3 水準に畳むほうが、読み手が「どう扱うか」を決めるのに十分で、かつ嘘が少ない。
- **facet で表す**（`facets draft`） — facet はユーザー宣言の外在的な集合であり、ツールが生成物に付ける印の register ではない。facet を唯一のユーザー拡張点とした設計判断（`docs/spec/tags-annotations.md` § 語彙の register）が濁る。
- **低確度ノードに診断（warning）を出す** — 「安全側」に見えるが、印を付けた側が罰を受ける。次の生成では印が消える。
- **`@draft` を experimental notation として入れる** — [ADR-1820](1820-notation-promotion-gate.md) の promotion gate は experimental notation の**昇格**を縛るもので、builtin 追加の経路は TPL-2172 の 3 問である。二重の gate を通す意味がなく、experimental 扱いだと生成側が使いにくい。
- **`@generated` / `@inferred` という名前** — 出所（誰が書いたか）を表す名前になり、軸が「人か機械か」にずれる。決めたい軸は「確認されたか」であって、人が書いた未確認の記述にも同じ印が要る。
- **`@draft` に `by:`（生成器名）や `at:`（生成時刻）を足す** — 停止規則に反する。provenance は別の軸で、必要になったらそのとき 3 問を通す。生成時刻は既に cache の metadata が持っている。

## 未決（本 ADR の範囲外）

- **詳細パネルでの表示** — `NodeMetadata.draft` は水準を運ぶが、それを見せる UI は無い。バッジが本 PR で入る効果の全部である。
- **`@draft` を持つノードの filter / 集計** — 「未確認が何件あるか」を見せる面は、必要が出てから。
- **1 ノードが複数アノテーションを持つときバッジが 1 つしか出ない**という既存の挙動。`@draft` は最後に並べて勝つようにしたが、`@deprecated @migration_target` が `@deprecated` を隠すのは本 ADR 以前からの挙動で、別途扱う。
