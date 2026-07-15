# karasu-nest ピボット — GitHub App による hosted reverse + preview サービス

- **日付**: 2026-07-15
- **Issue**: #1783（nest 壁打ち・本 doc の親）／関連 #1828 permalink layer・#1960 private permalink・#1787 Phase 3 in-site editor
- **ステータス**: 壁打ち（brainstorm）— 方向性の合意用。技術詳細・実装は後続 design/ADR
- **関連**:
  - [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（nest v1 = **render-only / BYO reverse / stateless / 認証なし**。本ピボットが覆す対象）
  - [ADR-20260407-04](../adr/20260407-04-cloudflare-deployment-and-byok-ai.md)（BYOK・サービスは secret を持たない）
  - [ADR-20260714-02](../adr/20260714-02-reverse-architecture-harness.md)（reverse-architecture harness — 現状は **BYO/ローカル** の Claude Code skill）
  - PRD [`docs/prd/keystone-primary-path.md`](../prd/keystone-primary-path.md)（read/record split・**solo-maintainer economics**）
  - [`docs/design/private-repo-permalink.md`](./private-repo-permalink.md)（#1960、本ピボットに吸収される client-PAT 案）

## 背景・課題

#1960（private repo の repo-backed permalink）を詰める中で、client-side BYO-PAT 方式は「reader が PAT を貼って自分でブラウザ fetch する」＝ **実質ローカルツールに収束**し、かつ nest（read/awareness funnel）を「自分の private システム」＝ retained core の領域に引き込む**コンセプト衝突**を起こすと判明した（#1960 design doc）。

その反省から出た代案が本ピボット: **karasu-nest を「任意の repo を GitHub App 経由で読み、AI でコードリバースして `.krs` を生成し、`.krs` を返すと同時に図示する hosted サービス」に転換する。** これは #1783 が挙げた **Model A（GitHub proxy）** を、① **GitHub App installation 認証**（private repo も App が入っていれば読める・reader は PAT 不要）と、② **server-side AI reverse**（repo に `.krs` が commit されている前提を外す）で完成させる形である。

これが解く問題:

- **private access の摩擦**（#1960）— installation 認証で reader ごとの PAT が不要に。
- **「repo に `.krs` が commit されている前提」**（#1786 Phase 2 resolver の弱点）— AI 生成で前提が消える。実際に committed `.krs` を持つ repo は今ほぼ無い。
- **read（図示）と record（`.krs` を返す/還元）の統合** — #1787 Phase 3（in-site editor + PR 還元）への布石。

## 制約・前提 — このピボットが**覆す**過去決定

> 設計着手前の過去決定確認（hane ADR-63）。以下は明示的に採用済みの決定で、本ピボットは**全面的に覆す**。実装に進むなら supersede ADR で新根拠を記録する前提。

| 覆す決定 | 元の内容（ADR） | ピボットでの扱い |
|---|---|---|
| **server-side LLM reverse 却下** | ADR-20260626-01「サービス側での LLM reverse は却下（コスト・キャッシュ・**推論メータリング**）。reverse は **BYO**とし v1 から外した」 | **中核として採用**（＝最大の反転）。コスト/メータリングをどう封じるかが本 doc の要 |
| **stateless / 保存型ストア却下** | ADR-20260626-01「stateless inline・DB なし」「保存型 paste は却下」 | **stateful 化**（installation records・生成 `.krs` cache・webhook）。D1/KV を導入 |
| **認証なし** | ADR-20260626-01「認証なし（BYOK が実質認証）」 | **GitHub App 認証基盤**を新設 |
| **サービスは secret を持たない** | ADR-20260407-04（BYOK） | GitHub App は **private key** を持つ。加えて server reverse なら **LLM API キーと推論コスト**も |

そして**最大の新規リスク（新しい制約）**: **他者の private ソースコードを hosted LLM に通す**。データ保持・LLM プロバイダのデータポリシー・コード中の secret 露出・repo owner の同意/責任範囲 — permalink スライスとは桁違いの信頼/セキュリティ/法務面。ここを設計で抑えられなければピボット自体が成立しない。

さらに **solo-maintainer economics**（keystone PRD）: nest が「zero-ops な stateless ページ」から **運用される SaaS**（認証・webhook・AI コスト・状態・abuse/moderation・データ保持）に変わる。1 人運用で 6 面が既に重い、という PRD の懸念が急所になる。

## 検討した選択肢

論点（軸）ごとに、ピボット内での選択肢を並べる。

### 軸1: 認証・repo アクセス

- **案 1-A: GitHub App（installation 認証）** — org/user が App を選択 repo に install → App が installation token で読む。reader は認証不要（App の可視性設計次第）。private を綺麗に解く唯一の道。
  - ❌ App private key を持つ（secret 保有）。install/webhook の state。abuse（誰の repo でも図示され得る）設計。
- **案 1-B: reader BYO-PAT（#1960 案）** — reader が PAT 持ち込み。
  - ❌ 前述のとおり local ツール収束・摩擦。ピボットの旨味（installer 単位の一括アクセス・reader 負担ゼロ）が出ない。
- **案 1-C: public-only 据え置き（現状）** — private を諦める。
  - ⭕ zero-ops 維持。ただしピボットの動機（private）を捨てる。
- **方向**: private を解くなら **1-A（GitHub App）** が本命。ただし secret/state/abuse を背負う覚悟が要る。

### 軸2: AI reverse のホスティングとコスト負担

ADR-20260626-01 が却下した「server AI reverse」の**コスト/メータリング**を誰がどう負うか。

- **案 2-A: サービスが LLM コストを負担（無料 hosted reverse）** — UX 最良。
  - ❌ solo-maintainer が他者 repo の推論コストを無制限に負う → **経済的に破綻**しうる。rate-limit/abuse 必須。
- **案 2-B: installer/reader が LLM key を持ち込む（BYO-LLM key）** — ADR-20260626-01 の BYO 精神を「reverse」に適用。コストは持ち込み側。
  - ⭕ solo economics を守れる（サービスは推論コストゼロ）。既存 BYOK パターン（`api-key-storage.ts`）を LLM key に流用。
  - ❌ install した org が key も供給する二段構え。UX 摩擦。
- **案 2-C: 従量課金 / プラン** — コストを価格転嫁。
  - ❌ 課金基盤・請求・税・サポート = SaaS 運用の本格化。solo には重い。
- **方向**: solo economics を優先するなら **2-B（BYO-LLM key）**が現実解。将来 traction が出れば 2-C。2-A は abuse で燃えるので少なくとも strict rate-limit 前提。

### 軸3: state / 永続化

- **案 3-A: SHA-keyed 生成キャッシュのみ（最小 state）** — 生成 `.krs` を repo+SHA で cache（KV/D1）。installation は GitHub 側が持つので最小化。
  - ⭕ stateful 化を最小限に。immutable な SHA cache は素直。
- **案 3-B: フル state（install records・生成物・ユーザー設定・履歴）** — SaaS 相当。
  - ❌ 運用・データ保持・GDPR 面が本格化。
- **方向**: **3-A から始める**（生成物の SHA cache + GitHub App の installation は GitHub 側管理）。3-B は traction 後。

### 軸4: private code のデータ扱い（信頼設計）

- repo owner の**明示同意**（App install 時の scope 提示 + 図示・LLM 送信の告知）。
- LLM プロバイダの**データ保持ゼロ / 学習不使用**設定（Anthropic の zero-retention 等）を必須要件に。
- 生成 `.krs` は**構造のみ**（コード本文・secret を含めない）。reverse harness の出力が構造抽象である点（ADR-20260714-02）を活かし、生成物に生コードが混ざらない保証をテストで担保。
- 生成物 cache は owner がパージできる／install 解除で消える。
- **方向**: これはピボットの**成立条件**。曖昧なら public-only に留める判断もあり得る。

### 軸5: read と record の統合（#1787 Phase 3 との接続）

- 生成 `.krs` を「返す」= repo に **PR で還元**（committed `.krs` を seed）→ 以後は render-only（安いパス）に戻れる。
- これで nest（read/awareness）と karasu 本体（record）の**橋**になり、#1960 の「nest/core 境界」問題を「nest が record を core に還元する」設計で解消できる可能性。
- **方向**: 有望だが Phase 3（#1787）領域。ピボット v1 のスコープ外に置き、接続点だけ設計に残す。

## 比較（ピボット v1 の推奨スライス）

| 軸 | v1 推奨 | solo economics | 信頼/データ | 覆す ADR |
|---|---|---|---|---|
| 1 認証 | GitHub App installation（private 解禁） | △（state/secret 増） | install 同意で担保 | 20260626-01 no-auth |
| 2 AI コスト | **BYO-LLM key**（installer 持ち込み） | ○（推論コスト転嫁） | 送信は installer の key/責任 | 20260626-01 server-reverse 却下 |
| 3 state | SHA-keyed 生成 cache のみ | ○（最小） | owner パージ可 | 20260626-01 stateless |
| 4 データ | 構造のみ・零保持・同意・パージ | — | **成立条件** | — |
| 5 record 還元 | v1 スコープ外（接続点のみ） | — | — | — |

**全体像（v1 案）**: org が karasu GitHub App を repo に install（LLM key も持ち込む=BYO）→ nest が installation token で `.krs`（未 commit なら App が読んだコードを **installer の LLM key** で reverse・構造のみ）→ 生成 `.krs` を SHA-keyed cache に置き図示 → 任意で PR 還元（Phase 3）。**サービスは推論コストを負わず**、private code は **零保持・構造のみ・owner 同意**で扱い、state は生成 cache に最小化する。覆す 3 決定（server-reverse 却下 / stateless / no-auth）は supersede ADR で新根拠を記録。

## 現時点の方針

1. **ピボットの是非**: private を解き「committed `.krs` 不要」にするには GitHub App + hosted reverse が要る。だが v1 で意図的に避けた **server AI・state・auth・コスト**へ全面的に踏み込む。**採るなら覆す 3 決定を supersede ADR で明示**する。
2. **成立条件は軸4（データ扱い）**: 他者 private code を LLM に通す信頼設計（同意・零保持・構造のみ・パージ）が引けなければ、ピボットは private を諦め public-only reverse に縮小すべき。
3. **solo economics の急所は軸2**: サービスが推論コストを負う無料 SaaS は破綻しうる → **BYO-LLM key（2-B）**でコストを持ち込み側に寄せるのが現実解。
4. **段階案**: (1) **public repo の hosted reverse**（BYO-LLM key・SHA cache のみ・App 不要 or public install）で「committed `.krs` 不要」の価値を先に検証 → (2) **GitHub App private**（installer が LLM key も供給）→ (3) **record 還元(PR loop)** は Phase 3(#1787)。
5. **#1960 / #1971 の扱い**: client-PAT private permalink 案は本ピボット（installation 認証）に吸収される。#1971 は「client-PAT は local 収束で却下、private は App ピボットへ」の記録に留め、#1960 はピボット epic に畳む。
6. **permalink layer(#1828) との関係**: repo-backed permalink（slice 1/c）は public render-only として**そのまま有効**。ピボットは「committed `.krs` が無い repo」を AI 生成で補い、private を App で開く上位レイヤー。permalink の `source:`（in-repo `.krs`）規約とも両立（生成物を PR 還元すれば `source:` が埋まる）。

## 未解決の問い

1. **他者 private code を hosted LLM に通す是非（成立条件）** — repo owner 同意の取り方（App install scope で足りるか）、LLM プロバイダの零保持契約、生成物に生コード/secret が混ざらない保証、責任範囲。ここが引けるかがピボット全体の可否を決める。
2. **コスト負担者** — BYO-LLM key（2-B）で solo economics は守れるが、UX 摩擦（install + LLM key の二段）が採用を殺さないか。無料 2-A を strict rate-limit で薄く出す余地は？
3. **stateful 化の運用（solo）** — D1/KV・webhook・install ライフサイクル・abuse/moderation を 1 人で回せる範囲か。3-A（cache のみ）で本当に足りるか（install 状態は GitHub 側に寄せられるか）。
4. **reverse 品質の製品バー**（#1783 の宿題）— system top-level/deploy は強い・domain/org は弱い。hosted で「良い overview」を testable bar として何と定義するか。弱い figure を出して信頼を損ねないか。
5. **名前・URL・既存サーフェスとの関係** — nest(app 内包) を GitHub App SaaS に拡張するのか、別デプロイか。docs-site playground / VS Code 拡張 / CLI との棲み分け（solo で維持面が増える）。
6. **#1960/#1971 を正式に close/畳む手続き** — ピボット epic を #1783 起点で立てるか、新規 epic を起こすか。
