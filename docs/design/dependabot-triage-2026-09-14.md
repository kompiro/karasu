# Dependabot トリアージ 2026-09-14

- **日付**: 2026-09-14
- **ステータス**: 検討中
- **関連**:
  - 下ごしらえ Issue: [#2834](https://github.com/kompiro/karasu/issues/2834)（`[dep-triage]` weekly workflow の所見）
  - 対象 Dependabot PR: [#2824](https://github.com/kompiro/karasu/pull/2824) / [#2825](https://github.com/kompiro/karasu/pull/2825) / [#2826](https://github.com/kompiro/karasu/pull/2826) / [#2827](https://github.com/kompiro/karasu/pull/2827) / [#2828](https://github.com/kompiro/karasu/pull/2828) / [#2829](https://github.com/kompiro/karasu/pull/2829) / [#2830](https://github.com/kompiro/karasu/pull/2830) / [#2831](https://github.com/kompiro/karasu/pull/2831) / [#2832](https://github.com/kompiro/karasu/pull/2832) / [#2833](https://github.com/kompiro/karasu/pull/2833)
  - vitest の peer ペアと assumption: [ADR-2447](../adr/2447-dependabot-triage-2026-08-10.md)
  - assumption は major で止める: [ADR-2628](../adr/2628-adr-assumption-version-policy.md)
  - assumptions だけを差し替え PR で更新した前例: [ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md)
  - ADR 本文は不変、frontmatter は更新可: [ADR-2687](../adr/2687-adr-body-is-immutable.md)
  - 直前の triage: [ADR-2773](../adr/2773-dependabot-triage-2026-09-08.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-09-14（月）の weekly バッチ。npm 8 件と github-actions 2 件の計 10 件。
`security` ラベルはゼロ、`dependabot/alerts` の open も 0 件で、純粋な version update バッチである。

週次 workflow の所見（#2834 と各 PR コメント）を起点に、`.claude/rules/dependabot.md` に従って
所見を検証する側に時間を使った。所見が「未確認」としていた点（中間リリースの中身、
DefinitelyTyped の出所、vitest 5 の互換性）はすべて本 Doc で埋めた。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `oxlint` 1.82.0（2026-09-07 14:59 公開、PR 起票まで 7 日 7 時間）
- publisher: npm 7 パッケージは GitHub Actions の OIDC trusted publishing で provenance 付き、
  `@types/*` は従来どおり `types <ts-npm-types@microsoft.com>`。from 版と to 版で publisher の変化なし
- lifecycle script（`preinstall` / `install` / `postinstall` / `prepare`）: 新規追加ゼロ
- 既知 advisory: GitHub Advisory Database で to 版と、新たに解決される transitive 版を照会し、該当ゼロ
- github-actions 2 件: PR が pin した SHA が upstream タグの commit と一致

一方で CI が red の PR が 2 件あった。どちらも bump 自体が原因ではない。#2826 は
断続的な E2E 失敗で、再実行で green になった。#2827 は repo 側の ADR assumption が
major bump を捕まえたもので、差し替え PR が要る。

## 一覧

| PR | 依存 | from → to | 種別 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- |
| [#2824](https://github.com/kompiro/karasu/pull/2824) | `pnpm/action-setup` | v6.0.10 → v6.1.0 | minor | green | low | 採用（そのままマージ） |
| [#2825](https://github.com/kompiro/karasu/pull/2825) | `actions/deploy-pages` | v5.0.0 → v5.0.1 | patch | green | low | 採用（そのままマージ） |
| [#2831](https://github.com/kompiro/karasu/pull/2831) | `@types/node` | 26.4.0 → 26.5.0 | minor | green | low | 採用（そのままマージ） |
| [#2826](https://github.com/kompiro/karasu/pull/2826) | `@types/react-dom`（react group） | 19.2.5 → 19.2.7 | patch | green（Playwright は再実行で green） | low | 採用（そのままマージ） |
| [#2829](https://github.com/kompiro/karasu/pull/2829) | `lucide-react` | 1.38.0 → 1.42.0 | minor ×4 | green | low | 採用（そのままマージ） |
| [#2830](https://github.com/kompiro/karasu/pull/2830) | `@anthropic-ai/sdk` | 0.122.0 → 0.124.0 | minor ×2 | green | low | 採用（そのままマージ） |
| [#2832](https://github.com/kompiro/karasu/pull/2832) | `oxlint` | 1.80.0 → 1.82.0 | minor ×2 | green | low | 採用（そのままマージ） |
| [#2833](https://github.com/kompiro/karasu/pull/2833) | `@playwright/test` | 1.62.1 → 1.63.0 | minor | green | low | 採用（そのままマージ） |
| [#2828](https://github.com/kompiro/karasu/pull/2828) | `astro` | 7.2.10 → 7.3.1 | minor | green | low | 採用（そのままマージ） |
| [#2827](https://github.com/kompiro/karasu/pull/2827) | `vitest` + `@vitest/coverage-v8`（vitest group） | 4.1.11 → 5.0.0 | **major** | Check red | medium | 採用（**差し替え PR**、bot PR は close） |

却下はゼロの見込み。`@dependabot ignore` は設定しない。

## PR ごとの分析

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として base（`4b1ae792`）と
PR ヘッドで突き合わせた（`security-alert` skill の edges 手順）。「新規パッケージ名」は
lock の `packages:` に base で存在しなかった名前を指す。

`pnpm-workspace.yaml` の `overrides:`（23 件）に今回動く解決が掛かるのは `undici: ^7.28.0`
の 1 件だけで、#2828 の解決版 7.29.1 は floor を満たす。他の override 対象は動かない。

### #2824 `pnpm/action-setup` v6.0.10 → v6.1.0

- リリース: `zkochan`（pnpm メンテナ）が 2026-09-05 に公開。変更は PR #288「support pnpm v12」の 1 commit
- 差分: `src/install-pnpm/run.ts` で、対象が pnpm 12 のときだけ native 実行ファイルの bootstrap
  lock を使う分岐を追加。pnpm 11 以前（本 repo は pnpm 11.20.0）の経路は `standalone` 判定を
  分岐の内側に移しただけで挙動は同じ。`@pnpm/exe` の bootstrap に `allowScripts` を明示する変更も入る
- SHA: annotated tag `v6.1.0` の参照先 commit `ea17c68d` と、PR が 19 workflow に書いた SHA が一致
- 判定: low / 採用

### #2825 `actions/deploy-pages` v5.0.0 → v5.0.1

- リリース: 2026-09-01。deployment polling に backoff と jitter を追加（#444）と test 追加のみ
- 差分: 5 commit、`src/internal/deployment.js` と `dist/` の再生成と test
- SHA: tag `v5.0.1` の commit `368f8252` と一致。対象は `.github/workflows/pages.yml` の 1 箇所
- 判定: low / 採用

### #2831 `@types/node` 26.4.0 → 26.5.0

- publisher は `types`（DefinitelyTyped の公開 bot）で from / to とも同じ。型のみで実行時コードなし
- 依存: `undici-types` ~8.3.0 → ~8.9.0（既存パッケージの版上げ、型のみ）
- エッジ差分は `@types/node` の参照先の付け替えのみ。`@types/sax` が 26.3.0 から 26.4.0 に畳まれ、
  `@types/node@26.3.0` が lock から消える（重複が減る方向）
- 所見は「DefinitelyTyped は tagged release が無く出所を確かめきれない」としていたが、
  publisher の同一性と lifecycle script 不在で供給側の判断には足りる
- 判定: low / 採用。9 manifest に触れるので、lock の衝突を減らすため npm の中で最初にマージする

### #2826 `@types/react-dom` 19.2.5 → 19.2.7（react group）

- publisher は `types` で変化なし。依存なし。エッジ差分は radix-ui 15 パッケージの peer 参照の付け替えのみ
- group の他メンバー（`react` / `react-dom` / `@types/react`）は新版なし。peer の片割れだけ動く形ではない
- **Playwright red の原因は bump ではない**と判断した。落ちたのは
  `at-0014-memory-project-mode-unification.spec.ts:162`（deploy container クリックで realizes
  先がハイライトされる、`karasu-highlighted` が 0 件）の 1 件で、174 件は通過。根拠は 3 つ:
  1. `@types/react-dom` は型定義だけで、ビルド出力にも実行時にも現れない
  2. 同じ base `4b1ae792` の E2E nightly（2026-09-14 21:15）は success
  3. 同じ base の他の npm PR 6 件は Playwright が green
- 失敗ジョブだけを再実行し、green になった（run 34900546523 attempt 2、7m35s）。コードを変えずに
  通ったので断続的な失敗である。同じ箇所が他の PR でも繰り返し落ちるようなら、bump とは
  独立した AT-0014 の安定性の問題として Issue に切り出す
- 判定: low / 採用

### #2829 `lucide-react` 1.38.0 → 1.42.0

- 中間の 1.39.0〜1.41.0 もリリースノートを確認した。4 版ともアイコンの追加とメタデータ修正で、
  削除は無い。1.42.0 で swiss franc 系アイコンが deprecated になったが、`packages/*/src` に使用箇所なし
- 依存なし。エッジ差分は `lucide-react` 自身の 1 行のみ
- 判定: low / 採用

### #2830 `@anthropic-ai/sdk` 0.122.0 → 0.124.0

- 0.123.0 / 0.124.0 とも Stainless 生成のリリース。API 型の追加（user profiles、compliance settings、
  usage report の内訳、workspace ID）と、非 Node バンドルから credential file アクセスを外す修正、
  agent-toolset のファイル作成を owner-only にする修正
- 依存（`json-schema-to-ts` / `standardwebhooks`）は宣言も解決も不変
- 判定: low / 採用

### #2832 `oxlint` 1.80.0 → 1.82.0

- 所見が未確認としていた中間の 1.81.0 も確認した。規則の false positive 修正と suggestion 化が中心
- 1.82.0 の BREAKING 2 件は Rust の parser crate API（`panicked` → `fatal_error` の改名、`MAX_LEN` 縮小）で、
  CLI の利用には影響しない
- CI の Lint（`oxlint --deny-warnings`）は通過。新規則が既定で有効になって指摘が出る形
  （[ADR-2773](../adr/2773-dependabot-triage-2026-09-08.md) の #2769）には当たっていない
- 依存は platform binding 19 件の版上げのみ。新規パッケージ名なし
- 判定: low / 採用

### #2833 `@playwright/test` 1.62.1 → 1.63.0

- 1.63.0 は test locks、`frameLocator()` のフレーム横断、`locator.visible()` などの機能追加。
  リリースノートに Breaking の節は無い
- `playwright` から optional の `fsevents@2.3.2` の辺が消える（macOS 専用、削除方向）
- CI の Playwright と ExTester はいずれも green
- 判定: low / 採用

### #2828 `astro` 7.2.10 → 7.3.1

- 7.3.0: `astro preview --ignore-lock`、image service / cache provider への `logger` 引数追加など機能追加のみ。
  7.3.1: `astro:assets` 利用時に起動・ビルドできない不具合の修正
- 宣言依存の変化は `zod` の floor（^4.3.6 → ^4.5.4）だけ。解決は既に 4.5.4
- エッジ差分で動くのは既存パッケージの版上げ 4 件で、新規パッケージ名なし:
  `@clack/prompts` 1.7.0 → 1.8.0、`@clack/core` 1.4.3 → 1.5.0、`tinyexec` 1.3.0 → 1.3.1、
  `undici` 7.29.0 → 7.29.1（`unifont` 経由のみ）
- `undici` は `cheerio` / `jsdom` が 7.29.0 のまま残るので 2 版に分かれる。どちらも override の floor
  `^7.28.0` を満たし advisory 該当なし。`undici@7.29.1` は OIDC publish、2026-09-04 公開
- 判定: low / 採用

### #2827 `vitest` + `@vitest/coverage-v8` 4.1.11 → 5.0.0（vitest group）

**判定: medium / 採用。反映は差し替え PR（bot PR は close）。**

#### CI red の原因は repo 側の assumption

`Check` job は 1 行で落ちている。

```
✗ ADR-2447 :: grep: package.json :: "vitest": "\^4\. — pattern not found in package.json
Checked 944 assumption(s): 935 OK, 1 failing, 8 manual-review.
```

これは [ADR-2628](../adr/2628-adr-assumption-version-policy.md) が意図した失敗である。assumption を
major で止めたのは「major が変わったら、その ADR の決定がまだ成り立つかを人が見る」ためで、
今回がその場面にあたる。

ADR-2447 の決定は「peer が exact pin の `vitest` と `@vitest/coverage-v8` を同時に動かし、
9 manifest の版を揃える」ことで、**v5 でもそのまま成り立つ**。
`@vitest/coverage-v8@5.0.0` の peer は `vitest: "5.0.0"`（exact）で、#2827 は group PR として
両方を 9 manifest で揃えて動かしている。したがって assumption を `\^5\.` に更新すればよい。
本文ではなく frontmatter の更新なので [ADR-2687](../adr/2687-adr-body-is-immutable.md) に反しない
（[ADR-2623](../adr/2623-dependabot-triage-2026-08-25.md) が同じ ADR-2447 に対して行った更新と同形）。

Dependabot は `docs/adr/` を書き換えないので、bot PR のままでは green にできない。bot ブランチに
コミットを足すと recreate で失われる。**bump と assumption 更新を 1 コミットにした差し替え PR**
で入れる。

#### CI は Test まで到達していなかったので、ローカルで確かめた

`ci.yml` の `Check` job は assumption チェックの後に Typecheck / Test / Build を実行する。
所見は「CI 結果が決め手」としていたが、**#2827 の CI はその手前で止まっており、vitest 5 で
テストは一度も走っていない。** bot ブランチ（`9e338bdd`）を別 worktree に取り、CI と同じ順で実行した。

| ステップ | 結果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm run typecheck`（全パッケージ） | OK |
| `pnpm --filter @karasu-tools/core run build` | OK |
| `pnpm run test:coverage` | 全 7 スイート通過 |
| `packages/lsp` の `vitest run`（`test:coverage` 対象外） | 6 files / 69 tests 通過 |
| `packages/vscode` の `vitest run`（`test:coverage` 対象外） | 7 files / 68 tests 通過（`@karasu-tools/i18n` のビルドが前提。vitest とは無関係） |

**テストが黙って消えていない**ことも確かめた。`test:coverage` の各スイートのテストファイル数は
main の CI（run 34909802366）と一致した（core 157 / i18n 5 / app 112 / cli 35 / nest 22 /
docs-site 5）。scripts は 40 で main の 41 より 1 少ないが、main 側が PR の base より新しく
テストが 1 本増えているためである。v5 の「祖先ディレクトリの config を探さない」変更は、
各パッケージが自前の `vitest.config.ts` を持つ本 repo には効かない。

v5 のその他の breaking change のうち本 repo に関わりうるもの（mock の既定 clear、await されない
非同期 assertion の失敗化、hoist 対象がトップレベル外にあると throw、inline projects の root
config 継承、Node 22 / Vite 6.4 必須）は、上記の全件通過で実害なしと判断した。
Node は 24（[ADR-2397](../adr/2397-node-24-baseline.md)）、Vite は 8.2.2 で要件を満たす。

#### 依存ツリーの変化が大きい

リスクを medium としたのは bump 種別ではなくこの点による。v5 は `@vitest/expect` / `runner` /
`snapshot` / `utils` / `pretty-format` を本体に取り込み、lock から 16 パッケージが消えて 11 が入る。

入る版のうち**新規パッケージ名は 2 件**で、どちらも `@vitest/coverage-v8` が istanbul 系を
置き換えたもの（リリースノート「Switch to `@vitest/istanbuljs` packages」#11053）。

| パッケージ | 出所 | 初回公開 | 使う版の公開 | publisher |
| --- | --- | --- | --- | --- |
| `@vitest/istanbul-lib-coverage` | `vitest-dev/istanbuljs`（vitest-dev org、2026-08-23 作成、fork ではない） | 2026-08-24 | 1.0.1: 2026-08-31 | GitHub Actions OIDC |
| `@vitest/istanbul-lib-report` | 同上 | 2026-08-24 | 1.0.1: 2026-08-31 | GitHub Actions OIDC |

`@vitest` scope は vitest-dev の管理下にあり、typosquat の形ではない。新しい repo・新しい名前で
あることは事実なので、ここは「確認して受け入れる」判断になる。lifecycle script はどちらも
`build` / `test` だけで、install 時に走るものは無い。

その他の入る版は既存パッケージの版上げで、`tinybench` 2.9.0 → 6.1.4（v5 が exact pin、
benchmark API の書き直しに伴う）、`std-env` / `expect-type` / `tinyrainbow` /
`ast-v8-to-istanbul` の patch / minor、`@vitest/mocker` / `spy` の 5.0.0。

vitest の publish は 4.1.11 と 5.0.0 のどちらも trusted publishing で、approver も同じアカウント
（`oreanno`）。今回の bump で配布主体は変わっていない。

## 現時点の方針

採否はユーザーのレビューで確定する。推奨は次のとおり。

1. **9 件を bot PR のままマージする。** lock の衝突で rebase が要るので 1 件ずつ進める。
   順序は lock に触れない github-actions 2 件（#2824 / #2825）、次に manifest を広く触る
   #2831、残りの npm。
2. **#2827 は close し、差し替え PR で入れる。** 最新 main 上で vitest group の bump を
   やり直し、同じコミットで ADR-2447 の `assumptions:` を `"vitest": "\^4\."` → `"vitest": "\^5\."`
   に更新する。`pnpm adr:check-assumptions` とテスト全件を CI で通す。9 件のマージ後に作ると
   lock の rebase が 1 回で済む。
3. 判定が「採用」なので、#2827 にも `@dependabot ignore` は設定しない。

## 未解決の問い

- `undici` が 7.29.0 / 7.29.1 に分かれる件を放置してよいか。実害は無く、次に `jsdom` / `cheerio` が
  動いたときに畳まれる見込みなので、本 Doc は放置を推奨する。
