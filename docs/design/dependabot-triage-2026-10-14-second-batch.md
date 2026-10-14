# Dependabot トリアージ 2026-10-14（第 2 波）

- **日付**: 2026-10-14
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#3209](https://github.com/kompiro/karasu/pull/3209) / [#3210](https://github.com/kompiro/karasu/pull/3210) / [#3211](https://github.com/kompiro/karasu/pull/3211) / [#3212](https://github.com/kompiro/karasu/pull/3212) / [#3213](https://github.com/kompiro/karasu/pull/3213) / [#3214](https://github.com/kompiro/karasu/pull/3214) / [#3215](https://github.com/kompiro/karasu/pull/3215) / [#3216](https://github.com/kompiro/karasu/pull/3216)
  - 同日の第 1 波: [ADR-3196](../adr/3196-dependabot-triage-2026-10-14.md)
  - VS Code floor の追随方針の見直し: [#3070](https://github.com/kompiro/karasu/issues/3070)（[ADR-3069](../adr/3069-dependabot-triage-2026-10-05.md) で起票）
  - VS Code floor の規則: [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md)（`@types/vscode` == `engines.vscode`）、[ADR-2782](../adr/2782-vscode-floor-capped-by-extester.md)（ExTester の `vscode-max` が上限）
  - oxfmt の整形同梱: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)、[ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)
  - `tinypool` の override: [ADR-3077](../adr/3077-dependabot-security-2026-10-06.md)
  - 差し替え PR の語彙: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)

## 背景

2026-10-14（水）15:38–15:40 UTC に npm の Dependabot PR が 8 件起票された。同日午前の第 1 波（ADR-3196）で
PR がマージ / close され、`open-pull-requests-limit: 8` の枠が空いたために出た続きで、security update ではない
（`security` ラベル無し。open alert は sharp #93 / shell-quote #92 の 2 件だけで、どちらも #3204 で対応中）。

**供給側（配布主体・改ざん）の懸念は見つからなかった。**

- **publisher / maintainer**: 8 件とも from 版と to 版で変化なし。provenance を失ったものも無い
  （`vscode-extension-tester` と `@types/vscode` は前後とも provenance なしで従来どおり。他は GitHub Actions OIDC + SLSA provenance）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。`lefthook` の `postinstall`（`allowBuilds` で許可済み）は
  tarball 上 `postinstall.js` に差分なし。ExTester 経由で新しく入る `@vscode/vsce-sign@2.1.0` は `postinstall` を持つが、
  `pnpm-workspace.yaml` の `allowBuilds` で `false`（実行しない）に固定済み。`yargs@18.2.0` の `prepare` は registry
  install では走らない
- **コード差分**: `npm diff` で from…to の tarball を比較し、追加行を `child_process` / `eval` / `new Function` /
  `fetch` / `http(s).request` / base64 decode / 外部 URL で grep した。該当は oxfmt の 7 行だけで、すべて chunk の
  ファイル名ハッシュが変わったことによる「移動」だった（0.63.0 と 0.72.0 の dist 全体で各パターンの出現数が同数。
  musl 判定の `ldd --version`、bundled Prettier の `atob`、tapable の `new Function`）
- **既知 advisory**: to 版すべてで該当ゼロ（GitHub Advisory API）。marked の最新 advisory は `>= 18.0.0, <= 18.0.1`、
  js-yaml は `>= 5.0.0, <= 5.4.0` で、どちらも範囲外
- **公開からの経過**: 最も新しい `marked@18.1.0` で 10-05 15:40 公開、起票時点で 8 日 23 時間。transitive で新たに
  入る版も最も新しいのが `js-yaml@5.4.3`（10-05 22:13）で、すべて cooldown 7 日を超えている
- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base（`26d5624e`）と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。main に無いパッケージ名が新しく入るのは #3210（ExTester）だけ（後述）

8 件すべてに共通して、`vite@8.3.0` の `postcss` が 8.5.28 → 8.5.29 に乗り換わる（lock に既にある版への乗り換え。
8.5.29 は 10-05 公開）。dev 用 `vite` の解決だけで、どの PR を先にマージしても同じ変化になる。

判断が必要なのは供給側ではなく、**bot の diff の形では CI を通せない 2 組**である。

1. `@types/vscode`（#3216）は `engines.vscode` と同値でしか動かせない（ADR-2562）。ExTester（#3210）の新版が
   `vscode-max` を 1.140.0 に上げたので、#3070 が「最初の適用」として挙げた組み合わせが揃った
