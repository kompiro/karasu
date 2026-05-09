---
id: ADR-20260509-01
title: flaky な E2E テストは test.fixme でマークし追跡 Issue を立てる
status: accepted
date: 2026-05-09
topic: testing
related_to:
  - ADR-20260412-05
  - ADR-20260428-09
scope:
  packages:
    - e2e
    - vscode-e2e
assumptions:
  - "file: packages/e2e/README.md"
  - "file: packages/e2e/playwright.config.ts"
---

# ADR-20260509-01: flaky な E2E テストは test.fixme でマークし追跡 Issue を立てる

- **日付**: 2026-05-09
- **ステータス**: 決定済み
- **きっかけ**: PR #1169（Issue #1008 Phase 1 — Playwright `retries` を 2 → 1）で AT-0014 cross-nav highlight test の flake が顕在化。Issue #1171 で追跡開始
- **関連**:
  - ADR-20260412-05: Playwright + AI visual review — E2E 実行基盤の前提
  - ADR-20260428-09: acceptance test automation markers — `at:auto` / `at:manual` の運用と整合
  - 関連 Issue: #1008（retries 削減のフェーズドロールアウト）, #1171（最初の追跡 Issue 例）

## 背景

E2E (Playwright / vscode-e2e) は実環境に近い検証ができる反面、タイミング依存の flake を内包しやすい。retries（再試行）でその場をしのぐと、本来観測されるべき不安定さがランサマリの `flaky` カウントに埋もれる。Issue #1008 はそれを是正するために `retries: 2 → 1 → 0` を段階的に進めている。

retries を絞る過程で表面化した flake をどう扱うかが運用上の課題になる：

- **そのまま放置**: 元 PR が CI red のままで永久に進めなくなる
- **コミットを諦める**: 本来関係ない PR で flake 修正に着手することになり、scope creep を招く
- **再 retry に頼る**: ADR-20260412-05 で確立した「flake は表面化させて潰す」方針と矛盾する

flake 修正は **本来の修正対象とは別の関心事** であり、単独で取り組むのが適切。一方で、その flake が観測されたという情報自体は失われずに記録されるべき。

## 決定

E2E テストが flake と判定された場合、**観測した PR の中で `test.fixme(...)` マーカーを付与し、その flake を追跡する Issue を別途立てる**。

### 適用条件（flake 判定）

以下のいずれかに該当した時点で本ポリシーを適用する：

1. PR-gated CI（ローカルでない CI 上の Playwright / vscode-e2e ジョブ）で **同一テストが retry 込みの全 attempt を fail** したが、関連コードに変更が無い／ない確信がある
2. 過去に green だった同テストが、**直近 10 PR-gated runs のうち 2 回以上 fail** している（intermittent）
3. nightly E2E で **連続 2 晩以上同テストが flaky 扱い** で記録される

判断に迷う場合は flake 寄りに倒す。確実に flake と分かってから対処するのではなく、疑わしい時点で Issue を立てて記録に残す方が運用コストが低い。

### 対処手順

1. **テストに `test.fixme(...)` を付ける**（`test.skip` ではない理由は後述）。直前にコメントで以下を残す：
   ```ts
   // Tracked in #<issue-number> — flake surfaced by #<observing-pr>.
   // <one-line summary of failure mode and the run that exposed it>.
   // Re-enable once stabilized.
   test.fixme("...", async ({ page }) => { ... });
   ```
2. **追跡 Issue を立てる**。最低限以下を含める：
   - Failing test のフルパスとタイトル
   - 観測された assertion / error の文面
   - 観測された CI run へのリンク
   - 仮説（test brittleness か実バグか）
   - Acceptance criteria（少なくとも「retries=0 で 5 回連続 PR-gated run を pass」「`test.fixme` を解除」）
   - ラベル: `test`, `bug`
3. **元の PR を進める**。fixme マークは観測した PR と同一コミットに含める（追跡しやすさのため）。PR description に「`test.fixme`'d <test name> — tracked in #N」と明記する。

