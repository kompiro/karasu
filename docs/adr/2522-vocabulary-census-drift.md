---
id: ADR-2522
title: 語彙センサスが見つけた drift の閉鎖 — kebab-case 字句規則・読解確度の register・閉鎖前提条件の再スコープ
status: accepted
date: 2026-08-17
topic: core-concepts
related_to:
  - ADR-1314
  - ADR-2065
  - ADR-2172
  - ADR-2173
  - ADR-2174
  - ADR-1990
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/parser/kebab-name.ts"
  - "symbol: packages/core/src/parser/kebab-name.ts :: stitchKebabTail"
  - "file: docs/test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md"
  - "grep: docs/guide/02-onboarding.md :: facet unverified"
  - "grep: docs/roadmap.md :: 警告カウントの実測"
---

# ADR-2522: 語彙センサスが見つけた drift の閉鎖 — kebab-case 字句規則・読解確度の register・閉鎖前提条件の再スコープ

- **日付**: 2026-08-17
- **ステータス**: 決定済み・実装完了
- **関連**:
  - 親 Issue: [#2522](https://github.com/kompiro/karasu/issues/2522)（sub-issues [#2509](https://github.com/kompiro/karasu/issues/2509) / [#2510](https://github.com/kompiro/karasu/issues/2510) / [#2511](https://github.com/kompiro/karasu/issues/2511)、census は [#2508](https://github.com/kompiro/karasu/issues/2508)）
  - 実装 PR: [#2528](https://github.com/kompiro/karasu/pull/2528)（字句修正）, [#2529](https://github.com/kompiro/karasu/pull/2529)（roadmap）, [#2530](https://github.com/kompiro/karasu/pull/2530)（guide / AT）。設計レビューは [#2524](https://github.com/kompiro/karasu/pull/2524)
  - 関連 ADR: [ADR-1314](1314-krs-spec-v1-freeze.md)（v1.0 freeze）, [ADR-2065](2065-tags-and-facets.md)（tags and facets）, [ADR-2172](2172-builtin-vocabulary-expansion.md)（builtin 追加 gate）, [ADR-2173](2173-facet-grammar-and-model.md) / [ADR-2174](2174-facet-overlay.md)（facet 文法 / overlay）
  - 関連 TPL: [TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)（本件から起票）, [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md), [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md), [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)

## 背景

`pnpm census:vocabulary`（#2508）が、tag / annotation 語彙の実測中に相互依存する
3 つの drift を見つけた:

1. `[my-team-internal-tag]` が 1 タグではなく **7 断片**として parse され診断が
   出ない（#2509）。`.krs` lexer は `->` / `-->` を字句解釈するため `-` を識別子
   文字に含めず、`capability` だけが縫合（stitching）を実装していた。一方
   `.krs.style` の lexer は `font-family` のためハイフンを識別子に含めており、
   同じ綴りのタグとセレクタが**構造的にマッチしない**状態だった。
2. オンボーディングガイド §5.1 が「annotation 名は open set、非 builtin に警告
   なし」という #2159（ADR-2065 決定 5）で反転済みの規則を事実として教え、
   その上に custom annotation（`@unverified` / `@assumed`）の読解確度ワーク
   フローを組んでいた（#2510）。acceptance 記録 2 件（AT-0064 §2b / AT-0068 §3）
   も反転済みの基準（「警告は出ない」）を保持していた。
3. roadmap の閉鎖前提条件 1「corpus 実測」のうち「どの custom 名が使われて
   いるか」（names）は収集不能と実測された（#2511）。in-the-wild corpus は
   実在せず（公開ローンチ後 1 ヶ月で第三者の public `.krs` は 0 件）、nest の
   共有 corpus は data-trust 設計（ADR-1990 決定 6）が repo 由来文字列の集計を
   禁じている。

3 件は独立ではない: 1 の決定が 2 の書くべき文面を決め、3 が残す counts は
1 で 7 → 1 に変わる。このため 1 つの Design Doc（PR #2524）で決定した。

## 決定

### 1. kebab-case 名は全語彙ポジションで 1 つの名前として lex する（#2509）

`capability` の縫合を共有ヘルパー `packages/core/src/parser/kebab-name.ts`
（`stitchKebabTail`）に抽出し、tag・annotation 名・legend `ref` 対象・capability
のすべてに適用した。断片は keyword トークンでもよい（`[legacy-system]` は
1 タグ）。字句規則は `docs/spec/tags-annotations.md` §Tags に明文化した。

**ADR-1314（v1.0 freeze）との関係**: parse 結果は変わるが、これは **bug fix で
あって破壊的変更ではない**と読む。根拠は (a) 7 断片 output は誰も意図して
書いた形ではない、(b) spec の capability 節と AT-0064 §2b が既に kebab-case を
約束していた、(c) ファイルは引き続き parse する（freeze の約束は維持）。
理論上の非互換は断片名を狙った style selector（`my { }` が断片 `my` に
マッチしていたケース）のみで、authored form ではないため受容する。

### 2. 読解確度の受け皿は facet（#2510）

ガイド §5.1 の `@unverified` / `@assumed` ワークフローは `facet` ベースに
書き換えた（宣言 + `facets` 付与 + overlay / Membership overview /
`[facets=<id>]` セレクタ）。

**ADR-2065 の lifecycle 偽装禁止との境界**: 禁止されたのは**システムの**時間的
状態（canary / sunset = runtime rollout）を facet に偽装すること。読解確度は
**モデルの忠実度**（地図と現地の対応）であってシステムの状態ではなく、
「読みが未確認な要素の集合」は外在的な集合所属（extrinsic set membership）の
定義に収まる。builtin annotation 追加（`@unverified` の builtin 化）は
TPL-2172 の 3 問 gate に通らないため採らなかった（下記「却下した案」）。

### 3. 閉鎖前提条件 1 は counts のみに再スコープ（#2511）

roadmap §閉鎖の前提条件 1 を「警告カウントの実測」に書き換えた。counts は
閉鎖判断時に census を再実行して測る（`docs/release.md` の promotion gate
接点に相乗り）。names はゲートから外し、ADR-2172 の builtin 追加経路に委ねる。
**安全性の根拠**: 閉鎖は warning であり parse error ではない（ADR-2065
「warning 運用なので『書けなくなる』ことはない」）。事前に収集できなかった
名前も書けなくなることはなく、警告を受けた author の builtin 追加要望が
設計済みの受け皿になる。

## 理由

- **字句（決定 1）**: 実装を spec の約束に合わせる方向が、約束を実装に合わせて
  縮小する方向（「kebab-case タグは書けない」と文書を書き換える）より一貫する。
  閉鎖時の警告カウントも正直になる（kebab タグ 1 つ = 警告 1 件。修正前は
  7 件、うち 3 件が `[-]` について）。
- **register（決定 2）**: #2175 が facet セレクタを「arbitrary-name tag selector
  の migration target」と明記した時点で、任意名語彙の受け皿は facet と決まって
  いる。facet は宣言必須なので typo が `facet-not-declared` で完全検出される
  という、custom annotation 時代に無かった安全性も得られる。
- **前提条件（決定 3）**: 収集不能な項目をゲートに残すと閉鎖が永久にブロック
  される。不能性は推測ではなく実測（GitHub code search 0 件、nest ポリシーの
  条文）で確認した。

## 実装記録

- 実測（2026-08 census）: shipped examples の非 builtin 名は 0 件。docs fence の
  drift は #2509 / #2510 で解消し、残る非 builtin 名は deprecation を意図的に
  デモする箇所のみ（`docs/spec/style.*` / `docs/spec/tags-annotations.*`、および
  改訂後の AT-0064 / AT-0068 の警告挙動デモ）。
- 再発防止: [TPL-2509](../test-perspectives/TPL-2509-kebab-name-positions-share-one-lexical-rule.md)
  — kebab-case 名ポジションは 1 つの字句ヘルパーを共有し、新しい名前
  ポジションは `.krs` / `.krs.style` 両面でハイフン入り名を検証する。

## 却下した案

- **（#2509）縫合せず診断だけ出す**: parse 結果を変えないので freeze との緊張は
  ないが、kebab-case タグが書けないままになり、spec / AT の約束を縮小する
  文書改訂が必要になる。約束の縮小はそれこそ freeze が守るべき面の後退。
- **（#2510）`@unverified` / `@assumed` の builtin 化を要望する**: TPL-2172 の
  3 問 gate に通らない。問1（register）: 既存 builtin annotation はシステムの
  lifecycle で、読解確度はモデルの状態という別軸 — 軸を跨ぐ追加は register の
  意味を薄める（`@canary` 却下と同型）。問2（既存表現）: facet がそのまま
  使える。停止規則の面でも確度の段階が増えるたびに要望が続く。
- **（#2510）custom annotation のまま警告を明示して教える**: deprecation 済みの
  形を新規ユーザーに推奨し続けることになり #2159 の決定と実質矛盾。style
  selector 側の警告（`style-annotation-selector-not-builtin`）に回避策がない。
- **（#2511）nest に同意ベースの語彙収集経路を作る**: warning しか出さない
  変更のゲートを満たすためだけに data-trust 面を増やすのは不釣り合い。
- **（#2511）nest の metrics に非 builtin カウントを足す**: ポリシー適合
  （数値のみ）だが、現状の installation は operator 自身の repo のみで、
  ローカル census と同じ数字にしかならない。installation が増えたら再検討。
