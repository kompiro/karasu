---
id: TPL-20260721-01
title: "エージェント向け skill が散文で参照する CLI コマンド名は CLI レジストリと同期させる"
status: active
date: 2026-07-21
applicable_to:
  - "`.claude/skills/**` の skill が `karasu <cmd>` のような CLI コマンドを散文で prescribe するとき"
  - "エージェントが従う手順書（skill / runbook）が、別 package の code surface（CLI subcommand / adapter の有無）に依存した断定を書くとき"
  - "原典が code 側にあり、手書きの指示が静かに drift する構造を、user 向けでなく agent 向けに持つとき"
known_consumers:
  - reverse-architecture
discovered_from:
  - issue: "#2084"
  - issue: "#2090"
  - root_cause_file: "scripts/lint/skill-cli-refs.ts"
related_to:
  - TPL-20260623-01
topic: build
scope:
  packages:
    - cli
---

# TPL-20260721-01: エージェント向け skill が散文で参照する CLI コマンド名は CLI レジストリと同期させる

## 観点

`.claude/skills/**` の skill は、エージェントに `karasu <cmd>` のような CLI コマンドを **手書きの散文** で指示する。CLI（`packages/cli/src/index.ts` の commander レジストリ、`packages/core/src/translate/**` の adapter 群）は進化するが、skill の散文はそれを追わない。両者を結ぶ機械的な紐付けが無いので、指示は **静かに drift** する。

これは TPL-20260623-01（user-facing な app/CLI surface ↔ `docs/tools` の drift）と同じ「同じ意図を 2 つの表現で持つ」構造の **agent-facing 版**である。違いは consumer と失敗の現れ方にある: user 向け doc の drift はユーザーが気づいて読み飛ばせるが、agent 向け skill の drift は **エージェントが指示に忠実であるほど確実に踏む** —— 壊れた手順を疑わず実行し、下流（synthesis 等）まで欠陥を運ぶ。

surface は 2 つに分かれ、扱う道具が違う（TPL-20260623-01 と同型）:

- **enumerable な slice**（コマンド名の存在）— CLI レジストリという単一の真実があるので **機械チェックできる**。`scripts/lint/skill-cli-refs.ts` が「skill 内の全 `karasu <cmd>` 参照が登録済みコマンドか」を検証する。
- **non-enumerable な slice**（コマンドの *用途* が正しいか、capability の *不在* を断定していないか）— 列挙の単一ソースが無いので **レビュー時のチェックリスト**（この TPL）と、CLI surface 変更時に skill 再読を促す advisory（lint script が CLI surface の glob で再発火し出力する note）で担保する。

## 想定される失敗モード

機械チェックが**捕まえる**もの:

- skill が改名・削除されたコマンドを参照し続ける（コマンド名が dangling になる）。

機械チェックが**捕まえない**もの（＝この TPL のチェックリストと human review でしか防げない残余）:

- **用途違い（実在するコマンドを誤用）**: #2084 —— skill が `.krs` の検証ゲートに `karasu lint-style` を指定した。`lint-style` は実在するが `.krs.style` 用で、`.krs` に対しては無意味な診断を出す。コマンド名は正しく登録済みなので name check は通る。**実行してみないと分からない**意味的ミスマッチ。
- **capability 不在の陳腐化した断定**: #2090 —— skill が「Cloudflare Workers 用の `translate` adapter は無い」と断定していたが、`--from wrangler` は skill 執筆の翌日（#1948）に出荷済みだった。参照すべきコマンドが散文中に存在しないので、照合対象自体が無い。skill 自身の「physical 層を捏造するな」規則を skill 自身の手順が破っていた。

両者とも人間が skill を読んで発見した。ビルドは緑のままだった。

## チェックリスト

skill を追加・変更するとき、または CLI の command / adapter surface を変えるときに確認する:

- [ ] skill 内の全 `karasu <cmd>` 参照が登録済みコマンドか（`pnpm lint:skill-cli-refs` が緑か）。
- [ ] 各コマンドを **正しい入力型・用途** で使っているか（例: `.krs` の検証は `render`、`.krs.style` は `lint-style`）。名前が実在するだけでは不十分。
- [ ] skill が CLI の capability の **不在**を断定していないか（「adapter が無い」「〜はできない」）。断定するなら、その時点の `karasu <cmd> --help` / adapter 一覧で裏を取ったか。
- [ ] CLI に subcommand / translate adapter を足したとき、その存在を前提が変わる skill（とりわけ「無い」と書いている箇所）を読み直したか。

## 既知の対処パターン

- **enumerable slice の機械チェック**: `scripts/lint/skill-cli-refs.ts`（`.command("…")` で登録名を収集し、skill の code span / fenced block 内の `karasu <cmd>` を照合。散文の "karasu architecture model" 等は code 外なので自然に除外される）。lefthook の `skill-cli-refs`（glob `.claude/skills/**` + `packages/cli/src/index.ts` + `packages/core/src/translate/**`）と `scripts` vitest プロジェクト経由で CI gating。
- **capability 断定の drift**: 上記 lint を CLI surface の glob でも発火させ、`main()` が常に advisory note を出す（Issue #2093「Part B」）。これは断定ではなく human judgement のトリガーで、adapter を足した PR（#1948 型）で発火するのが狙い。
- **用途違い**: 現状は機械化なし。skill の documented pipeline を fixture repo に対し実行し、壊れた入力でゲートが落ちることを assert する e2e でしか捕まらない（1 skill にはコスト過大と判断、残余として明示）。

## 関連テスト

- `scripts/lint/skill-cli-refs.test.ts`（`registeredCommands` / `codeText`（prose 除外）/ `referencedCommands` の単体 + 実 skill が CLI レジストリと同期している統合アサーション + 合成 fixture での dangling-command 検出）
