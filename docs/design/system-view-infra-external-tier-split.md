# System-view: dep ティアを infra 行と external 行に分割する

- **日付**: 2026-06-23
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1724](https://github.com/kompiro/karasu/issues/1724)（system view が横に広がりすぎる）
  - 派生 Issue: [#1728](https://github.com/kompiro/karasu/issues/1728)（エッジ交差の低減 — 本 Doc の scope 外）
  - 関連 ADR:
    - [ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md)（#974 dep pull-up。本変更で **amend が必要**）
    - [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング）
    - [ADR-20260428-10](../adr/20260428-10-auto-layout-actor-row-by-target.md)（actor pull-down — dep pull-up の対称ミラー）
  - 関連 TPL: [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（`database` 語彙と `[external]` タグの二重表現）
  - コード: `packages/core/src/renderer/layout.ts`（`systemTier` / `assignForcedSystemLayers`）
  - PoC: ブランチ `feat/system-view-split-dep-tier`

## 背景・課題

system view は `systemTier()` でノードを kind ベースの 4 ティアに割り当てる（[ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md) 背景節）:

- 0: `user` / 1: `client` / 2: `service`（内部）/ 3: **dep**（`database`/`queue`/`storage` + `[external]`）

dep ティアは infra と外部サービスを **同一の最下段** に詰め込む。これがノード数の多いモデルで横幅を爆発させる。

具体例 — `hato`（[index.krs](https://github.com/kompiro/hato/blob/2f6da3c6d766f2027abd9f056469a2c648feb304/docs/architecture/index.krs)）:

- dep 段に **外部サービス 6 個 + infra 4 個 = 10 個** が一列に並ぶ
- 出力 viewBox が **3136 × 892（アスペクト比 3.52:1）** — 画面・ドキュメントで読めないほど横長

横幅の主因は dep 段の一列詰め込みであり、internal 段（domain 群）の折返しではない（PoC で計測済み）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| ティア割り当て | `systemTier()`（layout.ts ~L1304）が kind/タグで 0..3 を返す |
| 横幅の折返し | 各レイヤーは `MAX_LAYER_WIDTH`（shape 1200 / icon 1040）超で sub-row に折返す（L1073） |
| dep の引き上げ | dep pull-up post-pass（L1416-）が `byTier[3]` を最深 consumer の直下に **strictly upward** で引き上げる（[ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md)） |
| 交差最小化 | forced layout 時は barycenter ソートを無効化（L1031-1034、Q11 宣言順保持） |
| `[external]` な infra | `systemTier` は infra kind と `[external]` を同じ tier 3 に collapse（旧仕様） |

### PoC 計測結果（ブランチ `feat/system-view-split-dep-tier`）

`systemTier` を 5 ティア化（`user → client → service → infra → external`、infra を service 寄り）し、dep pull-up を両段に拡張して各段の tier base を下限にクランプ:

| | width | height | アスペクト比 | エッジ交差 |
| --- | --- | --- | --- | --- |
| before（dep 一段） | 3136 | 892 | 3.52:1 | 33 |
| after（infra/external 2 段） | 1793 | 1096 | **1.64:1** | 33 |

幅 **−43%**、目標の ~2:1 を達成。残り幅は infra 行（`D1` がテーブル 10 個でワイド）が主因。

> 交差数（33）は本変更では不変。エッジ交差の低減は別系統の改修が必要で [#1728](https://github.com/kompiro/karasu/issues/1728) に分離した（[#1728] の barycenter PoC が無効だった理由もそこに記録）。

## 制約・前提

- **Q11（宣言順保持）**: forced layout は各レイヤー内のノード順を宣言順に保つ。本変更はティア *割り当て* のみを変え、段内の順序ロジックには手を入れない。
- **[ADR-20260429-02] の dep pull-up を壊さない**: 「incoming edge を持つ dep を最深 consumer の直下に strictly upward で引き上げる／持たない dep は最下段」という不変条件を、2 段化後も各段内で維持する。
- **後方互換**: dep が 1 種類しかないモデル（infra だけ／external だけ）では、空ティアが高さ 0 を占めるため見た目は実質変わらないこと。
- **display mode 非依存**: shape / icon どちらでも分割が成立すること（[TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)）。
- **scope 外**: エッジ交差の低減（[#1728]）、infra コンテナの圧縮（#1724 案 E）。

## 検討した選択肢

### 案A: dep ティアを infra 行 + external 行に 2 分割（採用）

`systemTier` を 5 値化し、`service(2) → infra(3) → external(4)` の縦順にする。infra を service 直下に置く（read/write エッジが短くなる「内→外」配置）。dep pull-up は両段に拡張し、**各段の tier base を引き上げの下限**にして external が infra 行へ吸い上げられないようにする。

**メリット**

- 最広行のノード数が半減（hato: 10 → 6）。幅 −43% を PoC で実証。
- 意味的に明快（所有データストア vs 第三者 SaaS が視覚的に分離）。
- read/write エッジが短くなり、交差も微減する余地。

**デメリット**

- 高さが増える（hato: 892 → 1096）。
- external が infra の下段になり、**service→external エッジが infra 行を skip** する。[ADR-20260429-01] の直交ルーティングで救われるが、貫通リスクは新規に発生する（後述の proactive TPL 候補）。
- [ADR-20260429-02] の dep pull-up を amend する必要がある。

### 案B: dep 段に折返し（`MAX_LAYER_WIDTH`）を効かせる

dep 段が 1200px 超で sub-row に折返すようにする。

**メリット**: 意味非依存で汎用。最小変更に見える。
**デメリット**: **PoC 相当の調査で無効と判明** — dep は pull-up で既に複数行に散っており、各行は単独で 1200px 未満。折返しは発火しない。infra/external の意味的分離も得られない。

### 案C: アスペクト比ターゲットで広い層を自動再配置

target ratio（例 ≤16:9）を超える層を複数 sub-row に再分配する汎用 post-pass。

**メリット**: 全ビューに効く。
**デメリット**: 閾値の根拠付けが難しい（[ADR-20260429-02] が案 D2 で「N の根拠がない」として却下した思想と同型）。今回の症状には過剰。将来 [#1724] の継続として再検討可。

## 比較

| 観点 | 案A（2 分割） | 案B（折返し） | 案C（比率再配置） |
| --- | --- | --- | --- |
| hato での幅削減 | 実証 −43% | 0（無効） | 未計測 |
| 変更量 | 中（tier 数 + pull-up） | 小だが無効 | 大 |
| 意味的明快さ | 高（infra/external 分離） | なし | なし |
| 既存 ADR への影響 | ADR-20260429-02 amend | なし | なし |
| 副作用 | service→external が skip | なし | レイアウト全体に波及 |

## 現時点の方針

**案A を採用する** — PoC で唯一幅削減を実証でき（3.52:1 → 1.64:1）、infra/external の意味的分離という副次的価値もある。案B は無効、案C は過剰。

### `database [external]` の所属ティア（決定済み）

infra kind かつ `[external]` タグを持つノード（第三者マネージド DB 等）は **external 行**に置く（`systemTier` で external タグを infra kind より優先）。「我々が所有する infra」ではなく「外部依存」という意味づけを優先する。旧仕様（infra 扱い）からの挙動変更であり、既存テスト `places database [external] in the dep tier alongside infra (tag does not change tier here)` を新仕様に合わせて書き換える。[TPL-20260519-02] の二重表現観点に back-ref する。

### 実装の指針

1. `systemTier`: 戻り値を `0|1|2|3|4` に拡張。`external` タグ → 4、infra kind → 3、その他 → 2。`SYSTEM_TIER_COUNT = 5`。
2. `assignForcedSystemLayers`: `occupied`/`byTier` を 5 要素化。no-signal 判定に tier 4 を追加。`tierBase` ループを `< SYSTEM_TIER_COUNT` に。
3. **dep pull-up を amend**（[ADR-20260429-02]）: 引き上げ対象を `byTier[3] ∪ byTier[4]` に拡張し、`desired = max(maxSourceLayer + 1, tierBase[tier])` と **tier base を下限にクランプ**。これにより external が infra 行へ collapse しない。strictly upward と固定点反復は維持。
4. テスト整合（PoC で判明した 5 件）:
   - `places dep tier (infra + external) below internal services` → 2 段を assert するよう書き換え。
   - `places database [external] …` → external 行を期待値に。
   - `#974` 系 2 件（`pulls a dep up…` / `places a shared dep just below its deepest consumer`）→ tier base クランプ後の row を再計算して期待値更新。dep pull-up の不変条件（最深 consumer の直下）が各段内で成り立つことを確認。
   - `#969` `places Payment / Inventory…`（examples）→ 行メンバーシップ変化による x シフトを確認し、column hint 契約が無傷であることを検証。
5. AT: `docs/acceptance/` に新規。TC は:
   - infra と external が別行に分離される（縦に infra → external の順）。
   - infra のみ／external のみのモデルで段が縮退し高さが増えない。
   - `database [external]` が external 行に出る。
   - shape / icon 両モードで分離が成立する。
6. proactive TPL（下記「未解決の問い」で判断）。
7. ADR 昇格: 実装完了後、本 Doc を `docs/adr/YYYYMMDD-NN-system-view-infra-external-tier-split.md` に昇格し同 PR で削除。**[ADR-20260429-02] の amend**（`systemTier` が 4→5 ティア、`byTier[3]` 前提の更新）を同 ADR 内に明記する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: system view のレイアウトが変わる（infra/external が縦に分離）。`.krs` の書き換えは不要。
- ドキュメント更新: `docs/spec/` のレイアウト記述、`docs/concepts*.md` の system-view ティア説明があれば更新。
- テスト・examples への影響: 上記 5 テストの期待値更新。examples のスナップショットがあれば再生成。

## 未解決の問い / 決めないこと

- **proactive TPL を起こすか**: 案A は service→external エッジを infra 行 skip にする。これは [ADR-20260429-02]/[ADR-20260428-10] が潰した「エッジが中間カードを貫通する」問題の再燃リスク。「ティア分割は隣接段を越えるエッジの貫通を増やしてはならない（直交ルーティングで救済されること）」という観点はまだ TPL 化されていない。3-Yes（横展開しうる=他のティア追加でも再発／構造的に再発しうる／既存 TPL 未掲載）を満たすなら同 PR で proactive TPL を起こす。→ **要判断**。
- **infra 行のさらなる幅削減（#1724 案 E）**: `D1` のテーブル列挙が残り幅の主因。本 Doc の scope 外として #1724 に残す。
