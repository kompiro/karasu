---
name: reverse-architecture
description: >
  Reverse-engineer an arbitrary repository into a karasu architecture model
  (.krs) at uniform domain depth, using per-domain subagent fan-out plus the
  karasu CLI as a deterministic spine. Trigger when the user says:
  "アーキテクチャをリバース", "リポジトリを karasu 化", "このリポジトリを .krs に",
  "システム構造を .krs で起こして", "reverse architecture", "reverse-engineer
  this repo into karasu", "turn this repo into a karasu model", or similar
  phrases asking to reconstruct a system's architecture as .krs.
---

# Reverse Architecture Skill

任意のリポジトリを karasu モデル（`.krs`）に**均一な深さで**リバースする。
単一エージェントは top-level（system / container / 物理 shape）を復元できても、
domain interior（usecase / entity / resource）が薄くなる。本 skill は **domain ごとに
subagent を fan-out**して per-slice の attention budget を確保し、**karasu CLI を
deterministic spine**（物理抽出・切り出し・測定・検証・描画）に使う。

設計根拠は `docs/design/reverse-architecture-skill.md` と `docs/design/repo-reverse-engineer-harness.md`。

## 前提

- 対象リポジトリのパスと、karasu CLI（`karasu` コマンド）が使えること。
- 出力は 1 つの `.krs` プロジェクト（`index.krs` を推奨）に収束させる。**`.krs` が
  single source of truth** — エージェントは常に `.krs` を読み、chat 履歴を state にしない。
- **物理層は捏造しない**: compose / k8s / openapi / db があれば `karasu translate` で
  deterministic に起こし、エージェントは *annotate* に徹する。

## 責務分離（重要）

| 層 | 何を扱うか | 誰が | 手段 |
| --- | --- | --- | --- |
| 意味層 | source を読んで domain の usecase/entity/resource を**書く** | subagent（判断） | source 読解 |
| 構造層 | 書かれた `.krs` を**切る・測る・描く・検証する** | CLI（決定的） | `translate` / `subtree` / `coverage` / `render` / `lint-style` |

`subtree` / `coverage` は source ではなく **生成済み `.krs` モデル**を静的解析する。

## 手順（4-phase pipeline）

### Phase 1: Scout（1 パス）

1. リポジトリの top-level を把握する（言語・ビルド構成・エントリポイント・ディレクトリ構造）。
2. 物理 spine を deterministic に起こす:
   - `docker-compose*.yml` → `karasu translate --from compose <file>`
   - k8s manifests → `karasu translate --from k8s <dir-or-file>`
   - OpenAPI → `karasu translate --from openapi <file>`（service 直下の usecase）
   - DB schema → `karasu translate --from db <file>`（database/table）
3. **論理 domain を列挙する（primary axis）**。物理出力（container/service）と directory/module tree を
   *seam ヒント*にして bounded-context を推定する。割り切れない ball-of-mud は directory tree を
   size cap で分割し、**低確信の seam は明示的にメモする**（黙って落とさない）。
4. canonical id を採番する（**英語 PascalCase**。`label` はユーザー言語）。id は以降 subagent が
   invent せず踏襲する。
5. 出力: `skeleton.krs`（system/service/domain の骨格 + 物理 spine）+ **domain work-list**。

### Phase 2: Deep-dive fan-out（domain ごとに subagent）

domain work-list の各 domain について **subagent（Task ツール）を 1 つ起動**する。各 subagent は:

- 自分の domain に対応する **source slice だけを読む**（他 domain は読まない = 均一な深さ）。
- その domain の `usecase` / `entity` / `resource` を `.krs` fragment に書く。
  - `usecase` は触る `resource`（`resource InfraId.SubId { operations ... }`）を子に持つ。
  - `entity` は関連を edge で表す（属性は書かない）。
  - resource は**物理宣言を参照**する（論理側は参照が正準形）。
- 自分の fragment を `karasu lint-style <fragment>` で検証してから返す。

並列で起動してよい（domain 間は独立）。

### Phase 3: Synthesis（1 パス）

1. 各 fragment を skeleton にマージして 1 つの `.krs` にする。
2. **cross-domain edge** は両側 subagent が観測しうる。`(src-id, dst-id, kind)` の複合キーで
   dedup する。方向は参照する側（FK 保持側）から。
3. identity は `id` で判定する（`label` では判定しない）。
4. resource の所在衝突は「物理宣言は 1 箇所・各 domain は参照」で構造的に解消する。

### Phase 4: Validate & repair loop

1. `karasu coverage index.krs --format json` で **薄い domain（`thin: true`）を定量検出**する。
2. `karasu render index.krs` で**描けるか**確認する（描けない = 構造破綻）。
3. 薄い domain があれば、その domain を再 dive する:
   - `karasu subtree <DomainId> index.krs` で現状 slice を取り出し、subagent に渡して深掘りさせる。
   - 追記して再度 `coverage` で確認する。
4. **停止条件**: 全 domain が `thin: false`（＝ coverage 目標到達）になったら終了。数ラウンド回しても
   解消しない domain は「source 側に実体が薄い」可能性としてメモに残す（無理に膨らませない）。
5. モデリングできなかった idiom（notation gap）は cookbook（#1818）/ notation watch（#1816）へ観測として残す。

## 成果物

- `index.krs`（+ 必要なら `deploy.krs` 等）。**`.krs` が source of truth**。
- coverage レポート（どの domain がどれだけの深さで復元できたかの定量記録）。
- notation gap のメモ（あれば）。

## 注意

- **物理層を捏造しない**（translate を使う）。**id で同一性**（label 不可）。**薄い domain を黙って落とさない**
  （coverage で surface）。**新 `.krs` 構文を導入しない**（v1 freeze）。
- subagent には「自分の domain の source slice だけ読む」ことを明示する（全体を読ませると均一な深さが崩れる）。
