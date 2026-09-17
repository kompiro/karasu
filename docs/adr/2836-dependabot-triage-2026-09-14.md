---
id: ADR-2836
title: Dependabot トリアージ 2026-09-14：vitest 5 の major は ADR の assumption が捕まえ、差し替え PR で入れる
status: accepted
date: 2026-09-15
topic: build
related_to:
  - ADR-2447
  - ADR-2628
  - ADR-2623
  - ADR-2687
  - ADR-2773
  - ADR-2658
  - ADR-784
scope:
  packages: [app, cli, core, docs-site, i18n, lsp, nest, vscode]
  concerns: [ci, dependencies]
assumptions:
  - "file: docs/adr/2447-dependabot-triage-2026-08-10.md"
  - "file: docs/adr/2628-adr-assumption-version-policy.md"
---

# ADR-2836: Dependabot トリアージ 2026-09-14：vitest 5 の major は ADR の assumption が捕まえ、差し替え PR で入れる

- **日付**: 2026-09-15
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2836](https://github.com/kompiro/karasu/pull/2836)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2824](https://github.com/kompiro/karasu/pull/2824) / [#2825](https://github.com/kompiro/karasu/pull/2825) / [#2826](https://github.com/kompiro/karasu/pull/2826) / [#2827](https://github.com/kompiro/karasu/pull/2827) / [#2828](https://github.com/kompiro/karasu/pull/2828) / [#2829](https://github.com/kompiro/karasu/pull/2829) / [#2830](https://github.com/kompiro/karasu/pull/2830) / [#2831](https://github.com/kompiro/karasu/pull/2831) / [#2832](https://github.com/kompiro/karasu/pull/2832) / [#2833](https://github.com/kompiro/karasu/pull/2833)
  - #2827 の差し替え PR: [#2842](https://github.com/kompiro/karasu/pull/2842)
  - workflow の所見: [#2834](https://github.com/kompiro/karasu/issues/2834)（9/14 cron）/ [#2837](https://github.com/kompiro/karasu/issues/2837)（9/15 dispatch）
  - workflow の評価から派生した Issue: [#2838](https://github.com/kompiro/karasu/issues/2838)（所見の不足）/ [#2839](https://github.com/kompiro/karasu/issues/2839)（schedule 再開の条件）/ [#2786](https://github.com/kompiro/karasu/issues/2786)（threat detection）
  - vitest の peer ペアと assumption: [ADR-2447](2447-dependabot-triage-2026-08-10.md)
  - assumption は major で止める: [ADR-2628](2628-adr-assumption-version-policy.md)
  - assumptions だけを差し替え PR で更新した前例: [ADR-2623](2623-dependabot-triage-2026-08-25.md)
  - 直前の triage: [ADR-2773](2773-dependabot-triage-2026-09-08.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`「Dependabot 運用ルール」

## 背景

2026-09-14（月）の weekly バッチ。npm 8 件と github-actions 2 件の計 10 件で、`security` ラベルは
ゼロ、`dependabot/alerts` の open も 0 件の純粋な version update バッチだった。

週次 workflow の所見（#2834）を起点に、`.claude/rules/dependabot.md` に従って所見を検証する側に
時間を使った。所見が「未確認」とした点（中間リリースの中身、DefinitelyTyped の出所、vitest 5 の
互換性）はすべて埋めた。

**供給側（配布主体・改ざん）の懸念はゼロだった。**

- cooldown 7 日: 全件充足。最も近いのは `oxlint` 1.82.0（2026-09-07 14:59 公開、PR 起票まで 7 日 7 時間）
- publisher: npm 7 パッケージは GitHub Actions の OIDC trusted publishing で provenance 付き、
  `@types/*` は `types <ts-npm-types@microsoft.com>`。from 版と to 版で変化なし
- lifecycle script（`preinstall` / `install` / `postinstall` / `prepare`）: 新規追加ゼロ
- 既知 advisory: to 版と、新たに解決される transitive 版を GitHub Advisory Database で照会し、該当ゼロ
- github-actions 2 件: PR が pin した SHA が upstream タグの commit と一致
- override: 今回動く解決に掛かるのは `pnpm-workspace.yaml` の `undici: ^7.28.0` だけで、#2828 の解決版
  7.29.1 は floor を満たす

依存エッジは `pnpm-lock.yaml` の snapshot を peer suffix を落として base とヘッドで突き合わせた。
**lock に新しく登場したパッケージ名は #2827 の 2 件だけ**で、他の 9 件は既存パッケージの版の移動だった。

CI が red の PR が 2 件あり、どちらも bump 自体が原因ではなかった。

## 決定

**10 件すべてを採用した。却下・保留はゼロ。** 9 件は bot PR のままマージし、#2827 だけを
差し替え PR [#2842](https://github.com/kompiro/karasu/pull/2842) で入れる。

| PR | 依存 | from → to | 種別 | 判断 | 反映 |
| --- | --- | --- | --- | --- | --- |
| #2824 | `pnpm/action-setup` | v6.0.10 → v6.1.0 | minor | 採用 | そのままマージ |
| #2825 | `actions/deploy-pages` | v5.0.0 → v5.0.1 | patch | 採用 | そのままマージ |
| #2831 | `@types/node` | 26.4.0 → 26.5.0 | minor | 採用 | そのままマージ |
| #2826 | `@types/react-dom`（react group） | 19.2.5 → 19.2.7 | patch | 採用 | Playwright の再実行で green の後にマージ |
| #2829 | `lucide-react` | 1.38.0 → 1.42.0 | minor ×4 | 採用 | そのままマージ |
| #2830 | `@anthropic-ai/sdk` | 0.122.0 → 0.124.0 | minor ×2 | 採用 | そのままマージ |
| #2832 | `oxlint` | 1.80.0 → 1.82.0 | minor ×2 | 採用 | そのままマージ |
| #2833 | `@playwright/test` | 1.62.1 → 1.63.0 | minor | 採用 | rebase 1 回の後マージ |
| #2828 | `astro` | 7.2.10 → 7.3.1 | minor | 採用 | rebase 1 回の後マージ |
| #2827 | `vitest` + `@vitest/coverage-v8`（vitest group） | 4.1.11 → 5.0.0 | **major** | 採用（bot PR は close） | 差し替え PR #2842（bump と ADR-2447 の assumption 更新を同梱） |

採用なので `@dependabot ignore` はどこにも設定していない。

## 理由

### #2827: red の原因は repo 側の assumption で、決定は v5 でも成り立つ

`Check` job は 1 行で落ちていた。

```
✗ ADR-2447 :: grep: package.json :: "vitest": "\^4\. — pattern not found in package.json
Checked 944 assumption(s): 935 OK, 1 failing, 8 manual-review.
```

これは [ADR-2628](2628-adr-assumption-version-policy.md) が意図した失敗である。assumption を major で
止めたのは、major が変わったときにその ADR の決定がまだ成り立つかを人が見るためで、今回がその場面にあたる。

[ADR-2447](2447-dependabot-triage-2026-08-10.md) の決定は「peer が exact pin の `vitest` と
`@vitest/coverage-v8` を同時に動かし、manifest の版を揃える」ことで、v5 でもそのまま成り立つ。
`@vitest/coverage-v8@5.0.0` の peer は `vitest: "5.0.0"`（exact）で、group PR は両方を揃えて動かしている。
したがって assumption を `\^5\.` に上げればよい。本文ではなく frontmatter の更新なので
[ADR-2687](2687-adr-body-is-immutable.md) に反しない。

Dependabot は `docs/adr/` を書き換えず、bot ブランチに足したコミットは recreate で失われる。
**bump と assumption 更新を 1 コミットにした差し替え PR** で入れた（[ADR-2623](2623-dependabot-triage-2026-08-25.md) と同形）。

### #2827: CI は Test に到達していなかったので、ローカルで確かめた

`ci.yml` の `Check` job は assumption チェックの後に Typecheck / Test / Build を実行する。
**#2827 の CI はその手前で止まっており、vitest 5 でテストは一度も走っていなかった。** 所見は「CI 結果が
決め手」としていたが、その CI 結果は存在しなかった。

bot ブランチと差し替え PR のブランチ（最新 main 上）の双方で、CI と同じ順に install、lint、format、knip、
license、assumption、typecheck、build、`test:coverage` と、`test:coverage` が回さない `lsp` / `vscode` の
テストを実行し、すべて通過した。`test:coverage` の各スイートのテストファイル数は main の CI と一致し、
v5 の「祖先ディレクトリの config を探さない」変更でスイートが黙って消えていないことも確かめた。

v5 の breaking change のうち本 repo に関わりうるもの（mock の既定 clear、await されない非同期 assertion の
失敗化、hoist 対象がトップレベル外にあると throw、inline projects の root config 継承、Node 22 / Vite 6.4 必須）は、
全件通過で実害なしと判断した。Node は 24、Vite は 8.2.2 で要件を満たす。

### #2827: medium としたのは依存ツリーの入れ替わり

v5 は `@vitest/expect` / `runner` / `snapshot` / `utils` / `pretty-format` を本体に取り込み、lock から
16 エントリが消えて 11 が入る。入るもののうち新しいパッケージ名は、`@vitest/coverage-v8` が istanbul 系を
置き換えた 2 件（リリースノート「Switch to `@vitest/istanbuljs` packages」#11053）。

| パッケージ | 出所 | 初回公開 | 使う版 | publisher |
| --- | --- | --- | --- | --- |
| `@vitest/istanbul-lib-coverage` | `vitest-dev/istanbuljs`（vitest-dev org、fork ではない） | 2026-08-24 | 1.0.1（2026-08-31） | GitHub Actions OIDC |
| `@vitest/istanbul-lib-report` | 同上 | 2026-08-24 | 1.0.1（2026-08-31） | GitHub Actions OIDC |

`@vitest` scope は vitest-dev の管理下にあり、typosquat の形ではない。install 時に走る script も無い。
新しい repo・新しい名前であることは事実なので、ここは「確認して受け入れる」判断である。
差し替え PR の lock が追加・削除するパッケージの集合は bot PR と完全に一致することも確かめた。

### #2826: Playwright red は bump と無関係な断続的失敗

落ちたのは `at-0014-memory-project-mode-unification.spec.ts:162`（deploy container のクリックで realizes 先が
ハイライトされない）の 1 件だけだった。`@types/react-dom` は型定義だけで実行時に現れず、同じ base の
E2E nightly と他の npm PR の Playwright は green だった。失敗ジョブだけを再実行して green になり、
コードを変えずに通ったので断続的な失敗と判断した。

### その他の 8 件

- #2824: 変更は pnpm v12 対応の分岐追加で、pnpm 11 以前の経路は判定を分岐の内側に移しただけ
- #2825: deployment polling に backoff と jitter を追加しただけ
- #2831: 型のみ。`@types/sax` が 26.4.0 に畳まれ、重複が 1 つ減る
- #2829: 中間の 1.39.0〜1.41.0 も含め、アイコンの追加とメタデータ修正のみ。削除なし
- #2830: API 型の追加と、非 Node バンドルから credential file アクセスを外す修正
- #2832: 1.82.0 の BREAKING 2 件は Rust の parser crate API で、CLI 利用には影響しない。`--deny-warnings` の
  Lint も通過し、新規則による指摘が出る形（ADR-2773 の #2769）には当たっていない
- #2833: 機能追加のみで Breaking の節なし。optional の `fsevents` の辺が 1 本消える
- #2828: 機能追加と `astro:assets` の起動不具合修正。動くのは既存パッケージの版上げ 4 件で、新しい名前なし

### マージ順は lock を作り直して検証し、rebase の往復を省いた

main は最新 base を必須にしていない（`strict_required_status_checks_policy: false`）ので、テキスト上ぶつから
なければ rebase なしでマージできる。ただし lock はテキストが綺麗に重なっても、意味の上で矛盾しうる
（他の PR の snapshot に残る古い peer suffix など）。

そこで、マージ順どおりに bot ブランチを main へテキストで重ね、**各時点で `pnpm install --lockfile-only` を
実行して lock に差分が出ないこと**を確かめた。差分が出なければ、重ねた lock は pnpm 自身の出力と一致している。
7 件（Actions 2 件、#2831、#2826、#2829、#2830、#2832）はすべての時点で一致したので、rebase なしで順にマージした。
#2833 と #2828 はテキスト上ぶつかったので `@dependabot rebase` を 1 回ずつ依頼し、rebase 後にも同じ検証をしてから
マージした。マージ後の main の lock は、検証した状態と一致した。

## 却下した案

- **#2827 を bot PR のままマージする**: `Check` が構造的に赤のままで、テストも走っていない。bot ブランチに
  assumption の更新を足しても recreate で消える。
- **#2827 を保留して、assumption を先に main で緩める**: `\^5\.` は v4 の main では成り立たない。assumption を
  major 非依存にすると、ADR-2628 が major bump で見直させる仕組みを外すことになる。
- **npm の PR を 1 件マージするごとに残り全件を `@dependabot rebase` する**: CI 待ちが PR の数だけ往復する。
  lock を作り直す検証で、rebase が要るのは 2 件だけと先に分かった。

## 影響

- `undici` が 7.29.0（`cheerio` / `jsdom` 経由）と 7.29.1（`unifont` 経由）の 2 版に分かれた。どちらも
  override の floor を満たし advisory 該当なし。次に `jsdom` / `cheerio` が動いたときに畳まれる見込みなので放置する。
- 差し替え PR #2842 のマージで ADR-2447 の assumption は `"vitest": "\^5\.` になる。次の vitest major で
  同じ見直しが起きる。

## 派生した気づき

同じバッチで週次 workflow を dispatch で再実行し（#2837）、手動トリアージの代わりになるかを評価した。
所見は、確認できた範囲では正確で、届かなかった箇所も明示していた。しかし、採否を決めた論点
（#2827 で CI がどこで止まったか、差し替え PR が要ること、新しいパッケージ名）はどれも拾えなかった。

原因は 3 つあり、[#2838](https://github.com/kompiro/karasu/issues/2838) に切り出した。

- shell の実行が許可されておらず、network allowlist では許されている npm registry に届かない
- GitHub toolset に `actions` が無く、CI の結果を読めない
- lock の依存エッジ差分を取る手順が prompt に無い

threat detection がどの実行でも結論を出さないまま safe outputs が公開されている件は、既存の
[#2786](https://github.com/kompiro/karasu/issues/2786) に証拠を追記した。これらを受けて、週次の schedule を止め
dispatch で運用する判断を別に行った（[#2839](https://github.com/kompiro/karasu/issues/2839)）。
