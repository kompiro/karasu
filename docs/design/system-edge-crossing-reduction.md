# System-view: ハブの多層ファンアウトのエッジ交差を減らす

- **日付**: 2026-06-24
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1728](https://github.com/kompiro/karasu/issues/1728)（system view のエッジが追いにくい）
  - 親の文脈: [#1724](https://github.com/kompiro/karasu/issues/1724) / [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（infra/external ティア分割）
  - 関連 ADR: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング — 本変更で拡張）
  - 関連 TPL: [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（ティア分割で段跨ぎエッジが貫通しないこと — 本 Doc が扱う交差はこの観点の延長）
  - 隣接ワーク: [#1737](https://github.com/kompiro/karasu/issues/1737) / PR [#1744](https://github.com/kompiro/karasu/pull/1744)（balanced-grid ノード配置。**本 Doc とは別軸 = ノード配置 vs エッジ経路**。下記「#1744 との調停」参照）
  - コード: `packages/core/src/renderer/edge-routing-ports.ts` / `edge-routing-channels.ts` / `edge-routing-bundles.ts` / `layout.ts`

## 背景・課題

system view で、1 つのサービスが多数の infra/external ノードへ fan-out すると、エッジ（線）が放射状に重なって追えなくなる。`hato` の system view（[#1724] マージ後）で計測:

- **17 エッジ / 33 交差**（すべて直線 `<line>`、直交 polyline は 0 本）

[#1724] のティア分割は figure の**横幅**を半減したが、**エッジ交差は 33 → 33 で不変**。交差は別系統の問題であり本 Doc で扱う。

## 現状（インベントリ） — Phase 0 分析

`hato` の実レイアウトを instrument して交差の出所を特定した（`layout()` を直接呼び、エッジの from→to とノード tier を取得）。

### ティアとハブ

| tier | y | ノード |
| --- | --- | --- |
| 0 | 60 | Author |
| 1 | 264 | ClaudeApp / WebApp |
| 2 | 486 | **HatoApi** / HatoMcp |
| 3 | 690 | D1 / Vectorize / Queues / R2（infra） |
| 4 | 894 | CloudflareAccess / AnthropicAPI / WorkersAI / GoogleCalendar / Strava / GitHub（external） |

**HatoApi が 10 エッジのハブ**。下向き 9 本が **2 つの tier に同時に fan-out** する:

- tier 3（infra）: D1(x=235), Vectorize(579), Queues(923), R2(1240)
- tier 4（external）: AnthropicAPI(470), WorkersAI(808), GoogleCalendar(1038), Strava(1313), GitHub(1533)

x 順に並べると **infra と external が交互**（t3,t4,t3,t4,t3,t4,t3,t4,t4）。

### 交差の内訳

| 交差クラス | 件数 |
| --- | --- |
| ハブ fan-out 同士（下段への多数エッジが互いに交差） | **25 / 33** |
| service→external × service→infra | 3 |
| その他 | 5 |

**25/33 が単一クラス**＝ハブの fan-out エッジ同士の edge-vs-edge 交差。

### なぜ既存パスで解けないか（cheap レバーの棄却）

- **L1 ノード並べ替え（barycenter）**: [#1724] で実測済みの **no-op**（infra エッジは implicit で並べ替え時点に存在せず、単一始点 fan-out は barycenter 同値）。
- **L2 ポート x 順**: `distributePorts`（`edge-routing-ports.ts`）は既に「対向端点の x 順」でポートを並べている。だが **2 つの depth への fan-out は x 順だけでは planar にできない** — 遠い tier(external) へのエッジが近い tier(infra) のターゲットを「跨いで」しまう。計測でも 12 本の fan-out に 23 件の port-order×target-order inversion が残る。
- **既存の直交ルーター `routeOrthogonalEdges`**: skip-layer エッジが**ノードカードを横切る**時だけ L 字化する（edge-vs-**card**）。HatoApi→external はカード間の隙間を通るため発火せず（polyline 0 本）。本件の **edge-vs-edge 交差は対象外**。

→ **edge-vs-edge のハブ多層 fan-out 交差を解消する既存パスは無い**。これが [TPL-20260623-04] が予見した「ティア分割で増える段跨ぎエッジ」の交差版。

## 制約・前提

- **[#1724] のティアレイアウトを壊さない**: ノード配置（tier 割り当て・行）は不変。本変更は**エッジの経路のみ**。
- **既存の直交ルーティング語彙と一貫**: [ADR-20260429-01] の L 字経路（waypoints）を踏襲し、新しい描画プリミティブを増やさない。
- **個々の線が追えること**: 束化で重ねると個別エッジが辿れない（後述の代替案で棄却理由）。
- **ラベル可読性**: エッジラベルの配置（`markParallelBundles`）を退行させない。
- **scope 外**: ノード配置の wrap/grid（[#1737]/[#1744]）、エッジラベルの自動付与。

## 検討した選択肢

### 案A: 直交トランク/バス・ルーティング（採用）

ハブから**垂直トランク**を下ろし、各 tier の手前の**水平チャネル（バス）**で分岐して各ターゲットへ落とす（L 字）。多層 fan-out が**構造的に planar** になる。`routeOrthogonalEdges` を「edge-vs-card のみ」から「ハブの多層 fan-out」にも発火するよう拡張する。

**メリット**

- ハブ fan-out 同士の交差（25/33）を構造的に解消。
- [ADR-20260429-01] の L 字語彙と一貫。新プリミティブ不要。
- 個々の線が追える（束化と違い分離している）。

**デメリット**

- 直線より縦のチャネル領域が要る（高さ微増の可能性）。
- ルーティングの複雑度が上がる（チャネル割り当て `distributeChannelLanes` との協調）。

### 案B: エッジバンドリング

ハブの fan を 1 本の曲線トランクに束ね、ターゲット近くで分岐。

**メリット**: 視覚クラスター感は減る。
**デメリット**: 束ねた線が重なり**個別エッジを辿れない**。「線のつながりを見やすく」という Issue の目的（個々の関係を読む）に反する。棄却。

### 案C: ポート順を (tier, x) にする

ポートを「近い tier を左、遠い tier を右」に segregate して x 順。
**デメリット**: infra ターゲットは x 全域に散る（235..1240）のに左半分のポートに集約 → かえって external エッジと交差。planar にならない。部分対症で棄却。

## 比較

| 観点 | 案A 直交トランク | 案B バンドリング | 案C (tier,x)ポート |
| --- | --- | --- | --- |
| 25-交差クラスの解消 | 構造的に planar | 視覚的に隠す（交差は残る） | 部分的・悪化し得る |
| 個別エッジの追跡 | 可 | 困難 | 可 |
| 既存語彙との一貫 | 高（L 字） | 低（曲線束） | 中 |
| リスク | 中（routing 複雑度） | 中 | 低だが効果薄 |

## 現時点の方針

**案A（直交トランク/バス）を採用する** — 25/33 を占めるハブ多層 fan-out の edge-vs-edge 交差を構造的に planar 化でき、[ADR-20260429-01] の L 字語彙と一貫し、個別エッジの追跡性も保つ。案B は追跡性を損ない Issue 目的に反する。案C は planar にならない。

### PoC（実装前のゲート）

`routeOrthogonalEdges` を多層 fan-out に拡張した最小版で `hato` の交差数を計測し、**33 → 半減以下**（Issue の acceptance signal）を満たすか確認してから本実装に進む。満たさなければ案を見直す。

### 実装の指針（PoC 後）

1. ハブ検出: あるノードの下向き out-edge が **2 つ以上の tier** にまたがる fan-out を検出（`layout.ts` のレイヤ情報を使う）。
2. トランク/バス経路: ハブ下に垂直トランク、各ターゲット tier の手前に水平チャネルを確保し、L 字 waypoints を設定（`edge-routing-channels.ts` を拡張）。`distributeChannelLanes` と協調してチャネル内の lane を分離。
3. 既存の `distributePorts` / `markParallelBundles` / 直交 skip ルーティングと**順序衝突しない**よう pass 順を設計（`layout.ts` L854-874 の pass パイプライン）。
4. テスト: `edge-routing-channels.test.ts` に多層 fan-out の planar 化ケース。`layout.test.ts` の [#1724] tier テストが**無変更で通る**こと（ノード配置不変の回帰ガード）。
5. AT: `hato` 相当モデルで交差数が半減すること（測定 AC）。
6. proactive TPL: [TPL-20260623-04] のチェックリスト（段跨ぎエッジの救済）に「多層 fan-out は planar に経路付けする」を back-ref で追加するか検討。
7. ADR 昇格: 完了後、[ADR-20260429-01] を refine する形で ADR 化。

### #1744 との調停

[#1744]/[#1737]（balanced-grid ノード配置）は**ノードの位置**を変える別軸。本 Doc は**エッジ経路のみ**で、ノード配置に依存しない waypoints 生成にする。grid が後で入ってノード x が変わっても、トランク/バスのロジックは tier とターゲット位置から再計算されるため共存する。実装順は #1728 先行（ユーザ決定）。

### 影響範囲・マイグレーション

- 既存ユーザー: 多層 fan-out のあるモデルでエッジが L 字経路になる。`.krs` 変更不要。
- テスト・examples: エッジ経路を含む SVG スナップショット / guide 図があれば再生成。

## 未解決の問い

- トランクの **lane 割り当て**: 複数ハブ（HatoApi + HatoMcp）が同時に多層 fan-out する場合、トランク/チャネルをどう分離するか（`distributeChannelLanes` 拡張の範囲）。PoC で実データ（hato は 2 ハブ）を見て決める。
- 高さへの影響: 水平チャネル分の縦余白が figure 高さをどれだけ増やすか。PoC で計測。
