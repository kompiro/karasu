# Import semantics の再設計 — whole-file import / system 再オープン / DAG 経由再到達

- **日付**: 2026-05-14
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1381](https://github.com/kompiro/karasu/issues/1381) — Multi-file split of a single `system` block does not merge cleanly via `import "file.krs"`
  - 既存 ADR:
    - [ADR-20260405-03](../adr/20260405-03-wildcard-import-two-pass-resolution.md) — wildcard import / 2 パス解決
    - [ADR-20260409-05](../adr/20260409-05-directory-import.md) — directory import
    - [ADR-20260409-06](../adr/20260409-06-named-import-toplevel-service.md) — top-level service named import
    - [ADR-20260513-03](../adr/20260513-03-import-system-nested.md) — system-nested named import path syntax
  - 既存 spec: `docs/spec/syntax.md` §「Drill-down and external file references」
  - 既存実装: `packages/core/src/fs/import-resolver.ts`

## 背景・課題

Issue #1381 で報告された bug は表面的にはマージ実装の不具合だが、根本原因は import の **意味モデル（semantics）** が spec に明文化されていないことにある。具体的に明文化されていない領域:

1. **whole-file import `import "p.krs"` の正確な意味**
   ADR-20260405-03 が「ワイルドカード」と呼んでいるが、spec syntax.md には named import の例しか無く、whole-file 形式が何をどう merge するのか書かれていない。

2. **`system <Id> { ... }` の再オープン（複数ファイルでの同名宣言）が許されるか**
   実装の `mergeWildcardResolved` / `mergeSystemIntoExisting` は明らかに「同名 system は merge」する意図で書かれているが、spec はこの動作を保証していない。Issue #1381 のユーザーが期待した「`system Auth` を 3 ファイルに分割して `index.krs` で `import` で束ねる」というユースケースが想定内なのか想定外なのか、誰も判断できない。

3. **同じファイルに 2 経路で到達したときの扱い（DAG 経由再到達）**
   `index.krs` が `admin.krs` と `auth.krs` を import し、`admin.krs` も `auth.krs` を named import するケースは循環ではない（DAG）。spec はこの状況をどう扱うべきか定義していない。実装は誤って `circular-import` 警告を出し、かつ 2 度目の到達時に空 KrsFile を返すため `auth.krs` の中身が消失する。

4. **whole-file import が `deploy` / `organization` ブロックも巻き取るか**
   `mergeWildcardResolved` のコードは `deploys` / `organizations` も merge する設計だが、spec には書かれていない。

5. **edge endpoint が未解決のとき、source/target ノード自体は残るのか**
   Issue #1381 の (3) で `LicenseApply --> LicenseManagement` の `LicenseManagement` が消えた結果、`LicenseApply` まで巻き添えで消えた。「dangling edge → 警告 + node 保持」なのか「dangling edge → node ごと drop」なのかが未定義。

このまま実装だけを直すと、また同じ知識ギャップで似た bug を踏む。**仕様を明文化してから実装を直す**べき。

## 関連する concepts / ADR の整理

### `docs/concepts.ja.md` の含意

- karasu は「論理構造（system 単位）」と「物理構造（deploy）」「組織構造（organization）」を **同一プロジェクト内で 3 つの並行ビュー**として描く。
- プロジェクトは複数ファイルに分割でき、`import` でつなぐ。
- system は **モデルの単位**であって「ファイルの単位」ではない — 1 つの `system` を複数ファイルに分けて書いてよいというのが自然な含意。

### 既存 ADR が決めていること

| ADR | 決めていること |
|---|---|
| ADR-20260405-03 | `import "p.krs"` 構文を採用、2 パス解決を採用 |
| ADR-20260409-05 | `import "dir/"` でディレクトリ配下を flat 展開 |
| ADR-20260409-06 | top-level `service` を named import できる |
| ADR-20260513-03 | system 配下の service / domain を path 構文で named import できる |

**埋まっていない穴**: whole-file import の merge 規則、system 再オープン、DAG 経由再到達、deploy / org の merge、dangling edge の扱い。本 design doc はこれを埋める。

## 提案する semantics（明文化案）

以下を `docs/spec/syntax.md` §「Multi-file import semantics」として追加する想定。

### S1. 3 つの import 形式

```krs
@import "theme.krs.style"             // (a) style import — 既存 §「@import scope」で定義済み
import { Foo, Bar.Baz } from "p.krs"  // (b) named import — 既存（ADR-20260409-06 / ADR-20260513-03）
import "p.krs"                        // (c) whole-file import — 本 design doc で明文化
import "dir/"                         // (d) directory import — 既存（ADR-20260409-05）
```

(c) と (d) は同等の merge 規則を持ち、(d) は配下の `.krs` を alphabetical 順で 1 ファイルずつ (c) として処理した結果に等しい、と定義する。

### S2. whole-file import の merge 規則

`import "p.krs"` は **p.krs を完全再帰展開した KrsFile** の以下を importer に取り込む:

- 全 top-level ノード（`system` / `service` / `client` / `database` / `queue` / `storage` / `legend` / `deploy` / `organization`）
- 各 `system` 配下の全 children（`user` / `client` / `service` / `domain` / `usecase` / `resource` / edge / infra）
- `@import` で参照されたスタイルシート（cascade に追加）

「完全再帰展開された」とは、p.krs 自身の import を解決した後の最終形を指す。これは importer ごとに改めて計算する必要はなく、ファイル単位でメモ化できる（後述 S5）。

### S3. 同名 system の merge 規則（再オープン）

同じ id の `system` が複数ファイルに現れた場合:

- **system 本体のプロパティ**（`label` / `description` / タグ）: **import graph の root（= `ImportResolver.resolve()` に渡された entry file = App / CLI で現在開いているファイル）に近い側が優先**。bottom-up に merge し、root 側に既に値がある場合のみそれを採用、無ければ importee の値を採用。
  - 異なる値が衝突した場合は警告 `system-property-conflict`（仮称）を発行する。警告には採用された値・無視された値・両者の location を含める。
- **children**: id ごとに find-or-create で union（重複 id は警告 `duplicate-node-in-system`、既存実装と整合）。
- **edges**: そのまま union（同一 source/target/label の完全重複のみ dedup）。

これにより `system Auth` を 3 ファイルに分けて書く Issue #1381 のユースケースが仕様上サポートされる。

**「root 優先」の含意**: App プレビューや CLI で `auth.krs` を直接開いたとき、その `auth.krs` 自身が entry になるため、`auth.krs` の `label` がそのまま描画される。`index.krs` を開けば `index.krs` の `label` が描画される。「今開いているファイルの宣言がそのまま見える」という WYSIWYG 的な mental model に一致する。AST ビルダーに「現在開いているファイル」を別パラメータで渡す必要はなく、既存の `entryPath` 引数がそのまま優先順位の最上位として機能する。

### S4. deploy / organization の merge 規則

同名の `deploy` / `organization` も system と同様に union merge する。`realizes` / `owns` の relation も union。

### S5. DAG 経由再到達と真の循環

- import グラフは **DAG**（循環なしの有向グラフ）を許す。同じファイルに複数経路で到達するのは正常。
- **真の循環**（A → B → A）のみ `circular-import` 警告を出し、2 度目の同ファイル展開を抑止する。
- 実装上は「現在ロード中スタック (loading)」と「ロード/解決済みメモ (resolved)」を分け、loading に既に居る場合のみ循環と判定する。

### S6. dangling edge の扱い

`A -> B` の片方の endpoint が解決できないとき:

- **edge** は drop し、`unresolved-edge-endpoint`（仮称、既存の `unresolved-realizes` 系と整合する命名）warning を発行する。
- **解決できた側のノード自体は drop しない**。

これは「edge は付随情報、node はモデルの本体」という原則に沿う。Issue #1381 (3) の `LicenseApply` 消失バグはこの原則を実装が破ったケース。

### S7. 確定的順序

merge 順は import 宣言の出現順、ディレクトリ展開はファイル名 alphabetical 順（既存）。同じ入力からは同じ出力。

## 受け入れ条件

1. spec `docs/spec/syntax.md` に §「Multi-file import semantics」を追加し、S1〜S7 を worked example 付きで記述する（既存の §「Drill-down and external file references」と §「@import scope」の間に配置）。
2. `examples/multi-file-system/`（仮称）を新設し、`index.krs` から 3 ファイルに分割した `system <Id>` + `deploy` + `organization` を import する最小例を置く。
3. Issue #1381 を「仕様化 PR」と「実装 PR」の 2 段で閉じる前提で、本 design doc を PR としてマージ → 仕様修正 PR → 実装修正 PR → ADR 昇格 PR の順で進める。

## 検討した代替案

### A. system 再オープンを禁止する

「同名 system の宣言は重複エラー」と定義する案。

- メリット: merge 規則が単純になる。同名衝突の検出が早期化する。
- デメリット: 大規模モデルを複数ファイルに分割する自然な書き方を封じる。`examples/ec-platform/05-multifile/` の延長線上に「system も分割したい」というニーズは必ず出る。
- **却下**。Issue #1381 のユーザー期待は妥当で、サポートするほうが karasu のモデリング原則に合う。

### B. whole-file import を直接サポートせず、`import { * } from "p.krs"` 構文を新設する

ADR-20260405-03 で却下済み（冗長でメリットなし）。本案でも採用しない。

### C. dangling edge で node も drop する（現状実装）

- メリット: 「孤立した legalo を消す」ガベージコレクションが効く。
- デメリット: 連鎖的に node が消えると、ユーザーは何が起きたか追えない。Issue #1381 (3) のように、別ファイルの import 漏れで本来あるはずの node が静かに消えるのは debug 不能。
- **却下**。node は宣言された場所に存在するという原則を守る。

## 再発防止 — TPL と spec の双方向トレーサビリティ

Issue #1381 のような bug は「import の意味モデルが spec に明文化されていない」ことが構造的原因。spec gap が proactive TPL 不在を生み、それが retrospective TPL を量産する。これを反転させて **「spec が書かれた時点で proactive TPL が起こされている」状態を制度化** する。

### F1. TPL ↔ spec の双方向リンクを必須化

- **TPL 側**: フロントマターに `spec_section` フィールド（`docs/spec/syntax.md#multi-file-import-semantics` のような anchor）または `derived_from_adr` を必須追加。retrospective TPL で対応する spec が無い場合は `spec_section: TODO`（gap を明示的に可視化）。
- **Spec / ADR 側**: 各セクション末尾に `> Related TPLs: [TPL-...]` を追加。ADR フロントマターには `related_tpls: [TPL-...]` を追加。spec 章を編集する人が必ず TPL を意識する導線になる。

### F2. spec 章の新設 / 改訂 = proactive TPL 同梱を必須化

`docs/process.md` のドキュメント PR チェックリストに 1 行追加:

> `docs/spec/` または `docs/concepts*.md` に新規セクションを追加した PR は、そのセクションの規定が破られた時に検出する **proactive TPL を最低 1 件、同 PR で起こすか既存 TPL を当該 spec へ back-ref で紐付ける**。

### F3. DesignDoc / ADR 提出時の proactive TPL ルール明示

既存 `CLAUDE.md`「TPL のライフサイクル」節に `→ DesignDoc / ADR を書くときは spec が含意するテスト観点を proactive TPL として同 PR で起こす（spec から派生した TPL は必ず spec_section を明示）` を追記。

### F4. 効果測定

`docs/test-perspectives/` の各 TPL を起源で集計可能にする（`spec_section` / `derived_from_adr` / `from_bug_issue` のいずれを持つかで分類）。**proactive 比率が retrospective 比率を上回ること** を健全性の指標として `docs/test-perspectives/README.md` に明記。

## 本 PR 系列で起こす TPL

Q2 の合意により、Issue #1381 由来の観点も **全部 proactive TPL** として起こす（spec PR で先に定義してから実装 PR を出すため）。retrospective は 0 件で済む。

| TPL（仮 ID） | 派生元 spec | 観点 |
|---|---|---|
| import-dag-not-cycle | S5 | DAG 経由の同一ファイル到達は `circular-import` を出さない / 真の循環のみ警告 |
| whole-file-import-completeness | S2 | whole-file import で imported ファイルの全 top-level ノードと全 children が merged に現れる |
| system-reopen-merge | S3 | 同名 system は children を id ごとに union、property は root entry 優先 + warning |
| deploy-org-wildcard-propagation | S4 | whole-file import で `deploy` / `organization` が伝搬する |
| dangling-edge-node-preservation | S6 | endpoint 未解決時、edge は drop / warning、node は保持 |

各 TPL は `spec_section: docs/spec/syntax.md#multi-file-import-semantics` を持ち、spec 側からも `> Related TPLs:` で逆引きできる状態にする。

## 進め方

4 段の PR で進める:

1. **本 Design Doc PR**（docs only） — semantics 案 (S1〜S7) と再発防止フレームワーク (F1〜F4) のレビュー & 合意取得
2. **仕様化 PR** — `docs/spec/syntax.md` §「Multi-file import semantics」追加 + `examples/multi-file-system/` 新設 + proactive TPL 5 件 + `docs/process.md` の F1〜F4 反映
3. **実装修正 PR** — `packages/core/src/fs/import-resolver.ts` を spec / TPL に合わせて修正 + Vitest / AT
4. **ADR 昇格 PR** — 本 Design Doc を ADR に集約して削除（既存 import 系 ADR と相互リンク）

## 参考

- 既存 ADR-20260513-03 が grandchild named import を片付け、本 design doc が whole-file / 再オープン / merge 規則を片付けることで、import 関連の semantics が一通り明文化される見込み。
- `docs/test-perspectives/README.md`「TPL のライフサイクル」で示されている proactive → retrospective の流れに沿っている。本 design doc の再発防止フレームワーク (F1〜F4) はこの流れをドキュメント整備で構造化したもの。
