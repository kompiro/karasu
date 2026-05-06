---
id: ADR-20260428-09
title: 受け入れテストの自動化マーカー規約と検出スクリプト
status: accepted
date: 2026-04-28
topic: testing
related_to:
  - ADR-20260412-05
scope:
  packages: []
  concerns:
    - ci
assumptions:
  # acceptance-test skill moved to the kompiro/hane plugin (see CLAUDE.md);
  # the host repo no longer ships SKILL.md in-tree.
  - "external: kompiro/hane plugin :: skills/acceptance-test/SKILL.md"
  - "file: scripts/acceptance/coverage.ts"
  - "file: scripts/acceptance/check-coverage.ts"
  - "file: scripts/acceptance/coverage.test.ts"
  - "file: .github/workflows/at-check-coverage.yml"
  - "grep: package.json :: at:check-coverage"
  - "grep: lefthook.yml :: at-check-coverage"
---

# ADR-20260428-09: 受け入れテストの自動化マーカー規約と検出スクリプト

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#916](https://github.com/kompiro/karasu/issues/916)（4 phase の tracker）
  - Phase A — 規約整備: [#917](https://github.com/kompiro/karasu/issues/917) / PR [#922](https://github.com/kompiro/karasu/pull/922)
  - Phase D — 検出スクリプト: [#918](https://github.com/kompiro/karasu/issues/918) / PR [#931](https://github.com/kompiro/karasu/pull/931)
  - Phase C — レトロフィット: [#919](https://github.com/kompiro/karasu/issues/919) / PR [#938](https://github.com/kompiro/karasu/pull/938) / [#942](https://github.com/kompiro/karasu/pull/942) / [#950](https://github.com/kompiro/karasu/pull/950)
  - Phase B — CI ゲート: [#920](https://github.com/kompiro/karasu/issues/920) / PR [#958](https://github.com/kompiro/karasu/pull/958)
  - 既存 ADR: [ADR-20260412-05](20260412-05-playwright-with-ai-visual-review.md)（Playwright + AI レビュー戦略）
  - フォローアップ: [#956](https://github.com/kompiro/karasu/issues/956)（per-bullet 展開） / [#957](https://github.com/kompiro/karasu/issues/957)（manual-only sweep）

## 背景

`docs/acceptance/` 以下の AT ファイルは、自動テストでカバーされている項目と
そうでない項目を識別する書式が混在していた。サーベイの結果、3 系統が並立して
いた:

1. **emoji + blockquote**（正規・約 40%）:
   ```markdown
   - [x] チェック項目テキスト
   > ✅ Automated — `packages/e2e/tests/<file>.spec.ts` › `<test name>`
   ```
2. **"Verified by" メタ欄**（AT-0010, AT-0062 など）: AC ごとに
   `- **Verified by**: it("test name")` を添える形。
3. **節レベル区分**（AT-0053 ほか）: `## Automated Checks` /
   `## Manual Verification` で AC を 2 節に分ける形。

加えて、`packages/e2e/tests/at-NNNN-*.spec.ts` が存在するのにマーカーが
無い AT も多数あった。`.claude/skills/acceptance-test/SKILL.md` には正規
形が記載されていたが「これだけが正しい」と明示されておらず、3 系統が
それぞれ独自に増殖していた。

帰結として:

- AT を読んだだけでは「どこまで自動化されているか」が分からない。
- 自動化済みケースが PR レビューで漏れて見落とされる。
- マーカー書式の議論が PR ごとに発生する。

## 決定

受け入れテストの自動化マーカーを **唯一の正規形に統一** し、規約への適合を
**機械的に検査** する仕組みを導入する。

### 規約

`.claude/skills/acceptance-test/SKILL.md` で次を正規形と定義する:

- 各 AC バレットは `- [x]`（自動化済み） / `- [ ]`（未自動化）のチェックボックス。
- 自動化済みバレットの直後行に blockquote を 1 行添える:
  ```markdown
  > ✅ Automated — `<spec-path>` › `<test name>`
  ```
- 部分的自動化（視覚判定が手動など）は `🟡 Partially automated — ...`。
- 未自動化バレットの理由は AC 節末尾に 1 つの blockquote にまとめてよい。
- 過渡期の代替形として、AC 節先頭に `🟡 Partially automated — ...` を 1 つ
  だけ置き、AC 全体のスコープを記述する形も許容する（per-bullet 展開は
  ベストエフォートで進める）。

`Verified by` メタ欄、`## Automated Checks` / `## Manual Verification`
の節分割は **すべて廃止** し、過去ファイルは段階的に正規形に畳む。

### 検出ツール

`scripts/acceptance/coverage.ts` と CLI ラッパー
`scripts/acceptance/check-coverage.ts` を追加し、`pnpm at:check-coverage`
で実行できるようにした。検査内容:

1. **non-conforming**: deprecated 形式を使うファイル、または `[x]` の
   直後に正規 blockquote が無いケース。
2. **missing-marker-with-spec**: マーカーを 1 つも持たないが、AT id
   と slug-token の重なりで対応する spec が見つかるケース。

CLI には `--strict`（findings がゼロでなければ exit 1） / `--json`
（構造化出力） / `--help` を備え、人間と CI 双方が使えるようにした。

### CI / pre-push 連携

`lefthook.yml` の pre-push に `at-check-coverage` コマンドを追加し、
`docs/acceptance/**` または `scripts/acceptance/**` を変更する PR で
`--strict` モードを実行する。並行して
`.github/workflows/at-check-coverage.yml` を新設し、同じパスにマッチ
する PR / push で同等の検査を行う。

このゲートが効く時点で、新しい PR が deprecated 形式を再導入することは
できない。

### コーパス全体への適用

Phase A → D → C → B の 4 段階で実施した:

| Phase | 内容 | 結果 |
| --- | --- | --- |
| A | SKILL.md と process.md の規約整備（PR #922） | 1 つの正規形を明文化 |
| D | 検出スクリプト + 単体テスト（PR #931） | 28 / 14 / 10 の現状を機械化 |
| C | 既存 AT ファイルのレトロフィット（PR #938 / #942 / #950） | 38 / 0 / 0 まで収束 |
| B | pre-push と CI へのゲート組み込み（PR #958） | 規約を恒久的に強制 |

最終状態: 92 ファイル中 38 が canonical marker を持ち、non-conforming と
missing-marker-with-spec はいずれも 0。残る 54 ファイルは自動化対象が
無い manual-only AT で、検査対象外。

## 理由

- **唯一の正規形** にすることで、PR ごとの書式議論が消える。3 系統並立
  の状態は規約があっても「他形式も許容されている」と読まれる余地が
  あった。
- **機械検査** を入れることで、規約遵守が記憶ではなくコードに根付く。
  過去 ADR でも「規約だけ書いて検査が無いものは時間とともに崩れる」
  パターンを観測している。
- **段階的レトロフィット**（A → D → C → B）にすることで、各フェーズの PR
  を 5〜10 ファイル規模に保てた。「全 AT を一気に書き換える」アプローチ
  はレビューが破綻する。
- **スクリプトはヒューリスティック**（slug-token 重なり + AT id プレフィックス）
  で False Positive / Negative を避ける設計にした。Phase C 進行中に発見
  された generic token のオーバーマッチ（`diagram` で異 AT が混線する等）
  は stoplist で対処し、unit-test ファイル名にも overlap 検査を適用して
  最終的にコーパス全体で 0 件にした。
- **AC 節先頭の partial blockquote** を許容したのは、5 つの cross-ref
  ファイル（AT-0014, AT-0043, AT-0050 系, AT-0053-natural-language）が
  per-bullet 展開を直ちに行えなかったため。マーカーが一切無い状態より、
  「節全体の自動化スコープを 1 行で記述する」過渡形のほうが情報量が
  多い。Strict mode はこの形を canonical とみなす。

## 却下した案

### A. 既存形式を併存させ、SKILL.md にすべて記載する

3 系統を「どれを使ってもよい」とすれば PR ごとの議論は減る。しかし
新しい AT が「3 系統のどれかを場当たり的に選ぶ」状況は変わらず、検査が
書けないため drift が止まらない。却下。

### B. 検査ゲートを入れず、規約だけ整備する

A の派生案で、SKILL.md のみ更新して脚本を作らない。短期的には小さな
PR で済むが、規約遵守は人間レビューだけに依存する。OSS 寄稿が増えた
場合のスケーラビリティが低い。却下。

### C. AT ファイル自体に YAML frontmatter で自動化状態を持たせる

`automation: { spec: "...", tests: ["..."] }` のような構造化フィールドを
frontmatter に置く案。機械検査と相性は良いが、人間が読むときに毎回 spec
ファイル名を frontmatter まで戻って確認することになる。canonical の
blockquote は バレット直下にあるので「項目と裏付けが視線で繋がる」。
却下。

### D. 完全自動レトロフィット（スクリプトで全ファイル一括書き換え）

C / B フェーズを脚本で機械実行する案。エッジケース（プロセ章の
中の `[x]` を装うトークンなど）で誤書き換えが起きやすく、かつ手作業
レビューでは差分が大きすぎてチェック不能になる。誤判定の責任が
人間に取れない範囲まで広がるため却下し、5〜10 ファイルバッチの手動
レトロフィットを採用した。

## 影響範囲

- **新規**: `scripts/acceptance/{coverage,check-coverage,coverage.test}.ts`,
  `.github/workflows/at-check-coverage.yml`
- **改修**: `package.json`（`at:check-coverage` / `at:test` script）,
  `lefthook.yml`（pre-push gate）, `.claude/skills/acceptance-test/SKILL.md`,
  `docs/process.md`, 13 個の `docs/acceptance/*.md`
- **CI**: 新ジョブ "AT coverage check" が `docs/acceptance/**` または
  `scripts/acceptance/**` を変更する PR / push で実行される（path-gated）

## やらないこと

- 自動化されていない AT バレットへの新規テスト追加（個別の AT issue で扱う）。
- Per-bullet `[x]` 展開を全 partial-coverage ファイルで強制すること
  （[#956](https://github.com/kompiro/karasu/issues/956) で扱う）。
- Manual-only AT ファイルへの一律 rationale blockquote 付与
  （[#957](https://github.com/kompiro/karasu/issues/957) で扱う）。
- Strict mode の閾値変更（現状 findings 1 件以上で fail）。
