# app E2E を機能面で充足させるプログラム

- **日付**: 2026-10-03
- **ステータス**: 検討中
- **Issue**: [#3039](https://github.com/kompiro/karasu/issues/3039)
- **PR**: [#3050](https://github.com/kompiro/karasu/pull/3050)
- **関連**:
  - 引き金 Issue: [#3039](https://github.com/kompiro/karasu/issues/3039)（sub-issue [#3040](https://github.com/kompiro/karasu/issues/3040)〜[#3049](https://github.com/kompiro/karasu/issues/3049)）
  - 関連 ADR: [ADR-529](../adr/529-playwright-with-ai-visual-review.md)（Playwright 採用、漸進導入）、
    [ADR-862](../adr/862-opfs-fixture-helper.md)（OPFS fixture）、[ADR-864](../adr/864-chat-anthropic-mock-fixture.md)（Anthropic mock）、
    [ADR-916](../adr/916-acceptance-test-automation-markers.md)（AT 自動化マーカー）、[ADR-1008](../adr/1008-flaky-e2e-fixme-and-issue.md)（flake は `test.fixme` + Issue、`retries: 0`）、
    [ADR-1729](../adr/1729-e2e-path-filter-trigger.md)（path filter）、[ADR-1866](../adr/1866-e2e-required-status-check.md)（required check + paired stub）、
    [ADR-2807](../adr/2807-suite-budget-clears-its-setup.md)（timeout 予算）、[ADR-1890](../adr/1890-ci-runner-ubicloud.md)（runner）、[ADR-2643](../adr/2643-stacked-pr-workflow.md)（draft では分単位 CI が止まる）
  - 関連 TPL: 後述「Related TPLs」
  - コード: `packages/e2e/playwright.config.ts`、`packages/e2e/fixtures/`、`.github/workflows/e2e.yml` / `e2e-skip.yml` / `e2e-nightly.yml` / `at-check-coverage.yml`、`scripts/acceptance/coverage.ts`、`scripts/lint/app-shortcut-docs-sync.ts`

## 背景・課題

`packages/e2e` の Playwright suite は、ADR-529 の「1 本のパイロットから始めて運用実績を見てから拡大する」
方針どおり、AT が e2e を要求した Issue ごとに spec を足して育ってきた。その結果、カバレッジは
**機能面ではなく履歴**に従っている。2026-10-03 に測ると次のとおり。

| 指標                              | 値                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| spec                              | 47 `at-*` + 2 fixture smoke、runtime 189 テスト                                              |
| 合計時間                          | 560s（平均 2.96s、CI は `workers: 1`、test step 上限 900s）                                  |
| 安定性                            | nightly 直近 8 日 全 success、flake Issue は 90 日で 1 件（#2789）                           |
| app 対象 AT                       | 119 ファイル / 1,415 項目                                                                    |
| 項目の内訳                        | e2e 198（14%）+ 部分 4 / unit 632（45%） / その他の自動化（scripts・CI）61 / 手動 520（37%） |
| e2e spec を 1 本も引かない app AT | 73 / 119 ファイル                                                                            |

「app 対象」は、到達先が app の preview UI（`http://localhost:5173` / `https://karasu.kompiro.dev/`）である AT を
読んで分類したもの（CLI / LSP / VS Code / nest / docs-site 対象を除く）。項目の内訳は `scripts/acceptance/coverage.ts`
と同じ marker 正規表現を箇条書きごとに当てた概算で、チェックボックスの無い旧形式の AT はケース見出しを 1 項目と数えた。
再現可能な基準値は「app 対象 AT のうち `packages/e2e/tests/` の path を引かないファイル数」（73 / 119）で、
その 73 ファイルの一覧は Issue #3039 のコメントに置く。

日常的に触る面に spec が 1 本も無い: ショートカット全般とコマンドパレット、CRUD matrix タブ、Facets と
Membership overview、Collapse / Expand all、Outline、edge detail panel と edge context menu（`.krs.style` を書く）、
Share と `?krs=` deep link、プロジェクト rename / zip export・import / `/projects/<id>` の history、
スナップショット、ファイル rename / delete、Format / Tidy、Translate、`ja` への locale 切替、hash reload と
back/forward、warning の再描画、serve mode。AT-0046 AC5 は「#534 待ち」の注記のまま #534 が 4 月に閉じ、
AT-0050 AC-11 は `test.skip` のまま置かれている。

これらは jsdom が模せない境界（OPFS / localStorage の永続化、URL / hash / history / reload、
ダウンロード / アップロード / popup、実フォーカスとキー入力、`confirm` / `prompt`）を跨ぐ流れなので、
unit テストでは代替できない。ADR-33 が「UI 構造が安定し、E2E のメンテナンスコストが低くなったら
再評価する」と置いた条件は、上の flake 実績で満たされている。

## 現状（インベントリ）

| 観点                | 現状                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実行環境            | chromium 1 project、`fullyParallel: true`、`workers: process.env.CI ? 1 : undefined`（foundation PR #532 から未再計測）、`retries: 0`、`timeout: 15_000`、CI の `webServer` は `vite build && vite preview`                                                                                                    |
| CI                  | `e2e.yml`（path filter: app / core / e2e / lockfile、draft skip、required `Playwright`）と `e2e-skip.yml`（逆 filter の stub）、`e2e-nightly.yml`（cron。計測時点では `workflow_dispatch` に input が無く `notify` が `if: always()` だった。PR-A #3040 で `inputs.workers` と計測 run の notify skip を追加） |
| 予算                | test step 15 分、job 35 分（ADR-2807）。runner `ubicloud-standard-4`（4 vCPU）                                                                                                                                                                                                                                 |
| fixtures            | `opfs.ts`（seed / reset / read / gotoApp、`karasu-locale=en` 固定、`gotoApp` は `new URL(path, baseURL)` なので full URL も受ける）、`boot.ts`、`tabs.ts`、`editor.ts`、`download.ts`、`anthropic.ts`、`chat.ts`、`preview-pane.ts`                                                                            |
| spec 内の重複ヘルパ | `drillInto*`（1907-toggle / 2800 / 0049 / 0054）、`luminance()`（1470 / 1479）、`seedAndOpen`（0041 / 0058-diff-colors）、Tree View トグル（0044 / 2799）                                                                                                                                                      |
| セレクタ            | `data-testid` は app / core にゼロ。role / aria-label / 表示文字列 / `data-*`（core が SVG に書く）だけ                                                                                                                                                                                                        |
| AT ↔ spec の guard  | `at:check-coverage` は spec path の実在と orphan を見るが、`›` 後のテスト名は見ない。計測時点では CI の `at-check-coverage.yml` が `packages/e2e/tests/**` で発火せず lefthook の glob だけが見ていた（PR-A #3040 で CI 側にも追加）                                                                           |
| README              | 「`e2e` ラベルで CI が走る」のまま（実際は ADR-1729 の path filter）                                                                                                                                                                                                                                           |
| 既知の skip         | AT-0050 AC-11（`EditPane.tsx:85` で `<ChatPane>` が unmount されるため patch 提案が消える）                                                                                                                                                                                                                    |

## 制約・前提

- `retries: 0` と「flake は `test.fixme` + 追跡 Issue」（ADR-1008）は変えない。flake を隠す方向の変更は入れない
- test step 15 分の予算（ADR-2807）は据え置く。追加分はこの中に収める
- `page.goto` 直書きは `lint:e2e-page-goto` で禁止。navigation は `opfs.gotoApp` 経由
- AT の書式は `.claude/rules/acceptance.md`（`> ✅ Automated — <path> › <test>`、手動項目は未チェックのまま本番 URL を指す）
- 手動 QA は残す（ADR-529 の三層モデル）。視覚判断、Pages Functions でしか動く経路（`/s?s=`）、LLM 応答品質は自動化対象外
- Design Doc からは `docs/design/` を AT が指せないので、AT の設計根拠は Issue #3039 を指す（ADR-2348）
- out of scope: Firefox / WebKit project（WebKit は OPFS `createWritable` 非対応）、既存 spec の幾何・色 assertion を core unit へ移すこと、`at:check-coverage` のテスト名実在確認

## 検討した選択肢

### 論点 1: e2e と unit の境界をどこに引くか

#### 案 1-A: jsdom が模せない境界を跨ぐ流れだけを e2e が持つ

OPFS / localStorage / sessionStorage の永続化、URL / hash / history / reload、別ウィンドウ・ダウンロード・
アップロード・clipboard、実フォーカスとキーイベント（Monaco の focus 含む）、wheel / drag のレイアウト、
`confirm` / `prompt`。コンポーネント内の分岐は RTL に残す。

**メリット**: 1 つの判定条件で e2e に入れるかどうかが決まる。unit と e2e の重複が最小。
**デメリット**: 「見た目が正しいか」は e2e からも落ちる（視覚判断は手動のまま）。

#### 案 1-B: AT の手動項目をすべて e2e に移す

**メリット**: 数字（手動 520 項目）が直接減る。
**デメリット**: 手動項目の多くは視覚判断で、DOM assertion に写すと「色が一致する」のような脆い spec になる。
ADR-529 のピクセル比較を持たない方針と衝突する。

### 論点 2: セレクタ

#### 案 2-A: `data-testid` を導入しない。role / aria-label が無い操作面は app 側に足す

**メリット**: 既存規約（`getByRole` 優先、`packages/e2e/README.md`）と連続。足した role / label は
a11y の改善にもなり、RTL でも同じセレクタが使える（TPL-1399）。
**デメリット**: app 側の小変更が e2e の PR に混ざる。今回は `NodeDetailPanel` と `EdgeDetailPanel` の root
（どちらも素の `div.node-detail-panel`）に `role="region"` + `aria-labelledby` を揃えて足す 1 点、任意で 3 点
（`WarningPanel` ヘッダ、`ProjectSelector` の `<select>`、`InlineInput`）。`role="dialog"` にしないのは、
焦点を奪わない inline の側面パネルであり、shadcn `Dialog` が同時に開いたとき `getByRole("dialog")` が
曖昧になるため。片方だけに role を足すと双子のパネルで読み上げが食い違う（TPL-1399）。

#### 案 2-B: `data-testid` を必要箇所に足す

**メリット**: 文字列や role に依存しない。
**デメリット**: 現状ゼロの属性を新規導入することになり、2 系統のセレクタが並立する。testid は a11y を改善しない。

### 論点 3: CI 容量（+57 テスト ≈ +170s をどう収めるか）

#### 案 3-A: `workers` を 1 → 2 にする

`workers: 1` は foundation PR #532 の既定値で再計測されていない。コードを読むかぎり cross-worker の共有状態は無い
（OPFS は browser context ごとに隔離、`anthropic` fixture は page 単位の `page.route`、
`test.use({ colorScheme })` はファイル単位、at-0050 は `serial` で 1 worker に固定、`vite preview` は stateless）。
ただし反対側の記録が 1 つある。`at-0050-chat-ui-phase2-byok.spec.ts` のヘッダは「同じ origin で並列に走らせると
OPFS handle で flake した」ので serial にしたと書いている。`workers: 2` では別ファイルが 0050 と並んで OPFS を
seed するので、同じ条件が再現しうる。計測では 0050 の結果と `createWritable` 系のエラーを名指しで見る。

**メリット**: 追加費用なし。wall time が約 6 割になる見込み。
**デメリット**: 4 vCPU で Chromium + Monaco が 2 本並ぶと重い spec（0041 / 0058）が `timeout: 15_000` に
近づく可能性。固定 sleep（`COMPILE_SETTLE_MS` 400ms、`WARNING_SETTLE_MS` 500ms）が負荷で足りなくなる可能性。
→ 先に計測して判定する。

#### 案 3-B: 重い新規 spec を nightly 限定にする

**メリット**: PR gate は現状維持。
**デメリット**: PR で退行を見逃す範囲が広がる。「どれが重いか」の線引きが増える。

#### 案 3-C: 2 job に shard する

**メリット**: wall time が半分。
**デメリット**: runner 課金が倍。`playwright-flaky-summary` と report の集約が要る。paired stub（`e2e-skip.yml`）も
shard 数に合わせて job を増やす必要がある。

### 論点 4: serve mode（`karasu serve` + SSE）

#### 案 4-A: 第 2 の `webServer` + `serve` project を足し、nightly だけ全 project を回す

Playwright は `webServer` 配列の全エントリを `--project` に関係なく起動するので、第 2 server は環境変数で
gate する（例: `E2E_SERVE=1` のときだけ配列に push し、`serve` project も同じ条件で登録する）。nightly だけが
その変数を立てる。gate しないと `packages/cli` の起動失敗が、cli を path filter に含まない `e2e.yml` の全 run を
webServer の readiness で落とし、serve の build と起動が毎 PR の 900s を削る。

**メリット**: CLI と app の結合がどこかで検証される。PR gate の予算と path filter に触れない。
**デメリット**: `packages/cli` の退行は nightly まで見えない。
**却下した代替**: PR gate にも入れる案は、`e2e.yml` の path filter に `packages/cli/**` を足し `e2e-skip.yml` と
同期する必要があり（TPL-1480）、第 2 server の起動が 15 分予算の中に入る。緑が続いてから再検討する。

### 論点 5: AT-0050 AC-11（stale patch の Apply が no-op）

`applyPatch` は `fileContentRef.current` のハッシュを比較する（`useChatSession.ts:442`）。外部から OPFS を
`page.evaluate` で書いても `ObservableFileSystemProvider` を経由しないので `state.fileContent` は変わらない。
AC-11 を書かれたとおり（Editor タブで編集して Chat に戻る）に検証しようとすると、`EditPane.tsx:85` の
unmount で patch 提案が消える。

#### 案 5-C: preview 側の書き込み経路で dirty にする（app 変更なし）

preview column は Chat タブが active でも mount されたままで、edge の方向を右クリックで選ぶと、`.krs` に
`@import` が無い場合は `useEdgeDirectionWriter` が `handleEditorChange(updated)` を呼んで `.krs` 本文を書き換える
（`useEdgeDirectionWriter.ts:56-58`、`AppShell.tsx:234` で配線）。これは `state.fileContent` を更新するので
`fileContentRef` も変わり、Apply は hash 不一致で no-op になる。spec は「patch 提案を出す → preview で edge の
方向を選ぶ（`@import` 無しの seed）→ Apply → 提案が残り `anthropic.requests` が増えず OPFS の `.krs` が
`@import` 行以外変わらない」を assert する。AT-0050 AC-11 の dirty 手段を「Editor で編集」から「preview 経由の
書き込み」に書き換える。

**メリット**: app に触らない。AC の観測面（Apply が UI 上で何もしない）がそのまま検証される。
**デメリット**: AC-11 の手順文を変える。edge 方向の書き込みが将来 `.krs` を触らなくなれば経路を選び直す。

#### 案 5-A: `<ChatPane>` を一度開いたら mount したまま `hidden` で切替える（app 変更）

**メリット**: AC-11 が元の手順どおりに検証できる。タブ切替でチャットが消える現行挙動も直る。
**デメリット**: app の挙動変更。mount したままの `ChatPane` が持つ購読の後始末を確認する必要がある。
AC-11 のためには不要（5-C で足りる）。UX 改善として別 Issue に切る候補。

#### 案 5-B: AC-11 は unit（`useChatSession` の hash 不一致）で代替と AT に明記し、`test.skip` を外す

**メリット**: app に触らない。
**デメリット**: 「Apply が UI 上で何も起こさない」という AC の観測面は検証されないまま残る。

### 論点 6: 再発防止

#### 案 6-A: `scripts/lint/` 配下の `e2e-command-coverage` を足す

`scripts/lint/app-shortcut-docs-sync.ts` の `keybinding` 抽出（`KEYBINDING_RE` は `keybinding[:=]"…"` を見る）を
再利用し、command id も同じ形 `id[:=]\s*"…"` で集める。`useCommand({ id: "…" })` のリテラルだけを見ると、定数
（`CommandPalette.tsx:40` の `id: PALETTE_COMMAND_ID`）と JSX prop（`EditArea.tsx:97-110` の
`<SidebarViewCommand id="view.showFiles" />`）を取りこぼす。リテラルで解決できない id は guard を落とす。
spec 側の照合は docs 表示形（`Ctrl/Cmd+Shift+P`）ではなく、chord から導いた Playwright 形
（`mod+shift+p` → `ControlOrMeta+Shift+P`、および `pressChord(page, "Shift+P")` の引数形）か command id が
`packages/e2e/tests/*.spec.ts` のいずれかに現れることとする。spec は `page.keyboard.press` で chord を打ち
aria 状態を assert するので、表示形は自然には現れない。除外は 1 つの `EXEMPT` リストに理由付きで置く。
lefthook（glob `packages/app/src/**` + `packages/e2e/tests/**`）と CI の `Check` で走らせる。

**メリット**: 「操作面を足したのに e2e が無い」を機械で止める。既存 guard と同じ形（TPL-1480、TPL-2446）。
**デメリット**: spec に id が文字列として現れることしか見ない（assert の質は見ない）。

#### 案 6-B: レビュー規約だけで運用する

**デメリット**: 本プログラムが埋める穴がまさにレビューで漏れたものなので、同じ結果になる。

## 比較

| 観点             | 1-A 境界基準       | 1-B 手動全移行     | 2-A role を足す   | 2-B testid | 3-A workers 2   | 3-B nightly 限定   | 3-C shard          |
| ---------------- | ------------------ | ------------------ | ----------------- | ---------- | --------------- | ------------------ | ------------------ |
| 変更量           | 小                 | 大                 | 小（app 1〜4 点） | 中         | 1 行 + 計測     | 小                 | 中（workflow × 2） |
| 既存決定との整合 | ADR-529 と整合     | ADR-529 と衝突     | e2e README と整合 | 新規系統   | ADR-1008 を維持 | 維持               | 維持               |
| 費用             | なし               | なし               | なし              | なし       | なし            | なし               | runner 倍          |
| 退行の検出       | 境界の流れを PR で | 脆い spec が増える | 同左              | 同左       | PR で全件       | nightly まで遅れる | PR で全件          |

## Related TPLs

既存:

- [TPL-976](../test-perspectives/TPL-976-e2e-fixture-controlled-state.md): fixture が状態・環境・後始末を持つ
- [TPL-1171](../test-perspectives/TPL-1171-wait-for-stable-state.md): 要求した状態ではなく到達した安定状態を待ってから assert する
- [TPL-1419](../test-perspectives/TPL-1419-global-shortcut-text-input-inhibition.md): テキスト入力 focus 下でグローバルショートカットを抑止する
- [TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md): a11y 契約は機能テストに現れず、移行で黙って壊れる
- [TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md): トグルは両状態を end to end で検証する
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md): 整合チェックは両側の変更で発火する
- [TPL-1680](../test-perspectives/TPL-1680-at-e2e-spec-linkage-no-drift.md): AT ↔ spec の紐付けは機械 guard が守る
- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md): label-gated / 遅延実行の suite は検証対象を変える PR で merge 前に走る
- [TPL-1842](../test-perspectives/TPL-1842-restore-state-survive-later-reset.md): 復元した URL 状態は後続の seed reset を生き残る
- [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md): gate 側のチェックは列挙ではなく集合全体を走査する
- [TPL-2805](../test-perspectives/TPL-2805-budget-bounds-the-work-it-names.md): 予算は名指しした作業だけを覆う

proactive（本 PR で起こす）:

- [TPL-3039](../test-perspectives/TPL-3039-e2e-coverage-follows-surface-not-history.md): e2e は AT の要求からだけ生えると
  履歴に従い、操作面の追加が e2e 無しで通る。操作面の登録（keybinding / command id）と spec の対応を機械で見る

## 現時点の方針

**1-A、2-A、3-A（計測つき）、4-A、5-C、6-A を採用する。** app の挙動を変えるスライスは無い。

- e2e に入れるかどうかの判定条件は 1 つ、「jsdom が模せない境界を跨ぐか」
- `data-testid` は導入しない。role / label が無い操作面は app に足す（detail panel 2 つに `role="region"` を揃えて）
- `workers: 2` は nightly の `workflow_dispatch` に `inputs.workers` を足して 3 回計測し、
  全 pass・p95 ≤ 5s（`timeout: 15_000` の 1/3）・最長 spec ≤ 60s・at-0050 と OPFS handle のエラーがゼロ、を
  満たしたときだけ `playwright.config.ts` に反映する。満たさなければ `workers: 1` のまま進める
  （+57 テストでも 730s / 900s に収まる）
- AC-11 は preview 経由の書き込み（5-C）で dirty にし、AT の手順文を書き換える。`<ChatPane>` を mount したままにする
  案（5-A）は UX 改善として別 Issue の候補に留める
- serve mode は環境変数で gate した第 2 `webServer` + `serve` project。nightly だけが変数を立てる。
  PR gate 昇格は 7 日 green 後に #3039 で判断する
- 番号なし AT（`karasu-nest-inline-share` 等）の spec 名は各ファイルの 関連 Issue 番号（1783 / 1801 / 1827 / 1958）
- 削るテストは無い。重複ヘルパは fixtures に寄せる

### スライス（実装ステップ）

到達点の一覧は親 Issue [#3039](https://github.com/kompiro/karasu/issues/3039) の `## Slice status` にある。
ここには切り方の根拠だけを書く。

| スライス                                                                                                         | 前提                  | 独立に出荷できる理由                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **PR-A** 基盤整備（[#3040](https://github.com/kompiro/karasu/issues/3040)）                                      | —                     | test-infra だけで AT ファイルを触らない。nightly input・CI trigger・README・fixture 統合はどれも assertion を変えない |
| **PR-B** `workers: 2`（[#3041](https://github.com/kompiro/karasu/issues/3041)）                                  | PR-A（nightly input） | 計測結果でどちらに転んでもスライス S1〜S8 は進められる。容量を先に決めるのは「追加分が予算内か」を後で問われないため  |
| **S1** ショートカット + パレット（[#3042](https://github.com/kompiro/karasu/issues/3042)）                       | PR-A                  | app 変更ゼロで AC 密度が最も高い。`fixtures/keyboard.ts` と command-coverage guard を S7 が再利用する                 |
| **S2** Share + permalink（[#3043](https://github.com/kompiro/karasu/issues/3043)）                               | PR-A                  | app 変更ゼロ。手動 M-* 項目を 5 件退役。番号なし AT の命名をここで確定                                                |
| **S3** hash/history + CRUD（[#3044](https://github.com/kompiro/karasu/issues/3044)）                             | PR-A                  | 最古の放置項目（0046 AC5）を既存 fixture だけで閉じる                                                                 |
| **S4** preview toolbar + edges（[#3045](https://github.com/kompiro/karasu/issues/3045)）                         | PR-A                  | app 変更 1 点（detail panel 2 つの `role="region"`）と OPFS 本文の assertion を 1 PR にまとめる                       |
| **S5** project / file lifecycle（[#3046](https://github.com/kompiro/karasu/issues/3046)）                        | PR-A                  | 既存 2 spec の拡張のみ。`download.ts` の小ヘルパで閉じる                                                              |
| **S6** スナップショット（[#3047](https://github.com/kompiro/karasu/issues/3047)）                                | PR-A                  | `page.clock` という新技法を単独 PR に隔離してレビューする                                                             |
| **S7** Translate / Tidy・Format / Warning / ja / AC-11（[#3048](https://github.com/kompiro/karasu/issues/3048)） | S1                    | 面が最も広く、AT-0050 の手順文を書き換える（AC-11 を 5-C に）ので最後寄りに置く                                       |
| **S8** serve mode（[#3049](https://github.com/kompiro/karasu/issues/3049)）                                      | PR-A                  | config に環境変数で gate した第 2 `webServer` を足すので最後。gate により PR gate に影響しない                        |

各スライスは互いに素な `docs/acceptance/*.md` 集合を持つので、PR はどの順でも merge できる（#1997 と同じ切り方）。

### 実装の指針

1. PR-A: `e2e-nightly.yml` に `workflow_dispatch.inputs.workers`（default `1`）。`notify` は計測 run
   （`inputs.workers` が既定値でないとき）だけ skip し、手動 re-run が tracker Issue を閉じる経路は残す。
   `concurrency.group` は `workflow_dispatch` のとき `github.run_id` を使う（現状の `${{ github.ref }}` +
   `cancel-in-progress: true` では連続 dispatch が前の run を cancel し、21:00 UTC の cron も計測 run を cancel する）。
   `at-check-coverage.yml` の `paths` に `packages/e2e/tests/**`、README の CI 節更新、
   `fixtures/{drill,color,org}.ts` 新設と spec 側の置換、`fixtures/README.md` 追記
2. PR-B: `gh workflow run e2e-nightly.yml -f workers=2` × 3（前の run の完了を待ってから次を dispatch する）。
   per-spec wall time と p95 は、同じ `results.json` を既に読んでいる `scripts/ci/playwright-flaky-summary.ts` に
   足して step summary に出す（第 2 の parser を作らない）。判定と数値を本 doc に転記し、採用なら
   `playwright.config.ts` の `workers` を `process.env.CI ? 2 : undefined` にして run URL をコメントに残す
3. S1〜S8: 各 Issue 本文の spec 一覧・ケース・fixture・app 変更に従う。spec 名は `at-<AT番号>-<slug>.spec.ts`。
   各 PR で `docs/acceptance/*.md` に `✅ Automated` マーカーを付け、手動に残す項目は未チェックのまま理由を書く
4. 各 PR の検証: 対象 spec の `playwright test`、`pnpm at:check-coverage --strict`、`pnpm run lint:e2e-page-goto`、
   `pnpm -r run typecheck`、S1 以降は `pnpm run lint:e2e-command-coverage`
5. ADR 昇格: 全 sub-issue close 後、`docs/adr/3039-app-e2e-coverage-program.md` として昇格し、本 doc は同 PR で削除する。
   PR-B の計測値を ADR に残す。S1 で guard が入ったら TPL-3039 の「関連テスト」をディレクトリから実ファイルの path に直す

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: app の挙動は変わらない。`NodeDetailPanel` / `EdgeDetailPanel` が `role="region"` と
  名前を持ち、支援技術にランドマークとして読まれるようになる
- ドキュメント更新: `packages/e2e/README.md`、`packages/e2e/fixtures/README.md`、`docs/acceptance/`（マーカー）
- テスト・examples への影響: 既存 spec は fixture 統合で import 先が変わるだけ。examples は触らない

## 未解決の問い / 決めないこと

- `<ChatPane>` をタブ切替で保持する UX 改善（5-A）を別 Issue にするかは本 doc では決めない
- S8 を PR gate に昇格させるかは 7 日 green 後に #3039 で決める。本 doc では決めない
- `at:check-coverage` にテスト名の実在確認を足すかは別 Issue（#1997 で既知の盲点）。本 doc では決めない
