# AT-1777: English variant of the full ec-platform getting-started seed

- **日付**: 2026-06-25
- **関連 Issue**: [#1777](https://github.com/kompiro/karasu/issues/1777)（親: [#1642](https://github.com/kompiro/karasu/issues/1642)）
- **関連 ADR**: [ADR-20260616-08](../adr/20260616-08-en-ja-example-parity.md)（en/ja example parity）
- **対象**:
  - `examples/en/ec-platform/`（15 ファイル / 7 ステージの英語版）
  - `packages/core/src/builtins/examples.ts`（`EC_PLATFORM_PROJECTS_EN`）
  - `packages/app/src/hooks/useProjectInitialization.ts`（seed の locale 出し分け）
  - `.claude/rules/examples-sync.md`（マッピング行追加）

## 概要

アプリは初回起動時に getting-started のフル drill-down（`ec-platform`、system → users → clients → domains → annotations → multifile → deploy → cross-system の 7 ステージ）を seed する。これまで英語版が無く、英語ブラウザのユーザーにも日本語ラベルのまま投入されていた（#1642 の triage で残件 A として切り出し）。`examples/en/ec-platform/` を用意し、`EC_PLATFORM_PROJECTS_EN` として同梱、ProjectMode の seed を locale 一致版に出し分ける。

ID は不変・構造は ja と同一に保ち、`label` / `description` / コメントのみ英訳する（getting-started ペアと同じ規約）。

## 受け入れ条件

### AC-1: 英語版 example がコンパイルでき、構造が ja と一致する

> ✅ Automated by `packages/core/src/examples.test.ts` (suite-wide)

- [x] `examples/en/ec-platform/` の 15 ファイルすべてが error 重大度の diagnostic なしでパースできる
- [x] en のステージ構成・bundled パスが ja と一致する（各ステージ先頭ファイルは bundled 時 `index.krs` にリネーム）

### AC-2: 同梱内容が on-disk と byte 一致する（ja / en 両ロケール）

> ✅ Automated by `packages/core/src/examples.test.ts` (suite-wide) — `ec-platform (ja|en): bundled content matches its on-disk examples/ source`

- [x] `EC_PLATFORM_PROJECTS`（ja）が `examples/ja/ec-platform/` と byte 一致
- [x] `EC_PLATFORM_PROJECTS_EN`（en）が `examples/en/ec-platform/` と byte 一致

### AC-3: ProjectMode の初回シードが locale に応じて ec-platform の en/ja を投入する

> ✅ Automated by `packages/app/src/hooks/useProjectInitialization.test.ts` (suite-wide)

- [x] locale=ja で `EC_PLATFORM_PROJECTS`（日本語）を seed する
- [x] locale=en で `EC_PLATFORM_PROJECTS_EN`（英語）を seed する

### AC-4: 英語ユーザーが英語ラベルのチュートリアルを得る（目視）

- [ ] OPFS を空にした状態でブラウザ locale=en でアプリを初回起動 → seed された `01-system`〜`07-cross-system` の各プロジェクトが**英語ラベル**で描画される。locale=ja では日本語のまま（目視）

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core run test`（パース + byte 一致 ja/en）/ `pnpm --filter @karasu-tools/app run test`（seed locale）。いずれも PR CI に乗る。
- 手動: ブラウザの言語設定を英語にし、OPFS（IndexedDB / Origin Private File System）を空にした状態でアプリを起動。左ペインの ec-platform 系プロジェクトを順に開き、ラベルが英語で表示されることを確認する（AC-4）。
