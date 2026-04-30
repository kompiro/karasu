---
id: ADR-20260429-06
title: "`karasu diff` CLI と diff SVG の self-contained スタイル化"
status: accepted
date: 2026-04-29
topic: cli
related_to: [ADR-20260420-02, ADR-20260422-06, ADR-20260422-07, ADR-20260427-03, ADR-20260430-02]
assumptions:
  - "file: packages/cli/src/diff.ts"
  - "file: packages/core/src/diff/diff-style.ts"
  - "symbol: packages/cli/src/diff.ts :: diff"
  - "symbol: packages/core/src/diff/diff-style.ts :: injectDiffStyle"
---

# ADR-20260429-06: `karasu diff` CLI と diff SVG の self-contained スタイル化

- **日付**: 2026-04-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1020](https://github.com/kompiro/karasu/issues/1020) — Add `karasu diff` CLI command for git-driver use
  - 実装 PR [#1022](https://github.com/kompiro/karasu/pull/1022)
  - Follow-up Issue [#1025](https://github.com/kompiro/karasu/issues/1025) — bundled all-views diff
  - 関連 ADR: [ADR-20260420-02](./20260420-02-graphical-diff-viewer.md)（graphical diff viewer）, [ADR-20260422-06](./20260422-06-diff-paste-input-ui.md), [ADR-20260422-07](./20260422-07-opfs-snapshot-diff-source.md), [ADR-20260427-03](./20260427-03-diff-open-file-as-entry.md)
  - 設計経緯: 旧 Design Doc は本 ADR で置き換え

## 背景

karasu には既に in-app graphical diff viewer（[ADR-20260420-02](./20260420-02-graphical-diff-viewer.md)）と、`data-diff-state="added | removed | changed | unchanged"` を SVG ノード/エッジに付与する rendering primitive がある。入力経路も paste（[ADR-20260422-06](./20260422-06-diff-paste-input-ui.md)）と OPFS snapshot（[ADR-20260422-07](./20260422-07-opfs-snapshot-diff-source.md)）が整備されている。

しかし **CLI 入口が無かった** ため、PR review で `.krs` の構造的変更を視覚的に確認するにはアプリを起動して 2 リビジョンを paste する必要があり、ワークフローが断絶していた。CLI から呼べれば `git diff` driver / `git difftool` 経由で **コードレビュー画面に直接グラフィカル diff を出せる**。

実装中に追加で発覚した問題: 視覚的な色づけ（赤/緑/橙のフレーム）の CSS は `packages/app/src/styles/app.css` の `.preview-pane svg [data-diff-state="..."]` にスコープされていた。CLI で吐いた SVG をブラウザで開いても、その DOM ツリーは `.preview-pane` 配下ではないため CSS が当たらず、属性は出ているのに見た目は通常レンダリングと変わらないという挙動になっていた。

## 決定

1. **`karasu diff <before> <after>` サブコマンドを追加**（`packages/cli/src/diff.ts`）。既存の `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` をそのまま呼び、独自の diff レンダラーは作らない。
2. どちらの位置引数も `-` で stdin から読める。stdin 側は対側のディレクトリに `mkdtemp` で `.karasu-diff-XXXXXX/` を作って `before.krs` / `after.krs` の名前で書き出し、relative `@import` を対側のプロジェクトルートから resolve できるようにする。tempfile は `finally` で削除。
3. `--view system | deploy | org`（既定: `system`）、`-o, --output <path>` を提供。help text に git external-diff / `git difftool` の設定例を載せる。
4. **diff SVG に self-contained な `<style>` ブロックを埋め込む**（`packages/core/src/diff/diff-style.ts:injectDiffStyle`）。app の `.preview-pane` スコープを外した CSS を SVG 直下に注入し、CLI / git driver / README 埋め込みなどアプリ外でも視覚が成立するようにする。冪等（マーカーコメント `karasu-diff-style` で二重注入を防ぐ）。

## 理由

- **既存 API の薄いラッパーに留めることで in-app 経路と CLI 経路が完全に同じ rendering pipeline を共有する**。差分レンダリングの drift を構造的に排除できる。
- **stdin shim が `git external-diff` の慣習に乗る**: `GIT_EXTERNAL_DIFF=...` 経由で `karasu diff "$2" "$5"` のように呼ぶ運用がそのまま動く。
- **対側のディレクトリに tempfile を置く設計**: stdin 側 `.krs` の relative `@import` を共通のプロジェクトルートから解決できる。OS tempdir に置くと import 解決が壊れるためトレードオフにならない。
- **diff SVG の self-contained 化**: `data-diff-state` 属性だけ出して CSS をアプリに任せる設計は in-app 専用の前提だった。CLI 出力は単独で見られる必要があり、属性 + 自前のスタイルの 2 段構成が正しい。`<style>` ブロックは SVG 標準の機構なので、ブラウザ・GitHub PR diff・README 等どこでも当たる。
- **idempotent な注入**: 既に in-app で開かれて再 export される経路があっても二重で `<style>` が増えない。

## 却下した案

### 案 A: CLI 専用に AST diff + 独自 SVG レンダラーを新設
既にアプリ側で diff レンダリングが完成しており同じ機能を 2 経路持つことになる。drift する。`compileSystemDiff` 等の既存 API は `FileSystemProvider` 経由なので CLI から自然に呼べるため新設の理由が無い。

### 案 C: 全 view を 1 SVG に bundle する diff
core 側に bundled diff 関数（`buildAllViewsSvgDiffProject` 相当）が無く scope 拡大になる。git driver / textconv は 1 ファイル単位の SVG が扱いやすい。**follow-up Issue [#1025](https://github.com/kompiro/karasu/issues/1025) に切り出した**。

### 案 D: `textconv` だけで済ませる
`[diff "krs"] textconv = karasu render` で済ますと、結果は **2 つの SVG のテキスト diff**。座標が変わると全行差分扱いになり実用にならない。help text には textconv も示すが、第一推奨は `GIT_EXTERNAL_DIFF` 経由とした。

### 案 E: SVG ではなく app.css をリンクで参照させる
`<link rel="stylesheet">` 等で外部 CSS を参照する案。CLI 出力が外部リソースに依存するのは脆い（オフライン環境、GitHub の SVG sandbox など）。self-contained 化を選ぶ。

## 影響範囲

| 領域 | 影響 |
|---|---|
| `packages/cli/src/diff.ts`（新規） | `diff(before, after, options)` 関数 + stdin shim |
| `packages/cli/src/index.ts` | `karasu diff` コマンド登録 + help text |
| `packages/cli/src/diff.{test,e2e.test}.ts`（新規） | 11 件のテスト |
| `packages/core/src/diff/diff-style.ts`（新規） | self-contained CSS + `injectDiffStyle()` |
| `packages/core/src/index.ts` | `compile*Diff` の戻り値 SVG に `injectDiffStyle()` を通す |
| `docs/acceptance/1020-karasu-diff-cli.md`（新規） | AT 記録 |
| in-app diff viewer | 機能変更なし。SVG 内の `<style>` は app.css の `.preview-pane` スコープ + `!important` ルールが上書きするので競合しない |
| 既存 `karasu render` 等 | 変更なし |

## 未対応として確定した論点

- **tempfile leak on SIGKILL**: 通常パスでは `finally` で `.karasu-diff-XXXXXX/` を削除するが、`SIGKILL` で強制終了された場合のみ leak する。Node の `exit` イベントは SIGKILL では発火しないので捕捉手段が無い。OS tempdir に作る案は stdin 側 `@import` の解決を壊す。起動時 cleanup は並列実行のレースが煩雑で割に合わない。実害は隠しディレクトリが 1 つ残る程度なので明示的に未対応とする。実害が観測されたら `karasu cleanup` 相当のサブコマンドで対応する判断にする。

## フォローアップ

- ~~[#1025](https://github.com/kompiro/karasu/issues/1025) — bundled all-views diff（CLI 既定で 3 view を 1 SVG に束ねる）~~ — landed in [ADR-20260430-02](./20260430-02-bundled-all-views-diff.md)（PR [#1048](https://github.com/kompiro/karasu/pull/1048)）
