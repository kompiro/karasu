# i18n as the default for user-facing strings

- **日付**: 2026-04-25
- **ステータス**: 検討中
- **関連**:
  - Issue [#813](https://github.com/kompiro/karasu/issues/813)
  - Issue [#767](https://github.com/kompiro/karasu/issues/767) — deploy empty-state（発端）
  - `docs/design/i18n-support.md` — i18n インフラの全体設計
  - `packages/app/src/i18n/` — i18n ランタイム
  - `packages/core/src/renderer/empty-state-labels.ts` — core への label pass-through

## 背景・課題

`packages/app` には `useTranslation` / `LocaleContext` ベースの i18n インフラが
すでに存在し、`packages/core` の renderer も #767 で `EmptyStateLabels` の
pass-through オプションを受け付けるようになった。

しかし「i18n を使う／使わない」を決めるルールが**書かれていない**ため、
PR レビューのたびにハードコードされた英文がすり抜けて見つかり、
反応的に i18n 化する作業が積み重なっている。代表例:

| 場所 | 文字列 |
|---|---|
| `packages/core/src/renderer/svg-renderer.ts:104` | `"No nodes to render"` |
| `packages/core/src/renderer/all-layers-svg.ts:204,231` | `"No org diagram"` |
| `packages/core/src/renderer/drill-down-svg.ts:135` | `"No org diagram"` |

`emptyState.deploy.*` と `emptyState.org.noTeams` は `EmptyStateLabels` 経由で
すでに翻訳されているのに、上記 3 箇所は同じパターンに乗っていない。
原因はルールが暗黙だから。

このドキュメントの目的は、**「ユーザーに見える文字列はデフォルトで i18n を通す」**
というポスチャを成文化し、新規コードがレビューで弾かれる／既存コードが
opportunistic に潰れていく状態にすることにある。

## 制約・前提

- 既存の i18n インフラ（`packages/app/src/i18n/`）は変えない。
  `Translations` 型に key を足していく方式。
- `packages/core` は単体で配布可能であり続ける必要がある。
  app の翻訳テーブルを直接 import してはならない。
- 既存ロケールは en / ja の 2 つ。新規ロケール追加は本 Issue の範囲外。
- ja に key が欠けた場合は en にフォールバック（実装済み、`translate()` 参照）。
- 「ユーザーに見えない」文字列まで i18n 化するのは過剰。線引きが要る。

## 検討した選択肢

論点が複数あるので、論点ごとに案を立てる。

### 論点 A: 政策ドキュメントの置き場所

#### A-1: `docs/spec/i18n.md` を新設（採用候補）

`docs/spec/` は「構文・仕様リファレンス」と CLAUDE.md で位置付けられている。
i18n の key naming・pass-through 規約・例外条件は仕様の一種なので相性が良い。

- **Pros**: トピックごとに 1 ファイル。`docs/spec/syntax.md` などと並列で見つけやすい。
- **Cons**: 「仕様」というより「開発ポリシー」寄りなので分類が微妙。

#### A-2: `docs/process.md` に節を追加

`docs/process.md` は開発ワークフローのドキュメント。i18n ポリシーも
レビュー時のチェック観点なので process の一部と捉えられる。

- **Pros**: 開発者が一番よく開く場所。
- **Cons**: process.md がさらに長くなる。i18n は具体性が高くて process の他の項目とは
  粒度が合わない（key naming 規約まで書くと浮く）。

#### A-3: `packages/app/src/i18n/README.md` にだけ書く

実装に近い場所に置く案。

- **Pros**: コードを触る人が必ず見る位置。
- **Cons**: core の renderer 側のルール（pass-through）を app の README に書くのは
  責務が逆。横断ルールはトップレベルの docs/ に置きたい。

→ **A-1 を採用**。`docs/spec/i18n.md` を新設し、CLAUDE.md の表に 1 行追加する。
   `docs/process.md` の PR チェック節からは「i18n ポリシーは `docs/spec/i18n.md` 参照」と
   1 行で参照する。

### 論点 B: core 側の英語フォールバックの扱い

現状: `DEFAULT_EMPTY_STATE_LABELS` という const が `packages/core/src/renderer/empty-state-labels.ts`
にあり、app が labels を渡さなかった場合に使われる。

#### B-1: そのまま残す（採用候補）

「app から labels を渡されない」ケースは現実に存在する:
- core を直接ライブラリとして使うサードパーティ
- CLI 経由のレンダリング（`packages/cli`）
- ユニットテスト

これらに対し、core 内に英語の最終フォールバックを置いておくのは妥当。

- **Pros**: core 単体で破綻しない。app を経由しないユースケースをサポート。
- **Cons**: ハードコード英文が core に残ること自体を「臭い」と感じる人がいる。

#### B-2: フォールバックを撤廃し、labels を必須化する

`emptyLabels` を required にして、呼び出し側に必ず指定させる。

- **Pros**: 「core にユーザー向け文字列を置かない」という強い境界が引ける。
- **Cons**: CLI / ライブラリ利用での DX が悪化。テストでも毎回ボイラープレートが要る。

#### B-3: フォールバックは残すが、「最終手段」と明記する

B-1 を維持しつつ、`docs/spec/i18n.md` に
「core の DEFAULT_EMPTY_STATE_LABELS は最終フォールバック。app からは必ず渡す」
と明記する。

→ **B-3 を採用**（B-1 + ドキュメント明記）。
   `DEFAULT_EMPTY_STATE_LABELS` は last-resort という位置づけを文章化するだけで
   挙動は変えない。

### 論点 C: 新しいハードコード文字列を防ぐ仕組み

#### C-1: ドキュメント + レビューチェックリストのみ

`docs/spec/i18n.md` を書き、PR テンプレに「ユーザー向け文字列は i18n 経由か？」
の項目を追加する。lint も test も追加しない。

- **Pros**: 実装コスト最小。
- **Cons**: 人間頼み。今までと同じ漏れが起こる。

#### C-2: ロケール切替テストを追加（採用候補）

`packages/app/src/i18n/index.test.tsx` に近い形で、
「全 diagram 種を ja ロケールでレンダリングし、英文ハードコードが既知リスト以外
出ていない」ことを検証するテストを足す。

具体的には、each diagram type について `compileProject` を ja の labels で呼び、
返ってきた SVG 文字列を `expect(svg).not.toContain("No nodes to render")` 等で
スポットチェックする。

- **Pros**: regression を CI で検出できる。テストとしてのノイズも少ない。
- **Cons**: 全文字列を網羅するのは難しい。スポットチェックに留まる。

#### C-3: 静的解析（oxlint カスタムルール / codemod）

renderer 内で string literal を SVG `<text>` 子要素に直接置くのを禁じる lint。

- **Pros**: 完全な静的検出。
- **Cons**: oxlint のカスタムルール開発コストが高い。誤検出（コメントや属性値）対策も要る。
  本 Issue のスコープに対して投資が大きすぎる。

#### C-4: シンプルな text-grep CI ステップ

`grep -E '<text[^>]*>[A-Za-z]' packages/core/src/renderer/*.ts` のような
quick-and-dirty なチェックを CI に入れる。マッチしたら警告、許可リストで例外管理。

- **Pros**: 実装が小さい。
- **Cons**: 文字列補間（`${labels.deployTitle}`）と裸文字列の区別が難しく、
  許可リストが膨らむ。

→ **C-2 を採用**。最小投資で効果が出る。
   C-3 は将来 i18n の規模が大きくなったら再検討する（本 Issue では実装しない）。

### 論点 D: key naming 規約

すでに事実上の規約はある（`<feature>.<element>.<state>` の dot-separated）。
これを成文化する。

- 名前空間: 機能エリア（`chat`, `settings`, `emptyState`, `warning` など）
- ネスト: 最大 3 段（読みやすさのため）
- パラメータ付き: 値は `(params: { foo: string }) => string`、key 名にパラメータの種類を
  示唆する suffix を付けない（型で表現する）
- 共有 UI（OK/Cancel など）は `<feature>.ok` / `<feature>.cancel` のように feature ごとに
  重複させてよい（短い文字列の重複コストよりも feature 単位で完結する読みやすさを優先）

→ そのまま `docs/spec/i18n.md` に書く。論点なし。

### 論点 E: 「ユーザーに見えない」文字列の例外

以下は i18n 化しなくてよい:

- `DiagnosticCode` などの**識別子**（`unexpected-token-in-block` 等）。表示時は
  i18n 化された message に変換される。
- 内部エラー（`throw new Error("…")`）。ユーザーに `Error.message` を直接見せていない箇所。
- デバッグログ（`console.log`、`console.warn`）。
- テストの fixture / assertion 文字列。
- ADR / docs 内の例示用 inline コード。
- `data-*` 属性、CSS class 名、aria-roleの値（aria-label の値は i18n 必要）。

→ そのまま `docs/spec/i18n.md` に書く。

## 比較

| 論点 | 採用案 | 理由 |
|---|---|---|
| A (置き場所) | A-1: `docs/spec/i18n.md` | トピック別ファイル、CLAUDE.md の表に乗せやすい |
| B (英語フォールバック) | B-3: 残すが last-resort と明記 | core の単体利用を壊さない |
| C (再発防止) | C-2: ロケール切替テスト | 最小投資で regression を CI で検出 |
| D (key naming) | 既存規約を成文化 | 揉めポイントなし |
| E (例外) | 識別子・内部エラー・ログ等 | 線引きを明文化して judgment を減らす |

## 現時点の方針

採用案を組み合わせて以下を実装する:

1. **`docs/spec/i18n.md` を新規作成**:
   - Goal: 「ユーザーに見える文字列はデフォルトで i18n を通す」を 1 行で宣言
   - 場所のルール: app の文字列は `packages/app/src/i18n/{en,ja}.ts`、
     core 渲染器が出す文字列は `packages/app/src/i18n/use-empty-state-labels.ts` のような
     pass-through hook 経由で渡す
   - core の `DEFAULT_EMPTY_STATE_LABELS` は last-resort、app からは必ず渡す
   - key naming 規約（論点 D）
   - 例外リスト（論点 E）
   - 新規 PR のチェックリスト

2. **`CLAUDE.md` のドキュメント表に 1 行追加**:
   `| i18n ポリシー | docs/spec/i18n.md |`

3. **既存の `docs/process.md`** に i18n ポリシーへの 1 行参照を追加（PR チェック節）。

4. **regression テストを追加**:
   `packages/app/src/i18n/locale-coverage.test.tsx`（仮）に、
   既知の diagram type について「ja で compile した SVG に既知の英文ハードコード
   （`"No nodes to render"`, `"No org diagram"`）が含まれない」ことを検証する。
   現時点では fail する（hardcode が残っているため）ので、別 Issue で潰してから
   テストを green にする方針。

5. **既存ハードコードの follow-up Issue を起票**:
   - `svg-renderer.ts:104` "No nodes to render"
   - `all-layers-svg.ts:204,231` & `drill-down-svg.ts:135` "No org diagram"
   - これらは本 PR では i18n 化しない（policy ドキュメントの PR を肥大化させない）。

### この PR の deliverable

- `docs/spec/i18n.md`（新規）
- `CLAUDE.md` の docs 表に 1 行追加
- `docs/process.md` に 1 行参照
- regression テストの skeleton（`describe.skip` で枠だけ用意し、
  既存 hardcode を潰す follow-up Issue で `.skip` を外す）
- follow-up Issue の起票（本 PR とは別、レビュー後）

### アクセプタンステスト

このドキュメントは spec/process 改修なので、自動テストでカバーできる範囲は
regression テスト（上記）のみ。手動確認が必要な項目は無い
（policy ドキュメントの存在は PR レビューで確認できる）。
→ AT 記録は不要。

## やらないこと（Out of scope）

- 既存 hardcode 文字列の i18n 化（follow-up Issue）
- oxlint カスタムルールの開発
- en / ja 以外のロケール追加
- core が直接 i18n テーブルを持つ設計への変更

## ADR 化の提案

policy が固まったらこの design doc は ADR に昇格させる。
「ユーザー向け文字列はデフォルトで i18n、core は pass-through、
英語フォールバックは last-resort」という決定事項は ADR として残す価値がある。
ファイル名候補: `docs/adr/YYYYMMDD-XX-i18n-default-policy.md`。
