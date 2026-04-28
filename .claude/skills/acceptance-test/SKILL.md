---
name: acceptance-test
description: >
  Create acceptance test records in docs/acceptance/.
  Trigger when the user says: "アクセプタンステスト", "受け入れテスト", "ATを作成",
  "acceptance test", "create AT", or similar phrases requesting acceptance test documentation.
---

# Acceptance Test Record Skill

実装予定の機能や変更に対するアクセプタンステスト記録を `docs/acceptance/` に作成する。

## 手順

1. `docs/acceptance/` 内の既存ファイルを確認し、次の連番を決定する（`NNNN-` 形式、ゼロ埋め4桁）
2. ユーザーに以下を確認する（明示されていない場合）：
   - 対象となる機能・変更の概要
   - 関連するADR（あれば）
   - 対象コード・モジュール
3. 対象の既存コード、仕様ドキュメント、ADRを読み、実装の詳細を把握する
4. 変更対象ファイルから `type` を推論する：
   - `packages/` 配下のファイルのみ変更 → `type: product`
   - `packages/` 以外（`.claude/`, `docs/` 等）のみ変更 → `type: tool`
   - 両方含む場合 → ユーザーに確認する
5. 受け入れ条件（AC）を具体的かつ検証可能な形で記述する
6. ファイルを作成し、ユーザーにレビューを依頼する

## ファイル形式

```markdown
---
type: product  # または tool
---

# AT-NNNN: タイトル

- **日付**: YYYY-MM-DD
- **関連ADR**: ADR-XXXX または なし
- **対象**: 対象モジュール・ファイルの説明

## 概要

変更の目的と背景を1〜2文で記述。

## 受け入れ条件

### AC-N: 条件グループ名

- [ ] 具体的かつ検証可能な条件
- [ ] 入力と期待出力が明確な条件
- [ ] エッジケースやエラーケースも含む

## 検証方法

（自動テストコマンド、手動確認手順など）
```

## 受け入れ条件の書き方ガイドライン

- **具体的**: 「正しく動作する」ではなく「`fn(input)` が `expected` を返す」のように書く
- **検証可能**: チェックボックスで完了を判断できる粒度にする
- **グループ化**: 関連する条件を AC-N 単位でまとめ、各グループに説明的な名前を付ける
- **網羅的**: 正常系・異常系・エッジケース・公開APIを漏れなくカバーする
- **独立的**: 各ACは他のACに依存せず、単独で検証できることが望ましい

## 命名規則

- ファイル名: `docs/acceptance/NNNN-kebab-case-title.md`
- 連番は既存ファイルの最大番号 + 1
- タイトルは機能・変更を端的に表す英語のkebab-case

## 自動化アノテーション（Playwright / Vitest）

すべての AT ファイルは以下の唯一の方式で自動化状態を表す。
"Verified by" メタ欄や "Automated Checks" セクション分けなど、
他の方式は採用しない（既存ファイルは順次本方式に揃える — #916 参照）。

### ルール

1. **チェックボックス**: 各受け入れ条件は `- [x]`（自動化済み） / `- [ ]`（未自動化）で表す。
2. **テスト名にケースラベル**: Playwright / Vitest テスト名に `(Case 1)`, `(TC-2)`, `(AT-0031-02)` のようなラベルを含める。AT markdown とテストの対応付けが機械的に追跡できる。
3. **アノテーション blockquote**: 自動化された箇条書きの**直後の行**に、以下の形式で blockquote を 1 行で添える。

   ```markdown
   - [x] チェック項目テキスト
   > ✅ Automated — `packages/e2e/tests/<file>.spec.ts` › `<test name>`
   ```

   一部のみ自動化（視覚確認は手動など）の場合:

   ```markdown
   - [x] チェック項目テキスト
   > 🟡 Partially automated — `packages/e2e/tests/<file>.spec.ts` › `<test name>`（視覚的判定は手動）
   ```

4. **AC 節先頭の "section-level partial" blockquote（任意）**: 個々の `[x]` を per-bullet で展開する余裕がないとき、AC 節の冒頭に 1 つだけ `🟡 Partially automated — ...` blockquote を置いて、節全体の自動化スコープを記述してよい。後で per-bullet に展開する暫定形として使う。

   ```markdown
   ## 受け入れ条件

   > 🟡 Partially automated — `packages/e2e/tests/at-XXXX.spec.ts` covers AC-1 (tab switching), AC-3 (editor↔diagram updates, partial), and AC-5 (Samples tab). AC-2 / AC-4 stay manual until follow-up coverage lands.

   ### AC-1: ...
   - [ ] ...
   ```

   この形式は AT-0004 / AT-0014 / AT-0043 / AT-0050 / AT-0053 で採用されている（PR #950）。`pnpm at:check-coverage` は AC 冒頭の partial blockquote を canonical とみなすため、この形のままでも検査を通る。per-bullet 展開はベストエフォートで進める。

5. **未自動化バレットの理由 blockquote（任意）**: AC 節の末尾に 1 つだけ、未チェック項目をまとめて理由付きで blockquote にできる。何が／なぜ手動なのかを 1 行ずつ書く。

   ```markdown
   > 未チェック項目について:
   >
   > - "プレビューがリアルタイム更新": 視覚判定が必要なため AI / 人間レビューに残す。
   > - "ドリルダウンとブレッドクラム": AT-0029 / AT-0030 で別途自動化されている。
   > - "ワーニングパネル": AT-0045 / AT-0057 で別途自動化されている。
   ```

   この形式は AT-0004（PR #894）で導入された。理由が単純（"視覚判定" のみ等）なら省略してよいが、複数の手動項目が並ぶときはこの形でまとめる。

### 完成イメージ

```markdown
## 受け入れ条件

### AC-1: ProjectSelector UI

- [x] ドロップダウンにプロジェクト一覧が表示される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `dropdown lists seeded projects in the order they were written`

- [x] 「+ New」ボタンで作成できる
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `+ New flow creates a project and persists it to OPFS`

- [ ] Rename ボタンで現在プロジェクト名を変更できる

### AC-2: ProjectModeApp 初期化

- [x] 起動時に前回開いたプロジェクトが localStorage から復元される
> ✅ Automated — `packages/e2e/tests/at-0004-project-management-opfs.spec.ts` › `lastProjectId in localStorage restores the previously selected project`

- [ ] 編集後にプレビューがリアルタイム更新される
- [ ] ワーニングパネルに警告が表示される

> 未チェック項目について:
>
> - "プレビューがリアルタイム更新": 視覚判定が必要なため手動レビュー。
> - "ワーニングパネル": AT-0045 / AT-0057 で別途自動化されている。
```

### 既存スタイルからの移行

過去の AT ファイルでは以下の方式が混在しているが、いずれも上記の正規方式に畳む:

| 旧方式 | 例 | 移行先 |
| --- | --- | --- |
| `- **Verified by**: `it("...")`` メタ欄 | AT-0010, AT-0062 | 該当バレットを `- [x]` + 直後 `> ✅ Automated — ... › ...` blockquote に置き換え |
| `## Automated Checks` / `## Manual Verification` 節分割 | AT-0053, AT-0062 | バレットを元の AC 節に戻し、各バレットに `> ✅ Automated` を添える |
| マーカーなし（spec が既にある） | 多数 | spec ファイルを `packages/e2e/tests/` から探し当てて blockquote を追加 |

検出は `pnpm at:check-coverage`（#918）で機械化される予定。一括で揃える retrofit は #919 / #920 で行う。
