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

ADR が karasu の構造（共有 URL・レンダリング済み図）へリンクするときの **L2
実装規約**（`@kompiro/adr-tools` 採用 repo = karasu 自身の `docs/adr/` に適用）。
ツール非依存の **L1 portable guide** は `docs/guide/adr-permalinks.md` を、決定の
経緯は [ADR-1829](../../docs/adr/1829-adr-permalink-convention.md) を参照。

**記録（SoT）は in-repo `.krs`**、permalink はそれを見る pointer。karasu は
**taka 短縮リンク + 必須 `source`** を採用する（生の `/s?s=` payload は数 KB に
及びうるため frontmatter にインラインしない）。`source` を必須にすることで、taka が
消えても構造を repo から復元でき、shortener を単一障害点にしない
（[TPL-20260630-03](../../docs/test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)）。

### Frontmatter `permalink:`

frontmatter に `short`（taka）と `source`（必須）を持つ。`view` は任意:

```yaml
permalink:
  - short:  https://taka.kompiro.dev/TkrZQG    # taka 短縮リンク（クリック用 pointer）
    source: examples/payments/system.krs       # 必須: in-repo .krs（記録・復元元）
    view:   system                             # 任意: 既定 view
```

- `short` の宛先は **`/s?s=`（query）形**を短縮したもの。`#s=`（fragment）は
  server に届かず unfurl が死ぬので不可（ADR-1801）。
- 生の `/s?s=` payload は frontmatter に載せない（数 KB になりうる）。復元は
  `source` から。真の ref-pin は #1828。
- deep permalink（要素ドリル）は `source` に anchor を添える（例
  `system.krs#krs-system-payment-api`）。identity は author-given `id`、`label`
  ではない。
- **repo-backed permalink（#1828）を `short` に貼るなら `@<sha>` で pin する**。
  nest resolver（`https://karasu.kompiro.dev/r/<owner>/<repo>[/<path>][@<ref>]`）
  は permissive で、`@` 省略時は default branch HEAD（mutable）を描く。ADR は
  「決定時点の構造」を指すべきなので、**full 40-hex の commit SHA** を付ける
  （`…/r/<owner>/<repo>@<40-hex>#krs-…`）。branch/tag/HEAD/短縮 SHA は mutable で
  link rot する。これは **推奨**であり、非準拠は `adr:check-permalinks` が
  warning で促すが CI は落とさない（[#1959](https://github.com/kompiro/karasu/issues/1959) /
  [kompiro/adr-tools#23](https://github.com/kompiro/adr-tools/issues/23)、下記「検証」参照）。

### 本文サマリ節（生成）

人間がクリックする本文サマリは frontmatter から **adr-tools が生成**する
（手書きしない＝二重メンテなし）。フォーマット:

```markdown
## 構造（permalink）

| 構造 | リンク | source |
| --- | --- | --- |
| system | [図を開く](https://taka.kompiro.dev/TkrZQG) | `examples/payments/system.krs` |
```

### 検証（`pnpm adr:check-permalinks`）

`permalink:` の検証は `@kompiro/adr-tools`（`>=0.0.9`）の **`krs` kind** が担う
（`adr.config.json` の `"permalink": { "kind": "krs" }`、[#1830](https://github.com/kompiro/karasu/issues/1830) /
[kompiro/adr-tools#17](https://github.com/kompiro/adr-tools/issues/17)）。`pnpm adr:check-permalinks`
が各エントリについて次を検査し、**`fail`** が 1 つでもあれば CI を落とす（`warn` は
非-fatal で CI を落とさない）:

- **`source` 必須**（`short` 単独は不可）・**`source` の `.krs` 実在**。（fail）
- **deep anchor の解決** — `source` に `#krs-<view>-<id>` があれば、adr-tools が
  optional peer の `@karasu-tools/core` を lazy import して `.krs` をレンダーし、
  emit されるアンカー集合に含まれるか検証（rename / 削除で dangling した anchor を検出）。（fail）
- **`view` 妥当性**（任意）・**`short` のオフライン形式検査**（http(s) 形か・`#s=`
  fragment でないか。ネットワーク解決はしない）。（fail）
- **repo-backed permalink の `@<sha>` pin 推奨**（`warn`、非-fatal）— `adr.config.json` の
  `permalink.repoBackedHosts`（`["karasu.kompiro.dev", "karasu.pages.dev"]`）に host が
  一致する `short` が full 40-hex SHA で pin されていなければ、`@<sha>` を推奨する warning を
  出す（ref-less / `@HEAD` / `@branch` / `@tag` / 短縮 SHA が対象）。host で判定するため
  route 形（bare / `/r/`）に非依存。**CI は落とさない**（[#1959](https://github.com/kompiro/karasu/issues/1959) /
  [kompiro/adr-tools#23](https://github.com/kompiro/adr-tools/issues/23)）。将来 hard-fail 化するなら config で opt-in。

resolver は built `@karasu-tools/core` を要するため、CI では **`Build (core)` の後**に
実行する（ci.yml の Check job）。本文サマリ表の生成はまだ未実装で adr-tools 側の
follow-up。当面サマリは手書きしてよい。

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
- 適用条件のいずれかが満たされない場合は **通常通りユーザー確認を経る**
- 不安があるとき（例: ADR 昇格に伴って `docs/spec/` や `packages/**` も
  触った）は **必ずユーザーに確認**
- ブランチ保護で required check が落ちた場合は通常通り失敗する
  （auto-merge は強制ではなく「揃ったら入れる」セマンティクス）
