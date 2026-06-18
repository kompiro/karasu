# `karasu` CLI の公開 tarball にビルド成果物を確実に同梱する

- **日付**: 2026-06-18
- **ステータス**: 検討中
- **Issue**: #1681
- **PR**: #1687
- **関連**:
  - 引き金 Issue: [#1681](https://github.com/kompiro/karasu/issues/1681)（published `karasu@0.0.1` ships no build）
  - 関連 ADR: [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md)（changesets リリース自動化・publish-only mode）、[ADR-20260616-10](../adr/20260616-10-publish-core-package.md)（`@karasu-tools/core` 公開は launch まで gate）
  - 関連 TPL: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-packaged-installed-mode-paths.md)（dev tree 依存パスは packaged/installed でも動くこと — 本件は「tarball の中身」観点でその姉妹）
  - 下流: #302（`kompiro/karasu-action` が `npx karasu render` を wrap）、#1317（OSS launch）
  - コード: `packages/cli/package.json`、`.github/workflows/release.yml`、`.changeset/`

## 背景・課題

npm 上の **`karasu@0.0.1`** は非機能。tarball が `package.json` + `README.md` の **2 ファイルのみ**で、`dist/` も `bin` も入っていない。そのため `npx karasu render …`（ドキュメント記載の入口、`kompiro/karasu-action` #302 が wrap する対象）が `could not determine executable to run` で失敗する。OSS launch（#1317）のブロッカー。

調査の結果、原因と現状は以下のとおり切り分けられた:

- `karasu@0.0.1` は `prepack` / `files` が wire される前の**手動・早期 publish** で出たと推測される（空 tarball）。
- **現在の packaging は正しい**。`packages/cli` は `prepack: pnpm run build`（esbuild バンドル）と `files: ["dist", "THIRD_PARTY_NOTICES.md"]` を持ち、`npm pack --dry-run` は `dist/index.js`（≈624 KB）+ `bin` を含む（検証済み）。
- したがって**再公開そのものは追加作業なしで成立する**（後述）。残る本質的な穴は「**tarball の中身を保証するものが何も無い**」こと — 空 tarball クラスの退行を CI で検知できない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| build | `packages/cli` の `build` は **esbuild** 単一バンドル（`dist/index.js` のみ出力）。tsc emit ではない |
| `files` | `["dist", "THIRD_PARTY_NOTICES.md"]`。`dist` glob なので、もし stray ファイル（後述）が `dist/` に紛れ込めば一緒に publish される |
| `bin` | `{ "karasu": "./dist/index.js" }` |
| prepack | `pnpm run build`（`changeset publish` / `npm publish` が自動実行） |
| tsconfig | `outDir: ./dist` / `declaration: true` / **`noEmit` 無し**。`typecheck` script は `tsc --noEmit` で上書きするが、素の `tsc` を誰かが叩くと `*.test.ts` まで含めて `dist/` に emit されうる（= Issue が言及する `dist/translate/bindings.test.{d.ts,js}` の出所） |
| version | repo の `package.json` は `0.0.0`。npm は `0.0.1`（壊れたまま latest）。drift がある |
| pending changesets | `karasu` を bump する changeset が複数 pending（うち `spicy-mugs-clean.md` は **minor**「First release of the karasu CLI」）。次リリースで `0.0.0 → 0.1.0`（minor 優先） |
| release | `release.yml` は publish-only mode（push to main で pending changeset が無ければ `changeset publish`）。Version は maintainer が `pnpm changeset version` で別 PR 化 |

クリーンビルド後の `npm pack --dry-run --json` 実測 = `["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "dist/index.js", "package.json"]`（test 成果物は**現状混入しない**）。

## 制約・前提

- **再公開のバージョンは `> 0.0.1` でなければならない**（npm は同一バージョンの再 publish を拒否する）。
- バージョン採番は changesets に委ねる方針（ADR-20260512-05）。`package.json` の手動 bump は避ける。
- リリース実行（npm publish）は maintainer の Version PR → `release.yml` の責務。**本件のコード PR は publish そのものは行わない**。
- 今 npm に publish しているのは `karasu`（CLI）のみ。`@karasu-tools/core` の公開は launch まで gate（ADR-20260616-10）。
- out of scope: release workflow の作り替え、core/vscode の packaging、trusted publishing（OIDC）への移行。

## 検討した選択肢

論点は 2 つ — (A) 「test/stray ファイルを dist から締め出す方法」、(B)「退行を検知する guard の置き場・範囲」。

### (A-1) `files` を `dist/index.js` に絞る【採用】

`files: ["dist/index.js", "THIRD_PARTY_NOTICES.md"]`。esbuild build は `dist/index.js` しか出さないので、素の `tsc` 等が `dist/` に何を吐いても publish には乗らない。

**メリット**: 最小・宣言的。stray emit に対して恒久的に頑健。
**デメリット**: 将来 build が複数ファイルを出すようになったら `files` の更新が要る（が、その時に気づける）。

