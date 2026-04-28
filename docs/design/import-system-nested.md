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

## 現時点の方針（暫定）

**案 D を採り、二段階で進める**。両 Phase は「path をどこで解決するか」の違いとして整理できる:

| Phase | 別名 | 何をするか |
|---|---|---|
| Phase 1 | **暗黙的な path import** | bare id (`import { Order }`) を resolver が **descendant を辿って自動的に path を解決**する |
| Phase 2 | **明示的な path import** | ユーザが書き手側で `import { A.B.C }` のように **path を明示**する |

両者は競合せず補完関係にある:

- 普段は **暗黙** (Phase 1) が摩擦ゼロで動く
- 同名衝突など、自動解決が決められないケースだけ **明示** (Phase 2) で曖昧性を解く

理由:

- Phase 1 で大半のユースケース（`realizes`/`handles` のクロスファイル参照）を解消できる
- 曖昧性の出る頻度を観測してから Phase 2 (明示構文) を入れる判断ができる
- どちらの Phase も独立した小さな変更で `/start-dev` フローに乗せやすい

### Phase 1: 暗黙的な path import — 実装スケッチ

`mergeNamedImport` の named-import 解決ループを、現在の「直接子のみ」から「descendants 全体」に拡張する:

```ts
// before (要約)
for (const system of importedFile.systems) {
  const matchingChildren = system.children.filter((c) => c.id === id);
  if (matchingChildren.length > 0) { /* merge */ }
  if (system.id === id) { /* import whole system */ }
}

// after (要約)
const matches = collectMatchingDescendants(importedFile, id);
// matches は { system: SystemNode | null; node: KrsNode }[] 等
if (matches.length === 0) {
  // 既存の import-id-not-found
} else if (matches.length === 1) {
  // 1 件 → 既存の merge ロジックに渡す（system を辿りながら祖先を維持）
} else {
  // 新診断 import-id-ambiguous を発行
}
```

`collectMatchingDescendants` は system の children を DFS して、`service`/`domain` 等の論理ノードを集める。

### Phase 1 で開放する範囲

- `system → service` (現状でも OK、変更なし)
- `system → service → domain` (新規対応)
- `system → service → domain → usecase` (将来 `realizes`/`handles` が usecase を扱うようになったら自動で機能)
- `system` 全体取り込み (現状通り)

### 新規診断: `import-id-ambiguous`

params: `{ id: string; path: string; matches: string[] }` （`matches` は jq-path 形式の文字列、例: `"ECPlatform.ECommerce.Order"`）。
ユーザに「このどれかを path syntax で指定してください」と Phase 2 への誘導も可能。

### Phase 2: 明示的な path import — 将来 / Issue 別出し

`Identifier (Dot Identifier)*` を import block の id list で受理し、AST の `ImportDeclaration.ids` を `string[][]`（各 path のセグメント配列）に拡張する。
Phase 1 で導入した `import-id-ambiguous` 診断の **解消手段** として位置づけ、ユーザが「どの path から取るか」を明示できるようにする。

```krs
// Phase 1 では曖昧で import-id-ambiguous が出る
import { Order } from "./services.krs"

// Phase 2 では path を明示して曖昧性を解く
import { ECPlatform.ECommerce.Order } from "./services.krs"
```

## エッジケースとテスト方針

| ケース | 期待 |
|---|---|
| direct child of system (`system.children[]`) | 解決（Phase 1 でも Phase 2 でも） |
| grandchild (system → service → domain) | Phase 1 で新たに解決される |
| 複数 system に同名 id | Phase 1 で `import-id-ambiguous` 診断 |
| 同一 system 内の同名 (現実的には domain-dispersal で別途 warning が出る状況) | `import-id-ambiguous` |
| 存在しない id | 既存通り `import-id-not-found` |
| system 自身を指す `import { ECPlatform }` | 現状維持（system に直接 hit したらそちら優先） |
| top-level service / deploy 内ノード | 現状維持 |

## 既存仕様との関係

- `docs/spec/syntax.md` の import セクション: Phase 1 で「named import は descendants まで再帰的に解決する」「曖昧時は `import-id-ambiguous` 診断」と追記する
- AT-0068 (PR #913 で追加) の「import 越しの参照は警告しない」前提: Phase 1 後はネストされたターゲットでも実際に成り立つようになる。AT-0068 を更新して "deeply nested" の例を追加する想定

## 未解決の問い

1. **Phase 2（明示的な path import）を最初から入れるか、別 Issue に分けるか** — 暫定では分割。ただ Phase 1 (暗黙) で ambiguity が出やすそうな examples が確認できれば、まとめて入れる選択肢もある。
2. **`import-id-ambiguous` のメッセージ形式** — match した path のリストをどう提示するか。Phase 2 の明示構文を前提にした書式 (`A.B.C`) で書いておけば、Phase 2 着手時にメッセージ更新が要らない。
3. **wildcard import (`import "./file.krs"`) との関係** — wildcard は今もファイル全体を取り込むので、再帰拡張の影響を受けない。確認のみ。
4. **検索順序の安定性** — 複数 system を持つファイルで、検索順がファイル定義順依存になることをテストで明示するかどうか。
