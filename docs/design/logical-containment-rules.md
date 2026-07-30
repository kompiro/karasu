# 論理ノードの containment 規則 — `canContain` を正典にし、違反を v1.x warning で surface する

- **日付**: 2026-07-29
- **ステータス**: 検討中
- **PR**: [#2171](https://github.com/kompiro/karasu/pull/2171)
- **関連**:
  - 引き金 Issue: [#2165](https://github.com/kompiro/karasu/issues/2165)（`system` が何を含めるかの語彙判断）
  - 発見元: [#2158](https://github.com/kompiro/karasu/issues/2158) / [PR #2163](https://github.com/kompiro/karasu/pull/2163)（Reference catalog と parser の drift 修正。`canContain` だけ parser で縛れず残った）
  - 関連 ADR: [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（`.krs` v1.0 freeze）、[ADR-681](../adr/681-top-level-service-rendering.md) / [ADR-702](../adr/702-top-level-infra-rendering.md)（未割り当てノードを `(Unassigned)` 擬似 system で描画）、[ADR-1639](../adr/1639-user-system-scoped.md)（`user` の top-level 禁止 — 配置規則の書き方の先例）、[ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（規則 ↔ 診断の対応）、[ADR-1296](../adr/1296-reference-data-single-source.md)（`reference-data.ts` が catalog の正典）
  - roadmap: [§Syntax 2.0 プログラム](../roadmap.md#syntax-20-プログラム)（[#2162](https://github.com/kompiro/karasu/issues/2162)）— 破壊的変更の受け皿
  - コード: `packages/core/src/parser/parser.ts`, `packages/core/src/builtins/reference-data.ts`, `packages/core/src/types/warnings.ts`

## 背景・課題

#2158 で Reference catalog（`REFERENCE_DATA.nodeKinds`）を parser の実測で双方向に
縛ったが、**`canContain` 列だけは縛れずに残った**。parser が入れ子をほとんど強制
しないため、「catalog が言う containment」と「parser が受理する containment」を
比較しても意味のある差分が出ないからである。

#2165 はその一角として起票された: `system` の `canContain` は `domain` を挙げて
いないのに、`system` 直下の `domain` はパースも描画も通り、`docs/spec/syntax.md`
§S2 は `domain` / `usecase` / `resource` を system の子として列挙している。三者が
食い違っている。

調べると #2165 は一角にすぎず、**論理レイヤの入れ子はほぼ無検査**だった。

## 現状（インベントリ）

論理ノードの parent × child を最小 `.krs` で総当たりパースした実測（`DOC` =
`canContain` に記載かつ受理 / `lax` = 受理だが未記載 / `rej` = error）:

| parent \ child | system | user | client | service | domain | entity | usecase | resource | infra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `system` | lax | DOC | DOC | DOC | **lax** | rej | **lax** | **lax** | DOC |
| `user` | lax | · | lax | lax | lax | rej | lax | lax | rej |
| `client` | lax | lax | · | lax | lax | rej | lax | lax | rej |
| `service` | lax | lax | lax | · | DOC | rej | lax | lax | rej |
| `domain` | lax | lax | lax | lax | · | DOC | DOC | lax | rej |
| `usecase` | lax | lax | lax | lax | lax | rej | · | DOC | rej |
| `resource` | lax | lax | lax | lax | lax | rej | lax | · | rej |
| `entity` / infra ブロック | rej | rej | rej | rej | rej | rej | rej | rej | rej |

**受理される 47 通のうち 37 通が未記載**（`canContain` に載っているのは 10 通）。
`client` の中の `usecase`、`resource` の中の `service` すら診断ゼロで通る。

parser が実際に強制している配置規則は次の 3 つだけ:

| 規則 | 診断 | 出所 |
| --- | --- | --- |
| infra ブロック（`database` / `queue` / `storage`）は `system` 直下のみ | `infra-not-in-context` (error) | ADR-316 |
| `entity` は `domain` の子のみ | `entity-not-in-domain` (error) | ADR-1870 |
| `boundary` は canvas を描く kind の中のみ | `boundary-not-in-context` (error) | ADR-1974 |

対照的に **top-level（ファイル直下）の配置は厳密**である。`usecase` / `resource` は
`unexpected-token-root`、`user` / edge は `top-level-declaration`（ADR-1639 が
「identity vs relationship」を根拠に spec §Top-level placement へ明文化）。
つまり karasu は「ファイル直下に何を置けるか」は決めきっているのに、
「ブロックの中に何を置けるか」は決めていない。

`docs/concepts.ja.md` は階層を `service → domain → usecase → resource` と定義して
いるので、`client` 直下の `usecase` のような形は**意味論を持たない**（描画はされる）。

## 制約・前提

- **v1.0 は freeze 済み**（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)、公開ローンチで発効）。
  今日パースが通る `.krs` を parse error にするのは後方互換の破壊であり、
  次 major まで実施できない。
- **warning の追加は additive で freeze 非抵触** — roadmap §Syntax 2.0 が tag /
  annotation 語彙の閉鎖で採った戦略と同じ（`tag-not-builtin` / `annotation-not-builtin`
  を v1.x で warning として出し、error 化は v2.0）。本件も同じ型に載せられる。
- **spec が約束する配置規則には専用の診断コードを対応させる**（ADR-1567 /
  [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md)）。汎用 parse error に落とさない。
- **既存資産への影響はゼロ**: `examples/**/*.krs` 78 ファイルを現行 `canContain` で
  走査した結果、違反は 0 件。提案する warning は shipped な例を 1 つも汚さない。
- **out of scope**: deploy / organization / legend の containment（別 catalog で、
  それぞれ独自の grammar を持つ）。cross-system 参照。`boundary` の所属規則（#2161）。

## 検討した選択肢

### 案1: `canContain` を正典にし、違反を v1.x warning として surface する（採用）

`REFERENCE_DATA.nodeKinds[].canContain` を「その kind が持てる子の集合」の唯一の
正典に格上げし、parser（または resolver）がそれと突き合わせて違反に warning を出す。
error 化は Syntax 2.0（#2162）へ登録する。

`system.canContain` には `domain` を追加する — ADR-681 / ADR-702 が「service に
未割り当ての domain」を正当な状態として `(Unassigned)` 擬似 system で描画すると
決めており、system 直下の domain はその in-system 版と読めるため。

**メリット**

- 三者の食い違い（catalog / §S2 / 実装）が 1 つの正典に収束する。
- #2158 の parser 実測テストが `canContain` も双方向に縛れるようになる
  （現在は `entity` の配置しか縛れていない）。
- freeze に抵触しない。既存ファイルは警告付きで動き続ける。
- ADR-1639 / ADR-1567 が確立した「規則は spec に根拠付きで書き、専用診断を対応
  させる」作法をそのまま踏襲できる。

**デメリット**

- 診断コードが 1 つ増える（規則カタログ・i18n・両ロケール spec の更新が必要）。
- 「warning は出るが動く」状態が v2.0 まで残る（[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) の状態 (2)）。
  これは roadmap が tag/annotation で既に受け入れている状態でもある。

### 案2: 今回は文書だけ直す（`domain` の追加と §S2 の整合）

`system.canContain` に `domain` を足し、`domain` 行の説明を実態に合わせ、§S2 と
突き合わせて閉じる。残り 36 通の lax は別 Issue に切る。

**メリット**: 変更が最小。**デメリット**: #2165 の表面だけ塞がり、`canContain` が
文書のみである構造は残る。[TPL-20260727-01](../test-perspectives/TPL-20260727-01-parser-acceptance-documented-in-spec.md)（受理 ⊆ 文書化）を満たさない状態が
続き、次に同じ発見が別の角から出てくる。

### 案3: lax を正当と認め、`canContain` を「推奨される配置」に格下げする

parser の寛容さを仕様として追認し、診断は追加しない。

**メリット**: 実装ゼロ。**デメリット**: `docs/concepts.ja.md` の階層定義（service →
domain → usecase → resource）と正面から矛盾する。`client` 直下の `usecase` に意味論を
与えられないまま「サポートされた記法」と宣言することになり、[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
（受理された語彙は効果を持つ）に反する。

### 案4: いま error 化する

**却下** — ADR-1314 の freeze に抵触する。今日通っているファイルが壊れる。

## 比較

| 観点 | 案1（warning） | 案2（文書のみ） | 案3（lax 追認） | 案4（error） |
| --- | --- | --- | --- | --- |
| 後方互換性 | 保つ（additive） | 保つ | 保つ | **壊す** |
| 三者の食い違い解消 | 解消 | `system` 行のみ | 文書側に寄せて解消 | 解消 |
| concepts の階層と整合 | 整合 | 部分的 | **矛盾** | 整合 |
| `canContain` を機械検証できるか | できる | できない | できない | できる |
| 実装コスト | 診断1件 + spec + テスト | データ + 文言のみ | ゼロ | 案1 + 移行 |
| roadmap の先例との一致 | 一致（tag/annotation と同型） | — | — | 不一致 |

## Related TPLs

- [TPL-20260727-01](../test-perspectives/TPL-20260727-01-parser-acceptance-documented-in-spec.md) — parser が受理する形は spec に文書化されている。本設計は 37 通の undocumented leniency をこの観点で棚卸しした結果である。
- [TPL-20260729-01](../test-perspectives/TPL-20260729-01-catalog-fenced-against-parser-not-generated-doc.md) — 手書き catalog は parser 実測で双方向に縛る。`canContain` を縛れなかったのは parser 側に規則が無かったためで、本設計はその欠けを埋める。
- [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md) — spec が約束する配置規則は専用の診断コードを持つ。
- [TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md) — 新診断は規則カタログに 1 件の項目を持つ。
- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理された語彙は効果を持つ。案3 を却下した根拠。
- [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — spec doc と reference データの同期。

## 現時点の方針

**案1 を採用する。** `canContain` を containment の唯一の正典に格上げし、違反は
v1.x では warning、error 化は Syntax 2.0（#2162）へ送る。理由は 3 つ:

1. **freeze を守りつつ、放置しない**。roadmap が tag / annotation の語彙閉鎖で
   すでに「v1.x は warning、v2.0 で error」という型を確立しており、本件を別の型で
   処理する理由がない。
2. **`canContain` に実効性が生まれる**。今の `canContain` は誰も検証しない文書列で、
   だからこそ #2158 で `entity` 以外を縛れなかった。正典化すれば #2158 のテストが
   そのまま双方向ガードに育つ。
3. **`domain` の扱いに既存決定の裏付けがある**。ADR-681 / ADR-702 が「未割り当ての
   service / domain / infra」を正当な状態として扱うと決めている以上、system 直下の
   domain を異常扱いする理由がない。§S2 の記述とも一致する。

### 実装の指針

1. **データ**: `reference-data.ts` の `system.canContain` に `domain` を追加し、
   `domain` の description を「top-level / system 直下 / service 内」に修正する。
   `pnpm gen:reference` で `docs/spec/syntax.md` / `syntax.ja.md` を再生成。
2. **診断**: `node-not-in-context`（warning）を追加する。命名は既存の
   `infra-not-in-context` / `boundary-not-in-context` に揃える。params は
   `{ childKind, parentKind }`。判定は `canContain` から導出し、規則の重複定義を
   作らない（`INFRA_KIND_SET` を再宣言しない ADR-316 の作法と同じ）。
   - 発火位置は parser（`parseNodeDecl` の子ノード処理）と resolver のどちらでも
     成立する。既存の `entity-not-in-domain` / `infra-not-in-context` が parser 側に
     あるため parser に揃える。ノードは**ドロップせず保持する**（error ではないので
     描画は従来どおり）。
3. **i18n**: `packages/i18n` に en / ja メッセージを追加（`docs/spec/i18n.md` の
   キー命名に従う）。
4. **spec**: `docs/spec/syntax.md` / `syntax.ja.md` に §Nesting placement 節を新設し、
   `canContain` が正典であること・違反は warning であること・v2.0 で error 化予定で
   あることを記す。§S2 の列挙と矛盾しない文言にする。`docs/spec/diagnostics.md` /
   `.ja.md` の「Declaration, edge placement & structure」表に 1 行追加。
5. **テスト**: #2158 の `reference-parser-sync.test.ts` を拡張し、`entity` 限定の
   配置 assert を `canContain` 全体の双方向 assert に置き換える（「`canContain` に
   ある = warning なし」「無い = warning あり」）。`examples` 全件が warning ゼロで
   あることも fence する。
6. **AT**: `docs/acceptance/2165-logical-containment-rules.md`。TC は
   (a) `system > domain` が warning なし、(b) `client > usecase` が
   `node-not-in-context` warning、(c) warning が出てもノードは描画される、
   (d) examples 全件 warning ゼロ、(e) app / VS Code の診断表示（手動）。
7. **roadmap**: §Syntax 2.0 の「追跡（Issues）」表に error 化を 1 行登録する
   （#2162 に紐付け）。
8. **changeset**: `@karasu-tools/core` + `karasu` を minor（新診断の追加）。
9. **ADR 昇格**: 実装完了後 `docs/adr/2165-logical-containment-rules.md` として
   昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: 新しい warning が 1 種類出るのみ。parse・描画の挙動は
  不変。`canContain` に沿って書かれたファイルには何も出ない。
- **shipped な資産**: `examples/**/*.krs` 78 ファイルは違反ゼロ（実測済み）ので
  変更不要。
- **ドキュメント更新**: `docs/spec/syntax.md` / `.ja.md`（新節 + 生成表）、
  `docs/spec/diagnostics.md` / `.ja.md`（カタログ 1 行）、`docs/roadmap.md`
  （v2.0 追跡表）。
- **v2.0 での作業**: warning を error に昇格し、違反ノードをドロップする挙動へ
  変更する。移行期間中に warning を出しておくことで、その時点の破壊面は既知になる。
