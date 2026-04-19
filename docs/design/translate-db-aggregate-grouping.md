# `translate --from db` のデフォルトを集約ルート単位のテーブル集約に変更する

- **日付**: 2026-04-19
- **ステータス**: 検討中
- **関連**:
  - Issue #644
  - Issue #643（openapi 側の対になる提案） — ADR-20260417-01
  - `packages/cli/src/translate/db.ts`
  - `packages/cli/src/translate/translator.ts`
  - `packages/cli/src/index.ts`
  - `docs/acceptance/0053-translate-openapi-db.md`

## 背景

`karasu translate --from db` は、SQL DDL 上の各 `CREATE TABLE` を 1 個ずつ `.krs` の `table` ノードに変換してきた。実際のスキーマでは多くのテーブルが「独立したドメイン」ではなく、ある集約ルートの内部構造である。典型例:

- `contracts` + `contract_line_items` → 1 個の "Contract" ドメイン
- `orders` + `order_items` → 1 個の "Order" ドメイン
- `invoices` + `invoice_lines` + `invoice_taxes` → 1 個の "Invoice" ドメイン

これらを個別の top-level `table` として吐き出すと、読み手が頭の中で子テーブルを親に畳み直す必要があり、モデルがノイジーになる。Issue #643（openapi の CRUD 6 メソッドが 6 個の usecase になってしまう問題）と同じクラスの問題を、データモデルの側で解く。

## 決定

### 1. デフォルトを「集約ルートへの畳み込み」に変更する

`translate --from db` のデフォルト出力を、テーブル単位から **集約ルート単位** に変える。親の内部構造と判断された子テーブルは、親の `table` ノードに畳み込まれ、元テーブル名は `description """..."""` ブロックに構造化アノテーションとして残す。

```krs
database OrderDB {
  table ContractsTable {
    label "contracts"
    description """
      Tables:
      - contracts (root)
      - contract_line_items — composite PK with FK to contracts
      """
  }
  table PaymentsTable { label "payments" }
}
```

### 2. 畳み込みヒューリスティクス（保守的、FK 依存）

誤って独立ドメインを畳み込む（false positive）方が、独立して残ってしまう（false negative）より悪い、という前提で保守的に判定する。2 つのシグナルのいずれかに該当した場合だけ畳み込む:

- **Signal 1: 複合 PK + 親への FK** — 子テーブルの PRIMARY KEY が 2 列以上で、そのうち 1 列以上が他テーブルへの FOREIGN KEY になっている。明示された親子関係としてもっとも強い。
- **Signal 2: 命名サフィックス + 親への FK** — テーブル名が `_items` / `_lines` / `_details` / `_detail` / `_history` / `_entries` / `_rows` で終わり、かつ stem と一致する既知テーブル（語尾 `s` / `es` も試す）への FK を持つ。命名だけでは畳まない点が重要。

**ジャンクションテーブルは畳まない。** 複合 PK の **すべて** の列が FK になっている（M:N 関係表）ケースは、いずれかの親に寄せると意味が歪むので独立した `table` として残す。

Signal 1 が成立した時点で Signal 2 は評価しない（Signal 1 の方が強いため）。親が別の親を持つ（孫テーブル）場合は推移的にルート親まで押し上げる。

### 3. 畳み込みの表現は `description """..."""`

openapi 側（ADR-20260417-01）と同じく、情報を失わないために `description` の構造化アノテーションで元テーブルを残す。

```
description """
  Tables:
  - <root> (root)
  - <child> — <reason>
  """
```

- `reason` は `composite PK with FK to <parent>` か `name suffix + FK to <parent>`
- コメント（`// Tables: ...`）ではなく `description` を採用した理由は ADR-20260417-01 と同じ — コメントはパーサで捨てられる／詳細パネルに出ない／再フォーマットで消えるが、`description` はノードのプロパティとして残る

### 4. 旧動作は `--granularity table` で opt-in で維持する

per-table 出力は廃止せず、`--granularity table` フラグで引き続き選択できる。`aggregate`（デフォルト）と `table` の 2 値だけをサポートする:

```
karasu translate --from db schema.sql                        # 集約（デフォルト）
karasu translate --from db schema.sql --granularity table     # 1 テーブル = 1 unit
```

`--granularity` の許容値はフォーマットごとに異なるため、CLI の action 層でフォーマット別に検証する:

- `--from openapi`: `resource` | `operation`
- `--from db`: `aggregate` | `table`
- 他フォーマットでの `--granularity` 指定はエラー

### 5. 子テーブルがない集約ルートはコンパクト表記を維持する

`description` ブロックを一律に付与すると、独立テーブルだらけのスキーマで出力が冗長になる。畳み込む子が 1 つもない `table` は従来通り 1 行表記 (`table X { label "x" }`) のままにする。

