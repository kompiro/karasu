# App コマンドパレット

- **日付**: 2026-05-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1421](https://github.com/kompiro/karasu/issues/1421)
  - 関連 ADR: [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) — App キーボードショートカットのコマンドレジストリ基盤
  - 関連 TPL: [TPL-20260519-01](../test-perspectives/TPL-20260519-01-global-shortcut-text-input-inhibition.md) — グローバルショートカットのテキスト入力フォーカス契約
  - コード: `packages/app/src/keyboard/command-context.tsx`、`packages/app/src/App.tsx`

## 背景・課題

ADR-20260519-02 で App のキーボードショートカットは「コマンドレジストリ」を
基盤にすると決まった。コンポーネントが `Command`（id / title / keybinding /
`whenTextInputFocused` / run）をレジストリに登録し、単一の
`KeyboardShortcutDispatcher` がキー chord と突き合わせて実行する。

同 ADR は「コマンドパレット UI（`mod+shift+p`）はレジストリの `Command[]` を
列挙・実行するだけ。enumerate API はそのとき足す」と後続作業を明記している。
本 Design Doc はその後続 — コマンドパレットの設計を扱う。

VS Code 風に `Ctrl/Cmd+Shift+P` で開く検索可能なコマンド一覧を提供し、
キーバインドを覚えていなくても登録済みアクションを名前で探して実行できる
ようにする。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| レジストリ API | `CommandRegistry` は `register(command) => unregister` と `resolveChord(chord)` のみ。**列挙 API は無い** |
| コマンド保持 | `CommandProvider` は `Map<string, Command>` を `useRef` で保持。登録時に再レンダーしない（ディスパッチャはイベント時に読むだけ） |
| 登録済みコマンド | `view.toggleSidebar`（`mod+b`）、`view.showSystem/Deploy/Org/Matrix`（`mod+1..4`）、`view.showFiles/showOutline`（`mod+shift+e` / `mod+shift+o`）。すべて `whenTextInputFocused: "skip"` |
| `mod+shift+p` | 未割り当て |
| UI 基盤 | モーダルは shadcn `Dialog`（`.claude/rules/dialog.md`）。Esc / 外側クリック・フォーカストラップは Radix が提供 |

## 制約・前提

- レジストリ基盤（ADR-20260519-02）は変更しない。列挙 API の追加のみ行う。
- パレット起動コマンドは `whenTextInputFocused: "allow"` — エディタ編集中こそ
  最も使いたいため（TPL-20260519-01 の失敗モード「`allow` にすべきものが
  `skip` で死ぬ」を回避）。
- パレット UI は shadcn `Dialog` を使う（`.claude/rules/dialog.md`）。独自の
  `keydown` / overlay リスナーは足さない。
- out of scope: コマンドのカテゴリ／グループ表示、最近使った順、ファジー
  スコアリング、コマンド以外（ファイル・シンボル）の検索。

## 検討した選択肢

### 論点 1: レジストリの列挙 API

#### 案 1-A: `getCommands(): Command[]` を追加

`CommandRegistry` に `getCommands()` を足し、ref の `Map` の値を配列で返す。

**メリット**

- 最小の追加。`resolveChord` と同じく ref を読むだけで再レンダー不要。
- パレットは「開いた瞬間」に一度列挙すればよく、スナップショットで足りる。

**デメリット**

- 登録の変化を購読できない（パレット表示中に増減しても反映されない）。
  ただしパレットは開いてから閉じるまで数秒で、その間に別コンポーネントが
  マウント／アンマウントする実シナリオは現状ない。

#### 案 1-B: 購読可能にする（`subscribe` / `useSyncExternalStore`）

レジストリを購読可能にし、パレットが常に最新の一覧を反映する。

**メリット**

- 表示中の増減も反映できる。

**デメリット**

- ref ベースの「登録で再レンダーしない」設計（ADR-20260519-02 の明示的な
  選択）に購読機構を後付けする必要があり、基盤の変更量が大きい。現状の
  ユースケースに対して過剰。

### 論点 2: 検索フィルタ

- **案 2-A: 大文字小文字無視の部分一致** — `title` に対する `includes`。実装が
  単純で予測可能。
- **案 2-B: ファジーマッチ** — `"sb"` で `Show System` 等にヒット。気は利くが
  スコアリングの調整が要り、コマンド数が一桁の現状では過剰。

### 論点 3: パレット起動コマンド自身を一覧に出すか

開いている最中に「コマンドパレットを開く」を実行しても再オープンの no-op で
害は無いが、ノイズになる。一覧から自身（`command.openCommandPalette`）を
除外する。

## 現時点の方針

- **論点 1: 案 1-A（`getCommands()`）を採用** — ADR-20260519-02 の ref ベース
  設計を保ち、最小の API 追加で済む。パレットは開いた時点で一度列挙する。
- **論点 2: 案 2-A（部分一致）を採用** — コマンド数が一桁の現状でファジーは
  過剰。将来コマンドが増えたらファジーへ差し替え可能（パレット内に閉じた
  変更で済む）。
- **論点 3: 起動コマンド自身は一覧から除外する。**

### 実装の指針

1. `packages/app/src/keyboard/command-context.tsx` — `CommandRegistry` に
   `getCommands(): Command[]` を追加。`commandsRef.current` の値を配列で返す。
2. `packages/app/src/components/CommandPalette.tsx`（新規） —
   - `useCommand` で `command.openCommandPalette`（title: `"Show All Commands"`、
     `keybinding: "mod+shift+p"`、`whenTextInputFocused: "allow"`、run: パレットを開く）
     を登録する。
   - 内部 `open` state を持ち、shadcn `Dialog` で描画する。開いた時点で
     `getCommands()` を一度呼びスナップショットし、検索 input の入力で
     `title` 部分一致フィルタする。
   - 上下キーで選択移動、Enter／クリックでそのコマンドの `run()` を実行して
     クローズ。Esc／外側クリックは Radix が処理（独自リスナーは足さない）。
   - 一覧から `command.openCommandPalette` を除外する。
3. `packages/app/src/App.tsx` — `CommandProvider` 内（`KeyboardShortcutDispatcher`
   の隣）に `<CommandPalette />` をマウントする。
4. テスト:
   - `command-context` — `getCommands()` が登録済みコマンドを返し、
     unregister 後に消える。
   - `CommandPalette` — (a) `mod+shift+p` で**エディタ／テキスト入力に
     フォーカスがある状態でも**開く（TPL-20260519-01 の `allow` 契約を
     フォーカス下で end-to-end 検証）、(b) 入力で一覧が絞り込まれる、
     (c) Enter／クリックで `run` 実行＆クローズ、(d) Esc でクローズ、
     (e) 一覧に自身が出ない。
5. AT: `docs/acceptance/` に新規ファイル。CI の jsdom では描画見た目を
   検証できないため、実ブラウザで以下を確認する観点を残す:
   - `Cmd/Ctrl+Shift+P` でパレットが開き、検索・上下キー・選択実行が
     視覚的に正しく動く。
6. ADR 昇格: 実装完了後、`docs/adr/` に昇格し本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（新規機能の追加のみ）。
- レジストリ API: `getCommands()` の追加は後方互換（既存 consumer に影響なし）。
- ドキュメント更新: ADR-20260519-02 の「割り当て済みショートカット一覧」に
  `mod+shift+p` を追記する（実装 PR で対応）。
- テスト・examples への影響: なし。

## Related TPLs

- [TPL-20260519-01](../test-perspectives/TPL-20260519-01-global-shortcut-text-input-inhibition.md)
  — グローバルショートカットのテキスト入力フォーカス契約。パレット起動
  コマンドは `whenTextInputFocused: "allow"` であり、その契約を**テキスト
  入力にフォーカスした状態**で end-to-end 検証する（上記テスト 4-(a)）。

新たに proactive TPL を起こす必要は無い — 本設計が違反しうる原則
（`allow`/`skip` 契約、chord 衝突、登録解除漏れ）は TPL-20260519-01 が
既に網羅しており、そのチェックリストに従う。
