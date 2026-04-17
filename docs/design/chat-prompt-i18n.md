# Chat システムプロンプトの i18n

- **日付**: 2026-04-17
- **ステータス**: ドラフト
- **関連**:
  - [Issue #639](https://github.com/kompiro/karasu/issues/639) — Chat: switch system prompt to English for non-Japanese users
  - [Issue #34](https://github.com/kompiro/karasu/issues/34) — Add i18n support for English and Japanese（アプリ全体の i18n）
  - [docs/design/i18n-support.md](./i18n-support.md) — アプリ全体の i18n 設計（locale 解決ロジックの決定済み）
  - [Issue #638](https://github.com/kompiro/karasu/issues/638) — Chat を syntax 未習得ユーザーの入口として検証するユーザーテスト計画

## 背景・課題

`packages/app/src/hooks/useChatSession.ts` の `buildSystemPrompt()` 関数（~120 行）は日本語でハードコードされている。その結果:

- **英語ユーザーにとって Chat が使い物にならない**: AI の応答の質が日本語プロンプトの影響で揺れ、英語圏ユーザーが karasu の onboarding 経路として Chat を使えない
- **#638 の仮説検証がブロックされる**: 「syntax を知らないユーザーが Chat だけでアーキテクチャを描ける」という仮説の検証は、非日本語話者の被験者なしには成立しない
- **karasu の positioning と矛盾**: `docs/concepts.md` の "karasu と AI" 節は karasu を「人間と AI が同じ言語で語り合う DSL」と位置づけているが、現実には対話言語が日本語に固定されている

## 制約・前提

- **#34 の設計を前提に乗る**: `docs/design/i18n-support.md` で既に `Locale` 型、`resolveLocale()`、`localStorage['karasu-locale']` などが決定している。これを逸脱する独自機構は作らない
- **#34 全体はまだ未実装**: 翻訳マップ、`useTranslation` hook、UI 全体の翻訳対応はまだ入っていない。#639 は #34 の完全な着地を待つと、#638 のユーザーテストが長く止まる
- **system prompt は単純な UI 文字列ではない**: 動的に scope ラベル・ファイル内容・モデルグラフ・インタビューガイドを織り込む。翻訳マップ（`Translations` 型）の key/value モデルに収まらない
- **`.krs` 構文（DSL）は言語非依存**: プロンプト内で使われる system / service / domain 等の語彙は翻訳対象外
- **AI の応答言語はユーザーの入力言語に追従する**: プロンプトの translate 対象は "AI への指示" のみ。AI が生成する自然文応答は LLM が勝手に言語を合わせる

## 検討した選択肢

### 案 A: #34 の完全着地を待ち、その枠内で実装

`Translations` 型と `packages/i18n/` が先に立ち上がってから、system prompt もそのマップに含める。

**メリット**:
- 設計が一貫する（1 種類の翻訳基盤のみ）
- 二度手間がない

**デメリット**:
- #34 のスコープが大きく、着地までの期間が読めない
- #638 のユーザーテストが長期間ブロックされる
- system prompt は `Translations` 型（key → string）に収まらないため、結局 #34 のマップとは別の仕組みが必要になる可能性が高い

### 案 B: #34 から locale 解決ロジックだけ先行実装

`resolveLocale()` と `localStorage` の永続化だけを #34 の決定どおりに先に入れ、system prompt はそれを使って切り替える。UI の言語セレクタは #34 を待つ。

**メリット**:
- #639 が独立して着地できる
- #34 実装時に捨てる必要がない（決定済み API をそのまま採用）
- ブラウザの言語設定から自動検出されるので、UI セレクタなしでも英語ユーザーは救える

**デメリット**:
- 言語をユーザーが UI から明示的に切り替えられないので、検出結果が誤るケースは localStorage を手で書き換えるしかない
- #34 の翻訳マップ基盤との統合は後続作業になる

### 案 C: system prompt を独自のプロンプトビルダーパッケージに分離

`packages/chat-prompts/` のような独立パッケージに日英両言語のプロンプトを置き、`buildSystemPrompt(locale, state)` を公開する。

**メリット**:
- プロンプトが app から独立し、将来 CLI や他のインターフェースから使い回せる
- テストが書きやすい

**デメリット**:
- #34 の設計が想定していない構造を持ち込むことになる
- 現時点では CLI から chat prompt を使う要件が具体化していない（overengineering）

## 比較

| 論点 | 案 A | 案 B | 案 C |
|------|------|------|------|
| 着地までの期間 | 長い（#34 依存） | 短い | 中 |
| #638 のアンブロック | 遅い | 早い | 早い |
| #34 の設計との整合 | ◎ | ◎ | △（独自構造） |
| 将来の移行コスト | ゼロ | 小（翻訳マップへの統合のみ） | 中（独立パッケージの再編） |
| UI セレクタ | 入る | 後続 | 後続 |
| 一言 | 完璧主義 | プラグマティック | 過剰設計 |

## 現時点の方針

**案 B を採用する**。

### 決定事項

#### 1. locale 解決は #34 の決定に準拠

`docs/design/i18n-support.md` の決定どおり、以下を先行実装する:

```typescript
// packages/app/src/i18n/locale.ts
export type Locale = 'en' | 'ja';

export function resolveLocale(): Locale {
  const stored = localStorage.getItem('karasu-locale');
  if (stored === 'en' || stored === 'ja') return stored;
  return navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function setLocale(locale: Locale): void {
  localStorage.setItem('karasu-locale', locale);
}
```

- 配置・関数名・localStorage キーはすべて #34 の決定と一致させる
- `setLocale()` は今回は呼び出されない（UI セレクタは #34 で追加）が、API として公開しておく

#### 2. system prompt は `Translations` マップに乗せない

system prompt は純粋な「文字列 → 文字列」ではなく、`buildSystemPrompt(state)` が動的に組み立てる長文の指示群である。これを `Translations` の key/value に収めようとすると、動的部分を無数のキーに分解するか、テンプレート補間を自前で実装するかになる。いずれも破綻しやすい。

代わりに、**locale ごとの `buildSystemPrompt` 実装を並列に持つ**:

```typescript
// packages/app/src/hooks/useChatSession.ts
function buildSystemPromptJa(state: ChatState): string { /* 既存 */ }
function buildSystemPromptEn(state: ChatState): string { /* 新規 */ }

function buildSystemPrompt(locale: Locale, state: ChatState): string {
  return locale === 'ja' ? buildSystemPromptJa(state) : buildSystemPromptEn(state);
}
```

動的な差し込み箇所（scope ラベル、ファイル内容、モデルグラフ、インタビューガイド）は、
両言語で同じ変数を受け取って同じ位置に埋め込む。差異は純粋に指示の言語のみ。

#### 3. system prompt の抽出

useChatSession.ts は既に 1100 行を超えており、両言語のプロンプトを追加するとさらに ~240 行増える。
可読性のため、system prompt のビルダー関数のみを別ファイルに抽出する:

```
packages/app/src/hooks/
  useChatSession.ts              ← 既存（buildSystemPrompt の中身を外出し）
  useChatSession.prompt.ts       ← 新規: buildSystemPromptJa / buildSystemPromptEn
```

`Translations` 型との統合は後続（#34 の着地時）で検討する。
プロンプトビルダーを `packages/i18n/` 側に移すかどうかも、#34 が `packages/i18n/` を作る際に併せて判断する。

#### 4. locale の適用タイミング

**chat セッションごとに 1 回解決する**。turn ごとに解決すると、セッション途中で localStorage が書き換わった場合に AI の振る舞いが不安定になる。

セッションの start 時（最初のユーザーメッセージ送信時）に `resolveLocale()` を呼び、以降の全 turn で同じ locale を使う。ユーザーが切り替えたい場合は chat をリセットする。

#### 5. テスト戦略

- **ユニットテスト**: `buildSystemPromptJa` / `buildSystemPromptEn` に同じ state を与え、両方とも非空であること、期待するキーワード（"You are an architect" / "あなたは..."）を含むことを検証する
- **両言語で全文を diff してはいけない**: テストが翻訳の細部に過度に縛られると、表現の調整のたびにテストが壊れる。検証するのは「骨格が一致している」「各セクションの見出しがある」「指示の方向性が保たれている」といった構造レベル
- **regression チェック**: 既存の日本語プロンプトの内容が PR 後も同一であること（実装差分で意図せず書き換わっていないこと）

### 移行パス（#34 との接続）

#34 が着地する時点で以下を行う:

1. `packages/app/src/i18n/locale.ts` を `packages/i18n/` に移動（#34 がそれを想定している）
2. system prompt のビルダー関数も `packages/i18n/` に移すか、`packages/app` に残すかを判断
3. UI の言語セレクタから `setLocale()` が呼ばれるようになるので、localStorage の書き込み経路は変わらず自然に統合される

これらは今回のスコープ外。

## ADR 化の予定

実装完了後、以下を含む ADR として昇格する:

- 設計上の決定（#34 の決定を採用、案 B、`buildSystemPrompt` の分離、locale はセッション単位）
- 却下した案（A: 待つ、C: 独立パッケージ）
- 移行パス（#34 との接続計画）
- ファイル名案: `YYYYMMDD-NN-chat-prompt-i18n.md`
