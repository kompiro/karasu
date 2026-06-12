# テスト観点ライブラリ（Test Perspective Library, TPL）

## 目的

karasu で **再発しうる失敗パターン** を、構造化された観点として蓄積する。新機能の DesignDoc 作成時や受け入れテスト設計時に、これらの観点が自動的に参照される状態を作ることが目的。

運用開始の意思決定は [ADR-20260509-04](../adr/20260509-04-test-perspective-library.md) に記録されている。

> **メタ観点**: 個別 TPL とは別に、**全機能 PR に共通して適用するスコープフィルタ** — 「ゆっくり変化する構造的な文脈」フィルタ — は TPL スキーマに載せず、新機能の提案・レビューフェーズで surface する形にしている。原典は [`docs/concepts.ja.md`「非目標 → 共通フィルタ」](../concepts.ja.md)、チェックリストは [feature request Issue テンプレート](../../.github/ISSUE_TEMPLATE/feature-request.yml) と [PR テンプレート](../../.github/PULL_REQUEST_TEMPLATE.md) の "Scope filter" セクションにある。topic / package に紐付かないメタ観点なので TPL スキーマには載せていない（経緯は #1221）。

### 観点の起源 — retrospective と proactive

TPL は **2 つの起源** から生まれる:

- **Retrospective（事後）** — 過去の `bug` / `test-infra` Issue から、実際に起きた失敗を一般化する。バックフィルの主流（TPL-01〜17）はこの形
- **Proactive（事前）** — `docs/concepts.ja.md` のようなアーキテクチャ原則 / 非目標 / north-star から、**原則が破られたときに起きるであろう失敗** を予測して観点化する（TPL-18〜20 はこの形）

どちらも 3-Yes ルール（次節）と同じ基準で評価する。バグ起源 / 原則起源は frontmatter の `discovered_from` を見れば分かる（`issue:` か `root_cause_file: docs/concepts.*` か）。両方とも同じスキーマ・同じ運用ルールに乗る。

## ADR との違い

- **ADR**: 判断の記録（「私たちはこう判断した」）
- **TPL**: 検証すべき観点の集約（「これを検証すべき」）

ADR が **過去の判断を残す** ためのものに対し、TPL は **未来の検証を促す** ためのもの。両者は frontmatter の `topic` / `scope.packages` を共有しており、同じトピックで横串検索することで「過去の判断」と「検証すべき観点」を同時に発見できる。

## エントリの構造

各 TPL は 1 ファイル = 1 観点で、`docs/test-perspectives/TPL-YYYYMMDD-NN-<slug>.md` というファイル名規約に従う。

### Frontmatter

