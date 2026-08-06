# AT: facet セレクタ（`.krs.style`）と任意名セレクタの非推奨化

- **日付**: 2026-08-04
- **関連 Issue**: [#2175](https://github.com/kompiro/karasu/issues/2175)（Part B slice 3。親 [#2160](https://github.com/kompiro/karasu/issues/2160)、program [#2065](https://github.com/kompiro/karasu/issues/2065)）。設計の (B8) を解消する
- **関連 ADR**: [ADR-2065](../adr/2065-tags-and-facets.md)（プログラム決定。本スライスが解消する (B8) を含む。[#2177](https://github.com/kompiro/karasu/issues/2177) で昇格）
- **関連 spec**: [`docs/spec/style.md`](../spec/style.md) §Facet selectors（+ja）/ [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)（+ja）/ [`docs/spec/diagnostics.md`](../spec/diagnostics.md)（+ja）
- **関連 TPL**: **新規** [TPL-2175](../test-perspectives/TPL-2175-deprecation-announced-only-with-a-migration-target.md)（非推奨は移行先と同じ release で告知する）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)、[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)
- **対象ファイル**:
  - `packages/core/src/types/style.ts` / `parser/style-parser.ts` / `style/serialize.ts`
  - `packages/core/src/resolver/style-resolver.ts` / `resolver/warnings.ts` / `types/warnings.ts`
  - `packages/core/src/builtins/reference-data.ts`（specificity 表）
  - `packages/i18n/src/{types,en,ja}.ts` / `render-warning.ts`

> スコープはセレクタと非推奨告知のみ。overlay は slice 2（#2174、マージ済み）、
> 概観パネル / feature-sample / ADR 昇格は slice 4（#2177）。**v2.0 での任意名
> セレクタ無効化は本 PR の対象外** — ここで出すのは告知だけで、ルールは動き続ける。

## 受け入れ条件

- [x] AT-A: `[facets=pii]` が `facets pii` を書いた要素に一致し、書いていない要素には一致しない

  > ✅ Automated — `packages/core/src/resolver/facet-style-selector.test.ts` › `[facets=<id>] selector — matching` › `styles the members of a facet and leaves non-members alone`

- [x] AT-B: 種別との複合（`database[facets=pii]`）で、種別の側も効いている（facet に所属していても種別が違えば一致しない）

  > ✅ Automated — 同 describe › `compounds with a kind`

- [x] AT-C: 繰り返し（`[facets=pii][facets=gdpr]`）が AND になる

  > ✅ Automated — 同 describe › `ANDs repeated predicates, like tags`

- [x] AT-D: `edge[facets=…]` が**全エッジに一致しない**（v1 では facets はノードのプロパティ。述語を無視する実装だと黙って全エッジに一致してしまう）

  > ✅ Automated — 同 describe › `does not widen to every edge when written on an edge selector`

- [x] AT-E: `[facets=pii]` の specificity が `[pii]` と**同じ 10**、`kind[facets=pii]` が 11

  > ✅ Automated — 同ファイル › `[facets=<id>] selector — cascade` › `scores 10, the same as the tag selector it replaces` / `scores 11 with a kind, matching kind[tag]`。**移行の可否がこれに掛かっている**（同点でないと、書き換えの途中でカスケードの勝敗が変わり、1 コミットでの一括移行を強制することになる）

- [x] AT-F: id セレクタに負け、bare な種別セレクタに勝つ

  > ✅ Automated — 同 describe › `loses to an id selector and beats a bare kind selector`

- [x] AT-G: タグセレクタと同点なので宣言順で決まる（両向き）

  > ✅ Automated — 同 describe › `ties with the tag selector, so declaration order decides`

- [x] AT-H: `database[facets=pii][facets=gdpr]@deprecated` が `formatSelector` で round-trip する（TPL-1101）

  > ✅ Automated — 同ファイル › `[facets=<id>] selector — serialization` › `round-trips through formatSelector`

- [x] AT-I: `[facets=pii]` と `[pii]` が別のシリアライズ結果になる（同点だが別物。同じ文字列に潰れると style-conflict の集計で融合する）

  > ✅ Automated — 同 describe › `keeps [facets=x] and [x] distinct`

- [x] AT-J: 任意名のタグセレクタ（`[pci] { … }`）に `style-tag-selector-not-builtin` が出る

  > ✅ Automated — 同ファイル › `arbitrary-name selector deprecation (#2175)` › `warns on a tag selector whose name is outside the tool vocabulary`

- [x] AT-K: 任意名のアノテーションセレクタ（`service@canary`）に `style-annotation-selector-not-builtin` が出る

  > ✅ Automated — 同 describe › `warns on an annotation selector whose name is outside the builtin set`

- [x] AT-L: builtin タグ / system-assigned タグ / 推論 shape タグ / builtin アノテーションでは**発火しない**

  > ✅ Automated — 同 describe › `stays silent for builtin, system-assigned and inferred-shape tag names`

- [x] AT-M: facet セレクタ自身では発火しない（移行先を非推奨と言ってしまう自己矛盾の検出）

  > ✅ Automated — 同 describe › `stays silent for the facet selector — that is the migration target`

- [x] AT-N: builtin テーマ / 注入 system sheet では発火しない（ユーザーが直せないものを警告しない）

  > ✅ Automated — 同 describe › `does not warn about system sheets the author cannot edit`

- [x] AT-O: 1 つの名前について **model 側と style 側の両方**が警告される（直す場所が 2 つあるので警告も 2 つ。TPL-2175）

  > ✅ Automated — 同 describe › `warns on the model side AND the style side for one name`

- [x] AT-P2: シートが 1 枚も無いとき（LSP の単一ドキュメント文脈）に style 側の 2 診断が発火しない。model 側の `tag-not-builtin` は従来どおり出る

  > ✅ Automated — 同 describe › `emits nothing when there are no sheets — the LSP's single-document case`。TPL-1522 は style 結合の新診断に「どちら側に倒すか」を決めて記録することを求めており、`packages/lsp/src/diagnostics.ts` の `analyze()` 呼び出し地点にも同じ判断をコメントで残した。ここでの「出ない」は不足ではなく正しい — 2 診断はシートの中身について述べるもので、編集中のドキュメントは `.krs` だから言うことが無い

- [x] AT-P: 非推奨セレクタが **v1.x では引き続き適用される**（告知しただけで挙動を変えていない）

  > ✅ Automated — 同 describe › `still applies the deprecated rule — v1.x behaviour is unchanged`。ADR-1314 の freeze がここに掛かる

- [x] AT-Q: `compile()` の通常経路（`styleSource`）で facet セレクタが SVG に届く

  > ✅ Automated — 同ファイル › `[facets=<id>] reaches the compiled SVG`

- [x] AT-R: 警告メッセージが en / ja 双方で描画され、識別子（セレクタ文字列・名前）が本文に現れる

  > ✅ Automated — `packages/i18n/src/render-warning.test.ts` の `SAMPLES` / `IDENTIFIERS` 網羅マップ（`Record<WarningKind, …>` なので、kind を足してエントリを忘れるとコンパイルエラー）

- [ ] AT-S: 🧑 Manual — <https://karasu.kompiro.dev/> で `facet` を宣言したモデルと `[facets=<id>]` を書いた `.krs.style` を開き、**overlay を選ばない状態で**セレクタのスタイルが効いていること。overlay（読み手の一時選択）とセレクタ（作者が書いた見た目）が別物として同時に成立しているかを目で確認する

- [ ] AT-T: 🧑 Manual — 任意名タグセレクタを書いたシートを開き、警告パネルに**移行手順（declare → `facets` 付与 → セレクタ書き換え）が読める形で**出ること。「非推奨です」だけで終わっていたら、読んだ人が次に何をするか決められない

- [ ] AT-U: 🧑 Manual — `docs/spec/style.md` の before/after を実際に写して動かし、書き換え前後で**見た目が変わらない**こと（specificity 同点の主張の実地確認）

## 補足 — 自動化しなかったもの

**移行手順の読みやすさ**（AT-T）は自動化していない。テストが言えるのは「details に
文字列がある」までで、それを読んだ人が実際に移行できるかは人にしか判定できない。
TPL-2175 のチェックリストが求めるのはここで、`experimental` の間の実測フィードバックで
文言を調整する前提。

**v2.0 での無効化はここでは検証しない。** 本スライスの主張は「告知した / まだ動く」の
2 つで、無効化は #2065 Part A step 4 の作業。AT-P がその「まだ動く」側を固定しているので、
将来 v2.0 でこの AT-P を反転させることが、無効化が実施された印になる。
