---
id: TPL-2075
title: "parse を通った構造は、どこかの view で描画されるか診断されるかのどちらかである"
status: active
date: 2026-07-30
applicable_to:
  - "宣言の置き場所（スコープ）によって描画先の view が決まる構文要素を追加・変更するとき"
  - "view 抽出（extract）側で「条件に合わない要素を filter で落とす」実装を書くとき"
  - "同じ関係を複数の綴りで書ける構文に、正準形（canonical form）を定めるとき"
known_consumers:
  - view-extract
  - resolver-warnings
discovered_from:
  - issue: "#2075"
  - issue: "#2223"
  - issue: "#2501"
  - root_cause_file: "packages/core/src/view/view-extract.ts:972"
related_to:
  - TPL-1503
  - TPL-2170
  - TPL-1936
  - TPL-2184
topic: resolver
scope:
  packages:
    - core
---

# TPL-2075: parse を通った構造は、どこかの view で描画されるか診断されるかのどちらかである

## 観点

parser が受理した構造には 2 つの正当な行き先しかない:

1. **いずれかの view で描画される** — その view と描画条件が spec に書かれている
2. **診断される** — 描画されない事実が warning / error として author に返る

「parse は通る、どの view にも出ない、診断も無い」という**第 3 の状態
（silent drop）を作らない**。TPL-1503 が語彙（名前）について述べる原則を、
**構造（配置・スコープ）**に拡張したもの。TPL-2184 が「同じ状態を表す複数の配置は
同じ診断を出す」（診断の**一致**）を見るのに対し、本観点は「そもそも信号が
1 つでもあるか」（診断の**存在**）を見る。両者は同じ配置バグの別の断面で、
silent drop は本観点で先に落ちる。

silent drop はとくに view 抽出側の filter で生まれる。
`edges.filter(e => childIds.has(e.from) && childIds.has(e.to))` のような
「描ける条件」の filter は、条件から漏れた要素を**黙って**捨てる。filter を
書いた側は「その view に出さない」つもりでも、他のどの view にも出ないなら、
それはモデルからの消失であって表示の絞り込みではない。

判定は「この要素は**どこか 1 つでも**描画先があるか」で行う。単一 view の中で
「出す / 出さない」を考えている限り、この観点は発火しない。

## 想定される失敗モード

- `system T { A -> B }`（A, B は `service S` 配下の `domain`）が parse を通り、
  循環依存チェッカーには見えるのに、どの view にも矢印が出ず診断も出ない（#2075）。
  author には「edge は存在する」信号だけが返る
- 生成モデル（reverse-architecture harness 等）が正準形でない綴りを吐いたとき、
  validate/repair ループが silent drop を検出できず、fidelity が静かに劣化する
- 同じ間違いが、1 段深いスコープでは error（`edge-source-mismatch`）、上位スコープでは
  沈黙、というように**配置によって診断の有無が変わる**
- 描画を足す変更が、**parser が既に error で弾いた宣言まで一緒に描く**（#2501）。
  error recovery で AST に残った宣言を「両端が peer なら描く」だけの条件で拾うと、
  診断されているのに描画もされる（本観点の「どちらか一方」の反対側）。正準形で書いた
  同じエッジと絵が一致するため、error を直しても見た目が変わらない
- bare id の cross-domain entity relation のように、drop することが spec に
  書かれていても検出器が無く、書き手には気付けない（TPL-1936）

## チェックリスト

新しい構文要素・新しい配置（スコープ）・view 抽出の filter を追加/変更するときに確認する:

- [ ] その要素が**どの view に描画されるか**を列挙し、いずれにも該当しない書き方を 1 つ以上作って、実際に全 view path で抽出結果に現れないことを確認したか
- [ ] 現れない書き方に対して診断（warning / error）が出るか。出ないなら診断を足したか
- [ ] 同じ意味の間違いが別のスコープでも書けるか。書けるなら、そのすべてで同じ register の診断が出るか（error / 沈黙に割れていないか）
- [ ] 正準形（描画される綴り）で**誤って発火しない**ことを、cross-boundary・多ファイル merge（同 id 再オープン）の両方で assert したか
- [ ] view 側の filter 条件を変更したとき、診断側の判定式も追随したか（両者は同じ規則の表と裏）
- [ ] 「診断されているか」を数えるとき、**parser の diagnostics も含めたか**。resolver の
      warning だけを見ると、parse 時 error で弾かれた宣言が「描画も診断もされている」状態を
      素通りする（#2501）
- [ ] 描画側に足したガードが、**そのガードに対応する診断を持たない配置まで巻き込んでいないか**。
      規則を持たないブロック（`client` / `database` 等、parser が `parentId` を渡さない kind）に
      同じ条件を当てると、診断なしの silent drop を新たに作る

## 既知の対処パターン

- 描画条件（view 抽出の filter）と診断の判定式を**同じ規則の表と裏**として実装し、
  片方だけ変えられないようにテストで縛る
- 同じ規則を 2 か所の filter が実装しているなら、**述語を 1 つ抽出して両方から呼ぶ**。
  条件を並べて書くと、片方だけ直された時点で「どちらが規則か」が repo から失われる
  （#2501 の `isAnchoredAt` — 描画側の 2 helper が同じ起点スコープ規則で割れていた）
- 「endpoint が存在しない」（`unresolved-edge-endpoint`）と「存在するがこのスコープでは
  描けない」（`edge-endpoint-not-at-scope`）を別コードに分け、前者を skip 条件に
  入れて二重報告を避ける
- peer 集合は**ノードインスタンス単位**で数える（id で union すると、同一ファイル内の
  同 id ブロックや 2 service に分散した同 id domain のように、renderer が実際には
  描画しない配置を「描ける」と見なして false negative になる — 決定と実測は
  [ADR-2075](../adr/2075-edge-endpoint-scope-diagnostic.md)）
- 宣言スコープに描画先が無いと判明したら、**診断を足す前に「そのスコープが正準形か」を
  問う**。正準形（spec がその置き場所を推奨している綴り）なら描画側を直す方が筋がよい
  — #2223 の service-anchored edge は、起点スコープ規則が求める形そのものだった

## 派生元 spec

- `docs/spec/syntax.md` § Edge declaration — Endpoint scope
- `docs/spec/syntax.md` § Edge declaration — Edges inside a service block
- `docs/spec/diagnostics.md` § Declaration, edge placement & structure

## 関連テスト

- `packages/core/src/view/anchored-edge-render-or-warn.test.ts` — 配置ごとに
  「どこかの view に描画される」か「報告される」かのちょうど一方が成り立つことを表で縛る
  （view 側の filter と診断側の判定式を同時に見る唯一のテスト）
- `packages/core/src/resolver/warnings.test.ts` › `edge-endpoint-not-at-scope warning`
- `packages/core/src/view/view-extract.test.ts` › `service-anchored edges (#2223)`
