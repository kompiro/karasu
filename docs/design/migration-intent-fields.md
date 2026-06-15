# 移行 intent の machine-readable 化（構造化ライフサイクルフィールド）

- **日付**: 2026-06-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1568](https://github.com/kompiro/karasu/issues/1568)（gap B / 親 [#1567](https://github.com/kompiro/karasu/issues/1567)）
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

## 現時点の方針

**消費者の需要（Q1）が全体のゲート。** machine-readable の利得は、それを読む側（期限色分け・"Q3 前廃止"クエリ・export feed）が実在して初めて生まれる。消費者が無ければ案3（散文規約）で十分で、構造化は「厳しい構文の散文」に過ぎない。

需要があるなら **案1（graceful degradation）+ scope b/c（保持・表示・軽い filter / export）** を推す。karasu の既存パターンに最も整合し、曖昧な時期も壊さず書ける。**PERT/クリティカルパスは非目標として core 外（export）に置く。**

## 未解決の問い

- **Q1（最重要・ゲート）**: machine-readable 側の消費者をどこに置くか。(a) 当面なし＝案3 据え置き / (b) 軽い filter・style（期限色分け等）/ (c) 日付付きグラフの export。
- **Q2**: 値の形は **案1（date-or-string graceful degradation）** でよいか、案2（strict）か案3（prose）か。
- **Q3**: 構文。`@deprecated(until: "...")` のパラメータ形式か、`operations` に倣った装飾形式か。文法をどう拡張するか。
- **Q4**: 二層化（組み込み4つだけ param 対応）を許容するか、param は特定キー（`until` / `from`）に限定するか。
- **Q5**: drift（`until` が過ぎても自動では何もしない）— warn しない（純粋な注記）か、期限超過を info で surface するか。
