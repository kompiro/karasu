# ADR ツール用語彙の外部設定化（adr.config.json）

- **日付**: 2026-05-02
- **ステータス**: 検討中
- **関連**:
  - Issue #1077（Phase 1）— 親 #1074（adr-tools 抽出全体）
  - ADR-20260423-01（`adr-tooling` トピック導入）
  - ADR-20260424-01（ADR knowledge graph 移行完了）

## 背景・課題

`scripts/adr/` 配下の ADR ツール（validator / extractor / regenerator / visualizer / assumption checker、計 ~2,580 LOC）を、将来別リポジトリへ抽出して `@kompiro/adr-tools` として npm publish したい（親 Issue #1074）。

現状、karasu 固有の語彙が `scripts/adr/validator.ts` にハードコードされている:

- `VALID_TOPICS` (`validator.ts:11-27`) — `parser`, `renderer`, `vscode` など karasu の製品トピック 15 件
- `VALID_CONCERNS` (`validator.ts:48-56`) — 7 件（`accessibility`, `ci`, ... `security`）
- 出力パス（`regenerator.ts:55-67`）— `effective.md`, `graph.md`, `graph/<topic>.md` がリテラル

これらを外部設定化することで:

1. 抽出後、別プロジェクトが自分の語彙で adr-tools を使える
2. karasu 側は `adr.config.json` を 1 ファイル維持するだけで現状の挙動を保てる
3. Phase 2（リポ抽出）以降の差分を最小化できる

このドキュメントは Phase 1 の設計判断（ファイル形式・ローダ API・後方互換ポリシー）をユーザーと合意するためのもの。

## 制約・前提

- **挙動を変えない**: `pnpm run adr:validate` / `adr:regenerate --check` は config 導入後も同じ結果を返す
- **frontmatter スキーマは触らない**: フィールド構造・必須性・関係制約は対象外
- **karasu の README 構造との結合は切らない**: `validator.ts:8-10` のコメントが指す「`docs/adr/README.md` のセクション見出しと同期」運用は維持（将来 opt-out 可能にするのは Phase 2 で検討）
- **CLI 互換**: `package.json` の `adr:*` スクリプト群は無変更で動かしたい（フラグ追加なし）
- **TypeScript 直実行**: 既存と同じく `tsx scripts/adr/<entry>.ts` で起動できる
- **依存追加最小**: 既存依存（`js-yaml`）以外は追加しない方針。JSON で十分

## 検討した選択肢

### 論点 1: ファイル形式

#### 案 1A: `adr.config.json`

```json
{
  "$schema": "./scripts/adr/config.schema.json",
  "topics": ["core-concepts", "parser", ...],
  "concerns": ["accessibility", "ci", ...],
  "paths": {
    "adrDir": "docs/adr",
    "outputs": {
      "effective": "effective.md",
      "graph": "graph.md",
      "graphByTopic": "graph/"
    }
  }
}
```

- ➕ JSON Schema による editor 補完が素直
- ➕ パース依存ゼロ（Node 標準）
- ➕ 機械生成・差分レビューが容易
- ➖ コメントが書けない（必要なら `_comment` フィールドで代用、もしくは README へ）

#### 案 1B: `adr.config.ts` / `adr.config.js`

- ➕ コメント・型推論が直接効く
- ➖ tsx 実行が前提になる（CLI 起動コストが増える）
- ➖ 任意コードを評価する余地があり、抽出後に他プロジェクトへ供給する際の信頼境界が曖昧
- ➖ JSON より差分レビューが読みづらいケースが出る

#### 案 1C: `adr.config.yaml`

- ➕ コメント可
- ➖ `js-yaml` 依存だが既にあるので問題ない
- ➖ JSON Schema を効かせる editor 設定が VS Code では JSON より一手間（`yaml.schemas` 指定）
- ➖ 設定ファイル形式を frontmatter（YAML）と分離する利点が薄い

**現時点の方針: 1A（JSON）**。理由:

- editor 体験（補完・検証）が一番素直
- 評価不要 = セキュリティ境界が単純
- karasu の他の root 設定（`tsconfig.json`, `package.json`, `lefthook.yml` 以外）が JSON 寄り
- Phase 2 で別リポに切り出した後、他プロジェクトに採用してもらいやすい（YAML より JSON の方が抵抗が少ない）

コメントが必要になった場合は `$schema` 経由の description で補い、それでも不足するなら `docs/adr/README.md` 側に書く運用とする。

### 論点 2: 設定ファイルの場所と探索ルール

#### 案 2A: CWD 直下のみ自動探索

- ➕ シンプル。`pnpm run adr:*` は repo root から起動するので問題なし
- ➖ サブディレクトリから直接 `tsx scripts/adr/validate.ts` を呼ぶと動かない（が、現状そういう運用はない）

#### 案 2B: CWD から上位を探索（cosmiconfig 風）

- ➕ どこから呼んでも動く
- ➖ 依存（cosmiconfig）追加または自前実装が必要
- ➖ Phase 1 では過剰

#### 案 2C: 環境変数 `ADR_CONFIG` で明示パス指定

