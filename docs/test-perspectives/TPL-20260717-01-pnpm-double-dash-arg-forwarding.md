---
id: TPL-20260717-01
title: "pnpm run <script> -- <flag> は flag が下位ツールに届かないことがある。CLI 引数は下位ツールに直接渡す"
status: active
date: 2026-07-17
applicable_to:
  - "`pnpm --filter X <script> -- <flag>` / `pnpm run <script> -- <flag>` で下位ツール（vite / vitest / tsc など）に CLI 引数を渡す構成"
  - "同じツールを 2 経路（dev 経路と build/preview 経路など）で起動し、片方だけが引数を渡している設定"
  - "playwright webServer / CI スクリプトなど、port / host / 環境変数で挙動が分岐するプロセス起動コマンド"
known_consumers:
  - e2e
related_to:
  - TPL-20260510-15
discovered_from:
  - issue: "#2046"
  - root_cause_file: "packages/e2e/playwright.config.ts:8"
topic: testing
scope:
  packages:
    - e2e
---

# TPL-20260717-01: pnpm run <script> -- <flag> は flag が下位ツールに届かないことがある

## 観点

`pnpm --filter X <script> -- <flag>` と書くと `<flag>` が `<script>` の実体（`vite` など）に渡ると期待しがちだが、**pnpm のバージョンや script 定義によっては `--` 以降が下位ツールに届かず握りつぶされる**。#2046 では pnpm 10.33 で dev 経路の webServer command `pnpm --filter @karasu-tools/app dev -- --port ${PORT} --strictPort` が `--port` を vite に渡せず、vite は既定の 5173 に bind、Playwright は要求した `<PORT>` を待ち続けて 180s 後に timeout した。

厄介なのは **デフォルト値が一致していると症状が出ない**点。`<PORT>` の既定が 5173 のため通常は 5173 == 5173 で偶然通り、`PLAYWRIGHT_PORT` を非既定値にした瞬間（並行ローカル実行など）にだけ壊れる。CI は build+preview 経路（`exec vite preview --port`）を使い引数を正しく渡していたため無傷で、**dev 経路と CI 経路の非対称**（→ [[TPL-20260510-15]]）が発覚を遅らせた。

## 想定される失敗モード

- `--port` / `--host` などの CLI flag が下位ツールに届かず、ツールが既定値で起動する
- 既定値と要求値が偶然一致するケースだけ通り、値を変えた瞬間にだけ壊れる（環境依存の flaky に見える）
- 同一ツールを dev 経路と build/preview 経路で起動していて、片方（多くは CI 経路）だけが引数を正しく渡しているため CI では回帰が 0 件として通る
- エラーではなく「別 port に bind して待ち側が timeout」の形で観測され、原因が引数握りつぶしだと気づきにくい

## チェックリスト

プロセス起動コマンドやテスト設定で下位ツールに CLI 引数を渡すとき:

- [ ] `pnpm ... <script> -- <flag>` の形になっていないか。なっているなら **下位ツールを直接叩く**（`pnpm --filter X exec vite --port ...`）形に置き換え、引数が確実に届く経路にしているか
- [ ] 同じツールを 2 経路（dev / preview、local / CI など）で起動している場合、**両経路が同じ引数を同じ方法で渡している**か（片方だけ `--` 経由、片方だけ既定値依存になっていないか）
- [ ] port / host のような値を、**既定値と異なる値**で一度起動して実際に反映されるか確認したか（既定値のままだと引数無視のバグが隠れる）
- [ ] pnpm / npm のバージョン更新で `--` 転送の挙動が変わりうることを前提に、引数依存の起動は「直接叩く」で pin しているか

## 既知の対処パターン

- **下位ツールを `exec` で直接起動**する（#2046 の修正: `pnpm --filter @karasu-tools/app exec vite --port ${PORT} --strictPort`）。`<script> -- <flag>` の間接転送に頼らない
- 2 経路で同じツールを起動する設定は、**引数の渡し方を揃える**（CI 経路が `exec vite preview --port` なら dev 経路も `exec vite --port`）
- 引数が効いているかを **非既定値でスモーク**する（port なら `PLAYWRIGHT_PORT` を 5173 以外にして bind 先を確認）

## 派生元 spec

なし（test-infra の retrospective 観点。#2046 の bug 修正から抽出）
