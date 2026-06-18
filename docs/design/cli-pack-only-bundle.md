# karasu CLI の publish 成果物を「バンドル単体」に固定する

- **日付**: 2026-06-18
- **ステータス**: 検討中
- **PR**: [#1690](https://github.com/kompiro/karasu/pull/1690)
- **関連**:
  - 引き金 Issue: [#1681](https://github.com/kompiro/karasu/issues/1681)
  - 関連 ADR: [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md)（changesets による OSS リリース自動化）
  - 関連 TPL: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md) / 本 PR で起こす proactive TPL（公開 tarball の内容物完全性・除外）
  - コード: `packages/cli/package.json`, `.github/workflows/release.yml`

## 背景・課題

npm に公開済みの **`karasu@0.0.1`** が機能しない。`npx karasu render …` が
`could not determine executable to run` で失敗する。tarball の中身が
**`package.json` + `README.md` の 2 ファイルだけ**で、`dist/` も `bin` も入っていない
（`npm pack karasu@0.0.1 --dry-run` → total files: 2 / `npm view karasu@0.0.1 bin` → 空）。
`prepack` / `files` が整備される前の手動 publish だったとみられる。

これは OSS launch（#1317）の blocker であり、`npx karasu render` を wrap する
`kompiro/karasu-action`（#302）も動かせない。

現行の `packages/cli` の packaging 設定自体は正しい。クリーンな CI checkout で
`pnpm --filter karasu build && npm pack --dry-run` すると `dist/index.js`（単一バンドル）+
`THIRD_PARTY_NOTICES.md` + `LICENSE` + `README.md` + `package.json` が入る。

ただし Issue 報告者は別の問題も観測している — **`dist/` にテスト成果物
（`dist/**/*.test.js` / `*.d.ts` / `*.map` や `dist/translate/bindings.test.*`）が混入して
pack される**ケースがある。これは現行の `files: ["dist"]` が
ディレクトリまるごと glob で、`dist/` の中身が「バンドル単体である」ことを
何も保証していないために起きる（後述）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| build | `packages/cli` の `build` は **esbuild の単一バンドル**。出力は `dist/index.js` ただ 1 ファイル |
| bin | `"bin": { "karasu": "./dist/index.js" }`（正しい） |
| files | `"files": ["dist", "THIRD_PARTY_NOTICES.md"]` — `dist/` を**ディレクトリごと** pack |
| prepack | `"prepack": "pnpm run build"`（pack 前に build を走らせる。正しい） |
| typecheck | `tsc --noEmit`（emit しない） |
| dist の gitignore | `dist/` は gitignore 対象。clean checkout には存在しない |
| release | `.github/workflows/release.yml` が `main` push 時に `pnpm run release`（= `pnpm build && changeset publish`）。publish は `NPM_TOKEN` 未設定の間スキップ（#1315 で launch までゲート） |
| version | 現行 `package.json` は `0.0.0`。pending changeset に複数の `karasu: minor` があり、次の version 確定は `0.1.0`（壊れた `0.0.1` を上回る） |

**テスト成果物が混入する経路**: `build` は esbuild 単一バンドルなので、
クリーンな `dist/` には `index.js` しか出ない。しかし `dist/` は gitignore された
作業ディレクトリで、`tsc`（`--noEmit` なし）を手元や IDE で走らせると
`tsconfig.json`（`declaration: true` / `outDir: ./dist`）の設定で
`dist/**/*.test.js` / `*.d.ts` / `*.map` が emit される。`files: ["dist"]` は
それらを区別せず全部 pack する。`prepack` の build は `dist/` を掃除しないため、
**stale な tsc 出力が残った環境で publish すると tarball に紛れ込む**。

## 制約・前提

- 公開する成果物は **esbuild の単一バンドル `dist/index.js`** のみ。型定義（`.d.ts`）や
  sourcemap、テスト JS は CLI の実行に不要であり、配布物に含めるべきではない。
- packaging 設定は環境に依存せず **決定論的** であるべき（手元の `dist/` の状態に
  左右されてはならない）。
- 実際の npm publish は `NPM_TOKEN` / OSS launch（#1315）にゲートされており、本件の
  スコープ外。ここでやれるのは「次回 release が正しい tarball を出すようにする」まで。
- 後方互換: `karasu` は実質まだ誰も正しく使えていない（壊れた `0.0.1` のみ）。破壊的
  変更の懸念はない。

## 検討した選択肢

### 案1: `files` を `["dist/index.js", …]` に絞る（採用）

`"files": ["dist", "THIRD_PARTY_NOTICES.md"]` →
`"files": ["dist/index.js", "THIRD_PARTY_NOTICES.md"]`。

公開物が単一バンドルだという事実を packaging 設定に直接反映する。`dist/` に
何が残っていても、pack されるのは `dist/index.js` だけになる。

**メリット**

- 決定論的。`dist/` の hygiene に依存せず、テスト成果物・型定義・sourcemap が
  原理的に混入しない。
- 変更が 1 行。意図（「公開するのはバンドルだけ」）がそのまま読める。
- esbuild バンドルという実態と完全に一致する。

**デメリット**

- 将来 `dist/` に別の正当な成果物（例: 複数 entry の bundle）を増やすと、`files` の
  更新を忘れると漏れる。→ 回帰ガードのテストで吸収する。

### 案2: build の前段に `dist/` clean ステップを足す

`"build": "rm -rf dist && esbuild …"` のように、ビルドのたびに `dist/` を掃除する。

**メリット**

- stale な tsc 出力そのものを消すので、手元の `dist/` も常に綺麗になる。

**デメリット**

- `files: ["dist"]` のまま残すと、clean が走らない経路（手動 `npm pack` を build なしで
  実行する等）では依然 stale 出力を pack しうる。**決定論性は案1 ほど強くない**。
- `rm -rf` の cross-platform 配慮（Windows 開発者）が要る。

### 案3: `tsconfig`（`tsconfig.build.json`）で test / emit を除外する

core が使っている `tsc -p tsconfig.build.json` のように、ビルド用 tsconfig で
`*.test.ts` を `exclude` し emit 対象を絞る。

**メリット**

- tsc を build に使うパッケージ（core 等）では正攻法。

**デメリット**

- CLI の build は **esbuild であって tsc ではない**。CLI に tsc build を導入するのは
  本筋から外れる。混入の原因は `--noEmit` なしの tsc を**たまたま**走らせたときの
  副産物であって、build pipeline の一部ではない。tsconfig をいじっても
  「`files: ["dist"]` がディレクトリ全部を信用している」根本は変わらない。

## 比較

| 観点 | 案1（files 限定） | 案2（clean ステップ） | 案3（tsconfig exclude） |
| --- | --- | --- | --- |
| 決定論性 | ◎ dist の状態に非依存 | △ clean を通る経路のみ | △ esbuild build には無関係 |
| 変更量 | ◎ 1 行 | ○ build script 1 行 + cross-platform 配慮 | △ 新 tsconfig + 検証 |
| 実態との一致 | ◎ 単一バンドルそのもの | ○ | △ CLI は tsc build しない |
| dev の dist 掃除 | × stale は残る（pack には無害） | ◎ | × |

## 現時点の方針

**案1 を採用する** — 公開物が単一バンドルである以上、`files` をその 1 ファイルに
固定するのが最も決定論的で、変更も最小。混入問題（テスト成果物）と本来の問題
（壊れた publish の再発防止）の両方を、`dist/` の hygiene に依存せず根本から閉じる。

案2 の clean は dev 体験としては良いが、packaging の決定論性は案1 が単独で担保する
ため必須ではない（任意の hygiene 改善として将来検討可）。

### 実装の指針

1. `packages/cli/package.json` の `files` を
   `["dist/index.js", "THIRD_PARTY_NOTICES.md"]` に変更する（`bin` / `prepack` は変更不要）。
2. 回帰ガードのテスト `packages/cli/src/packaging.test.ts`（vitest）を追加し、
   `pkg.files` が `["dist/index.js", "THIRD_PARTY_NOTICES.md"]` と一致すること、
   `pkg.bin.karasu === "./dist/index.js"` であることを assert する。
   `files` が再びディレクトリ glob に退行するのを防ぐ。CLI の AT/テストは
   `packages/cli` の vitest に置く規約に従う。
3. changeset を追加（`karasu: patch`）。次回 release で pending minor 群とともに
   `0.1.0` に上がり、build を含む正しい tarball で壊れた `0.0.1` を上書きする。
   実 publish は #1315 / `NPM_TOKEN` ゲート下にあるが、changeset があれば次の release は
   正しく出る。
4. AT: `docs/acceptance/` に新規ファイル。TC は:
   - `cd packages/cli && pnpm build && npm pack --dry-run` の一覧が
     `dist/index.js` / `THIRD_PARTY_NOTICES.md` / `LICENSE` / `README.md` / `package.json` だけで、
     `*.test.*` / `*.d.ts` / `*.map` を含まない（人間確認）。
5. proactive/retrospective TPL: 「公開パッケージの tarball は実行に必要な build 成果物を
   含み、テスト・型定義・sourcemap を除外する。`npm pack --dry-run` で検証する」観点を
   `docs/test-perspectives/` に起こし、TPL-20260510-15 と相互リンクする。
6. ADR 昇格: 実装完了後、`docs/adr/<番号>-cli-pack-only-bundle.md` として昇格し、
   本 Design Doc は同 PR で削除する。changesets 採用の ADR-20260512-05 から
   本 ADR へリンクを張る。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（壊れた `0.0.1` しか公開されておらず、正しく使えた利用者は
  いない）。次回 release で初めて動く `karasu` が公開される。
- ドキュメント更新: ADR 昇格時に `docs/adr/`。spec / concepts への影響はなし。
- テスト・examples への影響: なし。`packages/cli` に packaging 回帰テストを 1 件追加するのみ。

## Related TPLs

- [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md):
  配布物が dev tree と別レイアウトでインストールされる際の parity 観点。本件は同じ
  「配布物の中身が dev 環境と乖離する」系統の失敗だが、TPL-15 が扱うのは
  **packaged モードでの path 解決**であって **tarball の内容物（何が入る/入らない）** は
  対象外。本 PR で内容物完全性・除外を扱う retrospective TPL を新規に起こし、相互リンクする。
