# version vocabulary — 言語版とパッケージ semver の分離、"experimental" / "deprecated" の主語の曖昧性解消

- **日付**: 2026-07-29
- **ステータス**: 検討中
- **Issue**: [#2124](https://github.com/kompiro/karasu/issues/2124)
- **PR**: [#2170](https://github.com/kompiro/karasu/pull/2170)
- **関連**:
  - 引き金 Issue: [#2124](https://github.com/kompiro/karasu/issues/2124)（boundary notation ADR の昇格作業 #2118 で「v1.x minor」トリガーが実行不能であることが表面化。Issue 本文が併記する #2120 は Group-by bulk collapse の昇格 PR であり本件と無関係 — 本 doc で訂正）
  - 関連 ADR: [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze — 「追加は v1.x / 破壊は v2.0」の言語版セマンティクスの定義元）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（promotion gate — **本設計が refine を提案する対象**。「v1.x minor / v2.0 major を bump レベルに反映」の規定が実行不能）、[ADR-1758](../adr/1758-vscode-changeset-versioning.md)（vscode の版管理は changesets、配布は Marketplace 別管理）
  - 関連 Issue: [#2162](https://github.com/kompiro/karasu/issues/2162)（Syntax 2.0 プログラム — v2.0 の版運用は本 Issue の決定と同時確定と registered。roadmap §Syntax 2.0 プログラム）
  - 関連 TPL: [TPL-20260716-01](../test-perspectives/TPL-20260716-01-keystone-terms-single-home.md)（load-bearing な coined 語彙は単一の正典を持ち、他 doc は参照する — 本設計の置き場論点の拠り所）、[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（doc と source-of-truth の同期 — 言語版を code constant にする場合の観点）
  - コード: `packages/cli/src/index.ts:22`（`.version("0.0.0")` — ハードコード。build 時注入なし）、`packages/cli/package.json`（0.6.0）、`packages/core/package.json`（0.2.0）、`packages/vscode/package.json`（0.1.3）

## 背景・課題

docs は `v1.0` / `v1.0-stable` / `experimental` / `post-v1.0 watch` / `v1.x minor` /
`v2.0 major` を単一の尺度の語彙であるかのように使っているが、実際には**独立した互換性の
約束が少なくとも 3 軸**あり、さらに **2 つの語（experimental / deprecated）が主語によって
別の意味**を持つ。#2124 はこの定義を 1 箇所に書き下ろし、曖昧さが既に「実行不能な規則」を
生んでいる箇所を直すための Issue。

具体的な症状（Issue #2124 の 4 論点）:

1. **言語版がどこにも公開されていない** — `.krs` / `.krs.style` は「v1.0」（ADR-1314）だが、
   その版番号は prose にしか存在しない。`krsVersion` / `specVersion` / `languageVersion` は
   `packages/` にも `docs/` にも無い。ユーザーは手元の `karasu` バイナリが「どの言語版を
   実装しているか」を知る手段が無く、我々にも「このリリースは .krs v1.1 を実装する」と言う
   機構が無い。**さらに実測で、`karasu --version` はハードコードの `0.0.0` を返す**
   （`packages/cli/src/index.ts:22`、esbuild build に define 注入なし）— 版の表面は今日
   すでに壊れている。
2. **言語版とパッケージ semver は別軸なのに同じ表記** — 言語は v1.0 frozen、一方 shipping
   artifact は全て 0.x（CLI 0.6.0 / core 0.2.0 / vscode 0.1.3）。これが意図的であることは
   どこにも書かれておらず、リリースノートの「v1.0」は文面上曖昧。
3. **bump-level 対応規則が実行不能** — `docs/process.md`（リリース運用）と ADR-1820 は
   「後方互換な追加 = v1.x minor / 既存構文の変更・再設計 = v2.0 major を決めて bump レベルに
   反映」と規定するが、CLI は 0.6.0 であり「v1.x」という版線がパッケージ側に存在しない。
   また semver 上 0.x の minor は破壊的でありうるため「v2.0 major = breaking」の対応物も無い。
   これはリリース前チェックリストの実項目であり、**現在正解が存在しない手順**。
4. **"experimental" / "deprecated" の二重の意味** — karasu 自身の notation の tier
   （互換を約束しない層 / 段階的廃止）と、ユーザーが自分のモデルに付ける annotation
   （`@experimental` / `@deprecated` — ユーザーのシステムのライフサイクル）が同語。
   さらに `v1.0-stable` / `stable` / `v1.0 freeze`、`experimental` /
   `experimental（post-v1.0 watch）` / `post-v1.0 watch` / `notation watch` の
   同義語クラスタが、同義なのか別概念なのか未規定。

### なぜ今か

boundary notation の ADR 昇格（#2118）で promotion gate の昇格トリガー
「v1.x minor」が実行不能であることが表面化した。roadmap の watch table に載る全
experimental notation が同じ問題を継承しており、**この曖昧さは gate が実際に発火することを
恒久的に阻む**。加えて [#2162](https://github.com/kompiro/karasu/issues/2162) で登録した
Syntax 2.0 プログラムは「v2.0 の版運用は #2124 の決定と同時確定」と明記しており、本設計が
確定しないと v2.0 プログラム自体が動けない。

## 現状（インベントリ）

| 軸 | 対象 | 現在の版 | 約束 | 定義元 |
| --- | --- | --- | --- | --- |
| **言語**（`.krs` / `.krs.style` の構文・診断 register） | 言語仕様 | v1.0（frozen） | 後方互換。破壊は v2.0 でのみ | ADR-1314、roadmap §Syntax v1.0 |
| **CLI**（`karasu` npm パッケージ） | コマンド UX・配布物 | 0.6.0（floor — 旧 incarnation 衝突で leap 済み #1774） | npm semver（0.x = 安定約束なし） | process.md リリース運用 |
| **TS API**（`@karasu-tools/core`） | ライブラリ API | 0.2.0 | **明示的に約束なし**（minor で破壊しうる） | ADR-1314 非スコープ節、process.md |
| **VS Code 拡張**（`karasu-vscode`） | Marketplace 配布 | 0.1.3 | 別ケイデンス（changesets で bump、公開は手動） | ADR-1758 |

- `karasu --version` は `0.0.0` を返す（ハードコード。package.json 0.6.0 とも不一致）。
- 語彙の現状分布:
  - **tier**（karasu の notation が主語）: `v1.0-stable` / `experimental（post-v1.0 watch）` /
    `deprecated` — roadmap §criteria の 3 tier 表。
  - **annotation**（ユーザーのモデルが主語）: `@experimental` / `@deprecated(until: …)` —
    `docs/spec/tags-annotations.md`。ユーザーのノードのライフサイクル標識。
  - **活動名**: `notation watch`（round 2、Epic #1816）— tier の観察活動。tier 名ではない。
  - **イベント名**: `v1.0 freeze`（ADR-1314 の決定行為）— tier 名ではない。
- 定義の置き場の既存パターン: `docs/glossary.md`（keystone・permalink 語彙の単一正典、
  TPL-20260716-01 でドリフトガード済み）と `docs/spec/glossary.md`（モデリング言語語彙）。
  version vocabulary はどちらのスコープにも入っていない。

## 制約・前提

- **ADR-1314 の言語版セマンティクスは動かさない**: 「追加互換は v1.x、破壊は v2.0」という
  **言語版**の意味論は freeze 済みの決定。本設計が直すのは、それをパッケージ bump に
  対応づける「実行不能な写像」と語彙の曖昧さであり、言語の互換性約束そのものではない。
- **ADR-1820 は refine（非破壊）**: gate の decision 本体（既定 experimental・証拠トリガー・
  三点配線）は正しい。実行不能なのは「bump レベルに反映」の一文のみ。旧 ADR は書き換えず、
  新 ADR で当該規定を refine する（tags-and-facets 設計が ADR-832 に対して採った関係と同型）。
- **`karasu`（CLI）の version floor は 0.6.0**（#1774 — npm 旧 incarnation との衝突回避）。
  0.6.0 未満へは戻せない。
- **core の API 不安定は維持**: `@karasu-tools/core` を 1.0 に上げて API 安定を約束する変更は
  out of scope（ADR-1314 が明示的に非スコープとした判断を尊重）。
- **`karasu-vscode` は現状維持**: Marketplace 別ケイデンス（ADR-1758）。本設計の対象外。
- **TPL-20260716-01**: 新しく定義する load-bearing 語彙は単一の正典を持ち、他 doc は参照する。
  置き場を決めたら、他 doc からの再定義を許さない。
- out of scope: リリースフロー自体の変更（changesets 運用は不変）、言語 v2.0 の実施内容
  （#2162 の Syntax 2.0 プログラムが持つ）、`@experimental` / `@deprecated` annotation の
  仕様変更。

## 検討した選択肢

### 論点 1: 言語版を公開するか

- **案 1a — docs-only のまま**（現状維持）: 言語版は prose にだけ存在。
  - 利点: 作業ゼロ。
  - 欠点: 「このバイナリはどの言語版か」に永遠に答えられない。promotion gate が「v1.1 に
    載せる」と決めても、その v1.1 をユーザーに見せる場所が無い。§3 の写像問題も解けない
    （写像先の言語版が観測不能なままなので）。
- **案 1b — 言語版を first-class で公開する**（推奨）:
  - `packages/core` に定数（例 `KRS_LANGUAGE_VERSION = "1.0"`）を置き、spec docs
    （`syntax.md` / `style.md` 冒頭）にも言語版を明記して対応づける（TPL-20260511-02 の
    観点: doc と constant の同期は drift ガードで守る）。
  - `karasu --version` を「パッケージ版 + 言語版」の 2 行主義にする（例:
    `karasu 0.6.0` / `.krs language v1.0`）。現在ハードコードの `0.0.0` になっている
    `--version` の修正（build 時に package.json の version を注入）も同じ実装 Issue で直す。
  - CHANGELOG: 言語版が動くリリースは changeset / CHANGELOG に言語版遷移を明記する。
  - 利点: §1 の解消。§3 の写像も「観測可能な言語版」を得て初めて書ける。--version の
    実バグも同時に解消。
  - 欠点: 定数と spec doc の二重表現が増える（→ drift ガードのテストを同梱して緩和）。

### 論点 2: 言語版とパッケージ semver の関係（§3 の解消 — 本設計の中核決定）

- **案 2a — 結合: CLI を言語版に追従させる**（CLI を 1.0.0 に leap し、以後 言語 v1.x minor →
  CLI minor / 言語 v2.0 → CLI 2.0.0）:
  - 利点: 「v1.x minor」という既存の文言がそのまま実行可能になる。ユーザーから見て
    「CLI 1.x = 言語 v1.x」の単純な対応。
  - 欠点: CLI 1.0.0 は**言語以外の表面（コマンド体系・フラグ・出力形式）の安定も semver で
    約束する**ことを意味するが、その表面の棚卸しは行われていない。CLI 独自の破壊的変更
    （フラグ改名等）が起きるたびに、言語が変わっていないのに major を切るか、semver を破るかの
    二択になる。core（0.x のまま、API 約束なし）と CLI（1.x）の乖離も新たな混乱源。
- **案 2b — 分離: 言語版とパッケージ semver は独立の軸と明文化し、写像規則を言語版側の
  語彙で書き直す**（推奨）:
  - 言語版は案 1b の機構（constant + --version + CHANGELOG）で運ばれ、パッケージ版は
    changesets の semver 判断（その artifact の表面に対する互換性）で独立に決まる。
  - process.md / ADR-1820 の規定は「載せる**言語版**（後方互換な追加 = 言語 v1.x / 破壊 =
    言語 v2.0）を決め、**changeset の記述と CHANGELOG に言語版遷移を明記**する。パッケージの
    bump レベルは semver 規約に従い独立に決める（0.x の間は言語破壊でも semver 上 minor で
    合法だが、言語版遷移の明記により釣り合いを取る）」に書き直す。
  - リリース前チェックリストの当該項目は「版 target が bump レベルと整合するか」から
    「**言語版に触れる変更が changeset / CHANGELOG に言語版遷移として明記されているか**」に
    差し替わる — 0.x でも実行可能な検査になる。
  - 利点: 各 artifact が自分の表面に正直な semver を運用できる。CLI 1.0 の約束を audit なしに
    先取りしない。ADR-1314 の言語版セマンティクスは無傷。
  - 欠点: 「karasu 0.7.0 が .krs v1.1 を実装」のような 2 軸の読み解きをユーザーに求める
    （→ --version の 2 行表示と定義セクションで緩和）。
- **案 2c — 即時整列: 今すぐ CLI を 1.0.0 に leap**（案 2a の即時版）: 案 2a の欠点に加え、
  言語都合でない version leap は #1774 の floor leap と違い必然性が無い。却下。

### 論点 3: 語彙の正準化（§4 の解消）

主語で二分し、tier 側は正準語を 1 つずつ選ぶ:

| 概念 | 正準（推奨） | 非推奨シノニム / 区別すべき別概念 |
| --- | --- | --- |
| 互換を約束する notation tier | **stable**（強調時 `v1.0-stable`） | 「v1.0 freeze」は tier 名ではなく**イベント**（ADR-1314 の決定行為）として区別 |
| 互換を約束しない in-core tier | **experimental（notation tier）** | 「post-v1.0 watch」「notation watch」は tier 名ではなく**観察活動**（Epic #1816 / roadmap watch table）として区別 |
| 段階的廃止 tier | **deprecated（notation tier）** | — |
| ユーザーのモデルの標識 | **`@experimental` / `@deprecated` annotation**（常に `@` + backtick 表記） | tier と同語だが主語が逆。裸の "experimental" を annotation の意味で使わない |
| 言語版の表記 | **`.krs language v1.0`**（ユーザー向け出力・英語 prose）/ **「言語 v1.0」**（日本語 prose） | 「.krs v1.0」「krs-lang 1.0」「spec v1.0」等の表記ゆれは使わない。パッケージ版と並記するときは必ず軸を明示する（例: `karasu 0.6.0` + `.krs language v1.0` の 2 行） |

- 表記規約: karasu 自身の notation を語るときは「experimental（notation tier）」のように
  tier を明示するか文脈で notation を主語にする。ユーザーモデルの標識は**常に** `@` 付き
  backtick（`@experimental`）で書く。この規約だけで二義性は機械的に判別可能になる。
- 言語版の表記も正準化する（2026-07-30 レビューで確定）: ユーザー向け出力と英語 prose は
  `.krs language v1.0`、日本語 prose は「言語 v1.0」。`--version` の 2 行表示・spec docs
  冒頭の明記・CHANGELOG の言語版遷移の記載はすべてこの正準表記を使う。

### 論点 4: 定義の置き場

- **案 4a — `docs/roadmap.md` に §version vocabulary を新設**（tier 表の隣。Issue 提案）:
  - 利点: tier 表・promotion gate・Syntax 2.0 プログラムという「この語彙の主要な消費者」が
    同一ファイルにあり、参照距離が最短。
  - 欠点: roadmap は living な方針 doc で、将来の再構成時に定義が動きやすい。
- **案 4b — `docs/glossary.md` に節を追加**: 既存の単一正典パターン（TPL-20260716-01 の
  ガード対象）に載る。
  - 欠点: 同 glossary は「Keystone & permalink glossary」とスコープを名乗っており、版語彙は
    スコープ外。広げると focus が薄まる。en + ja の 2 ファイル維持コストも増える。
- **案 4c — roadmap に定義を置き、glossary は See also で指す**（推奨 = 4a + 相互配線）:
  正典は roadmap §version vocabulary の 1 箇所。`docs/process.md`（リリース運用の gate
  touchpoint）と `docs/concepts.md`（experimental 言及箇所）から参照を張り、
  `docs/glossary.md` の See also にも追加。TPL-20260716-01 の「単一の正典 + 他 doc は参照」を
  この語彙にも適用する（同 TPL の applicable_to に本語彙を追記するか、back-ref を置く）。

## 比較（論点 2 = 中核決定）

| 観点 | 案 2a 結合（CLI 1.0 leap） | **案 2b 分離（推奨）** | 案 1a docs-only 継続 |
| --- | --- | --- | --- |
| §3 チェックリストの実行可能性 | ○（文言そのまま） | ○（文言を言語版側に書き直す） | ×（写像先が観測不能のまま） |
| CLI 表面の semver の正直さ | ×（未 audit の安定約束を先取り） | ○ | ○ |
| core 0.x（API 約束なし）との整合 | ×（乖離が新たな混乱源） | ○（各軸独立と明文化） | △ |
| ADR-1314 との整合 | ○ | ○（言語版セマンティクス無傷） | ○ |
| ユーザーの読み解きコスト | 低（1 軸に見える） | 中（2 軸 — --version 2 行表示で緩和） | 高（言語版が不可視） |
| 将来の言語 v2.0 時 | major 強制 | 言語版遷移を明記し、パッケージは semver 判断（1.0 到達の好機として別途判断可） | — |

## Related TPLs

- [TPL-20260716-01](../test-perspectives/TPL-20260716-01-keystone-terms-single-home.md) —
  load-bearing 語彙の単一正典原則。論点 4 の拠り所。実装時に本語彙を同 TPL の
  applicable_to へ追記（または back-ref）する。
- [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) —
  spec doc ↔ source-of-truth の同期。言語版 constant（案 1b）と spec doc 記載の drift
  ガードの拠り所。

## 現時点の方針

**案 1b + 案 2b + 論点 3 の正準表 + 案 4c** を採用する:

1. **言語版を first-class で公開する**: core に `KRS_LANGUAGE_VERSION` 定数、
   `karasu --version` は「パッケージ版 + 言語版」の 2 行表示（現在の `0.0.0` ハードコードの
   バグ修正込み）、spec docs 冒頭に言語版を明記し drift ガードを同梱。
2. **言語版とパッケージ semver は独立の軸**と明文化する。process.md / ADR-1820 の
   「v1.x minor / v2.0 major を bump レベルに反映」は「載せる**言語版**を決め、changeset /
   CHANGELOG に**言語版遷移を明記**する（パッケージ bump は semver 規約で独立）」に
   書き直す。リリース前チェックリストも同様に差し替え、0.x で実行可能な検査にする。
3. **語彙の正準化**: tier = stable / experimental / deprecated（主語 = karasu の notation）、
   annotation = `@experimental` / `@deprecated`（主語 = ユーザーのモデル、常に `@` + backtick
   表記）。「v1.0 freeze」= イベント、「notation watch」= 観察活動として tier 名から区別。
   **言語版の表記も正準化する**: `.krs language v1.0`（ユーザー向け出力・英語 prose）/
   「言語 v1.0」（日本語 prose）。それ以外の表記ゆれ（「.krs v1.0」「krs-lang 1.0」等）は
   使わない。
4. **正典の置き場 = roadmap §version vocabulary**（tier 表の隣）。process.md / concepts.md /
   glossary.md から参照を配線し、TPL-20260716-01 の単一正典原則をこの語彙にも適用する。

決定の記録は **ADR-2124**（`depends_on: [ADR-1314]` — 言語版セマンティクスを前提とするため
参照のみの `related_to` ではなく前提関係、`refines: [ADR-1820]`）として昇格し、
本 doc は削除する。実装（--version 修正 + 定数 + drift ガード）は docs 改訂と分けて
実装 Issue を起票する。

### 実装の指針

1. **docs PR（本設計の主体）**: roadmap §version vocabulary 新設（axes 表 + 正準語彙表 +
   表記規約）、process.md リリース運用の 2 箇所（changeset 作成時 / リリース前チェック
   リスト）の書き直し、concepts.md / glossary.md からの参照配線、ADR-2124 起票。
2. **実装 Issue（follow-up）**: core `KRS_LANGUAGE_VERSION` + CLI `--version` 2 行表示
   （`0.0.0` ハードコード修正 = build 時 version 注入）+ spec doc ↔ constant の drift
   ガードテスト。
3. AT: `--version` の出力形式（言語版行を含む）は実装 Issue 側で AT を起こす。docs 側は
   リンク・アンカー整合の機械検証で足りる。

## 解消済みの問い

- **言語版の表記**（2026-07-30 レビューで確定）: **正準化する**。ユーザー向け出力・英語
  prose は `.krs language v1.0`、日本語 prose は「言語 v1.0」。論点 3 の正準表に反映済み。

## 決めないこと

- **CLI 1.0.0 への leap の時期**（案 2b 採用時の残論点）: 言語 v2.0 の実施（Syntax 2.0
  プログラム）は CLI 表面を棚卸しして 1.0.0 を切る自然な機会だが、本設計はその判断を
  **しない**（v2.0 プログラム / #2124 後続の判断に委ねる）。ここで決めるのは「今は
  結合しない」ことのみ。
