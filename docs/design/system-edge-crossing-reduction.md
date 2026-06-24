# System-view: 密なファンアウトを「追える」ようにする（作者側ナビゲーション）

- **日付**: 2026-06-24
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1728](https://github.com/kompiro/karasu/issues/1728)（system view のエッジが追いにくい）
  - 親の文脈: [#1724](https://github.com/kompiro/karasu/issues/1724) / [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（infra/external ティア分割）
  - 関連 ADR: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（skip-layer 直交ルーティング — 本件には効かないことを PoC で確認）
  - 隣接ワーク: [#1737](https://github.com/kompiro/karasu/issues/1737) / PR [#1744](https://github.com/kompiro/karasu/pull/1744)（balanced-grid ノード配置）
  - コード: `packages/core/src/renderer/edge-routing-*.ts` / `packages/core/src/resolver/style-resolver.ts` / `docs/spec/style.md`

## 背景・課題

system view で 1 サービスが多数の infra/external へ fan-out すると線が重なって追えない。`hato`（[#1724] 後）で **17 エッジ / 33 交差**。当初は「自動でエッジ経路を直して交差を消す」方向を検討したが、**PoC で否定された**（下記）。本 Doc は方針を「交差を消す」から「交差があっても**追える**ようにする（作者側ナビゲーション）」に転換する。

## Phase 0 分析（実レイアウト instrument）と PoC

`layout()` を直接呼んで `hato` の交差を実座標で分解した。

### 交差の真の内訳

| 交差クラス | 件数 |
| --- | --- |
| 同一ハブ・同一ターゲット段（ポート順で可修正） | **0** |
| 同一ハブ・別段（infra/external の interleave） | 6 |
| **別ハブ同士（HatoApi × HatoMcp × WebApp のファンアウトが交差）** | **28** |

**支配的なのは cross-hub 交差（28/33）** — 別々のサービスが共有ターゲット（D1/Vectorize/CloudflareAccess）へ張る束が互いに交差する。

> 補足: 当初ドラフトは「25/33 が単一ハブ fan-out」と書いたが、これは y バンドでの誤分類で**誤り**だった。実座標分解で cross-hub 支配と判明。

### PoC 結果（直交ルーティング / ノード再配置はいずれも効かない）

| 手法 | hato 交差数 |
| --- | --- |
| baseline（直線） | **33** |
| 直交 L 字（`routeOrthogonalEdges` の trigger を多層 fan-out に緩和） | 33（全候補が infra カードに blocked = no-op） |
| 直交トランク（素朴） | 52（悪化） |
| 直交トランク（lane 分離 best-case モデル） | 53（悪化） |
| barycenter 再配置（resolved edge でモデル化） | 33（不変） |

**否定された理由**:

1. 直交ルーティングは **cross-hub 交差（28/33）を対象にしない**。残る 6（interleave）も、ハブが infra 段の直上にあり external が infra 段の直下にあるため、external エッジは必ず infra 帯を縦断する → 直交化しても交差が帯の中に移るだけ。
2. cross-hub 交差は **2 ハブが広く散ったターゲットを共有する bipartite 構造に内在**。ターゲット集合が laminar（入れ子/disjoint）でない限りノード順序では消せない。barycenter モデルでも 33→33。

→ **この topology で自動的に交差を消すのは費用対効果が悪い／一部は原理的に不可能**。Issue の acceptance signal「33 を半減」は自動ルーティングでは満たせない。

## 制約・前提

- ノード配置（tier・行）は [#1724] のレイアウトを壊さない。
- 既存のエッジ styling（[ADR-20260429-01] の直交 skip ルーティングや tag selector）を退行させない。
- scope 外: 自動交差削減（PoC で否定）、ノード再配置の wrap/grid（[#1737]/[#1744]）。

## 方針転換 — 「消す」のではなく「追える」ようにする

交差を消すのではなく、密な束の中で**個々の関係を作者が見分けられる**手段を提供する。Issue 本文の「Authoring-side mitigations」を正式な方針に格上げする。

### 現状で使える手段（エンジン変更不要）

| 手段 | selector / 構文 | 効果 |
| --- | --- | --- |
| 非同期/タグで区別 | `edge[async]` / `edge[<tag>]` | sync/async・種別を色や破線で分離 |
| 個別エッジの強調 | `edge#A->B` / `edge#PlaceOrder->Db.Table`（合成エッジも可） | 特定の関係を色・太さ・ラベルで surgical に強調 |
| 方向ヒント | `direction: down/left/right` | 局所的に経路を整える |

### ギャップ（最小アフォーダンスの候補）

**source 単位の一括 selector が無い**。`hato` の「HatoApi 由来の線を 1 色、HatoMcp 由来を別色」という最も効く色分けが、今は `edge#HatoApi->X` を**ターゲット数だけ列挙**しないと書けない（ハブは 9〜10 本）。これが cross-hub 交差を「追える」化する鍵なのに、表現コストが高い。

→ 提案: **source/target ベースのエッジ selector**（例 `edge[from=HatoApi]` / `edge[to=D1]`）。1 ルールでハブの fan-out 全体を着色でき、cross-hub の束を見分けられる。specificity は tag selector 相当で設計。

## 検討した選択肢（方針転換後）

### 案1: ドキュメント/ガイドのみ（既存手段の how-to）

`docs/guide/` に「密な fan-out を読みやすくする」how-to（async/tag 着色・個別強調）を追加。examples も用意。

**メリット**: エンジン変更ゼロ・即時。
**デメリット**: 最も効く color-by-source が `edge#A->B` の列挙でしか書けず、ハブで非現実的。片手落ち。

### 案2: source/target selector の最小追加 ＋ ガイド（推奨）

`edge[from=X]` / `edge[to=X]` selector を追加し、ガイドで color-by-source を案内。

**メリット**: cross-hub の束を 1 ルールで色分け = 「追える」化の本命。小さく composable。
**デメリット**: parser/style-resolver/spec/TPL に変更（小規模）。

### 案3: 自動ルーティング（直交トランク等）

**PoC で否定**（上表）。再検討しない。

## 現時点の方針

**案2 を推奨** — 自動で交差を消せない以上、「色で束を見分ける」のが現実解で、その本命 color-by-source には source selector が要る。案1 単独は本命が書けず片手落ち。案3 は無効。

> ただし案2 はエンジン拡張なので、**まず案1（ガイド）だけで v1 とし、source selector は別 Issue**という段階分けも可。スコープはレビューで決める（下記「未解決の問い」）。

### 実装の指針（案2 を採る場合）

1. selector 文法: `edge[from=<id>]` / `edge[to=<id>]` を `.krs.style` parser に追加。`<id>` はノード id（dot 記法の合成エッジ端点も許容）。
2. style-resolver: `edgeSelectorMatches` に from/to マッチを追加。specificity は `edge[tag]` 相当（score 11）。
3. spec: `docs/spec/style.md` の selector 表に追記。**spec 改訂なので proactive TPL を 1 件同梱**（CLAUDE.md 規約）。
4. ガイド + examples: `hato` 風モデルで color-by-source を示す。
5. AT: source selector で複数エッジが一括着色されること。
6. ADR 昇格: 完了後、「自動交差削減は採らず作者側ナビゲーションで対応」という決定を ADR 化（[ADR-20260429-01] の限界も明記）。

### 影響範囲・マイグレーション

- 既存 `.krs` / `.krs.style` 影響なし（純粋な追加）。
- ドキュメント: `docs/spec/style.md`、`docs/guide/`。

## 未解決の問い

- **スコープ**: 案2（source selector）まで本 Issue でやるか、案1（ガイド）を v1 にして selector を別 Issue に切るか。
- **selector 文法**: `edge[from=X]` か `edge.from#X` か（既存 `edge#A->B` との一貫性）。
- cross-hub 交差の一部が原理的に不可避である点を、ロードマップ（Syntax v1.0 readiness）に「非目標」として記録するか。
