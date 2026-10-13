---
id: TPL-3137
title: "バンドルした配布物の notices は、バンドルに入る workspace パッケージの依存まで数える"
status: active
date: 2026-10-13
applicable_to:
  - "他の workspace パッケージをソースごとバンドルして配布する成果物（esbuild / Vite のバンドル）"
  - "パッケージマネージャの依存一覧から THIRD_PARTY_NOTICES などのライセンス表記を生成する仕組み"
known_consumers:
  - karasu-cli
  - karasu-vscode
  - app
discovered_from:
  - issue: "#3137"
  - root_cause_adr: "ADR-1320"
  - root_cause_file: "scripts/ci/generate-third-party-notices.ts"
related_to:
  - TPL-1681
topic: build
scope:
  packages:
    - cli
    - vscode
    - app
---

# TPL-3137: バンドルした配布物の notices は、バンドルに入る workspace パッケージの依存まで数える

## 観点

配布物の notices（`THIRD_PARTY_NOTICES.md`）は、**配布するパッケージの依存一覧** ではなく **バンドルに入るコード** に対して評価する。workspace パッケージをソースごとバンドルすると、その workspace パッケージの依存もバンドルに入る。依存一覧を作るツールは workspace の境界で止まることがあり（`pnpm licenses list` は `workspace:` の先を辿らない）、そのとき notices は黙って欠ける。

同じ理由で、依存一覧を **名前** で引くと別のパッケージに当たることがある。monorepo の root と配布パッケージが同じ名前を持つと、root だけの依存が notices に混ざる。

## 想定される失敗モード

- workspace パッケージ（core 等）が後から prod 依存を持ち、それをバンドルする全ての配布物の notices から、その依存の LICENSE 全文が抜ける（#3137: CLI・CLI に同梱した app・VS Code 拡張の 3 つで `smol-toml` などが抜けていた）
- バンドルのために workspace パッケージを devDependencies に置き（esbuild の `--alias`）、`--prod` の一覧から丸ごと外れる
- 設計時に「バンドルする workspace パッケージは npm 依存ゼロ」と確認して終わり、依存が増えたときに再確認する仕組みが無い（ADR-1320）
- `--filter <name>` が同名の private root にも当たり、配布していない依存が notices に載る（#3137: CLI の notices に root の `@resvg/resvg-wasm`）

## チェックリスト

- [ ] 配布物がバンドルする workspace パッケージを列挙し、その prod 依存が notices に載っているか（dependencies だけでなく、alias でバンドルする devDependencies も見る）
- [ ] notices の生成器は、バンドルする workspace パッケージを手で列挙せず、依存グラフかバンドルの中身から求めているか
- [ ] 依存一覧を引くとき、パッケージを名前でなくディレクトリで指しているか（同名の root やパッケージに当たらないか）
- [ ] 実際の tarball / `.vsix` の notices を、バンドルに入る既知の第三者パッケージ名で検査するテストがあるか

## 既知の対処パターン

- 生成器が `workspace:` の依存を辿り、到達したパッケージのディレクトリを `--filter <dir>` で並べて 1 回で一覧する（#3137 で実装。pnpm は相対パスの `--filter` しか照合しないので、パッケージのディレクトリから相対で渡す。対象パッケージ自身は devDependencies も辿り、辿った先は dependencies だけを辿る）
- esbuild の metafile から出力に寄与した `node_modules` 配下のパッケージを数え、notices と照合する。Vite のバンドルには使えない（#3137 で検討し、生成には採らなかった）

## 関連テスト

- `scripts/ci/generate-third-party-notices.test.ts`（`bundledWorkspaceDirs`）: 対象パッケージは devDependencies も辿る、辿った先は dependencies だけを辿る、循環で止まる、link が無ければ落ちる、を fixture で検査する。実 repo でも CLI から core / i18n に届き、workspace root に届かないことを確かめる
- `packages/cli/pack/serve-from-tarball.test.ts`（`pnpm --filter ./packages/cli run test:pack`）: 実際の tarball の notices に `smol-toml` が載り、root だけの依存 `@resvg/resvg-wasm` が載らないことを検査する。同梱した app の notices にも `smol-toml` が載ることを見る

## 関連 TPL

- [TPL-1681](TPL-1681-publishable-tarball-completeness.md): tarball に **どのファイルが入るか**（notices ファイルが入ること自体を含む）を扱う。本 TPL は notices ファイルの **中身** がバンドルに入るコードを覆っているかを扱う
