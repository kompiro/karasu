# Importing system-nested service / domain

- **日付**: 2026-04-28
- **ステータス**: 検討中
- **関連**: Issue #927, PR #913 (#907 — `unresolved-realizes`), PR #880 (#854 — `unresolved-handles`), `packages/core/src/fs/import-resolver.ts`, `docs/spec/syntax.md`

## 背景・課題

クロスファイルの参照 (`realizes` / `handles`) を書くには、別ファイルの `system` 配下にネストされた `service` / `domain` を `import` で取り込む必要がある。
ところが現状の named import (`import { X } from "./other.krs"`) は **直接子のみ** 走査する設計で、深いネストや path 修飾には対応していない。
PR #913 で `unresolved-realizes` を導入したことで、この validation gap が顕在化した。

### 現状の挙動（確認済み）

`packages/core/src/fs/import-resolver.ts` の `mergeNamedImport`:

| 検索対象 | 挙動 | 例 |
|---|---|---|
| `importedFile.systems[].id` | 一致すればその system 全体を取り込む | `import { ECPlatform }` |
| `importedFile.systems[].children` の **直接子** | 一致すればその子だけ取り出して merged systems に再アタッチ | `import { ECommerce }` (system 直下の service) |
| `importedFile.services` (top-level) | 既存の stub/edge ロジックで取り込む | `import { Standalone }` |
| `importedFile.deploys[].nodes` | 一致するノードだけ deploy block に複製 | `import { ecommerceApp }` |

**取り込めない代表例**:

```krs
// services.krs
system ECPlatform {
  service ECommerce {
    domain Order {}        // ← grandchild、現状の named import では届かない
  }
}
```

```krs
// main.krs
import { Order } from "./services.krs"   // → import-id-not-found エラー
```

### parser の現状

`parseNodeImport` は `Identifier` 1 トークンずつしか受理しない。`A.B.C` のような path syntax は token 列としては書けても parse error になる（`Dot` を期待しないため）。

## 制約・前提

- 既存の `import { ECPlatform }` (system 全体) と `import { ECommerce }` (system 直下) を**壊さない**こと
- `import-id-not-found` 診断の挙動は保つこと（見つからないときに silent fail しない）
- 多くのクロスファイル参照が「`realizes Order` の Order を import で持ってきたい」という形なので、**学習コストが低い書き方** を優先する
- karasu は同名 id を許容する文脈がある（同一 system 内の domain 重複、ネストした service の中の usecase など）。ambiguity 検出の枠組みを最初から組み込むこと

## 検討した選択肢

### 案 A: path syntax を追加 — `import { A.B.C } from "..."`

```krs
import { ECPlatform.ECommerce.Order } from "./services.krs"
```

**Pro**:
- 最も明示的。誰がどこから何を取り出すか一目で分かる
- 同一ファイル内に複数同名 id があっても確実に指せる

**Con**:
- 構文追加（parser 拡張、token シーケンス `Identifier (Dot Identifier)*`、AST に path を保持する struct）
- 学習コスト（ユーザが path を書けるようになる必要がある）
- spec / examples / LSP completion 等の波及

### 案 B: ドキュメント主導 — 「system 丸ごと import」を canonical な書き方とする

実装を変えず、`import { ECPlatform }` で system 全体を取り込めば子孫もすべて参照可能と spec で明示する。

```krs
import { ECPlatform } from "./services.krs"
deploy Production {
  oci app { realizes Order }    // ECPlatform の中の Order が validIds に入るので解決
}
```

**Pro**:
- 実装ゼロ。今すぐ採れる
- 「単一の正しい書き方」を提示する明快さ

**Con**:
- 「Order だけ欲しい」のに ECPlatform 全部を取り込む不経済
- 複数 system が同名 id を持つときの曖昧性は解決しない
- 大きな system を import すると意図しないノードが merged に流れ込む副作用

### 案 C: bare id の **再帰検索** — `import { Order }` が任意の深さの descendant を見つける

既存の構文を保ったまま、`mergeNamedImport` の検索対象を `system.children` → `descendant 全部` に拡張。
複数マッチ時は新しい ambiguity 診断 (`import-id-ambiguous`) を出して、何を import するかは決定しない（エラー扱い）。

**Pro**:
- 構文変更ゼロ
- ユーザの直感「名前で指す」と一致
- `import { ECPlatform }` の挙動は変わらない（system に直接 hit すれば優先）

**Con**:
- 同名 id があるときに ambiguous エラーが必要
- 曖昧解消の手段がないので、**最後に Option A をいつか追加することになる**
- 「黙って広く検索する」挙動はコードベースが大きくなったとき意外な振る舞いを生む可能性