```yaml
---
id: TPL-YYYYMMDD-NN
title: "観点を1行で表現"
status: active            # active | deprecated
date: YYYY-MM-DD
applicable_to:
  - "再利用可能な抽象パターン（例: KrsFile.systems を消費する機能）"
  - "1 パターン 1 行に分解する（複数の抽象パターンに当てはまるなら複数行）"
known_consumers:           # optional — この観点が適用されると判明している具体的な consumer
  - renderer               # kebab-case の feature / module 名（grep 可能な形）
  - matrix
discovered_from:
  - issue: "#1234"
  - root_cause_adr: "ADR-XXXXXXXX-XX"        # optional
  - root_cause_file: "path/to/file.ts:LINE"  # optional
related_to:
  - TPL-XXXXXXXX-XX
topic: app-ui              # ADR と同じ controlled vocabulary
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
3. **チェックリスト** — 新機能の実装/修正時に確認する項目。**3〜5項目に絞る**（多すぎると使われない）
4. **既知の対処パターン** — 過去にこの問題を解決した方法
5. **関連テスト** — この観点を検証する既存テストのパス

## 運用ルール

### 新規エントリの追加タイミング

`bug` または `test-infra` ラベルが付いた Issue が起票されたとき、以下の **3-Yes ルール** で TPL 化を検討する（`test-infra` は E2E flake / fixture / harness の問題で、典型的には testing-topic TPL を生む — 例: TPL-20260510-13 / TPL-20260510-14）。

1. 同じ root cause が **別の機能でも発生しうる** か?
2. 構造的なパターンとして **再発する可能性がある** か?
3. 既存の TPL でカバーされていない観点か?

3つすべてが Yes なら新規 TPL として起こす。1つでも No なら個別 Issue として処理して TPL は作らない。

### 既存エントリの更新

新しい Issue が既存 TPL のパターンに該当する場合、その TPL の `discovered_from` セクションに Issue を追記する。チェックリストや「既知の対処パターン」の更新が必要なら、それも併せて行う。

### deprecated への移行

実装の構造変更などで、ある観点が原理的に発生しなくなった場合、`status` を `deprecated` に変更する。エントリ自体は **削除しない** — なぜ deprecated にしたかを末尾に追記する（後から「この観点はなぜ消えたのか」を辿れるようにするため）。validator は `status: deprecated` のエントリ本文に `deprecated` の語を含む rationale を要求する（理由が無いまま deprecated にすると CI で落ちる）。

### 定期 deprecation レビュー

deprecation の **トリガー** は週次の定期レビューで起こす。`active` な TPL を放置すると、構造変更で原理的に発生しなくなった観点がそのまま残り続けるため。

**カデンス**: 毎週月曜 09:00 UTC に `.github/workflows/tpl-review.yml` が走り、その週のレビュー用 Issue を自動作成する。`workflow_dispatch` で手動実行も可能（bootstrap や大きなアーキテクチャ変更直後の ad-hoc 用）。

> なぜ週次か: TPL 運用は始まったばかりで、20 件近くを一括 backfill した直後でもある。早く obsolescence を捕捉するために、当面は高頻度で回す。ほとんどの週で全件 `keep` になる状態が安定したら、月次 / 半年に伸ばすかを再検討する（cadence 自体も TPL のレビュー対象）。

**Issue の中身**: `pnpm tpl:review:body` が生成する。`active` TPL ごとにチェックボックス + 3 つの観点が並ぶ:

1. 引用された `root_cause_file` / `root_cause_adr` は今も存在するか? 関数 / パターンは生き残っているか?
2. アーキテクチャの前提が変わっていないか?（例: 「user stylesheet は常に最後」 → 「mode-locked properties は user sheet を bypass する」）
3. この TPL を包含するより新しい TPL があるか?（あれば `superseded_by` として deprecate — ADR と同じ運用）

**処分（disposition）**:

- **keep** — 今も妥当。編集不要
- **update** — 観点は妥当だが、チェックリスト / 既知の対処 / 関連テストの refresh が必要
- **deprecate** — root cause が構造的に消滅。`status: deprecated` にして末尾に rationale を追記（前節 "deprecated への移行" の手順）

**完了処理**: レビューが終わったら、Issue にディスポジションのサマリ（例: `keep: 18 / update: 1 / deprecate: 1`）をコメントしてクローズする。

### Validator

frontmatter とこの README の一覧表は **`pnpm tpl:validate`** で機械的にチェックされる。pre-push の lefthook と PR-gated の `.github/workflows/tpl-validate.yml` で自動実行されるが、ローカルで先に確認したいときも同じコマンドで走る。

検査内容:

- ファイル名が `TPL-YYYYMMDD-NN-<slug>.md` で frontmatter `id` と一致すること
- 必須フィールド（`id` / `title` / `status` / `date` / `applicable_to` / `discovered_from` / `topic` / `scope.packages`）の存在
- `status` が `active` / `deprecated` のいずれか
- `topic` が `adr.config.json` の controlled vocabulary（ADR と共有）に含まれること
- `applicable_to` / `discovered_from` が非空、`discovered_from` の各エントリは既知 key（`issue` / `root_cause_adr` / `root_cause_file`）のみを持つこと
- `related_to` が指す TPL が同ディレクトリに存在すること
- `scope.packages` が `packages/` 配下の実在ディレクトリを指すこと
- `status: deprecated` のエントリ本文に deprecation rationale が含まれること
- README の一覧表が全 TPL ファイルと双方向に整合していること（行欠落 / dead リンク無し）

実装は外部パッケージ [`@kompiro/tpl-tools`](https://github.com/kompiro/tpl-tools)（`tpl validate` サブコマンド）。`pnpm tpl:validate` は `--config adr.config.json` を渡して `topics` 語彙を ADR と共有し、`--packages-root packages` で `scope.packages` を検証している（karasu#1357 で切り出し）。

### Related TPL クエリ

DesignDoc を書くとき、該当 `topic` の active TPL を一覧したい場合は **`pnpm tpl:related <topic> [--package <pkg>]`** を使う。出力は markdown のリストで、そのまま DesignDoc の「Related TPLs」セクションに貼り付けられる:

```
$ pnpm tpl:related app-ui
- [TPL-20260510-04](docs/test-perspectives/TPL-20260510-04-continuous-input-dom-interference.md) — ユーザーの連続操作中は DOM / state を破壊する別系統の処理を抑止する
- [TPL-20260510-08](docs/test-perspectives/TPL-20260510-08-derived-state-staleness.md) — 派生 view / panel の memoization は source state の変化次元すべてを key に含める
- [TPL-20260510-09](docs/test-perspectives/TPL-20260510-09-event-handler-ui-restructure.md) — UI 構造を変える event handler は次描画でマウントされる target への event 漏れを防ぐ

