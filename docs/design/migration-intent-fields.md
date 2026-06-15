# 移行 intent の machine-readable 化（構造化ライフサイクルフィールド）

- **日付**: 2026-06-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1568](https://github.com/kompiro/karasu/issues/1568)（gap B / 親 [#1567](https://github.com/kompiro/karasu/issues/1567)）
  - PR: [#1589](https://github.com/kompiro/karasu/pull/1589)
  - 非目標の境界: [#23](https://github.com/kompiro/karasu/issues/23)（sequence / 時間軸モデリングはスコープ外）
  - 外部 fence の先例: [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md)（runtime authz を語彙に入れず散文＋link 規約に逃がす）
  - 既存パターン: `operations` の verb-decoration、open annotation set、`job` の `schedule`（`docs/spec/syntax.md`）
  - コード: `packages/core/src/parser/parser.ts`（annotation パース）, `packages/core/src/types/ast.ts`

## 背景・課題

ライフサイクルアノテーション（`@deprecated` / `@new` / `@experimental` / `@migration_target`）は **裸のフラグ**で、パラメータを取れない。移行の **目標時期・移行元/先・順序** は現状すべて散文 `description` に書く（進化ガイドが規約化）。

これを machine-readable にできれば、「Q3 前に廃止予定のノードを全部出す」クエリ、期限の近さでの色分け、あるいは日付付き依存グラフの **export**（PM ツールで PERT / クリティカルパス計算）といった高付加価値ビューが開ける。一方で karasu は時間軸・スケジューリングを非目標としており（#23）、どこまでを core に入れるかの線引きが要る。

本 Design Doc は「**そもそも作るべきか／作るならどの形・どこまで**」を決める。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| アノテーション | open set。`@<identifier>` を任意に受理。組み込み4つだけデフォルト描画。**パラメータ構文なし**（裸フラグ） |
| 移行メタの記述 | 廃止時期・移行先は散文 `description`（進化ガイドの `アクセス:` 風規約に類似） |
| 既存の「精度で縮退」パターン | ① `operations` の `<verb>:<crud>` 装飾（認識 CRUD→意味付与 / 認識外→opaque 保持＋warning）② open annotation（組み込み→描画 / 独自→opaque だが style 対象）③ `job.schedule`（cron 値を **保持・表示するが計算しない**） |
| 非目標 | 振る舞い・シーケンス・時系列モデリング（#23 でスコープアウト）。PERT/クリティカルパス＝時間軸スケジューリングはこの族 |

## 制約・前提

- **「ゆっくり変化する構造的意図」フィルタ**（concepts「目標と非目標」）: 廃止目標四半期・移行元は *計画＝意図* 側で in-scope の主張が立つ。ロールアウト % やリアルタイム進捗は runtime で out。
- **PERT/クリティカルパスは非目標**: karasu は scheduler を内製しない。やるなら **export**（日付付き依存グラフを吐き、PM ツールが計算）。`job.schedule` を「保持・表示するが simulate しない」のと同じ立ち位置。draw.io/layout の escape-hatch と同型。
- **アノテーションは現状パラメータ非対応**: `@name(key: value)` は文法変更。組み込み4つだけに型付き param を足すと「型付き組み込み vs schemaless 独自」の二層が生じる。
- **warn, don't error / describe, don't prescribe**: 入れても強制はしない。drift（`until` が遅延で嘘になる）を enforce しない方針と整合させる必要。

## 検討した選択肢

論点は (1) 値の形、(2) scope（消費者）。

### 案1: 精度による graceful degradation（date-or-string）

`@deprecated(until: "2026-Q3")` / `@migration_target(from: LegacyMonolith)`。値が **ISO 日付/四半期としてパースできれば machine-usable**（filter / sort / style / export）、できなければ **opaque 文字列で表示のみ**。既存の「認識→意味／認識外→opaque」パターン（verb-decoration / open annotation / job.schedule）と同系。不正な日付っぽい入力には `annotation-possible-typo` 式の info ヒント。

**メリット**: karasu idiomatic。曖昧な時期も書けて壊れない。機械化したい所だけ厳密に。
**デメリット**: アノテーションにパラメータ構文を導入する文法変更。二層化。

### 案2: 厳密な型付きフィールドのみ

`until` は ISO 日付必須、文字列フォールバック無し。

**メリット**: パース・クエリが単純。
**デメリット**: 「来年あたり」のような曖昧な現実の移行時期を書けず、結局 description に逃げる。open/散文寄りの karasu 文化と不整合。

### 案3: 散文規約のまま（現状維持）

`description` に「Q3 廃止」等。

**メリット**: 文法変更ゼロ。authz の `アクセス:` 規約と同じ「縁は散文」パターン。
**デメリット**: machine-readable にならず、クエリ/色分け/export は不可。

### scope（消費者）の選択

- **a. 保持・表示のみ**: パースして詳細パネル/散文に出すだけ。
- **b. + 軽い filter/style**: 「Q3 前廃止を色分け」程度。core 内。
- **c. + export**: 日付付き依存グラフを吐く（PERT は PM ツール側）。
- **d. PERT/クリティカルパスを内製** → **非目標（却下）**。

## 比較

| 観点 | 案1 graceful | 案2 strict | 案3 prose |
| --- | --- | --- | --- |
| 曖昧な時期の表現 | ◎ | ✗ | ◎ |
| machine-readable | ○（精密値のみ） | ◎ | ✗ |
| 文法変更 | 要 | 要 | 不要 |
| karasu 文化整合 | ◎ | △ | ◎ |
| 二層化リスク | 有 | 有 | 無 |

## 関連 TPLs

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理する語彙は「効果を持つ / 警告される / open set と明文化」のいずれか。構造化フィールドを足すなら、認識外値の扱い（opaque 保持＋表示、もしくは hint）をこの観点で明示する。

（新規 proactive TPL は方針確定後に要否判断。語彙拡張＝文法変更を伴うため、確定時に「spec 改訂時の proactive TPL 同梱」ルールの対象になりうる。）

## 決定事項（レビュー反映）

- **Q1 → (b) 保持・表示・軽い filter/style を core に入れる**。日付/移行先を保持・詳細表示し、「期限の近いものを色分け」「廃止予定だけ表示」程度の軽い filter/style まで。**export（日付付きグラフ）と PERT/クリティカルパスは本スコープ外**（PERT は非目標 #23。export 需要が観測されたら別途 — `job.schedule`/draw.io と同じ escape-hatch 思想）。
- **Q2 → 案1 graceful degradation**: 値は date-or-string。ISO 日付/四半期としてパース可なら machine-usable（filter/style）、不可なら opaque 文字列で表示のみ。既存パターン（verb-decoration / open annotation / job.schedule）と同系。
- **Q5 → 純粋な注記（warn しない）**: `until` を過ぎても診断は出さない。`until` は意図の記録であり、"現在時刻" を評価軸に持ち込まない（warn-don't-error / runtime 非追従と整合）。

### 実装時に確定する細部（推奨付き・ADR/実装 PR で最終化）

- **Q3（構文）→ パラメータ形式 `@name(key: "value")` を推奨**: アノテーションは `@name` なので `@deprecated(until: "2026-Q3")` / `@migration_target(from: LegacyMonolith)` が自然。`operations` の `<verb>:<crud>` 装飾はリスト用で不適。annotation パーサに `(key: value)` 拡張を足す。
- **Q4（キー集合 / 二層化）→ 組み込みの限定キーのみを推奨**: `until`（`@deprecated` / `@experimental`）、`from`（`@migration_target`）に限定。**独自アノテーションは当面パラメータ非対応**（裸フラグのまま）にして二層化を最小に抑える。独自アノテーションへの param は将来拡張の余地として残す。

## 現時点の方針

**案1（graceful degradation）+ scope (b)** を採用する。日付/移行先を構造化フィールドで保持し、保持・表示・軽い filter/style まで core で提供。値は date-or-string で曖昧な時期も壊さず書ける。drift は純粋な注記（warn しない）。**PERT/クリティカルパスと export は非目標/将来課題として core 外**に置く。

### 実装の指針

1. parser: annotation の `@name(key: "value")` パラメータ構文を追加（まず組み込みの `until` / `from` キー）。AST にアノテーション params を保持。
2. 値の解釈: `until` を ISO 日付/四半期としてパース試行 → 成否で machine-usable / opaque を分岐（graceful degradation）。不正な日付っぽい値は info ヒント（`annotation-possible-typo` 式）。
3. filter/style: 期限の近さ等で `.krs.style` セレクタ or App の軽い絞り込みに供する最小経路（具体 UI はスコープ最小で）。
4. spec/docs: `docs/spec/tags-annotations.md` にアノテーション params を明文化（spec 改訂時の proactive TPL 同梱ルールに従い、TPL-20260610-01 への back-ref か新規 proactive TPL を検討）。
5. AT・tests。
6. ADR 昇格: 本 Design Doc を `docs/adr/<date>-NN-migration-intent-fields.md` に集約、同 PR で削除。Q3/Q4 の最終形を ADR に確定。
7. changeset（公開 CLI に新構文が surface するため）。

### 影響範囲・マイグレーション

- 後方互換: 既存の裸フラグ（`@deprecated` 等）はそのまま有効。params は opt-in。
- 非目標境界の明文化: export / PERT は入れない（#23）。需要が出たら別 Issue。
