---
id: TPL-20260510-19
title: "新機能の情報の流れは抽象化方向（up）か、詳細化方向（down）かを判定する"
status: active
date: 2026-05-10
applicable_to:
  - "code → model 変換 / model → code 変換 / インポート / エクスポート / 連携 / 補助生成 など、karasu モデルと外部世界を接続する新機能"
  - "新しい属性 / 構文 / メタデータを `.krs` AST に追加する変更（特に言語仕様の拡張）"
  - "Chat / translate / refactor の出力で、ユーザーに見せる粒度を決める設計"
known_consumers:
  - translate-cli
  - chat-panel
related_to:
  - TPL-20260510-12
  - TPL-20260510-18
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
topic: core-concepts
scope:
  packages:
    - core
    - cli
    - app
---

# TPL-20260510-19: 新機能の情報の流れは抽象化方向（up）か、詳細化方向（down）かを判定する

## 観点

karasu の非目標群は **共通フィルタ** を持つ（`docs/concepts.ja.md` 「非目標 → karasu が扱うのは ゆっくり変化する構造的な文脈」）。具体的に最も判定しやすい形が **「情報が抽象化方向（up）に流れるか、詳細化方向（down）に流れるか」**。

- **up（抽象化）= OK** — 既存コード資産から `.krs` を抽出する `karasu translate`、観測対象から構造を要約する解析、AI が冗長な仕様から DSL を抽出する場合など。情報は流れる過程で **詳細が落ちる**。モデルは情報の上澄みになる
- **down（詳細化）= NG** — `.krs` モデルからアプリケーションコードを生成する、SQL DDL を生成する、TypeScript 型を生成する、シーケンス挙動を生成する、ランタイムメトリクスを overlay する。情報は流れる過程で **詳細が増える**。モデルが down 先の情報を持たないと出力が成立しないので、**モデルにユーザーが過度な詳細を書く圧力** が生まれる

`translate`（code→model, up）と code generation（model→code, down）は表面上「逆向き変換」で対称に見えるが、**圧力の方向は対称ではない**。down 方向は karasu の中心命題（モデルは抽象度を保つ）を破壊する。

新機能の提案 / 受け入れの場面で、この判定をすることでフィルタが機械的に働く。

## 想定される失敗モード

- 一見便利な機能（「domain から TypeScript 型を生成」「usecase から OpenAPI スケルトン」「resource から SQL DDL」）を受け入れた結果、ユーザーが down 先で必要な詳細を `.krs` に書き加える羽目になる
- モデルが特定の output 先（K8s yaml / Terraform / OpenAPI）の重複物に変質し、source of truth がそちらに移る
- karasu の重心が「アーキテクチャを語る道具」から「実装 / 運用 / インフラを語る道具」へ滑る
- 既存ユーザーが想定していた抽象度が壊れ、後から戻すのが困難になる（後方互換が枷になる）

## チェックリスト

新機能 / 構文拡張 / 連携 を提案・実装するとき、以下を確認する:

- [ ] この機能で情報は **up（詳細が落ちる）** か **down（詳細が増える）** のどちらに流れるか、Design Doc / Issue で明示したか
- [ ] down 方向の機能の場合、**モデルにどんな新しい詳細が要求されるか** を列挙し、それが `.krs` の既存抽象度に収まるか確認したか（収まらないなら non-goal）
- [ ] 「便利だから」「ユーザーが欲しがっている」という理由だけで down 方向を採用していないか。**non-goals 節（concepts.ja.md）の rationale と矛盾しない** か照合したか
- [ ] 中間的な機能（refactor / lint / validation）が、down 方向に滑り込んでいないか（例: lint が「実装側の規約」を強要し始める）
- [ ] 既存の `translate` のような **明確に up 方向の機能** をテンプレートとして、新機能の流れの方向を比較できるか

## 既知の対処パターン

- 新機能の Design Doc 冒頭に **「情報の流れる方向」セクション** を設け、up / down を明示する。これが書けない / down だと判明した時点で、機能を non-goal に分類するか、抽象度を保てる設計に作り変える
- down 方向の代替提案を退けるとき、`docs/concepts.ja.md` 「非目標 → モデルからアプリケーションコードは生成しない」を引用して **理由を再導出させない**
- escape hatch を用意する: 「down 方向の出力が欲しい」需要は karasu の外（draw.io export / Backstage 連携 / 実装側の codegen ツール）に逃がす。これは目標の維持と利用者の現実的ニーズを両立させる典型パターン
- AI / Chat の prompt 設計でも、AI が勝手に detail-up しないよう「karasu の語彙以上のことを書くな」と制約する

## 関連テスト

- `docs/concepts.ja.md` 「非目標」全節 — 共通フィルタの源泉
- `packages/cli/src/translate/` — up 方向の reference implementation
