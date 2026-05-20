---
id: ADR-20260519-02
title: App キーボードショートカットはコマンドレジストリを基盤にする
status: accepted
date: 2026-05-19
topic: app-ui
related_to: [ADR-20260519-01]
scope:
  packages: [app]
assumptions:
  - "file: packages/app/src/keyboard/command-context.tsx"
  - "symbol: packages/app/src/keyboard/KeyboardShortcutDispatcher.tsx :: KeyboardShortcutDispatcher"
  - "symbol: packages/app/src/keyboard/use-command.ts :: useCommand"
---

# ADR-20260519-02: App キーボードショートカットはコマンドレジストリを基盤にする

- **日付**: 2026-05-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #1411 — Add Ctrl/Cmd+B keyboard shortcut to toggle the App sidebar
  - 関連 ADR: [ADR-20260519-01](20260519-01-app-outline-view.md) — Outline ビュー（Files/Outline 切替の対象）
  - 関連 TPL: [TPL-20260519-01](../test-perspectives/TPL-20260519-01-global-shortcut-text-input-inhibition.md) —
    グローバルショートカットのテキスト入力フォーカス契約
  - 後続 Issue: コマンドパレット
  - 実装済み後続: Issue #1423 — ダイアグラムビュー切替ショートカット（`mod+1..4`）、
    Issue #1422 — Files/Outline ビュー切替ショートカット（`mod+shift+e` / `mod+shift+o`）、
    Issue #1458 — プレビュー Focus モード切替ショートカット（`mod+shift+f`）
  - コード: `packages/app/src/keyboard/`、`packages/app/src/App.tsx`、
    `packages/app/src/components/EditArea.tsx`、
    `packages/app/src/components/DiagramViewShortcuts.tsx`、
    `packages/app/src/components/PreviewFocusShortcut.tsx`

## 背景

Issue #1411 は VS Code 同様の `Ctrl/Cmd+B`（サイドバー開閉）を求めた。これ単体
なら `EditArea` に `keydown` リスナーを 1 つ足せば済む。

しかし今後、コマンドパレット（`Cmd+Shift+P` 相当）や Files/Outline ビュー切替
など複数のショートカットを足したい。各機能が個別に `window` の keydown を撒くと、
どのキーがどこで処理されるか分散し、二重ハンドルや取りこぼしが起き、コマンド
パレットを後付けするとき「実行可能なアクション一覧」がどこにも無い、という
問題が出る。そこで #1411 単体ではなく、ショートカットの基盤を先に設計した。

## 決定

キーボードショートカットは **コマンドレジストリ**を基盤にする。コンポーネントは
`Command`（id / title / keybinding / `whenTextInputFocused` / run）を React
context のレジストリに登録し、単一の `KeyboardShortcutDispatcher` が document の
keydown をキー chord に正規化してレジストリと突き合わせ実行する。`Ctrl/Cmd+B`
はこの基盤上の最初のコマンド（`view.toggleSidebar`）として実装する。

## 理由

- **入力経路の集約**: キー処理が単一ディスパッチャに集約され、把握・衝突検出が
  容易。個別 keydown リスナーの増殖を防ぐ。
- **コマンドパレットの土台**: レジストリの `Command[]` をパレットがそのまま
  列挙できる。キーバインドのディスパッチとパレットが同じ基盤を共有するため、
  後続 Issue が軽い（「フックのみ」案ではパレット用に作り直しになる）。
- **状態の所在を変えない**: `sidebarCollapsed` のようなコンポーネントローカルな
  状態を reducer に持ち上げず、コンポーネントが自分の setter を `run` に
  閉じ込めて登録する。既存構造を壊さない。
- **タイピングを妨げない**: 発火可否は `whenTextInputFocused`（既定 `"skip"`）で
  コマンドごとに宣言する。テキスト入力／エディタにフォーカスがある間は `skip`
  コマンドを発火させない。コマンドパレット起動のように入力中でも要るものは
  `"allow"` を選べる。

## 却下した案

- **単発の keydown リスナーを `EditArea` に足すだけ**: #1411 だけなら最小だが
  基盤にならず、ショートカットを足すたびにリスナーが増殖する。
- **`useKeyboardShortcut(chord, handler)` フック（レジストリ無し）**: 状態を
  持ち上げずに済むが、キーバインドと handler の対しか持たず、コマンドの
  メタデータ（id・表示名）が無い。コマンドパレットは実行可能アクション一覧を
  必要とするため別途作り直しになる。
