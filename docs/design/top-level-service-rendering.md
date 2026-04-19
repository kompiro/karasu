# Top-level service の描画とゼロ-system 時のレンダリング

- **日付**: 2026-04-17
- **ステータス**: 検討中
- **関連**: Issue #681, [AT-0040](../acceptance/0040-top-level-domain.md), [ADR-20260409-06](../adr/20260409-06-named-import-toplevel-service.md)

## 背景・課題

karasu のパーサーは `service`/`domain` を `system` ブロックの外（top-level）に書くことを文法上は受理し、それぞれ `file.services` / `file.domains` に格納する（`packages/core/src/parser/parser.ts:163-168`）。
top-level `domain` は AT-0040 によって system の peer ノードとして描画される動作が保証されており、`view-extract.ts` の `unassignedDomains` パラメータ経由で `system.children` と並べて配置される。

一方で、

1. **top-level `service` はレンダラーから完全に無視される**。`drill-down-svg.ts` / `all-layers-svg.ts` は `krsFile.services` を読まず、`unassignedServices` 相当の配線も無い。`detectUnassignedServices` の warning も存在しない。
2. **system が 0 個の場合、unassigned domain ですら描画されない**。`view-extract.ts:536` の `if (systems.length === 0) return empty;` により、system が無いと `unassignedDomains` の有無にかかわらず empty slice が返される。

ユーザーが Issue #681 で報告した「Service / Domain が表示されない」現象は ②（top-level `service` のみのファイルで `service ECommerce { usecase ManageOrders { ... } }` を書いたが何も出ない）に該当する。`#674 (refactor layout)` の影響だと推測されていたが、実際には #674 前から存在した未配線ケースである。

ADR-20260409-06 はマルチファイル import 文脈で「stub も edge reference も無い top-level service は `mergedFile.services` にそのまま残る」という決定をしている。残ったそれらを **どう描画するか** はこの ADR では定めていないため、本設計ドキュメントで補完する。

## 制約・前提

- 既存 AT-0040（top-level domain は system と peer 配置）と矛盾しない振る舞いとする。
- パーサー文法は変更しない（`file.services` / `file.domains` の構造はそのまま）。
- `extractView` は drill-down / all-layers / all-views など複数のレンダラーから呼ばれる。シグネチャ変更は影響範囲広め。
- マルチファイル import 後に残る top-level service（ADR-20260409-06 の case 3）も同じ経路で描画される必要がある。
- ゼロ-system のときの「タイトル」表示は曖昧（system 名がない）。

## 検討した選択肢

### 軸 1: 0-system 時の描画スタイル

#### 案 A: `containerNode: null` で peer ノードを並べる

ゼロ-system 時は `containerNode` を `null` にし、unassigned services / domains を `childNodes` に詰めて返す。レンダラーは `title` を出さず（既存 `svg-renderer.ts:46-49` は `containerNode` が `null` ならタイトルを出さない）、ノードだけが配置される。

- メリット
  - `view-extract.ts` の差分が小さい（早期 return を「unassigned が空のときだけ」に絞るだけ）。
  - レンダラー側の追加分岐が不要。タイトル無しは既存パスでカバー済み。
  - AT-0040 の振る舞い（system タイトル + peer 配置）と地続き。1-system 時に system が「title 表示」、0-system 時に「title 無し」と段階的に縮退する。
- デメリット
  - 図のヘッダ的な情報が消えるため、ファイル名や `// comment` で文脈を補わないと「何の図か」が分かりにくい。
  - 後から「unassigned 領域」のラベルを描きたくなったら結局合成が必要。

#### 案 B: 暗黙の "Unassigned" pseudo-system を合成

`view-extract.ts`（または compile 直前のレイヤ）で `system __unassigned__ { label: "(Unassigned)", children: [...] }` のような仮想 system を組み立て、既存パスを再利用する。

- メリット
  - レンダリング経路が完全に既存の system 1 個ケースと同じ。テストカバレッジを共有できる。
  - 「unassigned 領域」というラベルが図に出るため、編集者へのフィードバックが強い。
- デメリット
  - 合成された system が `file.systems` のあちこち（warnings, owner index, style resolver, drill-down ID など）に漏れて副作用を生みやすい。
  - 合成の所有者（parser / compile / view-extract のどこでやるか）の決定が追加で必要。
  - 仮想 ID `__unassigned__` のスタイル指定や namespace 衝突を考慮しないといけない。

#### 案 C: 0-system 時はエラーにする

`systems.length === 0` のとき compile 時にエラー扱いし、unassigned のみのファイルは「No diagram」のまま据え置く。

- メリット
  - 実装変更が最小（warning と top-level service レンダリングだけ追加）。
- デメリット
  - ADR-20260409-06 の case 3 と整合しない（マルチファイル分割で意図的に top-level service を書く運用と衝突）。
  - top-level domain は今でも描画されない（システムが 1 個以上必要）という現状の制限を温存することになり、ユーザー要望に応えていない。

### 軸 2: drill-down 対応の範囲

#### 案 D-1: top-level service にも drill-down する

`extractView(systems, [serviceId, ...])` が orphan service を `path[0]` として解決できるようにする。`unassignedDomains` で既に `path[0]` が orphan domain にフォールバックする実装（`view-extract.ts:592-606`）があるので、その分岐に service ケースを追加する形。

- メリット
  - top-level service 配下の `usecase`/`domain` を drill-down で見られる。Issue #681 の repro（`service ECommerce { usecase ManageOrders { ... } }`）が完結して機能する。
  - `buildDrillDownSvg` が既存の collectDrillDownLevelsGeneric にそのまま乗る。
