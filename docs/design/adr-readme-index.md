# docs/adr/README.md の手書き一覧をやめ、topic の語彙と生成物への入口にする

- **日付**: 2026-11-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3595](https://github.com/kompiro/karasu/issues/3595)（PR [#3587](https://github.com/kompiro/karasu/pull/3587) で CodeRabbit が ADR-3586 の README 追記を求めたのが発端）
  - 生成物を正本の写しにした決定: [ADR-788](../adr/788-adr-knowledge-graph.md)（frontmatter を正本、`effective.md` / `graph.md` / `graph/*.md` は生成物）
  - 生成物を毎日の再生成 PR で更新する決定: [ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md)
  - 姉妹の作業: TPL の README 表を生成した索引に置き換えた [#3289](https://github.com/kompiro/karasu/issues/3289)
  - topic の見出しと `> Derives from` の同期: `.claude/rules/adr-topics.md`、`scripts/lint/concept-adr-refs.ts`、AT [1389](../acceptance/1389-concepts-adr-topic-refs.md)
  - 関連 TPL: [TPL-2253](../test-perspectives/TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)（「どこからも消す」は検索で閉じる）、[TPL-2005](../test-perspectives/TPL-2005-keystone-terms-single-home.md)（正典は 1 か所）

## 背景・課題

`docs/adr/README.md` の冒頭は「新しい ADR を追加した際は、このインデックスにもエントリを追加すること」と書く。
しかし手書きの一覧は ADR の集合から大きく離れている。

|             | README の一覧 | 実際（frontmatter）                                              |
| ----------- | ------------- | ---------------------------------------------------------------- |
| トピック別  | 146 件        | `effective.md`（accepted かつ非 superseded）450 件               |
| Not adopted | 5 件          | `status: not_adopted` 7 件（ADR-3034 / ADR-3350 が載っていない） |
| 合計の掲載  | 151 件        | ADR ファイル 482 件                                              |

直近の ADR（ADR-3304 / ADR-3381 / ADR-3399 / ADR-3575 / ADR-3586）はどれも載っていない。誰もこの手順を踏んでおらず、
それでも困っていないのは、読者が実際に使う一覧が別にあるからである。ADR-788 が frontmatter を正本にし、
`effective.md`（accepted かつ非 superseded を topic 別に並べる）と `graph.md` / `graph/<topic>.md` を生成物にした。
`CLAUDE.md` も「有効な決定一覧」として `effective.md` を指す。ADR-788 が挙げた課題の 1 つは、まさに
「あるモジュールに関わる現役 ADR だけを抽出する手段が README 目視のみ」だった。

それでも README の一文は残っているので、規則を文字どおり読むレビュアーは追記を求め続ける（#3587 の CodeRabbit）。
2/3 が欠けた一覧に 1 件足しても一覧は正しくならず、手順だけが残る。

## 現状（インベントリ）

README は一覧のほかに、次の 4 つの役割を持っている。一覧をやめても、これらは残す必要がある。

| 役割                            | 中身                                                                         | 誰が使うか                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| topic の見出しと説明            | `### コア概念` で始まる日本語見出しと、各 topic に何を入れるかの 1〜2 行     | `docs/process.md`（「各 topic が何を含むかは README の見出しで判断する」）、`docs/adr/TEMPLATE.md`、`docs/test-perspectives/README.md`、`.claude/rules/adr.md` |
| `> Derives from (\`<topic>\`):` | concepts の節への back-ref                                                   | `scripts/lint/concept-adr-refs.ts` が parse して双方向に検査（`lefthook.yml` の glob にも README が入る）                                                      |
| topic 見出しの同期              | `adr.config.json` の `topics` と見出しが一致する                             | `.claude/rules/adr-topics.md` の到達状態 3                                                                                                                     |
| 手書きの ADR 一覧               | topic ごとの `- [ADR-n](...)` とタイトルの行と「ステータス別 > Not adopted」 | 冒頭の一文が追記を求める。機械的に読むものは無い                                                                                                               |

`concept-adr-refs.ts` が読むのは `> Derives from` の行だけで、一覧の行も H1 も見ない（`parseDerivesFrom`）。
README へ追記を求める指示は、repo 内では README の冒頭の一文だけである（`git grep` で「インデックスにもエントリ」
「README に追加/登録/掲載」「add ... to the README / index」を検索。`.claude/skills` と hane の `design-doc` skill にも無い）。

topic の正本は `adr.config.json` の `topics` で、README の見出しはその日本語の写しである。

## 制約・前提

- `concept-adr-refs.ts` の検査（全 topic に `> Derives from` がある、anchor が concepts に実在する）は通り続けること
- `.claude/rules/adr-topics.md` の到達状態（見出しが topics と一致）は変えない
- 生成物（`effective.md` / `graph.md` / `graph/*.md`）は ADR-3416 の再生成 PR だけが書く。README を生成物にする場合も
  手書き部分（説明・`> Derives from`）と同じファイルに混ざる
- `@kompiro/adr-tools` は別 repo の公開パッケージで、出力先を増やすには adr-tools 側の変更とリリースが要る
- out of scope: topic の追加・改名、`effective.md` の書式、`superseded` 関係の棚卸し

## 検討した選択肢

### 案1: 手書きの一覧と追記の指示をやめ、README を topic の語彙と生成物への入口にする（推奨）

README から ADR の一覧（トピック別の `- [ADR-n]` 行と「ステータス別 > Not adopted」）と冒頭の追記の指示を消す。
残すのは、ADR の置き方（`<n>-<slug>.md`）、topic の見出し・説明・`> Derives from`。各 topic の見出しの下に、
その topic の現役一覧（`effective.md#<topic>`）と依存図（`graph/<topic>.md`）へのリンクを 1 行置く。
`not_adopted` / `superseded` は frontmatter の `status:` を grep する方法を書く。

**メリット**

- 追記する手順そのものが無くなるので、ずれる場所が無くなる。正本は frontmatter 1 か所で、一覧はそこからの生成物だけになる（TPL-2005）
- ADR-788 の「frontmatter を正本、その他は生成物」と同じ線を README にも引く。新しい仕組みを足さない
- topic の語彙・説明・`> Derives from` はそのまま残るので、`process.md` / TEMPLATE / lint / rule の参照はどれも変えずに済む
- 1 ファイルの docs 変更で閉じ、adr-tools のリリースを待たない

**デメリット**

- README を開いただけでは ADR のタイトルが並ばず、1 クリック先の `effective.md` を見る必要がある
- 「Not adopted」を一目で見る面が無くなる（grep の 1 行で代える）

### 案2: README の一覧を再生成 PR で生成する

adr-tools に README の topic 節へ一覧を差し込む出力を足し、ADR-3416 の routine で書く。

**メリット**: README を開くだけで全 ADR のタイトルが並ぶ。

**デメリット**

- `effective.md` と同じ一覧をもう 1 つ作る。同じ情報の生成先が 2 つになり、どちらを読むかの判断が増える
- 手書きの説明・`> Derives from` と生成部分が同じファイルに混ざる。再生成 PR は生成物だけを変える前提
  （`check-generated.ts`、ADR-3416）なので、マーカー区間の扱いを adr-tools と karasu の両方に足す必要がある
- adr-tools の変更とリリースが要る

### 案3: 欠けている 325 件を手で埋め、追記の指示を残す

**デメリット**: 現状を一度だけ直すが、ずれた原因（追記を誰も踏まない手順）は残るので、また同じだけずれる。
今回の 2/3 の欠落自体がその証拠である。

### 案4: README を消し、topic の説明を `adr.config.json` に移す

**デメリット**: `concept-adr-refs.ts`・`lefthook.yml`・AT 1389・`.claude/rules/adr-topics.md`・`process.md` など、
README の見出しを前提にした参照をすべて作り直すことになる。一覧の問題を解くのに対して変更が大きすぎる。

## 推奨案

**案1。** 一覧の正本は ADR-788 の時点で frontmatter と生成物に移っており、README の一覧はその前の時代の名残である。
名残を消して入口だけを残すのが、追記の手順を構造ごと無くす最小の変更になる。案2 は「README を開けば並ぶ」
という利点のために、`effective.md` と重なる 2 つ目の生成先と、手書き・生成の混在を持ち込む。

## 実装の指針

1. `docs/adr/README.md`
   - H1 と冒頭: 「インデックス」をやめ、ADR の置き方・正本（frontmatter）・一覧の場所（`effective.md`、`graph.md`、
     `graph/<topic>.md`）・状態ごとの探し方（`grep -l '^status: not_adopted' docs/adr/*.md` など）を書く。
     追記の指示は消す
   - 「トピック別」: 各 topic の見出し・`> Derives from`・説明を残し、`- [ADR-n]` の行を消す。代わりに
     `effective.md#<topic>` と `graph/<topic>.md` へのリンクを 1 行置く。「1 本の ADR は最も中心的なトピックにのみ掲載」
     の注記は一覧の説明なので消す
   - 「ステータス別」: 節ごと消し、冒頭の探し方に畳む
2. 追記を求める指示が他に無いことを、上の `git grep` を PR でもう一度回して確かめる（TPL-2253）
3. 検証: `pnpm vitest run scripts/lint/concept-adr-refs.test.ts` と `pnpm run lint:concept-adr-refs`
   （lefthook の該当 hook）が通る。README のリンク（`effective.md#<topic>` の anchor、`graph/<topic>.md`）が
   すべて解決する
4. AT は作らない。人の目でしか確かめられない項目が無く、上の検証で閉じる
5. 実装 PR のマージ後、本 Design Doc を ADR-3595 に昇格し、同じ PR で本 Design Doc を削除する

## 未解決の問い

- README に一覧が戻ってこないことを機械で守るか。現時点では足さない。追記の指示を消せば戻す動機が無く、
  `- [ADR-` 行の有無を検査するガードは守る価値に対して重い。再発したら検討する
