---
paths:
  - ".github/workflows/*.yml"
---

# workflow の timeout を置くルール

**到達状態**: テスト suite を走らせる job で、「suite がハングした」を意味する境界が
test step の `timeout-minutes` にあり、job の `timeout-minutes` はその境界に setup の
観測最大（18 分）と teardown 分（2 分）を足した値以上になっている。

```
pnpm test:scripts   # workflow-timeout-policy.test.ts が step / job 予算の関係を落とす
```

決定の経緯は [ADR-3257](../../docs/adr/3257-e2e-step-bound-follows-suite-growth.md)
（[ADR-2807](../../docs/adr/2807-suite-budget-clears-its-setup.md) を supersede。
不変条件は ADR-2807 と [ADR-2805](../../docs/adr/2805-suite-timeout-bounds-the-test-step.md) から引き継ぐ）、
観点は [TPL-2805](../../docs/test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md)。

## なぜ job 側だけではいけないか

これらの job は OS パッケージを境界のない `apt-get` で入れる（setup の観測最大は
job 開始から test step 開始まで 1030s、うち `apt-get` が 1013s。run 34600028141）。
job 予算 1 本が setup と suite の両方を覆っていると、遅い mirror を引いた日に
**1 件も落ちていない suite が打ち切られ、赤い Required check になる**。赤の意味が
「テストが落ちた」と一致しなくなるのが、この形の実害である。

job 予算が `step 境界 + setup 観測最大 + teardown` に届いていない場合も同じことが
起きる。数字が大きいだけで、先に発火するのは job 側の kill になる。teardown を足すのは
test step の後ろに `if: always()` の artifact upload が並ぶからで、ここを削ると
ハングした suite の report が途中で切れる。

## 値を変えるとき

`scripts/ci/workflow-timeout-policy.test.ts` の `SUITE_JOBS` を更新し、同じ PR で
ADR-3257 を supersede する ADR に新しい表を書く（ADR 本文は着地後に編集しない —
ADR-2687）。テストは値の drift を落とすが、ADR の散文が古くなったことは落とせない。

step 境界はハングの判定であって余裕の見積もりではない。通った run の所要時間が
境界の 8 割を超えたら、値を上げる前に suite の短縮（`workers` / shard）を検討する。

setup の観測最大（`OBSERVED_SETUP_MINUTES`）は **job ごとに測り直さず、全 job 共通の
1 つの値**として扱う。同じランナークラスで同じ mirror を引くので、速い日ばかり
引いた job は安全なのではなく標本が無いだけである。

## suite の job を増やすとき

`SUITE_JOBS` に登録する。登録を忘れた `*e2e*.yml` は guard が落とすが、別の名前の
workflow は落ちないので、test step を持つ job を足したらこのファイルに戻る。
