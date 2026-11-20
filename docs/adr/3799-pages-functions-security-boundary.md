---
id: ADR-3799
title: app の Pages Functions を security 境界に数え、function が直接 import するモジュールを esbuild の解決で境界に保つ
status: accepted
date: 2026-11-20
topic: build
authors: [kompiro]
refines:
  - ADR-3286
related_to:
  - ADR-1862
scope:
  packages: [app, core]
  concerns:
    - ci
    - security
assumptions:
  - 'grep: scripts/review/tier.ts :: "functions/\*\*"'
  - 'grep: scripts/review/tier.ts :: "packages/app/src/render/\*\*"'
  - 'grep: scripts/review/tier.ts :: "packages/core/src/renderer/ogp-frame.ts"'
  - "symbol: scripts/review/function-imports.ts :: checkImports"
  - "symbol: scripts/review/function-imports.ts :: bundledImports"
  - "symbol: scripts/review/function-imports.ts :: readImports"
  - "symbol: scripts/review/function-imports.ts :: WRANGLER_CONDITIONS"
  - 'grep: .oxlintrc.json :: "no-restricted-globals"'
  - 'grep: package.json :: "lint": "oxlint [^"]*functions/'
---

# ADR-3799: app の Pages Functions を security 境界に数え、function が直接 import するモジュールを esbuild の解決で境界に保つ

