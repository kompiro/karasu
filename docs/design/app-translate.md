# App で translate を提供する

- **日付**: 2026-05-20
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1463](https://github.com/kompiro/karasu/issues/1463)
  - 関連 ADR: [ADR-20260409-02](../adr/20260409-02-cli-translate-command.md)（translate CLI の導入）, [ADR-20260411-07](../adr/20260411-07-translate-apply-option.md), [ADR-20260419-01](../adr/20260419-01-translate-db-aggregate-grouping.md), [ADR-20260506-05](../adr/20260506-05-translate-crud-bindings.md), [ADR-20260503-01](../adr/20260503-01-verb-crud-decoration.md)
  - 関連 TPL: [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（CLI と App で translate を二重実装すると output が乖離する）, [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（外部 infra ファイルは信頼境界外の入力）, [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md)
  - コード: `packages/cli/src/translate/`, `packages/app/src/`

## 背景・課題

`karasu translate` は infra 設定や API spec（`docker-compose.yml` / k8s マニフェスト / OpenAPI spec / DB スキーマ）を `.krs` の足場に変換する CLI サブコマンドである。既存システムの棚卸し・リアーキテクチャ支援や新入社員のオンボーディングにおける主要な入口になっている（AI サポート設計の柱の 1 つ）。

しかしこの機能は **CLI 専用** であり、プレビュー UI（App）を主な作業場にしているユーザーは次の往復を強いられる。

1. App を離れてターミナルを開く
2. `karasu translate --from ... infra.yml > out.krs` を実行
3. 生成された `.krs` を App に取り込む

App 内で同じ変換を完結できれば、この往復が消える。

## 現状（インベントリ）

| ファイル | 役割 | Node 依存 |
| --- | --- | --- |
| `packages/cli/src/translate/index.ts` | orchestrator（入力読込・format 振り分け・`system` ラップ・出力） | `node:fs`, `node:path`, `process.exit/stderr` |
| `packages/cli/src/translate/translator.ts` | `Translator` / `TranslatorContext` インターフェース | なし |
| `packages/cli/src/translate/compose.ts` | docker-compose → deploy ブロック | `context.inputPath` 経由のみ |
| `packages/cli/src/translate/k8s.ts` | k8s マニフェスト → deploy ブロック | `context.inputPath` 経由のみ |
| `packages/cli/src/translate/openapi.ts` | OpenAPI → service / usecase | `node:path`（`basename`/`extname`） |
| `packages/cli/src/translate/db.ts` | DB スキーマ → database / table | `node:path`（`basename`/`extname`） |
| `packages/cli/src/translate/realizes.ts` | `karasu.map.yaml` 読込 + `realizes` 3 段解決 | `node:fs`, `node:path`, `process.stderr` |

- 変換ロジック本体（YAML/SQL の構文解析・`.krs` 文字列の組み立て）は **ほぼ純粋な TypeScript** で、唯一の外部依存は `yaml` パッケージ（ブラウザ動作可）である。
- Node に結合しているのは次の 3 点のみ:
  1. **入力ファイルの読み込み**（`index.ts`）
  2. **`karasu.map.yaml` の解決と読み込み**（`realizes.ts` の `resolveMapPath` / `loadMapFile`）。`openapi`/`db` の `basename`/`extname` は入力パスから名前を導くだけ。
  3. **警告出力**（`realizes.ts` が未解決 `realizes` を `process.stderr` に書く）
- App は `packages/core`（パーサー・レンダラー）にすでに依存している。App には ProjectMode（OPFS）/ MemoryMode（インメモリ単一ドキュメント）/ ServeMode（`karasu serve` バックエンド）の 3 モードがある。

## 制約・前提

- **CLI の出力は 1 バイトも変えない。** 既存の translate AT・スナップショット・examples を退行させないこと。
- ブラウザはファイルシステムにアクセスできない。入力ファイルと `karasu.map.yaml` はユーザーが明示的に渡す（ファイル選択 or 貼り付け）。
- CLI と App で変換ロジックを **二重実装しない**（[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)）。同じ入力から同じ `.krs` が出ることを構造的に保証する。
- translate の出力意味論の変更・新規入力フォーマットの追加は out of scope。
- App の UI は 3 モードで動くこと。生成物の保存先はモードによって異なってよい。

## 検討した選択肢

### 案1: translators を `packages/core` に移設しクライアントサイドで変換

`packages/cli/src/translate/` を `packages/core/src/translate/` に移し、Node 依存を除去してブラウザ移植可能にする。CLI も App も同じ core の関数を呼ぶ。

- `TranslatorContext` から `inputPath` / `mapPath` を外し、すでに読み込み済みの値（`inputName`・`mapFile` 文字列）を受け取る形にする。
- 警告は `process.stderr` に書かず、戻り値（`TranslateResult.warnings`）として返す。
- orchestrator（format 振り分け + `system` ラップ）も core に移し、CLI/App 共用にする。
- CLI 側にはファイル I/O（入力読込・`karasu.map.yaml` の解決と読込・stdout/ファイル出力・stderr 警告）だけが残る。

**メリット**

- 変換ロジックが単一実装になり CLI/App の output 乖離が構造的に起きない（TPL-20260510-11）。
- App の全モード（Project / Memory / Serve）で動く。サーバー不要。
- core はもともと「Pure TS」を標榜しており、純粋な変換ロジックの置き場として自然。

**デメリット**

- パッケージ境界をまたぐ移設で変更量が大きい。`core` に `yaml` を dependency 追加する必要がある。
- `core` の API surface が増える（#1363 の公開 API 整理に影響しうるが、translate は明確な機能単位なので許容範囲）。

### 案2: `karasu serve` に `/api/translate` エンドポイントを追加

`serve.ts` に変換エンドポイントを足し、App は入力内容を POST して `.krs` を受け取る。

**メリット**

- 変更量が小さい。translators は `cli` に置いたまま。

**デメリット**

- ServeMode でしか使えない。ProjectMode / MemoryMode のユーザーは恩恵を受けられない。
- 信頼境界を越える POST ハンドラが増える（[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)）。
- App ⇄ サーバーの往復が要る。CLI を起動していないと使えない。

### 案3: 案1 + 案2 の両方

core にポータブルなロジックを置き、`serve` にも薄いラッパーのエンドポイントを公開する。

**メリット**

- 最大の対応範囲。

**デメリット**

- 案1 だけで App の全モードをカバーできるため、エンドポイントは現時点で需要がない。作業量だけ増える。

## 比較

| 観点 | 案1（core 移設） | 案2（serve endpoint） | 案3（両方） |
| --- | --- | --- | --- |
| 変更量 | 中 | 小 | 大 |
| 対応モード | Project / Memory / Serve 全部 | Serve のみ | 全部 |
| ロジック重複 | なし（単一実装） | なし | なし |
| サーバー要否 | 不要 | 必要 | 片方は不要 |
| 後方互換性 | CLI 出力不変 | CLI 出力不変 | CLI 出力不変 |

## 現時点の方針

**案1 を採用する** — translators を `packages/core` に移設し、Node 依存を除去してクライアントサイドで変換する。App の全モードをサーバーなしでカバーでき、変換ロジックが単一実装になって CLI/App の output 乖離（TPL-20260510-11）が構造的に起きない。`core` はもともと純粋な TS ロジックの置き場であり、translate はそこに収まる。案2 のエンドポイントは ServeMode 限定でしか効かないため採らない。

### 実装の指針

#### 1. translators を core へ移設し、ポータブル化する

- `packages/cli/src/translate/{translator,compose,k8s,openapi,db,realizes}.ts` を `packages/core/src/translate/` へ移動する。
- `TranslatorContext` を作り替える:
  - `inputPath` を削除。代わりに `inputName?: string`（拡張子を除いたベース名）を持たせる。compose の env 名 / openapi の service 名 / db の database 名はここから導く。
  - `mapPath` を削除。代わりに `mapFile?: string`（`karasu.map.yaml` の生テキスト）を持たせる。
- `realizes.ts`:
  - `loadMapFile(path)` を `parseMapFile(content: string)` に置き換える（`node:fs` を除去）。`resolveMapPath` は CLI 側へ移す。
  - `realizesLines` は `process.stderr` に書かず、警告文字列を返り値経由で集約する。
- `openapi.ts` / `db.ts` の `node:path`（`basename`/`extname`）依存を除去する（`inputName` を直接受け取るため不要になる）。
- `Translator.translate` の戻り値を `Promise<TranslateResult>` にする:

  ```ts
  interface TranslateResult {
    krs: string;
    warnings: string[];
  }
  ```

- orchestrator を core に置く。`SYSTEM_NAME_PATTERN` / `wrapInSystem` も core へ移し、format 振り分け + `system` ラップを行う純粋関数を 1 つ公開する:

  ```ts
  function translateInfraConfig(
    input: string,
    options: TranslateInfraOptions,
  ): Promise<TranslateResult>;
  ```

- `core/src/index.ts` から `translateInfraConfig` / 関連型を re-export する。`core` の `package.json` に `yaml` を dependency 追加する。

#### 2. CLI を移設先に張り替える（出力不変）

- `packages/cli/src/translate/index.ts` はファイル I/O 専用に縮小する: 入力ファイル読込 → `karasu.map.yaml` のパス解決と読込 → `translateInfraConfig` 呼び出し → `result.warnings` を `process.stderr` に出力 → `result.krs` を stdout / `--output` に書く。
- CLI 引数の検証（`--from` / `--granularity` / `--system` の妥当性）は CLI 層に残す。
- 既存の translate テスト（`packages/cli/src/translate/*.test.ts`, `translate.e2e.test.ts`）は core 側に移すか、core を呼ぶ薄いテストに置き換える。CLI 出力が変わっていないことをスナップショットで担保する。

#### 3. App に変換 UI を追加する

- `TranslateDialog`（モーダル）コンポーネントを新設する:
  - フォーマット選択（compose / k8s / openapi / db）
  - 入力: ファイル選択（`<input type="file">`）＋テキスト貼り付けエリア
  - 詳細オプション（折りたたみ）: `service` / `database` / `granularity` / `emit-bindings` / `emit-crud-decoration` / `system`、および任意の `karasu.map.yaml` 貼り付け
  - 「変換」実行で `translateInfraConfig` をクライアントサイド実行 → 生成 `.krs` を読み取り専用プレビュー＋警告一覧で表示
  - 結果アクション: 「コピー」（全モード）／ ProjectMode では「新規ファイルとして作成」（`index.krs` 等の既存ファイル作成フローに合流）
- Command Palette に「Translate infra config to .krs」コマンドを追加してダイアログを開く。ツールバーにもエントリを置く（アイコン + テキストラベル）。
- i18n: ユーザー向け文字列は `docs/spec/i18n.md` のポリシーに従い App の i18n リソースへ追加する。

#### 4. 受け入れテスト

`docs/acceptance/` に新規 AT ファイルを追加する。TC は:

- App から compose / k8s / openapi / db を変換し、CLI と同一の `.krs` が得られる（parity）
- 詳細オプション（`granularity` / `system` / `emit-bindings`）が反映される
- `karasu.map.yaml` を貼り付けると `realizes` が解決される／貼らないと警告が出る
- 不正な入力（壊れた YAML / SQL）でエラーが UI に表示され、App がクラッシュしない
- ProjectMode で生成結果を新規ファイルとして保存できる

#### 5. ADR 昇格

実装完了後、本 Design Doc を `docs/adr/YYYYMMDD-NN-app-translate.md` として昇格し、同じ PR で本ファイルを削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: CLI の `karasu translate` は挙動・出力ともに不変。App に新機能が増えるのみ。
- ドキュメント更新: `CLAUDE.md` のリポジトリ構成（translate が core 配下になる）、`docs/spec/` に App の translate 操作を記す箇所があれば追記。
- テスト・examples への影響: translate のテストは core へ移設。examples への影響なし。
- パッケージ: `@karasu-tools/core` に `yaml` を dependency 追加。CLI の `translate/` ディレクトリは I/O ラッパーのみ残る。

## 未解決の問い / 決めないこと

- **ServeMode での保存先**: ServeMode は `.krs` がサーバー側ディスクにあるため、App から新規ファイルを書き戻す経路が現状ない。初版では ServeMode は「コピー」のみとし、書き戻しは将来の課題とする。
- **`karasu serve` の `/api/translate` エンドポイント**: 案2 は今回は採らない。CI で deploy.krs を継続更新するようなサーバー連携ユースケースが出てきたら別 Issue で再検討する。
- **複数ファイルの一括変換**（k8s マニフェスト群など）: CLI ではシェルループで実現している。App での一括投入 UI は初版では扱わず、単一ファイル変換に絞る。