### test.fixme を選ぶ理由

| マーカー | 挙動 | 採用 / 不採用理由 |
| --- | --- | --- |
| `test.skip` | テストは存在するが実行されない。意図的にスキップしている扱い | 不採用：「flake で困っている」というシグナルが弱い。意図的な skip と区別がつかない |
| `test.fixme` | テストは存在するが実行されない。**「修正が必要」と明示** | **採用**：playwright report 上に `[fixme]` で目立つ。Issue 追跡前提 |
| `test.fail` | 失敗を期待する。pass したら逆に CI red | 不採用：意味論が違う（known-bug-by-design 用） |
| 削除 | テスト消失 | 不採用：履歴が失われ、再有効化のフックも消える |

`test.fixme` は「いつか直す（fix me）」の意図が強く、追跡 Issue とのペアリングに最も適する。

### スコープ

- **対象**: `packages/e2e`（Playwright）, `packages/vscode-e2e`（VS Code WebView ExTester）配下のテスト
- **対象外**: vitest（ユニット / 統合）テスト — flake が出にくく、出た場合は別途扱う

## 理由

- **PR を hold しない**: flake 1 件で関係ない PR の CI が永続的に red になる事態を防ぐ。Phase 1 のような「flake exposure を目的とする変更」が landable になる
- **flake を記録に残す**: 単に retry に隠すのでも、skip して忘れるのでもなく、Issue として明示的に追跡することで対応漏れを防ぐ
- **`test.fixme` の可視性**: Playwright report の `[fixme]` 表示は通常 skip より目立つ。レビュー時に「これは何だ？」と気付ける
- **判断コストを下げる**: 「flake かどうか確証が無い時の判断基準」をルール化することで、各 PR で個別に議論する負荷を減らす

## 却下した案

### retries で隠し続ける

ADR-20260412-05 の趣旨（flake は visible にして潰す）と矛盾。Issue #1008 の動機そのものが「retries が flake を覆い隠している」だったので、本決定は #1008 の自然な延長。

### CI 全体を red のままにする

修正 PR が即マージできない場合に他の作業が止まる。ブランチ保護を回避する誘惑が生まれ、長期的には false-pass を増やす。

### test.skip で消す

意図的な skip と flake 由来の skip が混在し、後追いができなくなる。`test.fixme` ならレポートで区別できる。

### テストファイルから削除する

履歴が失われ、再有効化の入り口が消える。flake 修正は時間が経つほど optional に感じられて永久に放置される。

## 運用上の補足

### Claude / AI 投入時のフォロー

E2E の不具合調査を AI に依頼する際、本ポリシーは以下の経路で伝わる：

- `packages/e2e/README.md` の "Handling flaky tests" 節 — co-located な README は AI が自然に参照する
- 本 ADR — `topic: testing` で `effective.md` のインデックスに載る
- Claude Code の `CLAUDE.md` に flaky 対応を直書きしない理由は、ポリシーが頻繁に更新される領域ではないこと、および E2E スコープ限定なので E2E パッケージ内に閉じて管理する方が原則に沿うこと

### Phase ロールアウトとの関係

Issue #1008 で進めている `retries: 2 → 1 → 0` の各フェーズで本ポリシーが繰り返し適用される想定：

- Phase 1（2 → 1）: 2 attempts 全 fail の flake が露出（最初の例: AT-0014 / Issue #1171）
- Phase 2（1 → 0）: 1 attempt fail の flake がさらに露出する見込み
- 各フェーズで露出した flake は本 ADR 通り `test.fixme` + 追跡 Issue で処理する

## Follow-up

- 追跡 Issue が積み上がりすぎた場合、定期的な棚卸しを `/qa` の前段に組み込むか別途検討
- `test.fixme` で長期間放置されている test を検出する CI チェック（例: 30 日以上かつ Issue が close 済みの fixme を warning する）の追加は別 Issue で扱う
