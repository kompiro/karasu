---
id: TPL-20260510-18
title: "新しい入力経路 / 永続化 / 状態保持はすべて `.krs` テキストに収束させる"
status: active
date: 2026-05-10
applicable_to:
  - "ユーザー入力やAI出力を扱う新機能（chat / canvas 編集 / インポート / refactor wizard など）"
  - "セッション状態 / ユーザー設定 / 履歴 / キャッシュなど、モデルの一部を保持する追加コンポーネント"
  - "AI と対話して `.krs` を生成・編集する経路"
known_consumers:
  - chat-panel
  - translate-cli
  - editor-pane
  - app-shell
related_to: []
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
  - root_cause_adr: "ADR-20260317-02"
topic: core-concepts
scope:
  packages:
    - core
    - app
    - cli
    - vscode
---

# TPL-20260510-18: 新しい入力経路 / 永続化 / 状態保持はすべて `.krs` テキストに収束させる

## 観点

karasu の根幹原則は **`.krs` テキストが single source of truth (SoT)** であること（`docs/concepts.ja.md` の「目標 → karasu はアーキテクチャをテキストで記述する」節）。すべての入力経路 — 手書き、`karasu translate`、Chat パネル — は最終的に `.krs` テキストに収束し、図はそこから生成される。**テキストを迂回する経路は存在しない**。

新機能を追加するとき、無自覚に **「`.krs` の外側にも状態を持つ」** 設計をしてしまうと、SoT が分岐する。たとえば:

- Chat 履歴をモデルの一部として AI に渡しているが、`.krs` には書き戻していない
- Canvas 上のドラッグ操作で位置情報を保持しているが、`.krs` から復元できない
- AI セッションの「合意済みコンテキスト」を localStorage に置いて UI 挙動を変えているが、ファイル共有時に消える
- Refactor wizard が中間状態を React state に持ち、保存しないままタブを閉じると消える

これらが許されると、ユーザーが `.krs` ファイルを共有・コミット・diff しても **モデルが完全には伝わらない** ことになり、karasu の前提が崩れる。

## 想定される失敗モード

- ファイルを共有しても受け取った相手の手元で同じ図が再現できない（hidden state が転送されない）
- git diff / blame で「いつ何が変わったか」を辿れない（変更が `.krs` 外で起きている）
- ユーザーが手で `.krs` を編集しても期待通りに動かない（並行 SoT が古い状態を上書きする）
- AI と人間で並行に編集すると、どちらかが `.krs` 外の状態を持っていて conflict が観測されない

## チェックリスト

新しい機能 / 永続化 / 状態保持を追加するとき、以下を確認する:

- [ ] 機能が扱う **すべての state が `.krs` テキストから復元可能** か。あるいは `.krs.style` / `examples/` など karasu の正式アーティファクトに収まるか
- [ ] `.krs` に書かれない一時状態がある場合、それは **「別ユーザー / 別マシンで再現する必要がない」** ことが説明できるか（UI フォーカス位置や undo stack のような ephemeral state は OK、モデルの意味に関わる情報は NG）
- [ ] AI / Chat / 自動生成系の経路で、出力が **`.krs` テキストとして書き戻され**、人間が手で編集可能な状態に着地しているか（AI 内部メモリだけに保持していないか）
- [ ] 新しい入力経路（drag, voice, AI suggestion）が、最終的に **既存の text-editing パイプライン**（compile / format / save）を通っているか
- [ ] 機能の永続化先が複数ある場合、**SoT がどれか** を Design Doc / コメントで明示しているか。「両方が真」の状態を許していないか

## 既知の対処パターン

- AI / Chat の出力は **必ず `.krs` テキスト diff として提示** し、ユーザーが accept してから本ファイルに反映する。AI が直接 React state を書き換えない
- Canvas 編集（将来的に検討する場合も）は、操作のたびに **`.krs` を生成して既存パイプラインに流す** 設計とする。canvas 内部状態を SoT にしない
- ephemeral state（focus / scroll / undo）は **`.krs` に持たない** ことを明示し、永続化したくなったら設計を再評価する
- 新機能 PR の Design Doc に「どこに何を保存するか」「`.krs` から復元できる情報か」のセクションを設け、レビューで早期に発見する

## 関連テスト

- `packages/core/src/index.ts` — compile pipeline 入口（すべての機能はここを通るべき）
- `packages/app/src/hooks/` — view hooks（state を React に閉じ込めず `.krs` から派生させる）
- `docs/concepts.ja.md` 「目標 → karasu はアーキテクチャをテキストで記述する」