### (A-2) `files: ["dist"]` を維持しつつ build 前に `dist` を clean

`prebuild` で `rimraf dist`（または `rm -rf`）してから esbuild。

**メリット**: build 出力が増えても `files` 修正不要。
**デメリット**: clean step が走ることに依存（A-1 のような宣言的保証ではない）。可動部が増える。

### (B-1) `packages/cli` の vitest で tarball 内容を検査【採用】

`npm pack --dry-run --json --ignore-scripts`（事前に build）でファイル一覧を取り、`dist/index.js` と `bin` の存在・`*.test.*`/`src/` の非混入・`THIRD_PARTY_NOTICES.md` の存在を assert する。

**メリット**: 空 tarball クラスの退行（= #1681 の真因）を CI で直接捕捉。CLI テストの定位置（`packages/cli` vitest）に収まる。
**デメリット**: テスト内で build + pack を回すので僅かに重い（esbuild ≈ 50–100ms + pack）。

### (B-2) 全 publishable パッケージを横断する汎用 packaging チェック

スクリプトで ignore 対象外の全パッケージを回し、各 tarball が build 入口を含むか検査。

**メリット**: 将来 `core` 等が publish され始めても自動でカバー。
**デメリット**: 現状 publisher は `karasu` 1 個（core は gate）。今この infra を組むのは需要先取りで over-engineering。`core` 公開が動き出す時（ADR-20260616-10）に汎用化すればよい。

## 比較

| 観点 | A-1（files 絞り）/ B-1（cli test） | A-2（clean dist）/ B-2（汎用） |
| --- | --- | --- |
| 変更量 | 小（package.json 1 行 + test 1 本） | 中（prebuild script / 横断 infra） |
| 退行検知 | tarball 内容を直接 assert | 同等（B-2）/ なし（A-2 単体） |
| 宣言性・頑健性 | 高（`files` が許可リスト） | clean step 依存 |
| 将来拡張 | core 公開時に汎用化 | 先取り |

## Related TPLs

- 既存: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-packaged-installed-mode-paths.md) — 「dev tree のレイアウトに依存するパス/設定は packaged/installed でも動くか確認」。本件は同じ「dev では動くが配布物では壊れる」系だが、観点は**パス解決**ではなく**tarball に何が入るか**で別。
- 新規（同 PR で起こす, retrospective）: **公開パッケージは packed tarball の中身を assert する guard を持つ**（runtime entry + `bin` が入っていること、source/test/config が入っていないこと）。3-Yes: 横展開（core/vscode も publish しうる）/ 構造的再発（どのパッケージでも空 tarball は起こりうる）/ 既存 TPL 未掲載。`discovered_from.root_cause`: #1681。

## 現時点の方針

**A-1 + B-1 + retrospective TPL を採用する。** 再公開は既存の pending minor changeset により自動で成立する（`0.0.0 → 0.1.0`、壊れた `0.0.1` と衝突しない）ため、本 PR はバージョンに手を入れず、「二度と空 tarball を publish しない」ための**恒久ガード**に集中する。

### 実装の指針

1. `packages/cli/package.json`: `files` を `["dist/index.js", "THIRD_PARTY_NOTICES.md"]` に絞る。
2. `packages/cli/src/packaging.test.ts`（新規）: `beforeAll` で `pnpm run build`、本体で `npm pack --dry-run --json --ignore-scripts` を実行しファイル一覧を検査:
   - `dist/index.js` を含む
   - `package.json` の `bin.karasu === "./dist/index.js"`
   - `THIRD_PARTY_NOTICES.md` を含む
   - `*.test.*` / `src/` / `tsconfig*.json` を**含まない**
3. `.changeset/<name>.md`: `karasu` の **patch**。本 packaging hardening と「公開 tarball に CLI build を確実に同梱（#1681）」を記述（既存 minor に吸収され `0.1.0` のまま）。
4. retrospective TPL を `test-perspective` スキルで起こし（上記 Related TPLs）、本 Design Doc と相互リンク。
5. AT: `docs/acceptance/1681-cli-package-ships-build.md`。TC は上記 (2) の各 assert を自動項目として記録し、「実際の npm 再公開は maintainer の Version PR → `release.yml`」を手動メモとして残す。
6. ADR 昇格: 実装完了後、`docs/adr/20260618-NN-cli-publish-build.md`（または採番規約に従う）として昇格し、本 Design Doc は同 PR で削除する。ADR-20260512-05 から本 ADR に back-ref を張る。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（packaging を絞るだけ。配布される runtime は `dist/index.js` で不変）。
- 再公開: maintainer が `pnpm changeset version` で Version PR を作成 → merge → `release.yml` が `karasu@0.1.0` を publish。これで #1681 は解消。下流 #302（karasu-action）が `npx karasu` を使えるようになる。
- ドキュメント更新: AT 新規、TPL 新規。release フロー自体（ADR-20260512-05）は不変。
- テストへの影響: `packages/cli` に 1 本追加。build を回すため僅かに実行時間増。
