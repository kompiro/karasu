# Editor バッファの外部書き込み追従

- **日付**: 2026-05-07
- **ステータス**: 検討中
- **関連 Issue**: [#1150](https://github.com/kompiro/karasu/issues/1150)（親 [#1076](https://github.com/kompiro/karasu/issues/1076) / [#1098](https://github.com/kompiro/karasu/issues/1098) / [#1144](https://github.com/kompiro/karasu/issues/1144)）
- **関連 ADR**:
  - [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール）
  - [ADR-20260506-06](../adr/20260506-06-krs-style-open-affordance.md)（`.krs.style` 直接編集時の append target）
- **関連実装**: [#1151](https://github.com/kompiro/karasu/pull/1151)（`ObservableFileSystemProvider` インフラ）
- **既存実装**:
  - `packages/app/src/fs/observable-provider.ts`（`watch(rootPath, callback)` API）
  - `packages/app/src/components/FileTree.tsx:66-71`（先行する subscriber の例）
  - `packages/app/src/components/EditorPane.tsx`（Monaco — `value` prop で controlled）
  - `packages/app/src/state/app-reducer.ts`（`fileContent` / `currentFilePath` の reducer）

## 背景

`#1149` の append flow が稼働してから、**ユーザーが `.krs.style` を編集中** に
GUI 右クリック → Direction を選ぶと:

1. `fs.writeFile()` で `.krs.style` 末尾に rule が追加される
2. `recompile()` が走り Preview は新しい SVG を出す
3. ところが **Monaco の in-memory buffer は古いまま**

ユーザーがエディタで何か入力して save すると、stale buffer が disk の
新しい内容（GUI で追記された rule）を上書きして、せっかく append した
ルールが消える。これは GUI 駆動編集の "round-trip"（ADR-20260506-01）が
期待する操作モデルを壊す。

ADR-20260506-01 は当時 "Monaco undo 統合は scope 外" と punt していたが、
これは **undo stack の話** であって、buffer 自体が stale になることまで
受容していたわけではない。

## 制約・前提

- **`ObservableFileSystemProvider` は既に存在**（#1151 で main にマージ済み）。
  `fs.watch(rootPath, callback)` で外部書き込みを購読でき、FileTree が
  既に同じ仕組みで refresh を実装済み
- **エディタは controlled component**: `EditorPane` は `value` prop で
  Monaco buffer を駆動する。state 側を update すれば再レンダリングで
  buffer も追従する
- **現行モデルでは dirty buffer 概念が無い**: `handleEditorChange` が
  キーストローク毎に `fs.writeFile` を即時実行するため、buffer = disk が
  常に保たれている（この点が conflict guard の設計に影響する、後述）
- **echo loop を作らない**: 自分の write が watch を発火させ refresh を
  triggering し、ユーザー入力と競合する事故を避ける

## 検討した選択肢

### 案A: イベント無条件で refresh

`fs.watch` の callback で毎回 `fs.readFile()` → `UPDATE_FILE_CONTENT` を
dispatch する。

- 利点: 実装が最小
- 欠点: 自分の write の echo を含めて毎回 refresh するため、ユーザーが
  入力中に毎キーストロークで自分の content を読み戻して dispatch する
  ループが発火する可能性。`UPDATE_FILE_CONTENT` の値が現状と同じであれば
  実害は無いが、無駄な fs read が走り、IME composition と相互作用する
  リスクもある
- 現状の auto-save 構造と相性が悪い

→ 不採用

### 案B: 自分が直近で書いた path を覚えておいて echo を skip

`AppShell` が `fs.writeFile` を呼んだ直後の path を一定時間記憶し、
その path への watch event を破棄する。

- 利点: echo を確実に消せる
- 欠点: 時刻ベースの window が脆い。GUI 編集の append と editor 入力が
  同時に走った場合に、外部 write を echo と誤判定し refresh を逃す
  リスクがある

→ 不採用

### 案C: disk content と state.fileContent を比較して差分時のみ refresh（採用）

watch callback で `fs.readFile()` を呼んで disk の現在内容を取得し、
**state.fileContent と異なるとき**だけ `UPDATE_FILE_CONTENT` を dispatch
する。

- 利点:
  - **自分の write echo は state.fileContent と disk が一致するので no-op**
    （onChange → state 更新 → fs.writeFile → watch event の順で、event が
    届く時点で state は既に最新になっている）
  - **外部書き込みは disk ≠ state なので refresh される**
  - 時刻管理や reentrancy フラグが不要で、判定が単純
- 欠点: refresh のたびに disk read を 1 回呼ぶ。実用上は問題ない頻度
- 現行の auto-save モデルと素直に整合する

→ **採用**

## Conflict guard の取り扱い

Issue #1150 本文では "dirty buffer を silent に上書きしない conflict
guard" を要求しているが、現行コードに **dirty buffer 概念が存在しない**。
`handleEditorChange` がキーストローク毎に `fs.writeFile` を呼ぶ auto-save
モデルのため、buffer = disk が常に保たれている。

この前提下では:

- **GUI append が editor 入力の "間" に割り込むレースは理論上ありうる**:
  ユーザーが文字を打ち state.fileContent が更新されたが、まだ
  `fs.writeFile` が完了していない瞬間に GUI append が走ると、disk の最終
  状態は append された方になる
- しかし `.krs.style` の append-only / cascade-tail 仕様（ADR-20260506-01）
  は **後発の write が常に勝つ** ことを設計の前提としており、レースの
  結果として後発が disk に残るのは仕様と整合する
- 案C の差分検出により、watch event 受信時に disk 状態が state と
  異なれば refresh される → ユーザー入力後に GUI append が来たケースでも
  最終的に正しい disk 内容が editor buffer に反映される

したがって、**現行モデルでは独立した conflict guard は不要**。将来 dirty
buffer 概念を導入するときは、その時点で再評価する。本 Design Doc では
"既知の制約として punt" し、AT に notes として記録する。

## 現時点の方針

**案C（差分検出）を採用** + conflict guard は punt（auto-save 前提下では
不要）。

### 実装概要

1. 新規 hook `useEditorExternalRefresh(fs, currentFilePath, fileContent,
   dispatch)` を追加
2. `fs.watch?.(currentFilePath, callback)` で購読
3. callback 内で `fs.readFile(path)` を実行、結果が `fileContent` と
   異なれば `dispatch({ type: "UPDATE_FILE_CONTENT", content: fresh })`
4. cleanup で `disposable?.dispose()`
5. `AppShell` から hook を呼び出す

### Spec / コード変更

| 場所 | 変更 |
|---|---|
| `packages/app/src/hooks/useEditorExternalRefresh.ts`（新規） | hook 本体 |
| `packages/app/src/hooks/useEditorExternalRefresh.test.ts`（新規） | unit テスト（echo 抑制 / 外部 write 反映 / unmount で dispose） |
| `packages/app/src/components/AppShell.tsx` | hook の呼び出し |
| `docs/acceptance/1150-editor-external-refresh.md`（新規） | AT |

## アクセプタンステスト観点

- AT-A: 開いている `.krs.style` に GUI append が走ると、Monaco buffer が
  disk と同じ内容に更新される
- AT-B: ユーザー自身の onChange による `fs.writeFile` は echo として
  検出され、`UPDATE_FILE_CONTENT` が再 dispatch されない（disk = state
  の差分検出による）
- AT-C: 開いていない別ファイルへの write は editor を refresh しない
- AT-D: ファイル切替時に古い subscription が dispose される
- AT-E（manual）: GUI flow で `.krs.style` を開いた状態で direction を選ぶ
  と、エディタ右側の保存マークなどに違和感が出ず、上書き事故が起きない
  ことを目視

## 未解決の問い

なし。以下は実装着手時の判断:

- **scroll position / cursor 保持**: Monaco の `value` を変えても model
  position は維持される慣習 — 実機で確認、必要なら追加で対応
- **無限ループ防止**: 差分検出だけで十分なはずだが、回帰防止のため hook
  内で recursion カウンタを置くか検討する（実装時判断、おそらく不要）
