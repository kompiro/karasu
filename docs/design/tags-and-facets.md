# tag と facet の分離 — アーキタイプ tag の open set 正式化と、横断的関心事の facet construct

- **日付**: 2026-07-28
- **ステータス**: 検討中（骨格は決定済み — 下記「決定事項」）
- **Issue**: [#2065](https://github.com/kompiro/karasu/issues/2065)
- **PR**: [#2155](https://github.com/kompiro/karasu/pull/2155)
- **関連**:
  - 引き金 Issue: [#2065](https://github.com/kompiro/karasu/issues/2065)（#2036 / boundary cross-layer 議論からの分離）。実測エビデンス: [#2079](https://github.com/kompiro/karasu/issues/2079)（friction 3 — 多値 facet は boundary の 1:1 で表現不能 → 本設計の facet 側へ）
  - 関連 ADR: [ADR-832](../adr/832-no-runtime-authz-modeling.md)（**本設計が refine を提案する対象** — 再検討条項を自ら持つ）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（横断的関心事とタイポ検出を #2065 へ carve-out）、[ADR-1974](../adr/1974-boundary-declaration-syntax.md) / [ADR-1858](../adr/1858-system-view-group-by-team.md)（boundary = view 内 peer グルーピング、`boundaryIndex` 1:1 first-wins）、[ADR-834](../adr/834-security-modeling-stance.md)（脅威モデリングは companion doc — 本設計は再訪しない）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（新 notation は experimental で着地）、[ADR-999](../adr/999-legend-in-use-fallback.md)（legend の user-defined tag フォールバック）、[ADR-19](../adr/19-required-id-label-as-property.md)（id 必須 + label プロパティ — facet ブロックも従う）
  - 関連 Issue: [#2088](https://github.com/kompiro/karasu/issues/2088)（`owns` の cross-layer addressing — **facet の採用形はこれに依存しない**。下記「却下した形」）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理語彙の 3 状態規律 — 現状の user-defined tag は禁止された第 4 状態）、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)、[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)、[TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md)
  - コード: `packages/core/src/parser/parser.ts:1578`（`parseTags`）、`packages/core/src/builtins/reference-data.ts:262`（builtin `TagInfo` 17 種）、`packages/core/src/resolver/warnings.ts:213`（`detectAnnotationPossibleTypos` — tag 側 typo hint の雛形）、`packages/core/src/resolver/style-resolver.ts:433`（タグセレクタ照合 — 任意タグで既に動作）

## 決定事項（2026-07-28 レビューで確定）

1. **横断的関心事のために新しい構文を追加する。**
2. **tag / annotation は拡張しない** — どちらも既存の描画セマンティクスを持つ construct であり、
   横断的関心事を載せると描画への影響と register の混濁を避けられない。
3. **形は「宣言 + プロパティによる修飾」**: top-level の `facet` 宣言ブロック（メタデータの置き場）と、
   要素側の `facets` プロパティ（所属の記述）。boundary 型の by-reference（`contains`）は採らない。

```krs
facet pii {
  label "個人情報"
  description "取扱いは ADR-1421 に従う"
  link "https://…/adr/1421.md" "ADR-1421"
}

entity Order {
  table OrderDB.orders
  facets pii
}
```

## 背景・課題

#2065 は 2 つの必要を 1 つの前提で束ねていた: 「横断的関心事（PCI・residency・trust zone）の
受け皿が無い」と「user-defined tag の第一級機構が無い」を、「横断的関心事 = tag family」という
割り当てで接続していた。本設計はこの割り当てを**却下**し、役割を分離する。

Issue 自身が一度目の category 訂正（`@pci` は annotation ではない — annotation は lifecycle/state）を
経ているが、同じ検査を tag に適用すると**二度目の訂正**が必要になる:

- **tag `[...]` は「その要素がアーキテクチャ上何であるか」— 要素の**アーキタイプ**（kind の
  精緻化。UML の stereotype に相当）**。この役割は spec が既に与えている（`[external]` = 境界に
  対する位置づけ、`[index]` = table の役割、form-factor = client の表面種別、shape = resource の
  種別 — builtin 17 種はすべて「何であるか」を述べる）。[ADR-832](../adr/832-no-runtime-authz-modeling.md)
  も中間案却下で同じ定義を明文化している — 「タグは『これは何の kind か』… 混ぜると概念のホームを
  侵食する」。
  **用語ノート**: 本設計は当初この register を「分類」と呼んでいたが、「分類」は任意の切り口の
  仕分け（PCI 所属で仕分けることも「分類」）を含意し、まさに防ぎたい誤用を語のレベルで許して
  しまう。**アーキタイプ**は「要素が何であるか」に限定され、builtin 語彙の性質と一致する。
- **横断的関心事は「外部フレーム（規制・ポリシー）が定義した集合への所属」— 要素に外在する属性**。
  database は PCI スコープに入っていようがいまいが database であり、PCI 性はアーキテクチャの
  外から課される。「PII を含む」も同様 — 何が個人情報かは規制フレーム（GDPR 等）が定義する
  所属であって、entity のアーキタイプではない。

同居させた場合のデメリット（設計議論 2026-07-28 で整理）: register の混濁（アーキタイプと所属が
1 つのリストに混ざる）／正しさのセマンティクスの潰れ（所属の「不在」は「スコープ外」か「未評価」か
区別できず、9 割しか付いていない `[pci]` の図が監査文脈で偽の保証になる）／recognized 集合の将来
拡張（`[cache]` builtin 候補）が user の所属タグの意味を黙って変える前方互換ハザード／所属が
欲しがるメタデータ（owner・policy link・明示的除外）の圧力が単純な tag 構文を侵食する。
**tag / annotation はどちらも既存の描画セマンティクスを持つため、この方向の拡張自体を行わない**
（決定事項 2）。

### tag 側の現存する穴（Part A の動機 — facet と独立に実在する）

probe 実測（2026-07-28、main `05fa294d`）: builtin 外のタグ（例 `[cache]`）は**全 kind で診断ゼロで
受理され、何の効果も持たない**。spec の記述は client 限定の 1 文のみ（`tags-annotations.md:32`、
backing ADR なし）で実挙動と不一致 —
[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) が
禁ずる「受理・無効果・open set 文書化なし」の第 4 状態が現存する。一方 styling（タグセレクタは
任意タグで generic に照合）と legend（ADR-999 フォールバック）は宣言ゼロで既に動く（実測）。
typo 対策は annotation 側にのみあり、`[extenal]` は黙って inert な別タグになる。

### facet 側の要求の解剖 — 実例分析（認証・RBAC・PCI）

3 例を karasu の語彙にマップした結果:

| 関心事の成分 | 実体 | 受け皿 |
| --- | --- | --- |
| コンポーネント scope 集合（PCI CDE の service / store、residency 処理系） | 外在的集合所属 | **`facet`**（Part B） |
| データの規制所属（PII を含む entity、CHD を持つ table） | 外在的集合所属（何が PII/CHD かは規制フレームが定義） | **`facet`**（Part B）— entity/table のアーキタイプ（`[index]`、shape）は tag のまま |
| ポリシーの**適用範囲**（どの usecase が認証必須か、どの振る舞いが制限付きか） | 外在的集合所属 | **`facet`**（Part B — ADR-832 の refine を伴う。下記） |
| ポリシーの**ルール内容**（誰が・どの条件で呼べるか — role×plan×条件式） | 実行時ルール | ADR-832 どおり prose + `link`（**維持** — facet に式言語は入れない） |

所属の現実の分布: PCI 監査対象は service / infra ブロック + table。認証・制限の適用範囲は usecase
集合。domain（論理区画 — 監査対象はそれを実装する service）と resource（要素でなく参照サイト）は
通常対象にならない。「全 depth に同時に散らばる」集合は 3 例に無く、**facet の正当化根拠は
cross-depth 性ではなく register**（外在的所属 + 多重所属 + メタデータの置き場）である。

### 受け皿の消去法 — なぜ既存 construct では駄目か

- **tag / annotation**: 既存の描画セマンティクスを持ち、拡張しない（決定事項 2。上記デメリット）。
- **boundary**: (1) `boundaryIndex` は 1:1 first-wins — Billing が PCI と EU-residency の両方に
  入れない（多重所属は facet の本質的要求）。 (2) 枠は *Group by: boundary* 選択時のみ描かれ、
  team 軸や意味的クラスタリングと**排他** — facet はどの view 状態でも重畳できる overlay で
  あるべき。 (3) register — boundary = view 内 peer グルーピング（ADR-1974/2036）。

## ADR-832 の再検討 — 何を維持し、何を改めるか

facet が「集合所属」を第一級にする以上、ADR-832 が prose に退避させた「どの振る舞いがポリシーの
適用範囲か」は再検討の対象になる。回避せず正面から扱う。手続き上の根拠は **ADR-832 自身の再検討
条項** — 「『図だけで authz 境界を判断したい』需要が顕在化し、かつ validate / codegen への
滑り落ちを構造的に防ぐ設計（語彙を凍結する仕組み等）が別途確立されたら、supersede する新 ADR で
再検討する余地は残す」。

**再検討の鍵となる区別**: ADR-832 が却下したのは **ルール言語**（`requires plan in [...]` 述語・
`user_attributes` 宣言・`policy` ブロック）であり、その理由（validate → codegen の重力、述語式の
tar pit 化、動的関心事の抽象度違反）はすべて**式・属性・照合**に由来する。一方「**適用範囲**
（どの usecase がこのポリシーに覆われているか）」は集合であり、式を含まない。832 の検討時点では
所属を書く construct が存在せず、範囲の表現は per-element 属性（却下）か prose かの二択しか
なかった — **宣言された facet への所属として書く選択肢は評価されていない**。

| ADR-832 の決定要素 | 本設計での扱い |
| --- | --- |
| `requires` 述語・属性宣言・policy ブロックの不採用 | **維持** — facet 宣言の文法は id + label / description / link で**閉じ、値言語を持たない**。要素側も `facets <id>` の id 参照のみ。これが再検討条項の求める「滑り落ちを構造的に防ぐ設計 = 語彙の凍結」に相当する |
| ルール内容は prose + 外部 policy doc への `link` | **維持** — 置き場が per-usecase の description から **facet 宣言の description / link に集約**される（同じ register のまま。ルールの本文は facet 宣言に 1 回書けばよい） |
| 適用範囲も prose でしか書けない | **改める** — `usecase PlaceOrder { facets requires_auth }` として範囲を要素側で第一級化。overlay で「認証境界」が図から読め、範囲の変更が要素の diff としてレビューできる |
| validate / codegen への非滑落 | **維持** — facet から検証できるのは「参照先の facet が宣言されているか」のみ。「member が実際に認可を強制しているか」はモデル内に真偽の根拠が無く、バリデータの書きようがない — 滑り台の入口が構造的に存在しない |
| ADR-823 予約語彙（`requires` / `policy` 等）は衝突回避予約のまま | **維持** — facet はこれらの語を使わない |

実装 ADR では `refines: [ADR-832]` として関係を明示する（832 の中核決定は存続し、「範囲の表現」
という一断面のみを specialize するため。supersede は過剰）。

## 所属モデルの一般化 — 1:N を model 層の原則にする（boundary への波及）

facet の 1:N を設計する過程で、boundary の 1:1 の根拠を再確認した（設計議論 2026-07-28）。
[ADR-1974](../adr/1974-boundary-declaration-syntax.md) の記録は「**開閉フレームの識別子は
1 ノード 1 値**」（collapse は 1 stub、banded 配置は 1 band — TPL-20260624-02 の全要素ちょうど
一度配置）であり、かつ同 ADR は「**多重所属は許容し、precedence で primary を選ぶ**」と明記して
いる。つまり 1:1 は**配置の制約であって所属の制約ではない** — 現実装はビュー機構の要件を
`boundaryIndex` の導出に焼き付け、first-wins で残りの所属情報を捨てている（レイヤ違反）。

**原則**: 所属は model 層で **1:N**（boundary / facet 共通）。各ビューが必要な解決を行う:

| ビュー | 解決 |
| --- | --- |
| banded Group-by（boundary の描画モード） | **primary = first-declared** で配置・collapse — 今日の first-wins と同一なので既存の見た目は不変。`duplicate-boundary-assignment`（info）は「banded view は primary をフレームする」という事実の register に文言を改める |
| overlay（facet の描画モード） | full membership（複数 facet の重畳。色・重ねの詳細は (B3)） |
| metadata パネル / legend / 監査・export | full membership |

同一ビューで複数所属を**同時に**見せられるのは overlay 側だけである点に注意 — banded view は
N 所属でも配置は 1 箇所なので、#2079 friction 3（複数 facet の同時可視化）は facet の受け持ち。
boundary 側の index 一般化（full membership の保持 + banded 解決の分離）は **ADR-1974 の refine**
に当たり（experimental なので可能）、実装は follow-up Issue に切り出す。

## 制約・前提

- **v1.0 freeze（ADR-1314）**: bare `[foo]` の受理は不変。新診断・既存解釈を変えない新構文は
  v1.x additive。
- **promotion gate（ADR-1820）**: `facet` は新 notation なので **experimental で着地**。追加動機は
  register の欠落の是正（所属に正当な置き場が無く tag への誤用が構造的に誘発される状態の解消）
  — ADR-2036 が採った「定義の整合」型の正当化と同型。
- **既定描画への影響ゼロ**: facet を付けても**既定の描画は変わらない**（tag / annotation を
  拡張しない理由が、そのまま facet の設計制約になる）。効果はすべて opt-in（overlay 選択・
  legend・パネル）。
- **多値性**: 要素は複数の facet に所属できる（`facets` は複数 id を取る）。
- **ADR-834（脅威モデリング = companion doc）は再訪しない**。本設計が扱うのは範囲の宣言までで、
  脅威・攻撃面の分析は対象外のまま。
- out of scope: annotation の変更、boundary の変更、タグの kind 制限、ルール言語（恒久的に）。

## Part A — user-defined tag の open set 正式化（新構文ゼロ）

tag を annotation と同じ「open set」として正式化する。**定義は「アーキタイプ（要素が何であるか）」
に限定**し、横断的関心事の受け皿としては位置づけない（facet へ誘導する）。

1. **spec**: `tags-annotations.md`（+ ja）に「User-defined tags（open set）」節を新設 — builtin
   集合の外のタグは全 kind で許容される user-defined の**アーキタイプ** tag（例: `[cache]`
   `[bff]` `[gateway]` `[saga]` — builtin 語彙が覆っていない「何であるか」）。効果は `.krs.style`
   タグセレクタと legend（ADR-999）。client 限定の 1 文（`:32`）を置換し、**「所属（PCI・PII 等）は
   tag で書かない — facet へ」を同節に明記**。TPL-20260610-01 の第 4 状態を状態 (3) で解消し、
   双方向 back-ref を同 PR で。
2. **`tag-possible-typo`（info）**: `detectAnnotationPossibleTypos` の鏡写し。builtin 17 種への
   near-miss を hint、**style タグセレクタまたは legend `ref [tag]` の存在で抑制**（どちらも意図の
   証跡。annotation の style-only 先例より 1 条件広い — legend はタグの意味の文書化行為。spec に
   非対称の理由を明記）。
3. **register ガイド**: `tags-annotations.md` + notation cookbook に**四分法**を明記 —
   boundary = view 内 peer グルーピング / annotation = lifecycle・state / tag = アーキタイプ /
   facet = 外在的集合所属。PCI と認証を例に分解（scope 集合・規制所属 → facet、アーキタイプ →
   tag、ルール内容 → prose + link）を示す。
4. changeset: core+karasu minor（新診断）。roadmap の `[cache]` watch（recognized 層への昇格候補）は
   独立のまま。

## Part B — `facet` construct（experimental）

**宣言**（top-level、`organization` / `boundary` と同族の宣言ブロック。ADR-19 どおり id 必須 +
プロパティ）と、**要素側プロパティ**（`facets` — 宣言済み facet への所属）の 2 部構成。

```krs
facet pii {
  label "個人情報"
  description "取扱いは ADR-1421 に従う"
  link "https://…/adr/1421.md" "ADR-1421"
}

facet requires_auth {
  label "認証必須"
  description "ログイン後にのみ到達可能な usecase。誰が呼べるかは IAM policy が定める"
  link "https://…/policies/iam" "IAM policy"
}

system Shop {
  service Checkout {
    domain Ordering {
      usecase PlaceOrder { facets requires_auth }
      entity Order {
        table OrderDB.orders
        facets pii
      }
    }
  }
  database OrderDB {
    facets pii
  }
}
```

- **宣言ブロックは所属リストを持たない**（`contains` なし）。文法は `label` / `description` /
  `link` のみで閉じ、値言語を持たない。
- **所属は要素側の `facets` プロパティ**で書く。複数所属は `facets pii, gdpr`（カンマ区切り、
  プロパティの繰り返しも可・マージ。`fmt` が正規化）。所属が**要素の隣に書ける**ため、#2079 が
  boundary の by-reference で報告した locality 問題（rename のたびに遠くのリストを直す）が
  構造的に起きない。
- **参照は facet id のみ — addressing 問題が存在しない**: `facets pii` が参照するのは top-level の
  facet 宣言（平坦な id 名前空間）であって、ノード id ではない。boundary `contains` / `owns` が
  抱える cross-layer のノード addressing（#2036 / #2088）はこの形には**原理的に発生しない**。
- **宣言必須 + typo 検出が閉じる**: 未宣言の facet への参照 `facets pcl` は warning
  `facet-not-declared`（merged 空間で検証 — TPL-20260718-02。multi-file では facet 宣言と参照が
  別ファイルにありうる）。宣言集合が「正」を与えるため、annotation / tag の near-miss hint と
  違い **user-defined 同士の typo も検出できる**。同一 id の facet 宣言の重複は error
  `duplicate-facet-id`（`duplicate-team-id` の雛形）。
- **多重所属（1:N）**: `facetIndex` は `Map<nodeId, Set<facetId>>`。多重所属は正常状態であり
  診断対象ではない（同一要素の `facets` に同じ id を二度書いた場合のみ冪等にマージ）。
- **効果（TPL-20260610-01 — inert 禁止。ただし既定描画は不変）**:
  1. **overlay 強調**（opt-in） — facet を選択すると所属要素を強調（非所属を減光）。per-element の
     塗りなので **Group-by 状態と直交して重畳**でき、drill をまたいでも断片化しない。
  2. **legend 掲出** — 宣言の `label` で凡例に出せる（ADR-999 の機構）。
  3. **概観** — 「facet pii の所属要素一覧」は model から**導出**する（app 詳細パネル・将来の
     監査レポート）。所属が要素側に分散する trade-off はこの導出ビューで受ける。
- fmt round-trip（TPL-20260510-02 — 宣言ブロックは top-level 配列由来の網羅性ガード、`facets`
  プロパティは per-node の round-trip テスト）、import-resolver merge、diagnostics/i18n 一式は
  boundary slice A の実装パターンを踏襲。

### 却下した形: by-reference（`facet <id> { contains <node-id> … }`）

本設計の前版が採っていた boundary 型の形。却下理由（決定事項 3 の根拠）:

- **locality** — 所属が要素から離れた top-level リストに集まり、#2079 friction 1（215 個の id を
  遠隔列挙、rename が非局所）の再来になる。
- **addressing の再輸入** — `contains <node-id>` はツリー全域への bare-id 参照であり、#2036 が
  boundary で解体した曖昧性問題を、スコープ宣言という解が使えない形（cross-depth が存在意義）で
  再輸入する。#2088 と共通解を待つ依存が生まれる。採用形はこの依存ごと消す。
- **boundary との視覚的紛らわしさ** — `contains` を持つ top-level ブロックがもう 1 種類増えると、
  view グルーピング（boundary）と所属（facet）の register 分離が構文面で読み取りにくくなる。
- 集中リストの監査価値は導出ビュー（概観）で代替できる — 元データの置き場と閲覧形は独立に選べる。

### 命名: `facet` vs `concern`

**`facet` を推奨**（最終確定はレビューで）。理由: (1) faceted classification（多軸の直交ラベリング）
の含意が多重所属の設計と正確に一致する。(2) `concern` は AOP / セキュリティ寄りの含意が強く、
trigger 種別・CRUD・sub-feature のような中立的な facet（#2079 friction 3 の実例）も同じ機構で
扱えることが語から読み取りにくい。(3) #2079 自身がこの要求を "facet" の語で報告している。
却下済み語彙（`namespace` / `cluster` / `partition` / `subsystem` — ADR-1858/1974）とも衝突しない。
横断的関心事（cross-cutting concern）は**概念名**として prose で使い続ける。

## 比較（却下案との対照）

| 観点 | tag に同居（却下） | boundary に充当（却下） | by-reference facet（却下） | prose のみ（ADR-832 現状） | **宣言 + プロパティ facet（採用）** |
| --- | --- | --- | --- | --- | --- |
| register | アーキタイプと所属が混濁 | view グルーピングと所属が混濁 | 分離 | 表現不能（散文） | 分離 |
| 多重所属 | ○（多値） | ×（1:1 first-wins） | ○ | — | ○（1:N） |
| locality | ○（要素側） | ×（遠隔リスト） | ×（遠隔リスト） | ○（要素側 prose） | **○（要素側 + 宣言にメタデータ）** |
| addressing | — | ノード id 参照（#2036 の再来） | ノード id 参照（#2088 依存） | — | **無し（facet id 参照のみ）** |
| typo 検出 | builtin near-miss のみ | — | — | — | **宣言集合に対し完全** |
| 既定描画への影響 | あり（style/描画に接続） | あり（枠） | なし | なし | **なし（opt-in overlay のみ）** |
| freeze / gate | additive | — | 新構文 | — | 新構文 → experimental |

## Related TPLs

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) —
  Part A は現存する第 4 状態の解消。Part B の facet も inert 禁止（overlay + legend + 概観）。
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) —
  `tag-possible-typo` / `facet-not-declared` は事実 register（info / warning）。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — `facet` 宣言
  （top-level）と `facets` プロパティ（per-node — **ネスト構文なので top-level 配列由来の
  ガードでは守れない**）の両方が fmt round-trip 対象。
- [TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md) —
  `facet-not-declared` の存在検証は merged 空間で（宣言と参照は別ファイルにありうる）。

## 現時点の方針

**tag と facet の役割を分離する（決定事項 1–3）。** tag は「アーキテクチャ上の意味（アーキタイプ）」
という既存の役割のまま open set として正式化し（Part A、新構文ゼロ）、横断的関心事は宣言 +
プロパティ修飾の `facet` construct（Part B、experimental、既定描画への影響ゼロ）が引き受ける。
ポリシーの適用範囲は要素側 `facets` で第一級化し（ADR-832 の refine — 832 自身の再検討条項に
基づく）、ルール内容は facet 宣言の description / link に置く。実装順は A → B。

### 実装の指針

1. Part A: spec 節 + `tag-possible-typo` + 四分法ガイド + changeset（Part A の 1–4）。
2. Part B: `facet` 宣言 + `facets` プロパティの文法（parser / AST / `facetIndex` / resolver merge /
   fmt）→ 診断（`facet-not-declared` / `duplicate-facet-id`）→ overlay 表示（app selector +
   renderer）→ legend / 概観。実装 Issue を #2065 から分割起票する。
3. AT: `docs/acceptance/2065-tags-and-facets.md`。目視観点:
   - user-defined アーキタイプ tag + style + legend の 3 点セットが app で意図どおり見えること
   - `[extenal]` の typo hint が出て、style セレクタ or legend ref で消えること
   - facet overlay が Group-by: team / boundary と**同時に**視認できること（排他でないことの目視）
   - `requires_auth` facet で認証境界が drill をまたいで読めること
   - facet を付けても overlay 非選択時の描画が不変であること
4. ADR 昇格: 実装完了後 `docs/adr/2065-tags-and-facets.md`（`refines: [ADR-832]`）として昇格し、
   本 doc を削除。ADR-832 側は書き換えない（refine は非破壊）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（bare tag 受理は不変。追加は info/warning 診断と新 construct のみ。
  facet 非使用モデルの描画は不変）。
- ドキュメント: `tags-annotations.md`+ja、`syntax.md`+ja（facet 節）、`diagnostics.md`+ja、
  notation cookbook、roadmap（facet を experimental watch に登録）。
- examples: アーキタイプ tag + facet の feature-sample を検討。

## 未解決の問い / 決めないこと

- **(B1) `facets` プロパティを受ける kind の集合** — 全 node kind で受けるか（単純・一貫）、
  実例分析の想定（service / infra / table / entity / usecase）に合わせて guide 推奨に留めるか。
  決めるなら全 kind 列挙で確定する（TPL-20260623-02）。
- **(B3) overlay の操作面** — app の facet selector の UI（複数 facet の同時表示・色割り当て・
  多重所属要素の表現）は実装 Issue で詰める。boundary の banded view でも secondary 所属の示唆
  （バッジ等）を出すかを含め、多重所属の描画は boundary / facet **共通の課題**として扱う。
- **(B4) boundary 所属の 1:N 一般化の実装時期** — 原則は「所属モデルの一般化」のとおり確定するが、
  `boundaryIndex` の full membership 化（+ banded 解決の分離、ADR-1974 refine）を Part B と同時に
  やるか follow-up Issue にするか。
- **(B5) 「評価済み・対象外」の明示的否定** — by-reference 型では `excludes` が自然だったが、
  要素側プロパティ型での表現（記法・要否）は未決。監査系 facet で要求が実測されてから決める。
- 決めないこと: ルール言語（恒久的に入れない — ADR-832 維持）。annotation への宣言機構の逆輸入。
  boundary の変更。`user.role` の存続可否（ADR-832 が別 Issue と定めた論点のまま）。旧案の
  `tag` 宣言構文（registry）は facet が register を持ち去ったため不要。
