# CLI translate コマンド

- **日付**: 2026-04-09
- **ステータス**: 検討中
- **関連**:
  - [CLI render コマンド](cli-render-command.md)
  - [Issue #355: feat(cli): add `karasu translate` command](https://github.com/kompiro/karasu/issues/355)
  - [Issue #356: extend `karasu translate` to support OpenAPI Spec and DB schema](https://github.com/kompiro/karasu/issues/356)

## `karasu.map.yaml` とは

命名規則ヒューリスティック（kebab-case → PascalCase）では解決できないレガシー名のための明示的マッピングファイル。
入力ファイルと同ディレクトリに置くことで、`karasu translate` が参照する。

```yaml
# karasu.map.yaml
app.jar: ECommerce          # "app" では何のサービスか判断できない
legacy-batch: Settlement    # 命名規則に従っていないレガシー名
```

マッピングが存在すれば heuristic より優先して使用する。ファイルがない場合はスキップする。

---

## 背景・課題

karasu の deploy ダイアグラムは手動で `.krs` ファイルを記述する必要があるが、
チームがすでに docker-compose や k8s マニフェストを持っている場合、
物理構造を二重管理することになってしまう。

`karasu translate` コマンドを追加することで、既存インフラ定義から `deploy.krs` のスキャフォールドを自動生成できるようにする。
これにより：

- 初回の `deploy.krs` 作成コストをゼロに近づける
- CI での `karasu translate | diff` によって物理ダイアグラムと実インフラの乖離を検出できる

## 制約・前提

- `packages/cli` は Node.js 環境で動作する。外部ライブラリを追加できる
- CLI は `packages/core` のパーサー・レンダラーには依存しない。translate は `.krs` テキストを**生成する**コマンドであり、`compileProject` などは不要
- 出力は stdout（Unix パイプライン前提）。`--output` フラグで別ファイル指定も可
- `realizes` が解決できない場合は `// TODO: realizes ?` コメントを残す（エラーにしない — karasu の "warn, don't error" ポリシー）
- Issue #356（OpenAPI Spec / DB schema 対応）はスコープ外

## コマンド仕様

```
karasu translate --from <format> <input>

Arguments:
  input                 Input file to translate

Options:
  --from <format>       Input format: compose | k8s
  -o, --output <path>   Write .krs to file (default: stdout)
  -h, --help            Display help for command

Examples:
  karasu translate --from compose docker-compose.yml > deploy.krs
  karasu translate --from k8s manifests/deployment.yaml > deploy.krs

  # 複数 k8s ファイルを個別に変換してまとめる
  for f in manifests/*.yaml; do karasu translate --from k8s "$f"; done > deploy.krs
```

k8s マニフェストは1ファイル1コマンドで変換する。
ディレクトリ一括処理はサポートせず、シェルのファイルグロブに委ねる。
各ファイルが独立した `deploy` ブロックを出力するため、シェルで連結しやすい。

## 検討した選択肢

### 選択肢 A: YAML パーサーライブラリ

#### 案A1: `js-yaml`

```ts
import yaml from "js-yaml";
const doc = yaml.load(content) as Record<string, unknown>;
```

- **メリット**: 長期的に広く使われている。型定義が安定。シンプルな API
- **デメリット**: アクティブ開発がやや停滞気味（2022年以降リリースなし）

#### 案A2: `yaml`（by Eemeli Aro）

```ts
import { parse } from "yaml";
const doc = parse(content) as Record<string, unknown>;
```

- **メリット**: アクティブにメンテされており YAML 1.2 準拠。エラーメッセージが詳細
- **デメリット**: API が若干複雑（Document モデルがある）

#### 採用: 案A2 `yaml`

`yaml` はアクティブにメンテされており、YAML 1.2 準拠で k8s マニフェストとの互換性が高い。
また将来 #356 でスキーマ付き YAML（OpenAPI）を扱う際に Document モデルが役立つ可能性がある。

---

### 選択肢 B: トランスレーターの設計

`--from compose` / `--from k8s` の処理を共通インターフェース下に置くことで、
将来のフォーマット追加（#356 の OpenAPI など）を容易にする。

#### 案B1: Strategy パターン（インターフェース + 実装クラス）

```ts
// packages/cli/src/translate/translator.ts
interface Translator {
  translate(input: string): Promise<string>;  // krs テキストを返す
}

class ComposeTranslator implements Translator { ... }
class K8sTranslator implements Translator { ... }

function createTranslator(format: "compose" | "k8s"): Translator {
  if (format === "compose") return new ComposeTranslator();
  if (format === "k8s") return new K8sTranslator();
  throw new Error(`Unsupported format: ${format}`);
}
```

- **メリット**: 拡張時に既存コードを変更しない（Open/Closed 原則）
- **デメリット**: 今は2フォーマットしかなく、オーバーエンジニアリングになりうる

#### 案B2: フォーマット別関数

```ts
// packages/cli/src/translate.ts
export async function translateFromCompose(input: string): Promise<string> { ... }
export async function translateFromK8s(inputDir: string): Promise<string> { ... }
```

`translate.ts` の `action` 内で `--from` に応じてスイッチする。

- **メリット**: シンプル。複雑さを先送りしない
- **デメリット**: フォーマットが増えると `translate.ts` が肥大化する

#### 採用: 案B1（ただし軽量化）

#356 が `status: ready` で今後実装予定のため、拡張性を確保しておく。
ただし基底クラスは使わず、インターフェースのみ定義してシンプルに保つ。
ディレクトリ構成は `packages/cli/src/translate/` に切り出す。

---

### 選択肢 C: k8s 対象リソース種別

k8s マニフェストには多くのリソース種別があるが、
`deploy.krs` のデプロイ単位に対応する種別のみを対象とする。

| k8s Kind | krs 種別 | 理由 |
|---|---|---|
| `Deployment` | `oci` | 最も一般的なコンテナデプロイ |
| `StatefulSet` | `oci` | ステートフルなコンテナ（DBなど） |
| `DaemonSet` | `oci` | ノード全体にデプロイするコンテナ |
| `Job` | `job` | 単発バッチ |
| `CronJob` | `job` + `schedule` | 定期バッチ |

以下は対象外（インフラ設定であり、サービスの実体ではない）：
- `Service`（k8s Service）— ネットワーク設定
- `ConfigMap` / `Secret` — 設定値
- `Ingress` — トラフィックルーティング
- `PersistentVolumeClaim` — ストレージ

---

### 選択肢 D: `realizes` 解決戦略

Issue #355 で提案された3段階を採用する。解決順は以下の通り：

1. **k8s アノテーション**（明示的、最高優先度）
   ```yaml
   metadata:
     labels:
       karasu/realizes: "OrderService"
   ```
   docker-compose では `labels` セクションに同じキーを置く：
   ```yaml
   services:
     order-service:
       labels:
         karasu/realizes: "OrderService"
   ```

2. **`karasu.map.yaml`** — 入力ファイルと同ディレクトリに存在する場合に参照
   ```yaml
   order-service: OrderService
   legacy-batch: Settlement
   ```

3. **命名規則ヒューリスティック** — kebab-case → PascalCase
   `order-service` → `OrderService`

4. **未解決** — `// TODO: realizes ? — could not resolve` コメントを出力し、stderr に警告を出す

#### 実装上の注意点

- ヒューリスティックは「最初の `-` 区切りのセグメントを除く接尾辞を削除しない」方針にする
  - `order-service` → `OrderService` ✓（`service` は削除しない）
  - 理由：`service` がサービス名の一部になっているケースも多い（例: `settlement-service`）

---

---

### 選択肢 E: 複数 `realizes` のサポート

現在の krs 構文および AST は `realizes` を単数値（`realizes?: string`）として定義している。
1つのデプロイ単位が複数のサービスを実現するケース（例: モノリシックな `app.jar` が `OrderService` と `InventoryService` を担う）は実際によく存在するため、複数 `realizes` をスコープに含める。

#### AST の変更

```ts
// 変更前
export interface DeployNodeProperties {
  realizes?: string;
  // ...
}

// 変更後
export interface DeployNodeProperties {
  realizes?: string[];  // 複数 service への参照
  // ...
}
```

#### 構文の変更

複数の `realizes` 行を並べることで複数サービスを指定できるようにする：

```krs
oci "app" {
  image "app:1.0.0"
  realizes OrderService
  realizes InventoryService
}
```

パーサーが `realizes` トークンを複数回受け付けて配列に積む形に変更する。

#### 影響範囲

| ファイル | 変更内容 |
|---|---|
| `packages/core/src/types/ast.ts` | `realizes?: string` → `realizes?: string[]` |
| `packages/core/src/parser/parser.ts` | `realizes` を配列として accumulate |
| `packages/core/src/renderer/deploy-renderer.ts` | 配列を反復してエッジを生成 |
| `packages/core/src/renderer/deploy-layout.ts` | unclassified 判定を `realizes.length === 0` に変更 |

既存の `realizes` 単数指定は構文上そのまま動作する（配列の要素1件として扱う）。

---

## 出力フォーマット

```krs
deploy "<env-name>" {
  oci "<container-name>" {
    image "<image>:<tag>"
    realizes OrderService
    realizes InventoryService
  }
  oci "<unknown-service>" {
    image "<image>:<tag>"
    // TODO: realizes ? — could not resolve from naming convention
    // Add karasu/realizes label or karasu.map.yaml entry
  }
}
```

`<env-name>` の決定：
- docker-compose: `--project-name` または入力ファイル名（拡張子なし）
- k8s: `--namespace` フラグ（省略時は `default`）

## 実装構成

```
packages/core/src/
├── types/ast.ts            ← realizes?: string → string[]
├── parser/parser.ts        ← realizes を配列として accumulate
└── renderer/
    ├── deploy-renderer.ts  ← 複数 realizes エッジ生成
    └── deploy-layout.ts    ← unclassified 判定を realizes.length === 0 に変更

packages/cli/src/
├── index.ts                ← translate コマンドを登録
└── translate/
    ├── index.ts            ← translate() エントリポイント、--from ルーティング
    ├── translator.ts       ← Translator インターフェース
    ├── compose.ts          ← ComposeTranslator
    ├── k8s.ts              ← K8sTranslator
    └── realizes.ts         ← realizes 解決ロジック（3段階共通）
```

`packages/cli/package.json` に `yaml` を追加する。

## エラーハンドリング

| 状況 | stderr 出力 | exit code |
|---|---|---|
| ファイル未存在 | `Error: File not found: <path>` | 1 |
| --from 未指定 | commander の自動エラー | 1 |
| YAML パースエラー | `Error: Failed to parse <file>: <reason>` | 1 |
| realizes 未解決（warn） | `Warning: Could not resolve realizes for "<name>"` | 0 |

## 未解決の問い

- `karasu.map.yaml` の探索パスを「入力ファイルと同ディレクトリ」固定でよいか、CLIオプション（`--map`）も提供すべきか

## 決定事項

- docker-compose の `labels` で複数 `realizes` を指定する場合はカンマ区切り文字列を使う
  ```yaml
  labels:
    karasu/realizes: "OrderService,InventoryService"
  ```
  k8s の場合は YAML sequence が使えるため、`karasu/realizes` キーに文字列リストを指定する：
  ```yaml
  labels:
    karasu/realizes: "OrderService,InventoryService"
  ```
  統一性のためどちらもカンマ区切り文字列とする。
