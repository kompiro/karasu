---
id: ADR-1895
title: アーキテクチャリバースハーネス — multi-subagent fan-out + CLI spine で repo を .krs 化する
status: accepted
date: 2026-07-14
topic: chat-ai
authors: [kompiro]
related_to: [ADR-1314]
scope:
  packages: [cli, core]
assumptions:
  - "file: .claude/skills/reverse-architecture/SKILL.md"
  - "file: packages/cli/src/coverage.ts"
  - "file: packages/cli/src/subtree.ts"
  - "symbol: packages/core/src/view/coverage-extract.ts :: extractCoverage"
  - "symbol: packages/core/src/index.ts :: compileProject"
  - "symbol: packages/core/src/formatter/formatter.ts :: serializeKrsFile"
---

# ADR-1895: アーキテクチャリバースハーネス — multi-subagent fan-out + CLI spine で repo を .krs 化する

## 背景

実 OSS repo（例: Dify）にエージェントを向けて `.krs` でアーキテクチャを再構成させると、top-level
（system / container / 物理 shape）は説得力ある形で復元できるが、domain interior（bounded context・
usecase・触る resource・cross-domain relation）に降りると出力が薄く曖昧になる。単一エージェントが外殻の
骨格に注意を使い切り、各 domain を深掘りする attention budget が尽きるためと観測した（Issue #1895）。

この ADR は #1895 の設計方向（元 Design Doc `repo-reverse-engineer-harness.md`）と v1 実装設計
（元 Design Doc `reverse-architecture-skill.md`）を集約し、実装（PR #1920）と実 repo 検証（Dify / hato の
逆生成）を経て確定した決定を記録する。

## 決定

**domain 単位で subagent を fan-out し、karasu CLI を deterministic spine に使う 4-phase ハーネスを採用する。**

- **分解軸は論理 domain（bounded-context）を primary**にする。物理出力（`translate` の container/service）と
  directory/module tree は seam 発見の *ヒント*に留め、割り切れない ball-of-mud は directory tree を size cap で
  分割し、低確信 seam は明示的に記録する（黙って落とさない）。
- **4-phase pipeline**: scout（物理 spine 抽出 + 論理 domain 列挙 + canonical id 採番）→ domain ごとの
  deep-dive fan-out（各 subagent は自 slice のみ読み usecase/entity/resource を fragment に書く）→ synthesis
  （fragment を merge、cross-domain edge は両側 report して `(src-id, dst-id, kind)` で dedup、identity は `id`）
  → validate/repair（`coverage` で薄い domain を検出し再 dive、`render` で描画確認）。
- **構造層に新規 CLI primitive を 2 つ追加**する（実装済み）:
  - `karasu coverage <file>` — domain ごとの密度（usecase / entity / resourceRef / edge）を複合スコア×相対
    正規化で出し、薄い domain を `thin` フラグで surface する（`core` の `extractCoverage`、CLI は薄い wrapper）。
  - `karasu subtree <node-id> <file>` — 生成済みモデルから 1 ノードの sub-tree を standalone `.krs` として
    切り出す（最小 wrap 既定 / `--with-ancestors`）。parse round-trip を保証する。
- **意味層 = subagent（判断）、構造層 = CLI（決定的）** の責務分離を貫く。`subtree` / `coverage` は source では
  なく**生成済み `.krs` モデル**を静的解析する。
- **orchestration は portable な Agent Skill**（`.claude/skills/reverse-architecture/SKILL.md`）として梱包する。

## 理由

- **均一な深さ**: slice を隔離して per-slice の attention budget を確保することが、単一エージェントの「domain が
  薄くなる」失敗を直接解く。karasu の中核テーゼが論理/物理の分離であり、痛点も domain interior なので、fan-out の
  単位は本来欲しい論理境界（A2）に合わせる。
- **物理層の hallucination 回避**: 物理 spine は `translate`（compose/k8s/openapi/db）で deterministic に起こし、
  エージェントは annotate に徹する。deterministic 部は principled API 経由（`compileProject` /
  `serializeKrsFile` / core 集計）で扱い、parser 内部を叩かない（[TPL-239](../test-perspectives/TPL-239-convenience-vs-principled-api.md)）。
