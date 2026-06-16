# @karasu-tools/core を公開可能な v0.x パッケージにする

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1363](https://github.com/kompiro/karasu/issues/1363)
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（ハイブリッド版管理 — TS API は v0.x）
  - 関連 ADR: [ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md)（`.krs`/`.krs.style` は v1.0、**TS API は v0.x** — 本作業はその v0.x 公開）, [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md)（changesets 運用、現状 CLI のみ公開）
  - テンプレート: `packages/cli`（[#1356] で publish 可能化）
  - 関連 TPL: [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列に存在する解決経路は drift する — alias / exports 条件の整合）
  - コード: `packages/core/package.json`, `packages/{app,cli,lsp}` の vite/vitest/tsconfig

## 背景・課題

`@karasu-tools/core` を npm に **v0.x（無保証）** で公開したい（#1302 のハイブリッド
版管理。`.krs` 言語は v1.0、TS API は v0.x — [ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md)）。
現状 publish されているのは CLI（`karasu`）のみで、core は `private: true`、`exports`
が `src/index.ts`（TS ソース）を指す **ワークスペース内部規約**になっている。

publish 可能化は core 単体に閉じず、**typecheck の解決経路**に波及する（後述）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| core 依存 | ランタイムは `yaml` のみ。**i18n には依存しない**（`@karasu-tools/i18n` の参照はコメントのみ。依存方向は i18n → core）。よって core は self-contained で単体公開できる |
| `exports` | `types`/`default` → `./src/index.ts`、`import` → `./dist/index.js`、`./icons/*` |
| 消費側の解決（実行/テスト） | app/cli/lsp は **明示的な alias で `../core/src/index.ts`** を直接解決（Vite/vitest alias, cli は esbuild `--alias`）。`exports` 条件には依存しない |
| 消費側の解決（typecheck） | `tsc --noEmit` は package.json の **`exports.types` → `src`** を使う。だから build なしで typecheck が通る |
| build | `tsc -p tsconfig.build.json` が `dist/` に `index.js` + `index.d.ts` を出力。`dist/` は gitignore |
| 公開面 | `src/index.ts` は約 1522 行・約 94 export。in-repo 消費向けに広く re-export されている |
| CI | typecheck（core→app→cli）→ build（core）の順。今は build 前に typecheck が通る |
| changeset | `.changeset/config.json` の `ignore` に core/lsp/app/e2e 等。`karasu`(CLI) のみ publish 対象 |

## 制約・前提

- **CI 順序（typecheck が build に依存しない）を壊さない**。`exports.types` を素朴に
  `dist` へ向けると app/cli/lsp の typecheck が core の事前 build を要求してしまう。
- **v0.x = 無保証**（minor で破壊的変更可）。API 面の完璧な curation は前提にしない。
- **out of scope**: `@karasu-tools` npm org の予約・実 publish（人手 / launch #1317 ゲート）、
  lsp/i18n の公開（core の依存ではない）、CLI の bundling 方式変更。

## 検討した選択肢

### 論点1: build-before-typecheck をどう避けるか

**案1-A（採用）: `development` export 条件 + tsconfig `customConditions`**

```jsonc
// packages/core/package.json
"exports": {
  ".": {
    "development": "./src/index.ts",   // repo 内（customConditions で選択）
    "types": "./dist/index.d.ts",       // 公開先
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./icons/*": "./icons/*"
}
```

ワークスペースの tsconfig に `compilerOptions.customConditions: ["development"]` を
足すと、`tsc --noEmit` が `development` 条件 → `src` を解決し、**build 不要**で
typecheck が通る。Vite/vitest/esbuild は既に明示 alias なので影響なし。公開先の
consumer は `development` 条件を持たないので `dist` を解決する。

- **メリット**: CI 順序を変えない。公開先は正しく dist。repo 内は src のまま。
- **デメリット**: `customConditions` を消費パッケージの tsconfig（または共通 base）に
  追加する必要（`moduleResolution: bundler`/`node16` 系が前提 — 要確認）。

**案1-B: CI で core build を typecheck の前に動かす**

`exports.types` → `dist` のみにして、CI を build→typecheck 順に並べ替える。

- **メリット**: package.json がシンプル。
- **デメリット**: typecheck が常に build に依存（ローカル `pnpm typecheck` も build 必須に）。
  app/cli/lsp にも波及し、開発体験が悪化。

### 論点2: 公開 API 面の curation 範囲

**案2-A（採用）: 現状 surface をそのまま v0.x で公開**

94 export を据え置く。example プロジェクト dump（`EC_PLATFORM_PROJECTS` 等）や
`getReference()` は将来 subpath / 別パッケージ化の**候補**として注記するに留める。

- **メリット**: churn ゼロ。v0.x（無保証）の趣旨に合致。利用実績を見てから削る。
- **デメリット**: 公開面が広く、後で絞ると minor 破壊になる（ただし v0.x なので許容）。

**案2-B: 公開専用エントリを切って最小 API に絞る**

`src/public.ts` を新設し curated な subset のみ export。

- **メリット**: 公開面が締まる。
- **デメリット**: いま使われ方が未知のまま絞ると外し、利用者の幅を狭める。v0.x には過剰。

## 比較

| 観点 | 1-A 条件方式 | 1-B CI 並べ替え | 2-A 据え置き | 2-B 最小化 |
| --- | --- | --- | --- | --- |
| CI/開発体験 | 維持 | 悪化（build 必須） | — | — |
| package.json 複雑さ | 条件 + tsconfig | 単純 | — | エントリ追加 |
| 公開面の締まり | — | — | 広い（v0.x 許容） | 締まる |
| 後戻りコスト | 低 | 中 | 低（v0.x） | 中 |

## 現時点の方針

**案1-A（`development` 条件）+ 案2-A（surface 据え置き）を採用する。** core のみを
スコープとし、公開可能な状態（package.json / README / LICENSE / changeset）まで整える。
実 publish と org 予約は launch（#1317）に委ねる。

### 実装の指針

1. **`packages/core/package.json`**: `private` 除去。`exports` を案1-A に。
   `description` / `homepage` / `repository`（directory: packages/core）/
   `files: ["dist", "icons", "README.md", "LICENSE"]` / `publishConfig`
   （`access: public`, `provenance: true`）/ `prepack: pnpm run build` を追加（#1356 踏襲）。
2. **tsconfig**: 消費パッケージ（または共通 base）に `customConditions: ["development"]`
   を追加。`pnpm typecheck`（core/app/cli/lsp）が build なしで通ることを確認。
   `tsconfig.build.json` が `dist` に `.js` + `.d.ts` を出力することを確認。
3. **`packages/core/README.md` + `LICENSE`**: cli に倣う（インストール・最小例・
   docs リンク・v0.x 無保証の互換注記）。
4. **changeset**: `.changeset/config.json` の `ignore` から `@karasu-tools/core` を外し、
   初回 changeset（minor, v0.x）を追加。
5. **v0.x 互換スタンスの明文化**: README の互換注記 + `docs/process.md`（リリース運用）
   に「TS API は v0.x・minor 破壊可」を 1〜2 行追記。[ADR-20260616-06] へリンク。
6. **検証**: `pnpm typecheck`（全 package, build 前）/ `pnpm --filter @karasu-tools/core build`
   → `dist` 確認 / `pnpm pack --filter @karasu-tools/core` の dry-run で同梱物
   （dist + icons + README + LICENSE、src 不在）を確認。
7. AT: `docs/acceptance/1363-publish-core-package.md` — pack 内容・公開面・typecheck-без-build を観点に。
8. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/` に昇格し同 PR で削除
   （exports 条件方式と v0.x API スタンスの決定を記録）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（CLI の bundling は不変、`.krs` 挙動も不変）。
- ワークスペース内: tsconfig に `customConditions` 追加。typecheck が build 非依存の
  まま通ることを CI で担保。
- out of scope: org 予約・実 publish（launch #1317）、lsp/i18n 公開。

## 未解決の問い / 決めないこと

- `customConditions` を**各パッケージ tsconfig に個別追加するか、共通 base tsconfig に
  1 箇所**で足すか（実装時に既存 tsconfig 構成を見て決める。`moduleResolution` が
  対応していることも要確認）。
- 公開面の curation（example dump / `getReference()` の subpath 化）は **post-v0.x**。
  本 PR では据え置き、注記のみ。
</content>
