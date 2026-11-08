# karasu — 開発環境

> hane や tpl-tools のスキルが見つからないとき、`/workspaces` の隣の repo を編集するときに読む。
>
> `docs/process.md` と同じ規律で書く。「今どうするか」だけを書き、経緯は ADR / Issue に置く
> （[ADR-2351](../adr/2351-process-md-holds-instructions.md)）。

### Claude Code plugin のセットアップ

karasu のワークフローを Claude Code 上で再現するには、portable な skill 群を提供する `kompiro/hane` plugin と、TPL を書く skill を提供する `kompiro/tpl-tools` plugin をインストールする。どちらも `kompiro-hane` marketplace にある。

```
/plugin marketplace add kompiro/hane
/plugin install hane@kompiro-hane
/plugin install tpl-tools@kompiro-hane
```

tpl-tools が marketplace に載る前に `kompiro-hane` を追加していた場合は、先に
`/plugin marketplace update kompiro-hane` を実行する（そうしないと install が plugin を見つけられない）。

2 つの plugin にバンドルされる skill とその karasu 内での主な用途:

| Skill | 用途 |
|---|---|
| `/hane:start-dev` | Issue → worktree → 計画 → 実装 → コミット → PR の全体フロー |
| `/hane:commit` | Conventional Commits でコミット |
| `/hane:ship` | push → PR → CI → クリーンアップ |
| `/hane:design-doc` | `docs/design/` への設計検討記録の作成 |
| `/hane:acceptance-test` | `docs/acceptance/NNNN-*.md` の受け入れテスト記録作成 |
| `/hane:review-docs` | リンク切れ・ドキュメント整合性レビュー |
| `/hane:sync-docs` | コード現状に合わせてリファレンス系ドキュメントを更新 |
| `/tpl-tools:test-perspective` | `docs/test-perspectives/` の TPL の作成・更新・deprecate（tpl-tools plugin） |

karasu 専用の skill（`/svg-icon`, `/update-examples`, `/coderabbit-converge`）は `.claude/skills/` 配下にローカル定義されている（plugin 化対象外）。

### Sibling repo の clone（`adr-tools`, `tpl-tools`, `hane` 等）

devcontainer の `/workspaces` は `node` ユーザー所有に設定されており、karasu の隣に関連リポジトリを clone できる。Claude Code の sandbox にも `/workspaces` を `additionalDirectories` で追加済みのため、セッションを離れずに sibling repo の更新作業ができる。

```
git clone https://github.com/kompiro/adr-tools.git /workspaces/adr-tools
git clone https://github.com/kompiro/tpl-tools.git /workspaces/tpl-tools
git clone https://github.com/kompiro/hane.git     /workspaces/hane
```

karasu 側のセッション内で編集・コミット・PR 作成ができる。
