---
paths:
  - "docs/acceptance/**/*.md"
---

# AT レコードの参照先

**到達状態**: `docs/acceptance/**` のどのファイルも `docs/design/` を指していない。
検証は `pnpm at:check-coverage`（`design-doc references: 0 finding(s)` になる）。

## 設計根拠は Issue で指す

Design Doc は ADR に昇格した時点で削除される（`docs/process.md`
「設計判断を ADR に残すタイミング」）。つまり AT から `docs/design/` を指すと、
**規約上いつか必ず切れるアドレス**を記録に埋め込むことになる（[TPL-2254](../../docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。

代わりに **Issue を指す**。Issue は削除されず、design PR と実装 PR の両方へ辿れる。
ADR が既にあるならそれも併記する:

```markdown
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)
- **設計 (ADR)**: [ADR-2259](../adr/2259-permalink-payload-cap.md)
```

まだ ADR が無い段階（実装 PR 時点）では Issue だけでよい。ADR の番号は起点 Issue
番号と一致する規約（[ADR-2188](../../docs/adr/2188-tpl-issue-number-ids.md)）だが、
**ファイルが存在しないうちにリンクを書かない** — 前方参照は切れたリンクと区別が
つかない。昇格時に `- **設計 (ADR)**: …` を足す。

## 手動項目の到達先は本番 URL

`🧑 Manual` の到達先に、ブランチ名入りの Cloudflare preview URL やローカル起動
コマンドを書かない。前者は PR マージ時に 404 になり、後者は読み手にチェックアウトを
要求する。app は `https://karasu.kompiro.dev/`、docs-site は
`https://kompiro.github.io/karasu/` を書く（`docs/process.md`「手動確認の到達先は
本番 URL で書く」）。同じ TPL-2254 の適用である。
