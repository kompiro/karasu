---
id: ADR-2906
title: icon display mode は非推奨のまま据え置き、削除する major はまだ決めない
status: accepted
date: 2026-09-26
topic: renderer
authors: [kompiro]
supersedes:
  - ADR-2376
related_to:
  - ADR-30
  - ADR-299
  - ADR-1000
  - ADR-2802
  - ADR-2803
scope:
  packages:
    - core
    - app
    - vscode
assumptions:
  - "file: docs/test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md"
  - "file: docs/acceptance/2696-shape-mode-external-icon-card.md"
  - "grep: docs/tools/app.md :: will be removed in a future major"
  - "grep: docs/tools/app.ja.md :: 将来のメジャーバージョンで削除します"
---

# ADR-2906: icon display mode は非推奨のまま据え置き、削除する major はまだ決めない

- **日付**: 2026-09-26
- **ステータス**: 決定済み
- **関連**:
  - 覆す ADR: [ADR-2376](2376-icon-display-mode-de-emphasis-and-removal-path.md)（icon mode の removal path。本 ADR はその「告知と削除の順序」のステップ 2 と告知先を差し替え、残りを引き継ぐ）
  - 移行先: [#2696](https://github.com/kompiro/karasu/issues/2696) / PR [#2797](https://github.com/kompiro/karasu/pull/2797)（shape mode の `shape: url()` にカード枠と比率保持を入れた。2026-09-13 にマージ済み）、[AT-2696](../acceptance/2696-shape-mode-external-icon-card.md)
  - 告知の文面を持つ README の再構成: PR [#2905](https://github.com/kompiro/karasu/pull/2905)
  - [ADR-30](30-icon-mode.md)（icon mode の導入）、[ADR-299](299-vscode-icon-mode-toggle.md)（VS Code のトグル）、[ADR-1000](1000-icon-mode-layout-gap-tuning.md)（icon mode 専用の gap 定数）
  - [ADR-2802](2802-builtin-icon-registration.md) / [ADR-2803](2803-slotted-icon-card-text.md)（移行先 `shape: url()` の後続整備。どちらも ADR-2376 の投資凍結を前提にしている）
  - TPL: [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)（告知は移行先と同じ release に置く）

## 背景

[ADR-2376](2376-icon-display-mode-de-emphasis-and-removal-path.md) は icon display mode を
removal path に載せ、次の順序を決めた。

1. 移行先 #2696 が出荷される release で deprecation を告知する（告知先は `README.md` /
   `docs/tools/app.md` / `docs/tools/app.ja.md` と changeset）。
2. その次の major で `displayMode: "icon"` と icon theme を削除する。
3. それまで icon mode 固有の描画不具合は直さない。

ステップ 1 は #2696（PR #2797）で実施された。`docs/tools/app.md` / `app.ja.md` と
changeset `shape-mode-external-icon-card` は「非推奨であり、次の major で削除する」と書いた。
ただし changeset はまだ release されておらず、この文面は release notes には出ていない。

再評価に至った変化は 1 つである。**次の major（v2）に何を入れるかが決まっていない。**
ADR-2376 を書いた時点では「次の major」を削除の置き場所として扱ったが、中身の決まって
いない release に、そこで行う破壊的変更を 1 件だけ先に約束することになっていた。
約束した以上、v2 の範囲を決めるときにこの 1 件は動かせない前提として扱われる。

## 決定

**icon display mode は非推奨のまま据え置き、削除する major は決めない。削除する
release は、v2 以降の範囲を決めるときに別の ADR で決める。**

ADR-2376 から引き継ぐもの:

- Phase 1 の記録（トグルを Settings の「表示」へ移したこと、UI に非推奨を含意する表示を
  置かないこと）と Phase 2 の評価（3 項目の答え）。どちらも変わっていない。
- ステップ 1（告知は移行先と同じ release）。実施済みで、非推奨の告知と移行先の案内は残す。
- ステップ 3（icon mode 固有の描画不具合には投資しない）。#2639 の won't-fix もそのまま。

ADR-2376 から変えるもの:

- **ステップ 2**: 「次の major で削除する」を取り下げる。告知の文面は「将来の major で
  削除する。どの release かは未定」とする。
- **告知先**: `docs/tools/app.md` / `docs/tools/app.ja.md` と changeset に置く。
  `README.md` は告知先から外す。PR #2905 で README は初回利用者の入口に絞られ、
  機能の一覧を持たなくなったため、機能ごとの状態を書く場所ではなくなった。

## 理由

- **範囲の決まっていない release に項目を先に固定しない。** v2 に何を入れるかを決める
  ときに、削除の有無と時期も同じ場で比べて決めるほうが、他の破壊的変更との順序や
  まとめ方を選べる。
- **非推奨は削除日なしでも成立する。** [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)
  が要求するのは移行先があることで、それは #2696 で満たされている。削除する release は
  告知とは別の約束であり、決まってから書けばよい。
- **投資凍結の実利は削除日に依存しない。** icon mode 固有の不具合を毎回判断し直さなくて
  よいという ADR-2376 の利点は、ステップ 3 を引き継ぐことで保たれる。
- **文面を直すコストが今は小さい。** 「次の major」の文面は changeset としてまだ release
  されていないので、release notes に出る前に直せる。

### この決定の代償

- **非推奨の期間が延び、期限が見えない。** 削除日が無いと移行を急ぐ理由が弱く、
  利用者が移行を先送りしやすい。
- **`displayMode` 分岐の保守が続く。** ADR-2376 が数えた core / app / vscode / nest の
  分岐と、icon mode 専用の gap 定数系統（[ADR-1000](1000-icon-mode-layout-gap-tuning.md)）を、
  削除 release が決まるまで維持する。新しいレンダラー機能も icon mode の経路を考慮し続ける。

この 2 つを受け入れるのは、中身の決まっていない release に破壊的変更を約束するほうが、
後で約束を破る形になりやすく、非推奨の告知そのものの信頼を下げるからである。

## 却下した案

### 案A: ADR-2376 のまま次の major で削除する

- 却下理由: 背景のとおり、v2 の範囲が決まっていない。範囲を決める前に 1 件だけ固定する
  理由が無い。

### 案B: 非推奨を撤回し、icon mode をサポート対象に戻す

- 却下理由: ADR-2376 の Phase 2 の評価（固定サイズカードの前提が実測で崩れていること、
  移行先が必要だったこと）は変わっておらず、移行先は #2696 で出荷された。変わったのは
  削除の時期の見通しだけで、方向を戻す根拠は無い。

### 案C: 削除を特定の後の major（v3 など）に移す

- 却下理由: 範囲の決まっていない release に約束するという問題は同じで、置き場所が
  1 つ後ろにずれるだけである。

## スコープ外

- **VS Code のトグル**（[ADR-299](299-vscode-icon-mode-toggle.md)）と core の `displayMode`
  API は変えない。削除 release を決める ADR が扱う。
- **UI の表示**は ADR-2376 のとおり据え置く。非推奨の告知は docs と changeset だけに置く。
