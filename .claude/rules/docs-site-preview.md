---
paths:
  - "docs/concepts.md"
  - "docs/concepts.ja.md"
  - "docs/glossary.md"
  - "docs/glossary.ja.md"
  - "docs/tools/**"
  - "docs/guide/**"
  - "docs/spec/**"
  - "examples/**"
  - "packages/docs-site/**"
  - ".github/workflows/docs-preview.yml"
---

# docs サイトの変更は PR 上でレンダリング結果を読む

**到達状態**: サイトが公開する doc を触る PR に、レンダリング済みの docs サイトが
デプロイされている。URL は Actions の "Docs preview deployed" 表に出る。

`.github/workflows/docs-preview.yml` が `karasu-docs` プロジェクトへデプロイする。
app の preview と違い **URL は 1 階層深い** — サイトは本番と同じ `base: "/karasu/"`
で提供されるので、到達先は `https://<alias>.karasu-docs.pages.dev/karasu/`。
bare host はそこへリダイレクトされる。

- **URL は run summary に出たものを読む**（ブランチ alias は slug 化 + 切り詰めが入る）。
  PR 本文の `## Preview URL` 欄に貼る。
- **AT には書かない。** マージで消えるアドレスなので、手動確認の到達先は公開サイト
  （`https://kompiro.github.io/karasu/`）のまま — `.claude/rules/acceptance.md`。
- 発火条件はサイトが公開する doc（`PUBLISHED_EN_FILES`）と `packages/docs-site/**`。
  公開集合と `paths:` の drift は `pnpm run lint:docs-site-ci-paths-sync` が落とす。