- **日付**: 2026-11-20
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#3799](https://github.com/kompiro/karasu/issues/3799)、後続 [#3827](https://github.com/kompiro/karasu/issues/3827)（import のグラフ全体をたどる）
  - PR: [#3824](https://github.com/kompiro/karasu/pull/3824)
  - 関連 ADR: [ADR-3286](./3286-risk-based-review-tiers.md)（リスク段階）, [ADR-1862](./1862-typescript-7-native-compiler.md)（TypeScript 7 の採用。JS の compiler API が無い）

## 背景

`scripts/review/tier.ts` の `SECURITY_TIER_GLOBS` は、app の Cloudflare Pages Functions を security 境界に数えていなかった。そのため次のコードを変える PR が Medium になり、`/security-review` も求められなかった。

- `functions/**`: `/render`、`/s`、`/r/*`、catch-all に答える。`functions/_lib/share-raster.ts` はクエリから作った入力を resvg に渡す
- `packages/app/src/render/**`: function がクエリやパスを読む処理、`/s` のページ、permalink の解決を任せる先
- `packages/core/src/renderer/ogp-frame.ts`: `/render` のクエリの `bg` を OGP の枠の SVG に書き込む

#3773（PR #3803）は、信頼できない `/render` のクエリの値が SVG に届く経路を変えたのに Medium と判定され、手で `risk: high` を付けた。

globs を足すだけでは足りない。function が新しく import したモジュールが globs に無ければ、そのモジュールを変える後の PR はまた Medium になる。なので、function が import するモジュールが境界の上にあることを、テストで確かめ続ける必要がある。

## 決定

上の 3 つを `SECURITY_TIER_GLOBS` に加える。あわせて、`functions/**` の各 function が直接 import するモジュールが境界から外れたら落ちるテストを置く（`tier.test.ts` と `scripts/review/function-imports.ts`）。import の解決は、wrangler が渡すのと同じオプションで esbuild に任せる。実行時に計算される specifier だけは @babel/parser で構文から読む。`functions/**` では lint で `require` を禁じる。

テストは次のとき、理由と行を付けて落ちる（fail closed）。

- 計算される specifier と、esbuild がバンドルしない呼び出し
- 許可リストに無い Node 組み込み。Pages は `nodejs_compat` なしで function を動かすので、リストは空にしてある
- 許可リスト（`@resvg/resvg-wasm`）に無いパッケージ、許可したパッケージから `..` で外へ出る specifier、許可した名前が解決できないとき
- 解決できない import、境界の外のファイルに解決される import（リンクの先も含む）、境界の外を指すリンクになっている function
- esbuild が function 以外のモジュールの import を読んだとき（テンプレートの import が展開したファイル）
- 構文として読めない、またはビルドできないソース

たどるのは 1 段だけ（function が直接 import するモジュール）にする。グラフ全体をたどる作業は #3827 に回した（kompiro の判断、2026-11-15）。

バンドルが捨てる import（`import type`、`.ts` で使っていない binding、型として書いた `import("…")`）は、実行時に何も読み込まないので検査しない。境界の外から型だけを import する function はガードを通る（kompiro の判断、2026-11-20）。

## 理由

- **境界かどうかは、wrangler が実際にバンドルするファイルで決まる。** 拡張子を補う順番、`.js` と書いて `.ts` を指す書き方、ディレクトリの `package.json` の `main` / `browser`、tsconfig の `paths`、`browser` の対応表、リンクの実体のパス、は esbuild の規則で決まる。ガードが自前で解決すると、規則の違いがそのまま見逃しになる。esbuild の `onResolve` プラグインで、function 自身の import ごとに `build.resolve` で解決した先を記録し、external にして 1 段で止める
- **wrangler のオプションに合わせる。** 2026-11-20 に読んだ `workers-sdk` の `packages/wrangler/src/deployment-bundle/bundle.ts` では、`platform` を渡さない（なので esbuild の既定の `browser` と、その既定の `mainFields`）、conditions は `workerd`, `worker`, `browser`、`.js` / `.mjs` / `.cjs` は JSX として読む、`preserveSymlinks` は使わない。デプロイは `wrangler-action` が wrangler を入れるので、後の wrangler がこれを変えても、デプロイで `WRANGLER_BUILD_PLATFORM` / `WRANGLER_BUILD_CONDITIONS` を設定しても、ガードは追いかけない。定数に出典を書いてある
- **計算される specifier は構文でしか分からない。** esbuild は `import(name)` や `require("" + x)` を解決にかけずに残すので、プラグインに届かない。@babel/parser で構文木を読み、行を付けて落とす
- **呼び出しを 1 か所ずつ照合することは esbuild からはできない。** `require?.(x)` も `(0, require)(x)` も esbuild は実行時の呼び出しとして残し、警告も出さない。`onResolve` は (kind, specifier) ごとに 1 回しか呼ばれない。なので、同じ specifier の `require(x)` がバンドルされると、横の `require?.(x)` が見逃される。`functions/**` で oxlint の `no-restricted-globals` によって `require` への参照をすべて禁じ、`pnpm lint` の対象に `functions/` を足した。残る実行時の読み込みは `import()` だけで、`import` はキーワードなので `?.` や `(0, …)` で回り込めない。`require` は `nodejs_compat` の無い Pages には存在しないので、禁じて失うものは無い

## 却下した案

PR #3824 では、レビューで穴が見つかるたびに読み方を変えた。却下した順に挙げる。

- **regex で import を読む。** 最初の実装。トークンの間のコメント、`import(` の後の空白、`from` という名前のメソッド、のように読み違える書き方をレビューが毎回見つけた
- **madge の依存グラフを使う。** madge のグラフには、計算される specifier と Node 組み込みの辺が無い。kompiro は `/pr-verify`（2026-11-15）で、この 2 つを検出すること（見えないと書いて済ませない）と、誤検知を無くすことを求めた
- **TypeScript の compiler API で読む。** TypeScript 7（ADR-1862）には JS から呼べる compiler API が無い
- **@babel/parser で読み、パスは自前で解決する。** 計算される specifier と組み込みは検出できたが、レビューが自前の解決と esbuild の規則のずれを次々に見つけた（PR #3824 の記録の #5、#15、#30、#32、#36、#37、#40、#41）。同じ種類の指摘が続いたので、解決を esbuild に任せた
- **esbuild の metafile を読む。** metafile を得るにはバンドルを最後まで作る必要があり、esbuild はグラフ全体を歩く。解決できない import が 1 つあればビルドごと失敗し、その import がどれかを検査の結果として返せない。プラグインの `onResolve` なら、直接の import ごとに `build.resolve` の結果（失敗も含む）を記録し、external にして 1 段で止められる
- **呼び出しの書き方を構文で判定し、esbuild の規則をまねる。** `require?.()` と `(0, require)()` はバンドルされない、と自前で決める案。小さく済むが、自前の解決をやめた理由（esbuild の規則をまねると、ずれが見逃しになる）にそのまま戻る
- **素の `require("…")` / `import("…")` 以外の呼び出しをガードで落とす。** 規則としては lint と同じだが、ガードの中に判定を足すことになる。lint はエディタと CI の両方で同じ規則を示せるので、lint を選んだ（kompiro の提案、2026-11-20）
- **呼び出しの指摘を却下する。** `nodejs_compat` の無い Pages では `require?.()` は何も読まず、`(0, require)()` は ReferenceError になるので、実害は無い。ただ、ガードが通した理由を「Pages の実行環境」に頼ることになり、Major の指摘を理由付きで残すことになる

lint の規則でも捕まらないものが残る。`globalThis.require` や `module.require` のようなプロパティ経由の参照は、`nodejs_compat` の無い Worker では `undefined` になる。`oxlint-disable` のコメントで規則を外すことはできるが、そのコメントは `functions/**` の中に書くので、PR はかならず High になる。
