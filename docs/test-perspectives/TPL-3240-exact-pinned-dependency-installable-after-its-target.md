---
id: TPL-3240
title: "完全一致で依存するパッケージは、依存先がインストールできるようになってからインストールできるようにする"
status: active
date: 2026-11-01
applicable_to:
  - "同じリリースで複数のパッケージを出し、あるパッケージが別のパッケージを完全一致の版で依存に持つ構成（monorepo の `workspace:*` は tarball で完全一致になる）"
  - "公開が 1 回の操作で終わらず、パッケージごとに承認・公開が分かれる流れ（staged publishing の承認、手動の公開、途中で失敗して再実行する公開）"
known_consumers:
  - karasu-cli
  - karasu-skills
discovered_from:
  - issue: "#3240"
  - root_cause_adr: "ADR-2901"
  - root_cause_file: "packages/cli/package.json"
related_to:
  - TPL-1681
  - TPL-2446
topic: build
scope:
  packages:
    - cli
    - skills
---

# TPL-3240: 完全一致で依存するパッケージは、依存先がインストールできるようになってからインストールできるようにする

## 観点

パッケージ A が パッケージ B を完全一致の版（`"B": "1.2.3"`）で `dependencies` に持つなら、A のその版がインストールできるようになった時点で、B のその版もインストールできなければならない。どちらか片方だけが公開された状態では、`npm i A` は B の版を解決できずに失敗する。

公開を 1 回の操作でまとめて行うあいだは、この順序は公開のツールが暗黙に守ってくれる。公開がパッケージごとの操作に分かれると（staged publishing で 1 つずつ承認する、途中で失敗して一部だけ再実行する）、順序はその操作を行う人やスクリプトに移る。順序は手で並べた表ではなく、公開する tarball の `dependencies` から導く。monorepo の `workspace:*` はソースでは版を持たず、pack したときに完全一致の版になるので、ソースの `package.json` を見ても依存の版は分からない。

## 想定される失敗モード

- staged publishing で依存元（`karasu`）を先に承認し、依存先（`karasu-skills`）の承認を忘れる、または reject する。そのあいだ `npm i karasu` が `ETARGET` で失敗する（#3240 で設計時に予測）
- 公開の順序を手で並べた一覧に書き、あとで足したパッケージがその一覧の末尾に入って、依存先より後に並ぶ
- 一部のパッケージの公開に失敗した再実行で、依存先だけが公開されずに残り、依存元は前の試行で公開済みになっている
- 依存の版をソースの `package.json` から読み、`workspace:*` を「どの版でもよい」と解釈して順序の制約が無いと判断する

## チェックリスト

- [ ] 公開・承認の順序を、公開する各パッケージの `dependencies` から導いているか（依存先が先）。手で並べた一覧に頼っていないか
- [ ] 依存の版を、pack した tarball の `package.json`（`workspace:*` を置き換えた後）で判断しているか
- [ ] 依存元がインストールできるのに、その完全一致の依存先がインストールできない状態を検出し、知らせる仕組みがあるか
- [ ] 依存先の公開が失敗・reject されたとき、依存元の公開・承認を止めるか
- [ ] 公開するパッケージを足したとき、順序の導出と上の検出の対象に自動で入るか（パッケージの一覧を 1 か所から引いているか）

## 既知の対処パターン

（未確立）#3240 の Design Doc は、承認のスクリプトが `changeset pack` の書く公開計画（`publish-plan.json`。依存の順に並び、`devDependencies` は数えない）の順に承認し、記録の workflow が「依存元が npm にあり、完全一致の依存先が無い」状態を検出してトレインの Issue にコメントする形を提案している。いまの `changeset publish` も同じ計画の順に公開するので、まとめて公開するあいだは順序が守られている。

## 関連テスト

（未確立）#3240 の実装で、承認の順序の導出と、順序の違反の検出を `scripts/release/` のテストに置く予定。

## 関連 TPL

- [TPL-1681](TPL-1681-publishable-tarball-completeness.md): tarball に何が入るかを扱う。本 TPL は、tarball が指す依存の版がインストールできる順序を扱う
- [TPL-2446](TPL-2446-gate-side-check-runs-over-the-whole-set.md): 検出の対象を列挙せず全体から導く、という点を本 TPL のチェックリスト最後の項目に適用している
