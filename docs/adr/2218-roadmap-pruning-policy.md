---
id: ADR-2218
title: roadmap は現在と次の一手のみを保持する（完了内容の pruning 運用）
status: accepted
date: 2026-07-30
topic: project
related_to:
  - ADR-1314
  - ADR-1820
  - ADR-2124
  - ADR-1564
  - ADR-1568
assumptions:
  - "file: docs/roadmap.md"
  - "file: .claude/rules/roadmap.md"
  - "grep: docs/roadmap.md :: version vocabulary"
---

# ADR-2218: roadmap は現在と次の一手のみを保持する（完了内容の pruning 運用）

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2218](https://github.com/kompiro/karasu/issues/2218)（起票の経緯 — [#2214](https://github.com/kompiro/karasu/pull/2214) が引き金）
  - [ADR-1314](1314-krs-spec-v1-freeze.md) — v1.0 freeze（本 ADR の初回 pruning が削る Syntax v1.0 節の決定本体）
  - [ADR-1820](1820-notation-promotion-gate.md) — promotion gate（「決定 = ADR / 適用状態 = roadmap」の配線を全節に一般化する先行例）
  - [ADR-2124](2124-version-vocabulary.md) — version vocabulary（roadmap 節を living の正典に指名 — pruning の例外の根拠）

## 背景

`docs/roadmap.md` は living doc を宣言しているが、実際には決着済みの経緯を蓄積し
続けて 466 行まで肥大化した。約半分は**完了済み**の Syntax v1.0 プログラム
（readiness 表・実行済みタスク一覧・ADR-1314 に実体がある freeze スコープの複写）
だった。直近の実例が [#2214](https://github.com/kompiro/karasu/pull/2214) で、
notation-watch-r2 epic の close を扱った PR が該当行を削除する代わりに ✅ 行を
**追記**した。この習慣ではファイルは単調増加しかしない。

一方でリポジトリには既に恒久記録の家がある — 決定は ADR、実行は Issue、原文は
git history。Design Doc には「ADR 昇格時に元ファイルを削除する」ライフサイクルが
確立している（`.claude/rules/adr.md`）。同じライフサイクルが roadmap に無いことが
肥大化の構造的原因である。

## 決定

**roadmap の各行・節は「未決事項」または「OPEN な参照」のみを保持する。**
close イベント（epic close・milestone 完了・決定の発効）を扱う PR は、対応する
行・節を同じ PR で**削除**する。✅ 追記による完了マークは行わない。経緯は
ADR（決定）・closed Issue（実行）・git history（原文）が担う。

付随する規律:

1. **決定 rationale は roadmap に書かず ADR に書く**。roadmap に置くのは生きた
   適用状態のみ（ADR-1820 が promotion gate で確立した「決定 = ADR / 適用状態 =
   roadmap」の配線を全節に一般化する）。
2. **例外は 2 種のみ**: (a) ADR が living の正典に指名した節（例: §version
   vocabulary — ADR-2124）は歴史ではなく定義なので残る。(b) 他文書から anchor
   参照されている見出しはテキストを変えない（`grep -rn "roadmap.md#" docs packages`
   で検証）。
3. **表のセルに散文を書かない**。セルは判断基準の要約 1〜2 文に留め、エビデンス・
   経緯は Issue / ADR へのリンクで指す。
4. 発火の仕組みは `.claude/rules/roadmap.md`（`paths: docs/roadmap.md` — 編集時に
   毎回文脈へ届く層）に置く。

## 理由

- **altitude の分離**: roadmap の価値は「どこへ向かっているか」を 1 ファイルで
  読めることにある。決着済みの経緯が混ざるほど現在地が読みにくくなり、living doc
  の目的自体を損なう。
- **アーカイブは既に存在する**: ADR + closed Issue + git history で削除は情報損失に
  ならない。第二のアーカイブを roadmap 内に持つ理由がない。
- **削除は close イベントに紐づけると漏れない**: 「定期的に棚卸しする」は発火せず、
  「close を扱う PR が削る」は必ず発火する（ADR-1820 がカレンダーベースの定期
  レビューを却下したのと同じ理由）。
- **先行例が機能している**: Design Doc → ADR 昇格時の元ファイル削除、promotion
  gate の「決定 = ADR / 適用状態 = roadmap」は同型の運用で、いずれも定着済み。

## 却下した案

- **`docs/roadmap-archive.md` へ移動**: 第二の家は drift を生み、メンテ対象が
  増えるだけ。アーカイブは既に ADR / Issue / git history にある。
- **✅ マークを付けて残す（従来の habit）**: 単調増加が止まらない。完了の証跡は
  closed Issue が既に持っており、roadmap 上の ✅ は冗長。
- **roadmap の歴史節を丸ごと ADR 化してから削る**: 決定の実体は各 ADR に既に
  ある（例: freeze スコープ = ADR-1314）。複写をもう一段作るのは altitude 混在の
  再生産。ADR に実体が無い判断だけを移設する（下記付録の finding H が唯一の例）。

## 付録: 初回 pruning（2026-07-30）の移設記録

初回 pruning で削除した節と、その内容の行き先:

| 削除した節 | 実体の所在 |
| --- | --- |
| 棚卸し finding の決着状況・readiness サマリ・ergonomic friction | 各決定 = ADR-1564/1566/1568/1570/1583/1639/1567、棚卸し = [#1567](https://github.com/kompiro/karasu/issues/1567) / [#1717](https://github.com/kompiro/karasu/issues/1717) |
| v1.0 freeze のスコープ・方針の根拠（段階 freeze 3 案比較）・実行計画 | [ADR-1314](1314-krs-spec-v1-freeze.md)（凍結面・非凍結面・前提条件チェックリスト）。段階 freeze の 3 案比較は #1567 の deferred 方針の帰結で、原文は git history |
| guiding principle（structure-vs-implementation）の watch item 読解表 | 原則の正典 = `docs/concepts.md` §Structure, not implementation。G/H/I の stable 判断 = ADR-1314、C/D は roadmap の watch 台帳（notation gap）に現役登録 |
| #1814 対応表（M1〜M5 の受け皿マップ） | [#1814](https://github.com/kompiro/karasu/issues/1814)（closed）。全行が決着（M1 ✅ / M2 ✅ / M3 評価待ち→独立 candidate / M4 柱 / M5 柱 / M0 常時） |
| 付録: finding H（CRUD verb-decoration 1:N）を v1.0 で残す判断 | **本節（下記）に移設** — ADR-1314 が「`docs/roadmap.md` 付録の維持判断に基づく」と参照していた判断記録 |

### finding H（CRUD verb-decoration 1:N）の維持判断（roadmap 付録から移設）

棚卸し（#1567）で `replace:create,delete` のような CRUD verb-decoration の 1:N を
excess 候補として挙げたが、**v1.0 で残す**（freeze 対象）と判断した。

- **削除したい背景**: アーキテクチャツールにしては intricate（1 verb に複数 CRUD を
  結びつける記法は構造を語る語彙として細かすぎる懸念）。disambiguation ルールの
  学習コスト。1 操作が複数の永続化作用を持つという粒度は実装詳細線に接近する。
- **残す理由**: 既に spec + parser に実装済みで CRUD matrix view が `decoratedAs` を
  読む形で機能しており、v1.0 直前の削除は後方互換を自ら破る。1:N は「1 つの
  usecase 操作が複数のデータ作用を持つ」実在のモデルを簡潔に表し、削るとユーザーは
  複数 edge / 複数 verb への分解を強いられ冗長になる。intricate / 学習コストの懸念は
  spec の説明改善で緩和できる範囲で、構文削除という後方非互換の対価に見合わない。
- **残す前提での watch**: 実利用で earn its keep しているか（使われ、誤用が
  少ないか）を観察し、問題が出れば [ADR-1568](1568-migration-intent-fields.md) の
  `@deprecated` graceful-degradation の枠組みで deprecation を別途検討する
  （watch の現役台帳は roadmap §promotion gate 直下）。
