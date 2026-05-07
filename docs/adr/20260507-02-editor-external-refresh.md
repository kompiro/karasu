---
id: ADR-20260507-02
title: "Editor バッファの外部書き込み追従 — 差分検出ベースの auto-refresh"
status: accepted
date: 2026-05-07
topic: app-ui
depends_on: [ADR-20260507-01]
related_to:
  - ADR-20260506-01
  - ADR-20260506-06
scope:
  packages: [app]
---

# ADR-20260507-02: Editor バッファの外部書き込み追従 — 差分検出ベースの auto-refresh

- **日付**: 2026-05-07
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue [#1150](https://github.com/kompiro/karasu/issues/1150)（親 [#1076](https://github.com/kompiro/karasu/issues/1076) / [#1098](https://github.com/kompiro/karasu/issues/1098) / [#1144](https://github.com/kompiro/karasu/issues/1144)）
  - 実装 PR [#1159](https://github.com/kompiro/karasu/pull/1159)（Design Doc）、[#1161](https://github.com/kompiro/karasu/pull/1161)（実装）
  - 親 ADR: [ADR-20260507-01](./20260507-01-observable-fs-provider.md)（`ObservableFileSystemProvider` インフラ）
  - 関連 ADR: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール）、[ADR-20260506-06](./20260506-06-krs-style-open-affordance.md)（`.krs.style` 直接編集時の append target）

## 背景

ADR-20260506-01 で確立した GUI 駆動 round-trip と、#1145 が追加した
self-bootstrap `@import` flow は、いずれも `.krs.style` への外部書き込み
を発生させる。ユーザーがその `.krs.style` をエディタで開いている状態で
これらが走ると、disk は更新されるが **Monaco の in-memory buffer は古い
まま** で、ユーザーが何か入力して save すると stale buffer が GUI 追記
を上書きする事故が起きる。

ADR-20260507-01 が `ObservableFileSystemProvider` を導入し、FileTree が
既に `fs.watch(rootPath, callback)` で外部 mutation に追従するように
なったので、エディタ側でも同じ仕組みに乗る土台は揃っていた。残るのは
**echo loop（自分自身の write が watch を発火させる）の扱い** と、
**dirty buffer と GUI append のレース** の取り扱いを決めることだった。

## 決定

新規 hook `useEditorExternalRefresh(fs, currentFilePath, fileContent,
dispatch, onRefresh?)` を `AppShell` から呼び出し、編集中ファイルの
watch event を購読する。callback では:

1. `fs.readFile(path)` で disk の現在内容を取得
2. **`state.fileContent` と異なる場合のみ** `dispatch({ type:
   "UPDATE_FILE_CONTENT", content: fresh })` を実行
3. 続けて `onRefresh()`（= `recompile`）を呼んで Preview も追従させる

`delete` イベントは無視（現状 "file disappeared" UX が未整備）。`null`
path / 別ファイルへの write / ファイル切替時の dispose は通常の
useEffect cleanup で扱う。

## 理由

- **差分検出が echo guard と外部 write の検出を一発で兼ねる**: エディタの
  auto-save (`handleEditorChange`) は `dispatch(UPDATE_FILE_CONTENT)` →
  `fs.writeFile` の順で走るので、watch event が届く時点で
  `state.fileContent` は既に最新 = disk と一致 → 差分なし → skip。
  外部書き込みは disk と state が乖離 → 差分あり → refresh。
  時刻 window や reentrancy フラグが不要で実装が単純
- **既存 watch 機構（ADR-20260507-01）にそのまま乗る**: FileTree と同じ
  パターンで、新しい abstraction を導入しない
- **`recompile` を後段に呼ぶことで Preview も追従**: 編集側で起きた
  自動 refresh が描画にも自然に反映される
- **conflict guard を punt できる根拠**: 現行コードに dirty buffer 概念
  が無い（auto-save により buffer = disk が常に保たれている）。GUI append
  と editor 入力のレースは ADR-20260506-01 の cascade-tail-wins で意味
  付けられているため、最後に disk に書かれた内容を buffer に反映する
  素直な挙動で十分

## 却下した案

### 案 A: イベント無条件で refresh
`fs.watch` の callback で毎回 `fs.readFile()` → `UPDATE_FILE_CONTENT`
を dispatch する。
- 却下理由: 自分の write の echo を含めて毎回 refresh するため、ユーザー
  入力中にループが発火するリスク。`UPDATE_FILE_CONTENT` の値が現状と同じ
  であれば実害は無いが、無駄な fs read が走り、IME composition と相互
  作用する懸念

### 案 B: 自分が直近で書いた path を覚えて echo を skip
`AppShell` が `fs.writeFile` を呼んだ直後の path を一定時間記憶し、
その path への watch event を破棄する。
- 却下理由: 時刻ベースの window が脆い。GUI 編集の append と editor 入力
  が同時に走った場合に、外部 write を echo と誤判定し refresh を逃す
  リスク

### 案: 明示的な dirty buffer guard を導入する
編集中の未保存変更を検出して GUI append を block / prompt する。
- 却下理由: 現行モデルは auto-save のため dirty buffer 概念が無い。
  cascade-tail-wins（ADR-20260506-01）でレース時のセマンティクスは既に
  意味付けされており、ユーザーから見て "後発が反映される" が一貫した
  振る舞いになる。dirty buffer を導入する場合は別 issue で再評価する

## スコープ外

- **delete event の UX**: ファイルが消されたとき "file disappeared" と
  ユーザーに伝える表示。現状は dispatch を行わず stale read を防ぐに
  留める。改善が必要なら別 issue 化
- **VS Code 拡張への展開**: Web Preview 用 hook であり、VS Code 側は
  別 issue
- **Monaco の undo stack 統合**: ADR-20260506-01 の punt 継承
- **dirty buffer 導入後の再評価**: 将来の課題
