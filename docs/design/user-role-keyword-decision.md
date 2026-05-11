# `user.role` キーワードの存続判断（B-soft / B-strict）

- **日付**: 2026-05-11
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1281](https://github.com/kompiro/karasu/issues/1281) — Re-examine the `user.role` keyword
  - 前提 ADR: [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) — 実行時認可は karasu の語彙に取り込まない（本 Design Doc はその ADR が明示的に「別 Issue で扱う」と切り出した残課題を閉じる）
  - 関連 ADR: [ADR-20260428-06](../adr/20260428-06-client-mcp-modeling.md) — `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を予約語として認識した ADR
  - 関連 ADR: [ADR-20260312-03](../adr/20260312-03-three-axis-structure.md) — 論理／物理／組織の三面構造
  - spec: `docs/spec/syntax.md` 行 141 / 156 / 162（`role` プロパティの定義）、`docs/spec/tags-annotations.md` 行 111
  - パーサ: `packages/core/src/parser/parser.test.ts` 行 468 / 485 / 505、`packages/core/src/lexer/lexer.ts` 行 30、`packages/core/src/types/ast.ts` 行 425 / 428
  - レンダラ: `packages/core/src/renderer/svg-renderer.ts` 行 504 / 555 / 570 / 836、`packages/core/src/renderer/layout.ts` 行 1500 / 1525

## 背景・課題

`user` ノードの `role` プロパティは古くから存在するが、`role` という語自体が二義的で、文脈次第で異なる解釈に滑り落ちる。

- **actor archetype ラベル** — 「この system には customer / admin / support という種別のユーザーがいる」という構造的なラベル。`[human]` / `[ai]` タグの細分化に近い。
- **RBAC の permission bundle** — 「admin role には refund permission が紐づく」という実装側の概念。これを語彙に持ち込むと `requires role = "admin"` のような述語式言語への滑り台になる。

ADR-20260511-02 は usecase レベルの authz（`requires` 述語・`policy` ブロック・`user_attributes`）を karasu に取り込まないと決めたが、既存の `user.role` の扱い（actor archetype として残す B-soft か、deprecate する B-strict か）は別 Issue として切り出していた。本 Design Doc はその切り出された残課題を扱う。

### 現在の `user.role` の実態

リポジトリ全体の `role "..."` の使用例を読むと、現状の `role` は次のように使われている（抜粋）:

| 例                                                     | テキスト内容                                      |
| ------------------------------------------------------ | ------------------------------------------------- |
| `examples/hr-tool/system.krs:10`                       | `"勤怠の申請・照会を行う一般社員"`                 |
| `examples/hr-tool/system.krs:20`                       | `"打刻漏れを検知し従業員に通知するAIエージェント"` |
| `examples/client-mcp/index.krs:19`                     | `"End user placing and tracking orders"`           |
| `examples/payment-platform/system.krs:17`              | `"加盟店管理・決済モニタリングを担当する運用者"`   |
| `examples/ec-platform/02-users.krs:15`                 | `"在庫・注文・通知の管理を行う担当者"`             |
| `examples/feature-samples/users.krs:9`                 | `"Places orders and tracks shipments"`             |

観察:

- いずれも `admin` / `customer` のような短い archetype label ではなく、**「この user が何をする人か」を 1 行で説明する文字列**。
- 実質的には短い `description` として機能している。レンダラも `description` とは別行・別スタイルで描画している（`packages/core/src/renderer/svg-renderer.ts:555-570`）。
- RBAC 的な使われ方（権限の束として束ねる）の痕跡は examples / parser tests には無い。

つまり、現状の `role` は当初の意図（actor archetype）でも RBAC でもなく、**「短い役割記述」フィールド**として運用されている。

### `role` を持ち続けることのリスク（再評価）

ADR-20260511-02 がすでに「authz を語彙に取り込まない」という external fence を確立した今、`role` がもたらすリスクは以下に圧縮される。

1. **語の引力（vocabulary drift）** — 「role」という語自体が新規利用者を RBAC 的な解釈に誘導する。
2. **`requires role = ...` への滑り台** — ADR-20260511-02 で構文導入は否定されたが、ユーザーが `description "requires admin role"` のような擬似述語を書く動機は残る。
3. **意味の三重露光** — 「actor archetype」「RBAC role」「短い説明」の 3 つが同じキーワードに重なっており、spec で縛らない限り解釈が利用者に依存する。

逆に、 `role` を残すことで得られる便益:

- 既存 examples / 利用者の図が壊れない（後方互換が最大）
- レンダラのカード上で「ユーザーが何をする人か」専用の表示行が確保され、視認性が良い
- `description` フィールドの長文化を抑える効果（短い役割記述は `role` に、詳細は `description` に、と書き分けられる）

## 検討した案

### B-soft — `user.role` を残し、spec で意味を縛る

- `user.role` プロパティを維持する。
- `docs/spec/syntax.md` の `role` 記述を改訂し、**「actor archetype あるいは『この user が何をする人か』を 1 行で表す短い説明」** と明示する。
- 「権限の束 / RBAC role / authz primitive ではない」「`requires role = "..."` のような述語構文は導入しない（ADR-20260511-02）」を spec / `docs/concepts.md` に明記する。
- examples・parser・レンダラ・LSP に変更は入れない。
- 後方互換: 完全。

### B-strict — `user.role` を deprecate する

- `user.role` を deprecate（パーサは一定期間警告つきで受理、その後削除）。
- 移行先:
  - **短い役割記述としての利用** → `description` に集約。
  - **actor archetype が本当に必要なケース** → タグ風の archetype 機構を別途検討（本 Design Doc の範囲外、必要なら別 Issue / Design Doc）。
- 影響範囲:
  - `docs/spec/syntax.md` の `role` 行（141 / 156 / 162）削除 + deprecation note 追加。
  - `examples/` 配下の 14 ファイル前後で `role "..."` を `description "..."` にマイグレーション（既存 `description` がある場合はマージ）。
  - `packages/core/src/lexer/lexer.ts:30` の `role` トークン、`packages/core/src/types/ast.ts:425/428` の `"role"` リテラル、`packages/core/src/parser/parser.test.ts` の関連テスト、`packages/core/src/renderer/svg-renderer.ts` / `layout.ts` の `role` 描画行を段階的に削除。
  - LSP / VS Code 拡張 / `karasu translate` などの周辺。
- 後方互換: 数バージョン分の deprecation warning 期間を挟む必要がある。

### B-medium（参考） — `role` を残しつつ短描述専用の意味に正式化

実態（短い役割記述）を spec 上の意味として正式採用する案。B-soft の派生で、「actor archetype だった」という当初設計を弱め、現状の使われ方を spec で追認する。B-soft とほぼ同じ変更コストで、二義性は B-soft より小さくなる。

## 推奨

**B-soft（実質的には B-medium 寄り）を採用する** ことを推奨する。

理由:

- **`role` の重力源（authz への滑り台）は ADR-20260511-02 が外部から塞いだ** — 述語構文・`policy` ブロック・属性宣言が今後入らないことが ADR レベルで確定しているため、`role` キーワード単独が RBAC 化のゲートウェイになる可能性は構造的に低い。残るのは「語の引力」だけで、これは spec の縛りで対処できる範囲。
- **examples の実態が「短い役割記述」に収束している** — 当初想定された actor archetype よりも、実質的には説明補助としての使われ方が主流。B-strict で `description` に統合する選択肢もあるが、レンダラ上で別行として表示できる便益は失う。
- **B-strict の変更範囲が大きい** — spec / examples（14 ファイル） / lexer / parser / AST / renderer / LSP / VS Code 拡張に波及する。それに見合うだけの「`role` を残すことの実害」が現時点では観測されていない（authz への滑り台懸念は ADR-20260511-02 が塞いだ）。
- **将来再検討の余地は残せる** — `role` の RBAC 的誤用が実際に観測されたら、その時点で B-strict 相当の ADR を起こして supersede すればよい。今は最小侵襲で意味を縛る方が ROI が高い。

### B-soft 採用時に行う変更

1. `docs/spec/syntax.md`
   - 行 141 の `Business role` を `Short one-line description of what this user does (actor archetype or role description). Not an authz primitive — see ADR-20260511-02.` に置き換える。
   - 行 162 の `role describes the business role within the system.` を同趣旨に書き換え、「RBAC role / permission bundle ではない」「`requires role = ...` のような述語構文は導入しない（ADR-20260511-02）」を明示する。
2. `docs/spec/tags-annotations.md`
   - 行 111 の「Runtime authorization (role / license / feature flag)」の脚注を ADR-20260511-02 へのリンクに更新する（`#832` のリンクは ADR が継承）。
3. `docs/adr/`
   - 本 Design Doc を ADR-20260511-04（同日内連番）として昇格させる。`topic: core-concepts`、`related_to: [ADR-20260511-02, ADR-20260428-06]`。
4. `examples/` / `packages/` 配下の実装は変更不要。

## 却下した案

- **B-strict（`user.role` を deprecate）** — 上記の通り、ADR-20260511-02 が authz の語彙導入を塞いだことで `role` 単独の構造的リスクは大幅に低減した。変更範囲（spec / 14 examples / lexer / parser / AST / renderer / LSP / VS Code）に見合うだけの実害が現時点では観測されていない。将来 RBAC 的誤用が実際に増えたら supersede で再検討する。
- **何もしない（spec を縛らない）** — Issue #1281 の問題提起そのものを放置することになる。`role` の二義性は spec で 1 文で縛れば対処できるので、それすらしないのは選択肢にならない。

## アクセプタンステスト（人間確認が必要なもののみ）

- `docs/spec/syntax.md` の `role` 行が「RBAC ではない / authz primitive ではない」を読み手に伝えられているか、第三者視点で読んで判断する。
- ADR 昇格後、`docs/adr/effective.md` と `docs/adr/graph.md` が ADR-20260511-04 を含む形で再生成されているか確認する（`pnpm adr:regenerate`）。

## 関連 TPL

該当する `topic: core-concepts` の proactive TPL を `docs/test-perspectives/` に scan したところ、本決定に直接対応する観点は未掲載。本決定は「既存キーワードの語彙的曖昧さを spec で塞ぐ」ケースであり、横展開可能な観点（「既存キーワードに二義性があるときは、deprecate より先に外部 fence（別 ADR）で意味を縛れるか検討する」）として retrospective TPL を起こす価値がある。ADR 昇格時に同 PR で TPL も追加する。
