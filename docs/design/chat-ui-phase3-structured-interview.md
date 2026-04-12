# Chat UI Phase 3 — Structured Interview Prompts 実装設計

- **日付**: 2026-04-12
- **ステータス**: 完了
- **関連**:
  - [#420 feat(app): Chat UI panel — Phase 3: structured interview prompts](https://github.com/kompiro/karasu/issues/420)
  - [chat-ui-panel.md](./chat-ui-panel.md) — Phase 3 の上位設計（スコープ別インタビュー概要）
  - [chat-ui-phase2-byok-ai-integration.md](./chat-ui-phase2-byok-ai-integration.md) — Phase 2 実装設計

## 背景・課題

`chat-ui-panel.md` は Phase 3 の方針を次のように概説している：

> - ドリルダウンレベル別 system prompt
> - 文脈に応じた質問生成

しかし実装レベルでは以下の決定が未解決だった：

1. **ドリルダウンレベルの検出方法** — `viewPath` から「system / service / domain / usecase」のどれかをどう特定するか
2. **インタビュー自動開始の仕組み** — Anthropic API はユーザーメッセージを先頭に要求する制約がある中で、Chat タブを開くだけでAIが最初に喋るUXをどう実現するか
3. **`useEffect` deps の設計** — 自動開始 effect が AI 応答後に再発火しないための依存配列の組み方
4. **`viewPath` のプロップ経路** — `AppShell` から `useChatSession` まで何層を通るか

---

## 制約・前提

- Phase 2（#419）で `useChatSession`・`ChatPane`・`ApiKeySetup` が実装済み
- Anthropic Messages API の制約: messages 配列の先頭は必ず `role: "user"` でなければならない
- `.krs` が source of truth — チャット履歴ではなくファイル内容を常に参照する
- `viewPath` は `AppShell` の `useSystemView` / `useOrgView` から生成され、`KarasuPreviewColumn` に渡されている

---

## 検討した選択肢

### 1. ドリルダウンレベル検出

#### 案A: `viewPath.length` で判定（却下）

`viewPath.length` が 0 なら system、1 なら service... という機械的な対応表を使う。

```ts
if (viewPath.length <= 1) return "system";
if (viewPath.length === 2) return "service";
if (viewPath.length === 3) return "domain";
return "usecase";
```

**デメリット**:
- `.krs` のネスト構造は必ずしも system → service → domain → usecase の 4 階層ではない
- 将来 `domain` 直下に `resource` を追加した場合など、length ベースの判定が壊れる

#### 案B: 末尾ノードの `kind` で判定（**採用**）

`viewPath` を `resolvedSystems` 上でトラバースし、到達したノードの `kind` を使う。

```ts
function detectDrillDownLevel(viewPath: string[], resolvedSystems: SystemNode[]): DrillDownLevel {
  if (viewPath.length === 0 || resolvedSystems.length === 0) return "system";
  const system = resolvedSystems.find((s) => s.id === viewPath[0]);
  if (!system || viewPath.length === 1) return "system";

  let current: KrsNode = system;
  for (let i = 1; i < viewPath.length; i++) {
    const child: KrsNode | undefined = current.children.find((c) => c.id === viewPath[i]);
    if (!child) return "system"; // 途中でノードが見つからなければ system にフォールバック
    current = child;
  }
  const kind = current.kind;
  if (kind === "service") return "service";
  if (kind === "domain") return "domain";
  if (kind === "usecase") return "usecase";
  return "system";
}
```

**メリット**:
- AST の実際の構造を参照するため、将来の階層追加に強い
- ノードが見つからない場合は安全に `"system"` にフォールバックする

---

### 2. インタビュー自動開始の仕組み

Anthropic Messages API の制約として、`messages` 配列の最初のエントリは必ず `role: "user"` でなければならない。
AI が最初に喋る（アシスタントターンが先に来る）ことはAPIレベルで許可されていない。

#### 案A: ユーザーがボタンで明示的に開始（却下）

Chat ペインに「インタビューを開始する」ボタンを設置し、クリックで `sendMessage` を呼ぶ。

**デメリット**: Chat タブを開くだけで始まらない — 余分なクリックが必要でUXが低下する

#### 案B: 隠しトリガーメッセージ → AIの応答のみ表示（**採用**）

1. `startInterview()` でトリガーメッセージ `"インタビューを開始してください。"` を API に送る
2. API の応答（アシスタントの開始質問）だけを `messages` state に追加する
3. トリガーメッセージは `messages` state に追加しないため UI に表示されない
4. `ChatPane` の `useEffect` で mount 時に `startInterview()` を呼ぶ

```ts
// useChatSession.ts — startInterview の骨格
const startInterview = useCallback(async () => {
  const triggerMessages = [{ role: "user", content: "インタビューを開始してください。" }];
  const response = await client.messages.create({ ..., messages: triggerMessages });
  // AIの応答だけ state に追加（トリガーは追加しない）
  setMessages([{ id: crypto.randomUUID(), role: "assistant", content: textContent }]);
}, []);
```

```tsx
// ChatPane.tsx — auto-start
useEffect(() => {
  if (apiKey && messages.length === 0 && phase.kind === "idle") {
    void startInterview();
  }
  // messages と phase を deps から外し、AI応答後に再発火しないようにする
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [apiKey, sessionResetKey, startInterview]);
```

**メリット**:
- Anthropic API の制約を守りつつ、ユーザーには「AIが自発的に話しかける」UXを提供できる
- ユーザーはボタンを押す必要がなく、Chat タブを開くだけでインタビューが始まる

#### 案C: `system` prompt だけで AI に最初に喋らせる（却下）

`messages` を空にして API を呼ぶ。

**却下理由**: Anthropic API は `messages` 配列が空または最初が `assistant` ロールの場合エラーを返す。

---

### 3. `useEffect` deps の設計

自動開始 effect の依存配列に `messages` や `phase` を含めるかどうかが問題になった。

#### 問題: `messages` を deps に含めると無限ループになる

```ts
// NG: messages を deps に入れると AI 応答後に再発火する
useEffect(() => {
  if (messages.length === 0 && phase.kind === "idle") void startInterview();
}, [apiKey, sessionResetKey, startInterview, messages, phase]); // ← NG
```

`startInterview` が `setMessages([...])` を呼ぶ → `messages` が更新される → effect が再発火 → 無限ループ。

#### 採用: `messages` と `phase` を deps から外し、コメントで意図を明示

```ts
useEffect(() => {
  if (apiKey && messages.length === 0 && phase.kind === "idle") {
    void startInterview();
  }
  // messages と phase を deps から意図的に除外する：
  // AIの応答で messages が埋まった後に再度 startInterview が呼ばれることを防ぐ。
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [apiKey, sessionResetKey, startInterview]);
```

mount 時にのみ条件チェックを行い、以降は `apiKey`・`sessionResetKey`（プロジェクト切り替え時に変わる）・`startInterview` の変化だけで再発火する。

---

### 4. `viewPath` のプロップ経路

`viewPath` は `AppShell` で管理されており、`useChatSession` まで届けるためにプロップドリリングが必要になった。

#### 経路の確認

```
AppShell
  └─ EditArea        ← 今回追加: viewPath prop
       └─ EditPane   ← 今回追加: viewPath prop
            └─ ChatPane  ← 今回追加: viewPath prop
                 └─ useChatSession  ← 今回追加: viewPath param
```

`EditArea` コンポーネントは PR #489 で導入されており、`EditPane` のラッパーとして機能する。
今回 `viewPath` をこの経路に追加した。

**Context への昇格を検討しなかった理由**:
- `viewPath` は既に複数箇所（`KarasuPreviewColumn`・`useSystemView` 等）に props で渡されている
- `AppState` に追加すると `useAppContext` の呼び出し側全体に影響する
- 今回追加したレイヤー数（4 層）は許容範囲内

---

## 決定事項まとめ

| 論点 | 決定 | 根拠 |
|------|------|------|
| レベル検出方法 | 末尾ノードの `kind` を使う | AST構造変更に強い |
| 自動開始の仕組み | 隠しトリガーメッセージ | API制約を守りながらUXを維持 |
| `useEffect` deps | `messages`・`phase` を除外 | 無限ループ防止 |
| `viewPath` 経路 | プロップドリリング（4層） | Context 汚染を避ける |

---

## 未解決の問い

（なし — 全論点が実装で解決済み）
