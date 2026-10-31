---
paths:
  - ".oxlintrc.json"
---

# ソースの行数予算

**到達状態**: `packages/*/src` の `.ts` / `.tsx` / `.mts` / `.cts`（テスト・`*.d.ts`・`*.generated.ts`・
`packages/core/src/builtins/examples.ts` を除く）は、`.oxlintrc.json` の既定予算（600 行）以下か、
ファイルごとの pin の行数ちょうどにある。次の 2 つが通れば成り立っている:

```bash
pnpm lint
pnpm vitest run --config scripts/vitest.config.ts scripts/lint/line-budget.test.ts
```

`pnpm lint` の `eslint(max-lines)` はファイルが pin を超えて伸びたことを、
`scripts/lint/line-budget.test.ts` は pin がファイルの行数より高いまま残ったことを検出する。

## `eslint(max-lines)` で落ちたとき

**pin を上げる前に、コードを別のファイルへ移して行数を戻す。** 移せない理由があって pin を上げる
場合は、その理由（何をなぜ同じファイルに置く必要があるか）を PR 本文に書く。

- `eslint-disable` / `oxlint-disable` のコメントで `max-lines` を外さない（ルールを列挙しない
  全体の disable も同じ）。ratchet テストが予算の対象のソースにそのコメントがあると落とす。
- 既定予算を超える新しいファイルには pin を足さず、分割して予算内に収める。pin のあるファイルを
  rename・移動したときは、pin を新しいパスへ移す（新しいファイルとしては扱わない）。
- pin のあるファイルが縮んだら、同じ PR で pin を新しい行数に下げる。既定予算以下になったら
  pin の override ごと消す。ratchet テストが失敗メッセージで設定すべき値を示す。
- pin の override は既定予算の override より後ろに置く（oxlint は後ろの override を優先する）。
- 既定予算の値を変えること、既定予算の override の `excludeFiles` にパスを足すことは #3344 の
  決定を変えることなので、先に Issue を起こす。
