---
id: TPL-2552
title: "同じ相手を二度書ける参照リストは、件数を数える消費側と id で畳む消費側の両方に届く — 両者を食い違わせない"
status: active
date: 2026-09-04
applicable_to:
  - "1 要素に対して同じ相手を複数回書ける参照リスト（`realizes` / `owns` / `contains` / `handles` / `delivers` / `operations` / `facets`）を新設・拡張するとき"
  - "リストの要素数で場所を確保するレイアウト（グリッドのセル・レーン・スロット）を書くとき"
  - "配置結果を `Map<id, placement>` のような id キーの構造に格納するとき"
  - "宣言の id が一意であることを前提に住所（キー・アンカー・permalink）を組み立てるとき"
known_consumers:
  - realizes-comma-list
  - deploy-layout
discovered_from:
  - issue: "#2552"
  - issue: "#2713"
  - root_cause_file: "packages/core/src/parser/parser.ts:parseRealizesList"
  - root_cause_file: "packages/core/src/renderer/deploy-layout.ts:placeGroupBlock"
related_to:
  - TPL-2542
  - TPL-2075
  - TPL-2161
  - TPL-1386
topic: parser
scope:
  packages:
    - core
---

# TPL-2552: 同じ相手を二度書ける参照リストは、件数を数える消費側と id で畳む消費側の両方に届く — 両者を食い違わせない

## 観点

同じ関係の相手を並べるプロパティは、たいてい**同じ相手を二度書ける**。`realizes A` を 2 行、
`facets a, a`、`owns X` を 2 回 — どれも parse は通る。このとき下流には性質の違う 2 種類の
消費側が同時にいる。

- **件数を数える側** — レイアウトがグリッドのセルを要素数で確保する、レーンを本数で割る、
  ラベルに件数を出す
- **id で畳む側** — 配置結果を `Map<id, …>` に入れる、集合に入れて存在判定する

同じ入力に対して前者は N、後者は 1 を返すので、**重複が 1 件でも混ざった瞬間に両者は食い違う**。
食い違いは例外にならず、「確保したのに誰も描かれない場所」として静かに図に残る。

**不変条件は 1 つ、「数える側と畳む側が同じ数を返すこと」。** どう一致させるかは、その 2 件が
何なのかで決まる。判定は 2 段。

| その 2 件は | 扱い | 例 |
| --- | --- | --- |
| **同一の事実の再掲**（畳んでも失う情報が無い） | 宣言側で 1 件に畳む。診断は出さない | `realizes A` を 2 行、`facets a, a`、同じ team の `owns X`（#2552） |
| **区別できる別々の事実**で、別々に住所を持てる | 両方残し、ビュー側で選ぶ | 別の team が同じノードを `owns`（TPL-2161） |
| **区別できる別々の事実**だが、**住所（id）が衝突している** | 報告する。モデルは書かれたまま保ち、数える側を畳む側に合わせる | 同じ deploy ブロックの `oci app` が 2 つ（#2713） |

1 段目は「その 2 件は互いに区別できる事実か」。区別できないなら宣言側で 1 件にする — 数える側に
「重複を除いて数える」分岐を足すと、数える場所が増えるたびに同じ分岐を書き忘れるため、冪等は
いちばん上流で閉じる。

2 段目は区別できる場合にだけ効く、**その 2 件を別々に指させるか**。指させるなら両方残せる
（TPL-2161）。指させないなら黙って畳んではならない — 片方が図から消えることを作者に伝える必要が
あるので診断を出し、**モデルは書かれたまま保つ**。このとき数える側と畳む側の一致は宣言側では
閉じないので、**数える側が畳む側と同じキーで数える**（グリッドは自分が keying するものを数える）。
上流の producer 全員に一意性を保証させる形にすると、次の producer が同じ食い違いを作り直す。

## 想定される失敗モード

- **幽霊スロット** — `realizes OrderService` を 2 行書いたデプロイ単位で、コンテナのグリッドが
  2 セルを確保する一方 `layoutNodes` は `` `${containerId}::${unitId}` `` キーで後勝ちに畳み、
  ユニット 1 つ分の高さだけ広いコンテナに空白のセルが残った（#2552）。診断は出ず、図だけが狂う
- **綴り違いで抜ける** — 宣言側の畳み込みを「書かれた path が同一か」で行うと、`realizes Api` と
  `realizes Shop.Api` のように**解決先が同じで綴りが違う** 2 件が素通りする。解決先の同一性で
  畳めるのは resolve を持つ層（view 抽出）だけなので、そこにも冪等な membership が要る
- **住所の衝突が無音で通る** — 同じ deploy ブロックに `oci app` が 2 つあると、グリッドは 2 セルを
  確保し `layoutNodes` は 1 件だけ keying するので、#2552 と同じ幽霊スロットが**別の producer から**
  再現した。しかもどの経路でも診断が出なかった（#2713）。冪等を宣言側で閉じる 1 段目だけを見ると
  「黙って畳めばよい」と読めてしまうが、この 2 件は別々の宣言なので黙って畳むと片方が消える。
  報告したうえで、数える側を畳む側に合わせるのが正しい形
- **診断だけ足して数える側を直さない** — 重複を error にしても、グリッドが件数で採寸し続ける限り
  食い違いは残る。同 id を作る次の producer（import の merge、生成器）が現れた時点で再発する
- **register の取り違え** — 重複を「モデルの誤り」と読んで診断を足してしまう。同じ関係の再掲で
  失われる事実は無いので、これは事実ではなくスタイル判断であり（TPL-1386）、しかも同じリポジトリの
  兄弟プロパティ（`facets` / `owns` の同一 team / `contains` の同一 boundary / `delivers`）が
  すべて黙って冪等なら、そのプロパティ 1 つだけが非対称になる
