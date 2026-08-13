# organization / team / member の positional label を error へ昇格する

- **日付**: 2026-08-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2208](https://github.com/kompiro/karasu/issues/2208)
  - 本 Design Doc の PR: [#2489](https://github.com/kompiro/karasu/pull/2489)
  - 関連 Issue: [#2133](https://github.com/kompiro/karasu/issues/2133)（boundary を removed 化・org/team/member を deprecated 化）、[#2209](https://github.com/kompiro/karasu/issues/2209)（エッジ inline label、本設計の対象外）
  - 関連 ADR: [ADR-19](../adr/19-required-id-label-as-property.md)（id 必須化・label のプロパティ化）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 凍結）
  - 関連 TPL: [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)
  - コード: `packages/core/src/parser/parser.ts`、`packages/core/src/types/ast.ts`、`packages/i18n/src/`、`scripts/lint/krs-fences.ts`

## 背景・課題

ADR-19 は id を必須化し、label をプロパティに移した。案B「label を位置引数として
残す」は構文の非対称性を理由に却下されている。しかし parser は
`<kw> <id> "<label>"` という位置引数形を受理し続けていた（spec に記載の無い
leniency）。#2133 はこれを整理し、experimental な `boundary` では
`positional-label-removed`（error）として即撤去、`organization` / `team` /
`member` では `positional-label-deprecated`（warning）として猶予を置いた。

本設計はその「later」、すなわち organization / team / member でも error に
昇格させる部分を扱う。

着手時の調査で、Issue 起票時の前提が 2 点変わっていることが分かった。

**1. deprecation warning は一度もリリースされていない。** #2133 のマージは
2026-07-27 だが、その changeset（`.changeset/frame-labels-positional-retire.md`）
は未消費のまま残っており、npm 上の `@karasu-tools/core` は 0.2.0、`karasu` は
0.6.0 で `package.json` と同値である。つまり「warning を出す版」は世に存在せず、
公開版は位置引数形を黙って受理している。deprecation 期間の実体は 0 であり、
「warning を見たユーザーが移行する」という想定は成立しない。

**2. error になった後は `karasu fmt` で移行できない。** `format()` は error 診断が
1 件でもあると `FormatError` を投げる（`packages/core/src/formatter/formatter.ts`）。
Issue 本文の「migration is mechanical and already shipped」は、**昇格前の版で
fmt をかける限りにおいて**正しい。昇格後の版では、位置引数形を含むファイルは
fmt で直せない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 受理と診断 | `service` / `domain` 等: 元から拒否。`boundary` / `facet`: `positional-label-removed`（error）。`organization` / `team` / `member`: 受理 + `positional-label-deprecated`（warning） |
| parser 実装 | `parseDeprecatedPositionalLabel(construct)` が warning を積んで値を返す。organization / team / member の 3 箇所から呼ばれる |
| boundary 実装 | 文字列を consume して error を出し、**値は捨てる** |
| 診断カタログ | `docs/spec/diagnostics.md` / `.ja.md` に 2 行（removed / deprecated）。`packages/core/src/types/diagnostics-catalog.test.ts` がコード ↔ カタログの双方向完全性を meta-test で強制する |
| spec 散文 | `docs/spec/syntax.md`「How to specify a label」節と ja 版が、位置引数形を deprecated として説明している |
| i18n | `diagnostic.positionalLabelDeprecated.message`（en / ja）と `render-diagnostic.ts` の case |
| corpus 出現 | `examples/` 0 件。`docs/acceptance/0007-organization-diagram.md` 9 件、`docs/adr/14-organization-diagram.md` 2 件 |
| fence guard | `scripts/lint/krs-fences.ts` は **error 診断のみ**で落ちる。AT-0007 の該当スニペットは既に ```krs タグ付きで、今日は warning 止まりのため green（320 snippet / 316 file） |
| fmt / serialize | `format()` は error があると `FormatError`。一方 `karasu subtree` は `serializeKrsFile` を診断ゲート無しで呼ぶ |

## 制約・前提

- **ADR-1314（v1.0 凍結）と衝突しない。** 凍結面は構文・builtin タグ/注釈・診断
  register・warn-don't-error であり、位置引数形は **spec に存在しない**。#2133 が
  boundary で採った理屈と同じで、撤去は凍結面の破壊ではなく凍結 spec への準拠。
  なお凍結面の「warn-don't-error」は **未解決参照**（spec §S6）についての方針で
  あり、構文の受理形を warning に留める約束ではない。
- **移行窓は昇格前の版にしかない。** 昇格を含む版がリリースされた後は fmt で
  直せないため、リリースノートに「上げる前に現行版で `karasu fmt` をかける」と
  明記する必要がある。
- **診断コードは下流の安定 API**（LSP・app が消費）。`positional-label-deprecated`
  は撤去、`positional-label-removed` は既存コードを rename せず対象構文を広げる。
- 対象外: エッジの inline label `A -> B "label"`（#2209）。spec に記載があり
  代替構文が無いため、本設計とは別の判断（v2.0 相当）になる。

## 検討した選択肢

### 案1: error へ昇格し、label 値は AST に保持する

`positional-label-removed` を organization / team / member にも出す。ただし
boundary と違い、読み取った文字列は捨てずに `label` として AST に載せる。

**メリット**

- error でユーザーに修正を促しつつ、**表示は壊れない**。診断があってもレンダリングは
  続行する karasu の作法（AT-0007 の TC が「エラーでも SVG は描ける」ことを確認している）と揃う。
- `serializeKrsFile` を診断ゲート無しで呼ぶ経路（`karasu subtree`）で、
  チーム名が黙って消えない。値を捨てる案では subtree 出力から表示名が失われる。
- 昇格前の版で `karasu fmt` を通した場合と、AST 上の結果が一致する。

**デメリット**

- `positional-label-removed` の意味が構文によって 2 通り（boundary / facet は
  値を捨て、organization / team / member は保持する）になる。カタログにその差を
  書かないと読者が混乱する。

### 案2: error へ昇格し、値も捨てる（boundary 踏襲）

**メリット**

- 1 コード = 1 挙動で説明が単純。

**デメリット**

- 位置引数形を使っているファイルで、チームカードの表示名が id に落ちる。error は
  出るが、fmt での自動修正はもう効かないため、ユーザーは手で直すまで表示劣化を被る。
- subtree 経由で表示名が失われる。

### 案3: warning のまま据え置き、v2.0 まで持ち越す

**メリット**

- 何もしない。

**デメリット**

- ADR-19 の残課題が閉じない。deprecation warning は未リリースなので「猶予を
  与えている」実体も無く、待っても状況は変わらない。
- spec に無い形を parser が受理し続ける状態（TPL-2133 が指す drift）が続く。

## 比較

| 観点 | 案1（保持） | 案2（破棄） | 案3（据え置き） |
| --- | --- | --- | --- |
| 変更量 | 小 | 小 | なし |
| 既存ファイルの表示 | 保たれる | id に劣化 | 変わらない |
| 診断の説明しやすさ | 構文ごとに差の注記が要る | 単純 | 現状維持 |
| ADR-19 の完了 | する | する | しない |

## Related TPLs

- [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) — parser が受理する形は spec に文書化する。本設計はこの drift を受理側の撤去で解消する。TPL 本文の「positional は deprecated と明記」という記述は本 PR 後の状態に合わせて更新する
- [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md) — 診断コード ↔ カタログの双方向完全性。`positional-label-deprecated` の撤去では en/ja 両カタログの行削除が必須で、漏れは `packages/core/src/types/diagnostics-catalog.test.ts` が検出する
- [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — round-trip 保証。位置引数形は error になるため `format()` の対象から外れるが、AST に載った label は property 形として serialize される（案1 を採る根拠のひとつ）

既存 TPL で本設計の失敗モードは覆われており、新規 proactive TPL は起こさない。
spec への新規セクション追加も無い（既存節の書き換えのみ）。

## 現時点の方針

**案1 を採用する** — error への昇格は ADR-19 の完了に必要で、deprecation warning が
未リリースである以上これ以上待っても猶予にならない。値を保持するのは、error を
出すことと表示を壊すことが独立の判断だからで、fmt による自動修正が昇格後は
効かない以上、ユーザーが手で直すまでの間に表示まで劣化させる理由が無い。

boundary / facet との差（値を捨てる / 保持する）は診断カタログに 1 文で書く。

### 実装の指針

1. **parser**: `parseDeprecatedPositionalLabel` を、`positional-label-removed` を
   出しつつ値を返す形に置き換える（関数名も実態に合わせる）。呼び出し 3 箇所は
   そのまま。boundary / facet の既存挙動は変えない。
2. **型と i18n**: `DiagnosticParamsByCode` から `positional-label-deprecated` を
   削除。`packages/i18n` の `diagnostic.positionalLabelDeprecated.message`（types /
   en / ja）と `render-diagnostic.ts` の case、対応するテスト行を削除。
3. **診断カタログ**: `docs/spec/diagnostics.md` / `.ja.md` の deprecated 行を削除し、
   `positional-label-removed` 行を organization / team / member / facet を含む記述に
   広げる。構文により値を保持する差もここに書く。
4. **spec 散文**: `docs/spec/syntax.md`「How to specify a label」節と ja 版を、
   error である旨に書き換える。
5. **AT-0007**: 位置引数形 9 箇所をプロパティ形式へ書き換え、位置引数形が error に
   なることを確認する TC を追加する。
6. **ADR-14**: 決定記録なので本文は書き換えず、当時（2026-03）の記法である旨と
   ADR-19 / #2208 で撤去された旨の注記を 1 行足す。`docs/adr/` は fence guard の
   対象外なので、スニペットはそのまま残せる。
7. **fence guard**: `scripts/lint/krs-fences.ts` を、error に加えて
   deprecation クラス（code が `-deprecated` で終わる warning）でも finding を出す
   ようにする。判定は純粋関数として export し、合成した診断配列でユニットテストする
   （本 PR 後、実コードでこのクラスに該当する診断は 0 件になるため）。
8. **changeset**: 新規 changeset（`@karasu-tools/core` + `karasu`、minor）に
   「位置引数形は error。上げる前に現行版で `karasu fmt` をかけること」を書く。
   併せて未消費の `.changeset/frame-labels-positional-retire.md` から
   「organization / team / member は warning」の記述を落とす（存在しない版の挙動を
   リリースノートに出さないため）。

検証は `pnpm --filter @karasu-tools/core test`、`--filter @karasu-tools/i18n test`、
`pnpm lint:krs-fences`、scripts の vitest、typecheck、`pnpm changeset status --since=main`。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 位置引数形を含む `.krs` は error になる。表示は保たれる。
  移行は `karasu fmt`（**昇格版に上げる前に**実行）。spec に載ったことの無い形で、
  `examples/` にも出現しないため、実ファイルでの露出は無いと判断する。
- ドキュメント更新: `docs/spec/syntax.md` / `.ja.md`、`docs/spec/diagnostics.md` /
  `.ja.md`、`docs/acceptance/0007-organization-diagram.md`、`docs/adr/14-organization-diagram.md`（注記のみ）、TPL-2133。
- テスト・examples への影響: `examples/` は 0 件で変更なし。parser / i18n の既存
  テストは warning 前提の assert を error 前提へ書き換える。
