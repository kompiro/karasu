---
id: ADR-20260415-01
title: 親サービスのアノテーションを子ノードに継承する
status: accepted
date: 2026-04-15
topic: styling
depends_on:
  - ADR-20260411-02
scope:
  packages:
    - core
---

# ADR-20260415-01: 親サービスのアノテーションを子ノードに継承する

- **日付**: 2026-04-15
- **ステータス**: 決定済み
- **関連**:
  - Issue #517, PR #609 (Design Doc), PR #629 (実装)
  - ADR-20260411-02 (`20260411-02-deprecated-domain-migration-coexistence.md`) — `@deprecated` / `@migration_target` による重複ドメイン ID 共存
  - Design Doc: `docs/design/inherit-service-annotations.md`
  - `packages/core/src/resolver/inherited-annotations.ts`
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/renderer/layout.ts`
  - `packages/core/src/parser/parser.ts`
  - `examples/migration/system.krs`

## 背景

サービスが `@deprecated` / `@migration_target` / `@experimental` などのライフサイクル系アノテーションを持つとき、そのサービス自身はビルトインスタイル（opacity 0.6、⚠バッジ 等）で正しく描画される。しかし、そのサービスをドリルダウンして内部を表示すると、子ドメインには何の視覚的マーキングも付かず、親レイヤーと子レイヤーで視覚的整合性が崩れていた。

また、ADR-20260411-02 は同一システム内の重複ドメイン ID を、少なくとも一方に `@deprecated` または `@migration_target` が付いていれば許容する、と定めている。しかしこのルールは **子ドメインが自前で annotation を持つ場合しか** カバーしておらず、`service Legacy @deprecated { domain Order {} }` と `service NewSvc @migration_target { domain Order {} }` のような「親サービスで方向を示す」自然な書き方は parser エラーになっていた。

## 決定

**継承ルール**: ノード `N` の effective annotations は次で定義する。

```
effective(N) =
  N.annotations が非空 なら N.annotations
  さもなくば effective(parent(N))（親が無ければ []）
```

- 明示的なアノテーションがあればそれを最優先、かつ **マージせず置換** する。
- 親が注釈を持たない場合は祖先を遡り、最初に見つかった非空の annotations を採用する（多段継承）。これにより `service @deprecated { domain { usecase } }` の usecase も `@deprecated` を継承する。
- 子が自分で annotations を持っている場合はそこで継承チェーンが切れ、その子の子孫は（子が持っていない annotation を）親からは貰えない。
- **継承起点は `service`**。`system` レベルのアノテーションは service に伝播させない（現状そのようなユースケースは存在せず、YAGNI として実装しない）。
- **継承対象は一律**。`@deprecated` / `@migration_target` / `@experimental` いずれも同じルールで継承する。例外を設けない。

**適用範囲**: 描画（`style-resolver` / `layout` / `renderer`）と、parser の重複ドメイン ID 許容判定 (ADR-20260411-02) の両方に同じ継承ルールを適用する。描画だけ継承して parser 判定は継承しないと、ユーザーから見て一貫性のない振る舞い（「見た目は deprecated っぽいのに重複エラーが出る」）になる。

**実装**: 共有ヘルパー `buildInheritedAnnotations(roots: KrsNode[]): Map<string, string[]>` を `packages/core/src/resolver/inherited-annotations.ts` に純関数として配置する。

- `style-resolver.ts::processNodes` は `parentAnnotations` を引数に取り、再帰的に効果的アノテーションで rule match と `nodeStyleKey` 保存を行う（id 衝突を避けるため precomputed map ではなくインラインの parent-pass を使う）。
- `layout.ts::layout()` は `viewSlice.containerNode` 配下（またはルートビューでは `viewSlice.systems`）で `buildInheritedAnnotations` を呼び、`layoutNode.annotations` を effective 値で設定する。単一のドリルダウンビュー内ではノード ID が一意なので、id-keyed なマップで安全に disambiguate できる。
- `parser.ts::buildNodePathIndex` は walk に `parentServiceAnnotations` を渡し、domain ノードの priority 計算で自身の annotations が空なら親サービスのアノテーションを使う。

## 理由

- **親レイヤーと子レイヤーの視覚的整合性**: サービスが `@deprecated` なのに中身の domain が通常表示だと、移行中アーキテクチャを読むユーザーにとって「これは旧側か新側か」が瞬時に読み取れなくなる。
- **構文の簡潔さ**: `service Legacy @deprecated { domain Order {} }` と書けば Order も自動的に deprecated 扱いになるのは直感的で、ユーザーに余計な annotation 記述を強いない。
- **描画と parser 判定の一貫性**: どちらか片方だけ継承すると「見た目と構文チェックが食い違う」状況が生まれ、原因が分かりにくいバグ報告につながる。両方に同じルールを適用することでユーザーメンタルモデルを一本化する。
- **明示は継承を上書き**: 子が annotation を持てば継承は発生しない（置換）。`service @migration_target { domain @deprecated {} }` のように「親は移行先だけど特定の子は廃止予定」といった個別上書きは自然に表現できる。
- **継承対象を区別しない**: `@experimental` だけ例外扱いする案もあったが、例外は仕様を膨らませ、また「親が experimental なのに子は通常表示」のほうがユーザー直感に反する。一律ルールで一貫性を優先する。

## 却下した案

### 案 A: AST を事前変換して子ノードの `annotations` を書き換える

継承ロジックを 1 箇所に集約できるが、AST の純粋性（`.krs` ソースそのままの構造）が失われる。formatter / linter / LSP など AST を触る全コードで「描画用」と「ソース由来」の区別が必要になり、影響範囲が大きい。

### 案 B: resolver と layout にそれぞれ継承ロジックを書く（個別実装）

変更範囲は resolver / layout に閉じるが、同じルールを 2 箇所で書くことになり、片方だけ更新し忘れるとスタイルキーが食い違ってスタイルが外れる。DRY 違反。

### 案 C: 描画だけ継承し、parser の重複判定には継承を適用しない（Design Doc 初期案）

Design Doc では当初この方針を採用していた（「parser の構文チェックはソース記述そのものを見る」）。しかし実装後にユーザーが実例を試したところ、「見た目は正しく継承されているが parser エラーが出る」という一貫性のない振る舞いが強い違和感を生むことが判明した。継承は描画と構文チェックの両方に適用する方針に変更。

### 案 D: system レベルのアノテーションから service に継承する

現状 system にアノテーションが付くユースケースは存在しない。YAGNI として実装しない。必要になった時点で再検討する。

## 実装への影響

1. **新規**: `packages/core/src/resolver/inherited-annotations.ts` — 純関数ヘルパー。
2. **更新**: `packages/core/src/resolver/style-resolver.ts` — `processNodes` を parent-pass 再帰化。
3. **更新**: `packages/core/src/renderer/layout.ts` — `layout()` 内部で局所マップを構築、`layoutNode.annotations` に effective 値を設定。
4. **更新**: `packages/core/src/parser/parser.ts` — `buildNodePathIndex` の walk で parent service annotations を継承し、domain の priority 計算に使う。
5. **テスト**: `inherited-annotations.test.ts` (8 cases), `style-resolver.test.ts` (+3 cases), `parser.test.ts` (+3 cases)。
6. **AT**: `docs/acceptance/0056-inherit-service-annotations.md` — `examples/migration/system.krs` を使った手動検証手順。
