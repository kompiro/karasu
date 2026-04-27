---
paths:
  - "docs/adr/**/*.md"
  - "docs/design/**/*.md"
---

# ADR Authoring Rules

ADR（Architecture Decision Record）と、ADR に昇格させる前の Design Doc を
書くときのルール。

## 言語

- **タイトル（frontmatter `title:` + body H1 `# ADR-...:`）は日本語**
- **本文も日本語**（背景・決定・理由・却下した案 など）
- コード例・識別子・固有名詞（`Bun`, `Dependabot`, `Playwright`, `i18n`,
  `OPFS`, `draw.io`, `karasu render` など）は英語綴りのまま残す
- 詳細・経緯は **ADR-20260427-02** 参照

> OSS 化時に ADR タイトル・本文を英語に一括翻訳する想定があるため、
> flowery な日本語表現は避けて素直な訳にする。後で機械的に英訳できる
> 程度に抑えると将来の作業が軽い。

## 構造

ADR の必須要素は `docs/adr/TEMPLATE.md` を参照。frontmatter スキーマと
関係性セマンティクス（`supersedes` / `depends_on` / `related_to` など）の
詳細は `docs/design/adr-knowledge-graph.md` および `pnpm adr:validate` の
バリデータが正となる。

### Frontmatter で必須なもの
- `id`、`title`、`status`、`date`、`topic`
- `topic` は `docs/adr/README.md` の見出しに対応する controlled vocabulary

### 本文で書くべき節
- **背景**: なぜ検討に至ったか
- **決定**: 何を決めたか（一文）
- **理由**: 採用根拠（箇条書き）
- **却下した案**: 検討した代替案と却下理由（必要に応じて）

## 既存 ADR を覆すとき

旧 ADR を書き換えず、新 ADR で `supersedes` する。
- 旧 ADR の `status: superseded` + `superseded_by: ADR-...` を設定
- 新 ADR の `supersedes: [ADR-...]` を設定
- `pnpm adr:validate` が双方向整合をチェックする
- 詳細は `docs/process.md` の「既存 ADR を見直すとき」を参照

## 編集後のチェック

```
pnpm adr:validate          # スキーマ・関係性整合
pnpm adr:check-assumptions # 本文の参照ファイル / 識別子の存在確認
pnpm adr:regenerate        # docs/adr/effective.md, graph/*.md を再生成
```

`adr:regenerate` は派生ファイルの差分を生むので、ADR 本体と一緒にコミット
すること（pre-push の `adr-regenerate-check` がドリフトを検出する）。

## Design Doc → ADR への昇格

`docs/design/<name>.md` で設計検討して合意したら、ADR に昇格させ
`docs/design/<name>.md` を削除する（履歴は PR / Issue で追える）。
昇格時のファイル名は `docs/adr/YYYYMMDD-NN-<name>.md`（NN は同日内連番）。

詳細フローは `docs/process.md` の「設計判断を ADR に残すタイミング」と
`/start-dev` スキルのステップ 9.5 を参照。
