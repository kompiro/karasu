---
id: TPL-3416
title: "ブランチ保護を越えられる鍵を持つ job では、サードパーティのコードを動かさず、書けるパスを機械で検査する"
status: active
date: 2026-10-30
applicable_to:
  - "ruleset の bypass actor（deploy key・GitHub App）の鍵を使って保護されたブランチに push する workflow"
  - "依存の install や生成器の実行と、その結果の commit / push を同じ自動化で行う処理"
discovered_from:
  - issue: "#3416"
related_to:
  - TPL-2658
  - TPL-2786
topic: build
scope:
  packages: []
---

# TPL-3416: ブランチ保護を越えられる鍵を持つ job では、サードパーティのコードを動かさず、書けるパスを機械で検査する

## 観点

ruleset の bypass はパスで絞れず、ruleset 全体に効く。bypass actor の鍵を持つ job は、PR 必須も required check も越えて保護されたブランチに何でも書ける。したがって「その自動化が何を書くか」は、workflow の目的の説明ではなく、**鍵が届く範囲で実際に動くコード**で決まる。

鍵と同じ job で `pnpm install` や `npx` を実行すると、依存のどれか 1 つの install script が鍵を読めるので、その鍵の権限は依存ツリー全体に渡る。生成と commit を別の job に分け、鍵を持つ job では first-party の最小限の action と shell だけを動かし、push の前に変わったパスが許可の一覧の内側にあることを確かめる。こうすれば生成側が乗っ取られても、書けるのは許可したパスの中身だけになる。

## 想定される失敗モード

- 生成と commit を 1 つの job に書き、鍵を持った状態で依存の install script や生成器が走る
- 鍵を repository secret に置き、PR や他のブランチから起動した job でも読める
- commit job が `git add -A` で作業ツリー全体を commit し、生成物以外のファイルの変更も保護を越えて入る
- 許可するパスの一覧を workflow に直書きし、生成器の出力先（設定ファイル）が変わってもずれたままになる
- push が拒否されたり生成が失敗したりしても job が成功で終わり、保護されたブランチの生成物が古いまま誰も気づかない（TPL-2786）

## チェックリスト

保護を越えて push する workflow を追加・変更するとき:

- [ ] 鍵を使う job が 1 つだけで、その job が依存の install・`npx`・サードパーティの action を実行しないことをテストが確認している
- [ ] 鍵は保護されたブランチだけが使える environment の secret に置いてある
- [ ] push の前に、変わったパスが許可の一覧の内側にあることを job が確かめ、外れたら失敗する
- [ ] 許可の一覧は生成器の設定（出力先）から導くか、設定との一致をテストが確認している
- [ ] 生成・検査・push のどれかが失敗したら job が失敗する

## 既知の対処パターン

生成 job（鍵なし、`contents: read`）が依存を install して生成物を作り、生成物のパスだけを artifact に上げる。commit job（鍵あり）は checkout と artifact の展開だけを行い、パスを検査してから commit して push する。

workflow の宣言を読むテストは `scripts/ci/agentic-workflow-safety.test.ts`（TPL-2658）と同じ形で書ける。

## 関連テスト

- `scripts/ci/agentic-workflow-safety.test.ts`（自動化の書き込み範囲を宣言で検証する前例）
