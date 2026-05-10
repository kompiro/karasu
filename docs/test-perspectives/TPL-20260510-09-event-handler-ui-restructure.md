---
id: TPL-20260510-09
title: "UI 構造を変える event handler は次描画でマウントされる target への event 漏れを防ぐ"
status: active
date: 2026-05-10
applicable_to:
  - "submit / confirm / cancel などで自身の DOM を unmount し、別要素を mount する inline editor / modal / 行内編集 UI"
  - "Enter / Escape / Space などの keyboard event を処理する UI で、handler 内で React state を変えて次フレームで子要素が入れ替わるパターン"
known_consumers:
  - project-selector
related_to:
  - TPL-20260510-04
discovered_from:
  - issue: "#948"
  - root_cause_file: "packages/app/src/components/ProjectSelector.tsx"
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260510-09: UI 構造を変える event handler は次描画でマウントされる target への event 漏れを防ぐ

## 観点

inline editor のような UI で、Enter キーの押下で「現在の input を unmount → 別のボタン群を mount」という構造変化を **同期的に** 起こすと、その keydown が次フレームで mount された別ボタン（フォーカスされやすい位置にある file input や primary button）に伝播・activate してしまうことがある。

ブラウザ側の挙動として、`keydown → keypress → keyup → click（Enter で activate）` のシーケンスは React の re-render を跨いで進行する。途中で UI 構造が変わると、後段のイベントが「意図しない後継者」に届く。`stopPropagation()` / `preventDefault()` を入れていない、もしくは form 構造で submit を閉じ込めていないと、漏れる。

#948 では「新規プロジェクト名 input で Enter → プロジェクト作成 → input が unmount → import button が mount → Enter が import button に届いて click 動作 → file picker が開く」という連鎖が発生していた。

## 想定される失敗モード

- inline 編集を Enter で確定したら、確定動作と **同時に** 別の機能（import / cancel / 別 modal を開く）が起動する
- Escape で modal を閉じたら、その下にあった button にフォーカスが移って次の Escape / Enter が誤発火する
- 「確定後に予期しない dialog / file picker が開く」「キーボード操作で 1 アクションが 2 アクションになる」現象として観測される
- マウスでは再現しないため、キーボード操作主体のユーザーや E2E test でしか発覚しないことがある

## チェックリスト

inline editor / 行内 confirm UI を実装するとき、以下を確認する:

- [ ] handler 内で React state を変えて UI 構造が入れ替わる場合、**event 漏れを防ぐ手段** が明示的に入っているか（`e.preventDefault()` + `e.stopPropagation()` / `<form onSubmit>` でラップ / handler 内で focus を別所に移す）
- [ ] 確定 / cancel 後にフォーカスが落ちる先の要素（次に mount される button / input）を意識しているか。クリックで activate される要素の隣に inline editor を置いていないか
- [ ] Enter / Escape の両方向で「1 押下 = 1 アクション」が成立するテストがあるか（`fireEvent.keyDown(input, { key: "Enter" })` の後に副次アクション handler が呼ばれていないことを assert）
- [ ] マウス操作の test だけでなく、キーボード操作の regression test を持っているか

## 既知の対処パターン

- 最も堅いのは **`<form>` でラップして `onSubmit` で受け、`event.preventDefault()` を呼ぶ** こと。ブラウザの submit 経路に乗せれば、Enter キーの後段イベントは form 内で消化される
- `e.preventDefault()` は default action（button activate）を、`e.stopPropagation()` は親要素への bubble を、それぞれ止める。**両方** 入れるのが安全
- 確定後の focus 先を **明示的に** 指定する（`select.focus()` など）。default の focus 移動に任せると「次の tabIndex」がたまたま危険な要素になっていた、という事故が起きる
- TPL-20260510-04 が扱う「composition 中の DOM 介入」と発火源は違うが、**「UI の状態遷移と入力イベントの寿命がずれる」** という根は近い。両方を意識して focus / event lifecycle を扱う

## 関連テスト

- `packages/app/src/components/ProjectSelector.test.tsx`