- **spec に書かれない** — 実装が黙って畳んでいるのに spec がそれを述べないと、
  「受理されるが効果も診断も無い」ように見える（TPL-1503 / TPL-2075）。冪等は仕様であって
  実装の都合ではないので、明文化して初めて silent drop と区別がつく

## チェックリスト

同じ相手を二度書けるリスト値プロパティを追加・変更するとき:

- [ ] そのプロパティの消費側を列挙し、**件数を数える側**と **id で畳む側**の両方があるかを確認したか。両方あるなら、同じ相手を 2 回書いた入力で**両者の答えが一致する**ことを assert したか
- [ ] 扱いを 2 段で決めたか。**(1) 2 件は互いに区別できる事実か** — 区別できないなら**宣言を記録する側 1 箇所**で畳む（数える側それぞれに重複除去を書いていない）。**(2) 区別できるなら、2 件を別々に指させるか** — 指させるなら両方残してビュー側で解決する（TPL-2161）、指させない（id が衝突している）なら診断を出す
- [ ] id の衝突を診断にした場合、**数える側も畳む側と同じキーで数えるように直したか**。診断だけでは食い違いは残り、同 id を作る次の producer が再発させる
- [ ] その診断は**その id を作りうる全経路**から出るか（単一ファイルの宣言、import の各 merge 経路、生成器）。1 経路にしか無い規則は、spec がそう書いていても実装されていないのと同じ
- [ ] 綴りが違って**解決先が同じ**になる書き方があるか。あるなら、resolve を持つ層の membership も冪等か（宣言側の畳み込みだけでは届かない）
- [ ] 受理形が複数ある（カンマ列挙と行の繰り返し等）なら、**すべての綴り**で同じ結果になることを assert したか（TPL-2542）
- [ ] 冪等であることを spec に書き、兄弟プロパティと register が揃っているか（黙って畳む / 診断する のどちらかに揃っているか）を確認したか

## 既知の対処パターン

- **宣言側で畳む**: `parseFacetsList` の `if (!existing.includes(id)) existing.push(id)`、
  `parseRealizesList` の `nodePathIdentityKey` による同一 path の除去。formatter は畳んだ後の
  AST を出力するので、canonical 形も自動的に 1 件になる
- **派生 index で畳む**: `buildOwnerIndex` の `if (current === team.id) continue`、
  `buildBoundaryMembership` の「同じ boundary の再掲は追加のエントリにしない」。
  ここで畳むのは、**別の**主体が同じ相手を指した場合に診断を出す判定と同じ場所だから
- **解決層で畳む**: `deriveDeliversEdges` の `seen` セット、`extractDeployView` の
  「1 ユニットは 1 コンテナに 1 回」。解決先の同一性はここでしか分からない
- **報告して、数える側を畳む側に合わせる**: 同 deploy ブロックの重複 unit id は
  `duplicate-node-in-deploy`（error）で報告し、AST は書かれたまま保ったうえで、
  `placeGroupBlock` が**自分が keying するキーで数える**（#2713）。黙って畳めない
  （2 件は別々の宣言）ので、一致は宣言側ではなく「数える側」の修正で取る
- **幾何で fence する**: 幽霊スロットのような「数えた結果」の食い違いは、要素数や Map の
  サイズだけでなく**単一要素のモデルと同じ寸法になること**を assert すると直接捕まる

## 関連テスト

- `packages/core/src/parser/parser.test.ts`（`describe("repeated realizes target (#2552)")` — 両綴りで 1 件、最初の range が残る、解決先が同じでも綴りが違えば 2 件のまま）
- `packages/core/src/view/deploy-view-extract.test.ts`（`describe("a unit joins one container once (#2552)")` — bare / qualified の 2 参照でも membership は 1 件）
- `packages/core/src/renderer/deploy-layout.test.ts`（`describe("a target realized twice reserves no empty cell (#2552)")` — 単一対象のモデルと寸法が一致する）
- `packages/core/src/formatter/formatter.test.ts`（"collapses a target named twice to a single realizes line"）
- `packages/core/src/resolver/warnings.test.ts`（"warns once for a target that is unresolved and named twice" — 誤りの報告回数も「数える側」の 1 つ）
- `packages/core/src/compile/deploy-node-metadata.test.ts`（詳細パネルが読む metadata が 1 件、ただし解決先が同じ 2 参照は 2 件のまま）

2 例目（[#2713](https://github.com/kompiro/karasu/issues/2713) — 同じ観点を、同じ相手の再掲ではなく **id を共有する 2 つのユニット**が踏んだ）:

- `packages/core/src/parser/parser.test.ts`（`describe("duplicate deploy unit id within one file (#2713)")` — 単一ファイル内の id 重複を報告し、範囲は重複した側を指す）
- `packages/core/src/fs/import-resolver.test.ts`（`describe("deploy unit id uniqueness on the named-import path (#2713)")` — named / wildcard の両経路が 1 つのガードを共有する）
- `packages/core/src/renderer/deploy-layout.test.ts`（`describe("units sharing an id reserve no empty cell (#2713)")` — 同 id ペアのコンテナは、id が異なる 2 ユニットのコンテナより厳密に低い）

## 派生元 spec

- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §Writing physical diagrams の `realizes`
  複数指定（同じ対象を二度書いても冪等、残るのは最初の綴り、解決先が同じ 2 参照は 2 件のまま）
- `docs/spec/syntax.md` / `docs/spec/syntax.ja.md` — §Facets の
  「Repeated properties and repeated ids merge」（同じ id を二度書いても冪等でエラーではない）
