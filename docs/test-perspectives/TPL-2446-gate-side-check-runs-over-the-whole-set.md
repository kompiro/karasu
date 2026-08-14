---
id: TPL-2446
title: "マージを gate する側の検証は対象を列挙せず全走査で回す — ローカルで広く走る同名チェックが CI 側の列挙漏れを隠す"
status: active
date: 2026-08-13
applicable_to:
  - "同じ検証（typecheck / lint / format / build）が VCS フックと CI の両方に配線されていて、対象集合の指定方法が両者で異なる仕組み"
  - "パッケージ名・ファイル名・ディレクトリ名を手で列挙して検証範囲を決める CI ステップ"
  - "新しい workspace パッケージ / サブプロジェクトの追加"
known_consumers:
  - ci-check-job
discovered_from:
  - issue: "#2446"
  - root_cause_file: ".github/workflows/ci.yml"
related_to:
  - TPL-1725
  - TPL-1480
  - TPL-2253
topic: build
scope:
  packages: []
---

# TPL-2446: マージを gate する側の検証は対象を列挙せず全走査で回す — ローカルで広く走る同名チェックが CI 側の列挙漏れを隠す

## 観点

同じ検証が 2 か所（ローカルの pre-push フックと CI）に配線されているとき、**検証が存在するか**ではなく **gate 側の対象集合が全体を覆っているか**を見る。

gate 側とはマージを止められる機械、すなわち CI の Required job のこと。ローカルフックは止められない — 落ちても `--no-verify` で通せるし、bot の PR ではそもそも一度も走らない。したがって **gate 側で走らない検証は、存在しない検証**として扱う。

危険なのは片方が欠けている状態ではなく、**両方あるが対象集合がずれている**状態。広い方（ローカル）が狭い方（CI）の穴を日常的に埋めてしまい、人間が出す PR では穴が観測されない。穴が見えるのはフックを通らない経路 — bot PR、fork からの PR、Web UI 編集、`--no-verify` — だけで、そこは同時に「見つけた人が原因を調べにくい」経路でもある。

対象集合を手で列挙している限りこのずれは再発する。列挙は追加のたびに更新を要求するが、**更新を忘れても何も落ちない**（[TPL-2253] と同型の失敗で、あちらは除去、こちらは検証範囲）。gate 側は列挙ではなく全走査（`pnpm -r`・glob・ディレクトリ走査）で回し、「全部に検証がある」ことを別の機械チェックで縛る。

## 想定される失敗モード

- CI が列挙した N パッケージだけを検証し、N+1 個目のパッケージが**誰にも検証されないまま緑**になる。ローカルフックは全部を検証しているので、書いた本人にも見えない。
  - 実例 #2446: `Check` ジョブは core / app / cli の 3 つを名指しで typecheck していた。`lefthook.yml` の pre-push は `pnpm run typecheck`（`pnpm -r`）で 10 パッケージ全部を見ていたため差分は誰にも見えず、`lsp` / `vscode` / `nest` / `i18n` / `docs-site` / `vscode-e2e` / `scripts/` は **CI では一度も typecheck されていなかった**。Dependabot の #2432（`vscode-languageserver` 10 系）は `Diagnostic.message` の型が `string | MarkupContent` に広がって `packages/lsp` の 12 アサーションを壊しながら**全チェック緑**で、破壊が見えたのは手で `pnpm run typecheck` を叩いたときだけ。
- 全走査に切り替えても、走査単位が検証スクリプトを持たなければ**黙って飛ばされる**。`pnpm -r run typecheck` は該当 script の無いパッケージをエラーにせず、`Scope: N of M` の行も同じ姿のまま。#2446 時点の `packages/e2e` がこれで、TypeScript の spec 群がどこでも型検査されていなかった。
- 検証範囲を広げた PR が「今まで検証されていなかった側」の既存エラーで落ち、**無関係な修正が混ざる**。これは失敗ではなく先送りの清算だが、範囲拡大とエラー修正を同じ PR に混ぜると差分が読めなくなる。
- 依存更新 PR が緑でマージされ、破壊が次の無関係な PR や release で顕在化する（原因 PR の特定に二次コストがかかる — [TPL-1725] と同じ検出遅延）。
- 穴を塞いだ瞬間、**塞いだ側が今度はローカルでだけ通る**。長く検証されていなかった対象は、ローカル環境の余剰物に依存していても誰も気付かないため。
  - 実例 #2446: CI で走り始めた `tsc --noEmit -p scripts/tsconfig.json` が `@karasu-tools/core` を解決できずに落ちた。`scripts/tsconfig.json` だけ `customConditions: ["development"]` を欠いており、`dist/index.d.ts`（= build 後にしか無い）を見に行っていた。ローカルで緑だったのは **git worktree で作業していたから** — モジュール解決が worktree の根を越えて親 checkout（`/workspaces/karasu/node_modules`）まで遡り、そこにあった**ビルド済み `dist/` を拾っていた**。CI の clean checkout にその親は無い。

    worktree はこの masking を両方向に起こす。#2446 の Issue 本文が報告した「fresh worktree では出るが primary checkout では出ない `@types/node` エラー」も同じ機構の逆向きで、どちらの場合も**同じコミット・同じ依存バージョンで結果が変わる**。