## 理由

- **痛みの大部分を言語変更なしで解消できる**: 6 → 1 クラスのテーブル削減はドリルダウンビューと警告パネルの両方で体感できるノイズ低減になる。言語側に「集約（aggregate）」概念を追加するのは波及が大きいので、まず translate 出力の改善で試す。
- **FK を必須条件にすることで誤マージを抑える**: 命名だけの判定だと、たまたま `_items` で終わる無関係テーブル（例: `menu_items`, `line_items` がそれぞれ別ドメイン）を誤って畳み込む。FK リンクを必須にすれば「構造的に紐づいている」証拠があるケースに限定できる。
- **ジャンクションテーブルを除外するのが直感に合う**: ジャンクションは関係性そのものを表す表であり、どちらかの親に畳み込むと意味が偏る。独立ノードとして残す方が自然。
- **`description` は情報ロスなく UI に残る**: ユーザーが出力を編集した後でも「何テーブルから生まれたか」を追える。openapi 側と同じ設計にすることで、UI 側の詳細パネル表示も共通の実装で対応できる。
- **互換性確保**: per-table 出力に依存する既存パイプラインを破壊しないため、旧動作をフラグで維持する。

## 却下した案

### 案 A: 言語側に `aggregate` / `table group` 概念を追加する

Issue #644 で明示的に out-of-scope とした。`database` ブロックの中に「集約」レイヤを挿入すると、ネスト、ルール、スタイル、ドリルダウン挙動など波及が大きい。translate 出力で痛みが消えるかを先に検証する。

### 案 B: 命名サフィックスだけで畳み込む（FK を要求しない）

Issue 本文でも中程度シグナルと位置付けられている。実務スキーマでは `menu_items` / `line_items` のように同じサフィックスでも無関係のテーブルが珍しくない。命名だけでは false positive が多すぎるので、必ず FK とのコンビネーションで判定する。

### 案 C: テーブルを完全に消す（畳み込んだ子は何の痕跡も残さない）

最もクリーンな表示になるが、出力を受け取った側で「どの SQL テーブルから生成されたか」を後から追えなくなる。`description` に残す方が情報量と UI ノイズのバランスが取れる。

### 案 D: ラベルや ID を集約名（"Contract", "Invoice"）にリネームする

集約の意味からは自然だが、「どの SQL テーブルが root か」の対応を失い、再パース・再変換や karasu.map.yaml 連携で扱いにくくなる。ルートテーブル名をそのまま ID/ラベルに残し、追加情報を `description` で説明する方がトレーサビリティが良い。

### 案 E: inbound FK の有無も判定に使う（"他テーブルから参照されていない" を子のシグナルにする）

スキーマ全体を走査する必要があり、複数ファイル / 部分 schema に対して誤判定しやすい。Signal 1 / 2 だけで typical な CRUD スキーマは拾えるので、追加シグナルは将来の拡張余地として残す。

## 実装への影響

1. **更新**: `packages/cli/src/translate/db.ts` — SQL パーサを `parseTables` に拡張（列・PK・FK を抽出）、`inferAggregates` で畳み込み判定、`emitAggregateTable` で `description """..."""` 出力。
2. **更新**: `packages/cli/src/translate/translator.ts` — `TranslatorContext.granularity` の許容値に `"aggregate" | "table"` を追加。
3. **更新**: `packages/cli/src/translate/index.ts` — `TranslateOptions.granularity` の型を拡張。
4. **更新**: `packages/cli/src/index.ts` — `--granularity` のヘルプ文言を更新し、フォーマット別に値検証。
5. **更新**: `packages/cli/src/translate/db.test.ts` — flat 出力用テストは `granularity: "table"` を明示、aggregate 用のテストケースを追加（複合 PK 判定 / 命名+FK 判定 / junction 除外 / 命名のみは畳まない / table-level FOREIGN KEY / 複数子 / 独立テーブル / 空入力）。
6. **更新**: `packages/cli/src/translate/translate.e2e.test.ts` — 集約挙動を網羅する AT ベースの e2e テストを追加。
7. **更新**: `docs/acceptance/0053-translate-openapi-db.md` — AT-0053-04/05 は `--granularity table` 使用に更新、AT-0053-11/12/13 を追加（aggregate 畳み込み / junction 除外 / 不正値エラー）。

## 将来の拡張余地

- **inbound FK なし をシグナルに加える**: マルチファイル対応や whole-schema analysis が揃えば精度を上げられる。
- **言語側 `aggregate` 概念**: translate 改善だけでは不十分な痛みが残れば別途 Design Doc を起こす。
- **`--granularity` を openapi と db で再利用する共通メタ（例: `flat`）**: フォーマット横断の共通値があれば揃える余地はあるが、現状は片側 2 値ずつで十分と判断。
