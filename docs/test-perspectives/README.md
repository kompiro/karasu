# テスト観点ライブラリ（Test Perspective Library, TPL）

## 目的

karasu で **再発しうる失敗パターン** を、構造化された観点として蓄積する。新機能の DesignDoc 作成時や受け入れテスト設計時に、これらの観点が自動的に参照される状態を作ることが目的。

運用開始の意思決定は [ADR-1192](../adr/1192-test-perspective-library.md) に記録されている。

> **メタ観点**: 個別 TPL とは別に、**全機能 PR に共通して適用するスコープフィルタ** — 「ゆっくり変化する構造的な文脈」フィルタ — は TPL スキーマに載せず、新機能の提案・レビューフェーズで surface する形にしている。原典は [`docs/concepts.ja.md`「非目標 → 共通フィルタ」](../concepts.ja.md)、チェックリストは [feature request Issue テンプレート](../../.github/ISSUE_TEMPLATE/feature-request.yml) と [PR テンプレート](../../.github/PULL_REQUEST_TEMPLATE.md) の "Scope filter" セクションにある。topic / package に紐付かないメタ観点なので TPL スキーマには載せていない（経緯は #1221）。

### 観点の起源 — retrospective と proactive

TPL は **2 つの起源** から生まれる:

- **Retrospective（事後）** — 過去の `bug` / `test-infra` Issue から、実際に起きた失敗を一般化する。バックフィルの主流（初期バックフィルの 17 件）はこの形
- **Proactive（事前）** — `docs/concepts.ja.md` のようなアーキテクチャ原則 / 非目標 / north-star から、**原則が破られたときに起きるであろう失敗** を予測して観点化する（初期の proactive 3 件 — TPL-1207 / TPL-2166 / TPL-2167 — はこの形）

