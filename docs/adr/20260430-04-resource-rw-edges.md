---
id: ADR-20260430-04
title: usecase→resource edge を read/write で視覚的に区別する
status: accepted
date: 2026-04-30
topic: renderer
scope:
  packages:
    - core
related_to:
  - ADR-20260430-03
depends_on:
  - ADR-20260430-03
---

# ADR-20260430-04: usecase→resource edge を read/write で視覚的に区別する

- **日付**: 2026-04-30
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1061](https://github.com/kompiro/karasu/issues/1061)
  - 設計 PR: [#1063](https://github.com/kompiro/karasu/pull/1063)
  - 実装 PR: [#1067](https://github.com/kompiro/karasu/pull/1067)
  - ADR-20260430-03（`operations` プロパティ — 本 ADR の依存元）
  - 関連 Issue: [#1062](https://github.com/kompiro/karasu/issues/1062)（CRUD マトリクスビュー — 補完的・別レーン）
  - 関連 Issue: [#1064](https://github.com/kompiro/karasu/issues/1064)（`border-style: dotted` を edge でサポート — 派生）
  - 仕様: `docs/spec/tags-annotations.md` §Automatic tags on edges
  - 受け入れテスト: `docs/acceptance/1061-resource-rw-edges.md`

## 背景

ADR-20260430-03 で `usecase` 内の `resource` に `operations`（CRUD verbs）を持たせられるようになったが、その情報は AST にあるだけで描画には反映されていなかった。usecase view では `view-extract.ts` の `deriveUsecaseResourceNodes` が **synthetic な `usecase -> resource` edge** を `kind: "sync"` で生成しており、視覚化の余地はそこに乗る。

主な動機は**システム移行の影響分析**で、「DB X を別サービスに切り出すと、どの usecase が壊れるか／読むだけで済むか」を usecase view から一目で判断できるようにする。

既存の edge 視覚軸:

1. `kind: sync / async` → `stroke-style: solid / dashed`
2. `[cyclic]` → 赤色 + `stroke-width: 2.5`

write/read 用に第 3 の軸が必要だが、`stroke-style` は sync/async に取られているので `dashed` を流用すると衝突する。

## 決定

**stroke-width + label の冗長エンコーディング** を採用する。

| edge | stroke-style | stroke-width | label |
|------|--------------|--------------|-------|
| sync + read | solid | 1.5 | `R` |
| sync + write | solid | 2.0 | `W` |
| async + read | dashed | 1.5 | `R` |
| async + write | dashed | 2.0 | `W` |

### 仕様の要点

- **判定ロジック**: write-dominates ルール。`create` / `update` / `delete` のいずれかが含まれていれば write。それ以外（`read` のみ・`operations` 未指定・unknown verb のみ）は read。`packages/core/src/spec/operations.ts` の `isWriteOperation` 純関数で集約。
- **edge への注入**: `view-extract.ts` の `deriveUsecaseResourceNodes` が synthetic edge の `tags` に `"write"` または `"read"` を、`label` に `"W"` または `"R"` を必ず設定する。
- **Style cascade**: `default-style.ts` に `edge[write] { stroke-width: 2; }` の 1 ルールを追加。read は既存 default の 1.5 のまま。`style-resolver.ts` は無変更（既存の pseudo-tag 注入機構 `[async]` / `[sync]` / `[cyclic]` と同じ階層で `[write]` / `[read]` も自動でセレクタにマッチする）。
- **重複 edge は last-wins**: 同じ `(usecase, resource)` ペアが usecase 内で 2 回宣言された場合は、**後の宣言の `operations` で上書き**する（CSS カスケードと整合）。`view-extract.ts` の edge 蓄積は `Map<string, KrsEdge>` で実装。
- **i18n**: ラベル `R` / `W` は read/write が日本語環境でも通じる慣用語彙のため固定。カスタマイズは将来 issue。
- **ユーザー上書き**: `.krs.style` で `edge[write] { stroke-width: 4; color: #f87171; }` のように太さ・色を上書き可能。pseudo-tag を流通させているため特別な仕組みは不要。

### 視覚階層

`read (1.5) < write (2) < cyclic (2.5)` の順序を意図的に設計する。cyclic は「直すべき問題」を表す警告シグナルで、write は「通常の操作」の意味付け。write を cyclic より太くすると階層が逆転するため、label `W` で明示性を担い width 差は控えめにする。`write + cyclic` の同時発生は cascade のソース順により cyclic スタイル（2.5 + 赤）が後勝ちで上書きされる。

## 理由

- **冗長エンコーディング**で a11y / 可読性が高い。stroke-width で「ぱっと見の強弱」、label で「`R` / `W` の確証」を独立に提供する。色覚多様性・縮小表示にも頑健。
- **全 edge にラベルを付与**することでフォーマットが一貫し、「ラベル無し = 何の情報か（read / 未判定 / バグ）」という曖昧性が消える。
- 「移行で危険な側（write）を強調する」意味付けが Issue #1061 の主目的（移行影響の可視化）と直結する。
- **既存の pseudo-tag 仕組みの自然な拡張**で、`[async]` / `[sync]` / `[cyclic]` と同じ語彙ルールを採る。新しい設計概念を導入せず、追加コードもほぼゼロ（edge 生成側 1 ヶ所 + style 1 ルール + label 1 行）。
- write-dominates 判定を **`view-extract.ts` で edge 生成時に集約**することで、renderer や resolver は「edge.tags / edge.label を見るだけ」の純粋な責務分離を維持する。
- **last-wins** は CSS カスケードと整合し、authors が後の宣言で前の classification を上書きできる（一貫性のある編集体験）。
- v2 で `[create]` / `[update]` / `[delete]` の生 verb を表示したくなった時も、label 文字列を `"CR"` / `"RUD"` のように差し替えれば対応できる（拡張パスが開いている）。

## 却下した案

### Option A 単独（width のみ、label なし）

太さの差だけだと「他の太い edge（cyclic は 2.5、user 上書きで太くなっている edge も別途あり得る）」と混同するリスクがあり、移行分析で確証が必要なシーンで弱い。`W` ラベルが乗ることで「太い理由は write だ」と一意に決まる。冗長エンコーディングのコストは低いので片方だけにする理由が薄い。

### Option D 単独（label のみ、width 一定）

ラベルだけでは小さい縮小表示で見落とすリスクがある。**遠目から書き込み多発箇所を探す**動線では、太さで先に絞り込んで label で確証する 2 段階が効く。

### Option B — AST に専用フィールドを追加

`KrsEdge` の AST 変更は影響範囲が大きく、得られるのは型安全性のみ。pseudo-tag 注入は AST 変更ゼロで同じ機能を提供でき、`.krs.style` カスケードとの統合も自然。型安全性が必要になったら別途リファクタで導入できる。

### Option C — Renderer 側でハードコード上書き

ユーザーが `.krs.style` で write 軸を再定義できなくなり、karasu のスタイル設計（カスケード優先）と矛盾する。`cyclic` ですら CSS class 経由で上書き可能にしている前例があるため不採用。

### `stroke-style: dotted` を read/write に充てる

現状 `[async]` が dashed を使っており、dotted (`2 2`) を 3 値目として使うと縮小時に区別が難しい。stroke-style 軸は sync/async 用に固定し、write/read は別軸（width + label）で表現する。

### 関係の強度に抽象化（sync = 強、async = 弱、write = 強、read = 弱）

「強度」という単一軸で 2 種類の独立した情報を表すと、`sync + read` と `async + write` がどちらも「片強・片弱」で同じ見た目に潰れる。情報損失が出るため不採用。ユーザーが強度ビューを望む場合は `.krs.style` で `edge[sync], edge[write] { stroke-width: 3 }` 等を書けば user-side で実現できる。

### `[external]` を CRUD 表現に再利用する

`[external]` は所在を表す resource 側のタグで、edge の軸ではない。混ぜると意味の階層が壊れる。

### Width 比 `read=1.5 / write=3`（初期案）

cyclic = 2.5 を超えてしまい、「通常書き込みが循環依存より深刻に見える」という階層逆転が起きる。cyclic は警告シグナル、write は意味付けであり、cyclic を最も注意喚起する側に保つべき。`write=2.0` に修正。

## 確認事項（follow-up 候補）

- ラベル `W` / `R` の i18n / カスタマイズ要件が出てきた場合は別 Issue で扱う。
- 認識セット（`create` / `read` / `update` / `delete`）外の verb（`list` / `search` / `execute`）を usecase view でどう表示するかは別 Issue（v2）。現状は read 扱い。
- CRUD マトリクスビュー（Issue #1062）は本 ADR と独立した別ビューで、補完的に存在する。
- `border-style: dotted` の edge サポート（Issue #1064）は本 ADR から派生したが独立した課題。
