# Auto-layout: pull infra/external nodes up to the row of their deepest consumer

- **日付**: 2026-04-29
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#966](https://github.com/kompiro/karasu/issues/966) — Auto-layout: actors that bypass intermediate clients render with crossing edges
  - Issue: [#974](https://github.com/kompiro/karasu/issues/974) — D. place infra / external nodes adjacent to the row of their deepest consumer
  - 兄弟 Issue: [#967](https://github.com/kompiro/karasu/issues/967)（A. actor row by target — 実装済み）, [#968](https://github.com/kompiro/karasu/issues/968)（B. edge routing）, [#969](https://github.com/kompiro/karasu/issues/969)（C. presentation-only layout hints）
  - 姉妹 Design Doc: `docs/design/auto-layout-actor-row-by-target.md`（A の設計）
  - PR: [#992](https://github.com/kompiro/karasu/pull/992)

## 背景・課題

karasu の system-view は `systemTier()` でノードの `kind` を 0..3 のティアに割り当てる:

- 0: `user`
- 1: `client`
- 2: `service`（内部）
- 3: `database` / `queue` / `storage` / `[external]`（dep ティア）

`assignForcedSystemLayers()` は dep ティアを常に最下段に置く。これは「内部のサービスが下にあるインフラに依存する」という C4 風の慣習に沿っており、多くの図で正しい。

しかし、**深いサービスチェーン**を持つシステムでは問題が起きる。例えば `A → B → C` という三段のサービスチェーンがあり、`Cache` を `A` だけが使う場合:

```
[A]  ─→ [Cache]                   ← A は internal の row 0
 ↓
[B]                               ← internal の row 1
 ↓
[C]                               ← internal の row 2
                                  ← Cache は dep ティア = row 3 に強制配置
```

`Cache` は `A` の隣に置いた方が読みやすいのに、グローバルな最下段に押し下げられ、`A → Cache` のエッジが `B` と `C` を貫通する。これは A（Issue #967）が `user` の最上段固定で起こしていた問題の **下端側のミラーケース**である。

## 制約・前提

- `.krs` の語彙・構文は変えない（純粋にレンダリング層の改善）
- `.krs.style` にも新プロパティは足さない（C は別 Issue [#969](https://github.com/kompiro/karasu/issues/969)）
- 既存の「dep は下に置く」慣習は壊さない — incoming edge を持たない infra/external はこれまで通り dep ティア最下段に残す
- 後方互換: 既存の図が悪化しないこと（**downward-safe**: 引き上げのみ、押し下げはしない）
- A（[#967](https://github.com/kompiro/karasu/issues/967)）の post-pass が既に存在し、symmetric な mirror として実装できる

## 決定

`assignForcedSystemLayers()` の最終段（A の post-pass の直後）に **dep 引き上げ post-pass** を追加する:

- 各 dep ノード `d`（tier 3）について、`d` への incoming edge の発生元 `s` の layer を集める。
- それらの**最大値**を `maxSourceLayer` とする。
- `d` の layer を `maxSourceLayer + 1` に**引き上げる**（押し下げはしない）。
- incoming edge を持たない dep は変更しない（既存挙動: dep ティア最下段）。
- 処理順序: 現在 layer の昇順 — 上流の dep が先に引き上げられた結果が、下流の dep の `maxSourceLayer` に伝播する。

```ts
const depsAscending = byTier[3]
  .slice()
  .sort((a, b) => (layers.get(a.id) ?? 0) - (layers.get(b.id) ?? 0));
for (const d of depsAscending) {
  const sources = inByDep.get(d.id);
  if (!sources || sources.length === 0) continue;
  const maxSourceLayer = max(sources.map((s) => layers.get(s)));
  const desired = maxSourceLayer + 1;
  if (desired < current) layers.set(d.id, desired);
}
```

### 効果（深いサービスチェーン例）

```
A(0) → Cache         A(0) ─→ Cache(1)  ← Cache が A の真下に上がる
A(0) → B(1)          A(0)
B(1) → C(2)           ↓
                     B(1)
                      ↓
                     C(2)
```

- `Cache` は `max(A.layer) + 1 = 1` に上がり、`B` と同じ row になる。
- `A → Cache` のエッジは `B`/`C` を貫通しない。

### 共有 dep の挙動

複数の consumer が異なる row から同じ dep を参照する場合、`max(sourceLayer) + 1` は **最も深い consumer の真下** に配置する:

```
A(0), B(1) → Cache    →  Cache.layer = max(0, 1) + 1 = 2
B(1) → C(2)
```

これは曖昧さがなく、最深 consumer に最も近い row になる。Issue #974 本文では「consumer が大きく離れている場合は最下段の方が読みやすいかも」という懸念があるが、本設計では**ヒューリスティクスを足さず、まず単純な max + 1 で行く**。実例で破綻したら次フェーズで対応する。

## 理由

1. **A の symmetric な mirror**: 既に `assignForcedSystemLayers()` には actor の引き下げ post-pass がある。同じ場所に dep の引き上げ post-pass を足すだけで、コードの意図と構造の整合性が保たれる。
2. **モデル側に手を入れずに済む**: ユーザーは `.krs` を書き換える必要がない。既存ファイルが自動的に綺麗にレンダリングされる（A と同じ哲学）。
3. **downward-safe**: `desired < current` ガードにより、現在より下にしか動かない。incoming edge のない dep は完全に従来通り。「全 infra が最下段に並ぶ」という既存の見た目を壊さない。
4. **発展性**: B（エッジルーティング, [#968](https://github.com/kompiro/karasu/issues/968)）と直交。D で多くのケースを解消し、残りは B のオルソゴナルルーティングで救う三段構えになる。

## 却下した案

### 案 D1: 最下段固定のまま、エッジルーティングだけで救う（B に統合）

- D を実装せず、B（[#968](https://github.com/kompiro/karasu/issues/968)）のエッジ回避ルーティングだけで貫通を解決する。
- 却下理由: エッジが card を避けて遠回りすると、長いエッジは図全体の縦幅を増やし、視認性も落ちる。「論理的に近いものは物理的にも近くに置く」原則に反する。B はあくまで補完であって主役にはできない。

### 案 D2: consumer が散らばる場合は最下段に戻すヒューリスティクス

- 例: 「max consumer row と min consumer row の差が N 以上なら最下段に戻す」。
- 却下理由: 閾値 N の根拠がない。最初は単純な max + 1 で出して、実例で破綻したら追加検討する。早すぎる最適化を避ける。

### 案 D3: dep ティアの placement を topo sort に任せる（ティア構造を緩める）

- `database` / `queue` / `storage` / `[external]` をティア固定から外し、純粋に topo で配置する。
- 却下理由: 多くの図では「infra は下」が正しい。一律 topo にすると、incoming edge のない infra（参考データベースなど）が思わぬ場所に飛ぶ。既存ティア構造の安定性を保ちつつ、必要な dep だけを動かす方が surprise が小さい。

### 案 D4: max(sourceLayer) + 1 ではなく min(sourceLayer) + 1 を使う

- 「最も浅い consumer の真下」に置く案。
- 却下理由: 共有 dep の場合、最も浅い consumer の真下に置くと、深い consumer からのエッジが他の row を貫通する。同じ問題を逆向きに作るだけ。max を使えば全 consumer のエッジは下方向（または同 row）に流れ、貫通しない。

## 影響範囲

| 領域                              | 影響                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `packages/core/src/renderer/layout.ts` | `assignForcedSystemLayers()` に dep 引き上げ post-pass を追加（A の post-pass の直後） |
| `packages/core/src/renderer/layout.test.ts` | 新規テスト 4 件追加（pull-up / orphan stays / shared dep / downward-safe） |
| `.krs` / `.krs.style` 構文        | 変更なし                                               |
| 既存の図                          | incoming edge のない dep は完全に同じ。incoming edge を持つ dep は consumer が dep ティアより上にいれば引き上げられる。consumer が dep ティアと同じか下なら変化なし |

## 検証

- 既存 layout テスト + 新規 4 件すべて通過（40/40）
- 全テストスイート 1060 件通過
- 視覚的検証は Preview デプロイ（PR [#992](https://github.com/kompiro/karasu/pull/992)）で `examples/ec-platform/` 等を目視確認

## 親 Issue #966 における位置づけ

| サブ案 | Issue | 状態 | カバー範囲 |
| --- | --- | --- | --- |
| A. Actor row by target | [#967](https://github.com/kompiro/karasu/issues/967) | 実装済み | 上端: `user` の引き下げ |
| B. Orthogonal edge routing | [#968](https://github.com/kompiro/karasu/issues/968) | 設計中 | 残るエッジ貫通の救済 |
| C. Presentation-only layout hints | [#969](https://github.com/kompiro/karasu/issues/969) | 未着手 | 自動で解けないケースの逃げ道 |
| **D. Infra/external by consumer** | **[#974](https://github.com/kompiro/karasu/issues/974)** | **本ドキュメント** | **下端: dep の引き上げ** |

A と D が上下対称に「ティア固定で生じる貫通」を解消し、B が残った長いエッジを物理的に避け、C で自動解決できないものを style hint で逃がす — この四段構えで親 Issue #966 のスコープを閉じる想定。
