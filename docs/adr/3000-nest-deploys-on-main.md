---
id: ADR-3000
title: karasu-nest を main への push で自動 deploy し、対象 path は nest の workspace 依存から機械的に決める
status: accepted
date: 2026-09-30
topic: build
authors: [kompiro]
depends_on: [ADR-2578, ADR-2969]
related_to: [ADR-1890]
scope:
  packages: [nest]
  concerns: [ci, deployment]
assumptions:
  - "file: scripts/ci/nest-deploy-trigger.test.ts"
  - "grep: .github/workflows/nest-deploy.yml :: branches: \\[main\\]"
  - "grep: .github/workflows/nest-deploy.yml :: packages/core/\\*\\*"
  - "symbol: packages/nest/src/auth/allowlist.ts :: signInAllowlist"
---

# ADR-3000: karasu-nest を main への push で自動 deploy し、対象 path は nest の workspace 依存から機械的に決める

- **日付**: 2026-09-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3000](https://github.com/kompiro/karasu/issues/3000)
  - [ADR-2578](2578-nest-retires-server-side-reverse.md)（決定 5: Pages app とは別の deploy にする）
  - [ADR-2969](2969-nest-operator-only-sign-in.md)（サインインを運用者の許可リストに限る）
  - [ADR-1890](1890-ci-runner-ubicloud.md)（secret を持つ deploy job は GitHub-hosted runner）
  - `.github/workflows/nest-deploy.yml`、`scripts/ci/nest-deploy-trigger.test.ts`

## 背景

`nest-deploy.yml` は `workflow_dispatch` だけで起動していた。冒頭のコメントは、公開する
投稿面には ToS とプライバシーポリシーが要ること（#2691）を理由に「main への自動 deploy は
最後につなぐ線」としていた。そのため `packages/nest` を変えるたびに手動 deploy が要り、
忘れると動いている Worker と `main` がずれる。

その後、状況が 2 点変わった。

- ギャラリーを運用者以外に開かないという条件が、文書ではなくコードで守られるようになった。
  `NEST_SIGN_IN_ALLOWLIST` に載っていない GitHub アカウントは OAuth callback で拒否される
  （ADR-2969）。誰に開くかを決めるのは許可リストで、deploy の起動方法ではない。
- 2026-09-29 以降、`main` からの手動 deploy が成功し続けている。

もう 1 点、nest は近いうちに `@karasu-tools/app` のプレビュー部品に依存する見込みがある
（#2997 の流れ）。依存先の package は Worker に bundle されるので、依存先の変更も deploy の
対象になる。依存が増えるたびに人が `paths:` を思い出して直す運用では、直し忘れた変更だけが
deploy されずに残り、しかも何も赤くならない。

## 決定

`nest-deploy.yml` に `push: branches: [main]` を足し、`paths:` を nest 自身、nest が推移的に
依存する workspace package、`pnpm-workspace.yaml`、workflow ファイル自身に絞る。`paths:` と依存の一致は
`scripts/ci/nest-deploy-trigger.test.ts` で機械的に検査する。

## 理由

- 公開範囲は許可リスト（ADR-2969）が決めているので、`main` を自動で deploy しても運用者以外に
  開くことにはならない。法務レビュー（#2691）は、許可リストを広げるときの前提条件のまま残る。
- `paths:` で絞るのは、nest に関係のない merge のたびに secret を持つ deploy job を走らせない
  ためである。
- drift テストは `packages/nest/package.json` の `workspace:` 依存（`dependencies` と
  `devDependencies` の両方）を再帰的にたどり、見つかった各 package の `packages/<dir>/**` が
  `paths:` にあるかを確かめる。逆に、依存していない package が残っていても落とす。依存を
  足した PR がそのまま `paths:` の更新を求められるので、直し忘れが起きない。
- `pnpm-workspace.yaml` を入れるのは、bundle される第三者コード（core 経由の `yaml` や
  `smol-toml` など）の脆弱性修正が `overrides:` としてここに入り、どの `package.json` も
  変えないためである。入れないと、修正が次の無関係な deploy まで Worker に届かない。
  変更頻度は低い（2026-08 以降で 6 回。lockfile は 103 回）。
- `concurrency: nest-deploy`（`cancel-in-progress: false`）がすでにあるので、merge が続いても
  deploy は順番に走り、途中で打ち切られない。
- `workflow_dispatch` と `dry_run` は残す。push イベントには `inputs` が無いので、
  `command` は通常の `deploy` になる。

## 却下した案

- **`paths:` に依存先を手で並べるだけにする**: 依存が増えたときに更新を忘れても何も赤くならず、
  その変更は deploy されない。今回の決定はまさにこの穴を塞ぐためのもの。
- **workflow の中で `pnpm --filter "@karasu-tools/nest...[<before>]"` を使い、変更の有無を動的に
  判定する**: 依存の定義が workflow の外から見えなくなる。lockfile だけが変わったときの扱いも
  はっきりしない。明示した `paths:` と drift テストのほうが、読む人にも検査にも分かりやすい。
- **`pnpm-lock.yaml` も `paths:` に入れる**: lockfile はほぼすべての Dependabot の merge で
  変わるので、nest と無関係な deploy が増える。nest や core の直接依存の更新であれば、
  `packages/nest/package.json` か `packages/core/package.json` が変わるので `paths:` に掛かる。
  推移的な依存だけの更新は、次の deploy で取り込まれる。ただし脆弱性修正の `overrides:` は
  `pnpm-workspace.yaml` を変えるので、そちらで拾う。
- **`paths:` を付けず、`main` への push ごとに deploy する**: 変更の大半は nest と無関係で、
  secret を持つ job を不要に走らせることになる。
