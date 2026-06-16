# karasu — 開発プロセス

## ドキュメントのライフサイクル

アイデアから意思決定まで、以下の流れでドキュメントを管理する。

```
アイデア
  └→ GitHub Issues          ← 思いついたこと、試してみたいこと

実装着手
  └→ docs/design/           ← 「どう作るか」の詳細設計（ドラフト/検討中）

決定後（採用 or 見送り）
  └→ docs/adr/              ← 「なぜそうしたか」の決定記録（簡潔に）
```

### 各ディレクトリの役割

| 場所 | 何を置くか | ステータス |
|------|-----------|-----------|
| GitHub Issues | アイデア・機能要望・バグ | オープン/クローズ |
| `docs/design/` | 実装の詳細設計（制約・代替案・実装方針） | ドラフト / 検討中 |
| `docs/adr/` | 確定した設計判断の記録（採用・見送り） | 決定済み |
| `docs/spec/` | 構文・タグの仕様リファレンス（i18n ポリシーは `docs/spec/i18n.md`） | — |
| `docs/acceptance/` | 受け入れテスト基準 | — |

**設計ドキュメント (`docs/design/`) には「採用」「取りやめ」のドキュメントを置かない。**
決定が下りたら ADR に昇格させ、設計ドキュメントは削除する。

---

## 開発ワークフロー

### ブランチ戦略

- `main` への直接コミット・push は禁止 — PR 経由でマージする
- 機能開発は `git worktree add` により worktree を作成して行う
- worktree の作成先は必ず `.claude/worktrees/<branch-name>` とする（例: `git worktree add .claude/worktrees/feat/my-feature feat/my-feature`）
- ブランチ命名規則: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` + kebab-case

### Issue・PR 記述ルール

- Issue のタイトル・本文・コメントは英語で書く
- PR のタイトル・description（本文）は英語で書く
- commit メッセージも英語（subject）

### Issue 種別ラベル — `bug` と `test-infra` の使い分け

Issue が表面化した「失敗の種類」によってラベルを使い分ける。バーンダウンや TPL 抽出の signal を分離するため、両者は混在させない。

| ラベル | 適用範囲 |
|--------|----------|
| `bug` | エンドユーザーが観測した（または観測しうる）プロダクト上の不具合 |
| `test-infra` | E2E flake、fixture drift、locale pinning など、テスト基盤側の問題でありプロダクトのユーザー影響を伴わないもの |

- `bug` と `test-infra` は **mutually exclusive**（同時に付けない）
- どちらでも TPL の素材になりうる（testing-topic TPL は `test-infra` 起源、product-topic TPL は `bug` 起源が典型）
- 3-Yes ルールの起動トリガーは `bug` と `test-infra` の双方

### Issue ステータスラベル

Issue の進捗は以下のラベルで管理する。

| ラベル | 意味 |
|--------|------|
| `status: ready` | 着手可能（依存関係が解消済み） |
| `status: designing` | Design Doc 作成中 |
| `status: designed` | Design Doc 承認済み・実装着手可能 |
| `status: implementing` | 実装中 |
| `status: in-review` | PR オープン・人間の確認待ち |
| `status: blocked` | 別 Issue の完了待ちでブロック中 |

**Design Doc あり のフロー:**
```
ready → implementing → designing → designed → implementing → in-review → (close)
```

**Design Doc なし のフロー:**
```
ready → implementing → in-review → (close)
```

> `close` は PR に `Closes #N` を記載することで GitHub が自動で行う。

### PR ワークフロー

```
1. GitHub Issue を作成する（gh issue create）
2. git worktree add .claude/worktrees/<branch> <branch> で作業ブランチ・worktree を作成する
3. Issue ラベルを status: implementing に更新する
4. Plan モードで実装計画を作成し、レビューを受ける
   - 必要に応じて docs/design/ に設計ドキュメントを作成する（Issue を status: designing に更新）
   - Design Doc PR がマージされたら status: designed → 実装開始時に status: implementing に戻す
   - 受け入れテスト（docs/acceptance/）を計画に含める
5. 実装する
6. /hane:commit でコミットする（Conventional Commits 形式）
7. PR を作成する（Closes #N で Issue と紐付ける）
8. CI（test / lint / format / typecheck / knip / check:cycles / build）が通過することを確認する
9. Issue ラベルを status: in-review に更新する
10. 手動検証チェックリストを実施する
11. レビュー → マージ → git worktree remove .claude/worktrees/<branch> でクリーンアップ
```

