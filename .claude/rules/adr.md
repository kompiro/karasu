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
- 詳細・経緯は **ADR-830** 参照

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

## ADR から karasu 構造へリンクする（permalink）

**到達状態**: frontmatter の `permalink:` が taka 短縮リンク（`short`）と
in-repo `.krs`（`source`、必須）を持ち、`pnpm adr:check-permalinks` が通る。
記録（SoT）は `source` の `.krs` で、permalink はそれを見る pointer
（taka が消えても repo から復元でき、shortener を単一障害点にしない）。

```yaml
permalink:
  - short:  https://taka.kompiro.dev/TkrZQG    # taka 短縮リンク（クリック用 pointer）
    source: examples/payments/system.krs       # 必須: in-repo .krs（記録・復元元）
    view:   system                             # 任意: 既定 view
```

形式違反はバリデータが具体的なエラーで検出するので、ここには書き手が
自分で守るもの（検出不能・warning 止まり）だけを挙げる:

- 生の `/s?s=` payload（数 KB になりうる）は frontmatter にインラインしない。
  復元は `source` から
- 要素ドリルは `source` に anchor を添える（例 `system.krs#krs-system-payment-api`）。
  identity は author-given `id` であり `label` ではない
- repo-backed permalink（`karasu.kompiro.dev/r/...`）を `short` に貼るなら
  **full 40-hex の commit SHA で pin** する（`…@<40-hex>#krs-…`）。
  branch / tag / HEAD / 短縮 SHA は mutable で link rot する。非準拠は
  `adr:check-permalinks` が warning を出すが CI は落とさない
- 本文サマリ表（`## 構造（permalink）`）の自動生成は adr-tools 側 follow-up で
  未実装。当面は手書きしてよい

背景と詳細はツール非依存の L1 guide `docs/guide/adr-permalinks.md` と
[ADR-1829](../../docs/adr/1829-adr-permalink-convention.md) を参照。

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
昇格時のファイル名は `docs/adr/<n>-<name>.md`。`<n>` は **起点の GitHub Issue 番号**、
Issue が無ければ **その ADR を書いた PR の番号**を使う（[#2083](https://github.com/kompiro/karasu/issues/2083)）。
ゼロ埋めしない。GitHub の番号は大域的に一意なので、並行 PR 間で採番が衝突しない
（旧 `YYYYMMDD-NN` 形式では衝突が構造的に起きていた — #1985/#1986、#2086/#2092）。

同じ Issue から 2 本目の ADR を起こす場合は、**Issue 番号はその Issue を最もよく
表す 1 本に与え**、残りは各自の PR 番号を使う。

新規 Design Doc の雛形は `docs/design/TEMPLATE.md` を参照。

詳細フローは `docs/process.md` の「設計判断を ADR に残すタイミング」と
`/start-dev` スキルのステップ 9.5 を参照。

## ADR PR の auto-merge

実装と切り離して ADR のみを記録する PR（昇格 PR・新規 ADR 追記 PR の
どちらも含む）は、`gh pr create` 直後に auto-merge を有効化する。

> この節は「PR のマージはユーザー確認を経る」という本リポジトリの既定運用に
> **優先する明示的な例外**。例外が成立するのは下の適用条件をすべて満たす
> 場合のみで、判定はすべて変更ファイル集合と PR タイトルという観測可能な
> 事実で行う。

```
gh pr merge <pr-number> --auto --squash --delete-branch
```

### 適用条件（すべて満たすこと）

1. PR タイトルが `docs(adr): ` で始まる
2. 変更ファイルが以下の集合のみ（ほかディレクトリの変更が 1 ファイルでも
   あれば対象外）:
   - `docs/adr/**`（新 ADR、`effective.md` / `graph.md` / `graph/*.md` などの
     生成物を含む）
   - `docs/design/<name>.md` の **削除** または **更新**:
     - 削除 — Design Doc 全体を ADR に昇格させて元ファイルを消すケース
     - 更新 — 部分昇格（複数フェーズの一部だけ ADR 化し、残りを Design Doc
       に保持するケース。例: ADR-1168）
3. `gh pr view <N> --json files,title` で 1〜2 を確認した直後にコマンドを
   実行する

### 補足

- `--auto` を使うので CI 完走前にコマンド発行して構わない（GitHub 側が
  required check 通過を待つ）
- リポジトリ設定で `allow_auto_merge=true` 済み
- 適用条件のいずれかが満たされない場合（例: ADR 昇格に伴って `docs/spec/` や
  `packages/**` のファイルが 1 つでも変更ファイル集合に含まれる場合）は例外を
  適用せず、**通常通りユーザー確認を経る**
- ブランチ保護で required check が落ちた場合は通常通り失敗する
  （auto-merge は強制ではなく「揃ったら入れる」セマンティクス）
