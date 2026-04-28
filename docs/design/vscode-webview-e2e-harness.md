# VS Code WebView 向け E2E テストハーネス

- **日付**: 2026-04-28
- **ステータス**: 検討中
- **関連**:
  - Issue [#928](https://github.com/kompiro/karasu/issues/928) — WebView E2E harness トラッカー
  - 親 Issue [#597](https://github.com/kompiro/karasu/issues/597) — remaining E2E candidates after #534 rollout
  - ADR-20260428-03 — VS Code 拡張ホスト向け smoke test harness（既存の `packages/vscode-e2e`）
  - ADR-20260428-05 — VS Code WebView の DOM 系テストはマニュアル運用とする（本 Doc が前提とする「仮置き」決定）
  - 影響 AT: AT-0037-9 / AT-0038 / AT-0039 / AT-0042-vscode

## 背景・課題

ADR-20260428-03 で導入した `packages/vscode-e2e` は **拡張ホスト**（Electron メインプロセス）で Mocha スイートを回すため、`vscode` API には届くが、karasu のプレビュー UI を載せている **WebView**（`packages/vscode/src/preview-panel.ts` の `<iframe>`）の DOM・クリックハンドラ・スタイルには到達できない。

その結果、以下の AT は手動運用となっている（ADR-20260428-05 で当面マニュアルに固定）:

- **AT-0037-9** — エディタ ↔ SVG プレビュー間の双方向ジャンプ（クリック側）
- **AT-0038（全 TC）** — Cmd/Ctrl+Click ヒントテキストの表示と modifier クリック挙動
- **AT-0039（全 TC）** — 詳細パネルの表示 / リンク / Jump to editor ボタン
- **AT-0042-vscode（全 TC）** — クロス図ナビゲーション（team → Org / service → Deploy）

ADR-20260428-05 の **却下した代替**節は具体的な runner 案を 1 行で挙げているだけで、検証が無い。本 Doc では runner 候補を実機材で評価し、どれを採るか・採らないか・どの程度のメンテナンスコストになるかを記録する。

## ゴール

1. WebView の DOM・クリック・postMessage 経路を駆動できる E2E テストハーネスを `packages/vscode-e2e` に追加するか、独立パッケージとして併設する。
2. AT-0037-9 / 0038 / 0039 / 0042-vscode の 4 セットのうち、**最低 1 件**を手動から自動化に切り替えてランナー選定の妥当性を確認する。
3. ADR-20260428-05 を後継 ADR で superseded し、新しい運用ポリシー（自動化 vs 手動運用の境界線）を残す。
4. CI 実行は label gating（既存の `e2e` ラベル相当）でオプトイン制とし、PR 必須チェックには昇格させない。

## 非ゴール

- LSP 系 AT（補完・F12・ホバー・診断・Outline）の追加自動化 — 既存 harness で十分。
- `@karasu-tools/app` 側（`packages/e2e` の Playwright）への統合 — それは別パッケージで独立に駆動している。
- karasu の WebView を「web ホスト」で動かす方向性（`@vscode/test-web` 系）— 拡張側のリファクタが大きく、別 Issue 化候補。

## 制約・前提

- 拡張は VS Code Desktop（Electron）でしか動かしていない。WebView も Desktop 経由で読み込まれる前提。
- VS Code WebView は **2 つの隔離境界**を持つ:
  1. WebView 自体は `<iframe>` で sandbox される。
  2. その中で karasu の SPA が `acquireVsCodeApi()` 経由でしか拡張ホストと通信できない。
- CI は GitHub Actions の Linux runner。Electron + GUI が必要なため、現行の `xvfb-run` 起動方式（`vscode-e2e.yml`）に乗せる。
- 拡張本体のコードに「テスト用 export / シーム」を増やす方向は ADR-20260428-05 で却下済（メンテナンス債務になる）。

## 候補ランナー — 評価サマリー

| Runner                                               | カバー範囲                                                      | 主な利点                                                                                | 主な欠点                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **A. `vscode-extension-tester` (ExTester)**          | 拡張ホスト + WebView（iframe DOM へ to-the-frame で WebDriver） | WebView に正面から WebDriver で当てられる API 群が揃う。Selenium ベースで枯れている。   | ランナー自体が大きい（Selenium / chromedriver 同梱）。テスト記述スタイルが Mocha + Selenium で既存と二重化。   |
| **B. Playwright + `@vscode/test-electron` + CDP**    | 拡張ホスト + WebView（CDP で iframe attach）                    | Playwright は `packages/e2e` で既に採用済 → 学習コスト最小。selector / locator が強力。 | iframe の attach 経路が公式手順から外れる（「stable な vscode 起動時の DevTools port 取得」が要工夫）。        |
| **C. `@vscode/test-web`**                            | Web 上の VS Code（拡張も Web ビルド）                           | ブラウザ上で動くため Playwright 直挿しで楽。fakeFS など色々ある。                       | karasu 拡張は Node のみを想定しており、Web 互換ビルドが現状無い（`vscode-fs-provider.ts` 等の見直しが必要）。 |
| **D. 拡張ホスト側スタブ（current）**                  | 拡張ホスト＋WebView の境界手前まで                              | 0 円。新規 infra 不要。                                                                 | WebView クリックや DOM 表示は検証不能 — ADR-20260428-05 でこれは却下済。                                       |

詳細評価は次節。

### A. `vscode-extension-tester` (ExTester)

- 公式の WebView ヘルパーがある（`extester` の `WebView` クラス）。`switchToFrame` で iframe に降りて Selenium WebDriver で操作する。
- 既存 `packages/vscode-e2e` とは別ランナーになる：`@vscode/test-cli` と `extester` の両立が必要。テンプレが二重化する分のメンテ負荷は中程度。
- インストール容量が大きい（chromedriver + Selenium）。CI のキャッシュは可能。
- API はやや古い形式（Selenium WebDriver 直）。Playwright 派の開発者には書きづらい。
- メンテ：ExTester リポジトリは現在も活動中。VS Code 各バージョンへの追従もある。

### B. Playwright + `@vscode/test-electron` + CDP attach

- `@vscode/test-electron` で VS Code を起動 → Electron の Chromium DevTools Protocol port を取得 → Playwright の `chromium.connectOverCDP()` で attach → ページツリーから WebView iframe を選んで操作する。
- 公開 API ではないため、**起動シーケンスを自前で組む**必要がある（`vscode --inspect=<port>` 相当の起動オプション、もしくは `--remote-debugging-port` を渡す方式）。
- 一旦 attach できれば Playwright の locator / auto-waiting / trace viewer がそのまま使える。`packages/e2e` の知識がそのまま流用できる。
- **不確実性**：将来の VS Code stable で `--remote-debugging-port` の取り扱いが変わると壊れる。upstream issue も時々ある。
- メンテ：Microsoft 公式手順から外れているので、互換維持は完全に自前。Electron バージョン更新時に追跡コストが発生する。

### C. `@vscode/test-web`

- 拡張を Web 上の VS Code（`vscode.dev` のような）で動かして Playwright で操作する。
- karasu 拡張は `vscode-fs-provider.ts` で Node の `fs` を前提にしている箇所がある。`@vscode/test-web` で動かすには **拡張側を Web 互換にビルドし直す**必要があり、それ単体で 1 PR 規模。
- WebView ↔ Web ホスト VS Code との通信は本物より制約が多く、AT 4 件の挙動が同一かを別途検証する必要がある。
- メンテ：拡張の Web 化は Microsoft も推奨方向だが、本リポジトリの拡張は Desktop 専用設計のため、本 Doc 内で採るのは飛ばしすぎ。

### D. 現状（拡張ホスト側スタブ + マニュアル QA）

- ADR-20260428-05 で記録済み。AT 4 件は手動 5 分で全 TC を確認可能。回帰検出はリリース QA で吸収。
- **WebView 改修が増えてきた時点でゼロ案として捨てる**。本 Doc が想定する「いま開く意味がある」状態に達したかが評価ポイント。

## 評価軸

| 軸                            | 重み | コメント                                                                                |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------- |
| 既存 stack との学習一致度     | 高   | `packages/e2e` が Playwright。チーム内で記述スタイルが揃うほど維持が楽。                |
| WebView API の安定性           | 高   | 公式ルートを外れるほど将来コストが膨らむ。                                              |
| 初回導入コスト                | 中   | 1 PR で landable か、複数 PR に分割か。                                                 |
| CI コスト（時間 / 資源）      | 中   | label gating で吸収できる範囲か。                                                       |
| 1 件目の AT 移植容易さ        | 中   | AT-0039 詳細パネルあたりが題材として適切（DOM/click/postMessage を一通り使う）。        |

## 推奨

**Option A（vscode-extension-tester）を第一候補**として PoC を 1 PR で先行させ、AT-0039（詳細パネル）を題材に手動 → 自動化に置き換える。

理由:

1. WebView 駆動が **公式に支援されている経路**。CDP 直叩き（B）は現状 Microsoft / Playwright 双方の公開手順を外れるため、長期メンテで毎回コストを払いがち。
2. 既存 `packages/vscode-e2e` と「**runner が違うが配置場所は同じ**」にできる。`@vscode/test-cli`（smoke）と ExTester（WebView E2E）を `packages/vscode-e2e` 配下の独立 entry point に並べる。
3. Playwright を入れたい欲求はあるが、それは `packages/e2e` で十分満たせている。WebView 用に二度目を持ち込む費用に見合わない。
4. C は拡張本体のリファクタが要件化するため別 Issue 化。

**フォールバック**: PoC 中に ExTester で VS Code 最新 stable がしばらく動かない、もしくは `--inspect` ベースで Playwright が安定して当てられる確証が立った場合は B に切り替える。判断は PoC PR のレビュー時に行う。

## 段階計画

| Phase | 内容                                                                                                                                                                                                  | 規模目安       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1     | `packages/vscode-e2e` に ExTester を加え、`tests/webview/` ディレクトリを作る。最小 PoC として AT-0039-1（詳細パネルが service クリックで開く）を 1 ケース移植する。CI は `e2e` ラベル下で実行。       | 400–700 行     |
| 2     | AT-0039 残り TC・AT-0038（modifier ヒント）を移植。`docs/acceptance/` に `Coverage policy: automated`（or partial）を更新。                                                                            | 300–500 行     |
| 3     | AT-0037-9 / AT-0042-vscode を移植して 4 セット完走。ADR-20260428-05 を superseded する後継 ADR を起こし、自動化済みの境界を更新。`packages/vscode-e2e/README.md` に runner マトリクス（smoke vs WebView）を記述。 | 400–600 行     |

各 Phase は独立 PR。Phase 1 が PR レビューで合意されないうちは 2 / 3 に進めない。

## 受け入れ条件（Phase 1 完了時点）

- [ ] `packages/vscode-e2e/tests/webview/` 以下に 1 件以上の ExTester スイートが追加されている
- [ ] CI（`vscode-e2e.yml` または専用 workflow）で `e2e` ラベル付き PR の場合に限り WebView スイートが回り、green / red の判定が行える
- [ ] `docs/acceptance/0039-vscode-phase6-detail-panel.md` の AT-0039-1 が `Coverage policy: manual → automated` に書き換わっている
- [ ] ADR-20260428-05 を superseded する後継 ADR の **下書き**（`docs/design/` に design doc として）が出ている — Phase 3 で正式 ADR 化

## 却下した代替（再掲）

| 案                                                                | 却下理由                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **B. Playwright + CDP attach** を最初から本採用                    | 公式手順を外れる箇所が多く、PoC で詰まったときに `packages/e2e` 側でも累積負債になる懸念がある。     |
| **C. `@vscode/test-web`** を本筋に置く                             | 拡張側の Web 互換ビルドが要件化し、1 PR で完結させづらい。本 Doc の DoD（最小 1 件移植）に到達しない。 |
| **D. 現状維持（マニュアル運用継続）**                              | WebView 連携の AT が 4 セットあり、今後 Phase 6（`user → client → service` 強制レイアウト）等で増える。早めに自動化の素地を作っておく方が ROI が高い。 |
| 拡張本体に「テスト用 export」を増やして拡張ホスト側 Mocha でテストする | ADR-20260428-05 で既に却下。本番コードのシームを増やす割に WebView の挙動を本物として検証できない。 |

## オープン論点

- **CI 実行時間**：ExTester は VS Code 一式 + Selenium のセットアップで初回 5–10 分かかる見込み。`packages/vscode-e2e` のキャッシュ戦略をそのまま流用できるかは Phase 1 で計測する。
- **VS Code stable 自動追従**：現在 `version: "stable"` 固定で smoke を回しており、WebView スイートも同じ取り扱いにする想定。stable のバージョン上げで ExTester 側に互換問題が出た場合、一時的に `version` をピン留めする運用を許容する。
- **テスト fixture 共有**：`packages/vscode-e2e/fixtures/workspace` は smoke 用に最小化されている。WebView 用の AT はもう少し中身のある `.krs` が要るので、`fixtures/webview-workspace` を別途用意するか、smoke と兼用するかは Phase 1 で判断する。

## 関連

- ADR-20260428-03 — 既存の `packages/vscode-e2e`（拡張ホスト smoke）
- ADR-20260428-05 — 本 Doc が前提とする「マニュアル運用」決定。Phase 3 で superseded する
- ADR-20260427-05 — OPFS fixture（同種の testing infra ADR）
- Issue [#928](https://github.com/kompiro/karasu/issues/928) — 本 Doc の親トラッカー
