# AT: Web App の初回体験（Welcome とサービス分割のガイドツアー）

- **日付**: 2026-11-03
- **関連 Issue**: [#3563](https://github.com/kompiro/karasu/issues/3563)（Epic）/ [#3583](https://github.com/kompiro/karasu/issues/3583)（配置の自動判定）/ [#3564](https://github.com/kompiro/karasu/issues/3564)（サンプル）/ [#3565](https://github.com/kompiro/karasu/issues/3565)（Welcome）/ [#3566](https://github.com/kompiro/karasu/issues/3566)（ガイドツアー）
- **PRD**: [#3573](https://github.com/kompiro/karasu/issues/3573)
- **対象ファイル**:
  - `examples/{en,ja}/service-split/`（`index.krs` / `planned.krs` / `migrating.krs`）
  - `packages/app/src/components/first-run/`（Welcome、ツアーパネル、表示条件、シーンの適用）
  - `packages/app/src/ProjectModeApp.tsx`（配線）
  - `packages/e2e/fixtures/opfs.ts`（既定で Welcome を閉じた状態にする）

> 初回訪問者が 5 分で「共通のモデルを持つとチームの設計判断が変わる」ことを体験する経路。Welcome は既定プロジェクトを作った初回起動だけに出て、Design a service split が 5 ステップのガイドに入る。

## 受け入れ条件

- [x] AT-A: 初回訪問で Welcome が出て、どれかを選んだあとは再読み込みしても出ない

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `greets a first visit once: after a choice, a reload opens the editor`

- [x] AT-B: 特定の場所へのリンク（`#krs-…` など）で開いたときは Welcome が出ない

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `stays out of the way of a deep link`
  > ✅ Automated — `packages/app/src/components/first-run/welcome-gate.test.ts` › `does not greet a visitor who arrived through a deep link`

- [x] AT-C: 既存のプロジェクトがある利用者には Welcome が出ない（既存ユーザーの操作を妨げない）

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `does not greet a visitor whose projects are already there`

- [x] AT-D: コマンドパレットの Show Welcome… で Welcome を開き直せる

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `Show Welcome… in the command palette opens it again`

- [x] AT-E: Understand an existing system は作成済みの Getting Started を開く

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `Understand an existing system opens the seeded Getting Started project`

- [x] AT-F: Track architecture evolution は移行途中の構造を現在のシステムと比べて開く

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `Track architecture evolution compares the migration with the current system`

- [x] AT-G: Design a service split はサンプルを新しいプロジェクトとして開き、既存のプロジェクトは残る

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `opens the sample as a new project, leaving the seeded ones in place`

- [x] AT-H: Next / Back で 5 ステップがそれぞれのファイル・ビュー・差分に移り、最後に Continue to editor でツアーが終わる

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `Next and Back walk the five steps through their files, views and diff`

- [x] AT-I: どのステップからでも Skip でツアーを終え、差分モードも抜ける

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `Skip ends the tour from the diff step and leaves diff mode`

- [x] AT-K: ステップを素早く行き来しても、読み込みの遅かった前のステップの差分やビューが後から被らない

  > ✅ Automated — `packages/app/src/components/first-run/use-guided-scene.test.ts` › `drops the diff and view of a scene left before its file loaded (TPL-1534)`

- [x] AT-L: Welcome を閉じるとキーボードのフォーカスがツアーに移る

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `hands keyboard focus to the tour when Welcome closes`

- [x] AT-J: ガイドが「気づき」として示す内容がサンプルで成り立っている（同居・所有のずれ・移行の注釈）

  > ✅ Automated — `packages/core/src/examples.test.ts` › `current: the Billing Team owns the Billing domain but no service`

- [x] AT-M: Design a service split の各ステップで、パネルの文が指しているノード（Step 1 のコマースアプリケーション、Step 3 の追加された請求サービス、Step 4 の ◇ Planned の請求 DB）の名前がプレビューの画面内にあり、ノードがツアーパネルと重ならない（既定のデスクトップの大きさ 1280×720 で判定）

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `(en) keeps each step's node clear of the panel, with no text overflowing`

- [x] AT-N: 日本語 UI でも同じ配置が成り立ち、どのステップでもパネルが画面内に収まり、パネル内の文言が切れたりはみ出したりしない

  > ✅ Automated — `packages/e2e/tests/at-3563-first-run-experience.spec.ts` › `(ja) keeps each step's node clear of the panel, with no text overflowing`

## 手動確認

N/A — 自動テストですべて覆っている（配置と文言のはみ出しは AT-M / AT-N の e2e が判定する。[#3583](https://github.com/kompiro/karasu/issues/3583)）
