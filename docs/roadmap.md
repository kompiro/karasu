# karasu ロードマップ

- **ステータス**: living（決定は ADR、実行・進捗は GitHub Issues で管理し、本書は**全体方針の現在地と次の一手のみ**を保持する。完了・決着した内容は該当の close を扱う PR で削除し、経緯は ADR / closed Issue / git history が担う — [ADR-2218](adr/2218-roadmap-pruning-policy.md)）
- **現在のフォーカス**: `.krs` / `.krs.style` **言語 v1.0 発効済み**（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)、公開ローンチで確定）。現在の地平は [§post-v1.0 horizon（ロードマップ）](#post-v10-horizonロードマップ)、構文の次 major の枠は [§Syntax 2.0 プログラム](#syntax-20-プログラム)（登録 = [#2162](https://github.com/kompiro/karasu/issues/2162)）。

## Syntax v1.0（凍結済み）

`.krs` / `.krs.style` の言語 v1.0 は freeze 済み・発効済み。決定・凍結スコープ・
前提条件チェックリストは [ADR-1314](adr/1314-krs-spec-v1-freeze.md)、起点の棚卸しは
[#1567](https://github.com/kompiro/karasu/issues/1567) /
[#1717](https://github.com/kompiro/karasu/issues/1717)。本節に残るのは、以降の判断が
参照し続ける living な語彙定義（tier criteria と版語彙）のみ。

### syntax v1.0 の定義（criteria）

「freeze する」とは、その notation feature の**後方互換を約束する**ことである。
何を freeze し、何を freeze しないかを ad-hoc に決めないために、feature を次の
3 tier に分類する基準を置く。

| tier | 意味（互換保証） | 入る条件（すべて満たす） |
| --- | --- | --- |
| **v1.0-stable** | 後方互換を約束する。破壊的変更は major でしか入れない | (1) [structure-vs-implementation 境界](concepts.md#structure-not-implementation-client) の構造側にある（実装詳細を持ち込まない）／(2) spec に明文化済みで、規則 ↔ 診断が対応づいている（[ADR-1567](adr/1567-rule-diagnostic-separation-and-catalog.md)）／(3) 既存の `.krs` を壊さずに freeze できる（実装と spec が一致している）／(4) 削るより残すほうが利用者の表現コストが低い |
| **experimental（post-v1.0 watch）** | in-core で使えるが互換は**明示的に約束しない**。実利用の pain を観察してから stable / 変更 / deprecate を決める | (1)〜(4) のいずれかが未充足だが、構文を変えずに当面運用できる。境界が灰色（構造か実装か判断保留）／実利用が不足し earn-its-keep が未確認、のいずれか |
| **deprecated** | 段階的に外す。`@deprecated(until: …)` の graceful-degradation で移行猶予を与える（[ADR-1568](adr/1568-migration-intent-fields.md)） | 構造側にない、または redundant と確定し、後継が用意できている |

補足:

- **warn-don't-error が stable 判定の前提**: 未完成・in-flight なモデルでも render
  できることが karasu の差別化要因であり、診断 register は fact vs style の二分
  （[TPL-1386](test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)）に従う。
- **open annotation set は v1.x では stable 側**（未知の annotation は display-only で
  通るため新語彙の追加が後方互換を壊さない — [ADR-1568](adr/1568-migration-intent-fields.md)）。
  これは v1.x の凍結セマンティクスであり、v2.0 では tag / annotation はツール語彙に
  閉じる（[§Syntax 2.0 プログラム](#syntax-20-プログラム)、移行診断 = [#2159](https://github.com/kompiro/karasu/issues/2159)）。

### version vocabulary（版語彙の定義 — 正典）

本節が版語彙の**単一の正典**（決定 = [ADR-2124](adr/2124-version-vocabulary.md)。
[TPL-2005](test-perspectives/TPL-2005-keystone-terms-single-home.md) の
単一正典原則をこの語彙に適用）。`docs/process.md`（リリース運用）・`docs/glossary.md` は
本節を参照し、定義を再掲しない。

#### 互換性の軸

版番号が指す対象は**独立した互換性の軸**であり、相互に追従しない（ADR-2124）:

| 軸 | 対象 | 現在の版 | 約束 | 定義元 |
| --- | --- | --- | --- | --- |
| **言語**（`.krs` / `.krs.style`） | 構文・診断 register | 言語 v1.0（frozen） | 後方互換。追加は言語 v1.x、破壊は言語 v2.0 でのみ | [ADR-1314](adr/1314-krs-spec-v1-freeze.md) |
| **CLI**（`karasu`） | コマンド UX・配布物 | 0.x（npm） | npm semver（0.x = 安定約束なし。floor 0.6.0 — #1774） | `docs/process.md` リリース運用 |
| **TS API**（`@karasu-tools/core`） | ライブラリ API | 0.x（npm） | **明示的に約束なし**（minor で変わりうる） | [ADR-1314](adr/1314-krs-spec-v1-freeze.md) 非スコープ節 |
| **VS Code 拡張**（`karasu-vscode`） | Marketplace 配布 | 0.x | 別ケイデンス（changesets bump、公開は手動） | [ADR-1758](adr/1758-vscode-changeset-versioning.md) |

- **言語版の公開機構**: core の `KRS_LANGUAGE_VERSION` 定数 + `karasu --version` の 2 行表示
  （パッケージ版 + 言語版）+ spec docs 冒頭の明記 + drift ガード —
  実装 [#2181](https://github.com/kompiro/karasu/issues/2181)。
- **言語版が動くリリース**は changeset / CHANGELOG に**言語版遷移を明記**する。パッケージの
  bump レベルは semver 規約で独立に決める（[§promotion gate](#promotion-gatenotation-評価の規律)
  の発火 touchpoint は `docs/process.md` リリース運用）。

#### 正準語彙

| 概念 | 正準 | 非推奨シノニム / 区別すべき別概念 |
| --- | --- | --- |
| 互換を約束する notation tier | **stable**（強調時 `v1.0-stable`） | 「v1.0 freeze」は tier 名ではなく**イベント**（[ADR-1314](adr/1314-krs-spec-v1-freeze.md) の決定行為） |
| 互換を約束しない in-core tier | **experimental** | 「post-v1.0 watch」「notation watch」は tier 名ではなく**観察活動**（[§watch 登録](#watch-対象の-experimental-notation登録)） |
| 段階的廃止 tier | **deprecated** | — |
| ユーザーのモデルの標識 | **`@experimental` / `@deprecated` annotation**（常に `@` + backtick 表記） | tier と同語だが**主語が逆**（ユーザーのシステムのライフサイクル）。裸の "experimental" を annotation の意味で使わない |
| 言語版の表記 | **`.krs language v1.0`**（ユーザー向け出力・英語 prose）/ **「言語 v1.0」**（日本語 prose） | 「.krs v1.0」「krs-lang 1.0」「spec v1.0」等は使わない。パッケージ版と並記するときは軸を明示（`karasu 0.6.0` + `.krs language v1.0`） |

表記規約: karasu 自身の notation を語るときは tier を明示するか notation を主語にする
（「boundary 構文は experimental」）。ユーザーモデルの標識は常に `@` + backtick
（`@experimental`）。この規約だけで二義性は機械的に判別できる。

---

## post-v1.0 horizon（ロードマップ）

- **ステータス**: living。v1.0（[ADR-1314](adr/1314-krs-spec-v1-freeze.md)）で構文を freeze した後の **rolling な次の地平**を束ねる。破壊的変更を伴う枠のみ [§Syntax 2.0 プログラム](#syntax-20-プログラム) に分離して持ち、本セクション自体は後方互換の rolling horizon であり版で括らない。
- **管理モデル**: GitHub Milestone は 1 Issue 1 個のフラット 1 軸なので、2 軸を分けて持つ — **時間軸（いつ着手）= 日付 Milestone**（`2026-09` / `2026-12` / `Backlog`）、**テーマ軸（何を）= parent Epic Issue + `epic:` ラベル**。planning の起点 [#1814](https://github.com/kompiro/karasu/issues/1814)（closed）の milestone 案 M1〜M5 は本セクションの柱・候補へ再編済み。
- **後方互換**: notation watch は**後方互換を保ったまま**実利用で評価する営みで、昇格は [§promotion gate](#promotion-gatenotation-評価の規律) を通す。破壊的変更を伴うもの（boundary の core 昇格・tag / annotation の閉鎖・任意名 style セレクタの無効化）の受け皿は [§Syntax 2.0 プログラム](#syntax-20-プログラム)。
- **動かさない非ゴール**: 時間軸 / sequence（[#23](https://github.com/kompiro/karasu/issues/23) / [#28](https://github.com/kompiro/karasu/issues/28)）・code generation・ER modeling・runtime metrics・infra topology・canvas editing は `docs/concepts.md` で確定済み。post-v1.0 horizon はこの線を動かさない。実利用で圧力が出たものは下記 [§非ゴール圧力 log](#非ゴール圧力-log) に記録のみする。

### keystone: primary path と主 surface（決定済み 2026-06-28）

post-v1.0 の優先度はこの決定に従属する。壁打ちの全容は PRD
[`docs/prd/keystone-primary-path.md`](prd/keystone-primary-path.md)（[#1825](https://github.com/kompiro/karasu/pull/1825)）、
要件は Epic [#1826](https://github.com/kompiro/karasu/issues/1826) に展開した（ADR ではなく PRD → Issue）。
用語（read / record split・funnel / retained・record-as-byproduct・permalink family）の
正典は [`docs/glossary.md`](glossary.md)。

要点: **目的関数 = adoption**。**read / record split** — nest = 知らないシステムを
*読む* funnel / karasu 本体 = 自分のシステムを*残す* retained 製品（living
architecture record）。return trigger = 設計判断のとき（**record-as-byproduct** で
doc-rot を構造的に回避）。「残す」射程 = 構造のみ、link 方向は **ADR→karasu
permalink**。**surface = pipeline**（in-repo で書く → nest で描画 / permalink →
ADR が指す）— nest Phase 2（[#1786](https://github.com/kompiro/karasu/discussions/1786)）が
funnel→retained の背骨。notation / cookbook はこの retained record を支える従属
（promotion gate 据え置きと整合）で、surface portfolio の独立の縮退判断は不要
（pipeline 維持）。

### 実行中の柱（テーマ = Epic Issue + `epic:` ラベル）

着手タイミングは日付 Milestone で別管理する。Epic 親 Issue 自体は複数 Milestone に
またがるため日付を持たせない。

| 柱 | Epic parent / label | 中身 | 着手 intent |
| --- | --- | --- | --- |
| **karasu-nest pivot** | [#1990](https://github.com/kompiro/karasu/issues/1990) ・`epic: karasu-nest` | GitHub App でリポジトリを読み、サーバ側 AI reverse で `.krs` を返す/描くホスト型サービス（[ADR-1990](adr/1990-karasu-nest-pivot-server-reverse.md)）。gate spike は 2026-07-30 に通過 | 第一手は Workers scaffold [#2227](https://github.com/kompiro/karasu/issues/2227)。以降 App auth → pipeline の依存順 |
| **facets**（語彙の閉鎖） | [#2065](https://github.com/kompiro/karasu/issues/2065) ・`epic: facets` | ユーザー拡張点を `facet` に一本化し、tag / annotation はツール語彙へ閉じる（[§Syntax 2.0](#syntax-20-プログラム) の柱） | Part A 着地済み、Part B をスライス実行中 |
| **boundary membership** | [#2161](https://github.com/kompiro/karasu/issues/2161) ・`epic: boundary` | 所属 1:N 一般化 + 多重包含描画。boundary の v2.0 core 昇格の宿題（[§Syntax 2.0](#syntax-20-プログラム) の柱） | slice A 着地済み、次は slice B [#2179](https://github.com/kompiro/karasu/issues/2179) |

`epic: comprehension` と `epic: permalink-layer` は宣言していた子がすべて着地したため
柱から降ろした（Epic close は本節を prune した PR — [ADR-2218](adr/2218-roadmap-pruning-policy.md)）。
それぞれの残余は下の [§comprehension の残余](#comprehension-の残余) と
[§sequencing](#sequencing) に持つ。

#### comprehension の残余

壁が**ある階層での横の密度**（service/infra ノード数 + 越境 edge の混雑）で、縦（深さ）は
drill-down（[#21](https://github.com/kompiro/karasu/issues/21)、replace-context）が既にカバー
という構図は変わらない。レイヤートグル・意味的クラスタ・focus/dim・in-place 部分展開は
出荷済みで Epic は閉じたので、**まだ構文/実装に落ちていない手だけ**を本表で追跡する
（子 Issue は起こさず台帳で持つ運用 — [§notation gap](#watch-対象の-notation-gap構文未満の欠落) と同じ）。
意味的クラスタの続き（所属 1:N・多重包含）は `epic: boundary`（[#2161](https://github.com/kompiro/karasu/issues/2161)）へ移した。

| 残余の手 | コスト | promotion trigger |
| --- | --- | --- |
| provenance / `[external]` スタブ（越境ノードを畳んだ参照として描く） | 中 | 越境ノード数そのものが読解を阻む事例が nest corpus で観測されたら Issue 化 |
| progressive edges（越境 edge を先に、内部 edge は drill-in で） | 中 | 混雑の主因が node 数でなく edge 側だと corpus で確認できたら Issue 化 |

### promotion gate（notation 評価の規律）

experimental notation を stable へ昇格させる判断の規律（決定は [ADR-1820](adr/1820-notation-promotion-gate.md)、本節はその生きた適用状態）:

- **既定 = experimental 据え置き**。追加しない/据え置くコストは低く、削除コストは高い。昇格に渋く、open/既存構文での表現に寛容に、灰色は experimental に留める。問いは「**stable へ昇格するに足る実利用証拠があるか**」であって「廃止すべきか」ではない。
- **トリガー**: (i) その notation に触れるリリースの直前（載せる版が言語 v1.x minor（追加互換）か v2.0 major（破壊的変更を伴う昇格）かの判断も含む）、(ii) 実利用データが溜まった時、(iii) 混乱/bug Issue の再発時。
- **証拠源 = karasu-nest の共有 corpus**。実 OSS を書いた `.krs` が watch tier の必要とする「実利用 pain」の観測装置になる。
- 配置は **三点配線** — **[ADR-1820](adr/1820-notation-promotion-gate.md)（決定）+ 本書（生きた適用状態）+ [`docs/process.md` リリース運用](process.md#リリース運用)（発火 touchpoint）**。gate を実際に invoke するのは process.md 側で、これにより決定が絵に描いた餅にならないようにする。

#### watch 対象の experimental notation（登録）

gate の生きた適用状態。ここに載る構文は **後方互換を約束しない** experimental で、
昇格判断は上記トリガーで行う（証拠源 = karasu-nest corpus）。

| notation | 追加 | 現状 | promotion trigger（判断材料） |
| --- | --- | --- | --- |
| **`boundary`**（system view の意味的クラスタ宣言 / `contains` / スコープ宣言） | [#1974](https://github.com/kompiro/karasu/issues/1974)（[ADR-1974](adr/1974-boundary-declaration-syntax.md)）+ [#2036](https://github.com/kompiro/karasu/issues/2036)（[ADR-2036](adr/2036-scoped-boundary-declaration.md)・[syntax](spec/syntax.md#grouping-the-system-view-boundary--experimental)） | experimental。**昇格先は確定 — v2.0 core**（tags-and-facets 決定事項 4、[§Syntax 2.0 プログラム](#syntax-20-プログラム)）。宿題 = 所属 1:N 一般化 + 多重包含 banded 描画（[#2161](https://github.com/kompiro/karasu/issues/2161)） | corpus 観測は「昇格するか」でなく「v2.0 core の形の妥当性」の検証として継続（初回エビデンス = [#2079](https://github.com/kompiro/karasu/issues/2079)） |

#### watch 対象の notation gap（構文未満の欠落）

まだ構文にしていない欠落の watch 台帳。子 Issue は起こさず本表で追跡し、promotion
trigger を満たしたらその時点で Issue を起こして着手する。

| gap | disposition / promotion trigger | 出典 |
| --- | --- | --- |
| `translate` の domain 推論（adapter 課題） | scaffold → readable の手作業が実利用の痛みとして再発したら評価。core 構文に gap なし | [ADR-1314](adr/1314-krs-spec-v1-freeze.md) / [#1567](https://github.com/kompiro/karasu/issues/1567) finding C |
| edge の first-class protocol / cardinality | 当面 tag + `description`/`link` の散文に逃がす（first-class 化は実装詳細を edge に持ち込む圧力 — 境界が灰色）。需要が corpus で再発したら評価 | [ADR-1314](adr/1314-krs-spec-v1-freeze.md) / [#1567](https://github.com/kompiro/karasu/issues/1567) finding D |
| stateful compute（Durable Object = compute かつ store で clean な infra kind が無い） | 据え置き。adapter は `service [external]` + RPC edge へ degrade（`[external]` は所有境界を過大表現）。honest な modeling 需要が corpus で溜まれば再評価 | [ADR-1935](adr/1935-wrangler-translate-adapter.md) |

`database [cache]` role tag は **trigger 発火済み**（cache パターンが複数 source で再発）で
builtin 昇格レビュー [#2172](https://github.com/kompiro/karasu/issues/2172)（`epic: facets`）へ
移したため、本表から外した。本表のルールどおり **Issue が生えた gap は台帳に残さない** —
残すと台帳と tracker の二重管理になり、どちらが現状か分からなくなる。

stable 側の earn-its-keep 観察: **CRUD verb-decoration 1:N** は v1.0 で維持
（判断 = [ADR-1314](adr/1314-krs-spec-v1-freeze.md)、経緯 =
[ADR-2218 付録](adr/2218-roadmap-pruning-policy.md)）。誤用・混乱 Issue が再発したら
[ADR-1568](adr/1568-migration-intent-fields.md) の `@deprecated` 枠組みで deprecation を
gate で評価する。

### 独立 candidate（未 Issue 化 — issue が生えたら Milestone 化）

| candidate | 状態 | 依存 |
| --- | --- | --- |
| **interop**（mermaid / C4・Structurizr への入出力） | **demand-gated で見送り**（壁打ち [#1832](https://github.com/kompiro/karasu/issues/1832) を 2026-07-15 に not_planned で close）。draw.io export は出荷済み（[ADR-649](adr/649-drawio-export.md)）、structured-source import は `karasu translate` が担う。**flat-diagram import は ill-posed** と結論済み（typed でない mermaid `flowchart` から karasu の意味論は復元できない）。残る tractable な面は export（mermaid = 低摩擦 / C4・Structurizr DSL = 高忠実）と typed-source import のみ | 実ユーザー需要が観測されたら新規 Issue を起こす |
| **AI authoring 深度 / Chat 去就** | **評価待ち**。Chat が出荷面か実験かは [#638](https://github.com/kompiro/karasu/issues/638) の user testing データで決める | [#638](https://github.com/kompiro/karasu/issues/638) |

### 既存に集約（新規スレッド不要）

- **feedback loop 設計**（OSS 後に何を作るかをどう学ぶか）は新規に立てない。nest corpus を証拠源にする件は [§promotion gate](#promotion-gatenotation-評価の規律)、定量検証は [#638](https://github.com/kompiro/karasu/issues/638) に既にある。

### 非ゴール圧力 log

非ゴールは動かさないが、実利用で圧力が出たものをここに**記録のみ**する（対応はしない）。Discussions 有効化時には「ゴールにしていないこと」の seed としても使える。

| 非ゴール | 圧力の観測 | 備考 |
| --- | --- | --- |
| （現時点で記録なし） | — | — |

### sequencing

1. **permalink layer**（retained の背骨）は着地済み。deep permalink・repo-backed / ref-pinned resolver・ADR 側の `@<sha>` 検査まで揃い、Epic [#1826](https://github.com/kompiro/karasu/issues/1826) は close した。残るのは URL 見た目だけの optional slice [#1961](https://github.com/kompiro/karasu/issues/1961)（`/r/` prefix を落とす）で、これは律速ではない。
2. **karasu-nest pivot**（[#1990](https://github.com/kompiro/karasu/issues/1990)）が現在の主線。gate 通過済みで、scaffold → App auth → pipeline の順に依存し、data-trust（[#1996](https://github.com/kompiro/karasu/issues/1996)）は他人の private code に触る前の**前提条件**。
3. **syntax 2.0 の二本柱**（facets [#2065](https://github.com/kompiro/karasu/issues/2065) / boundary [#2161](https://github.com/kompiro/karasu/issues/2161)）は並行で進む v1.x 作業（閉鎖・core 昇格そのものは [§Syntax 2.0 プログラム](#syntax-20-プログラム) で時期未定）。
4. **AI authoring** は [#638](https://github.com/kompiro/karasu/issues/638) のデータ待ち、**interop** は評価可能。
5. **非ゴール圧力 log** は随時追記（安価）。

---

## Syntax 2.0 プログラム

- **ステータス**: 方針確定・時期未定（登録 = [#2162](https://github.com/kompiro/karasu/issues/2162)）。**実施時期は決めない**。版運用は [ADR-2124](adr/2124-version-vocabulary.md) で確定済み — 「v2.0」= 言語 v2.0（言語軸の major）であり、パッケージ bump は独立（[§版語彙との同時確定](#版語彙との同時確定2124決定済み)）。
- **決定源**: tags-and-facets 設計（[docs/design/tags-and-facets.md](design/tags-and-facets.md)、[#2065](https://github.com/kompiro/karasu/issues/2065) / [#2155](https://github.com/kompiro/karasu/pull/2155)、2026-07-28 レビューで決定事項 1–5 確定）。実装完了後に ADR へ昇格し（`refines: [ADR-832]`）、閉鎖実施時には [ADR-1314](adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze）との関係を新 ADR で明示する。
- **位置づけ**: [§post-v1.0 horizon](#post-v10-horizonロードマップ) が後方互換の rolling horizon であるのに対し、本セクションは**破壊的変更を伴う次 major の枠**のみを持つ。v1.x で進む移行措置（deprecation 診断・facet の experimental 導入）は後方互換であり通常の v1.x minor で出る。

### 柱（pillars）

`boundary` と `facet` を構文 2.0 の語彙体系の主軸に据える（決定事項 4）:

| 柱 | 現在地 | v2.0 での到達点 | 経路 |
| --- | --- | --- | --- |
| **`boundary`**（view 内 peer グルーピング） | experimental（[§watch 登録](#watch-対象の-experimental-notation登録)） | **core 昇格** | 昇格前の宿題 = 所属 1:N 一般化 + 多重包含 banded 描画（[#2161](https://github.com/kompiro/karasu/issues/2161)、[ADR-1974](adr/1974-boundary-declaration-syntax.md) refine） |
| **`facet`**（外在的集合所属 — **唯一のユーザー拡張点**） | 未実装 | **core**（v1.x に experimental で導入 → 実利用観測 → 昇格） | 導入 = [#2160](https://github.com/kompiro/karasu/issues/2160)（宣言 + `facets` プロパティ + overlay + facet セレクタ）。着地時に [§watch 登録](#watch-対象の-experimental-notation登録) へ追加する |

### 語彙の閉鎖（tag / annotation）

- **v2.0 で tag / annotation はツール語彙のみを受理する**（決定事項 5）。register の確定: **tag = アーキテクチャの意味（アーキタイプ）** / **annotation = lifecycle**。ユーザー拡張点は facet に一本化し、新しいアーキタイプ / lifecycle 状態はツールの builtin 語彙への追加要望として扱う（[§notation gap](#watch-対象の-notation-gap構文未満の欠落) の `[cache]` watch がその機構の実例）。
- **enforcement は warning に留める**（parse は通り、効果を持たず、警告される — [TPL-1503](test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) の状態 (2)。既存ファイルを parse error で壊さない）。
- **v1.x の移行診断**: builtin 集合外の tag / annotation に `tag-not-builtin` / `annotation-not-builtin`（warning、additive — freeze 非抵触）を出す = [#2159](https://github.com/kompiro/karasu/issues/2159)。
- **style セレクタの移行**: 任意名の tag / annotation セレクタ（今日 `.krs.style` で generic に照合される styling フック）は **v1.x で deprecation 告知 → v2.0 で無効化**し、フックは **facet セレクタ**（[#2160](https://github.com/kompiro/karasu/issues/2160)）が引き継ぐ。移行経路 = facet 宣言 + `facets` 付与 + セレクタ書き換え。

### 閉鎖原則

> **語彙の宇宙をツールが所有するもの（tag = アーキタイプ / annotation = lifecycle）は閉じ、
> 世界が所有するもの（client `capability` = デバイス / ブラウザ能力 — spec / [ADR-837](adr/837-client-capability-modeling.md)）は open のまま。**

`capability` は例外ではなく原則の帰結（tags-and-facets 設計 (B9)）。

### 閉鎖の前提条件（v2.0 実施前に満たす）

1. **corpus 実測** — in-the-wild の user-defined annotation の実態を測る（(B7)。custom lifecycle 状態の受け皿は builtin 追加要望のみ — lifecycle 系 facet は不許可。実用されている custom 状態は閉鎖と同時に builtin 候補として評価）。
2. **concepts.md の同時改訂** — 「タグシステム自体は open のまま」の原則記述は、閉鎖 ADR と**同時に supersede** する（keystone 文書を黙って単独更新しない）。
3. **リスク台帳の緩和の履行** — tags-and-facets 設計「閉鎖の弊害と緩和」の表（styling 退行の facet セレクタでの引き継ぎ、版スキュー warning の許容、生成パイプラインの builtin + facet 化など）を v2.0 作業の checklist として使う。

### 版語彙との同時確定（#2124・決定済み）

版語彙は [#2124](https://github.com/kompiro/karasu/issues/2124) → [ADR-2124](adr/2124-version-vocabulary.md) で確定した（定義 = [§version vocabulary](#version-vocabulary版語彙の定義--正典)）。本プログラムの「v2.0」は**言語 v2.0**（言語軸の major — ADR-1314 のセマンティクス）を指し、パッケージの bump レベルは semver 規約で独立に決まる。閉鎖を実施するリリースは changeset / CHANGELOG に言語版遷移（言語 v1.x → v2.0）を明記する。実施時期は引き続き未定（本プログラムの前提条件が律速）。

### 追跡（Issues）

二本柱はそれぞれ Epic として追跡する（テーマ軸のラベル運用は
[§実行中の柱](#実行中の柱テーマ--epic-issue--epic-ラベル) と同じ）:
**facet 側 = [#2065](https://github.com/kompiro/karasu/issues/2065) ・`epic: facets`** /
**boundary 側 = [#2161](https://github.com/kompiro/karasu/issues/2161) ・`epic: boundary`**。
下表はその内訳と、柱に属さない v2.0 項目。

| Issue | 内容 | 時期 |
| --- | --- | --- |
| [#2159](https://github.com/kompiro/karasu/issues/2159) | v1.x deprecation 診断（`tag-not-builtin` / `annotation-not-builtin`）+ spec の deprecated 化 + 四分法ガイド（Part A） | v1.x |
| [#2160](https://github.com/kompiro/karasu/issues/2160) | `facet` construct — 宣言 + `facets` プロパティ + overlay + facet セレクタ（Part B、experimental） | v1.x |
| [#2172](https://github.com/kompiro/karasu/issues/2172) / [#2225](https://github.com/kompiro/karasu/issues/2225) | builtin 語彙の運用 — 昇格要望の受理（`[cache]` / `@canary`）と `appliesTo` の enforcement。閉鎖後にユーザー拡張の受け皿となる機構 | v1.x |
| [#2161](https://github.com/kompiro/karasu/issues/2161) | boundary 所属 1:N 一般化 + 多重包含 banded 描画（ADR-1974 refine — boundary core 昇格の宿題） | v1.x〜v2.0 |
| [#2165](https://github.com/kompiro/karasu/issues/2165) | 論理ノードの containment 規則 — v1.x は `node-not-in-context` warning（着地済み）、**error 化は v2.0** | v1.x 済 → 言語 v2.0 |
| （未起票） | 閉鎖の実施（tag / annotation の warning enforcement・任意名セレクタ無効化・concepts 改訂 + ADR-1314 関係の新 ADR） | v2.0 |

---

## Related TPLs

- [TPL-1386](test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md) — 診断 register の fact vs style 二分。freeze した register 割り当ての拠り所。
- [TPL-1296](test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) — spec doc と source-of-truth の同期。spec ↔ 実装の整合の拠り所。
- [TPL-1503](test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理語彙の 3 状態規律。[§Syntax 2.0 プログラム](#syntax-20-プログラム) の閉鎖 enforcement（warning = 状態 (2)）の拠り所。
