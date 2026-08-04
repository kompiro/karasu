---
id: ADR-2331
title: ADR PR の auto-merge 例外は、変更の場所ではなく差分の性質で判定する
status: accepted
date: 2026-08-04
topic: adr-tooling
authors: [kompiro]
related_to:
  - ADR-1084
  - ADR-2259
  - ADR-788
assumptions:
  - "file: .claude/rules/adr.md"
  - "grep: .claude/rules/adr.md :: gh pr diff"
---

# ADR-2331: ADR PR の auto-merge 例外は、変更の場所ではなく差分の性質で判定する

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 起点 PR: [#2331](https://github.com/kompiro/karasu/pull/2331)（対応する Issue は無い。運用中に観測した摩擦から起こした）
  - 引き金となった昇格 PR: [#2327](https://github.com/kompiro/karasu/pull/2327)（[ADR-2259](2259-permalink-payload-cap.md) の昇格。`docs/acceptance/` の 1 行で例外から外れた）
  - [ADR-1084](1084-skills-plugin-portability.md)（skill の plugin 化。ADR 昇格 auto-merge は karasu 側の `.claude/rules/adr.md` の運用に乗ると規定している）
  - [ADR-788](788-adr-knowledge-graph.md)（ADR frontmatter / validator の基盤）
  - ルール本体: `.claude/rules/adr.md`「ADR PR の auto-merge」節
  - 作法の基準: `.claude/rules/README.md`「ルール品質チェックリスト」

## 背景

`.claude/rules/adr.md` は「PR のマージはユーザー確認を経る」という既定運用に対する明示的な例外として、**ADR のみを記録する PR は `gh pr create` 直後に auto-merge を有効化してよい**と定めている。例外が暴走しないよう、適用条件は観測可能な事実で書かれていた。その条件 2 は **変更ファイルが許可ディレクトリの集合に収まること**という形だった:

- `docs/adr/**`
- 昇格対象 `docs/design/<name>.md` の削除または更新

ここに構造的な取りこぼしがある。**Design Doc を ADR に昇格させると元ファイルを削除するため、それを指していた参照がすべてリンク切れになる。** 繋ぎ直しは昇格作業の一部であって別の判断ではないが、参照元は `docs/adr/` 以外にも居るので、その 1 行が入った瞬間に PR は例外から外れる。

実際 ADR-2259 の昇格 PR（#2327）は、`docs/acceptance/2259-permalink-payload-cap.md` の設計リンクを design doc から ADR に張り替える **1 行**のために条件 2 を満たさなくなった。リンクを直さなければ AT レコードがリンク切れのまま残るので、回避策は存在しない。

素朴な修正は許可集合に `docs/acceptance/**` を足すことだが、参照元は acceptance に限らない。`docs/design/` を参照しているファイル数（worktree を除く実リポジトリ、`docs/adr/` 自身を除く）:

| ディレクトリ | ファイル数 |
| --- | ---: |
| `docs/acceptance/` | 32 |
| `docs/spec/` | 3 |
| `docs/test-perspectives/` | 2 |
| `docs/prd/` | 2 |
| `docs/`（`roadmap.md` 等） | 2 |

ディレクトリを 1 つ足しても、次に spec の `> Related TPLs:` や TPL の「派生元 spec」が参照元になったとき同じ理由でまた止まる。そして `.claude/rules/README.md` のチェックリスト 5 は、まさにこの形を戒めている — **「場面の数え上げはモデル変更で漏れる。単一の判定条件に畳む」**。

## 決定

**auto-merge 例外の適用条件を、変更ファイルの置き場所ではなく差分の性質で判定する。** 差分が次の 3 種以外に 1 行もないことを条件とし、ディレクトリは問わない:

1. `docs/adr/**` の変更（新 ADR と `effective.md` / `graph.md` / `graph/*.md` の生成物）
2. 昇格対象 `docs/design/<name>.md` の削除または更新
3. **その Design Doc を指していた参照を、新 ADR に張り替える差分**

確認手順には `gh pr diff <N>` を加える（従来の `gh pr view <N> --json files,title` だけでは差分の中身を見られないため）。

**張り替え以外の変更が混ざったら例外は成立しない。** とくに `docs/acceptance/` の受け入れ条件そのもの（TC の増減、手動項目のチェック状態）を変える差分が含まれる PR は、通常どおりユーザー確認を経る。

## 理由

- **繋ぎ直しは昇格の一部であって、別の判断ではない。** 昇格 PR が design doc を消す以上、その参照を直すのは同じ 1 つの作業に属する。これを「別ディレクトリの変更」として例外から弾くのは、作業の単位ではなくファイルの置き場所で線を引いていたということである。
- **数え上げは漏れる。** 許可ディレクトリを列挙する形は、参照元が増えるたびに条件の改訂を要求する。差分の性質で書けば acceptance も spec も TPL も prd も roadmap も、将来の参照元も一度に入る。`.claude/rules/README.md` チェックリスト 5 の適用そのものである。
- **必要より広くしない。** `docs/acceptance/**` を丸ごと許すと、ADR PR が受け入れ条件を人のレビューなしに書き換えられる。AT は「何を検証したか」の記録であり、とりわけ手動項目のチェック状態は実機確認の有無を表すので、静かに変わってよい対象ではない。差分の性質で判定すればここは自然に例外の外に残る。
- **代償が小さい。** 増えるのは確認コマンド 1 つ（`gh pr diff <N>`）だけで、判定は依然として観測可能な事実に閉じている（チェックリスト 2）。例外の適用可否を自己判断や「重要度」で決める形には一切寄せていない。

## 却下した案

- **許可集合に `docs/acceptance/**` を足す** — 判定がファイル一覧だけで済むので確認は最も安い。しかし参照元が spec / TPL のときは再び止まり、条件の改訂を繰り返すことになる。さらに AT の受け入れ条件自体の変更まで無条件に通ってしまう。
- **現状維持（昇格 PR は手動マージのままにする）** — 変更ゼロだが、例外が「ADR のみを記録する PR」を意図しているのに、実際にはその代表例である昇格 PR がほぼ毎回条件から外れる。例外が意図した対象に届かない状態が固定される。
- **AT レコードから design doc へのリンクを禁じる規約に変える** — 参照元を減らせば問題は消える。design doc は削除が確定しているアドレスなので、[TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録より長生きするアドレスを指す）の形にも合う。ただし既存 32 件の書き換えと AT 執筆規約の改訂が必要で、昇格前は設計根拠への導線が Issue 経由になる。auto-merge の条件を直すより影響が広いので、別途検討する。
- **参照の張り替えを別 PR に分ける** — 条件を変えずに済むが、リンク切れの状態が 2 つの PR の間に必ず生じ、1 行の修正のために PR とレビューが 1 往復増える。

## 未決（本 ADR の範囲外）

- **AT から design doc へのリンクをやめるか**（却下案の 4 番目）— 参照元そのものを減らす方向。TPL-2254 の観点に合致するが、規約改訂と既存 32 件の書き換えを伴うので別途。
- **条件 2 の機械チェック** — 現在は `gh pr diff` を読む人間（またはエージェント）の判断に依存している。「`docs/adr/**` 以外の差分が張り替えのみ」を判定するスクリプトは書けるが、例外の適用頻度に対して過剰かどうかは運用してから判断する。
