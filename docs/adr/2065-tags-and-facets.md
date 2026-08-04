---
id: ADR-2065
title: 語彙 register の確定 — tag / annotation をツール語彙に閉じ、facet を唯一のユーザー拡張点にする
status: accepted
date: 2026-08-04
topic: core-concepts
refines: [ADR-832]
depends_on: [ADR-1314, ADR-1820]
related_to: [ADR-19, ADR-823, ADR-834, ADR-999, ADR-1974, ADR-2036, ADR-2124, ADR-2161, ADR-2173, ADR-2174]
scope:
  packages: [core, app, i18n]
assumptions:
  - "grep: packages/core/src/types/ast.ts :: facetIndex"
  - "grep: packages/core/src/resolver/warnings.ts :: tag-not-builtin"
  - "grep: packages/core/src/resolver/warnings.ts :: detectStyleSelectorsNotBuiltin"
  - "file: packages/core/src/renderer/facet-overview.ts"
  - "file: docs/spec/syntax.md"
---

# ADR-2065: 語彙 register の確定 — tag / annotation をツール語彙に閉じ、facet を唯一のユーザー拡張点にする

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2065](https://github.com/kompiro/karasu/issues/2065)（program）。Part A [#2159](https://github.com/kompiro/karasu/issues/2159)、Part B [#2160](https://github.com/kompiro/karasu/issues/2160)（slice [#2173](https://github.com/kompiro/karasu/issues/2173) / [#2174](https://github.com/kompiro/karasu/issues/2174) / [#2175](https://github.com/kompiro/karasu/issues/2175) / [#2177](https://github.com/kompiro/karasu/issues/2177)）
  - 設計 PR: [#2155](https://github.com/kompiro/karasu/pull/2155)（2026-07-28 レビューで決定事項 1–5 を確定）
  - 実測エビデンス: [#2079](https://github.com/kompiro/karasu/issues/2079)（hato 21 domains / 215 usecases の人間工学報告 — friction 3「多値 facet は boundary の 1:1 で表現不能」）
  - **refine 対象**: [ADR-832](832-no-runtime-authz-modeling.md)（実行時 authz をモデル化しない）。832 自身の再検討条項に基づく
  - 実装 ADR: [ADR-2173](2173-facet-grammar-and-model.md)（文法・`facetIndex`・診断）、[ADR-2174](2174-facet-overlay.md)（overlay）
  - 前提: [ADR-1314](1314-krs-spec-v1-freeze.md)（v1.0 freeze）、[ADR-1820](1820-notation-promotion-gate.md)（experimental 着地）、[ADR-2124](2124-version-vocabulary.md)（版語彙）
  - spec: [`docs/spec/syntax.md`](../spec/syntax.md) §Cross-cutting membership、[`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) §Vocabulary registers、[`docs/spec/style.md`](../spec/style.md) §Facet selectors（すべて +ja）
  - AT: [`docs/acceptance/2065-tags-and-facets.md`](../acceptance/2065-tags-and-facets.md)
  - 設計過程: `docs/design/tags-and-facets.md`（本 ADR に昇格して削除）

## 背景

[#2065](https://github.com/kompiro/karasu/issues/2065) は 2 つの必要を 1 つの前提で束ねていた —
「横断的関心事（PCI・residency・trust zone）の受け皿が無い」と「user-defined tag の第一級機構が
無い」を、「横断的関心事 = tag family」という割り当てで接続していた。本設計はこの割り当てを
**却下**する。

Issue 自身が一度 category 訂正（`@pci` は annotation ではない — annotation は lifecycle）を
経ているが、同じ検査を tag に適用すると**二度目の訂正**が必要になる:

- **tag `[...]` は要素のアーキタイプ**（kind の精緻化。UML の stereotype に相当）。builtin 17 種は
  すべて「何であるか」を述べる。ADR-832 も中間案却下で同じ定義を明文化している。
- **横断的関心事は外部フレーム（規制・ポリシー）が定義した集合への所属** — 要素に**外在する**属性。
  database は PCI スコープに入っていようがいまいが database であり、PCI 性は外から課される。

同居させた場合の害: register の混濁／正しさのセマンティクスの潰れ（所属の「不在」が「スコープ外」か
「未評価」か区別できず、9 割しか付いていない `[pci]` の図が監査文脈で偽の保証になる）／recognized
集合の将来拡張が user の所属タグの意味を黙って変える前方互換ハザード／所属が欲しがるメタデータ
（owner・policy link）の圧力が単純な tag 構文を侵食する。

加えて tag 側には**独立に実在する穴**があった（probe 実測、main `05fa294d`）: builtin 外のタグは
全 kind で**診断ゼロで受理され、何の効果も持たない** —
[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) が禁ずる
第 4 状態（受理・無効果・open set の文書化なし）が現存していた。

## 決定

**語彙 register を 4 つに確定し、ユーザー拡張点を `facet` に一本化する。**

| register | 意味 | 語彙の所有者 |
| --- | --- | --- |
| `tag` `[...]` | 要素の**アーキタイプ**（何であるか） | ツール（v2.0 で closed） |
| `annotation` `@...` | **lifecycle**（いまどの段階か） | ツール（v2.0 で closed） |
| `facet` | **外在的集合への所属**（外部が定義した集合のどれに属するか） | **ユーザー**（唯一の拡張点） |
| `boundary` | **view 内 peer グルーピング**（どう見たいか） | ユーザー（view の都合） |

具体的には:

1. **横断的関心事のために新しい構文を追加する**（tag / annotation は拡張しない — どちらも既存の
   描画セマンティクスを持ち、載せると register が混濁する）。
2. 形は **「宣言 + プロパティによる修飾」** — top-level の `facet` 宣言ブロック（メタデータの置き場）
   と、要素側の `facets` プロパティ（所属の記述）。boundary 型の by-reference（`contains`）は採らない。
3. **`boundary` と `facet` を構文 2.0 の主軸**に据える。
4. **v2.0 で tag / annotation を closed set にする** — ツールが用意した語彙のみを受理する。
   v1.0-freeze が認めていた user-defined tag（および open annotation set）は v2.0 で終了する。
5. **v1.x では追加的な deprecation 診断で移行を始める** — `tag-not-builtin` /
   `annotation-not-builtin`（model 側、#2159）と `style-tag-selector-not-builtin` /
   `style-annotation-selector-not-builtin`（`.krs.style` 側、#2175）。

```krs
facet pii {
  label "個人情報"
  description "取扱いは社内のデータ取扱規程に従う"
  link "https://example.com/policies/personal-data" "データ取扱規程"
}

entity Order {
  table OrderDB.orders
  facets pii
}
```

`facet` は [ADR-1820](1820-notation-promotion-gate.md) に従い **experimental で着地**する。

## 理由

- **register の分離は tag 側の穴と独立に必要だった。** 所属に正当な置き場が無いと、tag への誤用が
  **構造的に誘発される**。ADR-2036 が採った「定義の整合」型の正当化と同型。
- **要素側 `facets` が locality を守る。** 所属が要素の隣に書けるので、#2079 が boundary の
  by-reference で報告した問題（rename のたびに遠くのリストを直す）が構造的に起きない。
- **addressing 問題が原理的に発生しない。** `facets pii` が参照するのは top-level の facet 宣言
  （平坦な id 名前空間）であって、ノード id ではない。boundary `contains` / `owns` が抱える
  cross-layer のノード addressing（#2036 / #2088）はこの形には現れず、#2088 との共通解を待つ依存も
  生まれない。
- **宣言必須なので typo 検出が閉じる。** 宣言集合が「正」を与えるため、annotation / tag の
  near-miss hint と違い **user-defined 同士の typo も検出できる**（`facets pcl` → `facet-not-declared`）。
- **既定描画への影響ゼロ。** tag / annotation を拡張しない理由が、そのまま facet の設計制約になる。
  効果はすべて opt-in（overlay 選択・facet セレクタ・legend・概観）。
- **多重所属（1:N）が model 層の原則。** `facetIndex` は `Map<nodeId, Set<facetId>>`。多重所属は
  正常状態であって診断対象ではない（entity は PII でも PCI スコープでもありうる）。この原則は
  boundary 側にも波及した（[ADR-2161](2161-boundary-membership-1n.md) が first-wins を撤回）。
- **閉鎖で失われる能力は無い。** open だったのは**名前空間と styling への素通しに限られ、意味論は
  最初から closed（ツール所有）だった** — spec 自身が「user-defined annotation はデフォルト描画を
  持たない」と明言し、probe 実測でも効果はゼロ。v2.0 の閉鎖が取り去るのは (a) 無警告の名前許容
  （→ warning で軟着陸）と (b) styling フック（→ **facet セレクタが引き継ぐ**、#2175）のみである。
  これが閉鎖シフトの安全性の根拠。

## ADR-832 の refine — 何を維持し、何を改めるか

手続き上の根拠は **ADR-832 自身の再検討条項**（「validate / codegen への滑り落ちを構造的に防ぐ設計
（語彙を凍結する仕組み等）が別途確立されたら、supersede する新 ADR で再検討する余地は残す」）。

**鍵となる区別**: ADR-832 が却下したのは**ルール言語**（`requires plan in [...]` 述語・
`user_attributes` 宣言・`policy` ブロック）であり、その理由（validate → codegen の重力、述語式の
tar pit 化、動的関心事の抽象度違反）はすべて**式・属性・照合**に由来する。一方「**適用範囲**
（どの usecase がこのポリシーに覆われているか）」は集合であり、式を含まない。832 の検討時点では
所属を書く construct が存在せず、**宣言された facet への所属として書く選択肢は評価されていない**。

| ADR-832 の決定要素 | 本 ADR での扱い |
| --- | --- |
| `requires` 述語・属性宣言・policy ブロックの不採用 | **維持** — facet 宣言の文法は id + `label` / `description` / `link` で**閉じ、値言語を持たない**。要素側も `facets <id>` の id 参照のみ。これが再検討条項の求める「滑り落ちを構造的に防ぐ設計 = 語彙の凍結」に相当する |
| ルール内容は prose + 外部 policy doc への `link` | **維持** — 置き場が per-usecase の description から **facet 宣言の description / link に集約**される（同じ register のまま） |
| 適用範囲も prose でしか書けない | **改める** — `usecase PlaceOrder { facets requires_auth }` として範囲を要素側で第一級化。overlay で認証境界が図から読め、範囲の変更が要素の diff としてレビューできる |
| validate / codegen への非滑落 | **維持** — facet から検証できるのは「参照先の facet が宣言されているか」のみ。「member が実際に認可を強制しているか」はモデル内に真偽の根拠が無く、バリデータの書きようがない — 滑り台の入口が構造的に存在しない |
| ADR-823 予約語彙（`requires` / `policy` 等） | **維持** — facet はこれらの語を使わない |

supersede ではなく refine とするのは、832 の中核決定が存続し、「範囲の表現」という一断面のみを
specialize するため。[ADR-834](834-security-modeling-stance.md)（脅威モデリングは companion doc）は
再訪しない。

## 却下した案

- **tag に同居させる**（`[pci]` を横断的関心事に使う）: register の混濁。所属の「不在」が
  「スコープ外」か「未評価」か区別できず、監査文脈で偽の保証を生む。builtin 集合の将来拡張が
  user の所属タグの意味を黙って変える。
- **boundary に充当する**: (1) `boundaryIndex` が当時 1:1 first-wins で、Billing が PCI と
  EU-residency の両方に入れない。(2) 枠は *Group by: boundary* 選択時のみ描かれ、team 軸と**排他**
  — facet はどの view 状態でも重畳できる overlay であるべき。(3) register が違う。
- **by-reference facet**（`facet pci { contains <node-id> }`）: locality を失い（#2079 friction 1 の
  再来）、cross-depth のノード addressing を再輸入して #2088 との共通解待ちの依存を作る。boundary
  との視覚的紛らわしさも増す。集中リストの監査価値は**導出ビュー**で代替できる（元データの置き場と
  閲覧形は独立に選べる）— これが #2177 の概観パネルである。
- **`concern` という名前**: AOP / セキュリティ寄りの含意が強く、trigger 種別・CRUD・sub-feature の
  ような中立的な facet も同じ機構で扱えることが語から読み取れない。`facet` は faceted classification
  （多軸の直交ラベリング）の含意が多重所属の設計と正確に一致する。横断的関心事（cross-cutting
  concern）は**概念名**として prose で使い続ける。
- **v1.x での open set 正式化**（旧案）: v2.0 で閉じるものを一度公式化することになり、corpus の
  lock-in を増やすだけ。解消先は「open set としての文書化」ではなく deprecation 診断 + v2.0 での閉鎖。
- **v2.0 の閉鎖を parse error にする**: 既存ファイルを壊す。enforcement は **warning に留める**
  （TPL-1503 の状態 (2) を v2.0 でも維持）。

## 閉鎖の弊害と緩和（リスク台帳）

| 弊害 | 対象 | 緩和 |
| --- | --- | --- |
| アーキタイプ拡張のレイテンシ — `[cache]` `[bff]` が builtin 追加のリリースサイクル待ちになる | tag | warning 運用なので「書けなくなる」ことはない。builtin 追加要望の経路を明文化（[TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md) の 3 問 gate） |
| **styling の退行** — 今日動く `[pci] { … }` / `@custom { … }` セレクタが剥がれると既存モデルの見た目が黙って壊れる | tag / annotation | **facet セレクタが引き継ぐ**（#2175）。specificity を同点（10）にしたので 1 ルールずつ移行できる |
| `concepts.md` の「タグシステム自体は open」原則との矛盾 | tag | v2.0 閉鎖の ADR で concepts 改訂を同時に行う（keystone 文書の単独更新はしない） |
| custom lifecycle 状態（canary / sunset）の逃げ道消滅 | annotation | 閉鎖前に corpus で実態を測る。実用されている custom 状態は閉鎖と同時に builtin 候補として評価 |
| 版スキューのノイズ — 新 builtin を使うモデルが旧ツールで警告 | tag / annotation | warning 運用で許容。診断メッセージにツール更新の示唆を含める |
| 生成パイプライン（reverse / translate / LLM）が自由語彙を出すと警告まみれ | tag / annotation | 裏返しの利点として運用 — hallucinated 語彙の検出器になる |
| **register 混濁の facet への移送** — `facet bff`（アーキタイプ偽装）/ `facet canary`（lifecycle 偽装）が facet 内で再生産されうる | facet | 構造的には防げない。宣言（description 必須の文化 + guide の四分法）で**意図が文書化される場所に誤用を移す**、と正直に位置づける |
| `capability`（client）の open set が原則の例外に見える | capability | **例外ではなく原則の帰結として open を維持**。閉鎖原則の定式化: **語彙の宇宙をツールが所有するものは閉じる（tag / annotation）、世界が所有するものは open のまま（capability = デバイス能力）** |

## 決めないこと

- **ルール言語**（恒久的に入れない — ADR-832 の中核は維持）。
- **明示的除外 / excludes の tri-state**（「評価済み・対象外」の表明）は**未実装のまま保留**。監査系
  facet で要求が実測されてから記法を決める。
- **lifecycle 系 facet は不許可**（register の再混濁を避ける）。custom lifecycle 状態の移行先は
  builtin 追加要望のみ。
- **v2.0 の閉鎖実施そのもの**は本 ADR の範囲外。実施時には ADR-1314（v1.0 freeze）との関係を新 ADR で
  明示する。適用状態は `docs/roadmap.md` §Syntax 2.0 プログラムが持つ。