## チェックリスト

CI ステップを足す / 直す、または workspace にパッケージを足すときに確認する:

- [ ] gate 側（Required な CI job）の対象集合が **列挙ではなく全走査**か。`pnpm --filter <pkg>` を並べていたら `pnpm -r`（またはディレクトリ走査）に畳めないか検討する
- [ ] ローカルフックと CI で **同じコマンド**を実行しているか。違うなら、どちらが広いかを言えるか（広い方がローカルなら、その差はいま穴になっている）
- [ ] 全走査が**黙って飛ばす単位**が無いか。走査対象すべてが当該 script / 設定ファイルを持つことを機械チェックで縛る（`pnpm -r` は script 不在を成功として扱う）
- [ ] 範囲を広げた結果落ちた既存エラーを、**同じ PR で直すか別 PR に分けるか**を決めて PR に書いたか
- [ ] 新しく検証対象に入った単位が、**ローカル環境の余剰物に依存していない**か。worktree で作業しているなら、モジュール解決やパス解決が親 checkout を拾っていないことを確かめる（`tsc --traceResolution` の解決先パスが worktree 内で閉じているか、など）
- [ ] 列挙をやめられない事情があるなら（deploy 前の単体検証など gate ではないジョブ）、**なぜ gate 側ではないか**をその場のコメントに書いたか

## 既知の対処パターン

- **gate 側は root script を呼ぶ（#2446 の対処）**: `.github/workflows/ci.yml` の `Typecheck` ステップは `pnpm run typecheck` を実行する。root script は `pnpm -r run typecheck && tsc --noEmit -p scripts/tsconfig.json` で、pre-push フックが実行するものと同一 — 「ローカルの方が広い」状態を構造的に作れなくする。
- **全走査の穴を機械チェックで塞ぐ**: `scripts/ci/typecheck-coverage-policy.test.ts` が (1) 全 workspace パッケージが `typecheck` script を持つこと、(2) root script が `pnpm -r` であること、(3) `ci.yml` に `pnpm --filter … run typecheck` が 1 行も無いことを assert する。列挙への逆戻りと、script を持たない新パッケージの両方がテスト失敗として現れる。
- **同型の先例**: `scripts/ci/node-version-policy.test.ts`（Node の pin が全 workflow / devcontainer / `engines` で一致）、`scripts/ci/workflow-runner-policy.test.ts`（全 job が既知 runner ラベルのどちらかに乗る）、`scripts/ci/pnpm-config-location.test.ts`（pnpm 設定が黙って無視される場所に書かれていない）。いずれも「列挙が腐る」を「列挙を機械が作る」に置き換えている。
- **解決先を worktree 内で閉じる**: 検証が build 成果物を要求すると、親 checkout を拾える環境でだけ通る。`scripts/tsconfig.json` に `customConditions: ["development"]` を足して `src/` 解決に揃えた（#2446）。判定は `tsc --traceResolution` の `was successfully resolved to` が指すパスで、worktree の外を指していたらその緑は信用しない。
- **path filter / Required 化との組み合わせ**: 対象を触る PR で必ず起動させる話は [TPL-1725]、2 つの成果物の両側で起動させる話は [TPL-1480]。本観点はそれらと直交で、**起動したチェックが何を見ているか**を扱う。

## 関連テスト

- `scripts/ci/typecheck-coverage-policy.test.ts`（本観点の機械チェック — 全パッケージの `typecheck` script、root script の再帰性、`ci.yml` の非列挙）
- `.github/workflows/ci.yml`（`Typecheck` ステップ — gate 側の全走査）
- `lefthook.yml`（pre-push の `typecheck` — CI と同一コマンド）

[TPL-1480]: TPL-1480-consistency-check-triggers-on-both-sides.md
[TPL-1725]: TPL-1725-gated-test-suite-detection-gap.md
[TPL-2253]: TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md
