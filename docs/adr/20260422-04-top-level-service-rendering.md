---
id: ADR-20260422-04
title: トップレベル service / domain を `(Unassigned)` 擬似システムで描画する
status: accepted
date: 2026-04-22
topic: renderer
depends_on:
  - ADR-20260409-06
related_to:
  - ADR-20260422-05
scope:
  packages:
    - core
  domains:
    - rendering
    - resolver
assumptions:
  - "file: packages/core/src/view/unassigned-system.ts"
  - "grep: packages/core/src/view/unassigned-system.ts :: synthesizeUnassignedSystem"
---

# ADR-20260422-04: トップレベル service / domain を `(Unassigned)` 擬似システムで描画する

- **日付**: 2026-04-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #681, PR #682 (Design Doc), PR #695 (実装)
  - AT-0040 (`docs/acceptance/0040-top-level-domain.md`), AT-0057 (`docs/acceptance/0057-top-level-service.md`)
  - ADR-20260409-06 (`20260409-06-named-import-toplevel-service.md`) — マルチファイル import 後に残る top-level service
  - Design Doc: `docs/design/top-level-service-rendering.md`（本 ADR で削除）
  - `packages/core/src/view/unassigned-system.ts`（新規）
  - `packages/core/src/view/view-extract.ts`, `packages/core/src/renderer/drill-down-svg.ts`
  - `packages/core/src/resolver/warnings.ts`

## 背景

karasu のパーサーは `service` / `domain` を `system` ブロックの外（top-level）に書くことを文法上受理し、`file.services` / `file.domains` に格納する。しかし次の 2 つの未配線ケースが残っていた:

1. **top-level `service` がレンダラーから完全に無視される**。`drill-down-svg.ts` / `all-layers-svg.ts` は `krsFile.services` を読んでおらず、警告も出ない。
2. **`systems.length === 0` の場合、top-level domain すら描画されない**。`view-extract.ts` の早期 return により空スライスが返り、「No diagram」状態になる。

ADR-20260409-06 はマルチファイル import 後に top-level service が `mergedFile.services` に残る運用を定めたが、**どう描画するか** は未定義だった。Issue #681（`service ECommerce { usecase ManageOrders {} }` だけを書いても何も表示されない）がこの穴に該当する。

## 決定

**`withUnassignedSystem()` ヘルパーで top-level `service` / `domain` を `__unassigned__` という仮想 system（ラベル `(Unassigned)`）に包んでレンダリングパスに乗せる。**

- 新モジュール `packages/core/src/view/unassigned-system.ts` に純関数ヘルパーを配置。`compileProject` / `compile` / drill-down / all-layers の各経路で、実システムのリストに擬似 system を合成してから既存パイプラインに渡す。
- `extractView` シグネチャは変更せず、`withUnassignedSystem` 経由で「1 つ以上 system がある状態」に正規化する。これにより drill-down / all-layers / all-views の各レンダラーは orphan ノード専用分岐を持たない。
- drill-down は擬似 system 配下の service / domain も通常 system と同じく辿れる。`buildNodePathIndex` と collectDrillDownLevelsGeneric が自動的にカバーする。
- ID 衝突は parser の既存挙動（重複は別 ID 扱い）を尊重する。擬似 system の ID は `__unassigned__` で予約し、ユーザー側で衝突しない前提とする。
- `resolver/warnings.ts` に `detectUnassignedServices` を追加（既存 `detectUnassignedDomains` と対称）。
- AT-0057 を新設し、TC-1〜TC-3（system + top-level service の peer 表示 / 警告表示 / 0-system ファイルの描画）を e2e で自動化する。

## 理由

- **擬似 system 方式でレンダラー側の分岐がゼロ**。drill-down / all-layers / all-views / ID 解決 / スタイル解決がすべて既存パスで動き、`containerNode: null` 案（設計初期案）のように「タイトルを出さない」特殊分岐を足す必要がない。
- **「どこに所属していないか」をユーザーに明示**。`(Unassigned)` フレームを出すことで編集者が「この service はまだ system に入っていない」と一目で気付ける。AT-0040 / AT-0057 の期待ビジュアルを統一できる。
- **マルチファイル運用と整合**（ADR-20260409-06）。import で残った top-level service も同じ経路で描画される。
- **API 変更が閉じる**。`withUnassignedSystem` は KrsFile → KrsFile の純関数であり、`extractView` / `layout` / renderer のシグネチャを触らない。
- **後続の拡張余地**。infra ノード（database / queue / storage）にも同ヘルパーで拡張できる（→ ADR-20260422-05）。

## 却下した案

### 案 A: `containerNode: null` で peer ノードを並べる（Design Doc 初期案）

`systems.length === 0` 時にタイトルを出さずノードだけを並べる。実装差分は最小だが、「何の図か分からない」状態になり、後から `(Unassigned)` ラベルを描きたくなったら結局合成が必要。Design Doc 後のレビューで、ユーザーへの文脈フィードバックが弱すぎると判断して擬似 system 方式に切り替えた。

### 案 C: 0-system をエラーにする

ADR-20260409-06 のマルチファイル運用と矛盾し、ユーザー要望に応えない。

### 案 E-2 / E-3: `extractView` のシグネチャ変更（オプションオブジェクト / KrsFile 直接渡し）

API 設計として魅力的だが、本件のスコープを越える。`withUnassignedSystem` アプローチにより必要性自体が消失した。

## 実装への影響

1. **新規** `packages/core/src/view/unassigned-system.ts` — `synthesizeUnassignedSystem(file)` / `withUnassignedSystem(file)` を提供。
2. **更新** `compile` / `compileProject` / `drill-down-svg.ts` / `all-layers-svg.ts` — 入力段階で `withUnassignedSystem` を通す。
3. **更新** `resolver/warnings.ts` — `detectUnassignedServices` 追加、`unassigned-service` warning kind を `types/warnings.ts` に追加。
4. **テスト** — `view-extract.test.ts`, `unassigned-system.test.ts`, `warnings.test.ts`, `drill-down-svg.test.ts`, `layout.test.ts` に 0-system + top-level service のケースを追加。
5. **AT** — `docs/acceptance/0057-top-level-service.md` 新設 + `packages/e2e/tests/at-0057-top-level-service.spec.ts` で TC-1〜TC-3 を自動化。AT-0040 の期待ビジュアルも `(Unassigned)` フレーム前提に更新。
