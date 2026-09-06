# チーム間の依存を `owns` × 論理エッジから導出して描く

- **日付**: 2026-08-24
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2597](https://github.com/kompiro/karasu/issues/2597)
  - 関連 ADR: [ADR-1062](../adr/1062-crud-matrix-view.md)（派生プロジェクションの統治的先例。新 `.krs` 構文を却下）、[ADR-14](../adr/14-organization-diagram.md)（org 図。**エッジ宣言を初期スコープ外**と明記）、[ADR-309](../adr/309-org-tree-view.md)（org タブに第 2 モードを足した先例）、[ADR-1566](../adr/1566-ownership-during-migration.md)（co-ownership は tolerated fact、info 診断）、[ADR-1583](../adr/1583-team-annotations-owner-priority.md)（`@migration_target` が primary を取る）、[ADR-2161](../adr/2161-boundary-membership-1n.md)（1:N membership index の既存形）、[ADR-1858](../adr/1858-system-view-group-by-team.md)（Group by team、語彙衝突による却下の前例）、[ADR-2408](../adr/2408-owns-infra-target-and-chip-gate.md) / [ADR-1720](../adr/1720-client-realize-owns-target.md)（`owns` の valid target）、[ADR-766](../adr/766-auto-switch-empty-views.md)（空ビューの自動切替）
  - 関連 TPL: [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（**本設計の中心制約**）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)、[TPL-2170](../test-perspectives/TPL-2170-dangling-edge-preserves-node.md)、[TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)、[TPL-2200](../test-perspectives/TPL-2200-render-claim-names-its-view-level.md)、[TPL-2157](../test-perspectives/TPL-2157-resolved-relation-rendered-for-every-kind.md)、[TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md)、[TPL-2169](../test-perspectives/TPL-2169-deploy-org-wildcard-propagation.md)、[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)、[TPL-1225](../test-perspectives/TPL-1225-three-face-intersection-single-artifact.md)
  - コード: `packages/core/src/parser/reference-validation.ts`（`buildOwnerIndex`）、`packages/core/src/view/crud-matrix-extract.ts`（先例）、`packages/core/src/view/derivation-contracts.test.ts`（新規 derivation の登録先）、`packages/core/src/renderer/org-renderer.ts` / `org-tree-renderer.ts`

## 背景・課題

`docs/concepts.md` は組織面を第一級に置く理由を逆コンウェイ戦略に置いている。
「このサービスを分割したい、新しい境界はどのチームが持つべきか」を論理面と同じ卓上で
議論できることが狙いである。

しかし現状、**その議論に必要な最後の一手を読者が頭の中で行っている**。
「`ECommerce` は ec-team、`Payment` は payment-team、両者にエッジがある。
つまり ec-team と payment-team は話す必要がある」という join を、system view の
チームチップと org view のツリーを往復しながら人間が組み立てている。

この join に必要なデータは両方すでにモデルにある。#2597 の spike で、
`owns` と論理エッジを突き合わせれば**新しい `.krs` 構文なしで**チーム間の依存が
機械的に導出できることを 3 モデル（`examples/en/org`、
`examples/en/multi-file-system`、合成モデル）で確認した。

同時に spike は、素朴な実装が壊れる場所も特定した。以下の設計はその修正である。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `ownerIndex` | `Map<nodePathKey, teamId>`、**1:1**。`buildOwnerIndex`（`reference-validation.ts`）が parse 時に構築。co-ownership 時は `@migration_target` > 無印 > `@deprecated` の優先度で primary を 1 つ選ぶ（ADR-1583） |
| co-ownership | エラーではなく tolerated fact。`duplicate-owner-assignment` を **info** で発行（ADR-1566）。移行の引き継ぎ中に正当に発生する |
| `boundaryMembership` | `Map<nodeId, boundaryId[]>`、**1:N**。同じ「多重所属」問題を 1:N で解いた既存形（ADR-2161） |
| `owns` の valid target | `service` / `domain` / `client` + infra ブロック（`OWNS_TARGET_KIND_SET`）。`user` は対象外（アクターはチームの所有物ではない） |
| org view | ツリーのみ。`org-renderer.ts` / `org-tree-renderer.ts` に**エッジ描画は存在しない**。ADR-14 が「org 図のエッジ宣言（`->`）は初期スコープ外」と明記 |
| org タブのモード | グリッド drilldown と Tree View の 2 モードをツールバートグルで併存（ADR-309） |
| 派生ビューの先例 | CRUD マトリクス。`view/crud-matrix-extract.ts` で抽出 → `crud-matrix-format.ts`（md/csv）と `renderer/matrix-svg.ts`（svg）に projection → `karasu matrix` + app の専用タブ（ADR-1062） |
| 新規 derivation の登録義務 | `view/derivation-contracts.test.ts` の `DERIVATION_CONTRACTS` 表に行を足さないと TPL-510 の防御が効かない |

### spike で確認した事実

`owns` × エッジの join から 4 種の signal が落ちた。

| signal | 内容 |
| --- | --- |
| cross-team | エッジ両端の owner が異なる。sync/async を区別 |
| nested | 一方が他方の org ツリー上の祖先（親チーム内の作業部会）。依存は実在するがチーム**間**ではない |
| structural overlap | チーム A が持つノードがチーム B の持つノードの**内側**にある。エッジが跨がないので join からは見えないが、両チームは囲みの構造について合意が要る |
| bridge member | 複数チームに所属する個人 |

所有の**継承**が必須であることも確認した。`owns` が書かれていない `domain` は
親 `service` のチームに解決する必要があり、これを入れないと domain 粒度のエッジが
ほぼ全滅する（そして domain 粒度こそ依存が実際に記録される場所である）。

## 制約・前提

- **`.krs` に新しい構文を足さない。** ADR-1062 が同型の判断を下している。author は
  すでに `owns` とエッジを書いており、必要な情報は揃っている。
- **`ownerIndex` を消費してはならない。** 後述の決定 1 の理由。既存の
  `ownerIndex` の 1:1 性は変更しない（カードのチップ・Group by: team は
  primary 1 つで正しく、そちらの要件は変わらない）。
- **時間軸を持ち込まない。** `docs/concepts.md` の非目標「振る舞い・順序・時間軸を
  モデル化しない」に抵触しない枠づけが要る。導出するのは「A と B は調整が必要な
  関係にある」という**恒常的な構造事実**であって、メッセージの往復順序ではない。
- **`user` 端点は未解決として数えない。** アクターは ownable ではなく、
  `user -> client` は原理的にチーム間依存を生まない。これは仕様であり欠落ではない。
- **個人（`member`）粒度は out of scope。** `member` は `owns` を持たず、person 粒度の
  所有は言語に存在しない。#2597 で明示的に切り出し済み、別途検討する。

## 検討した選択肢

論点は 7 つあるが、選択肢が割れるのは主に**出力面**（D4）である。他は理由が
一意に決まるため「現時点の方針」にまとめる。

### 案1: org view の第 3 モード

ツールバートグルで org タブに「依存モード」を足す。ADR-309 がすでに
グリッド / Tree の 2 モード併存を確立している。

**メリット**

- チームのことを考えるとき人が開くのは org タブであり、そこに答えがある
- 新しいタブを増やさない（現状 system / deploy / org / CRUD で 4 つ）
- ADR-14 が留保した「org 図のエッジ」の空白地を、宣言ではなく導出で埋める

**デメリット**

- org tree renderer はツリー専用で、導出結果は DAG。描画器の新規実装が要る
- org タブの状態（モード × drilldown パス）がさらに増える

### 案2: 専用タブ + CLI（ADR-1062 の完全踏襲）

CRUD と同じ形。`view/team-dependency-extract.ts` + フォーマッタ + `karasu` サブコマンド + 専用タブ。

**メリット**

- 先例に完全に一致し、実装・テストの型が既にある
- CLI で md/csv が出せる。Conway 分析は表計算やレビュー文書に流し込む動線が実際に要る

**デメリット**

- タブが 5 つになる。ADR-766 の空ビュー自動切替の分岐も増える
- 「チームの話は org タブ」という直感から外れる

### 案3: system view のオーバーレイ

system view のエッジをチーム跨ぎかどうかで色分けする。

**メリット**

- 新しい面を増やさない。`system-view-grouping.md` の計測でも副次効果として観察されている

**デメリット**

- チーム対チームの集約グラフにならず、「誰と誰が話すか」の一覧が得られない
- Group by: team とオーバーレイが視覚的に競合する

## 比較

| 観点 | 案1（org 第 3 モード） | 案2（専用タブ + CLI） | 案3（system オーバーレイ） |
| --- | --- | --- | --- |
| 実装量 | 中（描画器が要る） | 中（先例のコピー） | 小 |
| 先例との整合 | ADR-309 | ADR-1062 | なし |
| 「誰と誰が」の一覧性 | 高 | 高 | 低 |
| grep する動線 | なし | あり | なし |
| タブ増加 | なし | +1 | なし |

## 現時点の方針

**案1 と案2 を分割して両取りする**。抽出とフォーマッタは ADR-1062 の型で
`packages/core` に置き（CLI から md/csv/svg が出る）、**app 上の視覚面は
案1 のとおり org タブの第 3 モードにする**。

理由は、2 つの先例が別々の問いに答えているためである。ADR-1062 が確立したのは
「派生プロジェクションをどう構造化するか」（抽出 → 純関数 projection → 複数面）で、
これは面の置き場所とは独立に正しい。ADR-309 が確立したのは「org の話は org タブに
モードとして足す」で、こちらが面の置き場所の答えになる。タブを増やさずに
CLI の grep 動線を得られる。

以下、7 つの決定。

### 決定 1: 所有は 1:N 関係を本ビュー用に構築する（`ownerIndex` を使わない）

**これが本設計の中心的な制約である。** `ownerIndex` は 1:1 で、co-ownership 時は
primary 1 つに畳まれる。素朴に `ownerIndex` を join すると、引き継ぎ中の
**出ていく側のチームが導出結果から消える**。spike で再現した:

```
owns Payments を oldPay と newPay @migration_target が二重宣言
→ ownerIndex: { Shop.Payments: 'newPay' }
→ 導出: checkout -> newPay のみ。oldPay はグラフから消滅
```

引き継ぎ中に本当に調整が要る相手は出ていく側であり、これはこの機能の存在理由
そのものの場面で壊れる。TPL-2161（宣言された多重所属を派生 index で捨てない。
単一値しか扱えないビューの都合は view 側で解決する）が名指しで禁じている失敗である。

したがって本ビューは `team.properties.owns` を `collectDeclaredNodePaths` に対して
再走査し、`Map<nodePathKey, teamId[]>` の 1:N 関係を自前で構築する。
`boundaryMembership`（ADR-2161）が同じ形の既存例になる。

`ownerIndex` 側は変更しない。primary 1 つで正しい消費者（カードのチップ、
Group by: team のフレーム）はそのまま。

co-owned なノードが端点になったエッジは、**関与する全チームの組で**依存を生む。
`oldPay` と `newPay` の両方が `checkout` との依存として現れ、
そのうえで両者が同じノードを共有している事実は下記 nested と同様のマークで区別する。

### 決定 2: 所有は直近の owned 祖先まで継承する

`owns` を持たないノードは、祖先を遡って最初に見つかった owner のチームに解決する。
どの祖先も owned でなければ未解決。

これは spec に明記する必要がある新しい意味論である。現状 `owns` の継承は
どこにも書かれていない（アノテーション継承 ADR-517 とは別の話）。

### 決定 3: 出荷する signal は cross-team / nested / 未解決を先、structural overlap を後

cross-team（sync/async 区別つき）、nested マーク、未解決端点の可視化までを
スライス A、structural overlap をスライス C に置く。理由は下記スライス節。

**未解決端点は必ず可視化する。** `owns` の記述密度がそのまま導出の完全性を決め、
spike の `examples/en/multi-file-system` では 8 エッジ中 7 つが片端未解決だった
（`client` に `owns` を書いていないため）。黙って疎なグラフを描くのは、
モデルの大半を落としたことを「網羅した」と誤読させる。TPL-2075 / TPL-2170 の趣旨でもある。

### 決定 4: 抽出は core、projection は md / csv / svg

`packages/core/src/view/team-dependency-extract.ts` に
`extractTeamDependencies(file)` を置く（**実装時に signature を変更した**: 引数は
コンパイル済みの `systems` ではなくマージ済み `KrsFile`。compile 結果の `systems` は
合成 `__unassigned__` を被せた描画用の形で、`owns` / `collectDeclaredNodePaths` が使う
path key と 1 セグメントずれるため）。
出力は `crud-matrix-format.ts` に倣った純関数で md / csv に、
グラフ SVG は renderer 側に。`derivation-contracts.test.ts` の
`DERIVATION_CONTRACTS` に行を追加する（新規 derivation の登録義務）。

### 決定 5: 眺める面はグラフ、grep する面は行列

同じ抽出結果から 2 つに projection する。SVG はチームをノードとした有向グラフ
（sync 実線 / async 破線）、md / csv は team × team の行列。ADR-1062 が
「grep する動線と眺める動線の両方が現実に必要」として同じ判断をしている。

### 決定 6: sync / async は畳まない

async は意図的な疎結合であり、調整の必要度が sync と異なる。
循環検出が async を除外するのと同じ理由（`docs/concepts.md`）。
同じチーム対が sync と async の両方を持つ場合は 2 本になる。

### 決定 7: 語彙は "team dependency"（暫定）

`communication` は `docs/spec/glossary.md` ですでにノード間エッジに束縛されている
（"synchronous, `-->` for asynchronous communication / dependency"）。
これを組織面の導出関係に再利用すると、ADR-1858 が `cluster` で避けたのと同型の
語彙衝突になる。`coupling` も同 glossary で "intentional loose coupling"（async）に
束縛済み。

`dependency` は既に `communication` と対になって使われている語で、
それを組織面に射影したものとして **team dependency** と呼ぶ。
「誰と誰が話す必要があるか」は説明文であって用語にはしない。
これは時間軸の非目標に抵触しない枠づけにもなる（恒常的な依存関係であって
やりとりの順序ではない）。

**この決定は最も自信度が低い。** レビューで覆ってよい。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 抽出 + 1:N 所有 + CLI（md/csv） | — | CLI 単体で Conway 分析の grep 動線が成立する。app に触らないので既存タブの挙動は不変 |
| **B** org タブ第 3 モード（グラフ SVG） | A | A の抽出結果を描くだけ。A の CLI 出力は B の有無に依存しない |
| **C** structural overlap | A | A が出す cross-team 依存とは別種の事実で、A の出力を変更しない。追加の行として現れる |

> 各スライスで何ができるようになるか / その時点でできないことは
> 親 Issue [#2597](https://github.com/kompiro/karasu/issues/2597) の `## Slice status` を参照。

### 実装の指針

1. `packages/core/src/parser/reference-validation.ts` に 1:N の
   `buildTeamOwnership(file): Map<string, string[]>` を追加（`buildOwnerIndex` の
   隣。既存 1:1 は変更しない）。co-owned ノードで全チームを保持することを
   単体テストで固定する。
2. `packages/core/src/view/team-dependency-extract.ts` に
   `extractTeamDependencies` を新設。所有継承（決定 2）、nested 判定、
   sync/async 分離、未解決端点の収集（`user` 端点は除外）を含む。
3. `view/derivation-contracts.test.ts` の `DERIVATION_CONTRACTS` に行を追加。
   `preserves` に edge の `kind`、`transforms` に集約結果を宣言する。
4. `packages/core/src/view/team-dependency-format.ts` に md / csv フォーマッタ。
5. CLI サブコマンド追加（`packages/cli/src/`）。受け入れテストは
   `packages/cli` の vitest に書く（`packages/e2e` には置かない）。
6. スライス B: renderer にグラフ描画、org タブのモードトグル追加。
   TPL-1032 に従い、派生 view の memoization key に source state の変化次元を
   すべて含める。
7. spec 更新: `docs/spec/syntax.md` の team node 節に所有継承（決定 2）を明記。
   `docs/spec/diagnostics.md` に未解決端点の診断を追加する場合はあわせて。
8. **proactive TPL を同 PR で起こす。** `docs/spec/` に新規セクションを足すため
   `.claude/rules/spec-audit.md` の要求に該当する。観点は「派生ビューは 1:1 index を
   消費せず、宣言された多重所属を保持する」（TPL-2161 の本件への具体化）か、
   所有継承の spec 規定が破られたときに検出する観点。
9. AT: `docs/acceptance/2597-team-dependencies.md`。TC は:
   - `owns` された 2 サービス間のエッジが 1 本の依存として現れる
   - co-owned なノードで、出ていく側のチームが依存から消えない
   - `owns` を持たない domain が親 service のチームに解決する
   - 同一チーム内で閉じたエッジは依存を生まない
   - 親子チーム間の依存が cross-team と区別される
   - `user` 端点が未解決として数えられない
   - multi-file（`organization` が S4 union でマージされる）で成立する
   - sync と async が畳まれない
10. ADR 昇格: 実装完了後 `docs/adr/2597-team-dependencies.md` として昇格し、
    本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。`.krs` の構文も既存ビューの描画も変えない。
  `ownerIndex` の 1:1 性を維持するため、カードのチップと Group by: team は不変。
- ドキュメント更新: `docs/spec/syntax.md`（所有継承）、`docs/concepts.md`
  （三面の交点の節に導出への言及）、`docs/spec/glossary.md`（team dependency の項）
- テスト・examples への影響: `examples/en/org` は既存のまま導出が成立することを
  spike で確認済み。co-ownership を含む example が無いため、AT 用の fixture を
  追加するか既存 example を拡張するかは実装時に判断する。

## 未解決の問い / 決めないこと

- **個人（`member`）粒度**: #2597 で明示的に切り出した。`member` に `owns` を
  足すか、連絡先解決に留めるか、`role` のような別語彙を入れるかは別途検討。
  なお `member` は既に `slack` / `github` を持つため、導出したチーム依存を
  連絡先まで解決することは新構文なしに可能である。
- **語彙**（決定 7）: 自信度が最も低い。レビューで覆ってよい。
- **未解決端点を診断として出すか、ビュー内の表示に留めるか**: 診断にすると
  `owns` を書いていない既存モデルすべてにノイズが出る。ビュー内表示を既定とし、
  診断化は別途判断する。
- **チームあたりの依存本数（認知負荷の代理指標）を出すか**: spike では
  カウントを出したが、閾値を持たせると「判断する」側に寄る。karasu は
  循環を観測して判断しない立場（`docs/concepts.md`）なので、
  数を見せるところまでに留めるのが整合的だが、確定しない。