どちらも 3-Yes ルール（次節）と同じ基準で評価する。バグ起源 / 原則起源を分けるのは、観点が防ぐ失敗が起こした時点で既に起きていたかどうかの 1 点で、`discovered_from` の根拠エントリ（`issue:` 以外）に現れる。先頭の `issue:` は採番の起点でどちらの起源でも書くので、起源の目印にはならない（[起源と運用ルールは独立](#起源と運用ルールは独立)）。両方とも同じスキーマ・同じ運用ルールに乗る。

## ADR との違い

- **ADR**: 判断の記録（「私たちはこう判断した」）
- **TPL**: 検証すべき観点の集約（「これを検証すべき」）

ADR が **過去の判断を残す** ためのものに対し、TPL は **未来の検証を促す** ためのもの。両者は frontmatter の `topic` / `scope.packages` を共有しており、同じトピックで横串検索することで「過去の判断」と「検証すべき観点」を同時に発見できる。

## エントリの構造

各 TPL は 1 ファイル = 1 観点で、`docs/test-perspectives/TPL-<n>-<slug>.md` というファイル名規約に従う（[ADR-2188](../adr/2188-tpl-issue-number-ids.md)）。

`<n>` の採番は ADR と同じ優先順位: **起点の GitHub Issue 番号 → その TPL を起こす PR 番号 → local 採番（既存 TPL id の最大値 + 1）**。ゼロ埋めしない。GitHub の番号は大域的に一意なので並行ブランチ間で採番が衝突しない。複数 issue にまたがる TPL は先頭の `discovered_from` の issue を使い、番号が既に他 TPL に使われていれば次の優先順位へ進む。

**起点の Issue は、その TPL を起こした作業の Issue である。** 判断基準は 1 つ、**その作業に Issue があるかどうか**。retrospective なら `bug` / `test-infra` の Issue、proactive なら Design Doc や機能の Issue（その PR の `Refs #N` / `Closes #N`）がそれにあたる。どちらの起源でも `discovered_from` の先頭に `- issue: "#<n>"` と書き、`<n>` をそれに一致させる。PR 番号へ進むのは、作業に Issue が無いときと、その Issue 番号を別の TPL が既に持っているときだけで、proactive であることは PR 番号を使う理由にならない。

### Frontmatter

```yaml
---
id: TPL-<n>
title: "観点を1行で表現"
status: active # active | deprecated
date: YYYY-MM-DD
applicable_to:
  - "再利用可能な抽象パターン（例: KrsFile.systems を消費する機能）"
  - "1 パターン 1 行に分解する（複数の抽象パターンに当てはまるなら複数行）"
known_consumers: # optional — この観点が適用されると判明している具体的な consumer
  - renderer # kebab-case の feature / module 名（grep 可能な形）
  - matrix
discovered_from:
  - issue: "#1234"
  - root_cause_adr: "ADR-<n>" # optional
  - root_cause_file: "path/to/file.ts:LINE" # optional
related_to:
  - TPL-<n>
topic: app-ui # ADR と同じ controlled vocabulary
scope:
  packages:
    - app
---
```

各フィールドの意図:

- **`applicable_to`** — この観点が適用される **抽象パターン**。再利用可能な抽象度で書く。1 行 = 1 パターンに分解し、複数パターンに当てはまる観点なら複数行で並べる。consumer の具体名は書かない（そちらは `known_consumers`）
- **`known_consumers`** — この観点が適用されると判明している **具体的な consumer**（feature / module / package など）。kebab-case で、grep で検索しやすい形にする。union のように consumer 空間が広すぎて列挙が無意味な場合は省略する（フィールドごとオミット）。新たに該当 consumer が見つかったら追記する
- **`topic`** — ADR と同じ controlled vocabulary（`docs/adr/README.md` のセクション見出しを参照）。たとえば: `core-concepts` / `parser` / `resolver` / `renderer` / `edges` / `styling` / `navigation` / `app-ui` / `project` / `chat-ai` / `cli` / `vscode` / `testing` / `build` / `adr-tooling`

### 本文セクション

1. **観点** — 何を検証すべきかを、再利用可能な抽象度で記述する
2. **想定される失敗モード** — この観点が見落とされた場合に、どのような形で失敗が現れるか
3. **チェックリスト** — 新機能の実装/修正時に確認する項目。**3〜5項目に絞る**（多すぎると使われない）。見出しは `## チェックリスト` に固定し、ガードを確かめた項目と判定できない項目にだけ末尾に印を付ける（下の「チェックリスト項目の印」）
4. **既知の対処パターン** — 過去にこの問題を解決した方法
5. **関連テスト** — この観点を検証する既存テストのパス

### チェックリスト項目の印

チェックリストの各項目は、その項目を機械が守っているかを末尾の印で示す（[#3038](https://github.com/kompiro/karasu/issues/3038)、[#3488](https://github.com/kompiro/karasu/issues/3488)）。
読んだその場で「これは CI が守っている / 自分が確かめる」が分かるようにするためである。

```markdown
- [ ] key の dot-segment 数が 4 以下か。 [guard: `packages/i18n/src/catalog.test.ts`]
- [ ] sub-feature を導入するなら、そのまとまりだけで element.state キーが複数生まれるか。 [judgment]
- [ ] dark / light の両テンプレートで同じ kind 集合を揃えているか
```

- **`[guard: …]`**：その項目に**新しい箇所**が違反したとき、CI で動くチェックが赤くなる。ファイル集合の走査、registry の列挙、型レベルの網羅、閉じたクラスの全列挙のどれかであること。元の bug の箇所や既知の consumer だけを固定するテストはガードではなく、「関連テスト」節に書く。手で保守する表を回すテストは、新しい箇所が表に入ることを型・突き合わせ・導出のどれかが強制しているときだけガードになる
- **参照先は、CI の step から辿った呼び出しの終点にあるこの repo のファイル**（テストか、`scripts/` / `packages/*/scripts/` のスクリプト）にする。行番号は付けず、インラインコードスパンでファイル単位に並べる（``[guard: `a`, `b`]``）。設定データや `node_modules` の中はガードではない。終点が外部の実行ファイル（`adr validate` など）のときだけ、その step を持つ workflow を参照先にし、項目の本文で呼ばれるコマンドを名指しする
- **`[judgment]`**：プログラムでは判定できない項目（設計時の意図の判断、人が行為をしたかの問い、repo の外にある対象）
- **印なし**：判定はできるが、まだ機械が守っていない項目。思い出して確かめる必要がある。新しく書いた項目の既定はこれになる
- 印は項目の本文の最後に 1 つだけ置き、前の文と空白で区切る。本文中で印の書式を説明するときはインラインコードスパンに入れる

`[guard: …]` を足すときは、そのガードを開いて上の条件を確かめ、確かめた内容を PR に書く。ガードが
新しい箇所も捕まえるかはプログラムでは判定できないので、TPL を変える PR のレビューが見る。間違った
`[guard: …]` は、守られていない項目を守られていると読ませるので、印が無いより悪い。迷ったら印を付けない。

印から TPL ごとの状態を導出する（TPL に状態を書かない）。

| 状態 | 条件 | 意味 |
| --- | --- | --- |
| `guarded` | 印なし = 0 かつ guard ≥ 1 | 判定できる項目はすべて機械が守っている |
| `partial` | 印なし ≥ 1 かつ guard ≥ 1 | 一部の項目は思い出す必要がある |
| `unguarded` | guard = 0 かつ 印なし ≥ 1 | 判定できる項目をすべて思い出す必要がある |
| `judgment` | すべての項目が judgment | 機械には判定できない。思い出すことが前提 |

状態は `pnpm exec tpl related <topic> --status` と、毎日の再生成 PR が書く索引（[index.md](index.md)）に出る。
項目を印ごとに一覧するには `pnpm exec tpl checklist --marker unguarded` を使う。

## 運用ルール

### 新規エントリの追加タイミング

`bug` または `test-infra` ラベルが付いた Issue が起票されたとき、以下の **3-Yes ルール** で TPL 化を検討する（`test-infra` は E2E flake / fixture / harness の問題で、典型的には testing-topic TPL を生む — 例: TPL-976 / TPL-1171）。

1. 同じ root cause が **別の機能でも発生しうる** か?
2. 構造的なパターンとして **再発する可能性がある** か?
3. 既存の TPL でカバーされていない観点か?

3つすべてが Yes なら新規 TPL として起こす。1つでも No なら個別 Issue として処理して TPL は作らない。

### 既存エントリの更新

新しい Issue が既存 TPL のパターンに該当する場合、その TPL の `discovered_from` セクションに Issue を追記する。チェックリストや「既知の対処パターン」の更新が必要なら、それも併せて行う。

### deprecated への移行

実装の構造変更などで、ある観点が原理的に発生しなくなった場合、`status` を `deprecated` に変更する。エントリ自体は **削除しない** — なぜ deprecated にしたかを末尾に追記する（後から「この観点はなぜ消えたのか」を辿れるようにするため）。validator は `status: deprecated` のエントリ本文に `deprecated` の語を含む rationale を要求する（理由が無いまま deprecated にすると CI で落ちる）。

### 定期 deprecation レビュー

deprecation の **トリガー** は月次の定期レビューで起こす。`active` な TPL を放置すると、構造変更で原理的に発生しなくなった観点がそのまま残り続けるため。

**カデンス**: 毎月 25 日 09:00 UTC に `.github/workflows/tpl-review.yml` が走り、その月のレビュー用 Issue（`TPL deprecation review — YYYY-MM`）を自動作成する。`workflow_dispatch` で手動実行も可能（bootstrap や大きなアーキテクチャ変更直後の ad-hoc 用）。

> なぜ月次か: 当初は週次で回していた（一括 backfill 直後で obsolescence を早く捕捉したかったため）。運用開始から実際に deprecate された TPL は 0 件、2026-W30 / W31 のレビューも全件 `keep` で、週次の Issue はキューのノイズになっていた。当初の「全件 `keep` が安定したら伸ばす」条件を満たしたので、#2094 / #2136 のレビューをもって月次へ緩めた。月次でも全件 `keep` が続くなら半年次を検討し、逆に 1 回のレビューで複数 deprecate が出たら週次へ戻す（cadence 自体も TPL のレビュー対象）。

**Issue の中身**: `tpl review-body --config tpl.config.json` が生成する。冒頭に全 TPL 共通の 3 つの観点が並び、続いて `active` TPL がチェックリストの状態（上の「チェックリスト項目の印」）ごとにまとめられ、状態ごとの問いが付く。`unguarded` / `partial` の TPL には「印の無い項目のうち、新しい箇所の違反で赤くなるガードにできるものはあるか」、`guarded` の TPL には「チェックリストを薄くできるか」、`judgment` の TPL には「プログラムで判定できるようになった項目はあるか」を問う。共通の 3 つの観点は次のとおり:

1. 引用された `root_cause_file` / `root_cause_adr` は今も存在するか? 関数 / パターンは生き残っているか?
2. アーキテクチャの前提が変わっていないか?（例: 「user stylesheet は常に最後」 → 「mode-locked properties は user sheet を bypass する」）
3. この TPL を包含するより新しい TPL があるか?（あれば `superseded_by` として deprecate — ADR と同じ運用）

> 作業ディレクトリに `tpl.config.json` が無く `--config` も渡さないと、生成器は状態を読まずに共通の観点だけを出す。ワークフローと `pnpm tpl:review:body` は、作業ディレクトリに頼らないよう明示して渡している。
>
> 見出しの期間名はワークフローが `--period-label` で渡す（タイトルと同じ暦月）。渡さないと生成器は ISO 週を書き、タイトルと本文が違う期間を名乗る（#2622 が実例。修正は [tpl-tools#20](https://github.com/kompiro/tpl-tools/issues/20)）。ローカルで中身だけ見たいときは `pnpm tpl:review:body`（見出しは ISO 週）で足りる。

**処分（disposition）**:

- **keep** — 今も妥当。編集不要
- **update** — 観点は妥当だが、チェックリスト / 既知の対処 / 関連テストの refresh、または項目の印の見直し（ガードができた項目に `[guard: …]` を付ける、ガードが消えた項目から外す）が必要
- **deprecate** — root cause が構造的に消滅。`status: deprecated` にして末尾に rationale を追記（前節 "deprecated への移行" の手順）

**完了処理**: レビューが終わったら、Issue にディスポジションのサマリ（例: `keep: 18 / update: 1 / deprecate: 1`）をコメントしてクローズする。

### Validator

frontmatter、チェックリストの印、本文が名指しするソースパスは **`pnpm tpl:validate`** で機械的にチェックされる。pre-push の lefthook（glob なし）と、Required な `Check` の両ジョブ（`.github/workflows/ci.yml` と `.github/workflows/at-check-coverage.yml`）で自動実行されるが、ローカルで先に確認したいときも同じコマンドで走る。

検査内容:

- ファイル名が `TPL-<n>-<slug>.md` で frontmatter `id` と一致すること
- `id` が corpus 内で一意であること（並行ブランチが同じ id を採番した衝突をマージ時に検出する — `tpl-tools` 0.0.7 の `duplicate-id`、[#2188](https://github.com/kompiro/karasu/issues/2188)）
- 必須フィールド（`id` / `title` / `status` / `date` / `applicable_to` / `discovered_from` / `topic` / `scope.packages`）の存在
- `status` が `active` / `deprecated` のいずれか
- `topic` が `tpl.config.json` の controlled vocabulary（ADR と同一の語彙を複製）に含まれること
- `applicable_to` / `discovered_from` が非空、`discovered_from` の各エントリは既知 key（`issue` / `root_cause_adr` / `root_cause_file`）のみを持つこと
- `related_to` が指す TPL が同ディレクトリに存在すること
- `scope.packages` が `packages/` 配下の実在ディレクトリを指すこと
- `status: deprecated` のエントリ本文に deprecation rationale が含まれること
- `## チェックリスト` 節があり、項目が 1 つ以上あること（`tpl.config.json` の `checklistHeading`）
- 項目の印の書式（末尾に 1 つだけ、前に空白、後ろに何も無い、`[guard: ]` が空でない）と、`[guard: …]` の各パスが `--source-prefix` のどれかから始まる実在のファイルであること（行番号・glob・ディレクトリは不可。`<!-- absent-path-next-line: … -->` で黙らせることもできない）
- 本文のインラインコードスパンが名指しする `packages/…` / `scripts/…` のパスが working tree に実在すること。不在が正しい場合（履歴・例示）は直上の行で `<!-- absent-path-next-line: <理由> -->` と宣言する。宣言は逆向きにも検査され、理由が空、または次行のパスが全部実在するようになると落ちる（[#2810](https://github.com/kompiro/karasu/issues/2810)）

索引（[index.md](index.md)）は検査しない。`tpl.config.json` の `"indexCheck": false` が止めている。索引は
毎日の再生成 PR が書くので、TPL を足した直後の PR では古いか、まだ無いのが正常である。索引が TPL と
一致していることは、再生成 PR の `Validate` が生成し直した結果と比べて確かめる（[#3289](https://github.com/kompiro/karasu/issues/3289)）。

実装は外部パッケージ [`@kompiro/tpl-tools`](https://github.com/kompiro/tpl-tools)（`tpl validate` サブコマンド）。`pnpm tpl:validate` は `--config tpl.config.json` を渡し、`--packages-root packages` で `scope.packages` を、`--source-prefix packages --source-prefix scripts --source-prefix .github` で本文のソースパスとガードのパスを検証している（karasu#1357 で切り出し、#2810 で本文の照合を移管）。`docs/{acceptance,design}` 側の同じ検査は `pnpm run lint:record-source-paths` が持つ — 1 ディレクトリ 1 オーナーで、二重には走らせない。

> **なぜ ADR と config を分けているか**（karasu#2083 → #2188）
> `tpl-tools` と `adr-tools` は同じ config キー `idFormat` を読む。分離当時
> （ADR-2092）は ADR が `issue-number`、TPL が `date-sequence` と形式が異なる
> ことが分離の理由だった。#2188 で TPL も `issue-number` へ移行し形式は揃ったが
> （ADR-2188）、ツールごとに config を分けておく構造は維持している — 片方の
> ツール設定変更がもう片方を巻き添えにしない、という分離の実利は形式が同じでも
> 変わらないため。
>
> `topics` は両ファイルに複製されている。**ADR 側に topic を足すときは
> `tpl.config.json` にも同じ値を足すこと** — 差分は `pnpm lint:config-topics-sync`
> が検出する。

### Related TPL クエリ

DesignDoc を書くとき、該当 `topic` の active TPL を一覧したい場合は **`pnpm tpl:related <topic> [--package <pkg>]`** を使う。出力は markdown のリストで、そのまま DesignDoc の「Related TPLs」セクションに貼り付けられる:

```
$ pnpm tpl:related app-ui
- [TPL-1053](docs/test-perspectives/TPL-1053-continuous-input-dom-interference.md) — ユーザーの連続操作中は DOM / state を破壊する別系統の処理を抑止する
- [TPL-1032](docs/test-perspectives/TPL-1032-derived-state-staleness.md) — 派生 view / panel の memoization は source state の変化次元すべてを key に含める
- [TPL-948](docs/test-perspectives/TPL-948-event-handler-ui-restructure.md) — UI 構造を変える event handler は次描画でマウントされる target への event 漏れを防ぐ

$ pnpm tpl:related renderer --package core
- [TPL-999](docs/test-perspectives/TPL-999-implicit-data-filtering.md) — データ表示の暗黙フィルタ（宣言漏れ / resolver / null 戻り）を全経路で確認する
- [TPL-1001](docs/test-perspectives/TPL-1001-display-mode-cross-surface.md) — 表示モード / グローバルレンダリング切替は全描画面の点検と precedence 設計が必要
```

active なエントリのみが表示される（deprecated はクエリで除外）。`<topic>` が ADR vocabulary 外でも warning 付きで実行はする — 新トピック導入時の事前確認に使えるように。実装は `@kompiro/tpl-tools` の `tpl related` サブコマンド。

## TPL のライフサイクル

TPL は以下のライフサイクルを持つ。**proactive を先に書ければ書けるほど、retrospective に学ぶしかない bug が減る**。

```
concept (docs/concepts.ja.md / ADR)
   │
   │   原則を実装に落とすときに違反しうる観点を抽出
   ▼
proactive TPL  ← 開発前に書く（予防可能な学習）
   │
   ▼
development (DesignDoc + 実装)
   │
   ▼
bug (proactive TPL でカバーできなかった失敗)
   │
   │   実際に起きた失敗を一般化
   ▼
retrospective TPL  ← bug 修正と同じ PR で書く（不可避な学習）
```

### 非対称性

- **proactive TPL** は **予防可能** な学習。書ければ bug を未然に防げる
- **retrospective TPL** は **不可避** な学習。起きてからしか書けないが、起きたら必ず書く（同じ bug を 2 回起こさない）

retrospective TPL を書くたびに「**この観点を proactive TPL として書いておけたか?**」を自問する。書けたはずなら、それは「**proactive スキャンの漏れ**」自体が次回への学びになる（ただし TPL として記録するわけではなく、レトロスペクティブの素材として扱う）。

### 起源と運用ルールは独立

proactive / retrospective の区別は **起源** の違いだけで、frontmatter スキーマも 3-Yes ルールも運用ルール（更新 / deprecated）も同じ。判断基準は 1 つ、**その TPL を起こした時点で、観点が防ぐ失敗が既に起きていたかどうか**:

- 起きていた（失敗を一般化した）→ retrospective。根拠エントリは失敗した箇所（コードの `root_cause_file`、`bug` / `test-infra` の Issue）を指す
- まだ起きていない（原則から予測した）→ proactive。根拠エントリは原則側（`root_cause_file: docs/concepts.*` / `docs/spec/*`、`root_cause_adr`）を指す

個々のフィールドや Issue のラベルは起源を決めない。原則側の根拠は `docs/concepts.*` に限らず spec や ADR でもよく（TPL-2585 / TPL-2993 は ADR が根拠）、`bug` Issue の設計作業から proactive TPL が生まれることもある（TPL-2631 は `bug` の #2631 の設計 PR で起こした proactive）。

**`issue:` は起源の種別ではなく採番の起点**なので、どちらの起源でも先頭に書く（[エントリの構造](#エントリの構造)）。proactive TPL の `issue:` は、それを起こした Design Doc や機能の Issue を指す。`issue:` を持たないのは、Issue の無い作業で起こした TPL だけである（[ADR-2188](../adr/2188-tpl-issue-number-ids.md) の移行時に PR 番号 / local 採番で番号を振った TPL-1207 / TPL-2166 / TPL-2167 など）。

## 参照タイミング

- **DesignDoc 作成時**: 以下の 2 段階で観点を取り込む:
  1. 該当する `topic` / `scope.packages` の **既存 TPL** を一覧する
  2. 同じ `topic` の `docs/concepts.ja.md` セクションと関連 ADR を読み、**まだ TPL になっていない原則** で今回の設計が違反しうるものがないか確認する。あれば 3-Yes ルールに照らして proactive TPL を起こす（同じ PR で起こすのが最も摩擦が少ない）
- **新機能の実装時**: 受け入れテストの項目を作る前に該当 TPL のチェックリストを確認する
- **bug 修正時**: 同じパターンの TPL がすでに存在しないか確認し、あれば `discovered_from` に追記する。なければ 3-Yes ルールで retrospective TPL の新規作成を検討する。**併せて「この bug は proactive TPL を書いていれば防げたか?」も自問する**（防げた場合、それ自体が次のレトロスペクティブの素材）

## 繰り返し現れる対処パターン

複数の TPL の「既知の対処パターン」節を横断すると、**同じ shape の解決策** が繰り返し提示されている。これらは単独の観点ではなく、複数の観点に共通する **メタパターン** として、新しい TPL を書くときにまず候補に挙げる価値がある。

ここに載せるのは「**3 つ以上の TPL で同じ対処が出現したもの**」だけ。1〜2 件の偶然をパターン化すると、本来別々の問題を一括りにする圧力が生まれてしまう。

### 1. 共通 helper / fixture への抽出

duplication が複数箇所に分散していて drift の温床になっている場合、**共通 helper / 共通 fixture / 共通 base interface** に集約する。drift が再発する限り、ローカル fix では何度も同じ shape のバグが立ち戻ってくる。

現時点の evidence:

- [TPL-1001](TPL-1001-display-mode-cross-surface.md) — 共通アセット（pictogram など）を「id → 単一ソース」の解決関数に集約
- [TPL-219](TPL-219-parallel-function-parity.md) — 並列関数ファミリの差を共通 helper に抽出（`buildStyles` のような形）
- [TPL-74](TPL-74-ast-parser-renderer-agreement.md) — ノード共通フィールドを `BaseNodeFields` に集約、parser の keyword 処理を共通関数に
- [TPL-976](TPL-976-e2e-fixture-controlled-state.md) — 既存 fixture（`anthropic.ts` の locale pin）を他 fixture にテンプレ展開
- [TPL-1171](TPL-1171-wait-for-stable-state.md) — Monaco の async mount 操作を fixture helper（`replaceEditorContent`）に集約
- [TPL-1024](TPL-1024-dev-vs-packaged-mode-parity.md) — 候補パス配列 + `find(fs.existsSync)` の解決ロジックを 1 箇所に

**使わないケース**: duplication がまだ 2 箇所しかなく、抽象化すると形が決まりすぎて将来の divergence を阻害する場合。3 箇所目で再評価する（rule of three）。

### 2. 境界では principled / safe variant をデフォルトにする

trust boundary / consumer 境界 / 入出力境界では、**便利な変種ではなく原則的な変種** をデフォルトにする。便利な変種を選ぶと、限定された前提（single-file / sync only / 信頼できる input）の外側で silent に挙動が壊れる。

現時点の evidence:

- [TPL-976](TPL-976-e2e-fixture-controlled-state.md) — テスト boot は `page.goto("/")` ではなく fixture 経由をデフォルト（fixture が wipe / seed / locale pin を担保）
- [TPL-239](TPL-239-convenience-vs-principled-api.md) — consumer 境界では convenience API（`compile`, `parse`）ではなく principled API（`compileProject`, `parseAsync`）をデフォルト
- [TPL-168](TPL-168-trust-boundary-input-validation.md) — 外部入力は受け取った時点で validate / canonicalize する（downstream の incidental mitigation に頼らない）

**使わないケース**: principled variant が genuinely overspec で、convenience を選ぶ理由を Design Doc / コメントで言える場合。境界の内側（純粋な internal helper）では convenience でよい。

### 3. Negative test を regression fence にする

「**起きてはいけないこと** が起きないことを assert する test」を 1 件以上必ず置く。positive test（期待通り動く）だけでは、validation の不在 / 過剰一致 / 暗黙の許可が表面化しない。

現時点の evidence:

- [TPL-907](TPL-907-cross-reference-validation.md) — **正しい参照に warning が出ない** 反対方向の test
- [TPL-976](TPL-976-e2e-fixture-controlled-state.md) — retry-pass を `failed` と同等に集計、**flake が隠蔽されない** ことを担保
- [TPL-1171](TPL-1171-wait-for-stable-state.md) — `retries=0` で通らないテストを「隠れ flake」として可視化
- [TPL-168](TPL-168-trust-boundary-input-validation.md) — traversal 試行 / injection 試行 / null byte / 巨大入力の **negative test** を回帰テストに必ず 1 件

**使わないケース**: positive test だけで boundary が完全に枚挙できる場合（pure function で input 集合が小さく、全列挙できるなど）。多くの実コードでは該当しない。

### このリストの拡張ルール

新しい対処パターン候補が出てきても、**3 つ以上の TPL で同じ shape が確認できるまで** はここに追加しない。1〜2 件はまだ「特定の問題に対する個別解決」かもしれず、メタパターンとして固定すると過剰一般化のリスクがある。逆に、ここに載っているパターンの 4 件目以降の evidence は、新しい TPL を書くときに自然と既知パターンへ整理されていく。

## Fit / Gap 分析 — TPL を使って既存テストの不足を可視化する

TPL のチェックリストは「これを確認するべき」という観点だが、**実際にそれが既存テスト / AT で exercise されているか** は時間が経つと曖昧になる。Fit / Gap 分析は、TPL のチェックリスト項目を `packages/**/*.test.ts` と `docs/acceptance/*.md` にマッピングして、未カバーの項目（gap）を Issue として可視化する作業。

### 目的

- 既存 TPL が **実装上どこまで保証されているか** を点検する
- bug 起源の TPL について「同じ root cause が再発したら test が落ちるか?」を確認する（regression fence の二重チェック）
- 新規 AT / unit test の追加候補を機械的に抽出する

### いつやるか

- **ある topic の TPL が 3 件以上たまったタイミング** が最初の自然な timing。それ以下だと analysis のコストが overhead を上回る
- 大きな refactor の **直後**（テスト構造が変わった可能性があるため）
- 半期 deprecation review (#1217 で導入した workflow) の **次のステップ** として併走させてもよい

### 手順

per-topic で 1 つずつ進める。一度に全 topic を audit すると 200 行超の matrix になって誰も読まなくなる。

1. **対象 topic を選ぶ** — 関連 TPL が 3 件以上 / 過去 bug が集中している / 関連テストが豊富、のいずれかを満たす topic から始める
2. **scope を確定** — `pnpm tpl:related <topic>` で TPL を一覧、対応する `packages/**/*.test.ts` と `docs/acceptance/*.md` を grep で集める
3. **チェックリスト × テストのマッピング** — 各 TPL の「チェックリスト」節の項目を 1 つずつ取り、それを exercise するテストを洗い出す。3 段階で評価する:
   - ✅ Covered — チェックリスト項目を直接担保するテストが存在
   - 🟡 Partial — 隣接する coverage はあるが項目の一部が未網羅
   - ❌ Gap — その項目を exercise するテストが見当たらない
4. **gap を抽出して Issue 化** — 各 gap に G\<TPL-NN\>-\<seq\> 形式の ID を振り、TPL ID + チェックリスト項目への明示的なリンクを含めて Issue を起こす
5. **PR description に matrix を残す** — 分析結果（matrix と gap list）はその場の作業ログとして保存し、後で同 topic を再 audit するときの差分元にする

### 出力フォーマット

レポートは以下の 2 部構成:

**Part 1: Coverage matrix** — TPL × チェックリスト項目 × ステータス × evidence (テストファイル / 行) × gap ID。

| TPL / 項目     | Status         | Evidence        | Gap        |
| -------------- | -------------- | --------------- | ---------- |
| TPL-XX (1) ... | ✅ \| 🟡 \| ❌ | foo.test.ts:NNN | — \| GXX-N |

**Part 2: Gap list** — 各 gap について「観点」「根拠」「優先度」「scope」を 1 ブロックで。Issue 化するときはこの形式をそのまま本文に転載できる。

### 実施済み事例

全 23 TPL を持つ全 topic の Fit/Gap 分析を完了（2026-05-10〜11）。抽出された全 25 gap の tracking issue は [#1276](https://github.com/kompiro/karasu/issues/1276)。

| 実施日     | Topic                                     | TPL 件数                                                 | Gap 件数 | Issues                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------- | -------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-10 | [parser](#fit-gap-parser)                 | 3 (TPL-1101 / TPL-907 / TPL-74)                          | 4        | [#1231](https://github.com/kompiro/karasu/issues/1231) [#1232](https://github.com/kompiro/karasu/issues/1232) [#1233](https://github.com/kompiro/karasu/issues/1233) [#1234](https://github.com/kompiro/karasu/issues/1234) |
| 2026-05-10 | [app-ui](#fit-gap-app-ui)                 | 3 (TPL-1053 / TPL-1032 / TPL-948)                        | 4        | [#1238](https://github.com/kompiro/karasu/issues/1238) [#1239](https://github.com/kompiro/karasu/issues/1239) [#1240](https://github.com/kompiro/karasu/issues/1240) [#1241](https://github.com/kompiro/karasu/issues/1241) |
| 2026-05-11 | [renderer](#fit-gap-renderer)             | 2 (TPL-999 / TPL-1001)                                   | 3        | [#1245](https://github.com/kompiro/karasu/issues/1245) [#1246](https://github.com/kompiro/karasu/issues/1246) [#1247](https://github.com/kompiro/karasu/issues/1247)                                                        |
| 2026-05-11 | [edges](#fit-gap-edges)                   | 2 (TPL-510 / TPL-1227)                                   | 3        | [#1248](https://github.com/kompiro/karasu/issues/1248) [#1249](https://github.com/kompiro/karasu/issues/1249) [#1250](https://github.com/kompiro/karasu/issues/1250)                                                        |
| 2026-05-11 | [core-concepts](#fit-gap-core-concepts)   | 5 (TPL-1160 / TPL-1207 / TPL-2166 / TPL-1223 / TPL-1225) | 3        | [#1260](https://github.com/kompiro/karasu/issues/1260) [#1261](https://github.com/kompiro/karasu/issues/1261) [#1262](https://github.com/kompiro/karasu/issues/1262)                                                        |
| 2026-05-11 | [cli](#fit-gap-cli)                       | 2 (TPL-239 / TPL-168)                                    | 2        | [#1268](https://github.com/kompiro/karasu/issues/1268) [#1269](https://github.com/kompiro/karasu/issues/1269)                                                                                                               |
| 2026-05-11 | [testing](#fit-gap-testing)               | 2 (TPL-976 / TPL-1171)                                   | 2        | [#1270](https://github.com/kompiro/karasu/issues/1270) [#1271](https://github.com/kompiro/karasu/issues/1271)                                                                                                               |
| 2026-05-11 | [vscode](#fit-gap-vscode)                 | 1 (TPL-1024)                                             | 1        | [#1272](https://github.com/kompiro/karasu/issues/1272)                                                                                                                                                                      |
| 2026-05-11 | [build](#fit-gap-build)                   | 1 (TPL-219)                                              | 1        | [#1273](https://github.com/kompiro/karasu/issues/1273)                                                                                                                                                                      |
| 2026-05-11 | [navigation](#fit-gap-navigation)         | 1 (TPL-1094)                                             | 1        | [#1274](https://github.com/kompiro/karasu/issues/1274)                                                                                                                                                                      |
| 2026-05-11 | [resolver](#fit-gap-resolver)             | 1 (TPL-2167)                                             | 1        | [#1275](https://github.com/kompiro/karasu/issues/1275)                                                                                                                                                                      |
| —          | styling / chat-ai / project / adr-tooling | 0                                                        | —        | TPL なし、audit 対象外                                                                                                                                                                                                      |

<a id="fit-gap-parser"></a>**parser (2026-05-10)** — bug 起源の TPL に対する regression は core 系で完備だが、AST 構造的等価 / i18n 出力 / parser keyword の exhaustiveness / spec ↔ impl smoke が未カバー。

<a id="fit-gap-app-ui"></a>**app-ui (2026-05-10)** — EditorPane / ProjectSelector の TPL 起源 bug は強い regression を持つ一方、**#1032 (NodeDetailPanel stale on reopen) の regression test が空白**。他の text input UI (ChatPane / PasteCompareDialog / SettingsPane) と inline editor (ChatPane / PasteCompareDialog) は audit 未実施。cross-surface 整合性の integration test 不在。

<a id="fit-gap-renderer"></a>**renderer (2026-05-11)** — #279 cascade priority は 6 case で異常に強いが、**#183 (Full View displayMode threading) は useFullViewSvg.test.ts が存在せず regression なし**。icon card と NodeDetailPanel の pictogram cross-surface 整合性も per-surface 単位で個別 mock のため未保証。

<a id="fit-gap-edges"></a>**edges (2026-05-11)** — `[implicit]` と `[async/sync]` の coexistence integration / 派生関数の semantic 保存契約の meta-test / owns / inherited annotation の cross-view rendering integration が未カバー。AT-0056 が automation marker を持たないことが判明。

<a id="fit-gap-core-concepts"></a>**core-concepts (2026-05-11)** — 5 TPL 中 **3 つ (TPL-1207 / TPL-2166 / TPL-1223) はほぼ完全に proactive** で「設計時 review」型の checklist 項目しか持たず、test gap として現れなかった（後述「proactive TPL は backward gap を出さない」）。残る retrospective な TPL-1160 と一部 testable な TPL-1225 から 3 gap: TPL-1160 の `known_consumers` のうち deploy-view / org-view が top-level handling を test していない / #412 (named import → system membership) の regression fixture 不在 / 三面（論理+物理+組織）を 1 fixture に含む cross-face integration test 不在。

<a id="fit-gap-cli"></a>**cli (2026-05-11)** — `resolveKrsFile` の path traversal は 6 case で網羅 ✅。gap 2 つ: render-endpoint.ts の `/render` HTTP endpoint が single-file `compile()` を使っており multi-file 解決ができない (#239-style) / vscode preview-panel.ts の webview message handler が `url` / `index` を validation なしで受け取る（trust boundary 検証なし）。

<a id="fit-gap-testing"></a>**testing (2026-05-11)** — `page.goto("/")` migration 完了 ✅ (0 hits)、locale pin ✅、e2e-nightly.yml ✅、replaceEditorContent helper ✅、retries=1 in CI（推奨通り）✅。gap 2 つ: migration を再 creep させない lint rule が無い / retry-passed (flaky) test を CI で surface する仕組みが無い。

<a id="fit-gap-vscode"></a>**vscode (2026-05-11)** — TPL-1024 起源の #1024 修正が **comprehensive**（多候補パス解決 + bundling step + e2e で installed 動作検証）で、実質 gap がほぼ無い。残る 1 つ: `pnpm build` 後に `out/server.js` が存在することの fast unit-level check（bundling step が壊れても dev-tree fallback で local は動くため vscode-e2e でしか検出できない）。

<a id="fit-gap-build"></a>**build (2026-05-11)** — compileProject / compileProjectOrgView は #160 fix で parity ✅、drill-down / multi-level は `buildStyles` 共通化済み (#219) ✅。gap 1 つ: SVG builder family を同一 fixture + 同一 styleSource + 同一 displayMode で呼んで挙動一致を assert する family-wide parity test が無い（TPL-219 checklist 項目 5）。

<a id="fit-gap-navigation"></a>**navigation (2026-05-11)** — buildHash/parseHash は 15+ case（matrix 含む）✅ (#1094)。gap 1 つ: useHistoryNavigation.ts が依然 if-else chain で `activeView` の網羅性が型強制されていない — #1094 の修正は matrix case を追加したが構造的 exhaustiveness は未達。

<a id="fit-gap-resolver"></a>**resolver (2026-05-11)** — domain-dispersal の id-vs-label は双方向 test 完備 ✅、他 detector も `.id ===` を一貫使用 ✅。gap 1 つ（低優先度）: identity-comparison を行う全 detector を curated table で列挙し各々が id-based であることを assert する meta-test が無い（discipline は守られているので予防的措置）。

### 横断観察 — topic 横断で見えた繰り返しパターン

複数 topic で繰り返し抽出された **gap の解決パターン** が 2 つあり、いずれも rule of three を満たしている。前述の「繰り返し現れる対処パターン」は TPL 本文の「既知の対処パターン」節を集約したもの（実装者向けの recommendations）に対し、こちらは **gap の test 設計に共通する shape**（テスト追加者向けの recommendations）。混同しないよう別建てで扱う。

#### 観察 A: curated table for meta-checks across structurally-recurring family

「すべての X について Y を確認する」型のテストが必要なとき、curated table（明示的な配列で対象を列挙）+ 各エントリで same-shape の assertion を実行する形が繰り返し採られている（**6 instance**）:

- [#1233](https://github.com/kompiro/karasu/issues/1233) **G12-1** — parser keyword exhaustiveness（BaseNodeFields × kinds）
- [#1241](https://github.com/kompiro/karasu/issues/1241) **GA08-2** — cross-surface timing alignment（panels × source state）
- [#1247](https://github.com/kompiro/karasu/issues/1247) **GR06-2** — displayMode-consuming surfaces（render entry points × modes）
- [#1249](https://github.com/kompiro/karasu/issues/1249) **GE07-2** — derivation contracts（derivation paths × preserved attrs）
- [#1273](https://github.com/kompiro/karasu/issues/1273) **GB11-1** — SVG builder family parity（builders × params）
- [#1275](https://github.com/kompiro/karasu/issues/1275) **GR20-1** — identity-comparison sites use id（detectors × id-vs-label）

採用理由: TS reflection / 自動 discovery より explicit な table のほうが code review で auditable である。ただし**表そのものは、新しいエントリが追加されても表の編集を強制しない。** 表への登録を型・表とコードの突き合わせ・導出のどれかで強制したときに限り、explicit な表は新しい箇所も捕まえるガード（`[guard: …]`）になる。#1233 の `packages/core/src/parser/base-node-fields-coverage.test.ts` は型の契約で全 kind の登録を強制しているのでガードになる。ただしこの契約は、表の型注釈が各エントリの `kind` を広げたせいで、どんな表でも成り立つ空の契約になっていた（`entity` の fixture が無くても通った。#3589 で直し、契約が空にならないことも型で固定した）。**登録を強制する仕組みは、それ自体が効いていることを確かめないと、表と同じく黙ってすり抜ける。** 一方、#1249 の `packages/core/src/view/derivation-contracts.test.ts` は登録を忘れたエントリがすり抜けると自ら書いているので、元の箇所を固定するだけに留まる（[#3038](https://github.com/kompiro/karasu/issues/3038)）。**新しいファミリの meta-check が必要になったら、curated table に登録を強制する仕組みを添えた形を default の選択肢に置く**。

#### 観察 B: per-layer-strong / cross-layer-weak ギャップ

各層（parser / resolver / renderer / panel）が個別に強くテストされているが、**層を跨ぐ contract が implicit** で integration test が空白という gap が繰り返し見つかった（**7 instance**）:

- [#1238](https://github.com/kompiro/karasu/issues/1238) **GA08-1** — NodeDetailPanel stale on reopen（resolver は ✅ だが panel との integration ✗）
- [#1245](https://github.com/kompiro/karasu/issues/1245) **GR06-1** — Full View displayMode threading（buildExportSvg 単独は ✅ だが useFullViewSvg との integration ✗）
- [#1250](https://github.com/kompiro/karasu/issues/1250) **GE23-1** — owns / inherited annotation cross-view rendering（resolver は ✅ だが renderer-side application との integration ✗）
- [#1260](https://github.com/kompiro/karasu/issues/1260) **GC01-1** — deploy-view / org-view の top-level orphan handling（`withUnassignedSystem` は ✅ だが該当 consumer の integration ✗）
- [#1262](https://github.com/kompiro/karasu/issues/1262) **GC22-1** — 三面の cross-face integration（各面の resolver は ✅ だが 3 面同時の integration ✗）
- [#1268](https://github.com/kompiro/karasu/issues/1268) **GCL17-1** — vscode webview ↔ extension-host message boundary（serve.ts の resolveKrsFile は ✅ だが message handler の input 検証 ✗）
- [#1269](https://github.com/kompiro/karasu/issues/1269) **GCL16-1** — /render HTTP endpoint が convenience `compile()` を使用（CLI render/matrix は `compileProject` ✅ だが HTTP endpoint だけ ✗）

7 件中 UI 層 / 代替 rendering path / per-consumer integration / process 境界が共通点。core 層の純粋ロジックのテスト文化に比べ、**「ある層の output を別の層が消費する」境界の integration が薄い**ことを示唆している。**新 feature を design するときは、layer ごとの test に加えて cross-layer integration test を 1 つは持つ** ことを default にすべき。

#### 観察 C（暫定）: proactive TPL は backward gap を出さないが forward test を生むべき

Fit/Gap 分析は「**既存コードにその観点の test があるか**」を見る = **backward gap** を探す作業。proactive TPL（`docs/concepts.ja.md` 由来）はこの backward gap をほとんど出さない — checklist 項目が「全 state が `.krs` から復元可能か」「情報の流れは up か down か」のような **feature 提案を見て判断する設計時の問い** だから。core-concepts topic の TPL-1207 / TPL-2166 / TPL-1223 は実際そうだった。

ただしこれは **「proactive TPL は test と無関係」という意味ではない**。proactive TPL の目的は「これを元に設計・テストを書くことで、そもそも bug が出ない状態を作る」こと。つまり proactive TPL は **forward gap** — _将来_ の feature がその観点を設計と test に織り込むべき、織り込まなければ次の bug になる — を防ぐためにある。backward gap は Fit/Gap 分析が捕捉し、forward gap は **DesignDoc review + 実装 PR の test 追加** が捕捉する。

##### proactive TPL を forward に使う運用

DesignDoc が proactive TPL を引用したら、実装 PR で次をやる:

1. **引用した TPL の checklist 項目のうち、その feature に該当するものを assertion 化した test を機能と一緒に書く** — bug が起きてから書く retrospective な regression test ではなく、**設計判断をロックする contract test**。例: 新しい入力経路を作るとき TPL-1207 を引用 → 「この経路の出力が `.krs` を round-trip する」test を実装と同時に追加。
2. **AT を作る場合（`/hane:acceptance-test`）は、引用した proactive TPL の checklist 項目を AC として転記** する。例: TPL-2166 を引く feature なら「出力の詳細量が入力より減っている（抽象化方向 = up）」を AC に明記し、自動 / 手動どちらかで検証する。
3. PR テンプレの「TPL impact」セクション（`docs(adr)` / new-feature PR 向け）には、引用した proactive TPL に対して **「relevant な checklist 項目を test / AC に落としたか」** を記録する欄がある（後述「PR テンプレ」参照）。

この運用により、proactive TPL は「review で気づく観点」から「review で気づき、その feature の test に落とす観点」へ格上げされ、観点違反が _コードに到達する前_ に止まる。

> ステータス: forward 運用は #1264 / 関連 PR で導入。Fit/Gap 側の「proactive は backward gap を出さない」観察は **2 近縁事例**（core-concepts の TPL-1207 / TPL-2166 / TPL-1223 が backward gap ゼロ + vscode の TPL-1024 は #1024 修正が comprehensive で実質 gap なし）。rule of three の 3 件目（次に proactive 中心 / 修正が comprehensive な topic を audit したとき同じパターンが再現）で暫定マークを外す。なお `/hane:acceptance-test` skill 側への同等プロンプト追加は別リポ（kompiro/hane）の作業のため follow-up（karasu 側からは PR テンプレと本 README だけ更新）。

### 推奨 cadence

全 23 TPL（全 topic）の初回 Fit/Gap は 2026-05-10〜11 で完了済み（[#1276](https://github.com/kompiro/karasu/issues/1276)）。今後:

- **新 topic に TPL が 3 件溜まった時点で その topic を 1 回 audit**（既存 topic は完了済み）
- **既存 topic は半期に 1 回の TPL deprecation review に合わせて 1 つ rotate** して再 audit（テスト構造が大きく変わった可能性があるため。毎回は不要）
- 大きな bug クラスタが解消されて既存 topic に新 TPL が複数発生したときは、そのクラスタの topic に絞って前倒し再 audit

## 一覧

TPL の一覧は [index.md](index.md) にある（topic ごと、deprecated は末尾）。`pnpm tpl:regenerate` が
TPL の frontmatter から生成するファイルで、手では書かない。

**`index.md` は毎日の再生成 PR だけが書くので、PR に含めない。** TPL を足す・直す PR は TPL の
ファイルだけを変え、索引は翌日の再生成 PR（`pnpm adr:regenerate-pr`。ADR の生成物と同じ PR）が
追いつかせる。混ぜた PR は pre-push の `adr-generated-check` と required check の `Validate` が止める
（[#3289](https://github.com/kompiro/karasu/issues/3289)）。手元で `pnpm tpl:regenerate` を実行して
索引を見るのはよいが、コミットする前に捨てる:

```
(cd "$(git rev-parse --show-toplevel)" && git reset -q -- docs/test-perspectives/index.md && { git restore --source=HEAD --worktree -- docs/test-perspectives/index.md 2>/dev/null || rm -f docs/test-perspectives/index.md; })
```

stage 済みの索引も外れる。HEAD に `index.md` があればその版へ戻し、無ければ（最初の再生成 PR が
マージされる前）ファイルを消す。
