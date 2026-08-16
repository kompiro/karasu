# 語彙センサスが見つけた drift の閉鎖 — hyphenated 名の字句解析と onboarding の register 選択

- **日付**: 2026-08-16
- **ステータス**: 検討中
- **PR**: [#2524](https://github.com/kompiro/karasu/pull/2524)
- **関連**:
  - 親 Issue: [#2522](https://github.com/kompiro/karasu/issues/2522)（census drift closure）
  - 引き金 Issue: [#2509](https://github.com/kompiro/karasu/issues/2509)（hyphenated tag の分裂）, [#2510](https://github.com/kompiro/karasu/issues/2510)（open-set 規則の逆転記述）, [#2511](https://github.com/kompiro/karasu/issues/2511)（閉鎖前提条件の re-scope）
  - 関連 ADR: [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze）, [ADR-2065](../adr/2065-tags-and-facets.md)（tags and facets / リスク台帳）, [ADR-2172](../adr/2172-builtin-vocabulary-expansion.md)（builtin 追加 gate）, [ADR-2173](../adr/2173-facet-grammar-and-model.md)（facet 文法）, [ADR-2174](../adr/2174-facet-overlay.md)（facet overlay）
  - 関連 TPL: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md), [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md), [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md), [TPL-1281](../test-perspectives/TPL-1281-keyword-lexical-ambiguity-fence-vs-deprecate.md), [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md)
  - コード: `packages/core/src/parser/parser.ts`（`parseTags` / `parseAnnotations` / `parseClientCapability`）, `packages/core/src/parser/style-parser.ts`（tag / annotation selector）

## 背景・課題

`pnpm census:vocabulary`（#2508）が 3 つの drift を見つけた。3 件は独立ではない
（#2509 の決定が #2510 の書くべき文面を決め、#2511 が残す counts は #2509 で
1 か 7 に変わる）ため、決定を 1 つの Design Doc で行う。

1. **#2509**: `[my-team-internal-tag]` が 1 つのタグではなく **7 つの断片**
   （`my`, `-`, `team`, `-`, `internal`, `-`, `tag`）として parse され、診断が出ない。
   spec は capability について「識別子集合は open — 任意の **kebab-case** 識別子を
   受け付ける」と約束しており（`docs/spec/tags-annotations.md:251`）、
   `docs/acceptance/0064` §2b は `[my-team-internal-tag]` を supported な
   user-defined tag として教えている。
2. **#2510**: `docs/guide/02-onboarding.md` §5.1 が「annotation 名は open set、
   非 builtin に警告なし」という #2159 で反転済みの規則を事実として教え、その上に
   `@unverified` / `@assumed` の reading-confidence ワークフローを組んでいる。
   読者がガイド通りに書くと deprecation warning だらけになる。
3. **#2511**: roadmap の閉鎖前提条件 1（corpus 実測）のうち「どの custom 名が
   使われているか」（names）は、nest のデータ取り扱いポリシー上収集できない。
   counts だけを残す再スコープ提案が Issue に確定済み。

## 現状（インベントリ）

lexer は `-` を識別子文字に含めず、`Identifier("-")` として独立トークンを出す。
kebab-case 名を受ける各ポジションの現状:

| ポジション | 実装 | `foo-bar` の挙動 |
| --- | --- | --- |
| `capability` 名 | `parseClientCapability`（parser.ts:845-862） | **stitching 実装済み** — `<ident>-<ident>` の連なりを 1 名に縫合 |
| tag（`[...]`） | `parseTags`（parser.ts:1681-1698） | 7 断片に分裂、診断なし（各断片が `tag-not-builtin` を個別に出す） |
| annotation 名（`@...`） | `parseAnnotations`（parser.ts:1706-1710） | `@foo-bar` は `foo` で切れ、残り `-bar` は後続トークンとして漏れる |
| style tag selector（`[...]`） | style-parser.ts:286 | **分裂しない** — style-lexer はハイフンを識別子に含める（`font-family` のため。実装時の実測で本表を訂正: `.krs` 側だけが分裂する） |
| style annotation selector（`@...`） | style-parser.ts:294 | 同上、分裂しない |
| legend `ref` 対象（`[tag]` / `@anno`） | `parseLegendRefTarget` | `expect(RightBracket)` が `-` で失敗し parse error（loud だが kebab 名を参照できない — 実装時に判明、縫合対象に追加） |
| `facet` 宣言 / `facets` 参照 | `parseFacetBlock` / `parseFacetsList` | 名前直後に `{` / 行末を期待するため **parse error になり silent ではない** |

つまり「kebab-case を受け付ける」という約束に対し、capability だけが実装され、
`.krs` 側の tag / annotation / legend ref が適用漏れのまま残っている
（`.krs.style` 側は lexer がハイフンを識別子に含めるため最初から正しい —
このため `.krs` のタグと同綴りのセレクタが**永遠にマッチしない**という
TPL-1415 型の drift が字句レイヤーで起きている）。capability に stitching を
入れたとき他のポジションへ横展開しなかった、という**同一字句規則の適用漏れ**が
構造的な原因。

## 制約・前提

- **ADR-1314（v1.0 freeze）**: 「既存の妥当な `.krs` / `.krs.style` は v1.x の間
  parse し続ける」。stitching は parse 結果（タグ列）を変えるため、freeze との
  関係を明示的に決める必要がある。
- **ADR-2065 リスク台帳**: lifecycle 偽装 facet（`facet canary` 等）は明示的に
  禁止。#2510 の書き換え先を facet にする場合はこの線を越えないことを論証する。
- **ADR-2172 / TPL-2172**: builtin 語彙の追加は 3 問 gate（register / 既存表現 /
  停止規則）を通す。#2510 の書き換え先を builtin 追加要望にする場合はこの経路。
- **warn-don't-error**（ADR-1314 凍結面）: どの案でも parse error を新設しない。
- out of scope: 閉鎖（Syntax 2.0）そのものの是非・時期。本 doc は前提条件の
  再スコープまで。

## 論点 1（#2509）: hyphenated 名の字句解析

### 案1: kebab-case stitching を全ポジションに展開する

`parseClientCapability` の stitching（`<ident>-<ident>` の連なりを 1 名に縫合）を
tag / annotation 名 / style tag selector / style annotation selector に適用する。
`[my-team-internal-tag]` は 1 つのタグになる。

**メリット**

- spec の kebab-case 約束（capability 節）と acceptance 0064 §2b の記述に実装が
  一致する。**現状の 7 断片は誰も意図して書いた形ではない**ので、freeze の
  「妥当なファイルが parse し続ける」約束の下で bug fix として読める
  （ファイルは parse し続け、意図された解釈になる）。
- 閉鎖（v2.0）の警告カウントが正直になる: kebab-case タグ 1 つ = 警告 1 件
  （現状は 7 件、うち 3 件が `[-]` について）。
- parser 内に前例（capability）があり、実装パターンが確立している。
- `.krs` 側の tag と `.krs.style` 側の selector が同じ規則で縫合されるので、
  `[my-team]` タグに `my-team { }` selector が届く（TPL-1415: 同一語彙の
  複数表現は同じ入力に同じ結果を返す）。

**デメリット**

- 断片名を意図的に狙った `.krs.style` selector（例: `my { }` が断片 `my` に
  マッチしていた）は挙動が変わる。理論上の互換性リスクだが、断片は authored
  form ではないので実害はないと判断する。
- stitching は token 間の空白を見ない（capability の既存挙動と同じ）ため、
  `[a - b]` も `a-b` に縫合される。capability と同じ挙動に揃える。

### 案2: 分裂を診断で知らせる（lexer は変えない）

tag ポジションに `-` が現れたら「名前が分裂している」と警告する。parse 結果は
変えない。

**メリット**

- parse 結果が変わらないので freeze との緊張が一切ない。

**デメリット**

- kebab-case タグは書けないまま。spec の kebab-case 約束・acceptance 0064 との
  矛盾が恒久化し、それらの文書を「kebab-case は書けない」に書き換える必要が
  生じる（約束の縮小 = それこそ freeze が守るべき面の後退）。
- capability だけ kebab-case が書ける非対称が残る。

### 比較と方針

| 観点 | 案1: stitching | 案2: 診断のみ |
| --- | --- | --- |
| spec / AT との整合 | 一致する | 恒久的に矛盾（文書側を縮小） |
| freeze との関係 | bug fix として読める（要 ADR 記録） | 緊張なし |
| 閉鎖時の警告カウント | 1 タグ = 1 警告 | 7 警告のまま |
| capability との対称性 | 揃う | 非対称のまま |

**案1 を採用する（2026-08-16 確定）** — 現状の 7 断片 output は authored form ではなく、
spec と acceptance が既に kebab-case を約束している。実装を約束に合わせるのは
ADR-1314 の下で bug fix であり、v2.0 を要する破壊的変更ではない。この読みを
ADR に記録する（昇格時の本 doc の ADR がその記録になる）。

適用範囲は **silent fragmentation が起きる 4 箇所すべて**
（tag / annotation 名 / style tag selector / style annotation selector）。
1 箇所だけ直すと capability のときと同じ適用漏れを再生産する。stitching は
共有ヘルパーに切り出し、capability も同じヘルパーに乗せ替える。

縫合後も単独で残る `-`（`[my-]` の末尾など）は従来どおり `tag-not-builtin` を
出す（TPL-1503: 受理した語彙は効果を持つか警告する。bare `-` は builtin では
ないので既存診断がそのまま届く）。

## 論点 2（#2510）: onboarding §5.1 の書き換え先 register

§5.1 が教えたいのは「読み取り確信度（unverified / assumed）を first-class の
マークとして図に残し、style で目立たせ、grep で宿題リストにする」ワークフロー。
#2159 以降、custom annotation では deprecation warning が出る。書き換え先の候補:

### 案A: facet に書き換える

```krs
facet unverified {
  label "Unverified"
  description "Existence is a guess; confirm in the code"
}

domain Promotion {
  label "Promotion (guessed)"
  facets unverified
}
```

**メリット**

- 警告ゼロ。facet は宣言必須なので typo は `facet-not-declared` が拾う
  （custom annotation 時代には無かった安全性）。
- overlay 描画（ADR-2174）と `[facets=unverified]` selector（#2175）が既に
  あり、「低確信領域を一目で見せる」需要を style 込みで満たせる。#2175 は
  facet selector を「arbitrary-name tag selector の migration target」と
  明記しており、この書き換えはその設計意図の行使そのもの。
- ADR-2065 の lifecycle 禁止と衝突しない: 禁止されたのは **システムの**
  時間的状態（canary / sunset = runtime rollout）を facet に偽装すること。
  reading confidence は**モデルの忠実度**（地図と現地の対応）であって
  システムの状態ではない。「読みが未確認な要素の集合」は外在的な集合所属
  （extrinsic set membership）の定義に素直に収まる。
- grep 可能性は `facets unverified` の grep で従来同様に成立する。

**デメリット**

- annotation（1 語のインラインマーク）に比べ、facet は宣言ブロックが 1 つ
  必要で、書き味がやや重い（onboarding の「まず書き殴る」文脈では摩擦）。
- 「確信度」を集合所属と読むのは一段の抽象化で、lifecycle との境界線を
  ガイドで一文説明する必要がある。

### 案B: builtin annotation 追加を要望する（`@unverified` / `@assumed`）

ADR-2172 の経路で builtin 化を提案する。

**メリット**

- ガイドの現行コード例がほぼそのまま生きる。書き味が最軽量。

**デメリット**

- TPL-2172 の 3 問 gate に通りにくい。問1（register）: 既存 builtin annotation
  は**システムの** lifecycle（deprecated / new / experimental /
  migration_target）で、reading confidence は**モデルの**状態という別軸。
  軸を跨ぐ追加は register の意味を薄める。問2（既存表現）: 案A の facet が
  既存表現としてそのまま使える時点で「既存表現で書けない」を満たさない。
  `@canary` の却下（別軸のものを annotation register に足さない）と同型。
- 2 語彙（unverified / assumed）で止まる保証がなく、確信度の段階が増えるほど
  builtin 要望が続く（停止規則の観点でも弱い）。

### 案C: custom annotation のまま、警告を明示して教える

「この書き方は warning が出る。warning は宿題リストの一部」と書き換える。

**メリット**

- コード例の変更が最小。

**デメリット**

- ガイドが deprecation 済みの形を新規ユーザーに推奨し続けることになり、
  #2159 の決定と実質的に矛盾したまま。警告パネルに deprecation warning と
  本物の警告（unassigned-resource 等）が混ざり、「警告 = 宿題」の読みが濁る。
- `.krs.style` の annotation selector も `style-annotation-selector-not-builtin`
  を出し続け、style 面の回避策がない。

### 比較と方針

| 観点 | 案A: facet | 案B: builtin 要望 | 案C: 現状+注記 |
| --- | --- | --- | --- |
| 警告 | ゼロ | ゼロ（採択時） | 出続ける |
| ADR-2065/2172 との整合 | 整合（論証つき） | gate に通りにくい | 決定と実質矛盾 |
| style での可視化 | overlay + facet selector | annotation selector | deprecated selector |
| 書き味 | 宣言 1 ブロック必要 | 最軽量 | 最軽量 |
| typo 安全性 | `facet-not-declared` | `annotation-possible-typo` | 距離が遠いと沈黙 |

**案A を採用する（2026-08-16 確定）** — #2175 が facet selector を migration target と
明記した時点で、arbitrary-name 語彙の受け皿は facet と決まっている。reading
confidence は「モデルの忠実度を表す集合所属」であり、ADR-2065 が禁止した
lifecycle 偽装（システム状態の facet 化）には当たらない。この境界の論証は
昇格 ADR に記録する。§5.1 は facet ベースで書き直し、`docs/acceptance/0064`
§2b / `0068` は論点 1 の決定後の診断挙動（kebab-case タグ 1 つ =
`tag-not-builtin` 1 件）を記述する。

## 論点 3（#2511）: 閉鎖前提条件 1 の再スコープ

#2511 の提案をそのまま採用する（counts は残す・names は gate から外し
ADR-2172 の builtin 追加経路に委ねる）。根拠は Issue 本文に確定済みで、
本 doc で追加の選択肢比較はしない。

決めるのは記録の置き場だけ: Issue は「閉鎖時 ADR に載せるか、roadmap 編集を
待たせたくなければ先に出す」としている。**本 doc の昇格 ADR に載せて今回
出す**（roadmap 編集は #2511 の実装 PR で行い、その根拠 ADR を同時に残す。
2026-08-16 確定）。census という証拠と再スコープの決定が同じ ADR に並ぶのが
最も追いやすい。

## 実装の指針（スライス）

| スライス | 前提 | 内容 |
| --- | --- | --- |
| **A** #2509 fix | — | stitching 共有ヘルパー + 4 箇所適用 + capability の乗せ替え。regression test（tag / annotation / 両 selector / capability）。changeset（`@karasu-tools/core` + `karasu`, patch）。TPL 起票（下記） |
| **B** #2510 docs | A | §5.1 を facet ベースに書き換え（en / ja）、acceptance 0064 §2b / 0068 を A 後の診断挙動に更新。census で drift ゼロを確認 |
| **C** #2511 roadmap | — | roadmap §閉鎖の前提条件 1 を counts のみに書き換え |

- A と C は独立に出荷できる。B は A の決定（タグが 1 つに縫合される）を文面が
  参照するため A の後。
- 検証: `pnpm census:vocabulary examples packages/vscode-e2e/fixtures --docs` が
  非 builtin 名を意図的なデモサイト（`docs/spec/style.md` /
  `docs/spec/tags-annotations.md`）以外から報告しないこと（#2510 acceptance）。
- TPL: 「kebab-case 識別子を受けるポジションは 1 つの字句ヘルパーを共有する」
  観点を実装 PR で retrospective TPL として起こす（3-Yes: capability→tag の
  適用漏れという再発が実際に起きた / 名前ポジションの追加で再発しうる /
  TPL-1415（データ表現の drift）にも TPL-1281（keyword 両義性）にも未掲載）。
- ADR 昇格: 実装完了後、`docs/adr/2522-vocabulary-census-drift.md` として昇格し
  本 doc は同 PR で削除。ADR には (1) stitching の freeze 適合の読み、(2) facet
  と lifecycle の境界論証、(3) 前提条件 1 の再スコープ、を記録する。

## 影響範囲・マイグレーション

- 既存ユーザーへの影響: hyphenated tag / annotation を書いていたファイルは
  分裂が直り、警告が「断片 n 件」から「名前 1 件」に減る。断片名を狙った
  style selector だけが理論上の非互換（authored form ではないため受容）。
- ドキュメント更新: `docs/guide/02-onboarding.md` / `.ja`（§5.1）、
  `docs/acceptance/0064` / `0068`、`docs/roadmap.md`、
  `docs/spec/tags-annotations.md`（tag 名の字句規則を明文化 — TPL-2133:
  parser が受理する形は spec に書く）
- テスト・examples への影響: examples は非 builtin 名ゼロ（census 実測）の
  ため影響なし。regression test を parser / style-parser に追加。

## 未解決の問い

なし — 3 論点とも 2026-08-16 のレビューで上記のとおり確定した。
