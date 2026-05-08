---
id: ADR-20260508-01
title: "GUI 駆動の `.krs.style` 編集 — 単一プロパティ rule は in-place 更新、その他は append fallback"
status: accepted
date: 2026-05-08
topic: app-ui
supersedes:
  - ADR-20260506-01
related_to:
  - ADR-20260506-02
  - ADR-20260506-03
  - ADR-20260506-06
scope:
  packages: [app]
assumptions:
  - "file: packages/app/src/lib/append-style-rule.ts"
  - "symbol: packages/app/src/lib/append-style-rule.ts :: upsertStyleProperty"
  - "symbol: packages/app/src/lib/append-style-rule.ts :: upsertEdgeDirectionRule"
---

# ADR-20260508-01: GUI 駆動の `.krs.style` 編集 — 単一プロパティ rule は in-place 更新、その他は append fallback

- **日付**: 2026-05-08
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1142](https://github.com/kompiro/karasu/issues/1142)
  - 上位 Issue: [#1076](https://github.com/kompiro/karasu/issues/1076) — GUI-driven style editing 全体
  - Design Doc: [`docs/design/inplace-update-style-rule.md`](../design/inplace-update-style-rule.md)
  - 旧決定: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)（append-only round-trip — 本 ADR で supersede）
  - 前提: [ADR-20260506-02](./20260506-02-edge-id-selector.md)（`edge#<canonicalId>` selector）

## 背景

ADR-20260506-01 は GUI 編集を **append-only** と決めた。当時の主な根拠は:

1. Edge を一意に指す ID が無く、「同じ rule に対する更新」を判定する手段が無かった
2. 整形・コメントを保つ AST writer の作り込みが重いと見積もった

ADR-20260506-02 で `edge#<canonicalId>` セレクタが定義・実装され、(1) は
解消した。GUI で同じ edge の direction を 3 回変えたら `.krs.style`
末尾に同じ ID rule が 3 個積まれる現状は、cascade-tail 勝ちで効果は
正しいものの、ファイル diff が iterative editing のたびに膨らみ、PR
レビューにも実体観察にも優しくない。

(2) も、GUI が書き出す rule は **必ず単一行・単一プロパティ** だという
構造的特徴を使えば、AST writer 無しで安全に in-place 更新できる、と
Design Doc で確認した。

## 決定

`.krs.style` への GUI 書き込みを **upsert** に変更する:

1. ファイル末尾から、対象 selector に **完全一致** する rule block を探す
2. 見つかったブロックが以下を **全て満たす** 場合は、対象プロパティの値
   だけを書き換える（in-place 更新）:
   - block 内に `/* */` または `//` コメントを含まない
   - block 内のプロパティ宣言が **ちょうど 1 つ**
3. それ以外は、従来どおり末尾に `selector { property: value; }` を **append**
   する（fallback）

実装は `packages/app/src/lib/append-style-rule.ts` の
`upsertStyleProperty(content, selector, property, value)` に集約し、
selector 種別非依存にする。`edge#<id>` でも `#<nodeId>` でもそのまま
扱える。GUI 側 wrapper は `upsertEdgeDirectionRule(...)` のみ提供（旧
`appendEdgeDirectionRule` は廃止）。

「単一行」の判定は厳密な 1 行ではなく、`{ ... }` の中身に **改行を含んで
よい**。プロパティ数が 1 でコメント無しなら in-place 対象とする。手書き
の軽い整形（`{`/`}` を別行に置くなど）にも追従する。

fallback 発火時のユーザー通知は **行わない**。fallback そのものが複雑
ケース限定で、ユーザーがファイルを開けば気付ける。トースト等の UI 追加
は避ける。

## 理由

- **iterative editing の体験が改善**: GUI で同じ edge を何度切り替えても
  `.krs.style` は 1 行のまま。ファイル diff も PR レビューも軽い
- **GUI が書いた rule は必ず単一行 + 単一プロパティ**: 「単一プロパティ・
  コメント無し」を構造的特徴にすれば、GUI が生成したものは全て in-place
  対象に乗る。手書きの複数プロパティ rule・コメント混じり rule は append
  に倒れるので、「ユーザーが整形した手書き rule を壊す」リスクが事実上
  ゼロ
- **AST writer 不要**: テキストレベルの正規表現スキャナで足りる。
  parser 拡張・lexer trivia 設計を回避できる
- **selector 種別非依存**: `upsertStyleProperty` を node ID rule にも
  使い回せる。GUI に node 用 context menu が増えても追加実装が要らない
- **cascade との整合性**: 「最後に出現した block を更新」は cascade-tail
  勝ちと一致する。effective な値が変わらない

## 却下した案

### 案: append-only のまま、`Tidy Style` コマンドで後から整理する（旧 ADR-20260506-01 の方針）

- 却下理由: iterative editing 中は常にファイルが膨らみ、Tidy を打つまで
  ノイジー。ユーザーが Tidy を忘れたまま PR を出すと diff レビュアーが
  困る。「自分で散らかして自分で掃除する」設計は初学者の観察した state
  と効果がズレやすい。Tidy Style は依然必要（過去の累積を整理するユース
  ケースは残る）が、予防策として in-place を入れる方がトータルで体験が
  良い

### 案: parser 拡張による位置情報付き AST + AST writer

- 却下理由: parser/lexer の trivia 保持が必要で実装範囲が広い。GUI が
  扱う rule は単一プロパティに留まるので、コストに見合わない。本格的な
  round-trip が必要になった段階で改めて検討

### 案: GUI 生成 rule に `/* karasu:gui */` マーカーを付ける

- 却下理由: `.krs.style` を読む人にノイズが増える。GUI 由来 rule を
  「単一行・単一プロパティ」という構造的特徴で識別すれば、マーカー無しで
  同じ安全性が得られる

### 案: fallback 時にトーストで通知

- 却下理由: トースト用の UI コンポーネント追加が必要で、機能対比の
  コストが大きい。fallback そのものが複雑ケース限定で、ユーザーは
  ファイルを開けば 1 行 vs 2 行で識別できる。MVP では沈黙で十分

## スコープ外（フォローアップ）

- **Tidy Style コマンド**: 旧累積を一括整理するコマンドは依然必要
  （実装は別 Issue）
- **複数プロパティ rule の in-place 更新**: 現状 GUI が書き出すのは
  単一プロパティのみなので不要。将来 GUI が複数プロパティを 1 度に書く
  メニューを持ったら再検討
- **編集 race**: ユーザーが Monaco でファイルを開いたまま GUI で書き込む
  場合の競合は、editor 側のリロード経路で別途扱う