- **「薄い」を定量化**: eyeball ではなく `coverage` で相対密度を測り、`thin` を機械検出する。全 domain を出力し、
  薄いものを黙って落とさない（[TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)）。
- **identity は `id`**: synthesis の dedup / merge / cross-slice edge 照合・`subtree` の検索は author-given `id` で
  行い、`label`（表示・翻訳文字列）は使わない（[TPL-2167](../test-perspectives/TPL-2167-id-not-label-for-identity.md)）。
- **round-trip 保証**: `subtree` が吐く `.krs` は再 compile できる（[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)）。
- **v1 syntax freeze を尊重**（[ADR-1314](1314-krs-spec-v1-freeze.md)）: ハーネスは新 `.krs` 構文を
  導入しない。既存語彙で書けない idiom は notation watch r2（#1816）/ cookbook（#1818）へ観測として feed する。
- **検証済み**: Dify（8 domain / 約 106 usecase）と hato（9 domain / 約 102 usecase）を実際に逆生成し、全 domain が
  非 thin の均一な深さで復元でき、0 compile error でレンダリングまで通ることを確認した。

## 実運用で確定した細部（Dify / hato 逆生成の学び）

SKILL に反映済み（PR #1934）:

- **機械生成/注入の後は必ず `karasu fmt`**。merge / node 注入直後の `.krs` はインデントが乱れ、閉じ `}` が浅く見える
  （parse は通るが可読性が落ちる）。
- **entity は identity のみでなく FK 由来の関連も持たせる**。cross-domain 整合のため、全 entity roster を 1 つの
  relations agent に渡して FK から関連を抽出し、参照保持側の entity に注入する。
- **`operations` の verb はカンマ区切り**（`read, delete`）。空白区切りは parse 不能なので synthesis で正規化する。
- **serverless（compose/k8s 無し）**は deploy manifest（`wrangler.toml` 等）の binding を infra ブロックに写す
  （D1/KV/vector → `database`、object store → `storage`、queue → `queue`）。translate adapter 化の是非は #1935 で検討。
- **enrichment 後は coverage を再測定**する。スコアは domain 間の相対値なので、ある次元（例: entity 関連）を足すと
  正規化基準が上がり、その次元を持たない domain が新たに thin と判定されうる。

## 却下した案

- **分解軸: 物理 seam を primary（A1）/ source tree を機械分割（A3）**。A1 は再現性が高いが modular monolith で論理
  seam を取り逃がす。A3 は ball-of-mud に強いが意味を持たない。→ A2 を primary にし、A1/A3 は seam ヒント・fallback に降格。
- **cross-domain edge を single owner（B1）**。どちらの slice も「自分のもの」と思わない edge を取り逃がす。→ 両側
  report + `(src,dst,kind)` dedup（B2）を採用。
- **synthesis で id を後から名寄せ（C1）**。LLM judgement で不安定。→ scout が canonical id を先に確定し subagent は
  annotate に徹する（C2）。resource は物理宣言を正準・論理側は参照。
- **固定深さ（E1）**。trivial slice を過剰・rich slice を過小モデル化する（単一エージェントの失敗の再現）。→ slice
  サイズ比例 budget + coverage 目標での停止（E2）。
- **正しさを eyeball 判定（F1）**。plausible ≠ correct を区別できない。→ hand-verified fixture corpus に対する
  structural recall（F2、定量検証 #638 に接続）。
- **coverage を `matrix` の拡張として実装**。`matrix` は usecase↔resource マトリクスという別の集計責務を持つため、
  coverage は責務が異なる別コマンドとして立てた。
- **coverage の薄さを絶対数閾値で判定**。repo 規模で閾値が変わり普遍値が無い。→ 複合スコア×相対正規化。
- **`subtree` の既定を祖先込み wrap**。repair ループで「その domain の中身だけ」を渡す用途に対し過剰。→ 最小 wrap を
  既定、`--with-ancestors` を opt-in に。

## 派生（後続・未解決）

- **eval corpus / metric の具体化**（structural recall の式・gold の作り方）は #638 に接続して確定する。
- **`subtree` の source-repo スライス供給**（v1 は `.krs` モデルの sub-tree のみ）。
- **`translate --from wrangler`（および adapter 採用原則）** は #1935 で壁打ち中。
