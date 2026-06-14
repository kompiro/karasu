# `team` プロパティの削除設計

- **日付**: 2026-06-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1564](https://github.com/kompiro/karasu/issues/1564)
  - 関連 ADR: [ADR-20260323-03](../adr/20260323-03-organization-diagram.md)（`team` プロパティを deprecate した決定。本設計はその廃止計画を完了させる）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理語彙は「効果を持つ / 警告される / open set と明文化」のいずれか）、[TPL-20260511-01](../test-perspectives/TPL-20260511-01-keyword-lexical-ambiguity-fence-vs-deprecate.md)（fence か deprecate か）
  - コード: `packages/core/src/parser/parser.ts`, `packages/core/src/resolver/warnings.ts`, `packages/core/src/types/ast.ts`, `packages/core/src/renderer/{svg-renderer,layout}.ts`, `packages/core/src/index.ts`, `packages/i18n/src/{render-warning,render-diagnostic,en,ja}.ts`

## 背景・課題

`service` / `domain` に書ける文字列プロパティ `team "..."` は、オーナーチームを記録する **最初の** 手段だった。[ADR-20260323-03](../adr/20260323-03-organization-diagram.md) で `organization` ブロック + `owns` を導入した際に deprecate され（§7「将来のバージョンで削除する」）、約 3 か月 deprecation warning を出し続けている。

オーナーシップの表現が `team` プロパティと `organization`/`owns` の **2 系統** に分かれたままで、相互検証もない（`service.team "X"` と `owns`（別チーム）が食い違っても気づけない）。本設計は ADR-20260323-03 の廃止計画を完了させ、オーナーシップ表現を `organization`/`owns` に一本化する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| AST | `ServiceNode.properties.team?: string` / `DomainNode.properties.team?: string`（`types/ast.ts`） |
| lexer/keyword | `team` トークンは **二重用途** — `organization` 内の `team` ブロック（正当）と、service/domain の `team` プロパティ（deprecated） |
| parser 診断 | service/domain で `team` を見たら warning `team-property-deprecated`（常時発火）+ 値を `properties.team` に格納（`parser.ts`） |
| resolver 警告 | `deprecated-team-property`（`{nodeId, ownerTeamId}`）を **`team` プロパティ かつ `owns` 両方ある衝突時のみ** 発火（`resolver/warnings.ts` `detectDeprecatedTeamProperty`） |
| renderer | owner 表示は `ownerIndex.get(id) ?? node.properties.team` のフォールバック（`index.ts` / `layout.ts` / `svg-renderer.ts` の team メタ行） |
| i18n | 診断 `teamPropertyDeprecated` + 警告 `deprecatedTeamProperty`（en/ja） |
| examples | deprecated プロパティ形式を使うのは `feature-samples/domain-drill.krs` のみ（他の `team "..." {` は organization のブロック形式で正当） |
| docs | `spec/syntax.{ja,}.md`（プロパティ表 + 例）、`spec/tags-annotations.{ja,}.md`（team 連絡先コンベンション）、`acceptance/0007・0039・0053` |
| 不変の歴史記録 | `docs/adr/20260320-02`（旧 ADR の例。**改変しない**） |

## 制約・前提

- `team` **キーワードそのものは残す** — `organization` の `team` ブロックで使うため。削除対象は「service/domain の `team` プロパティ」だけ。
- karasu の「**warn, don't error**」方針。ただし error も「パース継続して診断を積む」意味であり、render を中断するわけではない（既存 parser の `this.error()` は診断を push して継続）。
- [TPL-20260610-01]: 受理する語彙は「効果を持つ / 警告される / open set と明文化」のいずれかに属さねばならない。**黙って受理して無視する**選択肢はこの観点に反する。
- [TPL-20260511-01]: 二義的キーワードはまず外部 fence を検討してから deprecate する。本件は fence/deprecate の判断は ADR-20260323-03 で **既に deprecate に決着済み**（`team` プロパティと `organization`/`owns` は意味が二義的なのではなく、機能が冗長だったため）。本設計はその後段（removal）に位置する。
- out of scope: `organization`/`team`/`owns` 自体の仕様変更、AI チャットの組織クエリ機能の再設計（連絡先は `link` で表現する方針は維持）。

## 検討した選択肢

論点は2つ — (1) 削除の posture、(2) AST フィールドを残すか。両者は連動する。

### 案A: ハードエラー化 + AST フィールド削除（プロパティを完全除去）

service/domain の `team` プロパティを見たら **error 診断**（新コード `team-property-removed`）を出し、値は格納しない。`ServiceNode`/`DomainNode` から `team?: string` を削除。renderer のフォールバックは消え、owner 表示は `ownerIndex`（`organization`/`owns`）のみ。

**メリット**

- TPL-20260610-01 に合致（受理せず、明確に警告＝error）。
- オーナーシップ表現が `organization`/`owns` に一本化され、2 系統の食い違いが構造的に消える。
- AST フィールド削除で TypeScript の typecheck が全 reader（renderer フォールバック）を機械的に検出でき、消し漏れが起きない。
- ADR-20260323-03 の廃止計画を素直に完了。

**デメリット**

- 破壊的変更。既存 `.krs` で `team "X"`（org ブロックなし）を使っていると error 診断が出て、その owner ラベルは描画されなくなる。
- AT / spec / examples / tests / i18n に波及する（ただし範囲は再追跡済みで限定的）。

### 案B: silent-ignore（プロパティを黙って無視）

`team` プロパティをパースは受理するが診断を出さず、値も使わない。

**メリット**

- 既存ファイルが error 表示なしで通る。

**デメリット**

- **TPL-20260610-01 違反** — 「受理されるが効果も警告もない語彙」を生む典型的アンチパターン。ユーザーは `team "X"` が無視されていることに気づけない。却下。

### 案C: deprecation を延長（現状維持）

warning のまま据え置く。

**メリット**

- 変更なし。

**デメリット**

- 2 系統併存・相互検証なしの問題が残り続ける。ADR-20260323-03 の「将来削除する」が宙吊りのまま。Issue の趣旨（削除）に反する。却下。

### 案D: AST フィールドは残し、error だけ出す

error 診断は出すが `team?: string` フィールドと格納は残す（forward-compat 名目）。

**メリット**

- renderer フォールバックを残せる（破壊が小さい）。

**デメリット**

- 「error と言いながら値は使われている（フォールバック表示される）」という矛盾した状態。owner 表示の 2 系統も解消しない。typecheck による reader 検出の利点も失う。中途半端。却下。

## 比較

| 観点 | 案A ハードエラー+除去 | 案B silent-ignore | 案C 延長 | 案D error+フィールド残置 |
| --- | --- | --- | --- | --- |
| TPL-20260610-01 適合 | ◎（警告される） | ✗（無視） | △（warning） | ○ |
| owner 表現の一本化 | ◎ | ✗ | ✗ | ✗ |
| 後方互換性 | ✗（破壊的） | ◎ | ◎ | △ |
| 消し漏れ防止（typecheck） | ◎ | — | — | ✗ |
| ADR-20260323-03 完了 | ◎ | △ | ✗ | △ |

## 関連 TPLs

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) — 受理語彙は効果/警告/open-set のいずれか。案B（silent-ignore）を却下する直接の根拠。
- [TPL-20260511-01](../test-perspectives/TPL-20260511-01-keyword-lexical-ambiguity-fence-vs-deprecate.md) — fence か deprecate か。本件は ADR-20260323-03 で deprecate に決着済みのため、本設計は removal フェーズに該当する旨を確認。

