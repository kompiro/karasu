# `realizes` が同じターゲットを 2 回名指したときの意味

- **日付**: 2026-09-04
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2552](https://github.com/kompiro/karasu/issues/2552)
  - 関連 ADR: [ADR-2167](../adr/2167-realizes-comma-list.md)（`realizes` は reference list）、[ADR-1566](../adr/1566-ownership-during-migration.md)（`duplicate-owner-assignment` を info に）、[ADR-2161](../adr/2161-boundary-membership-1n.md)（boundary membership 1:N）、[ADR-1974](../adr/1974-boundary-declaration-syntax.md)
  - 関連 TPL: [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)、[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)、[TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
  - コード: `packages/core/src/view/deploy-view-extract.ts`、`packages/core/src/parser/reference-validation.ts`

## 背景・課題

1 つの deploy unit が同じ `realizes` ターゲットを 2 回名指すと、そのターゲットの
container に unit が 2 回入る。

```krs
deploy Production {
  oci app {
    runtime "Kubernetes"
    realizes OrderService
    realizes OrderService
  }
}
```

`extractDeployView` はターゲットごとに group を作り、`group.units.push(unit)` を
ターゲットの数だけ実行する（`packages/core/src/view/deploy-view-extract.ts`）。
結果として container `OrderService` の `units` は `[app, app]` になる。

### 症状は Issue の記述とは異なる

Issue #2552 は「unit が 2 回描画され、SVG id が重複し、deep permalink の
anchor が曖昧になる」と書いているが、実測ではそうならない。`deploy-layout.ts` は
layout node を `` `${containerId}::${unit.id}` `` を key とする `Map` に載せるため、
2 件目は 1 件目を上書きして消える。実際に出荷されるのは **2 unit 分に採寸された
container の中に 1 unit だけが描かれた状態**、つまり空きスロットである。

| 入力 | viewBox |
| --- | --- |
| `realizes OrderService` | `0 0 320 260` |
| `realizes OrderService` を 2 行 | `0 0 320 360` |

100px が誰も描かれない空白として残る。SVG id は重複せず、deep permalink の
anchor も曖昧にならない。したがってこれは **レイアウトの bug** であり、
anchor の bug ではない。修正の必要性は変わらないが、register を決める材料と
しては「anchor が壊れている」という緊急性は使えない。

### 回帰ではない

行の繰り返し形は #409 以来の受理形で、カンマ形（`realizes A, A`）も同じ挙動を
する。両形が区別できないことは ADR-2167 が sugar として要求している性質なので、
これは正しい。カンマ形の追加で 1 行に書けるようになった分、typo が書きやすく
なっただけである。

## 現状（インベントリ）

「同じ関係の同じ相手を 2 回書いた」ときに karasu が何をしているかを列挙する。

| プロパティ | 同じ相手を 2 回書いたとき | 診断 | 畳む場所 |
| --- | --- | --- | --- |
| `facets X, X` | collapse | なし | parser（`parseFacetsList`） |
| `contains N`（同じ boundary に 2 回） | 冪等 | なし | 派生 index（`buildBoundaryMembership`） |
| `owns N`（同じ team が 2 回） | 冪等 | なし | 派生 index（`buildOwnerIndex`） |
| `operations read, read` | collapse | **warning** `duplicate-resource-operation` | parser |
| `realizes A, A` | **2 件のまま** | なし | （畳んでいない = 本 Issue） |

対して「同じノードを **別の** 群が名指した」ときは info の事実診断が出る。

| 状況 | 診断 | severity |
| --- | --- | --- |
| 2 つの **別の** team が同じノードを `owns` | `duplicate-owner-assignment` | info |
| 2 つの **別の** boundary が同じノードを `contains` | `duplicate-boundary-assignment` | info |

### Issue が引いた前例は、Issue が言うことを言っていない

Issue #2552 は選択肢 2（残して警告する）の根拠に
`duplicate-owner-assignment`（ADR-1566）を挙げているが、この診断が発火するのは
**team が 2 つある**ときだけである。`buildOwnerIndex` は同じ team が同じノードを
2 回 `owns` した場合を `if (current === team.id) continue;` で黙って畳む
（`packages/core/src/parser/reference-validation.ts`）。`buildBoundaryMembership`
も同様で、コメントに「Re-listing the *same* boundary is idempotent rather than an
extra entry」「re-listing one boundary stays silent」と明記されている。

つまり `realizes A, A` の正確な対応物は `duplicate-owner-assignment` ではなく、
**その診断が意図的に発火しない側**である。karasu が実際に持っている規則は
2 段になっている。

- **同じ相手の繰り返し** → 冪等に畳む。黙る。
- **別の群が同じノードを名指す** → 事実として info で述べる。

`realizes A, A` は前者に属する。

### ADR-2167 は既に count を無意味と決めている

ADR-2167 は `realizes` を reference list に分類した際、その判定基準を
「その行が 1 つの関係の複数の相手を並べているか」と述べ、reference list の性質を
**「列挙の要素が互いに対等で、順序も個数も関係の意味を変えない」** と定義している。

個数が関係の意味を変えないなら、同じ相手を 2 回書いた式は 1 回書いた式と
同じ意味である。冪等に畳むことは新しい判断ではなく、ADR-2167 の定義から
導かれる帰結になる。

## 制約・前提

- **両形は区別できてはならない**（ADR-2167）。カンマ形だけを畳む修正は sugar
  equivalence を壊すので採れない。判断は必ず両形に等しく効く場所で行う。
- **宣言された事実を派生 index で捨てない**（TPL-2161）。ただし「同じ事実を 2 回
  述べた」ことは 2 つの事実ではないので、冪等化は TPL-2161 に反しない。
  TPL-2161 が禁じているのは、**別の**群への所属を落とすことである。
- **診断はモデルの事実だけを述べ、ビューの解決規則を含めない**（TPL-1386 /
  TPL-2161）。「deploy view では 1 回しか置かない」は診断文言に書けない。
- **`fmt` の往復**（TPL-1101）。現在 `karasu fmt` は重複 `realizes` 行をそのまま
  出力する。parser で畳むと `fmt` が利用者の行を黙って削除する編集ツールに
  なる。ADR-2167 は「既存ドキュメントに churn が出ない」ことを採用理由の 1 つに
  挙げている。
- **PR [#2686](https://github.com/kompiro/karasu/pull/2686) が in-flight**。
  `parseRealizesList` を共通の comma-list grammar に載せ替える refactor が
  レビュー中なので、parser に手を入れる案は正面から衝突する。
- **スコープ外**: `owns` / `contains` の重複規則、`duplicate-resource-operation`
  が warning である非対称の是正。後者は本 Issue とは別に評価する。

## 検討した選択肢

### 案 A: parser で畳む（`facets` に揃える）

`parseRealizesList` が既出のターゲットを push しない。AST から重複が消える。

- **利点**: `facets` と同じ形。後段はどこも重複を意識しない。
- **欠点**: `fmt` が利用者の行を黙って削除する。ターゲットは `NodeIdPath` なので
  「既出」の判定は spelling 一致しかできず、`realizes Shop.Api` と `realizes Api`
  が同じノードを指す場合を取りこぼす（解決は parser のこの位置ではまだできない）。
  PR #2686 と正面衝突する。

### 案 B: view で畳む・黙る

`extractDeployView` が unit ごとに「既に入れた container の key」を持ち、
同じ container には 1 回だけ入れる。AST は無変更。診断なし。

- **利点**: `contains` / `owns` の派生 index と同じ形（冪等化は index 側、AST は
  忠実）。`realizes Shop.Api` と `realizes Api` が同じノードに解決される場合も
  同じ key になるので一緒に畳める。`fmt` は無変更。parser に触れないので
  PR #2686 と衝突しない。
- **欠点**: typo が黙って通る。利用者は重複を書いたことに気付かない。

### 案 C: view で畳む + info 診断

案 B に加えて、`validateRealizesReferences` が info の
`duplicate-realizes-target` を出す。

- **利点**: typo が可視化される。案 B の修正効果はそのまま。
- **欠点**: `contains` / `owns` の同一相手繰り返しが黙っている以上、`realizes`
  だけ喋るのは非対称になる。TPL-1386 の判定樹では、重複は「モデルの事実の
  誤り」でも「流派が smell と呼ぶ構造」でもなく、**同じことを 2 回言っただけの
  no-op** で、`parseFacetsList` のコメントが言う「saying it twice is not a
  mistake worth a diagnostic」に当たる。診断コード 1 件の追加は i18n の en/ja、
  `diagnostics.md` の en/ja カタログ（TPL-1623）、skill reference bundle まで
  波及する。

### 案 D: view で畳む + warning 診断

案 C の severity を warning にする。`duplicate-resource-operation` に揃える形。

- **利点**: typo が確実に目に入る。
- **欠点**: warning は「直すべき」を含意する。ADR-1566 が
  `duplicate-owner-assignment` を error から info に下げたのは、まさにこの
  含意を避けるためだった。同一相手の繰り返しという、より軽い事象に対して
  逆行する register を与えることになる。

### 案 E: 修正しない

- **欠点**: 空きスロットが残り続ける。採らない。

## 比較

| | A: parser で畳む | B: view で畳む・黙る | C: view + info | D: view + warning |
| --- | --- | --- | --- | --- |
| 空きスロットが消える | ✅ | ✅ | ✅ | ✅ |
| 両形が区別されない（ADR-2167） | ✅ | ✅ | ✅ | ✅ |
| 別 spelling の同一ターゲットも畳める | ❌ | ✅ | ✅ | ✅ |
| `fmt` が利用者の行を消さない | ❌ | ✅ | ✅ | ✅ |
| `contains` / `owns` と対称 | ⚠️ `facets` 側に揃う | ✅ | ❌ | ❌ |
| typo が可視化される | ❌ | ❌ | ✅ | ✅ |
| PR #2686 と衝突しない | ❌ | ✅ | ✅ | ✅ |
| 変更範囲 | parser | view のみ | view + 診断 + i18n + spec ×2 | 同左 |

## Related TPLs

- [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)
  — 宣言された多重所属を派生 index で捨てない。本設計は AST を無変更に保ち、
  単一値要件を view 側で解決する形なので本観点に沿う。**同じ相手の繰り返しは
  2 つの事実ではない**という区別が、この観点と冪等化を両立させる鍵になる。
- [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)
  — 診断を足すなら register を「事実か流派判断か」で決める。案 C / D はこの
  判定樹に照らす必要がある。
- [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)
  — sugar の両形が後段のどの層からも区別できないこと。カンマ形だけを畳む案が
  最初から除外される根拠。
- [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)
  — 診断コードを足すなら `diagnostics.md` の en/ja に 1 件ずつ項目が要る。
  案 C / D のコストに含まれる。
- [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
  — `fmt` の往復。案 A が利用者の行を削除する点の根拠。

### proactive TPL の要否

3-Yes ルールに照らすと、「1 つの関係のターゲットを並べるリスト型プロパティで、
**同じ相手の繰り返し**と**別の相手の追加**を区別して扱う」という観点は
横展開しうる（`handles` / `delivers` / `capability` も同型）、構造的に再発しうる
（新しい reference list プロパティを足すたびに発生する）、既存 TPL に未掲載
（TPL-2161 は別の群への所属、TPL-2542 は表記の等価性を扱っており、繰り返しの
意味論は空白）の 3 つを満たす。実装 PR で proactive TPL を 1 件起こす。

## 現時点の方針

**案 B（view で畳む・黙る）を採る。**

Issue #2552 は案 C（残して info を出す）に傾いていたが、その根拠として引かれた
`duplicate-owner-assignment` は同じ team の繰り返しに対しては発火しないため、
前例としては案 B を支持している。この読み替えを確認したうえで案 B に決めた。

理由は 3 つある。

1. **karasu の既存規則がそう言っている。** 同じ相手の繰り返しは `facets` /
   `contains` / `owns` のすべてで黙って畳まれる。`realizes` だけが畳んでいない
   のが非対称であって、`realizes` だけが喋るのは非対称を別の形で作り直すだけに
   なる。
2. **ADR-2167 が既に決めている。** reference list は「順序も個数も関係の意味を
   変えない」。個数が意味を持たない以上、重複は情報を持たず、報告するに値する
   事実がない。
3. **`fmt` と PR #2686 の両方を避けられる。** view に閉じるので利用者のファイルは
   書き換わらず、in-flight の parser refactor とも衝突しない。

`duplicate-resource-operation`（warning）だけがこの規則から外れているが、これは
`realizes` を warning に引き上げる根拠ではなく、`operations` 側の非対称として
別途評価すべき事象と見る。

### 実装の形（案 B）

`extractDeployView` のターゲットループで、unit ごとに解決済み container key の
集合を持ち、既出の key はスキップする。

```ts
const placed = new Set<string>();
for (const target of realizes) {
  const key = resolved ? nodePathIdentityKey(resolved.path) : bareId;
  if (placed.has(key)) continue;  // 同じ相手を 2 回名指しても配置は 1 回
  placed.add(key);
  // ... group.units.push(unit)
}
```

key は container の grouping key そのものなので、`realizes Shop.Api` と
`realizes Api` が同じノードに解決される場合も同じ key になって畳まれる。
複数の **別の** ターゲットを realize する unit は従来どおり各 container に現れる。

### テスト

- `deploy-view-extract.test.ts` — 行の繰り返し形・カンマ形・別 spelling の
  同一ターゲット形のいずれでも `units` が 1 件になること。**別の**ターゲットを
  2 つ realize する unit は両方の container に現れること（冪等化が多値性を
  巻き添えにしていないこと = TPL-2161 のチェックリスト）。
- 空きスロットの回帰 — `realizes A` 単独と `realizes A` ×2 で container の
  `units.length` が一致すること。
- `packages/core/src/formatter/formatter.test.ts` — `fmt` が重複行を保つこと
  （案 B が `fmt` を変えないことの固定）。

### ドキュメント

- `docs/spec/syntax.md` / `.ja.md` の `realizes` 節に 1 文追加する。同じ
  ターゲットを 2 回名指しても 1 回名指したのと同じ意味であること（reference list
  の個数が意味を持たないという ADR-2167 の定義の帰結であること）。
- 新規セクションではなく既存節への 1 文追加だが、`.claude/rules/spec-audit.md`
  の趣旨に従い、上記の proactive TPL から back-ref を張る。
- changeset は `karasu` / `@karasu-tools/core` の patch（レンダリング挙動の変更）。