- **タグ由来の `when` 句のような汎用条件式**: VS Code 風の `when` コンテキストは
  karasu の規模には過剰。`whenTextInputFocused` の 2 値で当面足りる。

## 追記 — 割り当て済みショートカット一覧（2026-05-19）

この基盤上に登録済みのショートカットを一覧する。新しいショートカットを足す
ときは、ここを見てキー chord の衝突を避ける（`resolveChord` は先勝ちで、
重複登録は後勝ちにならず無言で握りつぶされる — TPL-20260519-01）。

| Chord | コマンド `id` | 動作 | Issue |
|---|---|---|---|
| `mod+b` | `view.toggleSidebar` | サイドバーの折りたたみ⇄展開 | #1411 |
| `mod+1` | `view.showSystem` | ダイアグラムを System ビューに切替 | #1423 |
| `mod+2` | `view.showDeploy` | ダイアグラムを Deploy ビューに切替 | #1423 |
| `mod+3` | `view.showOrg` | ダイアグラムを Org ビューに切替 | #1423 |
| `mod+4` | `view.showMatrix` | ダイアグラムを Matrix（CRUD）ビューに切替 | #1423 |
| `mod+shift+e` | `view.showFiles` | サイドバーを Files ビューに切替（折りたたみ時は展開） | #1422 |
| `mod+shift+o` | `view.showOutline` | サイドバーを Outline ビューに切替（折りたたみ時は展開） | #1422 |
| `mod+shift+p` | `command.openCommandPalette` | コマンドパレットを開く | #1421 |
| `mod+shift+f` | `view.togglePreviewFocus` | プレビューの Focus（全幅）モードを切替 | #1458 |
| `mod+shift+?` | `view.showReference` | References パネルを開く（物理キーは `Ctrl/Cmd+Shift+/`） | #1461 |

`mod+1..4` は `DiagramTabBar` のタブ並び順に対応する。ビュー切替系コマンドは
すべて `whenTextInputFocused: "skip"` で、エディタ／テキスト入力にフォーカスが
ある間は発火しない。

`mod+shift+f` の `view.togglePreviewFocus` はプレビューツールバーの
`↗ Focus` / `↙ Exit Focus` ボタンと同じく `previewFocused` を反転する。
`skip` 指定なので、エディタにフォーカスがある間は発火せず Monaco の
`shift+alt+f`（Format Document）とも別系統で衝突しない。

`view.showReference` はプレビューツールバーの `? Reference` ボタンと同じく
References パネルを開く。ユーザーは `Ctrl/Cmd+Shift+/` を押すが、`shift` を
伴うため `eventToChord` が正規化する key は `?` になり、`keybinding` 文字列は
`mod+shift+?` となる。`?` は GitHub / Gmail などのヘルプ表示と揃えた選択で、
ブラウザの hard-reload（`mod+shift+r`）との衝突を避けている。

`command.openCommandPalette` だけは `whenTextInputFocused: "allow"` — 編集中
こそコマンドを名前で探したいため、エディタにフォーカスがあっても発火する。
この基盤上で最初の `allow` コマンドであり、パレットはレジストリの
`getCommands()` で全コマンドを列挙する（Issue #1421）。

`mod+shift+e` / `mod+shift+o` は VS Code の Explorer / Outline 表示に倣う。
`mod+shift+o` は Monaco の Go to Symbol と綴りが重なるが、両コマンドとも
`skip` のためエディタにフォーカスがある間は発火せず、衝突しない。
`view.showOutline` は Outline ビューが存在するときのみ登録される（アクティビティ
バーの Outline ボタンと整合）。

ビュー切替の対象が現在のドキュメントに存在しない場合（例: deploy ブロックの
無い `.krs` で `mod+2`）は、可用性でガードせず常に切替える方針とした。
`SET_ACTIVE_VIEW` の dispatch は常に成功し、プレビューはそのビューの空状態を
表示するだけでエラーにならない。タブを直接クリックした場合と挙動を揃え、
「ショートカットだけ無反応」という分かりにくさを避けるための判断。

## 補足 — 後続作業

- コマンドパレット UI（`mod+shift+p`）はレジストリの `Command[]` を列挙・実行する
  だけ。enumerate API はそのとき足す。
- 入力中も発火するショートカットを足す際は capture phase 購読の要否を再検討する
  （現状の全コマンドは `skip` なので bubble phase で足りる）。
