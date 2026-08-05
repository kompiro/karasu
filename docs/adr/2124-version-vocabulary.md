---
id: ADR-2124
title: "version vocabulary — 言語版とパッケージ semver は独立の軸とし、言語版を first-class で公開する"
status: accepted
date: 2026-07-30
topic: build
depends_on:
  - ADR-1314
refines:
  - ADR-1820
related_to:
  - ADR-1758
scope:
  packages:
    - core
    - cli
assumptions:
  - "file: docs/roadmap.md"
  - "file: docs/release.md"
  - "file: packages/cli/src/index.ts"
  - "file: docs/test-perspectives/TPL-2005-keystone-terms-single-home.md"
---

# ADR-2124: version vocabulary — 言語版とパッケージ semver は独立の軸とし、言語版を first-class で公開する

- **日付**: 2026-07-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2124](https://github.com/kompiro/karasu/issues/2124)（起点。boundary notation ADR の昇格作業 #2118 で「v1.x minor」トリガーの実行不能が表面化）
  - 設計 PR [#2170](https://github.com/kompiro/karasu/pull/2170)（design doc `version-vocabulary.md` — 本 ADR へ昇格し削除）
  - [ADR-1314](1314-krs-spec-v1-freeze.md) — v1.0 freeze（**前提**: 言語版セマンティクス「追加は v1.x / 破壊は v2.0」の定義元。本 ADR は動かさない）
  - [ADR-1820](1820-notation-promotion-gate.md) — promotion gate（**refine 対象**: 「載せる版を bump レベルに反映」の一文のみを実行可能な形に置き換える。gate の既定・トリガー・三点配線は不変）
  - [ADR-1758](1758-vscode-changeset-versioning.md) — vscode の版管理（本 ADR の軸の一つとして現状を追認）
  - 実装 Issue [#2181](https://github.com/kompiro/karasu/issues/2181)（`KRS_LANGUAGE_VERSION` + 2 行 `--version` + drift ガード）
  - 語彙の正典: `docs/roadmap.md` §version vocabulary（本 ADR は決定を記録し、定義表は roadmap 側が living に保持 — [TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md) の単一正典原則）

## 背景

docs は `v1.0` / `v1.0-stable` / `experimental` / `post-v1.0 watch` / `v1.x minor` /
`v2.0 major` を単一の尺度であるかのように使っていたが、実際には独立した互換性の約束が
少なくとも 3 軸ある（言語 = v1.0 frozen / CLI `karasu` = 0.6.0 / TS API
`@karasu-tools/core` = 0.2.0・約束なし。加えて `karasu-vscode` = 0.1.3 の別ケイデンス）。

この曖昧さは実害を生んでいた:

1. **言語版が観測不能** — 「v1.0」は prose にのみ存在し、`karasu --version` はハードコードの
   `0.0.0` を返す（`packages/cli/src/index.ts` — build 時注入なし）。ユーザーは手元のバイナリが
   どの言語版を実装するか知る手段が無い。
2. **bump-level 写像規則が実行不能** — `docs/process.md`（リリース運用）と ADR-1820 の
   「後方互換な追加 = v1.x minor / 既存構文の変更・再設計 = v2.0 major を決めて bump レベルに
   反映」は、全パッケージが 0.x である現実に対応物を持たない（0.x に「v1.x」の版線は無く、
   semver 上 0.x の minor は破壊的でも合法）。リリース前チェックリストの実項目に正解が
   存在しない状態だった。boundary notation の ADR 昇格（#2118）でこれが表面化し、roadmap の
   watch table 全体が同じ問題を継承していた。
3. **"experimental" / "deprecated" の二重の意味** — karasu 自身の notation の tier と、
   ユーザーが自分のモデルに付ける annotation（`@experimental` / `@deprecated`）が同語で
   主語が逆。さらに `v1.0-stable` / `stable` / `v1.0 freeze`、`experimental` /
   `post-v1.0 watch` / `notation watch` の同義語クラスタが未整理だった。

## 決定

**言語版とパッケージ semver は独立の互換性軸であると明文化し、言語版を first-class で
公開する。promotion gate の版規定は「bump レベルへの反映」から「言語版遷移の明記」に
書き換え、語彙は主語（karasu の notation / ユーザーのモデル）で二分して正準化する。
定義の正典は `docs/roadmap.md` §version vocabulary の 1 箇所に置く。**

内訳:

1. **言語版の公開**: `@karasu-tools/core` に `KRS_LANGUAGE_VERSION` 定数を置き、
   `karasu --version` は「パッケージ版 + 言語版」の 2 行表示（ハードコード `0.0.0` の修正
   込み）、spec docs 冒頭に言語版を明記して drift ガードで守る（実装 = [#2181](https://github.com/kompiro/karasu/issues/2181)）。
2. **軸の独立**: パッケージの bump レベルは changesets の semver 判断（その artifact の
   表面に対する互換性）で独立に決める。promotion gate の規定は「載せる**言語版**
   （後方互換な追加 = 言語 v1.x / 既存構文の変更・再設計 = 言語 v2.0）を決め、changeset と
   CHANGELOG に**言語版遷移を明記**する」に置き換える（ADR-1820 の refine）。リリース前
   チェックリストは「言語版に触れる変更が changeset / CHANGELOG に言語版遷移として明記
   されているか」の検査になる — 0.x でも実行可能。
3. **語彙の正準化**: tier = **stable**（強調時 `v1.0-stable`）/ **experimental** /
   **deprecated**（主語 = karasu の notation）。ユーザーモデルの標識は常に `@` + backtick
   表記（`@experimental` / `@deprecated`）。「v1.0 freeze」= イベント（ADR-1314 の決定行為）、
   「notation watch」= 観察活動（Epic #1816）として tier 名から区別する。
   **言語版の表記も正準化**: ユーザー向け出力・英語 prose = `.krs language v1.0`、
   日本語 prose = 「言語 v1.0」。「.krs v1.0」「krs-lang 1.0」等の表記ゆれは使わない。
4. **正典の置き場**: 定義表（軸・正準語彙・表記規約）は `docs/roadmap.md`
   §version vocabulary が living に保持し、`docs/process.md` / `docs/glossary.md` は参照のみ
   （TPL-2005 の単一正典原則をこの語彙にも適用）。

## 理由

- **各 artifact が自分の表面に正直な semver を運用できる**: CLI のコマンド体系・フラグ・
  出力形式の互換性と、言語仕様の互換性は変化のタイミングが異なる。結合すると、言語が
  変わらないのに CLI 都合で major を切るか semver を破るかの二択が生まれる。
- **ADR-1314 の言語版セマンティクスが無傷**: 「追加は v1.x / 破壊は v2.0」は言語軸の
  約束としてそのまま生き、観測可能な公開機構（定数 + --version + CHANGELOG）を得て初めて
  実行可能になる。
- **チェックリストが実行可能になる**: 「言語版遷移が明記されているか」は 0.x のパッケージ
  構成でも常に正解を持つ検査。旧規定は写像先の版線が存在せず、検査者に正解が無かった。
- **表記の正準化は機械的に判別可能**: annotation は常に `@` + backtick、tier は notation を
  主語にする、言語版は `.krs language vX.Y` — 規約だけで二義性が消える。

## 却下した案

- **CLI を 1.0.0 に leap して言語版に追従させる（結合案）**: 「v1.x minor」の文言がそのまま
  実行可能になるが、CLI 1.0.0 は言語以外の表面（コマンド体系・フラグ・出力形式）の安定も
  semver で約束することを意味し、その表面の棚卸しは行われていない。core（0.x・API 約束
  なし — ADR-1314）との乖離も新たな混乱源になる。**なお CLI 1.0.0 の時期そのものは本 ADR
  では決めない**（言語 v2.0 実施 = Syntax 2.0 プログラムが CLI 表面を棚卸しする自然な機会
  であり、その時点の判断に委ねる。ここで決めたのは「今は結合しない」ことのみ）。
- **docs-only の現状維持**: 言語版が観測不能なままでは §2 の写像問題が原理的に解けない
  （写像先が見えない）。`--version` の実バグも残る。
- **`docs/glossary.md` を正典にする**: 同 glossary は「Keystone & permalink glossary」と
  スコープを名乗っており、版語彙はスコープ外。tier 表・promotion gate・Syntax 2.0
  プログラムという主要な消費者が roadmap にいるため、参照距離最短の roadmap 側を正典にし、
  glossary は See also で指す。

## 影響

- `docs/roadmap.md`: §version vocabulary 新設（正典）。§Syntax 2.0 プログラムの
  「版語彙との同時確定」は本 ADR の決定を参照する形に更新。
- `docs/process.md`: リリース運用の 2 箇所（changeset 作成時の gate 規定・リリース前
  チェックリスト）を言語版遷移ベースの文言に置換。
- `docs/glossary.md` / `docs/glossary.ja.md`: See also に version vocabulary を追加。
- [TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md):
  applicable_to に版語彙を追加（正典 = roadmap §version vocabulary）。
- 実装は [#2181](https://github.com/kompiro/karasu/issues/2181)（core 定数 / --version /
  drift ガード）。それまで言語版の正典は spec prose（ADR-1314）のまま。
- 既存ユーザーへの影響: なし（docs とリリース運用の規定変更のみ。パッケージの版付けは
  従来どおり changesets）。
