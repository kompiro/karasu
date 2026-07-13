# Repo → karasu 逆生成ハーネス（multi-subagent + CLI）

- **日付**: 2026-07-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1895](https://github.com/kompiro/karasu/issues/1895)
  - 関連 Issue: AI authoring pillar（[#355](https://github.com/kompiro/karasu/issues/355) / [#356](https://github.com/kompiro/karasu/issues/356) `translate`, [#362](https://github.com/kompiro/karasu/issues/362)–[#364](https://github.com/kompiro/karasu/issues/364) Chat UI）、karasu-nest [#1783](https://github.com/kompiro/karasu/issues/1783)、notation watch r2 [#1816](https://github.com/kompiro/karasu/issues/1816)、cookbook [#1818](https://github.com/kompiro/karasu/issues/1818)、comprehension [#1817](https://github.com/kompiro/karasu/issues/1817)、定量検証 [#638](https://github.com/kompiro/karasu/issues/638)
  - 関連 TPL: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)、[TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)、[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)、[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)
  - コード: `packages/cli/src/translate/`, `packages/cli/src/{diff,apply,matrix,lint-style,render}.ts`, `packages/core/src/translate/translate.ts`

## 背景・課題

実 OSS repo（例: **Dify**）にエージェントを向けて `.krs` でアーキテクチャを再構成させると、
**トップレベル（system / container / physical・deploy shape）は説得力ある形で復元できる**。
一方、**domain interior（bounded context・usecase・触る resource・cross-domain relation）**に
降りると出力が**薄く・曖昧になる**。単一エージェントが外殻の骨格に注意を使い切り、各 domain を
深掘りする attention budget が尽きるためと観測している。

**仮説**: **domain / bounded context / subsystem 単位で subagent を fan-out** し、各 subagent が
**自分の slice だけを focused deep-read** して、その後 **synthesis で slice をひとつのモデルに統合**すれば、
全体を**均一な深さ**で表現できる。divide-and-conquer が parallelism と per-slice attention budget の
両方を買う。加えて **karasu CLI を loop に組み込む**と、deterministic な部分（compose/k8s/openapi/db
からの抽出・検証・レンダリング）を CLI に任せ、エージェントは judgement が要る所だけに集中できる。

本 Design Doc の deliverable は **コードではなく設計方向** — decomposition 戦略、agent/skill/CLI の
責務分割、追加すべき最小 CLI primitive、fixture corpus + eval 方法に合意し、固まったら実装 Issue に展開する。

## 現状（インベントリ）

逆生成の「spine」に使える既存 CLI 面は既に揃っている。ハーネスが新規に作るべきものを最小化するため、
現状を整理する。

| 面 | コマンド | 逆生成での役割 |
| --- | --- | --- |
| 物理層抽出 | `karasu translate --from compose\|k8s\|openapi\|db`（[translate.ts](../../packages/core/src/translate/translate.ts) `TranslateFormat`） | deploy.krs / service usecase / table を deterministic に生成。エージェントは *annotate* するだけで invent しない |
| 差分・成長 | `karasu diff <before> <after>` / `karasu apply` | slice を incremental に merged モデルへ流し込む |
| 検証 | `karasu lint-style` / `karasu render`（描けるか） | 各 subagent 出力を synthesis 前に機械チェック |
| カバレッジ | `karasu matrix <file>` | 既に coverage 的な集計を持つ。逆生成の「thinned out」検出に転用できるか要確認 |
| 構造化編集 | `karasu insert` / `append` / `remove` | skeleton へのノード追加を deterministic に行う |

**不足している primitive**（本設計の焦点）:
- **slice の切り出し** — 「domain X の sub-tree だけを渡す」scope 取得（エージェントに全体を読ませない）。
- **coverage accounting** — 「どの domain が薄いか」を eyeball ではなく定量で出す（`matrix` の拡張余地）。

## 制約・前提

- **`.krs` が single source of truth**（[TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)）。
  エージェントは常に `.krs` を再読込し、chat 履歴を state にしない（AI-support 設計原則と一致）。
- **identity は author-given `id`、`label` ではない**（[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)）。
  synthesis の dedup / merge / cross-slice edge 照合は `id` で行う。`label` はユーザー言語に従う表示文字列。
- **外部 repo は trust boundary の外**（[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)）。
  compose/k8s/openapi は canonicalize してからモデルに入れる。
- **deterministic 部は principled API 経由**（[TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)）。
  translate/diff/apply を CLI 越しに使い、core の内部 convenience API を叩かない。
- **v1.0 syntax は freeze 済み**（ADR-20260616-06）。逆生成は**新 `.krs` 構文を導入しない** — 既存語彙で書ける範囲を対象にし、
  書けない idiom は notation watch r2（#1816）/ cookbook（#1818）へ観測結果として feed する（本設計では構文拡張しない）。
- **out of scope**: 対話的 Chat authoring（#362–364 の counterpart。本設計は *bulk-reverse* 側）、format↔format interop（#1832）、
  大図の perceivability（#1817 は consumer 側）。

## 検討した選択肢

論点は Issue の 6 つの open question に対応する。各論点で選択肢を挙げ、推奨方向を示す。

### 論点 A: decomposition axis（どの単位で fan-out するか）

- **案 A1: 物理/deploy shape を primary seam に**。`translate` が deterministic に出す container / service を
  slice 境界にする。大きい container 内は bounded-context で二次分割。
- **案 A2: bounded-context（論理 domain）を primary に**。scout が意味的に domain を列挙して切る。
- **案 A3: source tree（directory/module）を機械分割**。size cap で割る。

**トレードオフ**: A1 は境界が deterministic で再現性が高いが、論理境界と物理境界がずれる repo（modular monolith 等）で
seam を取り逃がす。A2 は本来欲しい単位だが、seam 発見自体が LLM judgement で不安定。A3 は ball-of-mud に強いが
意味を持たない。→ **推奨: A1 を骨格に、A2 で refine、A3 を ball-of-mud fallback**。scout が物理 seam を第一候補にし、
物理境界の内側が大きすぎる場合のみ bounded-context 分割、どちらも効かない塊は directory tree を size cap で割り、
**低確信 seam を明示的に log する**（[TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md) の
「暗黙フィルタで黙って落とさない」に沿う）。

### 論点 B: cross-domain edge（slice の境界をまたぐ edge の扱い）

- **案 B1: single owner**。edge を片側 slice に owner 付けし、そちらだけが report。
- **案 B2: both-report + reconcile**。両 slice が観測した edge を report し、synthesis で dedup。

**トレードオフ**: B1 は重複が無いが、**どちらの slice も「自分のもの」と思わない edge を取り逃がす**（Issue が懸念する失敗）。
B2 は重複するが取りこぼしにくい。→ **推奨: B2**。scout が張る「edge ledger」に両側の観測を積み、synthesis が
`(src-id, dst-id, kind)` の複合キーで dedup する（[TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md):
区別に必要な次元をキーに含める）。方向は domain-entity-modeling の既定（FK 保持側 = 参照する側）に倣う。

### 論点 C: synthesis conflict（命名衝突・resource の所在ずれ）

- **案 C1: 各 subagent が自由に id を付け、synthesis で名寄せ**。
- **案 C2: scout が canonical id namespace を先に確定し、subagent はその skeleton を annotate**。

**トレードオフ**: C1 は subagent が独立だが名寄せが LLM judgement で不安定。C2 は scout が id を pre-seed するため
**subagent が id を invent せず annotate に徹する**（AI-support の unclassified パターンと同じ思想）。
→ **推奨: C2**。synthesis の identity 照合は `id`（[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)）。
resource の所在は **物理宣言（translate 出力）を正準形とし、論理側は参照で指す**（domain-entity-modeling の
「resource 論理参照が正準形」に一致）。→ resource-location 衝突は「宣言は物理側 1 箇所・各 domain は参照」で構造的に解消。

### 論点 D: skill / subagent / CLI の分割

- **Agent Skill（portable）** = 4-phase orchestration workflow（scout → fan-out → synthesis → validate/repair）を
  記述した prompt/手順。repo に依存しない。
- **Subagent 定義** = `scout` / `domain-deep-diver`（slice ごとに parameterize）/ `synthesizer` の 3 種。
- **CLI（deterministic spine）** = 既存の translate/diff/apply/lint-style/render/matrix + **新規最小 primitive 2 つ**:
  1. **scope 切り出し**（`karasu subtree <node-id>` 相当）— subagent に slice だけ渡す。
  2. **coverage report** — domain ごとの depth/カバレッジを定量化し「thinned out」を明示検出。

**推奨**: この 3 分割。新規 CLI は上記 2 primitive に絞り、他はすべて既存面の再利用。CLI は principled API 越し
（[TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)）。

### 論点 E: depth control（domain ごとの深さ制御）

- **案 E1: 固定深さ**（全 domain 一律 N 段）。
- **案 E2: slice サイズ比例の budget + coverage 目標での停止**。

**トレードオフ**: E1 は trivial slice を過剰モデル化し rich slice を過小モデル化する（まさに単一エージェントの失敗の再現）。
→ **推奨: E2**。scout が出す slice サイズ（LOC / file 数）で budget を配分し、固定深さではなく coverage report の
目標到達で停止。over/under-modeling を coverage で観測する。

### 論点 F: ground truth / eval（正しさの担保）

- **案 F1: eyeball**（人が見て妥当そうか）。
- **案 F2: hand-verified fixture corpus に対する structural recall**。Dify + 手検証可能な数 repo を gold `.krs` 化し、
  node/edge recall を depth level 別に測る。

**推奨: F2**。plausible ≠ correct を定量で区別する。これは定量検証 [#638](https://github.com/kompiro/karasu/issues/638) の
延長線上 — corpus と metric を #638 に接続する。逆生成中に出た notation gap は #1816 / #1818 へ feed。

## 比較

| 観点 | 単一エージェント（現状） | 本ハーネス（fan-out + CLI spine） |
| --- | --- | --- |
| domain 深さの均一性 | 外殻厚く domain 薄い | slice 隔離で均一（狙い） |
| 物理層の正確さ | hallucination リスク | translate で deterministic |
| 並列性 | なし | slice 単位で並列 |
| 「薄い」検出 | eyeball | coverage report で定量 |
| 実装コスト | 低（プロンプトのみ） | 中（新 CLI primitive 2 + skill/subagent 定義 + eval corpus） |

## 現時点の方針

**fan-out + CLI-spine ハーネスを採用**する。4-phase pipeline（scout → domain-deep-dive fan-out → synthesis →
validate/repair loop）を軸に、上記推奨（A1+A2+A3 fallback / B2 / C2 / D 3分割 / E2 / F2）で組む。CLI 新規追加は
**scope 切り出し**と **coverage report** の 2 primitive に絞り、translate/diff/apply/lint-style/render/matrix は既存面を再利用する。

### 実装の指針

1. **CLI primitive を先に landing**（他パッケージから独立して価値がある）:
   - `karasu subtree <node-id> <file>` — 指定ノードの sub-tree を切り出して出力（scope 供給）。
   - coverage report — `matrix` を拡張するか新規 `karasu coverage` として、domain ごとの node/edge 密度を出す。
     まず `matrix` の現出力を調べ、拡張で足りるか判断する。
2. **subagent 定義**（`scout` / `domain-deep-diver` / `synthesizer`）を用意する。
3. **Agent Skill**（4-phase orchestration）を packaged prompt として用意する。
4. **eval corpus**: Dify + 手検証可能な 1–2 repo を gold `.krs` 化し、structural recall metric を定義（#638 に接続）。
5. AT: `docs/acceptance/` に新規ファイル。TC は:
   - `translate` 出力の物理層が gold と一致する（deterministic spine の回帰）
   - fan-out 後の合成モデルが単一エージェント baseline より domain node/edge recall が高い
   - cross-domain edge が両側 report → synthesis で `(src,dst,kind)` 重複解消される
   - coverage report が「薄い domain」を検出する
6. ADR 昇格: 設計方向が固まった段階でこの Design Doc を `docs/adr/` に昇格し、同 PR で本ファイルを削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: **なし**（新 CLI primitive の追加のみ、既存構文・既存コマンドの挙動は不変）。
- ドキュメント更新: 新 CLI サブコマンドを `docs/spec/` / CLI ヘルプに追記。逆生成 workflow の guide。
- テスト・examples への影響: eval corpus は repo 外または `examples/` 外の fixture として扱う（生成レポートは repo に commit しない — 分析生成物の扱いに準拠）。

## 未解決の問い / 決めないこと

- **decomposition の primary axis**（論点 A: 物理 seam 起点 vs 論理 domain 起点 vs ハイブリッド）— 推奨はハイブリッドだが要合意。
- **coverage primitive**（論点 D-2）: `matrix` 拡張で足りるか、新規 `karasu coverage` を立てるか — 実コード確認後に確定。
- **eval の metric 定義**（論点 F）: structural recall の具体式（node recall / edge recall / depth-level 別）と gold の作り方 — #638 と擦り合わせ。
- **scope 供給の粒度**: `subtree` が返すのは merged model の sub-tree か、source repo の該当ファイル群か（両方あり得る）。
- **本設計をどこまで実装 Issue に割るか**: CLI primitive / subagent 定義 / skill / eval corpus を別 Issue に分けるか epic 化するか。
