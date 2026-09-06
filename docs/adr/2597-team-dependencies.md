---
id: ADR-2597
title: チーム間の依存を `owns` × 論理エッジから導出する
status: accepted
date: 2026-09-04
topic: core-concepts
related_to:
  - ADR-1062
  - ADR-14
  - ADR-309
  - ADR-1566
  - ADR-1583
  - ADR-2161
  - ADR-1858
  - ADR-766
  - ADR-2442
  - ADR-2075
scope:
  packages: [core, cli, app]
assumptions:
  - "file: packages/core/src/view/team-dependency-extract.ts"
  - "symbol: packages/core/src/view/team-dependency-extract.ts :: extractTeamDependencies"
  - "symbol: packages/core/src/parser/reference-validation.ts :: buildTeamOwnership"
  - "symbol: packages/core/src/renderer/team-dependency-graph.ts :: renderTeamDependencyGraph"
  - "file: packages/cli/src/team-dependencies.ts"
---

# ADR-2597: チーム間の依存を `owns` × 論理エッジから導出する

- **日付**: 2026-09-04
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2597](https://github.com/kompiro/karasu/issues/2597)（親）、
    [#2635](https://github.com/kompiro/karasu/issues/2635)（slice A）、
    [#2636](https://github.com/kompiro/karasu/issues/2636)（slice B）、
    [#2637](https://github.com/kompiro/karasu/issues/2637)（slice C）
  - [ADR-1062](1062-crud-matrix-view.md)（派生プロジェクションの先例。新 `.krs` 構文を却下）、
    [ADR-14](14-organization-diagram.md)（org 図。エッジ宣言を初期スコープ外と明記）、
    [ADR-309](309-org-tree-view.md)（org タブに第 2 モードを足した先例）、
    [ADR-1566](1566-ownership-during-migration.md) / [ADR-1583](1583-team-annotations-owner-priority.md)（共同所有と primary 選択）、
    [ADR-2161](2161-boundary-membership-1n.md)（1:N membership index の既存形）、
    [ADR-766](766-auto-switch-empty-views.md)（空ビューの扱い）、
    [ADR-2442](2442-owns-existence-any-declared-node.md)（`owns` の kind 拒否）、
    [ADR-2075](2075-edge-endpoint-scope-diagnostic.md)（endpoint scope）
  - TPL: [TPL-2635](../test-perspectives/TPL-2635-ownership-resolution-declares-its-walk.md)（本 ADR と同時に起票）、
    [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、
    [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md)、
    [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)、
    [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)
  - AT: [AT-2635](../acceptance/2635-team-dependency-extraction.md) /
    [AT-2636](../acceptance/2636-team-dependency-org-mode.md) /
    [AT-2637](../acceptance/2637-structural-overlap.md)

## 背景

`docs/concepts.md` は組織面を第一級に置く理由を逆コンウェイ戦略に置いている。
しかし実際には、その議論の最後の一手を読者が頭の中で行っていた —
「`ECommerce` は ec-team、`Payment` は payment-team、両者にエッジがある。
つまりこの 2 チームは話す必要がある」という join を、system view のチームチップと
org view のツリーを往復しながら人間が組み立てていた。

join に必要なデータは両方すでにモデルにある。#2597 の spike で、`owns` と論理エッジを
突き合わせればチーム間の依存が**新しい `.krs` 構文なしで**機械的に導出できることを
3 モデルで確認し、同時に素朴な実装が壊れる場所も特定した。

## 決定

`owns` と論理エッジの join からチーム間の依存を導出し、CLI（`karasu team-dependencies`）と
org タブの第 3 モードに投影する。`.krs` に新しい構文は足さない。

## 理由

- **必要な情報はすでにモデルにある。** ADR-1062 が CRUD マトリクスで同型の判断を
  下している。著者はすでに `owns` とエッジを書いており、宣言を増やすのは重複になる。
- **面の置き場所は 2 つの先例が別々の問いに答えている。** ADR-1062 は
  「派生プロジェクションをどう構造化するか」（抽出 → 純関数 projection → 複数面）、
  ADR-309 は「org の話は org タブにモードとして足す」。前者を core の構造に、
  後者を app の置き場所に採り、タブを増やさずに CLI の grep 動線を得た。
- **時間軸の非目標に抵触しない。** 導出するのは「A と B は調整が必要な関係にある」
  という恒常的な構造事実であって、メッセージの往復順序ではない。

## 決定の内訳

### 1. 所有は 1:N 関係を本ビュー用に構築する（`ownerIndex` を使わない）

`buildTeamOwnership(file): Map<nodePathKey, teamId[]>` を `buildOwnerIndex` の隣に置く。
`ownerIndex` は 1:1 で、共同所有時は primary 1 つに畳まれる（ADR-1583）。素朴に join すると
引き継ぎ中の**出ていく側のチームが導出結果から消える** — 本当に調整が要る相手であり、
この機能の存在理由そのものの場面で壊れる（TPL-2161）。

`ownerIndex` 側は変更しない。primary 1 つで正しい消費者（カードのチップ、
Group by: team のフレーム）はそのまま。

**所有の単位でない対象は入れない。** `resolveDeclaredRef` は `owns <systemId>` を
kind 拒否として報告できるよう system を候補に残す（ADR-2442）が、拒否された主張が
関係に入ると、下記の継承がそのチームに system 配下を丸ごと配ってしまう。

### 2. 所有は直近の owned 祖先まで継承する

`owns` を持たないノードは、祖先を遡って最初に見つかった owner のチームに解決する。
どの祖先も owned でなければ未解決。`owns` は service 粒度で書かれる一方、依存を述べる
エッジは domain 間に書かれることが多く、遡りが無いと domain 粒度のエッジがほぼ全滅する。

これは spec に明記した新しい意味論である（`docs/spec/syntax.md` § team node）。
遡るのは**派生的な読み取り**だけで、`ownerIndex` とカードのチップは宣言されたノードしか見ない。

### 3. 端点の到達範囲は共有 resolver に従う

`resolveEdgeEndpoint`（ADR-2075 / #2577）を引く。ただし `peers(C)` が意図的に覆わない
配置（`domain` → `domain`、service 起点）については、**エッジが宣言されたトップレベル
root の内側に限った**接尾辞一致にフォールバックする。無制限のフォールバックは、bare id が
別 system の同名ノードに届き、どのビューにも描かれないチーム対を導出する。

### 4. 出荷する signal は cross-team / nested / 未所有 / structural overlap

- **cross-team**（sync/async 区別つき）
- **nested**: 一方が他方の org ツリー上の祖先。依存は実在するがチーム**間**ではない
- **未所有端点**: 必ず可視化する。`owns` の記述密度がそのまま導出の完全性を決めるため、
  黙って疎なグラフを描くとモデルの大半を落としたことを「網羅した」と誤読させる。
  所有しえない kind（`user` / `system`）はこの数え上げから除く
- **structural overlap**（slice C）: チーム A が持つノードがチーム B の持つノードの
  **内側**にある。エッジが跨がないので join からは見えないが、両チームは囲みの構造に
  ついて合意が要る。両端とも**宣言された** `owns` を要求する — 継承した owner は定義上
  囲みのチームなので、認めると owned service 配下の全ノードが overlap になる

### 5. sync / async は畳まない

async は意図的な疎結合であり、調整の必要度が sync と異なる。循環検出が async を
除外するのと同じ理由（`docs/concepts.md`）。同じチーム対が両方を持つ場合は 2 本になる。

### 6. 眺める面はグラフ、grep する面は行列

同じ抽出結果から 2 つに projection する。SVG はチームをノードとした有向グラフ
（sync 実線 / async 破線 / nested は減光）、md は team × team の行列 + provenance 表、
csv は `relation` 列で判別する tidy data。

### 7. 語彙は "team dependency" / "structural overlap"

`communication` は `docs/spec/glossary.md` ですでにノード間エッジに束縛されており、
組織面の導出関係に再利用すると ADR-1858 が `cluster` で避けたのと同型の語彙衝突になる。
`coupling` も async に束縛済み。

### 8. 未所有と structural overlap は診断にしない

診断にすると `owns` を隅々まで書いていない既存モデルすべてにノイズが出る。
ビュー内の表示に留め、診断化は別途判断する。

## 却下した案

- **`.krs` にチーム間エッジを宣言する構文を足す。** 情報が二重管理になり、
  宣言とモデルが食い違いうる。ADR-1062 と同じ理由で却下。
- **専用タブを増やす。** タブが 5 つになり ADR-766 の空ビュー分岐も増える。
  「チームの話は org タブ」という直感からも外れる。CLI 側で grep 動線は確保した。
- **system view のエッジをチーム跨ぎで色分けするオーバーレイ。** チーム対チームの
  集約グラフにならず「誰と誰が話すか」の一覧が得られない。Group by: team と視覚的にも競合する。
- **チームあたりの依存本数に閾値を持たせる。** karasu は循環を観測して判断しない立場
  （`docs/concepts.md`）。数を見せるところまでに留める。
- **個人（`member`）粒度の導出。** `member` は `owns` を持たず、person 粒度の所有は
  言語に存在しない。#2597 で明示的に切り出した。`member` は `slack` / `github` を
  持つため、導出したチーム依存を連絡先まで解決すること自体は新構文なしに可能である。

## 影響範囲

- 既存ユーザーへの影響なし。`.krs` の構文も既存ビューの描画も変えない。
- ドキュメント: `docs/spec/syntax.md`（所有の継承）、`docs/spec/glossary.md`
  （team dependency / structural overlap）、`docs/tools/cli.md`・`docs/tools/app.md`
- app の org タブは grid / tree / dependencies の 3 モードを 1 つの値で持つ
  （`useOrgDisplayMode`）。2 つの boolean が食い違う状態には到達できない（TPL-1032）
