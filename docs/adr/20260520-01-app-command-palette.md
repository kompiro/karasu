---
id: ADR-20260520-01
title: App コマンドパレットはコマンドレジストリを列挙する
status: accepted
date: 2026-05-20
topic: app-ui
related_to: [ADR-20260519-02]
scope:
  packages: [app]
assumptions:
  - "file: packages/app/src/components/CommandPalette.tsx"
  - "symbol: packages/app/src/components/CommandPalette.tsx :: CommandPalette"
  - "symbol: packages/app/src/keyboard/command-context.tsx :: getCommands"
---

# ADR-20260520-01: App コマンドパレットはコマンドレジストリを列挙する

- **日付**: 2026-05-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #1421 — Add a command palette to the App
  - 関連 ADR: [ADR-20260519-02](20260519-02-app-keyboard-shortcuts.md) — キーボードショートカットのコマンドレジストリ基盤
  - 関連 TPL: [TPL-20260519-01](../test-perspectives/TPL-20260519-01-global-shortcut-text-input-inhibition.md) — グローバルショートカットのテキスト入力フォーカス契約
  - コード: `packages/app/src/components/CommandPalette.tsx`、`packages/app/src/keyboard/command-context.tsx`
  - 受け入れテスト: [docs/acceptance/1421-command-palette.md](../acceptance/1421-command-palette.md)

## 背景

ADR-20260519-02 で App のキーボードショートカットはコマンドレジストリを基盤に
すると決め、「コマンドパレット UI（`mod+shift+p`）はレジストリの `Command[]` を
列挙・実行するだけ。enumerate API はそのとき足す」と後続作業を明記していた。

本 ADR はその後続 — VS Code 風に `Ctrl/Cmd+Shift+P` で開く検索可能なコマンド
一覧を提供し、キーバインドを覚えていなくても登録済みアクションを名前で探して
実行できるようにする。検討の経緯は Design Doc `app-command-palette.md`（本 ADR
昇格時に削除）にある。

## 決定

コマンドパレットは、コマンドレジストリに最小の列挙 API `getCommands()` を足し、
それを開いた時点でスナップショットして列挙する。UI は shadcn `Dialog`、検索は
大文字小文字無視の部分一致、起動コマンド自身は一覧から除外する。

- レジストリに `getCommands(): Command[]` を追加する。ref が保持する `Map` の
  値を配列で返すだけで、登録時の再レンダーは発生しない（ADR-20260519-02 の
  ref ベース設計を保つ）。
- `CommandPalette` は `command.openCommandPalette`（`keybinding: "mod+shift+p"`、
  `whenTextInputFocused: "allow"`）を登録し、開いた時点で `getCommands()` を
  一度スナップショットする。検索入力で `title` 部分一致フィルタ、上下キーで
  選択移動、Enter／クリックで実行＆クローズ。Esc／外側クリックは Radix が処理。
- 起動コマンド `command.openCommandPalette` は一覧から除外する。

## 理由

- **最小の API 追加**: `getCommands()` は ref を読むだけで、ADR-20260519-02 が
  意図的に選んだ「登録で再レンダーしない」設計を壊さない。パレットのセッションは
  数秒で、表示中の登録増減を反映する必要は実シナリオ上ない。
- **`allow` の最初の利用例**: 起動コマンドを `whenTextInputFocused: "allow"` に
  するのは、編集中こそコマンドを名前で探したいため。TPL-20260519-01 が挙げる
  失敗モード「入力中も発火すべきショートカットが `skip` 扱いで死ぬ」を回避する。
- **部分一致で十分**: 登録コマンドが一桁の現状でファジーマッチはスコアリング
  調整の手間に見合わない。将来コマンドが増えたら、パレット内に閉じた変更で
  ファジーへ差し替えられる。
- **基盤を共有する**: パレットとキーバインドのディスパッチが同じレジストリを
  読むため、コマンドを 1 か所登録すれば両方から使える。

## 却下した案

- **レジストリを購読可能にする（`subscribe` / `useSyncExternalStore`）**:
  表示中の登録増減も反映できるが、ref ベースの「登録で再レンダーしない」設計に
  購読機構を後付けする必要があり、現状のユースケースに対して基盤の変更量が
  過剰。
- **ファジーマッチ**: `"sb"` で `Show System` 等にヒットして気は利くが、
  スコアリングの調整が要り、コマンド数が一桁の現状では過剰。
