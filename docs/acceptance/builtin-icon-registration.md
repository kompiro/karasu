---
type: product
---

# AT: 組み込みアイコンを全描画面で登録し、名前が解決しない `url()` を診断する（#2802）

- **日付**: 2026-09-21
- **関連 Issue**: [#2802](https://github.com/kompiro/karasu/issues/2802)
- **関連 ADR**: [ADR-9005](../adr/9005-svg-icon-file-import.md)（SVG ファイル + マニフェスト方式。本 AT の生成モジュールはその正本を残したままのビルド成果物）
- **Related TPLs**: [TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)（core が読むレジストリの中身はホストに依存しない）, [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードは全描画面で点検する）, [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（二重表現は drift テストで固定する）, [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理する語彙は効果か警告を持つ）, [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（バンドル済み配布物でも同じに動く）
- **対象ファイル**:
  - `packages/core/src/shapes/builtin-icons.ts`（import 時の自動登録）、`packages/core/src/shapes/builtin-icons.generated.ts`（`packages/core/icons/` からの生成物）
  - `scripts/icons/gen-builtin-icons.ts`（`pnpm gen:icons` / `--check`）
  - `packages/core/src/style/value-validator.ts`（`style-unknown-icon`）、`packages/core/src/compile/compile.ts`（warning への変換。位置を保つ）
  - `packages/app/src/hooks/useSystemView.ts`（app 側の登録を削除）
  - `docs/spec/style.md` / `style.ja.md`（shape property 節）、`docs/spec/diagnostics.md` / `diagnostics.ja.md`（Style validation 表）

> `shape: url("<name>")` と icon display mode は、ブラウザ app だけが組み込みアイコンを登録していたため、`karasu render`・VS Code プレビュー・LSP・Cloudflare 側では診断なしで `box` になっていた。core が組み込みアイコンを import 時に自分で登録し、未登録の名前は宣言位置で `style-unknown-icon` warning にする。

## 受け入れ条件

### AC-1: ホストが何もしなくても組み込みアイコンが解決する

- [x] TC-1: core の package entry を import しただけで、マニフェストの全アイコンが `builtIn: true` で登録されている

  > ✅ Automated — `packages/core/src/shapes/builtin-icons.test.ts` › built-in icons register on import (#2802, TPL-2802) › every manifest icon is a registered, built-in shape without any host call

- [x] TC-2: `compile()` が `shape: url("database")` を database アイコンで描く（ホストの登録なし）

  > ✅ Automated — `packages/core/src/shapes/builtin-icons.test.ts` › built-in icons register on import (#2802, TPL-2802) › draws `shape: url("database")` as the database icon with no host registration

- [x] TC-3: `displayMode: "icon"` が組み込みアイコンで描く（ホストの登録なし）

  > ✅ Automated — `packages/core/src/shapes/builtin-icons.test.ts` › built-in icons register on import (#2802, TPL-2802) › draws icon display mode with the built-in icons, with no host registration

- [x] TC-4: icon theme（`ICON_RULES`）と `client-<subtype>` が使う名前がすべて登録済み（parity）

  > ✅ Automated — `packages/core/src/shapes/builtin-icons.test.ts` › icon theme parity — every name the theme generates is registered (TPL-1415) › ICON_RULES only name built-in icons

### AC-2: 生成モジュールは正本（`packages/core/icons/`）から drift しない

- [x] TC-5: 生成モジュールの名前集合が manifest と一致し、順序も manifest に従う

  > ✅ Automated — `scripts/icons/gen-builtin-icons.test.ts` › built-in icon codegen (#2802) › names exactly the icons the manifest names, in manifest order

- [x] TC-6: commit 済みの生成モジュールが `pnpm gen:icons --check` を通る（lefthook と同じ呼び出し）

  > ✅ Automated — `scripts/icons/gen-builtin-icons.test.ts` › built-in icon codegen (#2802) › the committed module is up to date (run `pnpm gen:icons` if this fails)

### AC-3: 各描画面で同じ結果になる

- [x] TC-7: `karasu render` が `url("database")` のノードにアイコンを描く

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › built-in icons resolve in karasu render (#2802) › draws `shape: url("database")` as the built-in database icon

- [x] TC-8: VS Code 拡張ホストの `compileProject` 経路で `url("database")` と icon mode がアイコンを描く

  > ✅ Automated — `packages/vscode/src/builtin-icons-extension-host.test.ts` › built-in icons in the extension host's compile path (#2802) › draws `shape: url("database")` without the extension registering anything

### AC-4: 未登録の名前は宣言位置で warning になり、描画は `box` に落ちる

- [x] TC-9: validator が `url("databse")` に `style-unknown-icon`（warning）を値の位置で出し、組み込みの名前には出さない

  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` › validateStyleValues — url() names a registered icon › warns with style-unknown-icon when the name is not registered, at the value's location

- [x] TC-10: `karasu lint-style` が `<file>:<line>:<col> warning:` の形で報告し、exit 1 にしない

  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › lintStyle() with explicit files › reports a style-unknown-icon warning at the value's line, without exiting 1

- [x] TC-11: LSP（VS Code の Problems）が `.krs.style` の該当行に Warning を出し、組み込みの名前を誤検知しない

  > ✅ Automated — `packages/lsp/src/diagnostics.test.ts` › computeDiagnostics — url() icon names (.krs.style) › warns on a url() that names no registered icon, at the value's range

- [x] TC-12: `karasu render` が warning を出しつつ描画を続ける（ノードは `box`）

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › built-in icons resolve in karasu render (#2802) › warns when a url() names no icon, and still renders the node as a box

- [x] TC-13: `compile()` の warning が値の位置（`loc`）を保ち、app の警告パネルが行を示せる

  > ✅ Automated — `packages/vscode/src/builtin-icons-extension-host.test.ts` › built-in icons in the extension host's compile path (#2802) › surfaces a style-unknown-icon warning for a typo, anchored on the sheet

### 手動確認

- [ ] M-1: VS Code 拡張（`.vsix` でインストールしたもの）で `service { shape: url("database"); }` を持つ `.krs.style` を import したモデルを開き、プレビューにアイコンが描かれる。Icon mode トグルでアイコンカードになる（拡張ホストのバンドル経由でしか確かめられない。TPL-1024）
- [ ] M-2: 同じ VS Code で `url("databse")` に書き換えると、Problems パネルにその行を指す Warning が出て、プレビューのノードは box になる