- デメリット
  - 経路が増える分のテスト追加が必要（path が unassigned service 起点のケース）。
  - ID 衝突: 同じ `id` を持つ service が `system.children` 内と top-level の両方にあった場合の優先順位を決める必要。

#### 案 D-2: drill-down 対応せず root view のみ

root view では peer ノードとして見えるが、クリックしても drill-down しない。

- メリット: 実装が最小。
- デメリット: `usecase` を持つ top-level service が repro なので、ユーザーが触れる主な情報が見えない。要件未達。

### 軸 3: `extractView` API 拡張

#### 案 E-1: 引数追加 `extractView(systems, path, unassignedDomains, unassignedServices)`

既存スタイルの素直な拡張。

- メリット: 既存呼び出しはデフォルト引数で動く。差分が読みやすい。
- デメリット: 引数がさらに増える（既に 3 個）。将来 unassigned organizations 等が増えると順番依存が辛くなる。

#### 案 E-2: オプションオブジェクト `extractView(systems, path, { unassignedDomains, unassignedServices })`

- メリット: 拡張性が高く、命名で意図が明示される。
- デメリット: 既存呼び出し全てに変更が波及する（`drill-down-svg.ts`, `all-layers-svg.ts`, `layout.test.ts` 等、複数箇所）。今回は scope 外。

#### 案 E-3: `KrsFile` を直接渡す `extractView(krsFile, path)`

- メリット: extractView がそのまま `krsFile.systems / domains / services` を読めて、呼び出し側のボイラープレート削減。
- デメリット: extractView の役割が「systems と path を slice する純関数」から「krsFile を解釈する関数」へ拡大。テストや単独利用の柔軟性が下がる。

## 比較

| 論点 | 採用候補 | 理由 |
| --- | --- | --- |
| 0-system 時の描画 | 案 A（`containerNode: null`） | レンダラーの既存パスでタイトル省略済み、差分最小、副作用小 |
| drill-down 対応 | 案 D-1（orphan service にも対応） | repro が drill-down を要求しており、ADR-20260409-06 とも整合 |
| API 拡張 | 案 E-1（引数追加） | 影響範囲が小さく、既存スタイル踏襲。E-2 への移行は将来別 PR で扱える |

## 現時点の方針

1. **`view-extract.ts`**
   - `extractView(systems, path, unassignedDomains = [], unassignedServices = [])` にシグネチャ拡張（案 E-1）。
   - root view (`path.length === 0`)
     - `systems.length > 0`: `allChildren = [...system.children, ...unassignedServices, ...unassignedDomains]`。タイトルは従来どおり system。
     - `systems.length === 0` かつ unassigned が空でない: `containerNode: null`、`childNodes = [...unassignedServices, ...unassignedDomains]`、`ancestorChain: []`（案 A）。
     - `systems.length === 0` かつ unassigned も空: 既存どおり empty を返す。
   - drill-down (`path.length > 0`)
     - 既存の `unassignedDomains` フォールバック分岐に `unassignedServices` を加える（案 D-1）。
     - 0-system のときは `system` がないので、`path[0]` を unassigned services / domains から直接探す経路を用意する。
   - ID 衝突: `system.children` 優先。同 ID の orphan があってもサイレントに後勝ちさせず、parser の既存挙動（重複は別 ID として扱われる）を尊重する。

2. **`resolver/warnings.ts`**
   - `detectUnassignedServices` を新設し、`service "X" is not assigned to any system` を返す。`detectUnassignedDomains` をミラーする。
   - `analyze()` のリストに追加。

3. **`renderer/drill-down-svg.ts` / `all-layers-svg.ts`**
   - `const unassignedServices = krsFile.services ?? [];` を追加し、`extractView(...)` に渡す。
   - 「No diagram」プレースホルダの判定は `rootSlice.childNodes.length === 0` を維持する（unassigned が無ければ自動的にこのパスへ落ちる）。

4. **`resolver/style-resolver.ts`**
   - 既存の `unassignedDomains` 引数と並列で `unassignedServices` を受け取るか確認し、必要ならスタイル解決対象に含める（最小ケースでは default style が当たれば十分）。

5. **テスト**
   - `view-extract.test.ts`: 0-system + unassigned のケース、system + top-level service の混在ケース、drill-down で orphan service に入れること。
   - `warnings.test.ts`: unassigned-service warning。
   - `drill-down-svg.test.ts`: top-level service のみで非「No diagram」が返ること。
   - `layout.test.ts`: containerNode が null のときに peer ノードが正しく配置されること。

6. **AT**
   - `docs/acceptance/0057-top-level-service.md` を新設（AT-0040 の service 版）。
     - TC-1: system + top-level service が peer 表示される
     - TC-2: `not assigned to any system` warning が出る
     - TC-3: 0-system + top-level service / domain だけのファイルが描画される
   - `packages/e2e/tests/at-0057-top-level-service.spec.ts` を追加し、TC-1 〜 TC-3 を自動化（人間確認は不要）。

## 影響範囲

- 既存 AT-0040 と矛盾しない（`unassignedDomains` の振る舞いは保つ、追加するのは `unassignedServices` の並列パス）。
- ADR-20260409-06 の case 3（マルチファイル import で残った top-level service）も同じ経路で描画されるようになる。
- 既存スナップショット系テストは差分が出ないはず（top-level service が含まれない既存サンプルのみ対象）。

## 補足: 却下理由メモ

- 案 B（pseudo-system 合成）は将来「Unassigned」というラベルを図に出したくなった時点で再検討する。今は副作用と所有権の不明確さを避けて A を選ぶ。
- 案 C はユーザー要望に応えていないので不採用。
- 案 E-2 / E-3 は API 設計として魅力的だが、本 Issue のスコープを越えるリファクタリングなので別 PR で扱う。
