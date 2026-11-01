# 組み込み examples を `examples/` から生成する

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3345](https://github.com/kompiro/karasu/issues/3345)
  - 関連 ADR: [ADR-9018](../adr/9018-project-mode-initial-content.md)（ProjectMode の初期コンテンツを core の `examples.ts` に置く。`?raw` 案を却下）、[ADR-1344](../adr/1344-feature-samples-builtin-project.md)（feature-samples を 1 プロジェクトで同梱）、[ADR-1642](../adr/1642-en-ja-example-parity.md)（en/ja の examples を揃える）、[ADR-1296](../adr/1296-reference-data-single-source.md)（Reference の Samples タブは `examples.ts` 経由で examples を読む。`gen:reference --check` の先例）、[ADR-2802](../adr/2802-builtin-icon-registration.md)（`gen:icons` と `*.generated.ts` の先例）、[ADR-8](../adr/8-builtin-style-and-reference.md)（TypeScript 定数で持ち、`?raw` のビルド設定を避ける）、[ADR-3344](../adr/3344-source-line-budget.md)（行数予算。`examples.ts` を名指しで対象外にしている）
  - 関連 TPL: [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（整合チェックは両側の変更で起動する）、[TPL-2804](../test-perspectives/TPL-2804-guard-scan-set-fails-loud-on-the-unknown.md)（走査集合は未知の要素で大声で落ちる側に定義する）、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（gate 側の検証は全走査で回す）
  - コード: `packages/core/src/builtins/examples.ts`、`packages/core/src/examples.test.ts`、`.claude/rules/examples-sync.md`、`.claude/skills/update-examples/SKILL.md`

## 背景・課題

`packages/core/src/builtins/examples.ts`（4,541 行）は `examples/` の登録済みディレクトリを手で写したコピーである。
登録済みの example を 1 行直すたびに `examples.ts` の同じ行も直し、同じコミットに入れる必要がある
（`.claude/rules/examples-sync.md`）。この 2 回目の編集のために `/update-examples` スキルがある。

drift テスト（`examples.test.ts`）が片側だけの編集を落とすので壊れたまま出荷される心配は小さい。
問題は毎回払うコストで、直近 90 日で 15 コミットが `examples.ts` を変更し、リポジトリで最大のソースファイルになっている。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 登録済みディレクトリ | 14 個。一覧は `examples-sync.md` の表と `examples.ts` の定数の 2 か所にある |
| 公開している名前 | `ExampleProject` 型と 14 個の定数（`GETTING_STARTED_PROJECT` / `_EN`、`EC_PLATFORM_PROJECTS` / `_EN`、`FEATURE_SAMPLES_PROJECT` ほか）。`packages/core/src/index.ts` が再 export する |
| 利用側 | app の `useProjectInitialization.ts`（ProjectMode の初回 seed）、core の `reference.ts`（Reference の Samples タブ） |
| ディレクトリの形 | 12 個は「ディレクトリ直下の `.krs` / `.krs.style` = 1 プロジェクトのファイル」。`ec-platform/`（ja・en の 2 個）だけは段階構成で、直下の `NN-*.krs` が単一ファイルのプロジェクト、サブディレクトリが複数ファイルのプロジェクトになる。どちらも入口ファイルは同梱時に `index.krs` へ改名される（`system.krs` / `main.krs` → `index.krs`、#1777） |
| drift ガード | `examples.test.ts` に byte 一致の検査が 5 系統ある。`getting-started`（ja/en）と `client-mcp` には検査がない（2026-11-01 時点では disk と一致している） |
| ファイル順 | `feature-samples` は手で足した順（アルファベット順ではない）。app の OPFS provider は `readdir` を名前順に並べるので、配列の順は表示に影響しない |
| 行数予算 | `.oxlintrc.json` と `.claude/rules/line-budget.md` が `examples.ts` を名指しで対象外にしている。`*.generated.ts` も対象外 |

## 制約・前提

- `@karasu-tools/core` は素の `tsc` でビルドできる状態を保つ。生成物はコミットする（ビルド時に生成しない）
- 公開している名前（`ExampleProject` 型と 14 個の定数）とその中身は変えない。利用側（app・`reference.ts`）は変更しない
- ADR-9018 と ADR-8 が却下した、バンドラ依存の読み込み（Vite の `?raw` / `import.meta.glob`）は使わない。core を CLI・VS Code・Workers から同じ形で使えることが前提である
- 同梱するかどうか（どのディレクトリを seed に入れるか）は変えない。本件は同期の仕組みだけを扱う

## 検討した選択肢

### 案1: `examples.ts` 全体をスクリプトで生成する

型定義・コメントも含めて `examples.ts` を丸ごと書き出す。

**メリット**

- ファイルが 1 つのまま

**デメリット**

- 手書きの部分（`ExampleProject` 型の説明、各定数の由来コメント）をスクリプトの文字列に移すことになり、読みにくい
- `examples.ts` を行数予算の対象外に名指しする特例が残る

### 案2: データを `examples.generated.ts` に生成し、`examples.ts` は再 export だけにする

<!-- absent-path-next-line: the generated module this design creates (#3345) -->
スクリプトが `ExampleProject` 型と 14 個の定数を `packages/core/src/builtins/examples.generated.ts` に書き出す。
`examples.ts` は生成モジュールを再 export する薄いモジュールになる。
型を生成側に置くのは、`examples.ts` が型を持って生成側がそれを `import type` すると循環になり、
`check:cycles`（madge）が `import type` も数えて落とすため（`gen:icons` も `BuiltinIconSource` を生成モジュールに書き出している）。

**メリット**

- 既存の `*.generated.ts` の扱い（`gen:icons` の `builtin-icons.generated.ts`、行数予算の対象外）にそのまま乗る。`examples.ts` の特例を `.oxlintrc.json` と `line-budget.md` から消せる
- `index.ts` と `reference.ts` の import 先（`./builtins/examples.js`）は変わらない
- 生成物であることがファイル名で分かり、手で直そうとする人が減る

**デメリット**

- ファイルが 2 つになる

### 案3: バンドラの機能で `examples/` を直接読む（`?raw` / `import.meta.glob`）

**デメリット**

- ADR-9018 と ADR-8 が却下した案そのもの。core が Vite 以外（`tsc` / esbuild の CLI・VS Code・Workers）で読めなくなる

### 案4: 現状維持（drift テストだけを厚くする）

`getting-started` と `client-mcp` に byte 一致の検査を足すだけにする。

**デメリット**

- 2 回編集する構造が残る。ADR-1296 が「drift に気づけても drift 自体は防げない」として退けたのと同じ形

## 現時点の方針

**案2 を採用する** — `gen:icons`（ADR-2802）と同じ「正典はファイル、生成モジュールは build product、`--check` で staleness を落とす」形に揃える。
`examples.ts` は利用側から見たモジュールのまま残るので、利用側は何も変わらない。

### 生成の規則

<!-- absent-path-next-line: the generator this design creates (#3345) -->
ジェネレータ `scripts/examples/gen-builtin-examples.ts` が登録表を持ち、これが登録済みディレクトリの唯一の一覧になる。
登録表の 1 行は「定数名・`examples/` からのディレクトリ・形（flat / staged）・定数に付ける説明」である。

- **flat**（12 個）: ディレクトリ直下の `.krs` と `.krs.style` をすべて同梱する。ファイルを列挙しない
  （TPL-2804。新しいサンプルを足しても登録表は変えなくてよい）。サブディレクトリがあれば生成を失敗させる
  （flat のディレクトリに入れ子を作った意図が分からないため、黙って捨てない）
- **staged**（`ec-platform/` の ja/en）: 直下の `.krs` は 1 ファイルずつ `index.krs` 1 つのプロジェクトになる。
  サブディレクトリは複数ファイルのプロジェクトになり、入口ファイルを `index.krs` に改名する。
  入口は `system.krs` か `main.krs` のどちらか 1 つで、どちらも無い・両方あるときは生成を失敗させる
- プロジェクト名は flat ならディレクトリ名、staged ならファイル名から `.krs` を除いたものかサブディレクトリ名
- 順序: staged のプロジェクトは名前の code point 順（`02-users` < `02.5-clients` で現状と一致）。
  プロジェクト内のファイルは `index.krs` を先頭に、残りを code point 順にする。
  変わるのは `files` 配列の順だけで、現状の手書き順（`feature-samples` が典型）は意味を持っていない。
  利用側は `path` で引くか（`reference.ts` の `indexKrs`）、全件を書き出すだけ（`createProject`）で、
  app の OPFS provider は `readdir` を名前順に並べる。`files` は公開型の配列なので npm の利用者からも順は見えるが、
  順を約束したことはなく、中身（`path` → `content`）は変わらないので changeset は付けない。
  意味のある順（staged のプロジェクトの並び。先頭の `01-system` が初回に選ばれる）は現状のまま保つ
- 文字列はテンプレートリテラルで書き出す（`\`・`` ` ``・`${` をエスケープする）。
  JSON 文字列にすると 1 ファイルが 1 行になり、example の 1 行の修正が PR の diff で読めなくなるため。
  書き出す形は oxfmt が変更しない形に合わせ、`format:check` で確かめる

### 実装の指針

<!-- absent-path-next-line: the generator this design creates (#3345) -->
1. `scripts/examples/gen-builtin-examples.ts` を作る。構成は `scripts/icons/gen-builtin-icons.ts` に揃える
   （純関数の `renderModule`、`regenerate({ root, check })`、`--check` で非ゼロ終了）。`package.json` に `gen:examples` を足す
<!-- absent-path-next-line: the generated module this design creates (#3345) -->
2. `pnpm gen:examples` で `packages/core/src/builtins/examples.generated.ts` を書き出し、`examples.ts` を再 export に縮める
3. 切り替えの検証: 切り替え前の `examples.ts` の定数と生成後の定数を比べ、各プロジェクトの名前と `path → content` の対応が一致することを確かめる
   （差はファイル順だけのはず）。この比較は移行時の一回限りで、テストには残さない
4. drift ガードを置き換える
   <!-- absent-path-next-line: the drift test this design creates (#3345) -->
   - `scripts/examples/gen-builtin-examples.test.ts`: コミット済みの生成物が `renderModule` の結果と一致する
     （失敗メッセージで `pnpm gen:examples` を案内する）。flat のディレクトリに新しいファイルを置くと生成物に入ること、
     staged の入口が無い・2 つあるときに失敗することを一時ディレクトリで確かめる
   - `examples.test.ts` から byte 一致の検査（feature-samples・multi-file-system・facet-styling・ec-platform・deploy-only / org-only）を消す。
     パース・図の検査（domain-drift、multi-membership、getting-started の column、全 example の診断スキャン）は残す。
     facet-styling の「`index.krs` が `@import "facets.krs.style"` を含む」検査は生成では担保されないので残す
   - lefthook の pre-push に `examples-generated-check` を足す。glob は `examples/**`・`scripts/examples/**`・
     `packages/core/src/builtins/examples*.ts`（TPL-1480: 正典側・生成物側・ジェネレータのどれが変わっても走る）
   - CI は `test:scripts` が Check job で走る（`examples/**` の変更は `ci.yml` の `paths-ignore` に掛からない）ので追加しない（TPL-2446）
5. `.oxlintrc.json` と `.claude/rules/line-budget.md` から `examples.ts` の特例を消す（`*.generated.ts` の除外で足りる）
6. `.claude/rules/examples-sync.md` を「`examples/` を直し、`pnpm gen:examples` を実行して両方をコミットする」に書き換える。
   対応表は消してジェネレータを指す。同期時の注意点のうち、生成で不要になるもの（`index.krs` への改名、`.krs.style` を filter に含める件）は消し、
   人が判断するもの（feature-samples の `index.krs` カタログへの追記、facet-styling は `.krs` とシートが対で意味を持つこと、en/ja を揃えること）は残す。
   新しいディレクトリを登録する手順は「登録表に 1 行足す」になる
7. `/update-examples` スキルを同じ手順に縮める（登録済みかの判定も生成スクリプトに任せる）
8. 消える drift ガードを指している記述を直す。ファイルの一覧ではなく検索で掃く
   （`grep -rn "examples\.test\.ts\|examples\.ts\|examples-sync" docs/acceptance .claude scripts packages/*/src`）。2026-11-01 時点で見つかっているもの:
   - AT の自動化マーカーが消える describe 名を引用している: `docs/acceptance/edge-property-block.md`、`edge-facets.md`、`1777-ec-platform-en-seed.md`、
     <!-- absent-path-next-line: the drift test this design creates (#3345) -->
     `1046-resource-operations.md`（散文で「byte 一致 drift guard」に言及）。引用先を `scripts/examples/gen-builtin-examples.test.ts` に張り替える
   - `.claude/rules/README.md` が `examples-sync.md`（`examples.test.ts` の drift ガード）を「到達状態 + 機械検証」の参考実装に挙げている
   - `scripts/lint/skill-reference-bundle-sync.ts` のコメントが `examples.test.ts` を先例に挙げている
9. ADR-1344 の frontmatter の `assumptions` に `grep: packages/core/src/builtins/examples.ts :: export const FEATURE_SAMPLES_PROJECT` がある。
   定数の定義が生成モジュールへ移ると `adr check-assumptions`（CI の Check job）が落ちるので、指し先を `examples.generated.ts` に直す
   （frontmatter の変更なので ADR 本文の不変規則に触れない）。同じ ADR の `grep: .claude/rules/examples-sync.md :: feature-samples/` は、
   書き換え後のルールにも feature-samples のカタログの注意点が残るので成り立つ
10. AT: 追加しない。生成物の中身は手順 3 で切り替え前と一致することを確かめ、以後は drift テストが守る。人が目で確かめる項目はない
11. ADR 昇格: 実装完了後、`docs/adr/3345-generated-builtin-examples.md` として昇格し、本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。同梱される中身は変わらない（changeset 不要）
- ドキュメント更新: `.claude/rules/examples-sync.md`、`.claude/rules/line-budget.md`、`.claude/rules/README.md`、`.claude/skills/update-examples/SKILL.md`、
  手順 8 の AT
- 既存 ADR: ADR-9018 / ADR-1344 / ADR-1296 は「`examples.ts` に同梱し、`examples-sync.md` で同期する」と書いている。
  同梱の決定は変えず、同期の手段だけを変えるので supersede しない。新 ADR の `related_to` で結ぶ。
  ADR-1344 は frontmatter の `assumptions` だけを直す（手順 9）
- 進行中の作業: `examples/` と `examples.ts` を両方触っているブランチは、main を取り込むときに `examples.ts` が衝突する。
  `examples/` 側を残して `pnpm gen:examples` を実行し直せば解ける

## 未解決の問い / 決めないこと

- 未登録のディレクトリ（`hr-tool/` など）を seed に入れるかは扱わない。登録表に 1 行足せば入る
- `OPENABLE_EXAMPLES`（docs gallery から app で開ける example の一覧、`openable-examples.ts`）との統合はしない。
  あちらは実行時に raw origin から取得する一覧で、同梱の有無とは別の軸である
