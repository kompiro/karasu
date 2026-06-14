---
id: TPL-20260613-03
title: "非同期 effect は入力変化・unmount で in-flight 結果を破棄してから publish する"
status: active
date: 2026-06-13
applicable_to:
  - "useEffect の中で await した結果を setState / dispatch する hook（debounce 付きコンパイル、fetch、ファイル read など）"
  - "依存配列が頻繁に変わる入力（entryPath / viewPath / 選択中アイテム）で再実行される非同期 effect"
known_consumers:
  - view-compile-hooks
discovered_from:
  - issue: "#1534"
  - issue: "#1540"
  - root_cause_file: "packages/app/src/hooks/useDebouncedCompile.ts"
related_to:
  - TPL-20260510-08
  - TPL-20260613-02
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260613-03: 非同期 effect は入力変化・unmount で in-flight 結果を破棄してから publish する

## 観点

`useEffect` 内で `await` した結果を `setState` する hook は、await 中に依存が変わる（別のファイル/ビューに切り替わる、unmount する）と、**古い実行の遅延結果が新しい実行の state を上書き**しうる。とくに **diff モードや重いコンパイルは遅い**ため、後発の高速な実行が先に publish した後で先発の遅い結果が後着し、画面が前のファイル/ビューに化ける。

`clearTimeout` で debounce タイマーを止めても、**すでに発火して await 中の処理は止まらない**。await の後・setState の前に「この実行はまだ最新か」を確認する必要がある。#1534 では `useSystemView` / `useDeployView` / `useOrgView` がいずれも cancel チェックを持たず、高速なファイル/ビュー切替で stale 結果を表示しうる状態だった（#1540 で共有 `useDebouncedCompile` に集約して修正）。

## 想定される失敗モード

- ファイル/ビューを素早く切り替えると、一瞬前のファイル/ビューの内容が表示される（後着した stale 結果）
- diff モード（`Promise.all` で base + diff）が plain compile より遅く、その後着で平常表示が崩れる
- unmount 後に setState され、React の警告や（古い React では）リークになる
- ハッピーパス（単一コンパイル）のテストは緑。並行・高速切替でしか出ない

## チェックリスト

非同期 effect を実装・修正するとき:

- [ ] effect の cleanup で `let cancelled = false` を `true` にし、**await の直後・各 setState の前に `if (cancelled) return`** しているか（成功経路と catch 経路の両方）
- [ ] `clearTimeout` だけで満足していないか（タイマーは止まるが発火済みの非同期処理は止まらない）
- [ ] 「遅い先発実行 → 速い後発実行 → 先発が後着」で **後発が勝つ** ことを検証する negative test があるか（deferred promise を逆順に resolve する等）
- [ ] publish 経路は 1 箇所に集約されているか（TPL-20260510-08）。集約先に cancel チェックを置けば全消費者が守られる

## 既知の対処パターン

- effect スコープに `let cancelled = false;` を置き、`return () => { cancelled = true; ... }`。await 後に `if (cancelled) return;`（`useDebouncedCompile` の実装）
- AbortController が使える I/O（fetch 等）は signal も渡して**実処理自体も中断**する。CPU バウンドな compile は中断できないので、最低限「結果を捨てる」cancel チェックで stale publish を防ぐ
- debounce + 非同期 + publish を**共有 hook に集約**し、cancel・fingerprint dedup・keep-stale をまとめて一箇所で正す（#1540）

## 派生元 spec

なし（retrospective TPL — #1534 / #1540 から抽出）。

## 関連テスト

- `packages/app/src/hooks/useDebouncedCompile.test.tsx`（dep 変化で in-flight 結果を破棄 / error→recovery で再 publish）
- `packages/app/src/hooks/useDeployView.test.tsx`（error→同一内容 recovery で diagnostics が解除される — #1540）
