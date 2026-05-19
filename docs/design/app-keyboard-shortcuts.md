# App キーボードショートカット基盤

- **日付**: 2026-05-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1411](https://github.com/kompiro/karasu/issues/1411) — Add Ctrl/Cmd+B keyboard shortcut to toggle the App sidebar
  - 関連 ADR: [ADR-20260519-01](../adr/20260519-01-app-outline-view.md) — Outline ビュー（Files/Outline 切替の対象）
  - 関連 TPL:
    - [TPL-20260518-01](../test-perspectives/TPL-20260518-01-involutive-toggle-renders-both-states.md) — involutive な toggle は両結果状態を検証する
    - [TPL-20260510-04](../test-perspectives/TPL-20260510-04-continuous-input-dom-interference.md) — テキスト入力中の DOM/イベント干渉
  - コード: `packages/app/src/components/AppShell.tsx`、
    `packages/app/src/components/EditArea.tsx`

## 背景・課題

Issue #1411 は VS Code 同様の `Ctrl/Cmd+B`（サイドバー開閉）を求めている。
これ単体なら `EditArea` に `keydown` リスナーを 1 つ足せば済む。

しかし今後、**コマンドパレット**（`Cmd+Shift+P` 相当）や **Files/Outline
ビュー切替**など複数のショートカットを足したい。各機能が個別に
`window.addEventListener("keydown")` を撒くと、

- どのキーがどこで処理されるか分散して把握不能になる
- 同じキーの二重ハンドルや取りこぼしが起きる
- コマンドパレットを後付けするとき「実行可能なアクション一覧」がどこにもない

ため、最初に **キーボードショートカットの基盤**を設計し、#1411 はその上に
最初のショートカットとして載せる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| アプリ全体のグローバル keydown | **無し**（`FileTree` の context menu を閉じる Escape のみ、状態には触れない） |
| コンポーネント内 keydown | `ChatPane`（Cmd+Enter 送信）、`InlineInput`/`ProjectSelector`（Enter/Escape）など、いずれも特定の `input`/`textarea` 要素にスコープされ、アプリ状態には触れない |
| Monaco | `EditorPane` が `Shift+Alt+F`（Format）を Monaco の `addCommand` で登録。Monaco がキーを内部消費し document には来ない |
| コマンド抽象 | **無し**（コマンドレジストリもパレットも存在しない） |
| 対象状態の所在 | `sidebarCollapsed` / `sidebarView` は `EditArea` のローカル `useState`、`previewFocused` は `AppShell` のローカル `useState`、`activeView` / `displayMode` は `app-reducer` |

**所在のばらつきが鍵**: グローバルな keydown ハンドラ 1 箇所からこれら全部の
setter に届かせる必要がある。状態をすべて `app-reducer` に持ち上げる手もあるが、
`sidebarCollapsed` のような純粋に表示の都合の状態まで reducer に集めるのは
過剰で、コンポーネントの自律性も失う。

## 制約・前提

- ショートカットはテキスト入力中（`input` / `textarea` / `contenteditable` /
  Monaco）には原則発火しない（#1411 の AC）。ただしコマンドパレット起動の
  ようなものは入力中でも発火する必要がある → **発火可否はコマンド単位で
  宣言**できること。
- `mod` キーは macOS では `Cmd`、それ以外では `Ctrl`。
- Monaco が内部消費するキー（`Shift+Alt+F` 等）とは衝突させない。
- 本 Design Doc のスコープは **基盤 + #1411 の `mod+B`** まで。コマンド
  パレット UI と Files/Outline 切替ショートカットは後続 Issue に切り出す。

## 検討した選択肢

### 案1: 単発の keydown リスナーを `EditArea` に足すだけ

`EditArea` に `useEffect` で `mod+B` を処理する。

**メリット**: 最小。#1411 だけなら十分。

**デメリット**: 基盤にならない。コマンドパレット・他ショートカットを足すたびに
リスナーが増殖し、現状の課題をそのまま将来へ先送りする。

### 案2: `useKeyboardShortcut(chord, handler)` フック（レジストリ無し）

各コンポーネントが `useKeyboardShortcut("mod+b", handler)` を呼ぶ。フックが
内部で共有のグローバルリスナーを管理する。

**メリット**: 状態を持ち上げず、各コンポーネントが自分のキーを宣言できる。

**デメリット**: キーバインドと handler の対しか持たず、「コマンド」のメタdata
（id・表示名）が無い。コマンドパレットは "実行可能なアクション一覧" を必要と
するので、別途作り直しになる。

### 案3: コマンドレジストリ + キーバインドディスパッチャ（採用）

「コマンド」を第一級の概念にする。コンポーネントは状態に触れる**コマンド**を
レジストリに登録し、キーバインドのディスパッチもコマンドパレットも同じ
レジストリを読む。

```ts
interface Command {
  id: string;                 // "view.toggleSidebar"
  title: string;              // "Toggle Sidebar" — パレット表示用
  keybinding?: string;        // "mod+b"（無いコマンドはパレット専用）
  /** テキスト入力中の挙動。既定 "skip"。パレット起動等は "allow"。 */
  whenTextInputFocused?: "skip" | "allow";
  run: () => void;
}
```

- `CommandProvider`（React context）が `Map<id, Command>` を保持し、
  `register(command): () => void`（unregister を返す）を提供する。
- `useCommand(command)` フック — コンポーネントが `useEffect` で登録/解除する。
  `EditArea` が `view.toggleSidebar`（`mod+b`）を、ローカル setter を `run` に
  束ねて登録する。状態は持ち上げない。
- `useKeyboardDispatcher()` — アプリ直下で 1 度だけ呼ぶ。document の `keydown`
  を購読し、イベントを chord 文字列（`"mod+b"`）に正規化、`keybinding` が
  一致するコマンドを引いて `run()` する。テキスト入力中は
  `whenTextInputFocused` を見て skip/allow を判定する。
- 将来のコマンドパレットはレジストリの `Command[]` を一覧表示し、選択で
  `run()` を呼ぶだけ — 基盤を再利用できる。

**メリット**

- キー処理が 1 箇所（ディスパッチャ）に集約され、把握・衝突検出が容易。
- コマンドパレットがレジストリをそのまま使える（後続 Issue が軽い）。
- 状態は所在を変えずに済む（コンポーネントが setter を `run` に閉じ込める）。

**デメリット**

- context + 登録ライフサイクルという基盤コードが要る（#1411 単体には重い）。
  ただし「今後充実させる」前提なので初期投資として妥当。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| #1411 の実装量 | 最小 | 小 | 中 |
| 将来のショートカット追加 | 増殖 | 容易 | 容易 |
| コマンドパレットの土台 | 無し | 無し | あり |
| 状態の持ち上げ | 不要 | 不要 | 不要 |

## 現時点の方針

**案3 を採用する** — Issue が明示的に「コマンドパレット」「ビュー切替」を
将来要件として挙げており、基盤を最初に作る価値がある。レジストリは
キーディスパッチとコマンドパレットの共通基盤になり、案2 のような作り直しを
避けられる。状態の所在を変えずに済む点も既存構造を壊さない。

### 実装の指針（Phase 1 = 本 PR / #1411）

1. 新規 `packages/app/src/keyboard/` に基盤を置く:
   - `command-types.ts` — `Command` interface。
   - `command-context.tsx` — `CommandProvider` + `useCommandRegistry`。
     `Map<id, Command>` を ref で保持、登録/解除で version を進めて
     パレット等の再描画を促す。
   - `use-command.ts` — `useCommand(command)`：マウント時 register、
     アンマウント時 unregister。
   - `use-keyboard-dispatcher.ts` — document `keydown`（bubble phase）購読。
     `eventToChord(e)` で `"mod+shift+p"` 等へ正規化（`mod` は platform 判定）。
     一致コマンドを実行。テキスト入力中は `whenTextInputFocused` で判定。
2. `App.tsx`（既存 provider 群の内側）に `CommandProvider` を追加し、
   `useKeyboardDispatcher()` をアプリ直下で 1 度呼ぶ。
3. `EditArea.tsx` で `useCommand({ id: "view.toggleSidebar",
   title: "Toggle Sidebar", keybinding: "mod+b",
   whenTextInputFocused: "skip", run: () => setSidebarCollapsed(v => !v) })`
   を登録。`sidebarView` は別 state なので展開時に直前ビューが自動復元される。
4. AT: `docs/acceptance/1411-*.md` に新規。TC は:
   - `Ctrl+B` / `Cmd+B` でサイドバーが折りたたみ⇄展開（両結果状態 —
     TPL-20260518-01）
   - テキスト入力／エディタにフォーカスがあるとき発火しない
   - 折りたたみ→展開で直前の `sidebarView` が保たれる
5. ADR 昇格: 実装完了後 `docs/adr/YYYYMMDD-NN-app-keyboard-shortcuts.md` と
   して昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 新しいショートカットが 1 つ増えるのみ。既存の
  コンポーネント内 keydown（Chat の Cmd+Enter 等）はスコープが要素内なので
  影響なし。
- ドキュメント更新: なし（spec 変更を伴わない）。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと（後続 Issue）

- **コマンドパレット UI**（`mod+shift+p` で全コマンドを検索・実行）— 別 Issue。
  本基盤の `Command[]` をそのまま使う。
- **Files/Outline ビュー切替ショートカット** — 別 Issue。`EditArea` が
  `view.showFiles` / `view.showOutline` コマンドを追加登録するだけで済む。
- **キーバインドのユーザー設定** — 当面 `keybinding` はコード固定。設定 UI は
  必要が出たら別途。
- **capture phase / Monaco 衝突** — 現状の全ショートカットはテキスト入力中
  `skip` なので Monaco と衝突しない。入力中も発火するショートカット（パレット
  起動）を足す時点で capture phase 購読の要否を再検討する。
