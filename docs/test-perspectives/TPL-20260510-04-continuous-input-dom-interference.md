---
id: TPL-20260510-04
title: "ユーザーの連続操作中は DOM / state を破壊する別系統の処理を抑止する"
status: active
date: 2026-05-10
applicable_to:
  - "ユーザーの連続入力（IME composition / drag / touch / 長押し）を扱う UI コンポーネント全般"
discovered_from:
  - issue: "#1053"
  - root_cause_file: "packages/app/src/components/EditorPane.tsx:127"
  - root_cause_file: "packages/app/src/components/AppShell.tsx:159"
related_to: []
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260510-04: ユーザーの連続操作中は DOM / state を破壊する別系統の処理を抑止する

## 観点

ユーザーの操作には「単発（クリック・キー押下）」と「連続（IME composition、ドラッグ、タッチ、長押し）」の 2 種類がある。連続操作の **開始（compositionstart / pointerdown / touchstart）から終了（compositionend / pointerup / touchend）までの区間** は、ブラウザや OS が内部状態を保持している。この区間中に、別系統の処理（再描画・状態同期・controlled component の値更新など）が DOM を書き換えると、内部状態が壊れる。

#1053 では、エディタの値を毎キーストロークで親に伝搬し、parser → renderer パイプラインを起動して controlled `value` prop を更新していたため、IME composition 中の中間値で値が書き戻され、Google JP IME（Blink）で文字が落ちる / 重複する現象が起きた。

## 想定される失敗モード

- 日本語 / 中国語 / 韓国語など IME を使う環境でだけ、文字が落ちる・重複する・確定前の文字列が消える
- ドラッグ中にコンポーネントが再 mount されてポインタトラッキングが切れる
- アクセシビリティツール経由の入力で composition 状態が壊れる
- 開発者の手元（英語キーボード・マウス）では再現せず、ユーザー報告でしか分からない

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] ユーザーの連続操作（compositionstart→compositionend / pointerdown→pointerup / touchstart→touchend）が発生しうる UI かどうかが識別されているか
- [ ] 連続操作の最中に DOM を操作する別系統の処理（再描画 / state 同期 / controlled value の書き戻し / debounce ベースの side effect）の有無が把握されているか
- [ ] 走る場合、操作の境界を尊重するガードが入っているか（compositionEnd まで buffer する / `isComposingRef` でガードする / debounce のタイミングを境界後にずらす）
- [ ] IME（少なくとも日本語 IME on Blink）/ モバイルタッチ / スクリーンリーダーなど、開発環境で再現しにくい入力経路で動作確認されているか

## 既知の対処パターン

- `isComposingRef` のような `useRef<boolean>` フラグを `onDidCompositionStart` / `onDidCompositionEnd` で立て下ろし、composition 中は `pendingValueRef` に値を貯めて compositionEnd で flush する（`EditorPane.tsx:127` 周辺の現在の実装）
- controlled component の prop を不要に頻繁に更新しない（必要なときだけ親 state を同期する）
- debounce / throttle を入れる場合、connection 単位（composition 開始〜終了）でリセットする

## 関連テスト

- `packages/app/src/components/EditorPane.test.tsx`