（新規 proactive TPL の必要性: 本設計は語彙の **削除** であり新規 spec セクション追加ではない。既存 TPL-20260610-01 が「受理語彙の効果」を既にカバーしているため、新規 TPL は起こさない。）

## 現時点の方針

**案A（ハードエラー化 + AST フィールド削除）を採用する** — TPL-20260610-01 に最も整合し、オーナーシップ表現を `organization`/`owns` に一本化でき、AST フィールド削除によって renderer の消し漏れを typecheck で機械的に防げる。破壊的変更だが、CLI は 0.x、かつ 3 か月の deprecation 期間を経ており、error 診断はパースを止めず移行先を明示するため影響は許容範囲。

### 実装の指針

1. **AST**（`types/ast.ts`）: `ServiceNode`/`DomainNode` の `team?: string` を削除。`expected-string-after` / `property-not-for-node-kind` の union から `"team"` を除去。診断 `team-property-deprecated`（`Record<string,never>`）を新コード `team-property-removed`（error）に置換。
2. **parser**（`parser.ts`）: service/domain プロパティループの `team` 分岐を「warning + 格納」→「error `team-property-removed`（トークンと後続の文字列リテラルを消費して捨てる）」に変更。`team` キーワードのブロック用途（organization 側パス）は不変。
3. **resolver**（`resolver/warnings.ts`）: `detectDeprecatedTeamProperty` と呼び出しを削除。`deprecated-team-property` WarningKind（union + params）を `warnings.ts` から除去。
4. **renderer**（`index.ts` / `layout.ts` / `svg-renderer.ts`）: `?? node.properties.team` フォールバックと team メタ行の property 参照を削除（owner は `ownerIndex` のみ）。typecheck エラーを潰して網羅する。
5. **i18n**（`packages/i18n`）: `deprecated-team-property` 警告（en/ja + render-warning case）を削除。`diagnostic.teamPropertyDeprecated` を `teamPropertyRemoved`（en/ja + render-diagnostic case）に置換。メッセージ例: `"team" property has been removed; declare ownership with an organization block and "owns"`。
6. **examples**: `feature-samples/domain-drill.krs` の `team "Order Team"` 2 行を削除（drill-down demo に所有は不要）。feature-samples は `packages/core/src/builtins/examples.ts` と同期する。
7. **docs/spec**: `syntax.{ja,}.md` のプロパティ表から `team` 行と例の `team "..."` 行を削除。`tags-annotations.{ja,}.md` の「team 連絡先コンベンション」節を、所有チームは `organization`/`owns` から導出・連絡先は `link`、に書き換え。
8. **AT**: `0007` の deprecation 期待を removal-error に更新。`0039` / `0053` のセットアップを `organization`/`owns` に移行（または検証本質に不要なら行削除）。
9. **tests**: `parser.test.ts`（team property → removed error）、`layout.test.ts`（property フォールバックのテストを ownerIndex ベースに整理）。
10. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/1564-remove-team-property.md`（番号は Issue 番号ベース、`.claude/rules/adr.md`）として昇格し、本ファイルを同 PR で削除する。`depends_on: [ADR-20260323-03]`。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `service`/`domain` の `team "X"` は error 診断になり、owner ラベルは描画されなくなる。移行は `organization { team t { owns X } }` へ。`link` でチーム連絡先 URL を維持。
- ドキュメント更新: 上記 spec 2 ファイル + AT 3 ファイル。
- テスト・examples への影響: `domain-drill.krs`（+ examples.ts 同期）、parser/layout テスト。
- changeset: 公開 CLI（`karasu`）の挙動変更のため `pnpm changeset`（0.x なので minor）。

## 未解決の問い / 決めないこと

- **Q1（posture の最終確認）**: 案A（ハードエラー）でよいか。それとも error ではなく warning のまま「フィールドだけ削除して値を無視」（実質案B寄り）にしたいか。TPL-20260610-01 の観点では error 推奨。
- **Q2（renderer の挙動）**: `organization` ブロックを持たない図で `service.team "X"` だけで owner ラベルを出していたユーザーは、移行するまでラベルが消える。これを許容してよいか（移行を促す方針）。それとも何らかの猶予表示を設けるか。
- **Q3（AT 0039 / 0053 の扱い）**: セットアップの `team "..."` を `organization`/`owns` に書き換えるか、AT の検証本質に不要なら単に削除するか。
