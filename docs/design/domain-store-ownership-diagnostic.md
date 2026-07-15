# ドメイン別 infra 所有 と cross-domain ストアアクセス診断

- **日付**: 2026-07-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1819](https://github.com/kompiro/karasu/issues/1819)（親 [#1816](https://github.com/kompiro/karasu/issues/1816) notation watch round 2, item 2）
  - 関連 ADR:
    - [ADR-20260615-02](../adr/20260615-02-shared-infra-fan-in-diagnostic.md)（`shared-infra-fan-in` info 診断 — 本診断はこれと対になる）
    - [ADR-20260514-02](../adr/20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は `info` で事実通知 / register は事実 vs 流派判断で決める）
    - [ADR-20260714-01](../adr/20260714-01-cross-domain-ghost-entities.md)（entity の cross-domain 関連は限定子付き参照 + ghost。所有 system スコープ解決の前例）
    - [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（database first-class ノード）
  - 関連 Design Doc: [`domain-entity-modeling.md`](./domain-entity-modeling.md)（`entity`（domain 子） + `table DB.tbl` 物理マッピング。本設計の所有導出の土台）
  - 関連 TPL:
    - [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（新 diagnostic の register は事実か流派判断かで決める）
    - [TPL-20260623-02](../test-perspectives/TPL-20260623-02-validation-target-set-enumerates-all-kinds.md)（resource→store の解決集合は全 consumer で同期する）
    - [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（論理/物理の二重表現を conflate しない）
    - [TPL-20260615-02](../test-perspectives/TPL-20260615-02-diagnostic-absence-assertion-scope-severity.md)（診断の不在・scope・severity をテストで固定する）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectSharedInfraFanIn` / `buildEntityResolver`）、`packages/core/src/resolver/resource-entity.ts`、`packages/core/src/types/warnings.ts`

## 背景・課題

実 OSS のアーキテクチャを起こす作業（karasu-nest リバース含む）で 2 つの関連ニーズが浮上した（#1816 item 2）:

1. **infra leaf（table）をドメインで括りたい** — 1 つの database の table 群は別々のドメインに属していることがあり、その所有を可視化したい。
2. **cross-domain ストアアクセスを自動検出したい** — ドメイン A の usecase が、ドメイン B が所有する table を read/write するのは境界シグナルであり、診断に値する。

(2) は round-2 findings の中で最も karasu-native — 「誰が何を所有し、どこで境界を跨ぐか」そのもの。そして (1) が (2) を可能にする: table にドメイン所有者が付けば、cross-domain アクセスが計算可能になる。

親 Issue の方向性（#1816 での議論）:

- **論理グルーピング = `domain`**（clean・on-mission）。診断が読むのはこの層。
- **物理 `schema` は 1:1 マッピングではない** — 1 ドメインが複数 schema を持ちうるし、1 schema が複数ドメインに仕えうる。ゆえに「domain → schema を `realize` で結ぶ」は成り立たない。物理 schema マッピングは**未解決の設計問題**として切り出す。論理（domain）と物理（schema）は core concept どおり分離を保つ（dual-representation の落とし穴 TPL-20260519-02）。
- 診断は既存の `shared-infra-fan-in`（info, ADR-20260615-02）と**対になる**。
- in-flight の infra `realizes` 作業（#1632）と交差しうる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| infra leaf の宣言 | `database DB { table T }`。table は leaf ノード。**ドメインに属する概念を持たない**（物理面はドメインスコープを持たない） |
| `entity`（domain 子, domain-entity-modeling） | `domain D { entity E { table DB.T } }`。entity は **domain 所有**で、任意の物理マッピング `table <InfraId>.<subId>` を 1 つ持てる |
| usecase resource の解決（resource-entity.ts） | `buildEntityResolver(nodes)` が `resource` を解決し `{ entityId, infraParentId }` を返す。`usecase → entity → table → database` を辿って `service → database` エッジと read/write タグを合成する（domain-entity-modeling「Transitive derivation」） |
| `shared-infra-fan-in`（ADR-20260615-02） | 同一 system scope で同じ database/queue/storage を **2 つ以上の service** が参照したら info 発火。`[external]` / `[index]` 除外。`detectSharedInfraFanIn` が `analyze()`（merge 後 KrsFile）で view 非依存に判定 |
| `domain-dispersal` | 同じ domain id が ≥2 service 配下に現れたら info。domain id をキーに判定、system 境界はまたがない |
| 診断 register（concepts.md「What karasu visualizes vs. doesn't prescribe」） | `domain-dispersal` / `infra-redeclared-across-files` / `shared-infra-fan-in` / `duplicate-owner-assignment` の 4 件が info。「流派が smell と呼ぶ構造的事実」を通知。「This list will grow」と明記 |
| domain id の一意性 | system 内で **error 級一意**。ゆえに所有 system 内では domain を曖昧なく識別できる（ADR-20260714-01 の解決スコープ前例） |

## 制約・前提

- **論理/物理分離を保つ** — table（物理）に直接ドメインを宣言させない。所有は論理層（entity → domain）から**導出**する（後述の採用案）。物理 schema を持ち込むと dual-representation になる（TPL-20260519-02）。
- **warn-don't-error / register は info** — cross-domain アクセスは「ある流派が boundary smell と呼ぶ構造的事実」であって karasu が直せと規定する defect ではない。ADR-20260514-02 / TPL-20260514-08 の判定樹に従い **`info`**（never error、warn でもない — 理由は「比較」節）。
- **view 非依存** — `shared-infra-fan-in` と同じく `analyze()`（merge 後）で判定し、App / CLI / LSP のどこからでも surface される。
- **scope は per-system**（+ top-level）。domain id は system 内でのみ error 級一意なので、cross-domain 判定も所有 system 内に閉じる（ADR-20260714-01 と一致）。cross-**system** アクセスは意図的なので対象外。
- **`[external]` / `[index]` ストアは除外** — `shared-infra-fan-in` と対称。境界外の managed store や派生 read model へのアクセスは所有境界の smell ではない。
- **後方互換 / 新 builtin を凍結しない** — #1816 promotion-gate（default = keep experimental, 実利用証拠なしに builtin を凍結しない）に従い、**新しい構文を一切増やさない**ことを最優先にする。
- **未解決を error にしない** — entity マッピングが 1 つも無い table のみ所有不明として診断を**出さない**（false-positive を作らない）。複数ドメインが同一 table をマッピングする co-owned table は「所有ドメインの集合」として扱い、所有集合外からのアクセスは通常どおり発火する（後述）。

## 検討した選択肢 — table のドメイン所有をどう与えるか

診断 (2) の前提は「table にドメイン所有者がある」こと (1)。所有をどう与えるかで案が分かれる。

### 案A: entity → table マッピングから所有を**導出**する【採用】

`domain-entity-modeling` で導入済みの `entity E { table DB.T }` を所有の source-of-truth にする。

- table `DB.T` は、それをマッピングする `entity` を所有する domain に**所有される**（`entity` の親 domain）。
- usecase resource は既に entity resolver で解決される（`usecase → entity → table`）。解決先 entity の所有 domain が「所有ドメイン」。
- **新構文ゼロ**。所有は導出、宣言しない。論理層（entity/domain）だけを読み、物理 table には触れない → 論理/物理分離が保たれる。

**メリット**: 新 builtin なし（promotion-gate に整合）。ちょうど着地した entity 層（ADR-20260714-01）を再利用。「infra leaf をドメインで括る」(1) が entity マッピングの副産物として**タダで**手に入る。cross-domain 判定が logical 層で完結する。

**デメリット**: entity を宣言していないモデルでは所有が導出されず、診断が出ない（後述の「entity 未導入モデル」参照）。1 つの table を複数ドメインの entity がマッピングすると所有が曖昧（後述）。

### 案B: 物理 table にドメインを宣言させる

`database DB { table T { domain Ordering } }` のように table にオーナーを直接書く。

**デメリット**: 物理面にドメインスコープを持ち込む = 論理/物理を conflate（core concept 違反、TPL-20260519-02）。新 builtin/プロパティが増える（promotion-gate 違反）。entity マッピングと二重管理になり、どちらが正典か曖昧。**却下**。

### 案C: 物理 `schema` を store に持たせ `schema.table` 粒度で realize する

親 Issue が「候補」として挙げた物理 schema マッピング。

**デメリット**: これは**物理配置の問題**であって論理所有ではない。1 domain ↔ N schema、1 schema ↔ N domain で 1:1 にならず、所有導出には使えない。**本設計のスコープ外の未解決問題**として切り出す（「未解決の問い」節）。

### 案D: グルーピングを view/rendering 側だけで解く

table を所有ドメインで視覚的にクラスタリングするレンダリング機能を追加し、診断は作らない。

**デメリット**: (2) の診断ニーズ（最も karasu-native な finding）に応えない。視覚グルーピングは comprehension pillar の関心事（#1816 item 3 と同じ切り分け）であり、所有導出（案A）が入れば follow-up で載る。**視覚グルーピングは本設計の後続**として扱う。

## 比較

| 観点 | 案A: entity 導出 | 案B: table に宣言 | 案C: 物理 schema | 案D: view のみ |
| --- | --- | --- | --- | --- |
| 新 builtin/構文 | ゼロ ✓ | 増える ✗ | 増える ✗ | ゼロ（診断なし） |
| 論理/物理分離 | 保つ ✓ | conflate ✗ | 物理の話 | — |
| 所有の source-of-truth 一意性 | entity 一本 ✓ | 二重管理 ✗ | 所有に使えない ✗ | — |
| (2) 診断を可能にするか | ✓ | ✓ | ✗ | ✗ |
| promotion-gate 整合 | ✓ | ✗ | ✗ | ✓ |

## 現時点の方針

**案A** を採用する。所有は entity → table マッピングから導出し、新構文は増やさない。

### 所有導出（item 1）

- 物理 leaf `table DB.T`（database `DB` 配下）の**所有はドメインの集合**として与える: `owners(T) = { D : D に属する entity が table DB.T をマッピング }`。通常は単一要素。
- 論理形では等価に: resource が解決した **entity の親 domain**（マッピングが 1 件なら単一所有）。
- **co-owned table（|owners| ≥ 2）**: 相異なる複数ドメインの entity が同一 table をマッピングするケース（まさに「schema は 1:1 でない」現実の表れ）。この table は「所有ドメインの集合」として保持し、cross-domain 判定は accessor が集合に含まれるかで行う（次節）。所有者どうしのアクセスは境界越えではないので発火しないが、**集合外の第三ドメインからのアクセスは正しく捕捉される**。co-ownership それ自体を smell として通知するか（`multi-domain-table` info）は promotion-gate に従い今回スコープ外（follow-up）。

### cross-domain ストアアクセス診断（item 2）

- 新 Warning kind **`cross-domain-store-access`**（`info` register）を追加。
- `domain D_acc` 内の `usecase` の各 `resource` を entity resolver で解決し、解決先ストア/table の `owners(T)` を得る。
- `owners(T)` が空でなく、かつ **`D_acc ∉ owners(T)`**（同一 system scope）なら発火。single-owner はその特殊形で、co-owned table でも所有集合外からのアクセスを正しく捕捉する。
- **read/write モードを params に載せる** — resolver が既に合成する `[read]`/`[write]` タグから `mode ∈ { read, write, readwrite }` を導出。cross-domain write（他ドメイン所有ストアへの書き込み）は read より強い境界シグナルなので、consumer / UI が mode で絞り込めるようにする。severity は read/write とも `info`（別 severity にはしない。write-only 発火もしない — read も CQRS / shared kernel の観測対象として残す）。
- params 案: `{ accessingDomain, owningDomains, infraId, infraKind, mode, usecase? }`（`owningDomains` は集合、`mode` は上記。詳細は実装時に確定。TPL-20260623-02 に従い resolver の解決集合を `deriveInfraEdges` / `detectSharedInfraFanIn` / `detectUnassignedResources` と同期する）。
- scope は per-system + top-level。`[external]` / `[index]` ストアは除外（fan-in と対称）。
- `analyze()`（merge 後）で判定 → view 非依存。LSP single-document では抑制しない（under-report のみで false-positive は出ない。fan-in / domain-dispersal と同性質）。

### `shared-infra-fan-in` との関係（対だが直交）

| | 観測する事実 | キー |
| --- | --- | --- |
| `shared-infra-fan-in` | 1 ストアを **≥2 service** が参照（物理共有の量） | 参照 service 数 |
| `cross-domain-store-access` | ドメイン A の usecase が **ドメイン B 所有**のストアに触れる（論理所有境界の越境） | 所有ドメイン ≠ アクセスドメイン |

両者は独立に、または同時に発火しうる（例: 2 ドメインが 1 table を共有 → fan-in も cross-domain も）。二重計上ではなく、**別々の事実**を別々に通知する（ADR-20260615-02 が `infra-redeclared-across-files` と `shared-infra-fan-in` を書き分けたのと同じ原則）。

### severity を info にする理由

ADR-20260514-02 / TPL-20260514-08 の判定樹: 「domain A が domain B のストアに触れる」は**構造的事実**で、それを smell と呼ぶかは流派判断（shared kernel・移行期・意図的共有では正当）。ゆえに **`info`**。`warning`（=直すべき）にすると意図的な cross-domain 共有で誤報になり、ADR-20260514-02 の立場と矛盾する。`error` は論外（warn-don't-error）。

## 詰めた論点と残りの follow-up

当初「未解決の問い」だった論点は #1819 の壁打ちで方針を確定した。

- **物理 schema マッピング — 本設計から切り離す（decouple）**。診断の所有は論理層（entity → domain）だけを読む。Postgres schema 等の物理 schema は**物理配置**の話で、非 1:1（1 domain ↔ N schema、1 schema ↔ N domain）ゆえ所有導出には使えず、entity 未導入 table の所有補完もできない。よって schema モデリングは本診断の sub-question **ではなく**、動機が生じたとき独立の物理層フィーチャとして別途扱う（本設計としては #1632 とも結合しない）。
- **co-owned table — 所有ドメインの集合として扱う**（上の「所有導出」節に取り込み済み）。cross-domain は `accessor ∉ owners(T)` で判定するので co-owned table でも正しく機能する。co-ownership それ自体を通知する `multi-domain-table` info は、実利用証拠が出てから判断（promotion-gate）。**本設計スコープ外の将来 follow-up**。
- **read/write 非対称 — 単一 info + `mode` param で解決**（上の診断節）。write-only 発火や severity 分割はしない。
- **entity 未導入モデル — 許容**。物理 dot-notation だけで entity を宣言していない table は所有不明で診断が出ない。ただしギャップは**狭い**: bare `resource Order` が entity に解決すれば所有は効く。純粋な物理 dot ref（`resource OrderDB.orders`）で、その table を誰の entity もマッピングしていない場合のみ dark。これは「ボトムアップの正当な中間状態」で、entity を足せば zero-edit で診断が後から効く（domain-entity-modeling の zero-edit promotion と同じ思想）。
- **視覚グルーピング（案D）— follow-up issue**。table を所有ドメインでクラスタリングする描画は comprehension pillar の関心事。具体形は、system view の infra leaf に**所有ドメインの sub-label / badge** を付す軽量案（ADR-20260714-01 の ghost sub-label 機構を再利用）を第一候補とし、新規 view は作らない。所有導出（本設計）が入った後に別 Issue で。

## 影響範囲

- **`docs/spec/syntax.md`**: 「cross-domain ストアアクセス」の所有導出規則（entity → table）と診断を明記。**spec に新規セクションを足す PR は proactive TPL 同梱が必須**（CLAUDE.md）— 実装 PR で「所有導出は entity 層一本から行い物理 table に所有を宣言させない」を守る proactive TPL を 1 件起こす（または TPL-20260519-02 に back-ref で紐付ける）。
- **`docs/spec/diagnostics.md`** / **`docs/concepts.md`**（register 表）: `cross-domain-store-access` (info) を追加。TPL-20260616-02（diagnostics catalog completeness）に従い両表を同期。
- **`packages/core`**: `types/warnings.ts`（新 kind + params + INFO_WARNING_KINDS）、`resolver/warnings.ts`（`detectCrossDomainStoreAccess`。所有導出 helper は `detectSharedInfraFanIn` と resolver を共有）、`resolver/resource-entity.ts`（所有ドメイン導出の露出）。
- **`packages/i18n`**: warning メッセージ（en/ja）。
- **`packages/lsp` / `packages/app`**: 新 kind の surface（既存 warning 経路に乗るため追加露出は最小）。
- **AT**: `packages/cli` の vitest で「cross-domain アクセスで info が出る / intra-domain では出ない / `[external]` 除外 / 曖昧所有では出ない / entity 未導入では出ない」を固定（TPL-20260615-02: 不在・scope・severity をテストで固定）。

## 受け入れテスト（実装 PR 用の骨子）

1. `domain A` の usecase が `domain B` 所有（B の entity が `table DB.T` をマッピング）の `DB.T` を参照 → `cross-domain-store-access` info が 1 件出る。
2. 同一ドメイン所有の table を参照 → 出ない（intra-domain）。
3. `[external]` / `[index]` の store を跨いでも → 出ない。
4. **co-owned table**（A・B 双方の entity が同一 `DB.T` をマッピング）を **domain C** の usecase が参照 → 出る（`C ∉ owners = {A,B}`）。A または B の usecase が参照 → 出ない（所有集合内）。
5. entity を宣言していない物理 dot-notation のみのモデル（その table を誰もマッピングしていない） → 出ない（所有不明）。
6. cross-**system** の参照 → 出ない（scope 外）。
7. 2 ドメインが 1 table を共有するケースで `shared-infra-fan-in` と `cross-domain-store-access` が**それぞれ独立に**出る（二重計上でも相互抑制でもない）。
8. **read/write mode**: cross-domain write の resource（`operations` に write 系）→ params `mode` が `write`（または `readwrite`）。read-only 参照 → `mode: read`。severity はいずれも info。
