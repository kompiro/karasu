---
id: TPL-2635
title: "所有を読む側は「宣言だけか、直近の owned 祖先まで遡るか」を宣言し、その選択をテストで固定する"
status: active
date: 2026-09-04
applicable_to:
  - "`owns` / `ownerIndex` / `buildTeamOwnership` を読んで「このノードのチーム」を求めるコード・ビューを足す・変えるとき"
  - "所有の継承（nearest owned ancestor）が効く範囲を spec に書く・変えるとき"
  - "親から子へ意味が降りる別の関係（boundary・facet・アノテーション継承）に、同型の派生読み取りを足すとき"
known_consumers:
  - team-dependency-extract
  - owner-index
  - group-by-team
discovered_from:
  - issue: "#2635"
  - root_cause_adr: "ADR-1566"
  - root_cause_file: "packages/core/src/parser/reference-validation.ts"
related_to:
  - TPL-2161
  - TPL-1032
  - TPL-2075
  - TPL-1386
topic: resolver
scope:
  packages:
    - core
    - app
---

# TPL-2635: 所有を読む側は「宣言だけか、直近の owned 祖先まで遡るか」を宣言し、その選択をテストで固定する

## 観点

`owns` の読み手は 2 通りある。**宣言されたノードだけを見る**読み手（カードの team チップ、
Group by: team のフレーム）と、**直近の owned 祖先まで遡る**読み手（チーム依存の導出）である。
どちらも正しく、どちらを採るかは読み手の問いによって決まる — しかし**どちらを採ったかが
コードにも spec にも書かれていないと、両者は静かに混ざる**。

判定基準は 1 つ、**そのコードが「このノードのチームは何か」に答えるかどうか**。答えるなら、
遡るか遡らないかを名前かコメントで宣言し、次の 3 点を同じ PR でテストに固定する。

1. **遡らない側は、遡ったら通る入力で「チームなし」を返す。** 継承が後から
   `ownerIndex` に忍び込むと、`owns` を書いていないノードにチップが出る。「増えた表示」は
   バグに見えないので、遡らないことを assert していない限り誰も気づかない
2. **遡る側は、直近の祖先で止まることを assert する。** 最も近い宣言が単独で勝ち、
   囲む側と和集合を取らない。祖先を全部集める実装は「子 team が持つノードを親 team も
   持っている」と読ませ、`nested` 判定と組織図の意味を同時に壊す
3. **遡って届かなかった端点を、黙って落とさない。** 遡りは所有の記述密度を隠す方向に
   働く（domain に owns が無くても service から降りてくる）。届かなかった端点を出力に
   残さないと、疎な導出結果が「モデルを網羅した」と読まれる（TPL-2075 / TPL-2170）

遡りは **1:N を 1:1 に畳んでよい理由にはならない**。共同所有で 1 ノードが複数 team を返すのは
複数の team が同じノードを名指したからで、遡りの結果ではない — 両者を同じ「複数あるから 1 つ
選ぶ」処理に流し込むと TPL-2161 が禁じる欠落に戻る。

## 想定される失敗モード

- **継承の漏出** — 派生ビュー向けに足した遡りが `ownerIndex` 側の共有ヘルパに入り、
  `owns` を書いていないノードにチップやフレームが出る
- **継承の欠落** — 派生ビューが宣言だけを読み、domain 粒度のエッジがほぼ全滅して
  「依存が無い」と読める空のグラフになる
- **祖先の全集め** — 直近で止めずに祖先の team をすべて集め、親 team が子 team の
  ノードまで持っているように見える。`nested` 判定が常に真になり、cross-team が消える
- **未解決の消音** — 遡っても team に届かない端点を出力から落とし、`owns` の記述密度の
  低さが導出結果の完全性として誤読される
- **1:N の再畳み込み** — 遡りの実装で「候補が複数あるので 1 つ選ぶ」を書き、共同所有の
  出ていく側が消える（TPL-2161 の再発）

## 確認手順

1. 所有を読む新しいコードに対し、`owns` を持たない子ノードを含む fixture を 1 つ用意する
2. 遡らない読み手は「チームなし」、遡る読み手は「祖先の team」を返すことを、
   **同じ fixture で両方**assert する（片方だけだと、もう片方に流用されたとき落ちない）
3. 子と祖先の両方に `owns` がある fixture で、子の宣言が単独で勝つことを assert する
4. 共同所有（同一ノードを 2 team が `owns`）で、遡る側が両方の team を返すことを assert する
5. 遡っても届かない端点が出力に残ることを assert する。`user` 端点はその数え上げから
   除く（アクターは ownable ではない）

## 関連テスト

- `packages/core/src/view/team-dependency-extract.test.ts` — 継承・直近優先・共同所有・
  未解決端点・`user` 除外
- `packages/core/src/view/derivation-contracts.test.ts` — `extractTeamDependencies` の
  preserves / transforms 行（TPL-510 の登録義務）

## 派生元 spec

- `docs/spec/syntax.md` §「team node」→「Ownership inheritance — the nearest owned ancestor」
- `docs/spec/syntax.ja.md` §「team ノード」→「所有の継承 — 直近の owned 祖先」
