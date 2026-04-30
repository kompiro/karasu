---
id: ADR-20260430-02
title: "`karasu diff` の bundled all-views 出力"
status: accepted
date: 2026-04-30
topic: cli
related_to: [ADR-20260429-06, ADR-20260420-02]
assumptions:
  - "file: packages/core/src/index.ts"
  - "file: packages/core/src/renderer/drill-down-svg.ts"
  - "file: packages/cli/src/diff.ts"
  - "symbol: packages/core/src/index.ts :: buildAllViewsSvgDiffProject"
  - "symbol: packages/core/src/renderer/drill-down-svg.ts :: bundleSingleLevelViews"
---

# ADR-20260430-02: `karasu diff` の bundled all-views 出力

- **日付**: 2026-04-30
- **関連**:
  - Issue [#1025](https://github.com/kompiro/karasu/issues/1025) — bundled all-views diff
  - 実装 PR [#1048](https://github.com/kompiro/karasu/pull/1048)
  - 関連 ADR: [ADR-20260429-06](./20260429-06-karasu-diff-cli.md)（`karasu diff` CLI 初版）, [ADR-20260420-02](./20260420-02-graphical-diff-viewer.md)（graphical diff viewer）

## 背景

[ADR-20260429-06](./20260429-06-karasu-diff-cli.md) で導入した `karasu diff` は `--view system | deploy | org`（既定: `system`）の単一 view 出力のみをサポートしていた。同 ADR の「却下した案 C」では bundled 出力を follow-up に切り出し、`karasu render` には既に `buildAllViewsSvgProject` という tabbed all-views 機能があるため diff 側にも対称な出力が欲しいというニーズが残っていた。

PR レビューや Issue / Design Doc 添付のように **1 ファイルで全 view の差分を見渡したい** ユースケースでは、view ごとに 3 ファイルを生成して並べるより 1 つの bundled SVG を渡す方が運用が軽い。

## 決定

1. **`buildAllViewsSvgDiffProject` を `@karasu-tools/core` に追加**。`compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` をそのまま呼び、独自の diff レンダラーは作らない（[ADR-20260429-06](./20260429-06-karasu-diff-cli.md) の方針 — in-app 経路と CLI 経路で同一の rendering pipeline を共有する — を bundled でも踏襲）。
2. **適用対象 view を事前判定して欠落タブを除外する**。`ImportResolver` で両側を 1 度解決し、`systems` / `services` / `domains`（system 用）、`deploys`（deploy 用）、`organizations.flatMap(teams)`（org 用）が **どちらか一方でも** 存在する view だけタブに含める。両側に無い view は `compile*Diff` の呼び出し自体をスキップする。
3. **`karasu diff` の既定値を bundled に変更する**。`--view` 省略時は `buildAllViewsSvgDiffProject` を呼ぶ。`--view system | deploy | org` の単一 view 経路は変更しない。後方互換は破るが、CLI として「省略時は全部見せる」のは `karasu render` と揃えた挙動。
4. **bundled 構造は `buildAllViewsSvg`（render 側）のタブ機構を再利用する**。`bundleSingleLevelViews(panes)` を `drill-down-svg.ts` に追加し、各 view の SVG を `<g class="krs-pane krs-pane--<type>">` に包んで `TAB_HEIGHT` / `renderTabBar` / `buildAllViewsCss` を共有する。CSS-only タブナビゲーション（`:target` + `:has()`）も同じ。
5. **`injectDiffStyle` は外側 SVG に 1 度だけ適用する**。各 `compile*Diff` が返す SVG にも個別に注入されているが、`extractSvgParts` で内側コンテンツに切り出した時点で内側の `<style>` も保持される。idempotent マーカー（`/* karasu-diff-style */`）により二重注入は起きない。

## 理由

- **既存 API のコンポジションに留めることで diff レンダリングの drift を構造的に排除できる**。bundled 専用の diff 計算ロジックを書かない方針は ADR-20260429-06 と同じ。
- **「両側に無い view を出さない」基準は予測可能で説明しやすい**。たとえば deploy block を持たないプロジェクトでは deploy タブが出ない一方、片側だけが deploy を持つ場合（追加 / 削除）は両側に存在するかのように tabbed に含めて差分を見せる。
- **CLI 既定の bundled 化は `karasu render` と対称になる**。両者で「省略時は全 view」「`--view` 指定で単一 view」と同じメンタルモデルになる。git external-diff の慣習でも 1 ファイル単位の SVG が扱いやすいため後方互換破りの実害は小さい。
- **`bundleSingleLevelViews` を render 側のタブ helper と同居させる**ことで、将来タブ UX を変える時（例: タブ並びの変更、空 view にメッセージを出す）に diff / non-diff の片方だけが drift する事故を避けられる。

## 却下した案

### 案 A: 単一 view を既定のまま、`--view all` を追加する

後方互換は保てるが「全 view を見たい」のがレビュー時の主用途であり、明示フラグを毎回付けさせるのは逆。`karasu render` が既に既定 bundled なので非対称になるデメリットの方が大きい。

### 案 B: 適用判定をせず常に 3 タブを描画する

実装は単純だが、deploy block を持たないプロジェクトで「No diagram」プレースホルダ付き deploy タブが描画されるなど見栄えが悪く、無関係な空タブが生まれてしまう。事前判定のコスト（resolver パス 1 回）は小さい。

### 案 C: bundled の中で resolver を 1 度しか呼ばないように `compile*Diff` を refactor する

現状は事前判定 1 回 + `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` がそれぞれ内部で resolver を呼ぶ — 同じ project を最大 4 回解決している。最適化の余地はあるが `compile*Diff` の API シグネチャを破る大改修になる。CLI 用途では 1 ファイル diff のレイテンシは十分許容範囲なので **見送り**。性能課題が観測されたら検討する。

### 案 D: bundled 出力でも `compile*Diff` の戻り値を呼び出し側に返さない（svg のみ）

API が薄くなる。しかし in-app から bundled diff を呼びたくなった時に nodeDiff / edgeDiff にアクセスできないと困るので、`views.{system,deploy,org}` に各 `*DiffCompileResult` を含めて返す形にした。

## 影響範囲

| 領域 | 影響 |
|---|---|
| `packages/core/src/index.ts` | `buildAllViewsSvgDiffProject` + `CompileBundledDiffOptions` / `BundledDiffCompileResult` を追加 |
| `packages/core/src/renderer/drill-down-svg.ts` | `bundleSingleLevelViews` を追加（既存タブ helper を再利用） |
| `packages/cli/src/diff.ts` | `view` が `undefined` の場合に bundled 経路へ分岐 |
| `packages/cli/src/index.ts` | `--view` の既定値を撤去、ヘルプテキストを更新 |
| `packages/core/src/index.test.ts` | bundled 経路のテスト 4 件追加 |
| `packages/cli/src/diff.test.ts` | CLI 既定 bundled とタブ除外のテスト 2 件追加 |
| `docs/acceptance/1025-bundled-diff.md` | AT 記録（新規） |
| `compile*Diff` 単一 view 経路 | 変更なし |
| in-app diff viewer | 変更なし（bundled は CLI 専用経路） |

## 後方互換性

`karasu diff <before> <after>` の既定出力が「system view」から「bundled all views」に変わる。CI / git external-diff スクリプトで stdout の SVG 構造に依存している場合は `--view system` を明示する必要がある。リリースノートで明記する。

## 未対応として確定した論点

- **drawio bundled diff** は範囲外（`karasu render --format drawio` は per-view 出力。drawio の bundled diff は別 follow-up）。
- **resolver の重複呼び出し** は性能課題が観測されない限り見送り（案 C 参照）。
- **in-app からの bundled diff** は当面想定しない。アプリ側はタブ UI を独自に持つため SVG 内タブと二重化する。
