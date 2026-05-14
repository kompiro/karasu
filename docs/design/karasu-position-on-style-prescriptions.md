# karasu's position on style-prescriptive warnings

- **日付**: 2026-05-14
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1386](https://github.com/kompiro/karasu/issues/1386) — Design: karasu's position on style-prescriptive warnings (Database-per-Service and friends)
  - 連携 Issue: [#1385](https://github.com/kompiro/karasu/issues/1385) — Cross-file `database` / `queue` / `storage` reopen: define semantics and recommended pattern
  - 親文脈: [#1381](https://github.com/kompiro/karasu/issues/1381) — Multi-file split of a single `system` block
  - 既存 ADR: [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md)（database / queue / storage を first-class に）, [ADR-20260430-01](../adr/20260430-01-security-modeling-stance.md)（セキュリティ / 脅威モデリングは取り込まない — 同じ「視覚化はするが規定はしない」の系譜）, [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md)（実行時認可を取り込まない）
  - 既存 concept セクション: `docs/concepts.md` "Goals and non-goals"、"Domain dispersal detection"
  - 関連ソース: `packages/core/src/resolver/`（診断発行点）, `packages/core/src/fs/import-resolver.ts:287-295`（infra reopen を予定する merge ロジック）

## 背景・問題設定

karasu の `docs/concepts.md` "Goals and non-goals" は、ツールのスコープを「ゆっくり変化する構造的事実（何が存在し、どう関係し、誰が所有するか）を扱う」と明示している。これは「実装詳細や運用状態はスコープ外」というネガティブな側面と表裏一体で、繰り返し議論される非目標（コード生成・DB スキーマ・ランタイムメトリクス・シーケンス図…）はすべて同じフィルタの個別表現として説明されている。

ところが「**スタイル（アーキテクチャ流派）に対する立場**」は、このフィルタからは直接導出できない第二の軸に属する。例えば次のような問いはスコープ判定だけでは答えが出ない:

- ある service が複数 system に重複して登場するのを `external` と区別すべきか
- 同じ domain id が同一 system 内の複数 service 配下に出るのは「警告すべき smell」か単なる事実か
- 同じ `database` id を複数ファイルから reopen して 1 つの DB ノードに収束させるのは「Database-per-Service 違反」として警告すべきか、それとも単に図示すべきか

実態としては、karasu の現在の語彙はすでにいくつかの場所で**スタイルへの暗黙的な立場**を取っている:

- `[external]` annotation — 「ours / theirs」の境界を構文に持ち込んでいる
- `domain-dispersal` warning — 同一 system 内で同じ domain id が複数 service にまたがると warning が出る。文言は "Check the cohesion of the domain." で、明確に DDD の領域結合への nudging
- `duplicate-node-in-system` error（database に対する現状） — S3 children dedup の副作用で「shared DB」パターンが書けない。これは設計判断ではなく、infra reopen 設計 (#1385) で取り除かれる **偶発的な制約**

このうち最後の 1 つは偶発的な事故なので #1385 で除去するとしても、その除去にあたって karasu は「shared DB を見たら何か言うのか・言うとすればどう言うのか」を決める必要がある。同じ問いが他の暗黙的立場（`[external]` / `domain-dispersal`）にも遡及して問われる。

本 design doc は **karasu が「視覚化はするが流派は強制しない」立場を取る**ことを言語化し、それを `docs/concepts.md` / `docs/concepts.ja.md` に短いサブセクションとして残すことで、今後この種の判断（新しい warning を加えるか、register をどうするか）が原理から再導出できる状態にする。

## 制約・前提

- karasu の中心的なフィルタ（slowly-changing structural facts）は変えない。本 design はその上に **stylistic prescription** という独立軸を導入するだけ
- 既に出ている `domain-dispersal` warning や `[external]` annotation を破壊変更しない（文言の微調整は別途検討する）
- `infra-redeclared-across-files`（#1385 で導入予定）の register 決定は本 doc の結論に従う
- 本 doc は概念ドキュメントの増補と新規 diagnostic の register 決定が主目的。**実装変更（resolver 改修や spec 追加）は本 doc のスコープ外**。受け入れ基準にも明記されているとおり、concept update と spec / resolver work は別 PR に分ける

## 提案する立場

karasu は **architecture を「視覚化」する。「規定」はしない**。スタイル流派（Database-per-Service、Bounded Context per Service、Hexagonal、Onion…）への賛否を構文や warning に固定することはしない。代わりに次の 3 つの原則を持つ:

### 原則 1 — Smell は表現できる

ユーザーが書いたものは、たとえ流派の観点で smell と呼ばれるパターンであっても **そのまま図にできる**。`database UserDB` を 3 つの service から参照しても、3 本のエッジが 1 つの DB ノードに刺さる図が描ける。`domain Order` が 2 service にまたがる場合も、両方を描く。

これは「事実を観察できる図」が karasu の核心価値（concepts.md "Goals" の中心）であるため。流派違反として render を拒否すると、現状把握 → 議論 → 再設計、というユースケースの最初の段階が壊れる。

### 原則 2 — Smell は静かに知らせる

ただし、流派の観点で smell とされるパターンを **完全に黙って通過させる** わけでもない。resolver が検知できる範囲で **情報的な diagnostic** を発行する。これは「ツールを使う人がうっかり書いたのか、意図して書いたのか」を分けるシグナルになる:

- 検出名: 構文事実だけで命名する（例: `infra-redeclared-across-files`）。流派の名前（"database-per-service-violation"）は付けない
- 文言: 1 行で「何が起きたか」を述べ、1 行で「これは多くの場合 X というスタイルでは smell とされる」を述べ、参照リンクを 1 つ示す。**判断はしない**
- register: **info**（後述）

文言の register が大事なので、`domain-dispersal` の現文言 "Check the cohesion of the domain." はやや prescriptive 寄りに見える。これは後段の判断 (c) で改めて扱う。

### 原則 3 — Recommended pattern は仕様ではなくドキュメントで示す

`docs/concepts.md` に新規サブセクション **"What karasu visualizes vs. what it doesn't prescribe"**（仮）を追加し、本立場を 1 段落で書いた上で、現存する暗黙的立場（`[external]` / `domain-dispersal` / `infra-redeclared-across-files`）を一覧する。将来の warning 案がここに照らされる:

- そのパターンが事実として無効か → 構文 error
- 構造的事実だが流派の観点で smell か → 本セクション該当 → info diagnostic
- そもそも流派依存の判断か → diagnostic を加えない（karasu のスコープ外）

これにより本 design doc が ADR 化された後も、新規 warning の register 判断が原理から再導出できる。

## 検討した選択肢

### 案 A — 何もしない（infra reopen を error から黙って通すだけ）

**Pro**: 実装変更が最も小さい。ユーザーは何の通知も受け取らない。

**Con**:
- "shared DB" が偶発的に書かれた（ファイル分割で `auth.krs` と `user.krs` の両方で同じ `database UserDB` を宣言してしまった等）ケースでも何も知らされない。バグなのか意図なのかが図からは判別できない
- スタイル prescriptive かどうかを **議論しないまま** infra reopen を出してしまい、後で「Database-per-Service 推奨にしようよ」と提案が出たときに position が無く、毎回原理から議論することになる

却下。

### 案 B — warning を出す（"shared DB is a smell"）

`infra-redeclared-across-files` を `warning` で発行し、文言で "Database-per-Service principle suggests..." と明示する。

**Pro**: 流派に明確な position を取り、ユーザーを正しい方向に nudge できる。

**Con**:
- karasu のスコープ filter（"何が存在するか" を扱う）と衝突する。流派 prescription を入れ始めると、Onion / Hexagonal / DDD layered… と他のスタイル提案が無尽蔵に増える
- 共有 DB は **意図して** 採用されるケースも多い（マイクロサービスへの移行途中、レガシーシステム、リードレプリカ共有、低トラフィックの社内ツール…）。warning がノイズになり、警告抑制タグの議論が始まる
- karasu は「ある」事実を述べるツールであり、「べきでない」を述べるツールにならないという既存 ADR 群（ADR-20260430-01 / ADR-20260511-02）の系譜に反する

却下。

### 案 C — info で静かに知らせる（**採用案**）

`info` という新しい severity を resolver に追加し、`infra-redeclared-across-files` をこれで発行する。文言は事実先行・流派は参考情報:

```
ℹ database "UserDB" is declared in 3 files
  - admin.krs
  - user.krs
  - auth.krs
  Multiple services sharing a database is sometimes called a smell in microservices style.
  See <link to concept section> for context.
```

**Pro**:
- 構造的事実（同じ id が複数ファイルで宣言されている）を客観的に通知できる
- 「shared を意図しているか」をユーザーに考えるきっかけを与える
- 抑制機構（後述）と組み合わせれば、意図的なケースをノイズにせず処理できる
- 既存 `domain-dispersal` も同じカテゴリにリラベルできる（warning → info）

**Con**:
- `info` という新 severity を resolver / LSP / Editor の表示パイプラインに通す必要がある（実装コスト）
- `info` は editor の問題タブで warning ほど目立たないため、見落とされる可能性

実装コストは限定的で、警告の register を細分化する価値の方が大きい。**採用**。

## 解消すべき論点（Issue で問われたもの）

### (a) Diagnostic register: info か warning か → **info を新設して採用**

現状 resolver は `error` / `warning` の 2 段階。本 design では **info を 3 段目として導入**する。

理由:

- `warning` は「直すべきもの」のニュアンスが強く、shared DB を warning にすると prescriptive の領域に入る
- `info` は「気付かせる」ニュアンスで、流派から独立に「事実を述べる」用途に合う
- monaco editor / VS Code の DiagnosticSeverity 4 段階（Error / Warning / Information / Hint）に素直にマップできる
- 将来「ファイル A の `database UserDB` と ファイル B の `database UserDB` は属性が違うが reopen でマージされる」のような **本当に確認してほしい事実通知**にも使える

### (b) `[shared]` のような opt-out tag を導入するか → **入れない**

意図的な共有を `[shared]` annotation で抑制可能にする案が出ているが、次の理由で見送る:

- info は「直すべき」ではなく「気付くべき」シグナル。意図的なケースでも 1 回見ればよいだけで、抑制する強い動機がない
- annotation を増やすほど学習コストが上がる。`[external]` / `[deprecated]` / `[shared]` / … と並ぶと、ユーザーは「どれが構造で、どれが流派で、どれが警告抑制か」が分からなくなる
- 抑制したい場合は LSP / Editor 側で「info を出さない」設定で対応できる（VS Code の `problems.severity` 設定など）。karasu 構文の責務にしない

ただし将来 `[external]` のように **意味の追加** として使うタグ（例: `database UserDB [shared] { ... }` と書くことで「これは複数 service に共有される」と図上で太枠表示する等）は別議論として残す。本 doc では「警告抑制目的の `[shared]` は不採用」とのみ確定する。

### (c) `domain-dispersal` の文言は変えるか → **変える（同じ PR ではない）**

現文言:

```
Warning: domain "Order" is dispersed across multiple services
  - ECommerce
  - Legacy
  Check the cohesion of the domain.
```

問題点:

- `Warning` register と "Check the cohesion of the domain." の文言が DDD の領域結合原則を前提にしすぎている。Database-per-Service と同じく、karasu が「あるべき姿」を述べるかのように読める

提案する変更:

- register を `warning` → `info` に下げる
- 文言を事実先行に変える:
  ```
  ℹ domain "Order" appears under multiple services
    - ECommerce
    - Legacy
    DDD style sometimes calls cross-service domain reuse a smell.
    See <link to concept section> for context.
  ```

ただし本変更は破壊的（既存 AT・既存 examples・既存テスト・i18n キーに影響）なので、本 design doc の PR では **方針として確定するのみ** とし、**実装は別 PR で段階的に行う**。

## concepts.md / concepts.ja.md への追加内容（草案）

本 design doc が approve されたあと、次の subsection を `docs/concepts.md` に追加する（位置は "Goals and non-goals" の直後、`## Domain dispersal detection` の直前を想定）。`docs/concepts.ja.md` にも同等の日本語版を追加する。

```markdown
## What karasu visualizes vs. what it doesn't prescribe

karasu visualizes architecture; it does not prescribe a particular style.
The tool models *what exists* — not what *ought to* exist in some school's
view of "good architecture."

In practice this means karasu will:

- Render any shape the user writes — a database shared across services,
  a domain reused under multiple services, a service marked `[external]`
  pointing back into the system — without refusing to compile.
- Surface **informational** diagnostics (`info`, not `warning`) when it
  detects a configuration that **some styles** consider a smell. The
  diagnostic states the fact and links to a short context note; it does
  not assert that the configuration is wrong.

The following diagnostics are in this category and should be read as
"karasu noticed something — read on if it matters in your context,
ignore if it doesn't":

| Diagnostic | What it observes | Style context |
|---|---|---|
| `domain-dispersal` (info) | Same domain id under ≥ 2 services in one system | DDD considers same-domain dispersal a cohesion warning |
| `infra-redeclared-across-files` (info) | Same `database` / `queue` / `storage` id declared in multiple files | Microservices Database-per-Service treats shared DB as a smell |

Diagnostics here may be added or relabeled over time. The criterion is:
**is this a structural fact that some external style would call a smell?**
If yes → `info`. If it is a fact about karasu's own model (an `id` is
referenced without being declared, a `realizes` points at nothing) →
`error` or `warning` as usual. If it is a style judgment that karasu
itself takes no position on (e.g. "Hexagonal would require this") →
no diagnostic at all.

Why this stance: karasu's center of gravity (see "Goals and non-goals")
is structural facts. Embedding a style preference into core diagnostics
would force karasu to take and re-litigate positions in design schools
that change with the field. Surfacing facts and linking to context lets
the user — who knows the project, the team, and the constraints — judge.
```

`concepts.ja.md` の対応訳は別 PR で同期する（doc 確定 → concept 増補は別 PR、というのが #1386 の受け入れ基準）。

## 影響範囲

- **`docs/concepts.md` / `docs/concepts.ja.md`**: 上記サブセクション追加（**別 PR**）
- **resolver**: `info` severity 追加、`infra-redeclared-across-files` 発行（**#1385 の実装 PR**）。`domain-dispersal` の register / 文言変更は **別 PR**（破壊的変更分離のため）
- **LSP / Editor**: DiagnosticSeverity.Information をマップする（**resolver 変更と同じ PR で問題ない**）
- **i18n**: `info` カテゴリの文字列キー追加。`docs/spec/i18n.md` 更新（**resolver 変更と同じ PR**）
- **AT / TPL**: 既存 `domain-dispersal` AT は文言更新時に追従する。新規 proactive TPL を本 PR で 1 件起こす（次節参照）

## 関連 TPL / 新規 TPL 候補

CLAUDE.md の方針（`docs/concepts*.md` 改訂を伴う PR は proactive TPL を最低 1 件同 PR で起こす）に従い、本 PR では次の TPL を proactive に新規作成する候補が立つ:

- **TPL（仮）**: "新規 resolver diagnostic を追加するときは register（error/warning/info）を本 concept セクションに照らしてから決める"
  - **scope**: `core` (resolver), `core-concepts`
  - **back-ref**: `docs/concepts.md` 新セクション "What karasu visualizes vs. what it doesn't prescribe"
  - **動機**: 過去の `domain-dispersal` のように暗黙的に warning に倒した結果、事実上の prescription として受け取られる事故を防ぐ

ただし、本 design doc 自身が `docs/concepts.md` を直接編集する PR ではない（design → concept update は別 PR）ため、TPL の起票は **concept update PR で行う** のが筋。本 design doc では TPL の候補をメモするにとどめる。

## 未決事項（将来の design / ADR で扱う）

- `[shared]` を「警告抑制」ではなく「**意味の追加**」として導入するかは未決。例えば `database UserDB [shared] { ... }` が描画時に共有 DB であることを明示する太枠表示・凡例追加など。本 doc では「警告抑制目的の `[shared]` は不採用」とのみ確定する
- info severity が editor 側でどの程度目立つべきか（VS Code の Problems tab デフォルト動作、karasu app preview のオーバーレイ）は実装 PR で確定する
- 「style 判断は外部ツールで」のリンク先候補（Backstage の TechDocs、AsyncAPI の "Practices" 等）を context リンクとして提供するか、karasu の concept ページ内で自己完結させるかは concept update PR で確定する

## 次ステップ

1. 本 design doc を PR として出し、ユーザーレビューを得る (`Refs #1386`)
2. approve 後にマージ
3. `docs/concepts.md` / `docs/concepts.ja.md` の subsection 追加 PR（proactive TPL を 1 件同梱）
4. `docs/adr/` への昇格（implementer の判断ではなく、原則昇格 — `feedback_promote_completed_designs_to_adr`）
5. #1385 の実装 PR で `infra-redeclared-across-files` を info で発行
6. `domain-dispersal` の register / 文言変更 PR（独立。スケジュールは未定）
