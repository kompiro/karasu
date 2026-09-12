---
paths:
  - ".github/workflows/*.yml"
---

# workflow の timeout を置くルール

**到達状態**: テスト suite を走らせる job で、「suite がハングした」を意味する境界が
test step の `timeout-minutes` にあり、job の `timeout-minutes` はその境界に setup の
観測最大（現在 18 分）を足した値以上になっている。

```
pnpm test:scripts   # workflow-timeout-policy.test.ts が step / job 予算の関係を落とす
```

決定の経緯は [ADR-2807](../../docs/adr/2807-suite-budget-clears-its-setup.md)
（[ADR-2805](../../docs/adr/2805-suite-timeout-bounds-the-test-step.md) を supersede）、
観点は [TPL-2805](../../docs/test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md)。

## なぜ job 側だけではいけないか

これらの job は OS パッケージを境界のない `apt-get` で入れる（観測最大 1013s）。
job 予算 1 本が setup と suite の両方を覆っていると、遅い mirror を引いた日に
**1 件も落ちていない suite が打ち切られ、赤い Required check になる**。赤の意味が
「テストが落ちた」と一致しなくなるのが、この形の実害である。

job 予算が `step 境界 + setup 観測最大` に届いていない場合も同じことが起きる。
数字が大きいだけで、先に発火するのは job 側の kill になる。

## 値を変えるとき

`scripts/ci/workflow-timeout-policy.test.ts` の `SUITE_JOBS` と ADR-2807 の表を同じ
PR で更新する。テストは値の drift を落とすが、ADR の散文が古くなったことは落とせない。

setup の観測最大（`OBSERVED_SETUP_MINUTES`）は **job ごとに測り直さず、全 job 共通の
1 つの値**として扱う。同じランナークラスで同じ mirror を引くので、速い日ばかり
引いた job は安全なのではなく標本が無いだけである。

## suite の job を増やすとき

`SUITE_JOBS` に登録する。登録を忘れた `*e2e*.yml` は guard が落とすが、別の名前の
workflow は落ちないので、test step を持つ job を足したらこのファイルに戻る。