2. `oxfmt`（#3213）は 0.72.0 で Markdown の formatter を差し替える BREAKING change を含み、4 ファイルの整形が変わる。
   あわせて ADR-3077 の `tinypool` override が oxfmt の新しい pin と食い違う

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#3215](https://github.com/kompiro/karasu/pull/3215) | `mocha`（vscode-e2e） | 12.0.2 → 12.0.3 | patch | green | low | 採用（そのままマージ） |
| [#3214](https://github.com/kompiro/karasu/pull/3214) | `lefthook`（root） | 2.1.14 → 2.1.17 | patch | green | low | 採用（そのままマージ） |
| [#3212](https://github.com/kompiro/karasu/pull/3212) | `@vitejs/plugin-react`（app） | 6.1.1 → 6.1.2 | patch | green | low | 採用（そのままマージ） |
| [#3211](https://github.com/kompiro/karasu/pull/3211) | `oxlint`（root） | 1.85.0 → 1.87.0 | minor | green | low | 採用（そのままマージ） |
| [#3209](https://github.com/kompiro/karasu/pull/3209) | `marked`（app / vscode、runtime） | 18.0.13 → 18.1.0 | minor | green | low | 採用（そのままマージ） |
| [#3210](https://github.com/kompiro/karasu/pull/3210) | `vscode-extension-tester`（vscode-e2e） | 8.27.0 → 8.28.1 | minor | green | low | 採用（**差し替え PR**: #3216 と floor の引き上げを 1 コミットに） |
| [#3216](https://github.com/kompiro/karasu/pull/3216) | `@types/vscode`（vscode / vscode-e2e） | 1.137.0 → 1.140.0 | minor | Check / ExTester red（想定どおり） | low | 採用（同上） |
| [#3213](https://github.com/kompiro/karasu/pull/3213) | `oxfmt`（root） | 0.63.0 → 0.72.0 | 0.x minor（BREAKING 含む） | Check red（Format check） | low | 採用（**差し替え PR**: 整形と `tinypool` override の調整を同梱） |

## PR ごとの分析

### #3210 `vscode-extension-tester` 8.27.0 → 8.28.1 / #3216 `@types/vscode` 1.137.0 → 1.140.0

**#3216 単独では通らない。** `vscode-version-policy.test.ts` が `engines.vscode`（`^1.137.0`）と `@types/vscode`
（`^1.140.0`）の不一致で落ち、ExTester ジョブは vsce の `@types/vscode ^1.140.0 greater than engines.vscode ^1.137.0`
で落ちる。Dependabot は `engines` を書き換えないので、bot の diff では構造的に CI を通せない（ADR-2562 と同じ型）。

**#3210 単独では通る**（floor 1.137 のまま ExTester が `vscode-max` の 1.140 をダウンロードして 21 件通過）。
ExTester 8.28.1 の変更は次のとおり:

- `supportedVersions`: `vscode-min` 1.135.0 → 1.138.0、`vscode-max` 1.137.0 → 1.140.0
- コード: `browser.js` の `openResources` が `.code-workspace` をエディタタブではなくワークスペースとして扱う 1 行の修正
- 依存: `@vscode/vsce` `^3.9.2` → `^4.0.0`（major）、`@redhat-developer/page-objects` / `locators` 1.24.0 → 1.25.1、
  `selenium-webdriver` 4.49.0 → 4.50.0 ほか patch

**#3210 だけが新しいパッケージ名を lock に持ち込む。** `@vscode/vsce@4.0.0` が `@azure/identity`（lock には
`unstorage` 経由で既存。4.13.1 → 4.13.3 に揃う）、`@napi-rs/keyring@1.3.0`（keytar の置き換え。napi-rs の
prebuilt binary を optionalDependencies で持ち、install script なし。GitHub Actions OIDC + provenance）、
`@vscode/vsce-sign@2.1.0`（`postinstall` あり、`allowBuilds: false` で実行されない）、`proper-lockfile` 等を入れる。
vsce 4.0.0 は 09-14 公開で、publisher は従来どおり `microsoft1es`。破壊的変更は Node 22 への baseline 引き上げ
（repo は `>=22.12`）と依存の整理で、ExTester が使うのは拡張の packaging だけである。repo の `packages/vscode` /
`packages/vscode-e2e` が直接宣言する `@vscode/vsce` は `^3.9.2` のまま残り、lock には 3.9.2 と 4.0.0 が並ぶ
（dev のみ。出荷物には入らない）。

**floor を 1.140 に上げるのは現行規則でも #3070 の提案でも正しい。**

- 現行規則（ADR-2562 + ADR-2782）: floor は最新の `@types/vscode`（1.140.0）に追随し、ExTester の `vscode-max` 以下に
  抑える。8.28.1 の `vscode-max` は 1.140.0 なので、1.140 は上限ちょうどで許される
- #3070 の提案: floor は cooldown を越えた最新 ExTester の `vscode-max` に置き、ExTester の bot PR を引き金に
  ExTester の bump と floor の引き上げを差し替え PR 1 本で入れる。#3070 本文が「最初の適用は ExTester ^8.28 +
  floor ^1.140.0」と書いている組がそのまま今回である

**反映**: #3210 と #3216 を close し、差し替え PR 1 本で次を 1 コミットに入れる。

- `packages/vscode-e2e/package.json`: `vscode-extension-tester` `^8.28.1`、`@types/vscode` `^1.140.0`
- `packages/vscode/package.json`: `@types/vscode` `^1.140.0`、`engines.vscode` `^1.140.0`
- `karasu-vscode` の changeset（minor。1.137–1.139 の VS Code では新版を入れられなくなる。ADR-2562 / 前回の floor
  引き上げ #2964 と同じ扱い）

#3070 本体（`dependabot.yml` での `@types/vscode` の ignore と ADR 化）は今回の範囲に含めない。今回の差し替え PR は
現行規則の範囲内で完結し、#3070 の ADR はこの適用例を引用できる。

### #3213 `oxfmt` 0.63.0 → 0.72.0

upstream の 0.64–0.72 のリリースノートを読んだ。0.72.0 に BREAKING change が 1 件ある:
**`parser:markdown` のファイルを bundled Prettier ではなく `oxc_formatter_markdown` で整形する**（oxc#27256）。
0.71.0 で bundled Prettier を 3.9.9 に上げ、JS formatter のコメント処理の修正も多数入っている。

Format check で落ちた 4 ファイルを 0.72.0 で整形し直した差分（scratch に oxfmt 0.72.0 を入れ、repo の
`.oxfmtrc.json` で実行）:

| ファイル | 変化 |
| --- | --- |
| `packages/cli/CHANGELOG.md` / `packages/core/CHANGELOG.md` | リスト項目の継続行（lazy continuation）`→ database\`` に 2 スペースのインデントが付く。レンダリング結果は同じ |
| `packages/e2e/fixtures/README.md` | 同上（`"sk-ant-test-fake")\`` の継続行） |
| `packages/core/src/renderer/crossing-marks.test.ts` | 末尾コメント付きの `if` / `else if` の本体が条件と同じ行に戻る（0.71.0 のコメント処理の修正） |

いずれも見た目だけの変化で、意味は変わらない。bot の diff には整形が含まれないため CI を通せない。ADR-2447 /
ADR-2623 と同じく、**差し替え PR で bump と整形を同梱する**。

**`tinypool` override の調整が要る。** ADR-3077 は `tinypool` の critical advisory 2 件（`< 2.1.2` / `<= 2.1.0`）に対して
override `tinypool: ~2.1.2` を置いた。`~` にしたのは、当時 oxfmt 0.63.0 が `"tinypool": "2.1.0"` を exact pin しており、
`^2.1.2` だと 2.2.0 に解決されて「利用元の pin から minor が動く」ためである。oxfmt 0.72.0 は `"tinypool": "2.2.0"` を
exact pin するので、`~2.1.2` のままだと逆に **override が upstream の pin より minor を 1 つ下げる**。lock 上の
`tinypool` の利用元は oxfmt だけである。

| 案 | 解決 | 評価 |
| --- | --- | --- |
| A. `~2.1.2` のまま | 2.1.2 | 動くが、ADR-3077 の「上流の意図から最小の距離」という理由と逆向きになる |
| **B. `^2.1.2` に緩める（推奨）** | 2.2.0（= oxfmt の pin） | security floor は残し、上流の pin に一致する |
| C. override を外す | 2.2.0 | 今は同じ解決だが、将来 oxfmt が脆弱版を pin し直したときに検出できない |

`tinypool` 2.1.2 → 2.2.0 の差分は CJS 参照の除去と `filename` に `URL` を受ける変更の 2 件（`dist/index.js` で数行）。
publisher は同じ 3 名、GitHub Actions OIDC + provenance、09-13 公開。advisory の修正箇所（`filename` / `execArgv` /
`env` の own property 判定）には触れていない。

B を採ると ADR-3077 の `assumptions:`（`grep: pnpm-workspace.yaml :: tinypool: ~2\.1\.`）が
`pnpm adr:check-assumptions` で落ちる。差し替え PR で同 assumption を `tinypool: \^2\.` などの floor の存在確認に
緩め、理由（oxfmt の pin が 2.2.0 に移った）を ADR-3077 に追記する（ADR-2623 が ADR-2447 の assumption を緩めた
前例と同じ扱い）。

### #3209 `marked` 18.0.13 → 18.1.0（`packages/app` / `packages/vscode`、runtime）

- 修正: link destination の Unicode 空白で起きる 3 次のバックトラッキング（ReDoS 相当）の解消、括弧の釣り合わない
  link destination の拒否、CLI 設定の top-level await
- 機能: lexer の `linkParenPossible` による早期失敗
- 括弧が釣り合わない URL を書いた Markdown の description は、18.1.0 からリンクにならない。CommonMark の仕様に寄る
  方向の修正で、karasu 側のテストは green
- publisher は GitHub Actions OIDC + provenance で前後同じ。lock の変化は `marked` 本体と共通の postcss だけ

### #3211 `oxlint` 1.85.0 → 1.87.0

1.86 / 1.87 のリリースノートに BREAKING は無い（Features / Bug Fixes / Performance のみ）。npm の差分は JS 側の
`dist/` と `configuration_schema.json` で、本体は platform 別 binding。peer `oxlint-tsgolint` の下限が上がっているが
repo は使っていない。lint は CI で green。

### #3212 `@vitejs/plugin-react` 6.1.1 → 6.1.2（`packages/app`）

Fast Refresh の判定修正（JSX 以外のファイルで refresh を有効にしない、型の種類が変わったら remount）と、React Compiler の
診断を常に warn する変更。peer `oxc-transform-react` の要求が `^0.152.0` に上がったが repo は使っていない
（lock に peer 宣言として出るだけ）。dev server の挙動だけで、ビルド出力には影響しない。

### #3214 `lefthook` 2.1.14 → 2.1.17（root）

npm の差分は `package.json` の版と optionalDependencies の版、README の版表記だけ。`postinstall.js` は無変更。
本体は platform 別 binary（`lefthook-linux-x64` 等）で、publisher は前後同じ OIDC + provenance。

### #3215 `mocha` 12.0.2 → 12.0.3（`packages/vscode-e2e`）

watch モードでテストファイルが 0 件でも落ちない、ESM fallback のエラー表示改善、削除済みファイルの unload で落ちない、
短いフラグの解釈修正。lock では `js-yaml` が 5.4.2 → 5.4.3 に移る（advisory 範囲 `<= 5.4.0` の外）。
`vscode-extension-tester` が peer で読む mocha も 12.0.3 になり、ExTester ジョブは green。

## 現時点の方針

1. **そのままマージ（5 件）**: #3215 / #3214 / #3212 / #3211 / #3209。すべて `pnpm-lock.yaml` を触るので、1 件ずつ
   マージし、残りには `@dependabot rebase` を掛けて CI を待つ
2. **VS Code floor の差し替え PR**: #3210 + #3216 を close し、ExTester ^8.28.1 + `@types/vscode` / `engines.vscode`
   ^1.140.0 + `karasu-vscode` minor changeset を 1 コミットで入れる
3. **oxfmt の差し替え PR**: #3213 を close し、oxfmt ^0.72.0 + 4 ファイルの整形 + `tinypool` override `^2.1.2` +
   ADR-3077 の assumption 緩和を入れる
4. 差し替え PR の 2 本は「採用」なので `@dependabot ignore` は設定しない

## 残した問い

- 差し替え PR を 2 本に分けるか 1 本にまとめるか。分ける案を推す（触るファイルが重ならず、VS Code 側は changeset を
  伴うのでレビューの観点が違う）
- #3070 の ADR 化をこの差し替え PR と同時に進めるか。今回は分ける案を推す（今回の変更は現行規則で正当化でき、#3070 は
  `dependabot.yml` の変更を伴う別の判断）
