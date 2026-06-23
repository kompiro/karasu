# System-view: dep ティアを infra 行と external 行に分割する

- **日付**: 2026-06-23
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1724](https://github.com/kompiro/karasu/issues/1724)（system view が横に広がりすぎる）
  - 実装 PR: [#1736](https://github.com/kompiro/karasu/pull/1736)
  - 派生 Issue: [#1728](https://github.com/kompiro/karasu/issues/1728)（エッジ交差の低減 — 本 Doc の scope 外）
  - 関連 ADR:
    - [ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md)（#974 dep pull-up。本変更で **amend が必要**）
    - [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング）
    - [ADR-20260428-10](../adr/20260428-10-auto-layout-actor-row-by-target.md)（actor pull-down — dep pull-up の対称ミラー）
  - 関連 TPL:
    - [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（本 PR で起こした proactive TPL — ティア分割で段跨ぎエッジが中間カードを貫通しないこと）
    - [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（`database` 語彙と `[external]` タグの二重表現 — `database [external]` の所属判断に back-ref）
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

`systemTier` を 5 ティア化（`user → client → service → infra → external`、infra を service 寄り）し、infra は従来の #974 pull-up を温存、external は最下段の固定バンドに配置（採用案の最終形。当初 floor クランプ案は #974 を壊したため却下 — 「実装の指針」参照）:

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

`systemTier` を 5 値化し、`service(2) → infra(3) → external(4)` の縦順にする。infra を service 直下に置く（read/write エッジが短くなる「内→外」配置）。infra は従来の #974 pull-up を温存し、external は **pull-up させず最下段の固定バンド**に置いて infra との分離を保つ（floor クランプ案は #974 を壊すため不採用 — 「実装の指針」参照）。

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

infra kind（`database`/`queue`/`storage`）は **タグに関係なく常に infra 行**に置く（`systemTier` で infra kind を `external` タグより優先してチェック）。

**理由（境界ルール）**: infra は定義上 system 境界の *内側* にあるデータストア。`[external]` タグの意味は「*別の system（別境界）で動いている*」。したがって `database [external]` は「境界内のストアなのに別境界」という矛盾したモデリングであり、これを external 行（別境界の層）へ昇格させるのは category error。外部 SaaS の DB であっても、自分の `system` 内で `database` として読み書きの対象にモデリングしている時点で境界内の infra として扱うのが正しい。external 行へ行けるのは `service [external]` のように本当に別 system で動くノードだけ。

旧仕様（infra と external を 1 ティアに collapse）の挙動と整合し、`database [external]` は owned infra と同じ infra 行に並ぶ（タグはスタイル＝枠線/色を変えるが、ティアは変えない）。[TPL-20260519-02] の二重表現観点に back-ref する。

> 将来検討（scope 外）: `database`/`queue`/`storage` に `[external]` を付ける記述自体を diagnostic で warn すべきか（境界の概念矛盾を作者に知らせる）。本 Doc では tiering の挙動のみ確定し、診断は別 Issue とする。

### 実装の指針

1. `systemTier`: 戻り値を `0|1|2|3|4` に拡張。チェック順は **infra kind → 3 を `external` タグ → 4 より先**（境界ルール: infra は常に境界内）。infra でも external でもない → 2。`SYSTEM_TIER_COUNT = 5`。
2. `assignForcedSystemLayers`: `occupied`/`byTier` を 5 要素化。no-signal 判定に tier 4 を追加。`tierBase` ループを `< SYSTEM_TIER_COUNT` に。
3. **infra pull-up は不変、external は固定バンド**（[ADR-20260429-02] を amend）:
   - infra（tier 3）の #974 pull-up は **floor を掛けず従来どおり**にする（infra は上側の dep 段なので、内部行へ引き上げても external と衝突しない）。これで #974 の不変条件が温存される。
   - external（tier 4）は **pull-up させず**、`externalBase = max(external 以外の全ノードの layer) + 1` の固定バンドに置く（`subLayers[4]` の intra-external topo を加味）。これで external は常に infra/service の下に分離され、`#1724` の幅削減を生む。
   - 当初 PoC の「両段に floor を掛けてクランプ」案は **却下**: infra への floor が #974 pull-up を抑止してしまい（infra を内部行へ引き上げられない）、テスト `pulls a dep up…` が壊れた。infra は触らず external だけ固定バンドにする方が変更が小さく、#974 系テストが無変更で通る。
4. テスト整合: 「infra は不変・external だけ固定バンド」案では更新が必要なのは **2 件のみ**（当初 PoC の floor 案では 5 件壊れたが、本案では #974 系 2 件と #969 が無変更で通る）:
   - `places dep tier (infra + external) below internal services` → infra 行の上に external 行が来る 2 段構成を assert するよう書き換え（`splits the dep tier into an infra row above an external row`）。
   - `places database [external] …` → infra 行に留まる（タグはティアを変えない）ことを assert するよう書き換え（`keeps a database [external] on the infra row, not the external row`）。境界ルールにより infra kind は常に infra 行。
   - 追加の fence テスト 2 件: 単一サービスが infra と external を両方使うとき別行に分離される／external のみのモデルで phantom gap が出ない。
   - 回帰ガード: `#974` 系（`pulls a dep up…` / `places a shared dep just below its deepest consumer`）と `#969` column-hint は **無変更で通ること**を確認。
5. AT: `docs/acceptance/` に新規。TC は:
   - infra と external が別行に分離される（縦に infra → external の順）。
   - infra のみ／external のみのモデルで段が縮退し高さが増えない。
   - `database [external]` は infra 行に留まる（境界ルール: タグはティアを変えない）。
   - shape / icon 両モードで分離が成立する。
6. proactive TPL（下記「未解決の問い」で判断）。
7. ADR 昇格: 実装完了後、本 Doc を `docs/adr/YYYYMMDD-NN-system-view-infra-external-tier-split.md` に昇格し同 PR で削除。**[ADR-20260429-02] の amend**（`systemTier` が 4→5 ティア、`byTier[3]` 前提の更新）を同 ADR 内に明記する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: system view のレイアウトが変わる（infra/external が縦に分離）。`.krs` の書き換えは不要。
- ドキュメント更新: `docs/spec/` のレイアウト記述、`docs/concepts*.md` の system-view ティア説明があれば更新。
- テスト・examples への影響: 上記 5 テストの期待値更新。examples のスナップショットがあれば再生成。

## 決めたこと / 決めないこと

- **proactive TPL を起こす（決定）**: 案A は service→external エッジを infra 行 skip にする。これは [ADR-20260429-02]/[ADR-20260428-10] が潰した「エッジが中間カードを貫通する」問題の再燃リスク。3-Yes（横展開しうる＝他のティア追加でも再発／構造的に再発しうる／既存 TPL 未掲載）を満たすため、「ティア分割は隣接段を越えるエッジの貫通を増やしてはならない（直交ルーティングで救済されること）」を検出する proactive TPL を同 PR で起こす。`## Related TPLs` に追記して相互リンクする。
- **infra 行のさらなる幅削減（#1724 案 E）**: `D1` のテーブル列挙が残り幅の主因。本 Doc の scope 外として #1724 に残す。
