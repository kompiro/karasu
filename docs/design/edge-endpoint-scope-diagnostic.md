# 宣言スコープで描画できない edge endpoint を診断する

- **日付**: 2026-07-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2075](https://github.com/kompiro/karasu/issues/2075)
  - 関連 ADR: [ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（規則 ⊃ 複数の診断 / 診断カタログ）, [ADR-1386](../adr/1386-style-prescription-stance.md)（register は事実か欠陥か）, [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）, [ADR-1870](../adr/1870-domain-entity-modeling.md)（entity relation）
  - 関連 TPL: [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)（同じ状態を表す配置は同じ診断を出す）, [TPL-2170](../test-perspectives/TPL-2170-dangling-edge-preserves-node.md), [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md), [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md), [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md), [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md), 本 PR で起こす proactive [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)
  - コード: `packages/core/src/resolver/warnings.ts`, `packages/core/src/view/view-extract.ts`, `packages/core/src/parser/parser.ts`

## 背景・課題

`system` スコープに書いた `A -> B`（A, B は `service S` 配下の `domain`）は、
parser を通り、circular-dependency チェッカーにも見えるのに、**どの view にも
描画されず、診断も出ない**（#2075）。author からは「edge は存在する」信号だけが
返り、図には矢印が出ない。

同じ間違いを 1 段下（`service` ブロック内）でやると `edge-source-mismatch`
（error）で弾かれる。つまり**同じ規則違反が、置いた場所によって error / 完全な
沈黙に分かれている**。

着手時に probe（`extractView` / `extractEntityView` を全 view path で呼び、
描画された edge を列挙）で調べたところ、silent drop は system スコープ固有では
なく、**5 つの配置**で起きていた。

| 配置 | 描画 | 現在の診断 |
| --- | --- | --- |
| `system T { A -> B }`（A,B は service S 配下の domain） | ✗ | なし |
| `service S1 { S1 -> B }`（B は別 service の domain） | ✗ | なし |
| `domain A { -> v }`（v は別 domain の usecase） | ✗ | なし |
| `system T { S -> u }`（u は nested usecase） | ✗ | なし |
| `service S1 { S1 -> S2 }`（S2 は**別 system** の service、dotted 無し） | ✗ | なし |
| `entity Order { -> Customer }`（Customer は別 domain の entity、bare id） | ✗ | なし（drop は spec 記載済み・TPL-1936） |
| `domain A { -> B }`（B は同/別 service の domain） | ✓ | — |
| `entity Order { -> D2.Customer }`（qualified） | ✓ | — |

`karasu render` は exit 0 を返し、drawio / SVG のどのページにも当該 edge は無い。
生成モデル（reverse-architecture harness, ADR-20260714-02）は system スコープに
domain 依存 edge を自然に吐くため、この沈黙は生成モデルの fidelity を静かに下げる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| parser | `service` / `domain` / `entity` ブロックだけ `parentId` を渡し、`from !== parentId` を `edge-source-mismatch`（error）にする（`parser.ts:642`）。`system` ブロックは `parentId` 無し = 任意の source を許す |
| root system view | `system.edges.filter(e => childIds.has(e.from) && childIds.has(e.to))`。`childIds` は system の**直下の子** + top-level orphan（`view-extract.ts:972`） |
| drill-down view | `containerNode.edges` を同様に直下の子で filter（`view-extract.ts:1075`）。**上位スコープの edges は一切参照しない** |
| service view の追加収集 | 直下 domain の `domain.edges` のうち両端が同 service の domain のものを surface（`view-extract.ts:1086`） |
| cross-service domain edge | `deriveImplicitServiceEdges` が service 粒度に集約して root view に出す |
| entity view | bare id は intra-domain のみ、cross-domain は qualified `D.E` が必要（bare non-local は明示的に drop — `view-extract.ts:1371`） |
| orphan root view | 明示 edge を一切含めない（derived / implicit / delivers のみ — `view-extract.ts:898`） |
| 既存の近縁診断 | `unresolved-edge-endpoint`（endpoint がモデルのどこにも無い）, `cross-system-ref-*`（dotted ref）, `edge-source-mismatch`（origin scope） |
| 診断カタログ | `docs/spec/diagnostics.md` の「Declaration, edge placement & structure」規則ファミリ。完全性は `diagnostics-catalog.test.ts` が強制（TPL-1623） |

つまり **edge は「宣言されたコンテナの view」でしか描画されない**が、その事実を
検査するものが parser にも resolver にも無い。`unresolved-edge-endpoint` は
「endpoint が存在しない」ケースだけを見ており、「endpoint は存在するが、この
スコープでは描けない」ケースは網の外にある。

## 制約・前提

- **v1.0 freeze（ADR-1314）**: 構文の追加・変更はしない。診断の追加は additive で freeze に触れない。
- **warn-don't-error（§S6）**: endpoint の解決はファイル跨ぎの merge 後にしか判定できない。parser 段では別ファイル宣言と区別が付かないため、**parser の error ではなく resolver の warning** にする。
- **false positive を出さない**: 実際に描画される配置（domain→domain の cross-service、qualified entity relation）では絶対に鳴らしてはならない。
- **S3 reopen**: 同一 id の `system` ブロックは、同一ファイル内では AST 上 2 ノードのまま（merge は import 解決層のみ — `import-resolver.ts:249` は自ファイル分を無条件 push）。peer 集合は**ノード実体ではなく id で union** して求める必要がある（probe で 4 件の false positive を再現・確認済み）。
- **out of scope**: dotted ref（`Sys.Svc` / `Domain.Entity`）の解決検査。既存の `cross-system-ref-*` が担当し、entity の dotted 未解決は別途（未解決の問い参照）。

## 検討した選択肢

### 案1: system スコープのみを対象にする（Issue 記載どおり）

`system.edges` の endpoint が system 直下より深い node を指したときだけ warning。

**メリット**

- 実装・テストが最小。Issue の再現ケースはこれで閉じる。

**デメリット**

- probe で見つかった残り 4 配置は沈黙のまま。「置いた場所で診断が変わる」という
  #2075 の主訴（非一貫性）を別の形で残す。
- 後から一般化すると、同じ規則に対する診断コードが 2 つに割れる。

### 案2: 宣言スコープ一般の規則として判定する（採用）

「**authored edge の endpoint は、その edge が宣言されたスコープで描画可能な peer
でなければならない**」という 1 本の判定に畳む。

判定式 — コンテナ C（`system` / `service` / `domain` / `entity` …）に宣言された
edge の endpoint E について、以下のいずれにも当たらないとき warning:

1. E が dotted（`.` を含む）→ skip（`cross-system-ref-*` / entity qualified の領分）
2. E がモデル中に存在しない → skip（`unresolved-edge-endpoint` の領分）
3. E ∈ peers(C)
   - C が `system` → `childrenOf(C.id)`（同 id の全 system ブロックの子の union） ∪ top-level orphan
   - それ以外 → `{C.id}` ∪ `childrenOf(parent(C).id)`（= C の兄弟）
4. C が `domain` かつ E が `domain` → skip（cross-service domain 依存は
   `deriveImplicitServiceEdges` が service 粒度に集約して描画する）

**メリット**

- 5 配置すべてを 1 つの判定・1 つの診断コードで拾う。
- TPL-1936（bare cross-domain entity relation は drop される）に、初めて検出器が付く。
- 「受理された構造は描画されるか診断されるかのどちらか」という原則を実装で表現できる。

**デメリット**

- 除外条件（4）を持つぶん、判定が「単純な包含チェック」より複雑。
- 判定が view 抽出の実装と対応している必要があり、view 側を変えたときに drift しうる（→ proactive TPL で塞ぐ）。

### 案3: 診断ではなく、描画できるようにする

system スコープの domain→domain edge を、暗黙 service edge と同じ要領で
re-anchor して描画する。

**却下理由**

- spec の edge origin scope 規則（「edge はその source と co-located に置く」）が
  正準形として既にあり、同じ関係に 2 つの綴りを与えることになる。
- 言語仕様の追加であり v1.0 freeze（ADR-1314）に触れる。診断追加なら触れない。
- 5 配置のうち描画に落とせるのは一部（`-> usecase` などは描画先の view が無い）。

### 案4: warning ではなく error にする

**却下理由**

- endpoint の位置はファイル跨ぎ merge 後にしか分からず、単一ファイル文脈では
  誤って error にしうる。§S6 の warn-don't-error と register 方針（ADR-1386:
  欠陥は warning）に従う。

## 比較

| 観点 | 案1 (narrow) | 案2 (一般化) | 案3 (描画する) | 案4 (error) |
| --- | --- | --- | --- | --- |
| #2075 の再現ケース | ○ | ○ | ○ | ○ |
| 残り 4 配置 | ✗ | ○ | △ | ○ |
| v1.0 freeze | 触れない | 触れない | **触れる** | 触れない |
| 既存モデルへの影響 | なし | なし（impact scan 0 件） | 挙動変化 | 既存モデルが落ちうる |
| 実装量 | 小 | 中 | 大 | 中 |

## 現時点の方針

**案2 を採用する** — 「診断が配置によって error / 沈黙に分かれている」という
#2075 の主訴は、判定を 1 本に畳んで初めて解ける。直近で確立した
[TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)
（#2184 / PR #2194）が「同じモデリング状態を表す複数の配置は同じ診断を出す」と
述べており、案1（system スコープだけ拾う）はその観点に正面から反する。probe で silent drop が
system スコープ固有でないと分かった以上、narrow に閉じると同じ Issue を
別の配置で再度受けることになる。register は warning（実際に edge が落ちている
= 欠陥であり、流派判断ではない — ADR-1386 / TPL-1386）。

診断コードは `edge-endpoint-not-at-scope`。Issue の提案名 `edge-source-not-at-scope`
から変えているのは、source 側と target 側の両方を検査するため（`unresolved-edge-endpoint`
と同じく endpoint 単位でループする）。

メッセージは 1 コードのまま 2 variant を持たせる（render-warning 側で
`scopeKind` によって分岐）:

- 一般: `Edge "A -> B" is declared in <scopeKind> "<scopeId>", but "<A>" is a <endpointKind> under <ownerKind> "<ownerId>" — the edge is not at this scope and renders on no view. Author it inside the source block (`domain A { -> B }`).`
- entity relation: qualified 形（`<ownerId>.<endpointId>`）を促す文面

診断コードを entity 用に分けない理由: 規則は同一（宣言スコープで描画できない
endpoint）であり、ADR-1567 の「1 規則 ⊃ 複数診断」は*機構が異なる*ときの分割。
ここは機構も同一で、fix の綴りだけが違う。コードは安定 API なので、後から分割は
できても統合はできない — 1 本で始める。

### 実装の指針

1. `packages/core/src/types/warnings.ts` — `WarningKind` に `edge-endpoint-not-at-scope` を追加し、`WarningParamsByKind` に `{ from, to, endpointId, endpointKind, ownerId, ownerKind, scopeId, scopeKind }` を定義（doc comment に判定式と除外条件を書く）。
2. `packages/core/src/resolver/warnings.ts` — `detectEdgeEndpointsNotAtScope(file)` を追加し `analyze()` に配線。id keyed の `childrenOf` map（S3 reopen 対策）と node index を 1 パスで構築する。
3. `packages/i18n` — `en.ts` / `ja.ts` にメッセージ 2 variant、`render-warning.ts` に case 追加（`render-warning.test.ts` の網羅表にも 1 行）。
4. `packages/core/src/types/diagnostics-catalog.test.ts` を満たすため `docs/spec/diagnostics.md` / `diagnostics.ja.md` の「Declaration, edge placement & structure」に 1 行追加。
5. `docs/spec/syntax.md` / `syntax.ja.md` の § Edge declaration に **Endpoint scope** 小節を追加（判定式・正しい綴り・除外を散文で）。同節末尾に `> Related TPLs:` で proactive TPL を back-ref。
6. proactive TPL（本 PR で先に起こす）: `TPL-2075-parsed-construct-renders-or-warns.md` — 「parse を通った構造は、いずれかの view で描画されるか、診断されるかのどちらかであること」。
7. テスト:
   - `resolver/warnings.test.ts` — 5 つの silent drop 配置で発火、2 つの描画される配置（cross-service domain→domain / qualified entity relation）で**非発火**、S3 reopen（同 id system 2 ブロック）で非発火、未解決 id では `unresolved-edge-endpoint` のみ、severity 表に 1 行。
   - `examples.test.ts` 相当の impact: 既存 examples が新たに警告を出さないこと。
8. AT: `docs/acceptance/` に新規レコード。TC は:
   - `system T { A -> B }` を含む .krs を `karasu render` して warning が出る（自動）
   - 正準形 `domain A { -> B }` では warning が出ず、service drill-down に矢印が出る（自動 + 目視 1 件）
   - app の Warning パネルに当該 warning が locale 別に表示される（目視）
9. changeset: `@karasu-tools/core` + `karasu`（診断追加 = 利用者から見える変更）を minor。
10. ADR 昇格: 実装完了後 `docs/adr/2075-edge-endpoint-scope-diagnostic.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 新規 warning が 1 つ増える。error ではないので render は従来どおり成功する。
- **impact scan（実測）**: prototype detector を `examples/**/*.krs` 78 ファイル（31 ディレクトリ、ディレクトリ単位で結合して merge 相当にしたもの）と `docs/**/*.md` 704 ファイル中の全 ```krs フェンスに適用 → **hit 0 件**。既存サンプル・ドキュメントは新たに警告しない。
- **ドキュメント更新**: `docs/spec/syntax.md` / `.ja`, `docs/spec/diagnostics.md` / `.ja`。
- **LSP**: `unresolved-edge-endpoint` は import 結合のため LSP で抑制されている（`lsp/src/diagnostics.ts:90`）。本診断は「endpoint が単一ドキュメント内で見つかり、かつ深い位置にある」ときだけ鳴るため、別ファイル宣言では条件 2 で skip され誤検出しない → **抑制しない**。

## 未解決の問い / 決めないこと

- **top-level orphan（system 外）の service に書いた edge**: orphan root view は明示 edge を一切描画しないため判定 3 で発火する。`service-outside-system` warning と二重に鳴るが、落ちている事実は別物なので抑制しない。実装時に既存テストで二重表示の見え方を確認する。
- **entity relation の dotted 未解決**（`-> D9.Nope` で D9 が無い）は本 Design Doc では扱わない。`cross-system-ref-unresolved` は system edge の dotted しか見ておらず、entity 側は無診断のまま残る。別 Issue とする。
- **quick-fix（LSP code action）** による自動書き換え（system スコープ → source-anchored 形）は将来の検討。
