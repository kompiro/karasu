# System-view: external を脇に置いてエッジ交差を減らす（directional layout）

- **日付**: 2026-06-24
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1728](https://github.com/kompiro/karasu/issues/1728)（system view のエッジが追いにくい）
  - refines: [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（infra/external ティア分割 — external の配置を最下段バンドからサイド列へ）
  - 関連 ADR: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（直交ルーティング — 本件には効かないことを PoC で確認）, [ADR-20260429-02](../adr/20260429-02-infra-row-by-deepest-consumer.md)
  - 隣接ワーク: [#1737](https://github.com/kompiro/karasu/issues/1737) / PR [#1744](https://github.com/kompiro/karasu/pull/1744)（balanced-grid ノード配置）
  - コード: `packages/core/src/renderer/layout.ts`（`assignForcedSystemLayers` / 配置 post-pass）, `style-resolver.ts`, `docs/spec/style.md`

## 背景・課題

system view で 1 サービスが多数の infra/external へ fan-out すると線が重なって追えない。`hato`（[#1724] 後）で **17 エッジ / 33 交差**。

## Phase 0 分析と PoC（探索の経緯）

`layout()` を直接 instrument し、`hato` の交差を実座標で計測した。**当初の見立ては PoC で次々に否定され**、最終的に「external をサイドに置く」配置変更が当たった。

### 交差の真の内訳

| 交差クラス | 件数 |
| --- | --- |
| 同一ハブ・同一ターゲット段（ポート順で可修正） | 0 |
| 同一ハブ・別段（infra/external interleave） | 6 |
| **別ハブ同士（HatoApi × HatoMcp × WebApp のファンアウト）** | **28** |

支配的なのは **cross-hub 交差（28/33）**。

### PoC 結果（実レンダリング計測）

| 手法 | hato 交差数 | 備考 |
| --- | --- | --- |
| baseline（最下段バンド, #1724） | **33** | viewBox 1793×1096（1.64:1） |
| 直交トランク/バス（[ADR-20260429-01] 拡張） | 33〜53 | **否定**: cross-hub を対象にせず、ハブが infra 直上のため external は infra 帯を必ず縦断。素朴トランクは悪化 |
| 同一トポロジの barycenter 再配置 | 33 | **否定**: cross-hub は 2 ハブが散ったターゲットを共有する構造に内在。縦積みのままでは消えない |
| **external をサイド列へ（service→external を水平化）** | **14** | **採用**: viewBox 2188×892（2.45:1）。−58%、実レンダリングで確認 |
| ＋service を斜めに staggered | 14〜17 | **否定**: 単独で効果なし（33）、sides に重ねても改善せず |

**結論**: 自動的に交差を「消す」ルーティングは効かない（cross-hub が支配的かつ一部は縦積みトポロジに内在）。だが **external を縦軸から外してサイドに置く**と、infra への下向き束と external への水平束が分離し、交差が **33→14** に減る。「infra は上下・external は左右」という方向分離が効いた。

> 経緯メモ: 当初ドラフトは (a)「25/33 が単一ハブ」(誤分類)、(b) 直交トランク採用、(c) 「自動では無理→作者側のみ」と二転した。いずれも PoC で否定/修正。配置トポロジ変更（external サイド化）を試すまで「内在的」と誤結論していた。

## 制約・前提

- infra・service・client・actor の配置は維持。変更は **external の配置（最下段→サイド）** とそれに伴うエッジ再アンカー。
- エッジアンカーは `computeEdgePoints` が相対位置から side を選ぶため、external を移すだけで service→external は水平アンカーに再選択される（PoC で確認）。
- 幅が増える（hato: 1793→2188）。高さは減る（1096→892）。
- scope: system view。deploy/org は対象外。

## 決定（方針）

### 1. external-on-sides をデフォルト配置にする

system view で `[external]` サービスを左右のサイド列に置く（最下段バンドではなく）。`assignForcedSystemLayers` 後の配置 post-pass で、external を左右に振り分け、service/infra の y 帯に沿って縦に配置する。[ADR-20260623-06] の「external は最下段 tier」を **refine**（外部依存はサイドの周縁に置く ＝ C4 的な外部システム配置に近い）。

### 1a. サイド振り分けは「consuming hub」基準にする（重要）

PoC で**残り交差はサイドの左右割り当てに強く依存する**ことが判明した。`hato` モデル（中心モデル計測）:

| 左右割り当て | 交差 |
| --- | --- |
| 宣言順で機械的に半々（当初 PoC、実レンダリング） | 14 |
| 機械的半々（中心モデル） | 16 |
| brute-force 最適（中心モデル） | 7 |
| **consuming-hub barycenter ヒューリスティック（実レンダリング、PoC 検証済み）** | **8** |

最適解は意味的だった — `CloudflareAccess`（WebApp / HatoMcp が consume）を右、`HatoApi` だけが使う 5 つを左。**各 external を「それを consume するハブの x 重心」で左右に振り分ける**と、別ハブの束が左右に分かれて中央の cross-hub 交差が激減する。consuming-hub ヒューリスティック（barycenter の median で左右分割、同側内は hub-x→y で整列）を実装して実レンダリングで **8 交差**を確認（brute-force 最適 7 に肉薄、機械的半々 14 から半減）。

→ デフォルトのサイド振り分けは**机械的な半々ではなく、consuming hub の barycenter（x 重心）基準**にする（PoC 検証済み）。

### 2. external のサイド（左/右）を選べる style ヒント — 既存 `column` を再利用（確定）

意味的に最適なグループ化は作者が知っている（1a の例）。サイド指定は**既存の `column: left/center/right` ヒントを再利用する**（確定）:

- `docs/spec/style.md` は既に `service[external] { column: right }` を例示している。external-on-sides 下では `column: left/right` ＝ **サイド指定**と解釈する（external は今やサイドなので `column`＝水平位置の意味と自然に一致）。
- デフォルトは 1a の consuming-hub 自動振り分け。`column: left/right` があれば**作者の指定で override**。`column: center` / 未指定はヒューリスティックに委ねる。
- 新規プロパティは追加しない。

> **`placement: bottom`（個別 external を最下段へ戻す）は v1 では入れない（後追い）**。v1 は `column` によるサイド指定のみ。「サイドではなく最下段に置きたい」という実需要が出てから別途追加する。スコープを小さく保つ。

### 3. overflow: サイドに縦積みを続ける

external が多くてサイドが詰まる場合も、上限を設けず**サイドに縦積みを続ける**（多いと縦長になる。最下段への自動フォールバックはしない）。詰まりは作者が 2 のヒントで個別に最下段へ逃がす。

### 4. 補助: source 単位のエッジ selector（案2）→ 別 Issue に分離（確定）

配置で減らせない残り交差や束の見分けには color-by-source が有効で、それには `edge[from=X]` / `edge[to=X]` selector が要る（現状 `edge#A->B` の列挙でしか書けない）。ただし**これは独立した styling 機能**なので、本 Doc / #1728 の scope からは外し**別 Issue [#1755](https://github.com/kompiro/karasu/issues/1755) に切り出す**（確定）。#1728 は external-on-sides 配置（1〜3）に集中する。

## 検討した選択肢（否定したものは PoC 節参照）

| 案 | 評価 |
| --- | --- |
| **external-on-sides（採用）** | 実レンダリングで 33→14。directional 分離で cross-hub を構造的に回避 |
| 直交トランク routing | 否定（PoC、33〜53） |
| 同一トポロジ barycenter | 否定（PoC、33） |
| staggered services | 否定（PoC、効果なし） |
| 作者側 styling のみ（旧ドラフト） | 不十分（配置で減らせるのに手作業に押し付ける） |

## 実装の指針

1. 配置 post-pass: `assignForcedSystemLayers` の結果に対し、`systemTier===4`（external service）のノードを左右サイド列へ再配置（`computeLayoutEdges` の前に行い、エッジ再アンカーを自動化）。**左右振り分けは consuming hub の barycenter 基準**（1a。機械的半々ではない）。同側内の縦順も consuming hub の y / barycenter で整える。`column` ヒントがあれば override。
2. style ヒント: `placement: bottom`（ノード selector で external 個別を最下段バンドへ）。parser/style-resolver/spec に追加。**spec 改訂なので proactive TPL を 1 件同梱**（CLAUDE.md 規約）。配置の不変条件（external は side か bottom のいずれか、actor/client/service/infra を侵さない）を検出する観点。
3. コンテナ/bbox: system コンテナをサイド列を含むよう拡張。`normalizeCoordinates` / `computeTotalDimensions` との整合。
4. テスト: `layout.test.ts` に external-on-sides 配置（左右分離・service→external が水平アンカー・個別 placement:bottom ヒント・overflow 縦積み）。[#1724] の infra/service tier テストが**無変更で通る**こと（infra/service 配置不変の回帰ガード）。
5. AT: `hato` 相当で交差数が減る（測定 AC）/ 個別ヒントで最下段に戻る。
6. （案2 を含める場合）`edge[from=X]`/`edge[to=X]` selector + ガイド。
7. ADR 昇格: 完了後 [ADR-20260623-06] を refine する ADR に。

## 影響範囲・マイグレーション

- 既存 `.krs` は変更不要だが、**system view の見た目が変わる**（external がサイドへ）。examples の system view スナップショット / guide 図を再生成。
- 幅が増える点を許容（高さは減る）。`docs/spec`・`docs/concepts` の system-view 説明に external 配置を追記。

## 決定事項（レビューで確定）

- **サイド振り分けの方針**: バランス（左右の数）より**交差最小を優先**（5L/1R のような偏りを許容）。確定。
- **サイド指定ヒント**: 既存 `column: left/right` を再利用（新規プロパティ無し）。確定。
- **`placement: bottom`（個別 external を最下段へ）**: v1 では入れない。実需要が出たら後追い。確定。
- **source selector（案2）**: 別 Issue [#1755](https://github.com/kompiro/karasu/issues/1755) に分離。#1728 は配置に集中。確定。
- **tie-break（自動振り分けの決定性）**: median 分割で `hubX == median` は左。同側内は hub-x → consuming-hub-y → 宣言順で安定ソート。複数 hub が consume する external は consuming-hub の barycenter（平均 x）。hub が同 x の場合は宣言順で安定。確定（PoC 実装と一致）。
- **幅トレードオフ**: サイド化で横長になる（hato 2323×892）点は許容（交差最小優先の帰結）。確定。

## 残る確認（実装時）

- balanced-grid（[#1737]/[#1744]）と組み合わせた時の総寸法は、両者がマージされた段階で実レンダリング確認（非ブロッキング）。
- actor/client もサイド周縁に置く案との将来的な整合（本 Doc では out of scope）。