$ pnpm tpl:related renderer --package core
- [TPL-20260510-05](docs/test-perspectives/TPL-20260510-05-implicit-data-filtering.md) — データ表示の暗黙フィルタ（宣言漏れ / resolver / null 戻り）を全経路で確認する
- [TPL-20260510-06](docs/test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 表示モード / グローバルレンダリング切替は全描画面の点検と precedence 設計が必要
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

proactive / retrospective の区別は **起源** の違いだけで、frontmatter スキーマも 3-Yes ルールも運用ルール（更新 / deprecated）も同じ。`discovered_from` を見れば起源は判る:

- `discovered_from.issue: #N` → retrospective（`bug` または `test-infra` 起源）
- `discovered_from.root_cause_file: docs/concepts.*` → proactive（原則起源）

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

- [TPL-06](TPL-20260510-06-display-mode-cross-surface.md) — 共通アセット（pictogram など）を「id → 単一ソース」の解決関数に集約
- [TPL-11](TPL-20260510-11-parallel-function-parity.md) — 並列関数ファミリの差を共通 helper に抽出（`buildStyles` のような形）
- [TPL-12](TPL-20260510-12-ast-parser-renderer-agreement.md) — ノード共通フィールドを `BaseNodeFields` に集約、parser の keyword 処理を共通関数に
- [TPL-13](TPL-20260510-13-e2e-fixture-controlled-state.md) — 既存 fixture（`anthropic.ts` の locale pin）を他 fixture にテンプレ展開
- [TPL-14](TPL-20260510-14-wait-for-stable-state.md) — Monaco の async mount 操作を fixture helper（`replaceEditorContent`）に集約
- [TPL-15](TPL-20260510-15-dev-vs-packaged-mode-parity.md) — 候補パス配列 + `find(fs.existsSync)` の解決ロジックを 1 箇所に

**使わないケース**: duplication がまだ 2 箇所しかなく、抽象化すると形が決まりすぎて将来の divergence を阻害する場合。3 箇所目で再評価する（rule of three）。

### 2. 境界では principled / safe variant をデフォルトにする

trust boundary / consumer 境界 / 入出力境界では、**便利な変種ではなく原則的な変種** をデフォルトにする。便利な変種を選ぶと、限定された前提（single-file / sync only / 信頼できる input）の外側で silent に挙動が壊れる。

現時点の evidence:

- [TPL-13](TPL-20260510-13-e2e-fixture-controlled-state.md) — テスト boot は `page.goto("/")` ではなく fixture 経由をデフォルト（fixture が wipe / seed / locale pin を担保）
- [TPL-16](TPL-20260510-16-convenience-vs-principled-api.md) — consumer 境界では convenience API（`compile`, `parse`）ではなく principled API（`compileProject`, `parseAsync`）をデフォルト
- [TPL-17](TPL-20260510-17-trust-boundary-input-validation.md) — 外部入力は受け取った時点で validate / canonicalize する（downstream の incidental mitigation に頼らない）

**使わないケース**: principled variant が genuinely overspec で、convenience を選ぶ理由を Design Doc / コメントで言える場合。境界の内側（純粋な internal helper）では convenience でよい。

### 3. Negative test を regression fence にする

「**起きてはいけないこと** が起きないことを assert する test」を 1 件以上必ず置く。positive test（期待通り動く）だけでは、validation の不在 / 過剰一致 / 暗黙の許可が表面化しない。

現時点の evidence:

- [TPL-10](TPL-20260510-10-cross-reference-validation.md) — **正しい参照に warning が出ない** 反対方向の test
- [TPL-13](TPL-20260510-13-e2e-fixture-controlled-state.md) — retry-pass を `failed` と同等に集計、**flake が隠蔽されない** ことを担保
- [TPL-14](TPL-20260510-14-wait-for-stable-state.md) — `retries=0` で通らないテストを「隠れ flake」として可視化
- [TPL-17](TPL-20260510-17-trust-boundary-input-validation.md) — traversal 試行 / injection 試行 / null byte / 巨大入力の **negative test** を回帰テストに必ず 1 件

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

| TPL / 項目 | Status | Evidence | Gap |
|---|---|---|---|
| TPL-XX (1) ... | ✅ \| 🟡 \| ❌ | foo.test.ts:NNN | — \| GXX-N |

**Part 2: Gap list** — 各 gap について「観点」「根拠」「優先度」「scope」を 1 ブロックで。Issue 化するときはこの形式をそのまま本文に転載できる。

### 実施済み事例

全 23 TPL を持つ全 topic の Fit/Gap 分析を完了（2026-05-10〜11）。抽出された全 25 gap の tracking issue は [#1276](https://github.com/kompiro/karasu/issues/1276)。

| 実施日 | Topic | TPL 件数 | Gap 件数 | Issues |
|---|---|---|---|---|
| 2026-05-10 | [parser](#fit-gap-parser) | 3 (TPL-02 / 10 / 12) | 4 | [#1231](https://github.com/kompiro/karasu/issues/1231) [#1232](https://github.com/kompiro/karasu/issues/1232) [#1233](https://github.com/kompiro/karasu/issues/1233) [#1234](https://github.com/kompiro/karasu/issues/1234) |
| 2026-05-10 | [app-ui](#fit-gap-app-ui) | 3 (TPL-04 / 08 / 09) | 4 | [#1238](https://github.com/kompiro/karasu/issues/1238) [#1239](https://github.com/kompiro/karasu/issues/1239) [#1240](https://github.com/kompiro/karasu/issues/1240) [#1241](https://github.com/kompiro/karasu/issues/1241) |
| 2026-05-11 | [renderer](#fit-gap-renderer) | 2 (TPL-05 / 06) | 3 | [#1245](https://github.com/kompiro/karasu/issues/1245) [#1246](https://github.com/kompiro/karasu/issues/1246) [#1247](https://github.com/kompiro/karasu/issues/1247) |
| 2026-05-11 | [edges](#fit-gap-edges) | 2 (TPL-07 / 23) | 3 | [#1248](https://github.com/kompiro/karasu/issues/1248) [#1249](https://github.com/kompiro/karasu/issues/1249) [#1250](https://github.com/kompiro/karasu/issues/1250) |
| 2026-05-11 | [core-concepts](#fit-gap-core-concepts) | 5 (TPL-01 / 18 / 19 / 21 / 22) | 3 | [#1260](https://github.com/kompiro/karasu/issues/1260) [#1261](https://github.com/kompiro/karasu/issues/1261) [#1262](https://github.com/kompiro/karasu/issues/1262) |
| 2026-05-11 | [cli](#fit-gap-cli) | 2 (TPL-16 / 17) | 2 | [#1268](https://github.com/kompiro/karasu/issues/1268) [#1269](https://github.com/kompiro/karasu/issues/1269) |
| 2026-05-11 | [testing](#fit-gap-testing) | 2 (TPL-13 / 14) | 2 | [#1270](https://github.com/kompiro/karasu/issues/1270) [#1271](https://github.com/kompiro/karasu/issues/1271) |
| 2026-05-11 | [vscode](#fit-gap-vscode) | 1 (TPL-15) | 1 | [#1272](https://github.com/kompiro/karasu/issues/1272) |
| 2026-05-11 | [build](#fit-gap-build) | 1 (TPL-11) | 1 | [#1273](https://github.com/kompiro/karasu/issues/1273) |
| 2026-05-11 | [navigation](#fit-gap-navigation) | 1 (TPL-03) | 1 | [#1274](https://github.com/kompiro/karasu/issues/1274) |
| 2026-05-11 | [resolver](#fit-gap-resolver) | 1 (TPL-20) | 1 | [#1275](https://github.com/kompiro/karasu/issues/1275) |
| — | styling / chat-ai / project / adr-tooling | 0 | — | TPL なし、audit 対象外 |

<a id="fit-gap-parser"></a>**parser (2026-05-10)** — bug 起源の TPL に対する regression は core 系で完備だが、AST 構造的等価 / i18n 出力 / parser keyword の exhaustiveness / spec ↔ impl smoke が未カバー。

<a id="fit-gap-app-ui"></a>**app-ui (2026-05-10)** — EditorPane / ProjectSelector の TPL 起源 bug は強い regression を持つ一方、**#1032 (NodeDetailPanel stale on reopen) の regression test が空白**。他の text input UI (ChatPane / PasteCompareDialog / SettingsPane) と inline editor (ChatPane / PasteCompareDialog) は audit 未実施。cross-surface 整合性の integration test 不在。

<a id="fit-gap-renderer"></a>**renderer (2026-05-11)** — #279 cascade priority は 6 case で異常に強いが、**#183 (Full View displayMode threading) は useFullViewSvg.test.ts が存在せず regression なし**。icon card と NodeDetailPanel の pictogram cross-surface 整合性も per-surface 単位で個別 mock のため未保証。

<a id="fit-gap-edges"></a>**edges (2026-05-11)** — `[implicit]` と `[async/sync]` の coexistence integration / 派生関数の semantic 保存契約の meta-test / owns / inherited annotation の cross-view rendering integration が未カバー。AT-0056 が automation marker を持たないことが判明。

<a id="fit-gap-core-concepts"></a>**core-concepts (2026-05-11)** — 5 TPL 中 **3 つ (TPL-18 / 19 / 21) はほぼ完全に proactive** で「設計時 review」型の checklist 項目しか持たず、test gap として現れなかった（後述「proactive TPL は backward gap を出さない」）。残る retrospective な TPL-01 と一部 testable な TPL-22 から 3 gap: TPL-01 の `known_consumers` のうち deploy-view / org-view が top-level handling を test していない / #412 (named import → system membership) の regression fixture 不在 / 三面（論理+物理+組織）を 1 fixture に含む cross-face integration test 不在。

<a id="fit-gap-cli"></a>**cli (2026-05-11)** — `resolveKrsFile` の path traversal は 6 case で網羅 ✅。gap 2 つ: render-endpoint.ts の `/render` HTTP endpoint が single-file `compile()` を使っており multi-file 解決ができない (#239-style) / vscode preview-panel.ts の webview message handler が `url` / `index` を validation なしで受け取る（trust boundary 検証なし）。

<a id="fit-gap-testing"></a>**testing (2026-05-11)** — `page.goto("/")` migration 完了 ✅ (0 hits)、locale pin ✅、e2e-nightly.yml ✅、replaceEditorContent helper ✅、retries=1 in CI（推奨通り）✅。gap 2 つ: migration を再 creep させない lint rule が無い / retry-passed (flaky) test を CI で surface する仕組みが無い。

<a id="fit-gap-vscode"></a>**vscode (2026-05-11)** — TPL-15 起源の #1024 修正が **comprehensive**（多候補パス解決 + bundling step + e2e で installed 動作検証）で、実質 gap がほぼ無い。残る 1 つ: `pnpm build` 後に `out/server.js` が存在することの fast unit-level check（bundling step が壊れても dev-tree fallback で local は動くため vscode-e2e でしか検出できない）。

<a id="fit-gap-build"></a>**build (2026-05-11)** — compileProject / compileProjectOrgView は #160 fix で parity ✅、drill-down / multi-level は `buildStyles` 共通化済み (#219) ✅。gap 1 つ: SVG builder family を同一 fixture + 同一 styleSource + 同一 displayMode で呼んで挙動一致を assert する family-wide parity test が無い（TPL-11 checklist 項目 5）。

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

採用理由: TS reflection / 自動 discovery より explicit な table のほうが code review で auditable で、新エントリ追加時に table 編集を強制できる。**新しいファミリの meta-check が必要になったら、まず curated table を default の選択肢に置く**。

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

Fit/Gap 分析は「**既存コードにその観点の test があるか**」を見る = **backward gap** を探す作業。proactive TPL（`docs/concepts.ja.md` 由来）はこの backward gap をほとんど出さない — checklist 項目が「全 state が `.krs` から復元可能か」「情報の流れは up か down か」のような **feature 提案を見て判断する設計時の問い** だから。core-concepts topic の TPL-18 / 19 / 21 は実際そうだった。

ただしこれは **「proactive TPL は test と無関係」という意味ではない**。proactive TPL の目的は「これを元に設計・テストを書くことで、そもそも bug が出ない状態を作る」こと。つまり proactive TPL は **forward gap** — *将来* の feature がその観点を設計と test に織り込むべき、織り込まなければ次の bug になる — を防ぐためにある。backward gap は Fit/Gap 分析が捕捉し、forward gap は **DesignDoc review + 実装 PR の test 追加** が捕捉する。

##### proactive TPL を forward に使う運用

DesignDoc が proactive TPL を引用したら、実装 PR で次をやる:

1. **引用した TPL の checklist 項目のうち、その feature に該当するものを assertion 化した test を機能と一緒に書く** — bug が起きてから書く retrospective な regression test ではなく、**設計判断をロックする contract test**。例: 新しい入力経路を作るとき TPL-18 を引用 → 「この経路の出力が `.krs` を round-trip する」test を実装と同時に追加。
2. **AT を作る場合（`/hane:acceptance-test`）は、引用した proactive TPL の checklist 項目を AC として転記** する。例: TPL-19 を引く feature なら「出力の詳細量が入力より減っている（抽象化方向 = up）」を AC に明記し、自動 / 手動どちらかで検証する。
3. PR テンプレの「TPL impact」セクション（`docs(adr)` / new-feature PR 向け）には、引用した proactive TPL に対して **「relevant な checklist 項目を test / AC に落としたか」** を記録する欄がある（後述「PR テンプレ」参照）。

この運用により、proactive TPL は「review で気づく観点」から「review で気づき、その feature の test に落とす観点」へ格上げされ、観点違反が *コードに到達する前* に止まる。

> ステータス: forward 運用は #1264 / 関連 PR で導入。Fit/Gap 側の「proactive は backward gap を出さない」観察は **2 近縁事例**（core-concepts の TPL-18/19/21 が backward gap ゼロ + vscode の TPL-15 は #1024 修正が comprehensive で実質 gap なし）。rule of three の 3 件目（次に proactive 中心 / 修正が comprehensive な topic を audit したとき同じパターンが再現）で暫定マークを外す。なお `/hane:acceptance-test` skill 側への同等プロンプト追加は別リポ（kompiro/hane）の作業のため follow-up（karasu 側からは PR テンプレと本 README だけ更新）。

### 推奨 cadence

全 23 TPL（全 topic）の初回 Fit/Gap は 2026-05-10〜11 で完了済み（[#1276](https://github.com/kompiro/karasu/issues/1276)）。今後:

- **新 topic に TPL が 3 件溜まった時点で その topic を 1 回 audit**（既存 topic は完了済み）
- **既存 topic は半期に 1 回の TPL deprecation review に合わせて 1 つ rotate** して再 audit（テスト構造が大きく変わった可能性があるため。毎回は不要）
- 大きな bug クラスタが解消されて既存 topic に新 TPL が複数発生したときは、そのクラスタの topic に絞って前倒し再 audit

## 一覧

現時点で active な TPL は以下:

| ID | タイトル | topic | 起源 |
|---|---|---|---|
| [TPL-20260510-01](TPL-20260510-01-top-level-orphans.md) | top-level orphans の扱い | core-concepts | #1160, #412 |
| [TPL-20260510-02](TPL-20260510-02-round-trip-guarantee.md) | コード変換における round-trip 保証 | parser | #1101, #1058 |
| [TPL-20260510-03](TPL-20260510-03-enum-member-addition.md) | 列挙型メンバー追加時の更新漏れ | navigation | #1094 |
| [TPL-20260510-04](TPL-20260510-04-continuous-input-dom-interference.md) | 連続操作中の DOM 介入 | app-ui | #1053 |
| [TPL-20260510-05](TPL-20260510-05-implicit-data-filtering.md) | データ表示の暗黙フィルタ | renderer | #999, #132 |
| [TPL-20260510-06](TPL-20260510-06-display-mode-cross-surface.md) | 表示モード切替の cross-surface 点検 | renderer | #1001, #279, #132, #183, #1479 |
| [TPL-20260510-07](TPL-20260510-07-derivation-tag-semantics.md) | 派生タグでの semantic 区別の保存 | edges | #510 |
| [TPL-20260510-08](TPL-20260510-08-derived-state-staleness.md) | 派生 view / panel の memoization と publish | app-ui | #1032, #891 |
| [TPL-20260510-09](TPL-20260510-09-event-handler-ui-restructure.md) | UI 構造を変える event handler の event 漏れ | app-ui | #948 |
| [TPL-20260510-10](TPL-20260510-10-cross-reference-validation.md) | cross-reference プロパティの resolver-side 検証 | parser | #907 |
| [TPL-20260510-11](TPL-20260510-11-parallel-function-parity.md) | 並列関数ファミリの parameter parity | build | #219, #160 |
| [TPL-20260510-12](TPL-20260510-12-ast-parser-renderer-agreement.md) | AST 型 / parser keyword / renderer fallback の三点同意 | parser | #74 |
| [TPL-20260510-13](TPL-20260510-13-e2e-fixture-controlled-state.md) | E2E fixture が状態 / 環境 / 後始末を所有する | testing | #976, #1006, #1007 |
| [TPL-20260510-14](TPL-20260510-14-wait-for-stable-state.md) | E2E は到達した stable state を待ってから assert する | testing | #1171, #976 |
| [TPL-20260510-15](TPL-20260510-15-dev-vs-packaged-mode-parity.md) | dev mode と packaged / installed mode の parity | vscode | #1024 |
| [TPL-20260510-16](TPL-20260510-16-convenience-vs-principled-api.md) | consumer 境界では convenience より principled API | cli | #239, #507 |
| [TPL-20260510-17](TPL-20260510-17-trust-boundary-input-validation.md) | trust boundary で外部入力を validate / canonicalize | cli | #168 |
| [TPL-20260510-18](TPL-20260510-18-text-as-single-source-of-truth.md) | `.krs` テキストを single source of truth に保つ | core-concepts | concepts.ja.md |
| [TPL-20260510-19](TPL-20260510-19-information-flows-up.md) | 情報の流れは抽象化方向（up）か詳細化方向（down）かを判定する | core-concepts | concepts.ja.md |
| [TPL-20260510-20](TPL-20260510-20-id-not-label-for-identity.md) | identity は `id` で判定し `label` を比較に使わない | resolver | concepts.ja.md |
| [TPL-20260510-21](TPL-20260510-21-scoped-glance-drill-down.md) | 一度に見せる範囲を限定し、drill-down を first-class に保つ | core-concepts | concepts.ja.md |
| [TPL-20260510-22](TPL-20260510-22-three-face-intersection-single-artifact.md) | 論理・物理・組織の三面は一つの `.krs` artifact 内で交差させる | core-concepts | concepts.ja.md |
| [TPL-20260510-23](TPL-20260510-23-writer-reader-asymmetry.md) | 新しい edge / relation 機能は writer の coarse 表現と reader の progressive disclosure を両立する | edges | concepts.ja.md |
| [TPL-20260511-01](TPL-20260511-01-keyword-lexical-ambiguity-fence-vs-deprecate.md) | 既存キーワードの語彙的曖昧さは外部 fence ADR を deprecate より先に検討する | core-concepts | #1281 |
| [TPL-20260511-02](TPL-20260511-02-spec-doc-reference-data-sync.md) | spec ドキュメントと in-app reference データは片方向 smoke test で同期を縛る | build | #1296 |
| [TPL-20260512-01](TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md) | 値ごとに区別が必要な属性は、その値を格納するマップのキーに含める | core-concepts | #1352 |
| [TPL-20260514-01](TPL-20260514-01-import-dag-not-cycle.md) | DAG 経由で同じファイルに 2 回到達するのは循環ではない | resolver | docs/spec/syntax.md (S5), #1381 |
| [TPL-20260514-02](TPL-20260514-02-whole-file-import-completeness.md) | whole-file import は imported ファイルの全 top-level ノードと全 children を merged に流す | resolver | docs/spec/syntax.md (S2), #1381 |
| [TPL-20260514-03](TPL-20260514-03-system-reopen-merge.md) | 同名 system / deploy / organization の再オープンは children を union し、property は import-graph root に近い側が勝つ | resolver | docs/spec/syntax.md (S3), #1381 |
| [TPL-20260514-04](TPL-20260514-04-deploy-org-wildcard-propagation.md) | whole-file import は system だけでなく deploy / organization も伝搬する | resolver | docs/spec/syntax.md (S4), #1381 |
| [TPL-20260514-05](TPL-20260514-05-dangling-edge-preserves-node.md) | edge / relation の片側が未解決でも、解決できた側のノードは drop しない | resolver | docs/spec/syntax.md (S6), #1381 |
| [TPL-20260514-07](TPL-20260514-07-infra-redeclared-across-files.md) | 同名 `database` / `queue` / `storage` の再宣言は union merge、info 診断で surface する | resolver | docs/spec/syntax.md (S4.5), #1385 |
| [TPL-20260514-08](TPL-20260514-08-diagnostic-register-fact-vs-style.md) | 新規 resolver diagnostic の register は「事実か流派判断か」で決める | core-concepts | docs/concepts.md (§What karasu visualizes vs. what it doesn't prescribe), #1386 |
| [TPL-20260516-01](TPL-20260516-01-control-a11y-contract-survives-migration.md) | interactive control の a11y 契約は移行・リファクタで静かに壊れる | app-ui | ADR-20260515-01, #1399 |
| [TPL-20260518-01](TPL-20260518-01-involutive-toggle-renders-both-states.md) | involutive な toggle は両方の結果状態を end-to-end でレンダリング検証する | app-ui | #1402 |
| [TPL-20260519-01](TPL-20260519-01-global-shortcut-text-input-inhibition.md) | グローバルキーボードショートカットはテキスト入力フォーカス下での挙動を契約として検証する | app-ui | packages/app/src/keyboard/KeyboardShortcutDispatcher.tsx |
| [TPL-20260519-02](TPL-20260519-02-shared-vocabulary-dual-representation.md) | 同一語彙を複数の表現で持つときは片方更新による静かな drift を検証する | renderer | #1415 |
| [TPL-20260520-01](TPL-20260520-01-overlay-z-index-scale.md) | overlay/portal surface の重なり順はマジックナンバーではなく文書化された z-index スケールから選ぶ | app-ui | #1468 |
| [TPL-20260520-02](TPL-20260520-02-consistency-check-triggers-on-both-sides.md) | 2 つの成果物の整合性を検証するチェックは、両方の変更で起動させる | build | #1480 |
| [TPL-20260610-01](TPL-20260610-01-accepted-vocabulary-must-have-effect.md) | 受理される語彙は「効果を持つ」「警告される」「open set と明文化」のいずれかに属する | styling | property-schema.ts, parser.ts |
| [TPL-20260610-02](TPL-20260610-02-spec-promised-diagnostics-implemented.md) | spec が約束する診断は専用の診断コードとして実装されていることを検証する | parser | docs/spec/style.md, docs/spec/syntax.md |
| [TPL-20260612-01](TPL-20260612-01-style-coupled-diagnostics-sheetless-context.md) | style 連動の diagnostic はシート不在の文脈（LSP 単一ドキュメント）での挙動を仕様化する | core-concepts | #1522 |
| [TPL-20260612-02](TPL-20260612-02-react-passive-event-preventdefault-noop.md) | React の synthetic onWheel / onTouchMove では preventDefault が no-op になる | app-ui | #1537 |
