---
id: ADR-20260427-03
title: "プレビューのエントリは「開いている .krs ファイル」"
status: accepted
date: 2026-04-27
topic: app-ui
related_to:
  - ADR-20260420-02
  - ADR-20260422-06
  - ADR-20260422-07
  - ADR-20260330-04
scope:
  concerns: []
---

# ADR-20260427-03: プレビューのエントリは「開いている .krs ファイル」

- **日付**: 2026-04-27
- **ステータス**: 決定済み
- **関連**:
  - Issue #811 — diff viewer: make the open file the comparison root
  - Issue #765 — 親 Issue（part A は #800 で shipped）
  - PR #824 — Design Doc
  - PR #825 — 実装
  - ADR-20260420-02 — graphical diff viewer
  - ADR-20260422-06 — diff paste-input UI
  - ADR-20260422-07 — OPFS snapshot diff source
  - ADR-20260330-04 — permanent link（URL ハッシュ仕様の前身）
  - 設計過程: [docs/design/diff-open-file-as-entry.md](../design/diff-open-file-as-entry.md)

## 背景

karasu のプレビュー（通常モード・diff モード）はプロジェクトの `index.krs` を
エントリとして固定していた。これがメンタルモデルとズレる場面があった:

- エディタで `before.krs` を開いてもプレビューは `index.krs` ルートのまま変わ
  らない。「今編集しているファイル」と「見ている図」が食い違う。
- diff モードでは after-side が `index.krs` 固定のため、「バージョン A にいて
  B の姿を確認したい」という比較ができない。
- `index.krs` から `@import` していない単独の `.krs` を編集中、内容を確認
  する手段がない（独立した壁打ちや、後から統合するワークフローが成立しない）。

コア (`compileProject`, `compileSystemDiff`, `extractView`, `ImportResolver`)
は最初からエントリパスに依存しない設計で、`index.krs` 前提はアプリ層
（`ProjectModeApp.tsx`）にのみ残っていた。

## 決定

**Project モードのプレビューエントリを「最後に開いた `.krs` ファイル」に変更する。
`index.krs` は「プロジェクトを最初に開いたときのデフォルト」として位置づけ直す。**
ファイル選択はブラウザ履歴（戻る/進む）と URL ハッシュに連動させる。

具体的な仕様:

1. **`lastKrsFilePath` セッション state を導入** — `currentFilePath` が `.krs`
   に切り替わったときだけ更新する。`.krs.style` / `.md` などの非 `.krs`
   ファイルを開いても `lastKrsFilePath` は保持されるので、スタイル編集中も
   直前の図がプレビューに残る。プロジェクト切替で null にリセット。
2. **エントリ算出** — `entryPath = lastKrsFilePath ?? ${rootPath}/index.krs`。
3. **diff の after-side 問題は副次的に解決** — diff パイプラインは既に
   `entryPath` を after として使うため、開いている `.krs` を切り替えれば
   after-side も切り替わる。Swap ボタン (#765 part A) は引き続き有用
   （ファイルを変えずに方向を反転させる手段）。
4. **URL ハッシュにファイルを含める** — hash を
   `#krs-<view>-<nodeId>:<highlight>?file=<encodedPath>` に拡張。`?file=`
   は `URLSearchParams` で解析、パス区切り `/` は `encodeURIComponent` で保護。
5. **戻る/進むでファイル選択を復元** — `useHistoryNavigation` に
   `onFileChange` コールバック (= `selectFile`) を追加。Project モードのみ
   渡す。Serve / Memory モードは単一ファイル前提なので渡さない。
6. **プロジェクト切替時の forward stack 温存** — `SET_CURRENT_PROJECT` reducer
   は `currentFilePath` を一旦 null にし、`useProjectInitialization` が
   `index.krs` を再選択する二段階で動く。エフェクト③が毎回 pushState すると
   余分な履歴が積まれて forward stack が消えるため、`currentFilePath` の
   遷移パターンに応じて分岐する:
   - `non-null → null`（切替の中間状態）: skip
   - `null → non-null`（マウント直後・プロジェクト切替後の初期ロード）:
     `replaceState`
   - `non-null → non-null`（ユーザーのファイル切替）: `pushState`

## 理由

- **メンタルモデル一致**: 「今開いているファイル = ルート」が最も自然。
  `index.krs` の特別扱いをやめることで、別名エントリ (`main.krs` 等) を持つ
  プロジェクトでも素直に動く。
- **コア API は無変更で済む**: コアはエントリ非依存。アプリ層の 1 行
  （`ProjectModeApp.tsx` の `entryPath` 計算）と `lastKrsFilePath` state、
  そして URL/history 連動分のみで実現できた。
- **diff の独立した拡張が不要**: after-side の差し替えは entry を変えるだけで
  済むので、diff モード専用のフラグ・分岐を増やす必要がない。
- **新しい価値を提供**: 単独の `.krs` を編集中でも図が見えるため、`index.krs`
  に統合する前の壁打ち / 切り出し / 段階的統合のワークフローが成立する。
- **履歴連動が UX 完成に必要**: エントリが開いているファイルに連動する以上、
  ファイル切替は意味のある履歴イベントになる。戻る/進むで復元できないと
  リグレッションとして観測される。

## 却下した案

- **案2: "Project view" / "File view" の UI トグル** — 既存挙動を温存できるが、
  「開いているファイル = ルート」というメンタルモデルと食い違う。トグルを
  押し忘れると期待した図にならず、診断しづらい。diff モードの after-side
  固定問題も別途フラグが必要で複雑度が増す。
- **案3: `index.krs` のときだけ全体表示** — `index.krs` という名前に特別な意味
  を持たせる仕様の歪みが生まれる。別名エントリのプロジェクトで破綻する。

## 既知の限界

- URL hash で track するのは `currentFilePath` のみ。`.krs.style` を開いた
  状態でリロードすると `lastKrsFilePath` は復元されず `index.krs` にフォール
  バックする。99% の利用は `.krs` ファイルなので許容。将来必要なら
  `&krs=<encodedPath>` の追加クエリで対応可能。
- `useHistoryNavigation` の popstate と `useProjectInitialization` の自動
  ファイル選択が同時に走る場合、両方が `selectFile` を呼んで重複読み込みが
  起き得る（最終結果は正しい）。実害が出たら別途整理する。