- ➕ テスト・CI で柔軟
- ➖ 単独では運用しづらい（毎回 export が必要）

**現時点の方針: 2A をデフォルトとし、テスト用に loader 関数の引数で明示パスも受ける**。環境変数は導入しない（YAGNI、必要になったら Phase 2 で追加）。

```typescript
// scripts/adr/config.ts
export function loadConfig(cwd: string = process.cwd()): AdrConfig;
```

### 論点 3: 設定不在時のフォールバック

#### 案 3A: 厳格モード — 設定ファイル必須、無ければエラー（init で雛形生成）

- ➕ ライブラリとして自然: karasu 固有の語彙が defaults に焼き付かない
- ➕ 抽出後、他プロジェクトが採用するときに「自分の vocabulary を持つ」ことを強制でき、混乱を防げる
- ➕ エラーメッセージで `npx adr-tools init` を案内すれば onboarding は損なわれない
- ➖ Issue #1077 の AT（"falls back to current built-in defaults"）を満たさない → AT を改訂する必要あり
- ➖ karasu リポでは `adr.config.json` をコミット必須にする運用変更が入る

#### 案 3B: 寛容モード — 設定ファイル無しは built-in defaults を使う

- ➕ Issue #1077 のアクセプタンス基準そのもの
- ➖ defaults が karasu 固有（topics に `parser`, `vscode` 等）なのは抽出後に奇妙
- ➖ 他プロジェクトが何も設定せず使い始めると karasu の topic 名で警告が出続け、デバッグしづらい

**現時点の方針: 3A（厳格 + init）**。理由:

- 親 Issue #1074 のゴールは「他プロジェクトでも使える adr-tools」であり、defaults を karasu に寄せると Phase 2 抽出後に必ず作り直す（負債を Phase 1 に作って Phase 2 で返す形になる）
- init サブコマンドで雛形を出すパターンは `eslint --init` / `tsc --init` など先例が多く、ユーザー体験として違和感がない
- karasu リポでも `adr.config.json` をコミットして「ADR 運用ルールの可視化」が進む副次効果がある

**Issue #1077 の AT 改訂**: 「Removing `adr.config.json` and re-running falls back to defaults」を「Removing `adr.config.json` and re-running exits with a clear error pointing to `adr:init`」に差し替える（実装 PR で Issue 本文を更新）。

### 論点 4: ローダ API の形

`DEFAULT_CONFIG` は廃し、`loadConfig` は config 不在時 / 必須欠損時に専用の例外を投げる。CLI 側で catch して人間向けエラーに変換する。

```typescript
// scripts/adr/config.ts
export class AdrConfigMissingError extends Error {} // file not found
export class AdrConfigInvalidError extends Error {} // JSON parse / shape error

export interface AdrConfig {
  topics: readonly string[];
  concerns: readonly string[];
  paths: {
    adrDir: string;
    outputs: {
      effective: string;       // "effective.md" — adrDir からの相対
      graph: string;           // "graph.md"
      graphByTopic: string;    // "graph/" — ディレクトリ
    };
  };
}

export function loadConfig(cwd?: string): AdrConfig;
```

- 関数は同期（既存コードがすべて同期 I/O）
- ファイル不在 → `AdrConfigMissingError`（CLI 側で `adr:init` を案内）
- JSON parse 失敗 / 必須フィールド欠損 / 不正 enum → `AdrConfigInvalidError`
- どちらも CLI で catch して終了コード 1
- 必須フィールド: `topics`, `concerns`, `paths.adrDir`, `paths.outputs.{effective,graph,graphByTopic}` すべて
  - 一部だけ省略は許さない（部分マージは「実質 defaults を持つ」ことになり論点 3 と矛盾する）
  - init で生成する雛形に全フィールドが含まれるので、ユーザーが意図的に削った場合のみ起こる
- ただし配列は **空配列を許容**: `"topics": []` を書けば「topic の controlled vocabulary 検査をスキップ」として動く（フリーテキスト topic を許可したいプロジェクト向け）

### 論点 5: 関数シグネチャの変更

`validateDirectory(dir)` を `validateDirectory(dir, config)` にする（config は必須引数）。

- CLI エントリ（`validate.ts`）が `loadConfig()` を呼んで結果を渡す
- テストは config を明示注入する（fixture 配列リテラルでよい）
- 必須化により「どこかで暗黙に defaults が混ざる」事故を排除

`buildGeneratedFiles(adrs)` も同様に `(adrs, config)` に。

### 論点 6: VALID_TOPICS / VALID_CONCERNS の export 維持

#### 案 6A: 両方 export を残し、defaults として参照

- ➕ 既存 import 箇所（`extract.ts` が `VALID_TOPICS` を CLI 引数バリデーションに使用）を変えなくて良い
- ➖ Phase 2 で消すときに別 PR が必要

#### 案 6B: 削除し、`config.topics` を経由させる

- ➕ Phase 2 で抽出する際の差分が減る
- ➖ Phase 1 のスコープが膨らむ

