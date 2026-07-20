# reverse harness の分解粒度 — bounded-context 既定と構造 grounding の不採用

- **日付**: 2026-07-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2077](https://github.com/kompiro/karasu/issues/2077)
  - 証拠元 Issue: [#1991](https://github.com/kompiro/karasu/issues/1991)（spike）
  - 関連 ADR: [ADR-20260714-02](../adr/20260714-02-reverse-architecture-harness.md)（本 doc の昇格先が supersede する）、[ADR-20260616-06](../adr/20260616-06-krs-spec-v1-freeze.md)（v1 syntax freeze）
  - 関連 TPL: [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)（薄い domain を黙って落とさない）、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（identity は `id`）
  - 隣接 Issue: [#2078](https://github.com/kompiro/karasu/issues/2078)（synthesis の loss）、[#2084](https://github.com/kompiro/karasu/issues/2084)（`lint-style` 誤用）、[#638](https://github.com/kompiro/karasu/issues/638)（eval corpus / metric）、[#1990](https://github.com/kompiro/karasu/issues/1990)（nest pivot、decision 4）
  - コード: `.claude/skills/reverse-architecture/SKILL.md`

## 背景・課題

ADR-20260714-02 の reverse harness は「domain 単位で subagent を fan-out する」ことで
domain interior の**深さ**を均一化した。しかし**分解の粒度**については
「論理 domain（bounded-context）を primary にする」と方針を書いただけで、
scout に渡す具体的な判定基準を置いていない。

spike #1991 が 4 repo（DDD サンプル `library` / 自社 `hato` / `eShop` / `Dify`）を
人手 gold と突き合わせて測った結果、この粒度の空白が実測可能な品質差として現れた。
同時に、pivot #1990 decision 4 が差別化要因として名指している**構造シグナル grounding**
（CODEOWNERS + commit-coupling）が、効かないどころか大規模 repo で**悪化**させることも判明した。

本 doc は #2077 の要求（BC 粒度を既定に / 構造 grounding に投資しない）を、
harness と SKILL のどこにどう落とすかまで決める。

## 現状（インベントリ）

### SKILL.md Phase 1 step 3 の現行文言

```
3. **Enumerate the logical domains (primary axis).** Use the physical output
   (containers / services) and the directory / module tree as *seam hints* to
   infer bounded contexts. For a ball-of-mud that resists decomposition, split
   the directory tree with a size cap and **record low-confidence seams
   explicitly** (never drop them silently).
```

「bounded contexts を推論せよ」とは書いてあるが、**何をもって 1 つの context とみなすか**
（= どこで割り、どこで畳むか）の判定基準がない。無誘導の harness はこの空白を
aggregate 粒度で埋める。

### spike #1991 のスコア

主指標は V-measure（homogeneity = 誤併合の少なさ / completeness = 過分割の少なさ）と
pairwise F1。いずれも粒度ミスマッチに頑健。`domain-F1` は gold より細かく割ると脆いので参考値。

| run | repo | gold→pred | domain-F1 | pairwise-F1 | V-measure | homogeneity |
| --- | --- | --- | --- | --- | --- | --- |
| 無誘導 baseline | library | 3→7 | 0.40 | 0.36 | 0.48 | 0.82 |
| 無誘導 grounded | library | 3→7 | 0.40 | 0.36 | 0.48 | 0.82 |
| **BC baseline** | **library** | **3→3** | **1.00** | **1.00** | **1.00** | **1.00** |
| BC baseline | hato | 14→21 | 0.80 | 0.73 | 0.84 | 0.91 |
| BC baseline | eShop | 8→11 | 0.84 | 0.88 | 0.93 | 1.00 |
| BC baseline | Dify | 19→22 | 0.78 | 0.87 | 0.83 | 0.83 |
| BC **grounded** | Dify | 19→23 | 0.62 | 0.61 | 0.70 | 0.70 |

読み取れる事実は 3 つ。

1. **無誘導の過分割は clean refinement であって scramble ではない。**
   homogeneity 0.82 は「人間が分けたものを誤って併合することは稀」を意味する。
   harness の推論は壊れておらず、粒度の指示だけが欠けていた。
2. **一行の粒度指示で library は完全一致（全指標 1.000）**。しかも実在の多 domain
   アプリ 3 本に一般化し、homogeneity は全 repo で ≥0.83、gold domain は 4 repo 中 3 本で全数回収。
   「余分な」予測 domain は、hato ではまさにオーナーが gold レビューで畳んだ sub-context 群だった。
3. **構造 grounding は library で完全に無効（小数 3 桁まで baseline と同一）、Dify では悪化。**
   CODEOWNERS が縦割り・オーナー単位のスライスを駆動した ＝ Conway 最適化であって
   ubiquitous language ではない。狙う対象が違う。

なお BC 粒度は**安くもある**（library: 5 agent / 318k token vs 9 agent / 489k token）。
domain が粗いほど fan-out が減るため、品質とコストが同じ方向を向く。

### 過去決定との衝突確認

- ADR-20260714-02 は **「固定深さ（E1）」を却下**している（trivial slice を過剰・rich slice を
  過小モデル化するため）。本 doc の粒度指示はこれと衝突してはならない。
  → **domain 数を渡す指示は E1 の再導入**にあたる。採る指示は *seam の判定基準*でなければならない。
- ADR-20260714-02 は「分解軸: 物理 seam primary（A1）/ source tree 機械分割（A3）」を却下し、
  dir/module tree を **seam ヒント**に降格して残した。spike が refute したのは
  CODEOWNERS / commit-coupling であって dir tree ヒントではない。両者を混同しない。
- pivot design `karasu-nest-pivot-github-app.md` の decision 4 は構造 grounding を
  差別化要因として明記している。spike はこれを支持しない。ただし
  **decision 4 の再 scope は pivot design doc の管轄**（#2077 が明記）であり、本 doc は cross-ref に留める。

## 制約・前提

- **v1 syntax freeze**（ADR-20260616-06）— 新 `.krs` 構文を導入しない。粒度の表現は既存語彙で行う。
- **SKILL.md は portable な Agent Skill** — karasu repo 外の任意 repo に対して単体で動く必要があり、
  karasu の CLI 以外の外部ツール依存を増やさない。
- **E1（固定深さ）却下との整合** — 指示は基準であって数量ではない。
- **同一ファイルの並行変更** — `.claude/skills/reverse-architecture/SKILL.md` は #2078 / #2084 も触る。
  実装 PR はマージ順に応じて conflict 解消が要る。
- **out of scope**:
  - pivot #1990 decision 4 の再 scope（pivot design doc の管轄）
  - synthesis の loss 修正（#2078）
  - `lint-style` 誤用の修正（#2084）
  - #638 の eval corpus 実体化（本 doc は metric 候補を記述するに留める）
  - notation gaps（domain event / 非同期ジョブ）の spec 対応（#1816 / #1818）

## 検討した選択肢

### 論点 A: 粒度指示の書き方

#### 案 A1: spike で実証された文言をそのまま SKILL に置く

PROTOCOL.md の粒度指示（library を 1.00 にし、実 repo 3 本に一般化した文言）を
Phase 1 step 3 に blockquote で埋め込む。

**メリット**

- 4 repo で実測された文言そのもの。書き換えれば実証の外に出る。
- 「aggregate は domain 内の usecase + entity として表現せよ」という**表現先の指示**まで
  文言に含まれており、論点 B を同時に解決する。
- 具体例（Lending = patron/book/hold/checkout/daily-sheet で 1 domain）が含まれ、
  LLM に対して基準を最も伝えやすい。

**デメリット**

- 既存 step 3 より長い（6 行程度の増加）。

#### 案 A2: 要約して短く書く

「bounded context 粒度で分解せよ。aggregate 単位に割るな」程度に圧縮する。

**メリット**

- SKILL が短く保てる。

**デメリット**

- **split 条件（disjoint schema + weak coupling + separate ubiquitous language）が落ちる**。
  この 3 条件こそが scout に「どこで割ってよいか」を与える部分で、
  ここを削ると無誘導状態に近づく。実証の外に出る変更であり、再測定コストが要る。

#### 案 A3: gold の domain 数を渡す

scout に目標 domain 数を与える。

**メリット**

- 数値的には gold に一致させやすい。

**デメリット**

- **ADR-20260714-02 が却下した E1（固定深さ）の再導入**。
- そもそも任意 repo に対して gold 数は存在しない。運用不能。
- → 却下。

### 論点 B: aggregate をどう表現するか

#### 案 B1: domain 内の `usecase` / `entity` として表現する

**メリット**

- 既存語彙のみ。v1 freeze と整合。
- ADR-20260714-02 の Phase 2 が既に「subagent は自 domain の usecase/entity/resource を書く」
  としており、追加の機構が要らない。
- gold（人手の domain 分解）と同じ粒度に揃う。

**デメリット**

- aggregate 境界そのものは `.krs` 上で明示的に見えない（暗黙になる）。

#### 案 B2: nested domain / boundary で aggregate を表現する

**メリット**

- aggregate 境界が構造として残る。

**デメリット**

- boundary は #2079 で「domain の usecase 整理には人間工学的に不向き」と判明済み。
- 粒度問題を解くのに新しい構造の判断を harness に足すことになり、
  spike が「プロンプト一行で足りる」と示した結論に逆行する。
- v1 freeze 下で experimental 構文に harness を依存させるのは早い。
- → 不採用（将来 #1983 / #2079 の決着後に再考の余地あり）。

### 論点 C: 構造 grounding の扱い

#### 案 C1: 採用しない + SKILL に negative guidance を明記する

CODEOWNERS / commit-coupling grounding を harness に入れず、
かつ「入れるな、理由はこれ」を SKILL の Notes に 1 行残す。

**メリット**

- spike の測定（小規模で無効・大規模で有害）に忠実。
- **再導入を防ぐ**。pivot decision 4 が grounding を差別化要因として約束しているため、
  「書かなかった」だけでは将来の実装者が善意で足しに来る。negative result は
  明示的に記録しないと失われる。
- 「domain 分解 ≠ 組織分解」という karasu の論理/物理分離テーゼの言い直しでもあり、
  harness 固有の注意書きではなく製品の原則と一貫する。

**デメリット**

- SKILL に「やらないこと」が増える。

#### 案 C2: weak な tie-breaker として残す

seam 判断が拮抗したときのみ commit-coupling を参照する。

**メリット**

- 情報を完全には捨てない。

**デメリット**

- 「拮抗したとき」を LLM が判定するので、実質的に常時参照と区別できない。
  Dify の悪化は**分解そのものが変わった**結果であり、弱く効かせる制御手段がない。
- 効果が測られていない中間状態を運用に入れることになる（spike が測ったのは on/off の 2 点）。
- → 不採用。

#### 案 C3: 何も書かない（現状維持）

**デメリット**

- 現状 SKILL に CODEOWNERS の記述はないので実害は今すぐには出ないが、
  pivot decision 4 が生きている限り再導入圧力が残る。negative result が失われる。
- → 不採用。

## 比較

| 観点 | A1 実証文言そのまま | A2 要約 | A3 domain 数 |
| --- | --- | --- | --- |
| 実測での裏付け | あり（4 repo） | なし（再測定要） | — |
| E1 却下との整合 | 整合 | 整合 | **違反** |
| 任意 repo で運用可能 | 可 | 可 | 不可 |
| SKILL の増分 | 約 6 行 | 約 2 行 | 約 1 行 |

| 観点 | C1 不採用 + 明記 | C2 tie-breaker | C3 沈黙 |
| --- | --- | --- | --- |
| spike への忠実さ | 高 | 中（未測定の中間状態） | 中 |
| 再導入の防止 | あり | なし | なし |
| 実装コスト | 1 行 | 判定機構が要る | 0 |

## 現時点の方針

**A1 + B1 + C1 を採用する。**

spike の中心的な発見は「効くレバーは安価なプロンプト指示であって、新しい機構ではない」だった。
したがって解も機構ではなくプロンプトに置く。実証された文言を書き換えずに移植し（A1）、
aggregate は既存語彙で domain 内に畳み（B1）、効かないと測られた grounding は
**測定結果ごと**不採用として記録する（C1）。

ADR-20260714-02 の 4-phase pipeline・CLI spine・責務分離はいずれも無傷であり、
変わるのは「分解軸 = 論理 domain」の**粒度規定**である。ただし分解軸の規定は ADR の中核決定で
あるため、部分改訂ではなく **ADR-20260714-02 を supersede する統合版 ADR** として起こす
（読者が 1 本読めば harness の現行仕様が揃う状態を保つ）。

### 実装の指針

後続 PR（別 worktree）で以下を行う。

1. **`.claude/skills/reverse-architecture/SKILL.md` Phase 1 step 3 に粒度指示を追加**する。
   spike PROTOCOL.md の実証文言を blockquote でそのまま置く:

   > Decompose at **bounded-context granularity**, not per-aggregate. A bounded context groups
   > the aggregates that share a consistency boundary / ubiquitous language (e.g. all of
   > "Lending" — patron, book, hold, checkout, daily-sheet — is ONE domain, not five). Model
   > individual aggregates as **usecases + entities WITHIN** a domain, not as separate domains.
   > A cohesive, tightly commit-coupled module cluster = one domain. Only split when there is a
   > genuine context seam (disjoint schema + weak coupling + separate ubiquitous language).

   既存の「dir/module tree を seam ヒントに使う」「ball-of-mud は size cap で分割し
   低確信 seam を明示記録」は**残す**（spike の refute 対象外・fallback として有効）。
   ただし粒度指示に従属する位置づけであることが読み取れる順序に置く。

2. **SKILL.md の Notes に negative guidance を 1 行追加**する。趣旨:
   CODEOWNERS / commit-coupling などの組織シグナルで seam を決めない。
   小規模 repo では分解を動かさず、大規模 repo では Conway 方向（オーナー縦割り）に
   引っ張って domain 分解を悪化させることが #1991 で測定されている。

3. **ADR 昇格** — `docs/adr/YYYYMMDD-NN-reverse-architecture-harness.md`（統合版）を起こす。
   - frontmatter: `supersedes: [ADR-20260714-02]`、`topic: chat-ai`、
     `scope.packages: [cli, core]`（ADR-20260714-02 を踏襲）
   - ADR-20260714-02 側は `status: superseded` + `superseded_by: ADR-YYYYMMDD-NN`
   - `pnpm adr:validate` で双方向整合を確認する
   - 本文は ADR-20260714-02 の内容を引き継いだ上で、「決定」に粒度規定を追加し、
     「却下した案」に **構造 grounding（CODEOWNERS / commit-coupling）** と
     **domain 数指定（E1 の再導入）** を測定値つきで追加する
   - 「派生」の eval 項目に spike の metric（下記 4）を反映する
   - 本 Design Doc は同 PR で削除する

4. **eval metric の記述（#638 への接続）** — 統合 ADR の「派生」節に、
   spike で使った採点方式を #638 の metric 候補として記す:
   - **V-measure**（homogeneity / completeness）と **pairwise F1** を主指標にする。
     どちらも gold と予測の粒度がずれても壊れない。
   - `domain-F1`（greedy Jaccard ≥0.3）は参考値。予測が gold より細かいと脆い。
   - gold と予測が独自のクラスタ記法を使う大規模 repo では **file-level resolver** で
     ファイル単位に正規化してから採点する（prefix マッチが成立しないため）。
   - **homogeneity を重視する**根拠: 過分割は人手ラチェット（畳む）で安全に精錬できるが、
     誤併合は復元できない。安全な方向と危険な方向が非対称である。

5. **AT**: 本件は Agent Skill のプロンプト文言変更であり、`.krs` の挙動や CLI の
   出力が変わらないため、`docs/acceptance/` の AT レコードは起こさない。
   検証は #638 の eval（spike のハーネス再実行）に委ねる。
   実装 PR の Manual Verification には「SKILL.md の粒度指示が spike PROTOCOL の文言と
   一致すること」「`pnpm adr:validate` が通ること」を挙げる。

6. **TPL**: 本 doc は `docs/design/` 配下であり `docs/spec/` / `docs/concepts*.md` の
   新規セクションではないため、CLAUDE.md の proactive TPL 同梱義務は非該当。
   既存 TPL-20260510-05 / TPL-20260510-20 は統合 ADR に引き継ぐ。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: なし。`.krs` 構文・CLI の挙動は変わらない。
  変わるのは reverse harness が生成する domain の粒度（より粗く、gold に近く、より安価）。
- **ドキュメント更新**: `.claude/skills/reverse-architecture/SKILL.md`、
  `docs/adr/`（統合 ADR 新規 + ADR-20260714-02 の superseded 化）、
  本 Design Doc の削除。
- **テスト・examples への影響**: なし。
- **並行変更**: #2078 / #2084 が同じ SKILL.md を触る。マージ順に応じて conflict 解消。

## 未解決の問い / 決めないこと

- **pivot #1990 decision 4 の再 scope** — 構造 grounding を差別化要因から外し、
  粒度指示 + 人手 PR 還元ラチェットに置き換える判断は pivot design doc の管轄（#2077 が明記）。
  本 doc は測定結果を提供するのみ。
- **人手 PR 還元ラチェットの検証** — spike 未検証。decision 4 の 2 機構のうち
  有望なのはこちらだが、本 doc のスコープ外。
- **#638 の eval corpus 実体化** — gold の作り方・corpus の選定・CI 化は #638 で決める。
  本 doc は metric の形だけを候補として示す。
- **aggregate 境界の構造的表現** — B2（nested domain / boundary）は現時点で不採用だが、
  #1983 の drill-down grouping と #2079 の boundary 人間工学が決着したら再考の余地がある。
- **粒度指示の repo 特性依存** — 4 repo（85 ファイル〜7.8k ファイル）で成立したが、
  monorepo / 多言語 repo など未測定の形状はある。統合 ADR では「実測 4 repo」の範囲を明示する。