詳細な手順は `/hane:start-dev` スキル（[`kompiro/hane`](https://github.com/kompiro/hane) plugin）を参照。

### Claude Code plugin のセットアップ

karasu のワークフローを Claude Code 上で再現するには、portable な skill 群を提供する `kompiro/hane` plugin をインストールする。

```
/plugin marketplace add kompiro/hane
/plugin install hane@kompiro-hane
```

plugin にバンドルされる skill とその karasu 内での主な用途:

| Skill | 用途 |
|---|---|
| `/hane:start-dev` | Issue → worktree → 計画 → 実装 → コミット → PR の全体フロー |
| `/hane:commit` | Conventional Commits でコミット |
| `/hane:ship` | push → PR → CI → クリーンアップ |
| `/hane:design-doc` | `docs/design/` への設計検討記録の作成 |
| `/hane:acceptance-test` | `docs/acceptance/NNNN-*.md` の受け入れテスト記録作成 |
| `/hane:qa` | `docs/qa/YYYY-MM-DD-checklist.md` 生成 |
| `/hane:review-docs` | リンク切れ・ドキュメント整合性レビュー |
| `/hane:sync-docs` | コード現状に合わせてリファレンス系ドキュメントを更新 |

karasu 専用の skill（`/svg-icon`, `/update-examples`）は `.claude/skills/` 配下にローカル定義されている（plugin 化対象外）。

### Sibling repo の clone（`adr-tools`, `tpl-tools`, `hane` 等）

devcontainer の `/workspaces` は `node` ユーザー所有に設定されており、karasu の隣に関連リポジトリを clone できる。Claude Code の sandbox にも `/workspaces` を `additionalDirectories` で追加済みのため、セッションを離れずに sibling repo の更新作業ができる。

```
git clone https://github.com/kompiro/adr-tools.git /workspaces/adr-tools
git clone https://github.com/kompiro/tpl-tools.git /workspaces/tpl-tools
git clone https://github.com/kompiro/hane.git     /workspaces/hane
```

karasu 側のセッション内で `/workspaces/adr-tools` / `/workspaces/tpl-tools` / `/workspaces/hane` の編集・コミット・PR 作成が可能。書き込み権限は image build 時に Dockerfile で `/workspaces` を `node:node` 所有に設定しているため、devcontainer を作り直した直後から有効。

karasu は ADR / TPL ツールを外部パッケージ（`@kompiro/adr-tools`, `@kompiro/tpl-tools`）として GitHub Packages から install する。`.npmrc` は `@kompiro:registry=https://npm.pkg.github.com` を指定済みで、CI は `secrets.GITHUB_TOKEN` 経由で読み取る（各 package の "Manage Actions access" に `kompiro/karasu` を `Read` で追加してある）。ローカル install には `NODE_AUTH_TOKEN` に `read:packages` 権限を持つ token を渡す。fine-grained PAT を使う場合は Repository permissions の **Packages: Read-only** が必要。

### 循環依存チェック

`pnpm check:cycles` で `madge --circular` を 5 つのプロダクションパッケージ（core / app / cli / lsp / vscode）の `src/` に対して実行し、モジュール間の循環依存を検出する。

- pre-push の lefthook と CI の `Check` ジョブで自動実行されるため、ローカル / PR どちらでも循環導入時にブロックされる
- 型のみの import (`import type`) でも madge は循環として検出する。共有契約は専用の leaf module（例: `renderer/layout-types.ts`）に分離して回避する
- e2e パッケージ（`packages/e2e`, `packages/vscode-e2e`）はテスト専用で意図的にスキャン対象外

### Barrel import 禁止（core 内部）

`packages/core/src/` 配下のプロダクションコードから `**/index.js` への import を `no-restricted-imports` で禁止している（`.oxlintrc.json` の overrides）。`packages/core/src/index.ts` は 1,100 行超・78 export を持つ barrel で、内部から自分自身を経由する import を許すと runtime 循環依存に直結するため。

- 内部モジュールは直接 deep path（例: `from "./parser/parser.js"`）で import する
- テストファイル（`*.test.ts`, `*.spec.ts`）は引き続き `from "../index.js"` を許可（公開 API としての smoke test を兼ねるため）

### QA チェックリスト

`/hane:qa` スキルはリリース前や任意のタイミングで実行できる。

```
/hane:qa を実行
  → docs/acceptance/*.md を読み込む
  → bash コマンドを自動実行（build / test / lint 等）
  → 手動確認が必要な - [ ] 項目を収集
  → docs/qa/YYYY-MM-DD-checklist.md を生成
```

### 自動化アノテーションの書式

自動化されたケースを `docs/acceptance/*.md` に反映するときは、`/hane:acceptance-test` スキル（plugin: `kompiro/hane`）の「自動化アノテーション」節に従って `> ✅ Automated — ... › ...` 形式の blockquote を箇条書き直下に添える。書式は repo 全体で統一されており、過去の "Verified by" メタ欄や "Automated Checks" 節分割は順次本方式に畳まれる（#916）。

- 生成ファイルは git にコミットしない（`.gitignore` 対象）
- 手動確認項目は生成されたファイルをもとに順番に実施する
- `/hane:qa` は手動 QA のチェックリストを生成する。機械化可能な AT は Playwright による E2E 層（`packages/e2e/`）が補完する。自動化は手動 QA を置き換えず補完する（詳細は ADR-20260412-05）

### 設計判断を ADR に残すタイミング

設計ドキュメントのステータスが「採用」または「取りやめ」に確定したら ADR を作成する。

新規 Design Doc を書くときの雛形は `docs/design/TEMPLATE.md` を参照する。

ADR の内容:
- **Frontmatter**: `id` / `title` / `status` / `date` と、該当する関係性（`supersedes` / `depends_on` 等）を YAML frontmatter に記述する。雛形は `docs/adr/TEMPLATE.md` を参照。ローカル検証は `pnpm adr:validate`。
- **背景**: なぜ検討することになったか
- **決定**: 何を決めたか（一文で）
- **理由**: 採用・見送りの根拠（箇条書き）
- **関連**: GitHub Issue / 設計ドキュメントへのリンク

設計ドキュメントに詳細な分析が残っている場合は、ADR 作成後に設計ドキュメントを削除する。
（詳細は GitHub Issue のディスカッションや PR コメントで追えるため）

Frontmatter スキーマ・関係性セマンティクス・バリデータの詳細は `docs/design/adr-knowledge-graph.md` を参照。

### spec / concepts 改訂時の proactive TPL 同梱

`docs/spec/` または `docs/concepts*.md` に**新規セクションを追加する PR**は、そのセクションの規定が破られたときに検出する **proactive TPL を最低 1 件、同 PR で起こす**（または既存 TPL を当該 spec に back-ref で紐付ける）。

理由: spec の明文化と TPL を時間差で進めると、明文化されない期間に「概念だけはあるがテスト観点が無い」状態が生まれ、そこで踏んだ bug が retrospective TPL を量産する。spec を書くタイミングで proactive TPL を起こすほうが、proactive-first ライフサイクル（`docs/test-perspectives/README.md` 「TPL のライフサイクル」）の理想形に近づく。

運用:

- spec 章末尾に `> Related TPLs:` 注釈を追加し、当該章を裏付ける TPL を一覧する（spec ↔ TPL の双方向リンク）
- 新規 TPL の本文末尾に「## 派生元 spec」セクションを置き、`docs/spec/...#anchor` を引用する
- spec 章の改訂 PR description のチェックリストに「対応する proactive TPL を起こした / 既存 TPL に back-ref した」を含める

### 既存 ADR を見直すとき

既に決定済みの ADR を覆す・方針変更する場合は、**旧 ADR を書き換えず新 ADR で supersede する**。

- 旧 ADR はそのまま歴史的記録として残す
- 新 ADR を作成し、背景に「何が変わったためこの再評価に至ったか」を明記する
- 旧 ADR のステータス行を `決定済み` から `Superseded by ADR-YYYYMMDD-NN` に更新する
- Frontmatter では旧 ADR を `status: superseded` + `superseded_by: ADR-YYYYMMDD-NN`、新 ADR を `supersedes: [旧 ADR ID]` とする。`pnpm adr:validate` が双方向整合をチェックする
- 新 ADR の「関連」に旧 ADR へのリンクを記載する

理由: ADR は時点の意思決定と根拠を保存するログであり、過去の判断が「当時は正しかった」
ことを消してはならない。前提条件の変化を読み取れるようにするには、新旧を並置できる方が良い。

## Dependabot 運用ルール

### 通常の version update

- スケジュールは weekly / Monday、cooldown は全 semver レベル 7 日（`.github/dependabot.yml`）。
- 月曜のバッチ起票後にレビュー → マージする。バッチ単位で取り込み判断を ADR に残すことがある（例: `ADR-20260428-02`）。

### Security update（GHSA 起因の即時 PR）

Dependabot security update は alert 検知時に即時起票され、`schedule` も `cooldown` も `updates:` の設定も参照しない。月曜以外に Dependabot PR が出ていたら、まず security update かどうかを確認する。

**pnpm workspace で同一 advisory に対して PR が複数起票された場合の処理:**

1. `pnpm-lock.yaml` を含む root スコープの PR を merge する。
2. `packages/<name>/package.json` のみを書き換える PR は close する。

理由: pnpm workspace では依存宣言（`packages/*/package.json`）と解決済みバージョン（root の `pnpm-lock.yaml`）が別 manifest として alert 化されるため、Dependabot は alert ごとに PR を作る。`packages/*` 単独 PR は workspace ルートの lockfile を更新できず、`pnpm install --frozen-lockfile` で必ず CI が落ちる構造的制約があり、`@dependabot recreate` でも直らない。`dependabot.yml` でも抑制不可（security update は `updates:` を参照しない）。

詳細・経緯は `ADR-20260429-08`（`docs/adr/20260429-08-dependabot-security-2026-04-29.md`）を参照。同様の事象が再発した場合は ADR を増やさず、本ルールに従って処理する。

## リリース運用

npm への公開は **changesets** で管理する。設計の経緯は `docs/design/release-automation.md`（実装後 ADR 化予定）を参照。

### 対象パッケージ

公開対象は `karasu`（CLI、`packages/cli`）と `@karasu-tools/core`（ライブラリ）。CLI は esbuild で `@karasu-tools/core` を内包した単一 ESM バンドルとしてビルドする（`packages/cli` の `build` スクリプト。公開 core への依存には切り替えない）。`@karasu-tools/app` / `@karasu-tools/lsp` / `@karasu-tools/e2e` / `@karasu-tools/vscode-e2e` と `karasu-vscode` は `.changeset/config.json` の `ignore` に入っており公開対象外（VS Code 拡張の配布は Marketplace 経由で別管理 — Issue #1316）。

> **`@karasu-tools/core` は v0.x（TS API、無保証）**。`.krs` / `.krs.style` 言語は v1.0 だが、TS API は minor で破壊的変更を許す（[ADR-20260616-06](adr/20260616-06-krs-spec-v1-freeze.md)）。`exports` は公開先に `dist`（types + ESM）を指し、`development` 条件で repo 内は TS ソースを解決する（root tsconfig `customConditions: ["development"]`）ため `pnpm typecheck` は build 非依存のまま。**実 publish と `@karasu-tools` npm org 予約は公開ローンチ（#1317）ゲート**で、本フローでは「公開可能な状態を保つ」までを担う（#1363）。

### 変更を加えるとき

公開パッケージ（= `karasu`）に利用者から見える変更を入れる PR では、`pnpm changeset` を実行して `.changeset/<name>.md` を追加し、PR に含める。

- bump レベルは semver に従う（破壊的変更 = major、機能追加 = minor、修正 = patch）。CLI はまだ 0.x なので、当面は破壊的変更も minor で扱ってよい。
- 内部リファクタ・テスト・ドキュメントのみ・他パッケージのみの変更では changeset 不要。
- `CHANGELOG.md` の文面は利用者向けに書く（コミット subject の流用ではなく）。

`pnpm changeset status` で「未リリースの変更があるか」を確認できる。

### リリースの流れ

`release.yml` は **publish-only** で運用する。GitHub Actions に PR 作成権限を与えなくて済むよう、bot による "Version Packages" PR は使わない（経緯は Issue #1370）。

リリース手順は以下のとおり:

1. メンテナがローカルで `pnpm changeset version` を実行する（バージョン bump + `CHANGELOG.md` 生成 + lockfile 更新）。
2. その差分を通常の PR（例: `chore: release X.Y.Z`）として上げ、レビュー後に `main` にマージする。
3. `main` への push をトリガに `release.yml` が走り、pending changeset が無い状態なので `changeset publish` が bump 済みパッケージを npm に公開する。
4. publish 時に npm provenance（`--provenance`）を付与する。

> changeset-bot（GitHub App、後述）を導入したらこのフローは bot-PR ベースに戻せる。

### 未対応のフォローアップ

- **changeset-bot**（GitHub App）— PR に changeset の有無をコメントしてくれる。リポジトリを public 化（#1302 Phase 1）したあとに有効化する。
- **npm Trusted Publishing（OIDC）** — トークンレス publish へ移行する。npm 側はパッケージ作成後に設定する必要があるため、初回はリポジトリ Secrets の `NPM_TOKEN` で publish し、その後 OIDC に切り替える。`release.yml` には `id-token: write` と provenance を最初から付けてある。
- **npm 上の名前確保** — `karasu`（unscoped）と `@karasu-tools` org を npm で確保する（launch 前チェック項目）。確保前は `release.yml` の publish が失敗するため、実 publish はそれ以降。
