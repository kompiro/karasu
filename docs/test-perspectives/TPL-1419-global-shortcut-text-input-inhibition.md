---
id: TPL-1419
title: "グローバルキーボードショートカットはテキスト入力フォーカス下での挙動を契約として検証する"
status: active
date: 2026-05-19
applicable_to:
  - "document / window レベルの単一 keydown ディスパッチャから発火するキーボードショートカット"
  - "発火可否がフォーカス文脈（テキスト入力中か否か）に依存する操作"
  - "共有レジストリ経由で複数の handler / command を 1 つの入力経路に載せる仕組み"
known_consumers:
  - keyboard-shortcut-dispatcher
discovered_from:
  - root_cause_file: "packages/app/src/keyboard/KeyboardShortcutDispatcher.tsx"
  - issue: "#3207"
  - root_cause_file: "packages/app/src/keyboard/chord.ts :: isTextInputFocused"
related_to:
  - TPL-1053
topic: app-ui
scope:
  packages:
    - app
---

# TPL-1419: グローバルキーボードショートカットはテキスト入力フォーカス下での挙動を契約として検証する

## 観点

グローバルキーボードショートカットは document レベルの単一ディスパッチャから
発火する。**「テキスト入力（input / textarea / contenteditable / エディタ）に
フォーカスがあるとき発火するか」はコマンドごとの契約**（karasu では
`whenTextInputFocused: "skip" | "allow"`）であって、機能テストには現れない。

「ショートカットが動くか」だけを見るテストは通常**何もフォーカスしていない
状態**で走るため、フォーカス文脈の契約を素通りする。新しいコマンドを足すとき、
あるいはディスパッチャ自体を変更するときは、**宣言した方針どおりに発火/抑止
されることを、テキスト入力にフォーカスを当てた状態で end-to-end 検証**する。

単一の共有ディスパッチャ・共有レジストリに載せる仕組みであることにも注意する。
1 箇所の退行が全ショートカットを同時に壊し、同じ chord を持つコマンドは
無言で互いを shadow する。

## 想定される失敗モード

- `whenTextInputFocused` の指定漏れ・誤りで、入力中に発火すべきでない
  ショートカットがエディタのキーストロークを奪う（タイピングを妨げる）。
  何もフォーカスしない手動スモークでは「動く」ように見え、バグが隠れる
- 逆に、入力中も発火すべきショートカット（コマンドパレット起動など）が
  `skip` 扱いになり、**ユーザーが最も使いたい「編集中」に死んでいる**
- 2 つのコマンドが同じ `keybinding` を登録し、`resolveChord` の先勝ちで
  後者が無言で無効化される
- コマンド登録コンポーネントのアンマウント時に登録解除が漏れ、stale な
  `run` が鳴り続ける
- chord 正規化（`mod` の platform 差、修飾子順）の取りこぼしで、特定
  platform でだけショートカットが一致しない
- **エディタのフォーカス先が「テキスト入力」の判定から外れる**（#3207）。
  エディタのフォーカス先はエディタの実装で変わる。Monaco は Chromium で
  EditContext API を使い、`<textarea>` でも contenteditable でもない
  `<div class="native-edit-context">` にフォーカスするので、
  `INPUT` / `TEXTAREA` / `isContentEditable` だけの判定をすり抜けて、
  `skip` のショートカットがエディタ内で発火した。jsdom には EditContext が
  無く、`<textarea>` を focus する単体テストはすべて通っていた

## チェックリスト

新しいコマンド / ショートカットの実装・修正時に、以下を確認する:

- [ ] コマンドに `whenTextInputFocused` を明示し、その方針どおりの挙動を
      **テキスト入力にフォーカスした状態**で end-to-end 検証したか
      （`skip`: 入力中に発火しない / `allow`: 入力中でも発火する）
- [ ] `keybinding` が既存コマンドと衝突していないか（衝突時は先勝ちで
      後発が無効化される）
- [ ] コマンドを登録するコンポーネントのアンマウントで登録解除されるか
- [ ] platform 依存（`mod` = Cmd/Ctrl）や修飾子順に依存する場合、その
      正規化を検証したか
- [ ] エディタにフォーカスした状態の検証を、jsdom の `<textarea>` ではなく
      **実ブラウザで実際のエディタにフォーカスして**行ったか（フォーカス先の
      要素はエディタの実装と browser で変わる。#3207）

## 既知の対処パターン

karasu のキーボードショートカット基盤（`packages/app/src/keyboard/`）は、
コマンドごとに `whenTextInputFocused` を宣言し、ディスパッチャが
`isTextInputFocused()` でフォーカス文脈を判定して skip/allow する。テストは
`CommandProvider` + `KeyboardShortcutDispatcher` を張り、`input.focus()` /
`textarea.focus()` 下で keydown を撃って契約を検証する。

## 関連テスト

- `packages/app/src/keyboard/keyboard-shortcuts.test.tsx` — skip / allow 双方を
  テキスト入力フォーカス下で検証
- `packages/app/src/keyboard/chord.test.ts` — chord 正規化・`isTextInputFocused`
  （EditContext を持つ要素を含む。#3207）
- `packages/e2e/tests/at-1411-sidebar-toggle-shortcut.spec.ts` /
  `at-1422-sidebar-view-shortcuts.spec.ts` / `at-1423-diagram-view-shortcuts.spec.ts` /
  `at-1458-preview-focus-shortcut.spec.ts` — `… is ignored while the editor has focus`
  （実ブラウザで Monaco にフォーカスして keydown を撃つ。#3207）
- `packages/app/src/components/EditArea.test.tsx` — `mod+B` がエディタ
  フォーカス中は発火しないこと
- `packages/app/src/components/DiagramViewShortcuts.test.tsx` — `skip` 方針の
  view 切替ショートカットがテキスト入力フォーカス下で発火しないこと
  （`ignores the shortcuts while a text input is focused (TPL-1419)`）と、
  アンマウント後に解決されなくなること
- `packages/app/src/components/EditTabShortcuts.test.tsx` — `allow` 方針の
  タブ切替ショートカットがテキスト入力フォーカス下でも発火すること
  （`fires the shortcuts even while a text input is focused (TPL-1419)`）と、
  アンマウント後に解決されなくなること
- `packages/app/src/keyboard/command-context.test.tsx` — `CommandRegistry.getCommands`
  › `drops a command once its component unmounts`：登録したコンポーネントの
  アンマウントでコマンドが登録解除されること
