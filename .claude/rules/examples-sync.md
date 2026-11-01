---
paths:
  - "examples/**/*.krs"
  - "examples/**/*.krs.style"
---

# examples 変更時の同期ルール

**到達状態**: `packages/core/src/builtins/examples.generated.ts` が `examples/` から生成した
ものと一致し、`examples/` の変更と生成物の変更が同じコミットに入っている。次が通れば成り立っている:

```bash
pnpm gen:examples --check
```

同じ検査を `scripts/examples/gen-builtin-examples.test.ts`（CI の `test:scripts`）と
pre-push の `examples-generated-check` も行う。

## examples を変更したら

1. `examples/` のファイルを直す
2. `pnpm gen:examples` を実行する
3. `examples/` と `examples.generated.ts` を同じコミットに入れる

生成物は手で直さない。直しても次の `pnpm gen:examples` で上書きされ、drift テストが落とす。
登録されていないディレクトリ（`hr-tool/` など）を変えたときは生成物が変わらないので、手順 2 は何もしない。

どのディレクトリを同梱するかは `scripts/examples/gen-builtin-examples.ts` の
`REGISTERED_EXAMPLES` が唯一の一覧で、`examples.ts` はそれを再 export しているだけである（#3345）。

## 生成が見てくれないこと

生成は中身を写すだけで、サンプルとして意味が通るかは見ない。次は人が揃える:

- `feature-samples/` に新サンプルを追加したら、カタログ役の `index.krs` にも 1 行追記する
- `facet-styling/` は `.krs` と `.krs.style` が対で意味を持つ。シートがサンプルの主題で、
  `index.krs` がシートを `@import` しなくなると開いても何も起きないプロジェクトになる
  （`packages/core/src/examples.test.ts` が import の残存だけ確かめる）
- `deploy-only/` / `org-only/` は Reference ウィンドウの Samples タブ（#1548）、
  `getting-started/`・`multi-file-system/`・`ec-platform/` は ProjectMode の seed に、
  en/ja のロケール一致版が使われる（#1642、#1777）。片方のロケールだけ直さず、両方を揃える

## 新しいディレクトリを同梱する

1. `examples/` にディレクトリを置く
2. `REGISTERED_EXAMPLES` に 1 行足す（定数名・ディレクトリ・`flat` / `staged`・説明）
3. `packages/core/src/builtins/examples.ts` と `packages/core/src/index.ts` の再 export に定数を足す
   （`gen-builtin-examples.test.ts` が `examples.ts` の export と登録表の一致を確かめる）
4. `pnpm gen:examples` を実行し、すべてを同じコミットに入れる

`flat` はディレクトリ直下の `.krs` / `.krs.style` をすべて同梱する（ファイルを足しても登録表は変えない）。
`staged` は `ec-platform/` の形で、直下の `.krs` と各サブディレクトリが 1 つずつのプロジェクトになり、
サブディレクトリの入口（`system.krs` か `main.krs` のちょうど 1 つ）は `index.krs` に改名される。
