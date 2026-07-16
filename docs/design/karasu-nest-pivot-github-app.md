# karasu-nest ピボット — GitHub App による hosted reverse + preview サービス

- **日付**: 2026-07-15
- **Issue**: #1783（nest 壁打ち・本 doc の親）／関連 #1828 permalink layer・#1960 private permalink・#1787 Phase 3 in-site editor
- **PR**: #1978
- **ステータス**: 壁打ち（brainstorm）— **6 論点の方向性を確定（2026-07-16、下記「決定」節）**。技術詳細・実装は後続 design/ADR
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

## 決定（壁打ち確定 2026-07-16）

6 論点を確定した。ピボットは「他社 private コードを server で預かり AI で構造化する本格 SaaS」を **solo で取る**方向で合意。

1. **リバース実行場所 = 案A（server-side）。** Worker が private code を fetch し LLM を呼ぶ。**ゼロ設定（App 入れる→図が出る）**という最大の差別化を取る。代償として、サービスが private コードの data processor になる責任・コストを負う（＝本格 SaaS の賭け）。案B（client-side）は #1960 の「local ツール収束」批判が跳ね返るため不採用。
2. **secret 対策 = redact before LLM。** fetch したコードを LLM 送信前に gitleaks 相当で scan/redact し、生成 `.krs` にも scan をかけて「構造のみ」を担保。privacy policy で「送信前 redact」と謳える。
3. **推論コスト = service-paid + quota/freemium。** サービスが推論を負担。ただし **v1 は無料枠＋厳格 quota のみ（課金 = Stripe は後回し）**。per-installation 月次 quota ＋ global rate-limit でコストを cap。
4. **出力スコープ = 全ビュー生成＋confidence マーク。そして domain 分析を first-class に投資する。** ← 製品の核心。system top-level + deploy だけでは「うり」が弱い（既存の一発 reverse と大差ない）。**domain 分解の質こそ hosted サービスの差別化**であり、それは案A（server）だから実現できる: **agentic multi-pass reverse**（harness の per-domain subagent fan-out, ADR-20260714-02 を server で重く回す）＋**構造シグナル grounding**（dir/package 境界・CODEOWNERS・commit coupling・DDD）＋**human refinement → PR 還元を質のラチェット**に。confidence マークは正直さの層であって戦略ではない。#1783 の「domain は一発では弱い」を「一発でなく agentic で作り込む」で乗り越える。
5. **パッケージ = 別 Workers サービス（推奨・後続技術設計で確定）。** state・secret（App private key）・webhook を静的 Pages app に同居させず別サービスにし、描画は `packages/app`（MemoryModeApp）、reverse+合成は `packages/core` を再利用。名前は "karasu-nest" 継続、URL 後決め。solo の維持面が 1 面増える点は明記。
6. **epic / 既存扱い**: 新規 **karasu-nest pivot epic** を起こし child（App auth / server reverse pipeline / redact / domain agentic / confidence マーク / quota+state / webhook purge …）を下げる。**#1960 は pivot に吸収して close**。**#1971（client-PAT design）は「client-PAT は local 収束で却下、private は App pivot へ」の status を付けて却下記録として merge**。

### データ信頼アーキテクチャ（案A の go/no-go 成立条件）

server が他社 private コードを処理することを信頼可能にする構成:

- **同意 = App install がゲート**（marketplace 説明で「コードを読み LLM に送り図を生成」を明示、`contents:read` を選択 repo 限定）。
- **transient 処理・生コード非保存**（fetch→redact→LLM→`.krs` を得たら生コード即破棄。永続化は生成 `.krs`=構造のみを SHA-keyed cache に置くだけ）。
- **LLM は零保持/非学習**（Anthropic zero-retention を契約要件）。
- **uninstall = purge**（cache は installation キー、解除＋明示 purge で消去）。
- **subprocessor 開示 + privacy policy + ToS 責任制限**（Anthropic/Cloudflare を列挙）。← 技術でなく**この法務面が solo SaaS の本当の重り**。

## 未解決の問い（確定後に残るもの）

> Q1〜6 の方向は上「決定」節で確定。以下は確定後に残る**本当のリスク/宿題**。

1. **【最大リスク】domain 分析の品質バー** — 決定4 で domain 分析を「うり」に据えたが、agentic multi-pass ＋ 構造 grounding ＋ 人手ラチェットで「**うりと言えるほど信頼できる domain 分解**」に到達できるかは未検証。#1783 の「一発では弱い」を本当に乗り越えられるか。**最優先の spike**: 数個の実 OSS で agentic reverse を回し、人手正解と突き合わせて domain 分解の精度を測る（製品化前の go/no-go）。
2. **深い reverse のコスト/レイテンシ vs 無料枠**（決定3・4 の緊張） — domain を深く掘るほどトークン/計算が増え、service-paid の無料枠が 1 reverse あたり高くつく＆レイテンシ増。free-tier quota をどこまで厳しく引くか、そもそも agentic reverse を solo の service-paid で捌けるか。spike のコスト実測が要る。
3. **法務/責任（決定1 の residual）** — 他社 private コードを処理する SaaS の ToS 責任制限・privacy policy・（企業顧客の）DPA。技術でなくここが solo の本当の重り。最小構成でどこまで要るか要調査。
4. **`.krs` notation への confidence/draft アノテーション**（決定4 派生） — 低確信 domain を機械可読に印付けるには新アノテーション（例 `[draft]` / confidence）が要る＝ `docs/spec/` の変更。notation-watch プロセス＋ proactive TPL（CLAUDE.md の spec 改訂ルール）を後続 design で同梱する。
5. **reverse 品質の testable bar 定義** — 「compile 通る＋top-level service を X% カバー」に加え、domain 層の精度をどう機械測定するか（人手正解が要る領域）。harness の既存 coverage 指標を domain までどう拡張するか。
