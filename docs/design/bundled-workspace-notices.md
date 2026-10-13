# バンドルした workspace パッケージの依存を THIRD_PARTY_NOTICES に載せる

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3137](https://github.com/kompiro/karasu/issues/3137)
  - 関連 ADR: [ADR-1320](../adr/1320-license-compliance-automation.md)（notices の自動生成。本件はその前提「core は npm 依存ゼロ」が崩れたことへの対応）、[ADR-3017](../adr/3017-serve-app-shipping.md)（CLI に同梱した app の notices。「決めずに残したこと」で本件を後続に回した）
  - 関連 TPL: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（tarball の中身で評価する）。本件の観点は TPL-1681 に無いので、実装 PR で新規 TPL を起こす
  - コード: `scripts/ci/generate-third-party-notices.ts`

## 背景・課題

ADR-1320 は publish するパッケージごとに `THIRD_PARTY_NOTICES.md` を生成し、バンドルに入る他者のコードの LICENSE 全文を同梱すると決めた。生成器は `pnpm --filter <name> licenses list --prod` の結果だけを数える。当時は「core は npm 依存ゼロなので、core をバンドルしても漏れる第三者ライセンスはない（将来 core に prod 依存を入れる場合は再確認）」としていた。

その後 core は `smol-toml` と `yaml` を prod 依存に持った。再確認の仕組みが無かったので、漏れが出ている。手元で確かめると、漏れは Issue が挙げた CLI だけではない。

## 現状（インベントリ）

`pnpm licenses list` は、選択したプロジェクトの第三者依存しか列挙しない。`workspace:` で繋がった別の workspace パッケージの依存までは辿らない（`--filter "./packages/cli..."` で依存側を選んでも同じ。`--filter` を複数並べたときだけ和集合になる）。

| notices | 生成元 | バンドルに入る workspace パッケージ | notices から漏れているもの |
| --- | --- | --- | --- |
| CLI `THIRD_PARTY_NOTICES.md` | `--filter karasu` | core / i18n（devDependencies。esbuild の `--alias` でソースごとバンドル） | `smol-toml`（esbuild metafile で確認。`yaml` は external） |
| CLI `dist/app/THIRD_PARTY_NOTICES.md`（ADR-3017） | `--filter @karasu-tools/app` | core / i18n（dependencies。Vite がバンドル） | `smol-toml` |
| VS Code `THIRD_PARTY_NOTICES.md` | `--filter karasu-vscode` | core / i18n / lsp（dependencies。`out/extension.js` と lsp の `out/server.js`） | `smol-toml` / `yaml` / `vscode-languageserver`（metafile で確認） |

もう 1 つ、逆向きの誤りもある。root の `package.json` も `"name": "karasu"`（private）なので、`--filter karasu` は CLI と root の両方に当たる。そのため CLI の notices に、root だけが持つ `@resvg/resvg-wasm` が載っている。CLI はこれを配布していない。root の `test` script が CLI を `--filter ./packages/cli` で指しているのはこの衝突を避けるため。

allowlist の検査（`check-license-allowlist.ts`）は `pnpm --recursive licenses list --prod` で全 workspace を見ているので、`smol-toml` も検査済み。漏れは notices の側だけ。

## 制約・前提

- 生成器は 1 本で、esbuild（CLI・VS Code・lsp）と Vite（app）の両方のバンドルに使える必要がある。
- 載せすぎは許容し、載せ漏れは許容しない。tree-shaking で実際には入らなかった依存が notices に載っても、ライセンス上の害はない。
- `prebuild` で生成する現行の配線（ADR-1320）と、`--out` で app の notices を CLI の `dist/app/` に書く配線（ADR-3017）は変えずに済むならそのまま残す。
- external 指定した依存（CLI の `commander` / `chokidar` / `yaml`）を notices に載せる扱いは ADR-1320 のとおり変えない。
- out of scope: notices の書式、allowlist、upstream `ThirdPartyNotices` の扱い。

## 検討した選択肢

### 案1: workspace の依存グラフを辿って `--filter` を並べる

生成器が対象パッケージの `package.json` から `workspace:` の依存を辿り、到達した workspace パッケージのディレクトリをすべて `--filter <dir>` で並べて `licenses list --prod` を 1 回呼ぶ。

辿り方の規則は次のとおり。

- 対象パッケージ自身は `dependencies` と `devDependencies` の両方を辿る。CLI は core / i18n を devDependencies に置いて alias でバンドルしているので、devDependencies も辿らないと拾えない。
- 辿った先の workspace パッケージは `dependencies` だけを辿る。それらの devDependencies はバンドルに入らない。

この規則で選ばれる集合は CLI = {cli, core, i18n, karasu-skills}、app = {app, core, i18n}、VS Code = {vscode, core, i18n, lsp}。`--filter` はパッケージ名でなくディレクトリで指定するので、root との名前の衝突も同時に消える。

**メリット**

- esbuild と Vite を区別せずに使える。app の notices も同じ修正で直る。
- core に prod 依存が増えれば、次の build から自動で載る。ADR-1320 が手で再確認するとしていた前提を、仕組みが引き受ける。
- 変更は生成器の中で閉じ、`package.json` の build 配線を変えない。

**デメリット**

- 依存グラフはバンドルの中身の近似。workspace でない第三者パッケージを devDependencies に置いてバンドルすると拾えない（現状は該当なし。CLI の metafile に入る第三者は `smol-toml` だけ）。
- tree-shaking で落ちた依存も載る（載せすぎ側なので許容）。
- CLI が `karasu-skills` を辿る。karasu-skills はバンドルせず別パッケージとして配布するが、prod 依存を持たないので notices は変わらない。

### 案2: esbuild の metafile からバンドルに入ったパッケージを数える

build に `--metafile` を足し、出力に寄与した入力ファイルのパスから `node_modules` 配下のパッケージを割り出す。external 指定した依存は従来どおり `pnpm licenses list` で足す。

**メリット**

- バンドルに実際に入ったものだけを数えるので、近似ではない。

**デメリット**

- Vite には esbuild の metafile が無い。app の notices（ADR-3017）は別の手段（rollup の bundle 情報を出すプラグイン等）が要る。
- 生成を `prebuild` から build の後へ移す必要がある。VS Code は lsp の build が出す `server.js` の metafile も受け取る必要があり、パッケージをまたいだ受け渡しが増える。
- metafile を `.vsix` に入れないよう `.vscodeignore` も触る。

### 案3: バンドルする workspace パッケージを build script に明示する

生成器に `--include ../core ../i18n` のような引数を足し、各パッケージの `package.json` に書く。

**メリット**

- 何を数えているかが script を読めば分かる。

**デメリット**

- 新しい workspace 依存を足したときに引数を足し忘れると、同じ種類の漏れが再発する。今回の原因（手で再確認する前提）をそのまま残す。

## 比較

| 観点 | 案1 グラフ | 案2 metafile | 案3 明示 |
| --- | --- | --- | --- |
| app（Vite）の notices | 直る | 別手段が要る | 直る |
| core に依存が増えたとき | 自動 | 自動 | 手で追随 |
| 正確さ | 載せすぎあり、workspace 外の devDependency バンドルは漏れる | バンドルの中身どおり | 引数次第 |
| build 配線の変更 | なし | prebuild→postbuild、lsp→vscode の受け渡し | 各 script に引数 |

## 現時点の方針

**案1 を採用する**: 3 つの notices をすべて同じ修正で直せるのは案1と案3で、そのうち依存の追加に自動で追随するのは案1だけ。案1の弱点（workspace 外の devDependency を直接バンドルした場合に漏れる）は現状の 3 つのバンドルのどれにも当てはまらない。将来その形が出たら案2の metafile 照合を足す。

### 実装の指針

1. `generate-third-party-notices.ts` に、パッケージディレクトリから上の規則で workspace パッケージのディレクトリ集合を返す純関数（`package.json` を読むだけ）を足す。workspace パッケージの場所は `pnpm-workspace.yaml` の `packages` から解決するか、`node_modules/<name>` の symlink を `realpath` で辿る（実装時に単純な方を選ぶ）。
2. `collectNotices` が `--filter <dir>` を集合の数だけ並べて `licenses list --prod --json` を呼ぶ。名前での `--filter` はやめる。
3. テスト（`scripts/ci/generate-third-party-notices.test.ts`）:
   - 一時ディレクトリの fixture で辿り方の規則を確かめる（root は devDependencies も辿る、辿った先は devDependencies を辿らない、循環しても止まる）。
   - 実 repo に対して、CLI の集合が core / i18n を含み、root を含まないことを確かめる。
4. CLI の `pack/serve-from-tarball.test.ts` で、tarball の `THIRD_PARTY_NOTICES.md` に `## smol-toml@` があり `@resvg/resvg-wasm` が無いことを確かめる（CI の `test:pack` で走る）。
5. TPL: 「バンドルする配布物の notices は、バンドルに入る workspace パッケージの依存まで数える」を新規 TPL として起こす（3-Yes: VS Code と app にも同じ形で出ていた / workspace パッケージが依存を足すたびに再発しうる / TPL-1681 は tarball に入るファイルの観点で、notices の中身は扱っていない）。
6. AT は置かない。確認はすべて 3・4 のテストで機械的に行える。
7. ADR 昇格: 実装のマージ後、`docs/adr/3137-bundled-workspace-notices.md` として昇格し、本 Design Doc は同 PR で削除する。ADR-1320 の「core は npm 依存ゼロ」の記述は本 ADR が置き換える旨を書く（ADR-1320 は書き換えない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 次のリリースの CLI と VS Code 拡張で、notices に `smol-toml` などが増え、CLI の notices から `@resvg/resvg-wasm` が消える。コードの挙動は変わらない。
- ドキュメント更新: なし（`CONTRIBUTING.md` の License compliance 節は生成の仕組みの細部に触れていない。実装時に確認する）。
- テスト・examples への影響: なし。

## 未解決の問い / 決めないこと

- esbuild metafile による照合（案2）を、生成ではなく検査として足すか。workspace 外の devDependency をバンドルする形が出るまで足さない。
- 既に publish 済みの版の notices は直さない。次のリリースから正しくなる。
