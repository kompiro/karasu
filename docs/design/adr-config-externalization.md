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

#### 案 3A: 厳格モード — 設定ファイル必須、無ければエラー

- ➕ 動作が予測可能
- ➖ karasu の現状 `docs/adr/` を別マシンで初めて clone した時に hint が必要

#### 案 3B: 寛容モード — 設定ファイル無しは built-in defaults を使う

- ➕ Issue #1077 のアクセプタンス基準そのもの（"Removing `adr.config.json` and re-running falls back to current built-in defaults"）
- ➕ 抽出後、他プロジェクトが「とりあえず試す」ハードルが下がる
- ➖ defaults が karasu 固有（topics に `parser`, `vscode` 等）なのは奇妙
  - → 解消案: defaults は **空配列** にする（フォールバック時は「topic / concerns の controlled vocabulary 検査をスキップ」）か、**現 karasu 値** を defaults とする

#### 案 3B-1: defaults = 現 karasu の値

- karasu リポ内では config 不在でも今と同じ挙動
- 抽出後に新規プロジェクトが採用すると karasu の topic 名が見えるが、自分の `adr.config.json` を作るので実害はない

#### 案 3B-2: defaults = 空（vocabulary なし = 任意の文字列を許容）

- 抽出後、他プロジェクトに優しい
- karasu リポでは config を必ず置く運用となる（Issue 本文の AT を満たさない）

**現時点の方針: 3B-1**。Issue 本文の「Removing `adr.config.json` and re-running falls back to current built-in defaults」の文言とも整合する。Phase 2 で抽出する際に「組み込み defaults を空配列化し、karasu の defaults は karasu の `adr.config.json` で表現する」へ移行する（この移行はそのときに 1 PR で完結する）。

### 論点 4: ローダ API の形

```typescript
// scripts/adr/config.ts
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

export const DEFAULT_CONFIG: AdrConfig;
export function loadConfig(cwd?: string): AdrConfig;
```

- 関数は同期（既存コードがすべて同期 I/O）
- 不正な JSON は `Error` を throw（CLI が catch して終了コード 1）
- 部分定義は `DEFAULT_CONFIG` とマージ（`topics` を省くと defaults を使う）

**論点 4-x: マージ戦略**
- `topics`, `concerns`, `paths.outputs.*` のいずれも、ユーザー指定があれば **置換**（concat ではない）
- 理由: vocabulary の管理権はユーザーに完全に渡す。defaults はあくまで「設定無しでも動く」ための下駄

### 論点 5: 関数シグネチャの変更

`validateDirectory(dir)` を `validateDirectory(dir, config?)` にする。

- 既存呼び出し（テスト含む）は引数追加で済むため後方互換
- `config` 省略時は内部で `loadConfig()` を呼ぶ
- テストは config を明示注入できる（fixture 不要）

`buildGeneratedFiles(adrs)` も同様に `(adrs, config?)` に。

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
2. `adr.config.json` 不在時は `DEFAULT_CONFIG` を返す
3. 不正 JSON は throw
4. 必須フィールド欠損時は `DEFAULT_CONFIG` の値で補完される
5. 既知の余剰フィールドは無視（forward-compat）か警告（strictness の方針確認）
   - **方針: 無視**（Phase 1 は寛容に、抽出後にバージョン管理を入れる）

既存テスト（`validator.test.ts`, `regenerator.test.ts`）は config を明示注入する形に追記する箇所がある。多くはそのまま通る想定。

## 比較サマリ

| 論点 | 採用案 | 理由 |
|---|---|---|
| 形式 | JSON (`adr.config.json`) | editor 体験 + 依存ゼロ + 信頼境界明確 |
| 探索 | CWD 直下 + 引数で明示可 | YAGNI、必要なら後で追加 |
| フォールバック | 現 karasu 値を defaults | Issue AT 準拠、移行コスト最小 |
| ローダ | 同期、`loadConfig(cwd?)` + `DEFAULT_CONFIG` | 既存 I/O パターン踏襲 |
| シグネチャ | `(dir, config?)` 形式に拡張 | 後方互換 + テスト注入容易 |
| 後方互換 | `VALID_TOPICS` 等の export 維持 | Phase 1 差分最小化 |
| Schema | `additionalProperties: false`、ローダで検証はせず editor のみ | 依存追加を避ける |

## 現時点の方針

上記「採用案」で Phase 1 を実装する。Phase 2 で予定する変更（このドキュメントには含めない、参考として記録のみ）:

- 組み込み defaults を空配列化 / undefined 化し、設定不在の挙動をライブラリらしく整える
- `VALID_TOPICS` / `VALID_CONCERNS` の export 削除
- cosmiconfig 風の上位探索を必要に応じて追加
- ajv による厳格バリデーション

## 未解決の問い

なし（論点 1〜8 を本ドキュメント内で確定済み）。