### 案 D: ハイブリッド — bare id は再帰、ambiguity を path syntax で解消

1. `import { X }`: descendants を再帰的に検索。1 件 → 取り込む。0 件 → `import-id-not-found`。2+ 件 → `import-id-ambiguous`（解消方法を示す）
2. `import { A.B.C }`: path で 1 つに絞り込む。各セグメントで子を探す。深さ任意

**Pro**:
- 普通の使い方は摩擦ゼロ（案 C のメリット）
- 曖昧性が出たときだけ path で書ける（案 A の表現力をフォールバックとして温存）
- 実装は段階的に分けられる: Phase 1 で再帰 + ambiguity diagnostic、Phase 2 で path syntax

**Con**:
- 案 C と案 A の合計コスト（最終的に）
- 段階リリースの場合、Phase 1 と Phase 2 の間に「曖昧性を解消する手段が無い」期間ができる

## 比較

| 観点 | 案 A (path のみ) | 案 B (docs のみ) | 案 C (再帰 only) | 案 D (再帰 + path) |
|---|---|---|---|---|
| 実装コスト | 中（parser + resolver） | ゼロ | 小（resolver のみ） | 中（resolver + parser を段階的に） |
| 学習コスト | 中 | 小（書き方が固定） | 小 | 小（普段は再帰、必要時だけ path） |
| 同名 id 曖昧性解消 | 可能 | 解決しない | 不能 (エラーのみ) | 可能 |
| 「Order だけ欲しい」が書けるか | 書ける | 書けない（system 全部） | 書ける | 書ける |
| ユーザに `import-id-ambiguous` が出る頻度 | なし | なし | 中（同名衝突時） | 中 → 解消手段あり |
| 段階リリース可能性 | 単発 | 単発（ドキュメント PR） | 単発 | Phase 1 / Phase 2 で分割可能 |

## 現時点の方針

**案 A を直接採る — 明示的な path import を最初から実装する**。

```krs
import { ECPlatform.ECommerce.Order } from "./services.krs"
```

### なぜ暗黙解決（案 C / 案 D の Phase 1）を採らないか

**同名 id がたびたび意図的に共存する**。これがあるため、暗黙的な再帰解決は「正しく書いているのに ambiguous 診断が出る」状態を量産しがち。

代表的なシナリオ:

1. **システム移行**: 旧システムと新システムが意図的に同じ service id を使う

   ```krs
   // services-legacy.krs
   system OrderSystemV1 {
     service OrderService { ... }
   }
   // services-new.krs
   system OrderSystemV2 {
     service OrderService { ... }   // 意図的に同名
   }
   ```

   どちらか一方を `import { OrderService }` で取りたいとき、暗黙解決では即 ambiguous エラー。明示 path なら `import { OrderSystemV1.OrderService }` / `import { OrderSystemV2.OrderService }` で意図がそのまま書ける。

2. **マルチテナント / 環境別構成**: tenant ごとに同じ shape の system を持つ場合（`TenantA.Billing` / `TenantB.Billing`）。

3. **ドメイン名の自然な再利用**: `Catalog`, `Order`, `Member` のように一般的すぎるドメイン名は複数 system にまたがって登場することが珍しくない（既存の `domain-dispersal` 警告がこの状況を前提にしている）。

これらは「将来の特殊事例」ではなく **karasu のモデリングが許容している通常の使い方**。暗黙解決を最初に出してから「ambiguity が頻出しました → 明示 syntax を追加します」と進めると、ユーザは中途半端な期間中に `import-id-ambiguous` でブロックされる。最初から明示の道を整備する方が体験が良い。

### 実装スケッチ

#### Parser

`Identifier (Dot Identifier)*` を import block の id list で受理する。

```krs
import { ECPlatform.ECommerce.Order } from "./services.krs"
import { Foo, Bar.Baz } from "./other.krs"   // 単一 id と path を混在可
```

AST 変更:

```ts
// before
export interface ImportDeclaration {
  ids: string[];
  path: string;
  loc: SourceRange;
}

// after
export interface ImportDeclaration {
  ids: ImportIdPath[];   // 各 entry が path セグメントのリスト
  path: string;
  loc: SourceRange;
}

/** `Foo` は `["Foo"]`、`A.B.C` は `["A", "B", "C"]`。 */
export type ImportIdPath = string[];
```

bare id `Foo` は `["Foo"]` として保持し、resolver 側で「長さ 1」を直接子のみ照合と見なす。長さ 2 以上は path 解決。