**現時点の方針: 6A**。Phase 1 は最小差分で「config 導入 + 既存挙動維持」を達成する。export を消すのは Phase 2 直前にまとめて行う。

### 論点 7: JSON Schema の運用

- 配置: `scripts/adr/config.schema.json`
- 参照: `adr.config.json` の `"$schema": "./scripts/adr/config.schema.json"` で editor が自動検証
- 検証: ローダ自身は JSON Schema バリデータを通さない（依存追加を避ける）。型チェック・enum 検査は手書きで行う
  - Phase 2 で必要なら `ajv` 導入を検討
- スキーマファイルもテスト対象（`additionalProperties: false` にして fixture を通す）

### 論点 8: テスト戦略

新規 `scripts/adr/config.test.ts` で以下をカバー:

1. `loadConfig(cwd)` が `adr.config.json` を読んで返す
2. `adr.config.json` 不在時は `AdrConfigMissingError` を投げる
3. 不正 JSON は `AdrConfigInvalidError`
4. 必須フィールド欠損時も `AdrConfigInvalidError`
5. 余剰フィールドは無視（forward-compat、Phase 2 でバージョンフィールドを導入予定）
6. `topics: []` / `concerns: []` は許容（vocabulary 検査スキップ動作）

新規 `scripts/adr/init.test.ts`:

1. `runInit(cwd)` が `adr.config.json` を生成し、内容が組み込みテンプレートと一致する
2. 既存ファイルがある場合はエラー（上書き防止）
3. 生成された JSON は `loadConfig` で読み込めて検証を通る（roundtrip）

既存テスト（`validator.test.ts`, `regenerator.test.ts`）は config を明示注入する形にすべて修正する。defaults に依存している test は karasu の `adr.config.json` 相当の fixture を読ませる。

### 論点 9: init サブコマンド

設定ファイル必須化（論点 3A）に伴い、雛形を生成するサブコマンドを Phase 1 で導入する。

**配置**: `scripts/adr/init.ts`（既存エントリ群と同パターン）+ `scripts/adr/init.template.json`（雛形本体）

**呼び出し**: `pnpm adr:init`（`package.json` に追加）

**動作**:
1. CWD に `adr.config.json` が既にあれば即エラー終了（exit 1）— 上書き防止
2. なければ `init.template.json` をそのまま `adr.config.json` として書き出す
3. 標準出力に「Generated `adr.config.json`. Edit `topics` and `concerns` for your project.」を表示

**雛形の内容（karasu 採用ではなく、汎用的な最小例）**:

```json
{
  "$schema": "./scripts/adr/config.schema.json",
  "topics": ["architecture", "infrastructure", "process"],
  "concerns": ["security", "performance", "ci"],
  "paths": {
    "adrDir": "docs/adr",
    "outputs": {
      "effective": "effective.md",
      "graph": "graph.md",
      "graphByTopic": "graph/"
    }
  }
}
```

**karasu 自身の `adr.config.json`**: 雛形ではなく、現 `VALID_TOPICS` / `VALID_CONCERNS` を反映した内容を手書きで Phase 1 PR に含める。`init` で生成するわけではない（karasu は既存値を引き継ぐ必要があるため）。

**Phase 2 への引き継ぎ**: テンプレートは抽出後の package 内に bundle するだけ。`adr-tools init` という形で外部ユーザーに公開される。

## 比較サマリ

| 論点 | 採用案 | 理由 |
|---|---|---|
| 形式 | JSON (`adr.config.json`) | editor 体験 + 依存ゼロ + 信頼境界明確 |
| 探索 | CWD 直下 + 引数で明示可 | YAGNI、必要なら後で追加 |
| フォールバック | **厳格モード + init サブコマンド** | 抽出後の library 体験を優先、karasu 固有値を defaults に焼かない |
| ローダ | 同期、`loadConfig(cwd?)` + 専用例外 2 種 | 不在 / 不正を区別して CLI で人間向けエラーに変換 |
| シグネチャ | `(dir, config)` を必須引数に拡張 | config が必ず存在する前提で型を引き締める |
| 後方互換 | `VALID_TOPICS` 等の export 維持 | Phase 1 差分最小化（Phase 2 で削除） |
| Schema | `additionalProperties: false`、ローダで検証はせず editor のみ | 依存追加を避ける |
| init | `adr:init` で雛形生成、既存ファイルあれば失敗 | `eslint --init` 等の先例に倣う |

## 現時点の方針

上記「採用案」で Phase 1 を実装する。**Issue #1077 本文の AT 改訂が前提**: 「config 不在時は defaults にフォールバック」を「config 不在時は明確なエラーで `adr:init` を案内」に差し替える。

Phase 2 で予定する変更（このドキュメントには含めない、参考として記録のみ）:

- `VALID_TOPICS` / `VALID_CONCERNS` の export 削除
- cosmiconfig 風の上位探索を必要に応じて追加
- ajv による厳格バリデーション
- config schema にバージョンフィールド追加 + 後方互換ポリシー

## 未解決の問い

なし（論点 1〜9 を本ドキュメント内で確定済み）。
