---
id: ADR-3775
title: 複数の variant タグを持つノードは、最初のタグの組み込みルールだけで描く
status: accepted
date: 2026-11-15
topic: styling
related_to:
  - ADR-1415
  - ADR-351
  - ADR-8
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/builtins/icon-theme.ts :: losingVariantTags"
  - "symbol: packages/core/src/resolver/variant-rules.ts :: withoutLosingBuiltinVariants"
  - "grep: packages/core/src/resolver/style-resolver.ts :: withoutLosingBuiltinVariants"
  - "file: docs/test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md"
  - "file: docs/test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md"
---

# ADR-3775: 複数の variant タグを持つノードは、最初のタグの組み込みルールだけで描く

- **日付**: 2026-11-15
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3775](https://github.com/kompiro/karasu/issues/3775)（multi-variant の resource が Outline と違うアイコンを描く）, [#3776](https://github.com/kompiro/karasu/issues/3776)（first-match の段階が author の明示した variant アイコンを上書きする）
  - PR: [#3807](https://github.com/kompiro/karasu/pull/3807)（Design Doc）, [#3816](https://github.com/kompiro/karasu/pull/3816)（実装）
  - 関連 ADR: [ADR-1415](./1415-outline-icon-variants.md)（Outline は `iconNameForNode` で variant を解決し、client は `tags` 順の first-match にする）, [ADR-351](./351-resource-shape-and-infra-icon-mode.md)（resource のタグ → shape）, [ADR-8](./8-builtin-style-and-reference.md)（組み込みシートが先、author のシートが後）
  - 関連 TPL: [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（解決順序が表現間で一致するか）, [TPL-2269](../test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md)（#3776 を `discovered_from` に追加）, [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードの precedence）, [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（1 つのエンティティの見た目は 1 つの関数で決める）

## 背景

`resource` と `client` は、タグで variant を選ぶ kind である（resource は `table` / `queue` / `api` / `storage`、client は form-factor の 7 つ）。1 つのノードに variant タグを 2 つ以上書いたとき、どの variant で描くかが表示面ごとに違っていた。

`resource Orders [table, api]` を描いた結果:

| 表示面     | 解決の仕方                                                                                                                   | 描かれるもの     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| shape mode | カスケード。`resource[table]` と `resource[api]` は同じ詳細度（11）なので、組み込みシートで後に書いた `resource[api]` が勝つ | hexagon（api）   |
| icon mode  | カスケード。icon theme で後に書いた `resource[api]` が勝つ                                                                   | `api` アイコン   |
| Outline    | `iconNameForNode`。`tags` 順で最初の variant                                                                                 | `table` アイコン |

client だけは icon mode と Outline が一致していた。style resolver がカスケードの後に `applyVariantFirstMatch` を走らせ、解決した `shape` が variant のアイコンなら、最初のタグのアイコンに書き換えていたからである。この段階を resource に広げると、shape mode が後に書いた variant のまま残り、icon mode と shape mode が食い違う。

この後段の書き換えは #3776 も生んでいた。書き換えの条件は「解決した値が variant のアイコンの URL かどうか」で、値がどのルールから来たかを見ない。author が `#App { shape: url("client-desktop"); }`（詳細度 100）で `client App [mobile, desktop]` に desktop のアイコンを指定すると、カスケードは author の値を選ぶが、後段がそれを mobile に書き戻していた。

## 決定

ノードが持つ variant タグのうち、最初の 1 つ（`tags` 順）以外を「負けたタグ」とし、style resolver はノードに一致したルールから、karasu 自身のシート（組み込みシートと icon theme。`NON_AUTHOR_SHEET_IDS`）のルールで負けたタグを名指すものを、カスケードにかける前に外す。author のスタイルシートのルールは外さず、ふつうのカスケードのまま決まる。

- `losingVariantTags(kind, tags)`（`icon-theme.ts`）が、`tags` に現れる variant タグの集合から最初の 1 つを除いたものを返す。`[table, api, table]` では `api` だけが負けたタグで、勝った `table` は位置にかかわらず負けたタグに入らない
- `withoutLosingBuiltinVariants(node, rules)`（`resolver/variant-rules.ts`）がルールを選別し、`mergeMatchingProperties` が `mergeInCascadeOrder` の前にこれを通す。`non-author-sheets.ts` が `icon-theme.ts` を import しているので、循環を避けて resolver 側に置く
- 後段の `applyVariantFirstMatch` と `FIRST_MATCH_VARIANT_KINDS` は消した

### author のルールとの関係

Design Doc は spec に「author のルールはこれに勝つ」と書くとしていたが、実装ではこれより狭く正確な書き方にした（#3816 の For Reviewers 1 で kompiro が了承）。author のルールは外さないので、タグが 1 つのノードと同じふつうのカスケードで決まる。そのため「勝つ」のは詳細度で決まる場合に限られる。

- shape mode（resource）: 詳細度が組み込みの `resource[table]`（11）以上の author のルール（`#Orders` や `resource[api]`）は組み込みの選択に勝つ。`resource { … }`（1）や `[api]`（10）は負ける。client は組み込みシートに variant の shape のルールを持たないので、この閾値は resource だけに当てはまる
- ノードの別々のタグに書いた author のルール同士（`resource[table]` と `resource[api]`）は宣言の順で決まる。タグの順ではない
- Icon Mode: 同点なら icon theme が勝つ（icon theme は author のシートの後に積む。#279）。別のアイコンを選べるのは詳細度が 11 より高いルール（id のルールや、注釈を加えたルール）だけである

author のルールが variant を選んだノード（下の表の `#App` の行）では、描画は author の値になり、Outline は最初のタグのままである（ADR-1415）。これは variant タグが 1 つのノードと同じで、受け入れた食い違いである。

`docs/spec/syntax.md` / `syntax.ja.md`（client の form-factor）と `docs/spec/tags-annotations.md` / `tags-annotations.ja.md`（resource の shape タグ）がこの規則を書いている。

### 挙動の変化

| ノード                                                                           | 表示モード   | 変更前          | 変更後           |
| -------------------------------------------------------------------------------- | ------------ | --------------- | ---------------- |
| `resource [table, api]`                                                          | shape        | hexagon         | cylinder         |
| `resource [table, api]`                                                          | icon         | `api`           | `table`          |
| `resource [api, table]`                                                          | shape / icon | hexagon / `api` | 変わらない       |
| `client [mobile, desktop]` に author の `#App { shape: url("client-desktop"); }` | shape / icon | `client-mobile` | `client-desktop` |
| variant タグが 1 つ以下のノード                                                  | すべて       | —               | 変わらない       |

## 理由

- 1 つの規則が両方の表示モードに効く。shape mode のルールも icon theme のルールも、同じ karasu 自身のシートのルールとして外れるので、shape の値を別の表に写さない（variant の語彙は `ICON_RULES` の 1 か所のまま）
- 値ではなくルールの出どころ（`sheetId`）で決める。author のルールは外れないので、author の宣言は単一タグのノードと同じ強さで勝つ。これで #3776 が同じ変更で直る
- カスケードの後で値を書き換える処理が 1 つ減る（TPL-2234）
- `iconNameForNode` の規則（最初のタグ）は ADR-1415 の決定のままで、描画側をそれに合わせた

## 影響

- variant タグを 2 つ以上書いた resource の描画が、後に書いた組み込みルールの variant から最初のタグの variant に変わる。`examples/` と docs の `.krs` には該当が無く、examples の描画は変わらない
- `icon-theme.test.ts` の `CASCADE_ORDER_KINDS`（resource の例外）を消した。テストは `ICON_RULES` から組み合わせ（各 variant 単独、順序付きの全ペア、勝者を繰り返したペア、全 variant の両方の順）を生成し、Icon Mode と `iconNameForNode` の一致、shape mode が最初の variant 単独と同じ形になること、author の id のルールが両モードで勝つこと（#3776）、author のタグのルールの扱い、karasu 自身のシートの variant ルールが `shape` だけを設定すること、組み込みシート（dark と light）が variant の kind の shape を variant タグだけで決めていることを確かめる
- フィルタはルール全体を外すので、karasu 自身のシートに variant タグを名指して `shape` 以外の性質も設定するルール、または variant タグと別のタグを組み合わせたルール（例 `resource[api][external]`）を足すと、それも外れる。テストがそうしたルールの追加を落とすので、足すときは「負けた variant のルール」として外れるのが意図どおりかをそこで決める
- TPL-1415 のチェックリスト項目 6 を、後段ではなくこのフィルタの説明に改めた。#3776 の根本原因（宣言したシートではなく解決した値で決める）は TPL-2269 がすでに扱う型なので新しい TPL は起こさず、TPL-2269 の `discovered_from` に #3776（`root_cause_file` は `icon-theme.ts`）を足し、関連テストに author の id のルールのテストを、本文に既知のパターンの注記を足した
- changeset は `@karasu-tools/core` と `karasu` に加え `karasu-skills` も patch にした。`packages/skills/` 配下の spec の同梱コピーが変わったためである（Design Doc は前の 2 つだけを挙げていた）

## 却下した案

### 案1: カスケードの同点を、ノードのタグの順で決める

詳細度が同じルールの勝ち負けを、宣言順ではなく「ノードの `tags` で先に書いたタグを名指すルールが勝つ」で決める。後段が要らず、shape mode と icon mode が同じ規則に乗る。

却下理由: author のルールにも効き、style.md「When scores are equal, the later declaration wins」に例外を 1 つ足すことになる。また同点の規則はカスケードの中心にあり、node・edge・deploy・org のどれにも効く。variant の問題は node の 2 つの kind にしか無いのに、変更の範囲がカスケード全体に広がる。

### 案2: 後段を resource に広げ、shape mode の variant も書き換える

`applyVariantFirstMatch` に各 variant タグの組み込みの shape（`table` → cylinder など）を持たせ、shape mode でも書き換える。変更は後段に閉じる。

却下理由: shape mode の 4 行を後段の中にもう 1 つ写すことになる（TPL-1415 の二重表現）。また「解決した値が variant の値なら書き換える」判定のままなので #3776 が残り、resource にも広がる。値で出どころを推測する限り、author の値と組み込みの値を区別できない。

## 決めないこと

- 1 つのノードに variant タグを 2 つ以上書くことへの診断は決めない。syntax.md は「form-factor タグは 1 つに留める」を推奨するだけで、書くこと自体は許している
