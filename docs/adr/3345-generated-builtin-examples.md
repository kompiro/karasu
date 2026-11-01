---
id: ADR-3345
title: 組み込み examples は `examples/` から生成し、`examples.ts` は再 export にする
status: accepted
date: 2026-11-01
topic: build
authors: [kompiro]
related_to:
  - ADR-9018
  - ADR-1344
  - ADR-1642
  - ADR-1296
  - ADR-2802
  - ADR-8
  - ADR-3344
scope:
  packages:
    - core
assumptions:
  - "file: scripts/examples/gen-builtin-examples.ts"
  - "file: packages/core/src/builtins/examples.generated.ts"
  - "symbol: scripts/examples/gen-builtin-examples.ts :: REGISTERED_EXAMPLES"
  - "grep: packages/core/src/builtins/examples.ts :: from \"./examples.generated.js\""
  - "grep: package.json :: \"gen:examples\""
  - "grep: lefthook.yml :: examples-generated-check"
  - "file: scripts/examples/gen-builtin-examples.test.ts"
---

# ADR-3345: 組み込み examples は `examples/` から生成し、`examples.ts` は再 export にする

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - 起点 Issue: [#3345](https://github.com/kompiro/karasu/issues/3345)
  - 実装 PR: [#3498](https://github.com/kompiro/karasu/pull/3498)、Design Doc PR: [#3477](https://github.com/kompiro/karasu/pull/3477)
  - 関連 ADR: [ADR-9018](./9018-project-mode-initial-content.md)（ProjectMode の初期コンテンツを core の `examples.ts` に置く。`?raw` 案を却下）、[ADR-1344](./1344-feature-samples-builtin-project.md)（feature-samples を 1 プロジェクトで同梱）、[ADR-1642](./1642-en-ja-example-parity.md)（en/ja の examples を揃える。正典は `examples/`）、[ADR-1296](./1296-reference-data-single-source.md)（Reference の Samples タブは `examples.ts` 経由で examples を読む）、[ADR-2802](./2802-builtin-icon-registration.md)（`gen:icons` と `*.generated.ts` の先例）、[ADR-8](./8-builtin-style-and-reference.md)（TypeScript 定数で持ち、`?raw` のビルド設定を避ける）、[ADR-3344](./3344-source-line-budget.md)（行数予算）
  - 関連 TPL: [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)

## 背景

`packages/core/src/builtins/examples.ts`（4,541 行）は `examples/` の登録済みディレクトリ 14 個を手で写したコピーだった。
ProjectMode の初回 seed（app の `useProjectInitialization.ts`）と Reference の Samples タブ（core の `reference.ts`）が使う。
登録済みの example を 1 行直すたびに `examples.ts` の同じ行も直して同じコミットに入れる必要があり、そのために
`.claude/rules/examples-sync.md` の対応表と `/update-examples` スキルがあった。直近 90 日で 15 コミットが `examples.ts` を変え、
リポジトリで最大のソースファイルになっていた。

`examples.test.ts` の byte 一致検査が片側だけの編集を落とすので、壊れたまま出荷される心配は小さかった。
問題は毎回払う 2 回目の編集である。検査は 5 系統に分かれ、`getting-started` と `client-mcp` には無かった。
登録済みディレクトリの一覧も、対応表と定数の 2 か所にあった。

## 決定

`pnpm gen:examples`（`scripts/examples/gen-builtin-examples.ts`）が `ExampleProject` 型と 14 個の定数を
`packages/core/src/builtins/examples.generated.ts` に書き出し、`examples.ts` はそれを再 export するだけにする。
生成物はコミットし、`examples/` を直したら `pnpm gen:examples` を実行して両方を同じコミットに入れる。

- **登録表 `REGISTERED_EXAMPLES` が唯一の一覧**。1 行は「定数名・ディレクトリ・形・説明」で、説明は生成物の JSDoc になる
- **flat**（12 個）はディレクトリ直下の `.krs` / `.krs.style` をすべて同梱する。ファイルを足しても登録表は変えない
- **staged**（`ec-platform/` の ja/en）は直下の `.krs` とサブディレクトリが 1 つずつのプロジェクトになり、
  サブディレクトリの入口（`system.krs` か `main.krs` のちょうど 1 つ）を `index.krs` に改名する
- **想定外の形は生成を失敗させ、黙って捨てない**（TPL-2804）。対象は、同梱するファイルが無いディレクトリ、flat の入れ子、
  flat に `index.krs` が無い、staged の段に入口が無い・2 つある・入口と `index.krs` が並ぶ、段のファイルが入口を元の名前で
  `@import` する、staged の直下に `.krs.style` がある
- **中身は byte 単位でそのまま書く**。テンプレートリテラルで書き出し（`\`・`` ` ``・`${` をエスケープ）、
  入口への `@import` を書き換えるより生成を失敗させる方を選んだ
- **順序**: staged のプロジェクトは名前の code point 順、プロジェクト内のファイルは `index.krs` を先頭に残りを code point 順
- **drift ガード**: `scripts/examples/gen-builtin-examples.test.ts` がコミット済みの生成物と新しく生成したものの一致、
  `examples.ts` の export と登録表の一致、上の失敗ケースを確かめる。CI では `test:scripts` が走らせ、
  pre-push の `examples-generated-check`（glob は `examples/**`・`scripts/examples/**`・`packages/core/src/builtins/examples*.ts`）も同じ判定を呼ぶ

## 理由

- **2 回目の編集が無くなる。** 登録済みの example の修正は 1 回の編集と 1 回のコマンドで済み、同期の注意点として
  人が覚えておくもの（`index.krs` への改名、`.krs.style` を含めること）が生成に吸収される
- **既存の `*.generated.ts` の扱いにそのまま乗る。** `gen:icons`（ADR-2802）と同じ「正典はファイル、生成モジュールは
  build product、`--check` で staleness を落とす」形で、行数予算から `examples.ts` を名指しで外す特例も要らなくなった
- **利用側が変わらない。** `index.ts`・`reference.ts`・app は `./builtins/examples.js` を import したままで、
  `@karasu-tools/core` が export する名前も変わらない
- **型は生成側に置く。** `examples.ts` が型を持ち生成側が `import type` すると循環になり、`check:cycles`（madge）が
  `import type` も数えて落とす
- **同梱の決定は変えない。** どのディレクトリを seed に入れるか（ADR-9018 / ADR-1344 / ADR-1296）は扱わず、
  同期の手段だけを変えたので、これらの ADR は supersede せず `related_to` で結ぶ

## 却下した案

### `examples.ts` 全体を生成する

ファイルは 1 つのままだが、手書きの部分（型の説明、定数の由来）をスクリプトの文字列に移すことになり、
`examples.ts` を行数予算の対象外に名指しする特例も残る。

### バンドラで `examples/` を直接読む（`?raw` / `import.meta.glob`）

ADR-9018 と ADR-8 が却下した案そのもの。core が Vite 以外（`tsc` / esbuild の CLI・VS Code・Workers）で読めなくなる。

### 現状維持で drift テストだけを厚くする

`getting-started` と `client-mcp` に検査を足すだけだと、2 回編集する構造が残る。ADR-1296 が「drift に気づけても
drift 自体は防げない」として退けたのと同じ形である。

## 実装で設計から変えたこと

- **失敗させる形を 3 つ足した。** 設計の失敗ケースは flat の入れ子と staged の入口の数だけだった。レビューで、
  staged の段に入口と `index.krs` が並ぶと片方が上書きで消えること、flat に `index.krs` が無いと入口の無い
  プロジェクトになること、段のファイルが入口を元の名前で `@import` すると改名後に解決しないことが分かり、
  どれも生成を失敗させるようにした。staged の直下に置いた `.krs.style` も、黙って捨てていたのを失敗にした
- **`examples.ts` の export と登録表の一致をテストにした。** 登録表に行を足して再 export を忘れると、
  定数が生成されても core から使えない
- **張り替えた AT の記録は 9 件だった。** 設計は 4 件を挙げていたが、消した byte 一致検査を自動化の根拠に
  引用していた記録は 9 件あった（受け入れ条件は変えず、引用先だけを生成のテストに替えた）
- **設計の誤りを 1 つ直した。** 設計は「staged の先頭の `01-system` が初回に選ばれる」と書いていたが、
  ProjectMode が最初に seed するのは getting-started で、ec-platform の段はその後に段の順で seed される

## 影響

- 同梱される中身は変わらない。移行時に移行前の `examples.ts` と生成物の 14 定数を比べ、プロジェクト名と
  `path → content` の対応が一致することを確かめた。変わったのは 5 定数の `files` の並び順だけで、
  app の OPFS provider は `readdir` を名前順に並べ、`reference.ts` は `index.krs` を path で引くので影響しない。
  `files` は公開型の配列なので npm の利用者からは順が見えるが、順を約束したことはなく changeset は付けていない
- `examples/` と `examples.ts` を両方触っているブランチは、main を取り込むと `examples.ts` が衝突する。
  再 export 側を残して `pnpm gen:examples` を実行し直せば解ける（実装 PR 自身が #3475 との衝突をこの方法で解いた）
- `.claude/rules/examples-sync.md` と `/update-examples` スキルは「`examples/` を直し、`pnpm gen:examples` を実行して
  両方をコミットする」に変わった。生成が見ないこと（feature-samples の `index.krs` カタログへの追記、
  facet-styling の `.krs` とシートの対、en/ja を揃えること）は引き続き人が揃える
- 未登録のディレクトリ（`hr-tool/` など）を seed に入れるか、`OPENABLE_EXAMPLES`（docs gallery から app で開ける
  example の一覧）と統合するかは扱っていない