#### Resolver

`mergeNamedImport` を path 走査に拡張:

```ts
// 各 ImportIdPath について
for (const path of nodeImport.ids) {
  if (path.length === 1) {
    // 既存の挙動: top-level / direct child / system / deploy.nodes をそのまま検索
    resolveBareId(importedFile, path[0]);
  } else {
    // path[0] が system id にマッチ → そこから path[1..] で children を辿る
    // 全セグメントが解決すれば merge、途中で外れたら import-path-not-found 診断
    resolvePath(importedFile, path);
  }
}
```

#### 診断

- `import-id-not-found`: 既存。bare id (`["Foo"]`) で見つからないとき。
- `import-path-not-found`: 新規。path (`["A", "B", "C"]`) のいずれかのセグメントが解決できないとき。params は `{ path: string[]; failedAt: number; importPath: string }`（どのセグメントで外れたか分かるように）。

bare id で複数 hit する状況は、**現状の named import (直接子のみ走査) では発生しないので新規診断は不要**。明示 path に来たユーザが `A.B.C` で 1 件絞り込めばいい。同じ system 内で同名 id が衝突する状況は、別の `domain-dispersal` などで既に検知されている。

### 開放する範囲

- `import { ECPlatform }` — system 全体（現状維持）
- `import { ECPlatform.ECommerce }` — system 直下の service（現状の bare id と同じものに別の書き方が増える）
- `import { ECPlatform.ECommerce.Order }` — service 内の domain（**新規対応**）
- `import { ECPlatform.ECommerce.Order.PlaceOrder }` — domain 内の usecase（将来 `realizes`/`handles` が usecase を扱うようになれば即解放）

### 後方互換性

bare id 形式 (`import { ECommerce }`) は引き続き受理する。AST 上は `["ECommerce"]` として表現されるだけで、resolver の挙動は変わらない。既存の `.krs` を一切書き換える必要がない。

## エッジケースとテスト方針

| ケース | 書き方 | 期待 |
|---|---|---|
| 既存の bare id (system 直接子 service) | `import { ECommerce }` | 現状通り解決（後方互換） |
| system 自身 | `import { ECPlatform }` | 現状通り system 全体取り込み |
| top-level service / deploy 内ノード | `import { Standalone }` | 現状通り |
| **明示 path で grandchild** | `import { ECPlatform.ECommerce.Order }` | **新規対応** |
| **明示 path で system 直下** | `import { ECPlatform.ECommerce }` | bare id と同等の結果（書き方の選択肢が増える） |
| **同名 id を path で曖昧性回避** | `import { OrderSystemV1.OrderService }` | 意図した片方だけ取り込む |
| 存在しない bare id | `import { Nothing }` | 既存の `import-id-not-found` |
| 途中で外れる path | `import { ECPlatform.NotThere.Order }` | 新規 `import-path-not-found`（`failedAt: 1` を返す） |
| 同名衝突したまま bare id を書いてしまう | `import { OrderService }`（複数 system に存在） | **暗黙解決を導入していないので、現状の挙動（最初に hit した system からの取り込み）を踏襲。明示 path への置き換えを spec で推奨** |

## 既存仕様との関係

- `docs/spec/syntax.md` の import セクション: 「named import の id は単純な識別子か `A.B.C` 形式の path を許容する」「path の各セグメントは system / service / domain / usecase のいずれかの id を順に辿る」と明記する。同名 id 共存時の例（システム移行）も併記。
- AT-0068 (PR #913 で追加) の「import 越しの参照は警告しない」前提: 本 Issue 着手後は明示 path で深いネストにも成立する。AT-0068 を更新して `import { Sys.Svc.Domain }` の例を追加する想定。

## 未解決の問い

1. **`import-path-not-found` 診断のメッセージ書式** — どのセグメントで外れたかを示す UX を決める。`failedAt` をどう文章化するか（例: `import path "A.B.C" failed at segment 2 ("B"): no service / domain with that id under "A"`）。
2. **wildcard import (`import "./file.krs"`) との関係** — wildcard はファイル全体を取り込むので、本変更の影響を受けない。確認のみ。
3. **path セグメント間の許容ノード種別** — 各セグメントで system → service → domain → usecase の階層に厳密に従うか、もしくは「id が一致すれば kind を問わず辿る」か。前者の方が typo が早く検出できるが、karasu の AST が将来追加する子ノード種別との互換性で迷う余地がある。
4. **path に対する LSP 補完** — 別 Issue 化候補。本実装の後に path 補完を追加すると writer 体験が一気に上がる。
