# reverse harness の分解粒度 — bounded-context 既定と構造 grounding の不採用

- **日付**: 2026-07-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2077](https://github.com/kompiro/karasu/issues/2077)
  - 証拠元 Issue: [#1991](https://github.com/kompiro/karasu/issues/1991)（spike）
  - 関連 ADR: [ADR-1895](../adr/1895-reverse-architecture-harness.md)（本 doc の昇格先が `related_to` で参照する。supersede しない — 論点 D）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1 syntax freeze）
  - 関連 TPL: [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)（薄い domain を黙って落とさない）、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（identity は `id`）
  - 隣接 Issue: [#2078](https://github.com/kompiro/karasu/issues/2078)（synthesis の loss）、[#2084](https://github.com/kompiro/karasu/issues/2084)（`lint-style` 誤用）、[#638](https://github.com/kompiro/karasu/issues/638)（eval corpus / metric）、[#1990](https://github.com/kompiro/karasu/issues/1990)（nest pivot、decision 4）、[#2036](https://github.com/kompiro/karasu/issues/2036)（scoped boundary — 論点 B の再検討条件）
  - 隣接 Design: [`scoped-boundary-declaration.md`](./scoped-boundary-declaration.md)（採用済み。案 B2 の前提を変える）
  - コード: `.claude/skills/reverse-architecture/SKILL.md`

## 背景・課題

ADR-1895 の reverse harness は「domain 単位で subagent を fan-out する」ことで
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

- ADR-1895 は **「固定深さ（E1）」を却下**している（trivial slice を過剰・rich slice を
  過小モデル化するため）。本 doc の粒度指示はこれと衝突してはならない。
  → **domain 数を渡す指示は E1 の再導入**にあたる。採る指示は *seam の判定基準*でなければならない。
- ADR-1895 は「分解軸: 物理 seam primary（A1）/ source tree 機械分割（A3）」を却下し、
  dir/module tree を **seam ヒント**に降格して残した。spike が refute したのは
  CODEOWNERS / commit-coupling であって dir tree ヒントではない。両者を混同しない。
- pivot design `karasu-nest-pivot-github-app.md` の decision 4 は構造 grounding を
  差別化要因として明記している。spike はこれを支持しない。ただし
  **decision 4 の再 scope は pivot design doc の管轄**（#2077 が明記）であり、本 doc は cross-ref に留める。

## 制約・前提

- **v1 syntax freeze**（ADR-1314）— 新 `.krs` 構文を導入しない。粒度の表現は既存語彙で行う。
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

- **ADR-1895 が却下した E1（固定深さ）の再導入**。
- そもそも任意 repo に対して gold 数は存在しない。運用不能。
- → 却下。

### 論点 B: aggregate をどう表現するか

#### 案 B1: domain 内の `usecase` / `entity` として表現する

**メリット**

- 既存語彙のみ。v1 freeze と整合。
- ADR-1895 の Phase 2 が既に「subagent は自 domain の usecase/entity/resource を書く」
  としており、追加の機構が要らない。
- gold（人手の domain 分解）と同じ粒度に揃う。

**デメリット**

- aggregate 境界そのものは `.krs` 上で明示的に見えない（暗黙になる）。

#### 案 B2: nested domain / boundary で aggregate を表現する

**メリット**

- aggregate 境界が構造として残る。
- **scoped boundary（#2036、design `scoped-boundary-declaration.md` 採用済み）で
  人間工学の障害は解消される見込み**。boundary を `domain` ブロック内に宣言でき、
  member は当該スコープの子の素の id になるため、#2079 が挙げた
  「冗長な top-level by-reference」「global-id 圧力」は成立しなくなる。
  すなわち B2 は *表現手段としては* もはや無理筋ではない。

**デメリット**

- **有効化する文法が未実装**。#2036 / #2079 はいずれも open で、
  採用されたのは design doc のみ。harness を未実装の文法に依存させられない。
- **spike の測定範囲外**。全 7 run は aggregate boundary を一切書かずに採点しており、
  BC 粒度で得た V-measure 0.83–1.00 は「aggregate を畳んだ」状態の数字である。
  B2 は各 deep-dive subagent に「どの usecase / entity を 1 つの aggregate に括るか」という
  **新しい判断**を課すが、その判断の質は未測定。
- 粒度問題を解くのに構造判断を harness に足すことになり、
  spike が「効くレバーはプロンプト一行であって機構ではない」と示した結論に逆行する。
- boundary は experimental notation であり、ADR-1820 の gate 下にある。
- → 不採用。ただし**却下ではなく延期**である（下記「未解決」参照）。
  B1 と B2 は排他ではなく、B2 は domain 内部の追加構造なので、
  粒度の決定を触らずに後から加算できる。

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

### 論点 D: ADR 昇格の形（supersede か追加か）

本 doc の決定を ADR-1895（harness ADR）に対してどう載せるか。ADR-1895 の「決定」は
5 項目あり、本 doc が触るのは **1 項目め（分解軸）に判定基準を足す**ことだけである。
4-phase pipeline・CLI primitive 2 つ・意味/構造の責務分離・Skill 梱包の 4 項目は無傷。
また C1 の grounding 不採用は ADR-1895 に対する**新規の制約**であって、
既存記述（dir/module tree を seam ヒントに使う）を覆すものではない。

#### 案 D1: ADR-1895 を supersede する統合版 ADR

**メリット**

- 読者が 1 本読めば harness の現行仕様が揃う。
- 分解軸は ADR-1895 の中核決定なので、部分改訂より置換のほうが素直との見方。

**デメリット**

- **無傷の 4 決定を全文転記する**ことになる（CLI primitive・責務分離・却下した案・
  実運用で確定した細部）。転記時の劣化リスクを負う。
- ADR-1895 は `superseded` として残るため、履歴を追う読者は結局 2 本に触れる。
  「1 本で済む」効果は現在の読者にのみ効く。
- `.claude/rules/adr.md` の supersede 規定は「**既存 ADR を覆すとき**」。本件は
  覆しではなく**精緻化 + 新規制約の追加**であり、規定の想定と噛み合わない。

#### 案 D2: 焦点を絞った追加 ADR（`related_to: [ADR-1895]`）

粒度規定（A1 + B1）と grounding 不採用（C1）だけを決定として持つ ADR を新規に起こし、
ADR-1895 は `accepted` のまま残す。

**メリット**

- 転記ゼロ。変わった点だけが記録され、diff が読者にそのまま伝わる。
- ADR-1895 が現役のままなので、無傷の 4 決定の出典が 1 箇所に保たれる。
- 覆しではない変更に supersede を使わずに済み、規約の意図と整合する。

**デメリット**

- harness の「分解軸」に関する記述が ADR-1895 と新 ADR の 2 本にまたがる。
  ただし**エージェントと実装者が実際に従う現行仕様は SKILL.md** であり、
  ADR は「なぜそう決めたか」の履歴である。運用上の単一情報源は SKILL.md 側で
  既に担保されているため、この分散のコストは D1 の転記コストより小さいと判断する。
- 将来さらに harness の決定が積み増されると分散が進む。その時点で
  統合 ADR（supersede）を起こす判断を改めて行う。

#### 案 D3: ADR-1895 を直接改訂（追記）

**デメリット**

- `.claude/rules/adr.md` が「旧 ADR を書き換えず、新 ADR で supersede する」と
  明記しており、規約違反。
- → 却下。

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

| 観点 | D1 supersede 統合版 | D2 焦点を絞った追加 ADR | D3 直接改訂 |
| --- | --- | --- | --- |
| 無傷 4 決定の転記 | **要**（劣化リスク） | 不要 | 不要 |
| 覆しか精緻化か | 覆し前提の規定を流用 | **精緻化として整合** | — |
| `.claude/rules/adr.md` 整合 | △（「覆すとき」の想定外） | 整合 | **違反** |
| 現行仕様の単一情報源 | ADR 1 本（ただし SKILL.md が実運用の正） | SKILL.md（ADR は履歴） | — |
| 履歴読者が触る ADR 数 | 2 本（superseded 込み） | 2 本 | 1 本 |

## 現時点の方針

**A1 + B1 + C1 + D2 を採用する。**

spike の中心的な発見は「効くレバーは安価なプロンプト指示であって、新しい機構ではない」だった。
したがって解も機構ではなくプロンプトに置く。実証された文言を書き換えずに移植し（A1）、
aggregate は既存語彙で domain 内に畳み（B1）、効かないと測られた grounding は
**測定結果ごと**不採用として記録する（C1）。

ADR-1895 の 4-phase pipeline・CLI spine・責務分離はいずれも無傷であり、
変わるのは「分解軸 = 論理 domain」の**粒度規定**と、grounding 不採用という**新規制約**である。
覆しではなく精緻化であるため、supersede（D1）ではなく **`related_to: [ADR-1895]` を持つ
焦点を絞った追加 ADR**（D2）として起こす。無傷の 4 決定を転記せず、変わった点だけを記録する。
harness の現行仕様の単一情報源は ADR ではなく **SKILL.md** 側で担保されている。

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

3. **ADR 昇格（D2 = 焦点を絞った追加 ADR）** — `docs/adr/2077-reverse-bc-granularity.md` を起こす。
   ファイル名の `<n>` は起点 Issue #2077（[#2083](https://github.com/kompiro/karasu/issues/2083)
   の Issue 番号ベース命名。旧 `YYYYMMDD-NN` 形式は廃止済み）。
   - frontmatter: `id: ADR-2077`、`related_to: [ADR-1895]`、`topic: chat-ai`、
     `scope.packages: [cli, core]`（ADR-1895 を踏襲）
   - **ADR-1895 は `accepted` のまま**。`supersedes` / `superseded_by` は設定しない
     （本件は覆しではなく精緻化 — 論点 D 参照）
   - `pnpm adr:validate` で `related_to` の整合を確認する
   - 本文は**転記せず**、変わった点だけを書く:
     - 「決定」= 分解軸の粒度規定（BC 粒度既定・実証文言の verbatim 移植）と
       構造 grounding の不採用
     - 「却下した案」= **構造 grounding（CODEOWNERS / commit-coupling）** と
       **domain 数指定（ADR-1895 の E1 再導入）** を測定値つきで記録。
       加えて本 doc の A2 / C2 / D1 の却下理由も引き継ぐ
     - 「背景」から ADR-1895 を参照し、4-phase pipeline 等の無傷部分は
       ADR-1895 が引き続き正であることを明記する
   - eval metric（下記 4）は本 ADR の「派生」節に記す
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
  `docs/adr/`（追加 ADR `2077-reverse-bc-granularity.md` の新規作成のみ。
  ADR-1895 は `accepted` のまま変更しない）、
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
- **aggregate 境界の構造的表現（延期であって却下ではない）** — B2 の障害だった
  boundary の人間工学は、scoped boundary の設計採用（#2036、
  `docs/design/scoped-boundary-declaration.md`）で解消される見込みであり、
  #1983（drill-down grouping）は既に closed。残る前提は **#2036 の実装着地**のみ。
  着地後に「deep-dive subagent が domain 内の aggregate を boundary として
  出力すべきか」を再検討する。判断材料は spike が持っていない
  （全 run が aggregate boundary なしで採点された）ため、
  再検討時は #638 の eval で B1 と B2 を比較して決めるのが筋。
  なお本 doc の**粒度の決定（何を 1 domain とするか）は B2 採否と独立**であり、
  B2 を後から足しても再検討は要らない。
- **粒度指示の repo 特性依存** — 4 repo（85 ファイル〜7.8k ファイル）で成立したが、
  monorepo / 多言語 repo など未測定の形状はある。統合 ADR では「実測 4 repo」の範囲を明示する。
