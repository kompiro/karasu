---
type: product
---

# AT: edge の canonical id が `.krs.style` で読み戻せる（#3480）

- **日付**: 2026-11-05
- **関連 Issue**: [#3480](https://github.com/kompiro/karasu/issues/3480)（前提 [#3520](https://github.com/kompiro/karasu/issues/3520)）
- **Related TPLs**: [TPL-3480](../test-perspectives/TPL-3480-generated-id-relexes-in-target-grammar.md), [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-1755](../test-perspectives/TPL-1755-edge-endpoint-selector-id-form.md)
- **対象ファイル**: `packages/core/src/style/edge-endpoint-literal.ts`、`packages/core/src/resolver/canonical-id.ts`、`packages/core/src/parser/style-parser.ts`、`packages/core/src/style/serialize.ts`、`packages/i18n/src/{en,ja,types}.ts`、`docs/spec/style.md`、`docs/spec/style.ja.md`

> edge の canonical id（base 形式 `<from><arrow><to>`）は端点を素のまま繋いでいたので、quoted id の端点
> （`"a b"`、`"b->c"`、`"a-"`）を持つ edge では、app が書き込む `edge#<canonical id>` が parse できないか、
> 別々の edge が同じ id になって `ambiguous-edge-base` が誤って出ていた。`.krs.style` の識別子 1 つとして
> 読めない端点だけを `.krs` と同じ文字列リテラルで囲み、セレクタの parse も同じ規則で正規化する。

## 受け入れ条件

### AC-1: base 形式は `edge#<base>` に埋めて読み戻すと同じ値になる

- [x] AT-A: 識別子 1 つとして読めない端点（空白・`->`・`"`・`\`・記号）、末尾が `-` の端点、`#` で始まる端点は文字列リテラルで囲まれ、識別子として読める端点（dot-notation・数字始まり・非 ASCII・hex 形を含む）はそのまま出る

  > ✅ Automated — `packages/core/src/style/edge-endpoint-literal.test.ts` › `styleEndpointLiteral (#3480)` › `leaves %s bare: it is one style identifier`
  >
  > ✅ Automated — `packages/core/src/style/edge-endpoint-literal.test.ts` › `styleEndpointLiteral (#3480)` › `quotes %s: the style lexer does not read it as that one identifier`
  >
  > ✅ Automated — `packages/core/src/style/edge-endpoint-literal.test.ts` › `styleEndpointLiteral (#3480)` › `quotes %s by position`

- [x] AT-B: 生成した端点の組すべてについて、`edge#<base>` を parse すると同じ base が返り、端点の違う組は別々の base になる

  > ✅ Automated — `packages/core/src/style/edge-endpoint-literal.test.ts` › `edge base form round-trips through edge#<base> (#3480)` › `parses edge#<base> back to the same base with no diagnostic`
  >
  > ✅ Automated — `packages/core/src/style/edge-endpoint-literal.test.ts` › `edge base form round-trips through edge#<base> (#3480)` › `gives different endpoint pairs different bases`

- [x] AT-C: 端点がすべて識別子として読める edge の canonical id は今までと同じ素の連結のまま

  > ✅ Automated — `packages/core/src/resolver/canonical-id.test.ts` › `edgeBaseId` › `keeps the plain join for identifier endpoints`

### AC-2: 誤った `ambiguous-edge-base` が出ない

- [x] AT-D: `"a->b" -> c` と `a -> "b->c"`、`"a-" -> c` と `a --> c` は別々の canonical id を持ち、警告が出ない。本当に重なる edge の警告は base を `edge#` に書く形で示す

  > ✅ Automated — `packages/core/src/resolver/canonical-id.test.ts` › `assignEdgeCanonicalIds` › `keeps endpoints containing -> apart`
  >
  > ✅ Automated — `packages/core/src/resolver/canonical-id.test.ts` › `assignEdgeCanonicalIds` › `keeps a trailing - apart from the async arrow`
  >
  > ✅ Automated — `packages/core/src/resolver/canonical-id.test.ts` › `assignEdgeCanonicalIds` › `warns and clears canonicalId when two edges share a computed base`

### AC-3: app と同じ形で書いた rule がその edge だけに当たる

- [x] AT-E: SVG の `data-edge-canonical-id` を `edge#<id>` として書いた rule は、エラーなく parse され、その edge の id だけを指す。空白を含む端点・末尾が `-` の端点では、その edge だけの見た目が変わる。`"a->b" -> c` と `a -> "b->c"` が同じビューにある場合は、解決済みのスタイルの key が共有されるため両方に描かれる（#3481）。ここでは id とセレクタだけを確かめる

  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `targets only the edge with $name`
  >
  > ✅ Automated — `packages/core/src/index.test.ts` › `compile — edge#<canonical id> written the way the app writes it` › `gives endpoints containing -> their own id and a rule that names one of them`

- [x] AT-F: app の `upsertEdgeDirectionRule` が quoted な canonical id で書いた `.krs.style` はエラーなく parse され、2 回目の方向選択は同じ rule を書き換える（端点に `{` / `}` を含む edge は rule が追記される既知の挙動。#3524）

  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertEdgeDirectionRule` › `writes a rule that parses back to the id of %s`
  >
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `upsertEdgeDirectionRule` › `appends again for an endpoint containing { or } (#3524)`

### AC-4: セレクタは引用符付きの端点を受け付けて正規化する

- [x] AT-G: `edge#"a b"->c`・`edge#a->"b->c"`・`edge#a->#db`・`edge[from="a b"]` を受け付け、`edge#"a"->c` は `edge#a->c` に、`edge#a- -> c` は `edge#"a-"->c` に正規化される。矢印の無い `edge#"a b"` はエラー

  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser` › `quoted edge endpoints` › `reads %s as the base %s`
  >
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser` › `quoted edge endpoints` › `normalizes a needless literal to the bare base`
  >
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser` › `quoted edge endpoints` › `normalizes edge#a- -> c to the sync base of the endpoint a-`
  >
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser` › `quoted edge endpoints` › `reports %s, which has no arrow`
  >
  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › `StyleParser` › `quoted edge endpoints` › `reads [from=] / [to=] string literals as the endpoint value`

- [x] AT-H: `karasu fmt`（シートの整形）が引用符付きの端点を引用符付きのまま書き戻し、2 回目の整形で変わらない

  > ✅ Automated — `packages/core/src/style/tidy.test.ts` › `tidyStyleSheet — quoted edge endpoints round-trip (#3480)` › `formats %s as %s`
  >
  > ✅ Automated — `packages/core/src/style/tidy.test.ts` › `tidyStyleSheet — quoted edge endpoints round-trip (#3480)` › `is idempotent on the formatted form`

- [x] AT-I: facet 一覧の edge の id と `facet-not-declared` の subject が、`edge#` に書ける引用符付きの形になる

  > ✅ Automated — `packages/core/src/renderer/facet-overview.test.ts` › `buildFacetOverview` › `quotes an edge endpoint that is not one style identifier`
  >
  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `facet-not-declared (#2173)` › `names an edge with a quoted endpoint the way edge#<id> writes it`

## 手動確認

- [ ] app で次の `index.krs` を開き、`"a b"` から `c` への edge を右クリックして Direction ▸ Up を選ぶ。`.krs.style` に `edge#"a b"->c { direction: up; }` が書かれ、エラーが出ず、その edge の向きが変わる

  ```krs
  system S {
    service "a b" {}
    service c {}
    "a b" -> c "reads"
  }
  ```
