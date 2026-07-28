# tag と concern の分離 — 内在的分類の open set 正式化と、横断的関心事の専用 construct

- **日付**: 2026-07-28
- **ステータス**: 検討中
- **Issue**: [#2065](https://github.com/kompiro/karasu/issues/2065)
- **PR**: [#2155](https://github.com/kompiro/karasu/pull/2155)
- **関連**:
  - 引き金 Issue: [#2065](https://github.com/kompiro/karasu/issues/2065)（#2036 / boundary cross-layer 議論からの分離）。実測エビデンス: [#2079](https://github.com/kompiro/karasu/issues/2079)（friction 3 — 多値 facet は boundary の 1:1 で表現不能 → 本設計の concern 側へ）
  - 関連 ADR: [ADR-832](../adr/832-no-runtime-authz-modeling.md)（**本設計が refine を提案する対象** — 再検討条項を自ら持つ）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（横断的関心事とタイポ検出を #2065 へ carve-out）、[ADR-1974](../adr/1974-boundary-declaration-syntax.md) / [ADR-1858](../adr/1858-system-view-group-by-team.md)（boundary = view 内 peer グルーピング、`boundaryIndex` 1:1 first-wins）、[ADR-834](../adr/834-security-companion-document.md)（脅威モデリングは companion doc — 本設計は再訪しない）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（新 notation は experimental で着地）、[ADR-999](../adr/999-legend-in-use-fallback.md)（legend の user-defined tag フォールバック）
  - 関連 Issue: [#2088](https://github.com/kompiro/karasu/issues/2088)（`owns` の cross-layer addressing — concern の `contains` と解を共有しうる）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（受理語彙の 3 状態規律 — 現状の user-defined tag は禁止された第 4 状態）、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)、[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)、[TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md)
  - コード: `packages/core/src/parser/parser.ts:1578`（`parseTags`）、`packages/core/src/builtins/reference-data.ts:262`（builtin `TagInfo` 17 種）、`packages/core/src/resolver/warnings.ts:213`（`detectAnnotationPossibleTypos` — tag 側 typo hint の雛形）、`packages/core/src/resolver/style-resolver.ts:433`（タグセレクタ照合 — 任意タグで既に動作）

## 背景・課題

#2065 は 2 つの必要を 1 つの前提で束ねていた: 「横断的関心事（PCI・residency・trust zone）の
受け皿が無い」と「user-defined tag の第一級機構が無い」を、「横断的関心事 = tag family」という
割り当てで接続していた。本設計はこの割り当てを**却下**し、役割を分離する。

Issue 自身が一度目の category 訂正（`@pci` は annotation ではない — annotation は lifecycle/state）を
経ているが、同じ検査を tag に適用すると**二度目の訂正**が必要になる:

- **tag `[...]` は「その要素がアーキテクチャ上何であるか」— 要素に内在する分類**。この役割は
  spec が既に与えている（`[external]` = 境界に対する位置、`[index]` = table の役割、form-factor =
  client の表面種別、shape = resource の種別）。[ADR-832](../adr/832-no-runtime-authz-modeling.md) も
  中間案却下で同じ定義を明文化している — 「タグは『これは何の kind か』… 混ぜると概念のホームを
  侵食する」。
- **横断的関心事は「外部フレーム（規制・ポリシー）が定義した集合への所属」— 要素に外在する属性**。
  database は PCI スコープに入っていようがいまいが database であり、PCI 性はアーキテクチャの
  外から課される。

同居させた場合のデメリット（設計議論 2026-07-28 で整理）: register の混濁（分類と所属が 1 つの
リストに混ざる）／正しさのセマンティクスの潰れ（concern の「不在」は「スコープ外」か「未評価」か
区別できず、9 割しか付いていない `[pci]` の図が監査文脈で偽の保証になる）／recognized 集合の将来
拡張（`[cache]` builtin 候補）が user の concern タグの意味を黙って変える前方互換ハザード／concern
が欲しがるメタデータ（owner・policy link・明示的除外）の圧力が単純な tag 構文を侵食する。

**よって**: tag は内在的分類のまま正式化し（Part A）、横断的関心事には専用 construct `concern` を
与える（Part B）。

### tag 側の現存する穴（Part A の動機 — concern と独立に実在する）

probe 実測（2026-07-28、main `05fa294d`）: builtin 外のタグ（例 `[cache]`）は**全 kind で診断ゼロで
受理され、何の効果も持たない**。spec の記述は client 限定の 1 文のみ（`tags-annotations.md:32`、
backing ADR なし）で実挙動と不一致 —
[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) が
禁ずる「受理・無効果・open set 文書化なし」の第 4 状態が現存する。一方 styling（タグセレクタは
任意タグで generic に照合）と legend（ADR-999 フォールバック）は宣言ゼロで既に動く（実測）。
typo 対策は annotation 側にのみあり、`[extenal]` は黙って inert な別タグになる。

### concern 側の要求の解剖 — 実例分析（認証・RBAC・PCI）

3 例を karasu の語彙にマップした結果:

| 関心事の成分 | 実体 | 受け皿 |
| --- | --- | --- |
| コンポーネント scope 集合（PCI CDE の service / store、residency 処理系） | 外在的集合所属 | **`concern`**（Part B） |
| データ分類（PII を含む entity、CHD を持つ table） | データに**内在する**性質 | tag（Part A の分類 register） |
| ポリシーの**適用範囲**（どの usecase が認証必須か、どの振る舞いが制限付きか） | 外在的集合所属 | **`concern`**（Part B — ADR-832 の refine を伴う。下記） |
| ポリシーの**ルール内容**（誰が・どの条件で呼べるか — role×plan×条件式） | 実行時ルール | ADR-832 どおり prose + `link`（**維持** — concern に式言語は入れない） |

member の現実の分布: PCI 監査対象は service / infra ブロック（トップ tier）+ table。認証・制限の
適用範囲は usecase 集合。domain（論理区画 — 監査対象はそれを実装する service）と resource
（要素でなく参照サイト）は member にならない。「全 depth に同時に散らばる」集合は 3 例に無く、
**concern の正当化根拠は cross-depth 性ではなく register**（外在的所属 + 多重所属 + 監査リスト +
メタデータの置き場）である。

### 受け皿の消去法 — なぜ既存 construct では駄目か

- **tag**: 上記の同居デメリット。
- **annotation**: lifecycle/state（Issue の一度目の訂正で確定済み）。
- **boundary**: (1) `boundaryIndex` は 1:1 first-wins — Billing が PCI と EU-residency の両方に
  入れない（多重所属は concern の本質的要求）。 (2) 枠は *Group by: boundary* 選択時のみ描かれ、
  team 軸や意味的クラスタリングと**排他** — concern はどの view 状態でも重畳できる overlay で
  あるべき。 (3) register — boundary = view 内 peer グルーピング（ADR-1974/2036）。

## ADR-832 の再検討 — 何を維持し、何を改めるか

concern が「集合所属」を第一級にする以上、ADR-832 が prose に退避させた「どの振る舞いがポリシーの
適用範囲か」は再検討の対象になる。回避せず正面から扱う。手続き上の根拠は **ADR-832 自身の再検討
条項** — 「『図だけで authz 境界を判断したい』需要が顕在化し、かつ validate / codegen への
滑り落ちを構造的に防ぐ設計（語彙を凍結する仕組み等）が別途確立されたら、supersede する新 ADR で
再検討する余地は残す」。

**再検討の鍵となる区別**: ADR-832 が却下したのは **ルール言語**（`requires plan in [...]` 述語・
`user_attributes` 宣言・`policy` ブロック）であり、その理由（validate → codegen の重力、述語式の
tar pit 化、動的関心事の抽象度違反）はすべて**式・属性・照合**に由来する。一方「**適用範囲**
（どの usecase がこのポリシーに覆われているか）」は集合であり、式を含まない。832 の検討時点では
set construct が存在せず（boundary は 2 ヶ月後）、範囲の表現は per-element 属性（却下）か prose か
の二択しかなかった — **範囲を集合として書く選択肢は評価されていない**。

| ADR-832 の決定要素 | 本設計での扱い |
| --- | --- |
| `requires` 述語・属性宣言・policy ブロックの不採用 | **維持** — concern の文法は id + label / description / link / contains（+ 将来 excludes）で**閉じ、値言語を持たない**。これが再検討条項の求める「滑り落ちを構造的に防ぐ設計 = 語彙の凍結」に相当する |
| ルール内容は prose + 外部 policy doc への `link` | **維持** — ただし置き場が per-usecase の description から **concern ブロックの description / link に集約**される（同じ register のまま locality が改善） |
| 適用範囲も prose でしか書けない | **改める** — `concern requires_auth { contains PlaceOrder … }` として範囲を第一級化。overlay で「認証境界」が図から読め、範囲の差分がレビューできる |
| validate / codegen への非滑落 | **維持** — concern から検証できるのは member id の存在のみ（boundary `contains` と同じ）。「member が実際に認可を強制しているか」はモデル内に真偽の根拠が無く、バリデータの書きようがない — 滑り台の入口が構造的に存在しない |
| ADR-823 予約語彙（`requires` / `policy` 等）は衝突回避予約のまま | **維持** — concern はこれらの語を使わない |

実装 ADR では `refines: [ADR-832]` として関係を明示する（832 の中核決定は存続し、「範囲の表現」
という一断面のみを specialize するため。supersede は過剰）。

## 制約・前提

- **v1.0 freeze（ADR-1314）**: bare `[foo]` の受理は不変。新診断・既存解釈を変えない新構文は
  v1.x additive。
- **promotion gate（ADR-1820）**: `concern` は新 notation なので **experimental で着地**。追加動機は
  register の欠落の是正（concern に正当な置き場が無く tag への誤用が構造的に誘発される状態の解消）
  — ADR-2036 が採った「定義の整合」型の正当化と同型。
- **多値性**: concern は複数ブロックが同じ node を `contains` できる（1:N）。boundary の 1:1 は
  開閉フレームの構造的要件だったが、concern はフレームを描かないので制約の理由が無い。
- **ADR-834（脅威モデリング = companion doc）は再訪しない**。本設計が扱うのは範囲の宣言までで、
  脅威・攻撃面の分析は対象外のまま。
- out of scope: annotation の変更、boundary の変更、タグの kind 制限、ルール言語（上記のとおり恒久的に）。

## Part A — user-defined tag の open set 正式化（新構文ゼロ）

tag を annotation と同じ「open set」として正式化する。**定義は「内在的分類」に限定**し、横断的
関心事の受け皿としては位置づけない（concern へ誘導する）。

1. **spec**: `tags-annotations.md`（+ ja）に「User-defined tags（open set）」節を新設 — builtin
   集合の外のタグは全 kind で許容される user-defined の**分類** tag（役割分類 `[cache]` `[bff]`、
   データ分類 `[pii]` 等）。効果は `.krs.style` タグセレクタと legend（ADR-999）。client 限定の
   1 文（`:32`）を置換。TPL-20260610-01 の第 4 状態を状態 (3) で解消し、双方向 back-ref を同 PR で。
2. **`tag-possible-typo`（info）**: `detectAnnotationPossibleTypos` の鏡写し。builtin 17 種への
   near-miss を hint、**style タグセレクタまたは legend `ref [tag]` の存在で抑制**（どちらも意図の
   証跡。annotation の style-only 先例より 1 条件広い — legend はタグの意味の文書化行為。spec に
   非対称の理由を明記）。
3. **register ガイド**: `tags-annotations.md` + notation cookbook に**四分法**を明記 —
   boundary = view 内 peer グルーピング / annotation = lifecycle・state / tag = 内在的分類 /
   concern = 外在的集合所属。PCI と認証を例に分解（コンポーネント scope → concern、データ分類 →
   tag、ルール内容 → prose + link）を示す。
4. changeset: core+karasu minor（新診断）。roadmap の `[cache]` watch（recognized 層への昇格候補）は
   独立のまま。

## Part B — `concern` construct（experimental）

```krs
concern pci {
  label "PCI scope"
  description "Cardholder data environment (CDE) — PCI DSS audit boundary"
  link "https://example.com/policies/pci" "PCI policy"
  contains Billing
  contains CardVault
}

concern requires_auth {
  label "Authenticated access"
  description "Usecases behind login. Who may call them is defined in the IAM policy."
  link "https://example.com/policies/iam" "IAM policy"
  contains PlaceOrder
  contains ViewOrders
}
```

- **top-level 宣言・by-reference**（`organization` / top-level `boundary` と同族）。membership が
  1 箇所に集約されることは concern では**利点** — リスト自体が監査成果物であり、レビュー・差分
  追跡の単位になる（boundary で欠点だった集中化の反転）。
- **文法は閉じている（値言語なし）**: `label` / `description` / `link` / `contains <id>` のみ
  （+ 将来 `excludes <id>` — 「評価済み・対象外」の明示的否定。tag では不可能だった tri-state の
  置き場）。式・条件・属性は**恒久的に入れない**（ADR-832 維持部分）。
- **多重所属（1:N）**: `concernIndex` は `Map<nodeId, Set<concernId>>`。
- **member の解決**: 宣言済み id を merged 空間で検証（`contains-target-not-found` 同型、
  TPL-20260718-02）。ガイド上の想定 member は **service / infra ブロック / table / entity /
  usecase**（domain と resource は上記の実例分析どおり member にならない）。kind のハード制限は
  設けない（未解決の問い (B1)）。
- **効果（TPL-20260610-01 — inert 禁止）**:
  1. **overlay 強調** — concern を選択すると member を強調（非 member を減光）。per-element の
     塗りなので **Group-by 状態と直交して重畳**でき、フレームと違い drill をまたいでも断片化
     しない。member が描かれる全 view で効く。
  2. **legend 自動掲出** — 宣言の `label` で凡例に出る（ADR-999 の機構に乗せる）。
  3. **概観** — 宣言ブロック自体が member 一覧。app 詳細パネル・将来の監査レポートの土台。
- **addressing**: member はトップ tier コンポーネント + データ要素 + usecase なので bare-id 衝突は
  boundary 時代より面が広い（usecase id は domain-local な同名がありうる — #2079 の GetChat）。
  曖昧 id の扱いは **#2088（`owns` の cross-layer addressing）と共通の解**を持つ — concern 単独で
  新記法を発明しない（未解決の問い (B2)）。
- fmt round-trip（TPL-20260510-02 — top-level 配列由来の網羅性ガード + round-trip テスト）、
  import-resolver merge、diagnostics（`duplicate-concern-id` 等）/i18n 一式は boundary slice A の
  実装パターンを踏襲。

## 比較（却下案との対照）

| 観点 | tag に同居（却下） | boundary に充当（却下） | prose のみ（ADR-832 現状） | **concern（採用）** |
| --- | --- | --- | --- | --- |
| register | 分類と所属が混濁 | view グルーピングと所属が混濁 | 表現不能（散文） | 分離 |
| 多重所属 | ○（多値） | ×（1:1 first-wins） | — | ○（1:N） |
| 表示 | style 頼み | Group-by 軸と排他 | なし | overlay — view 状態と直交 |
| 監査リスト | 全モデル走査 | contains に集約 | 各 description に分散 | contains に集約 + メタデータ |
| 未評価との区別 | 不可 | 不可 | 不可 | `excludes` の置き場あり |
| ルール言語への滑落 | — | — | なし（利点） | **なし** — 文法が値言語を持たず閉じている |
| freeze / gate | additive | — | — | 新構文 → experimental |

## Related TPLs

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) —
  Part A は現存する第 4 状態の解消。Part B の concern も inert 禁止（overlay + legend + 概観）。
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) —
  `tag-possible-typo` は info（示唆であり断定ではない）。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — `concern`
  ブロックは fmt round-trip 対象。
- [TPL-20260718-02](../test-perspectives/TPL-20260718-02-reference-existence-validated-on-merged-space.md) —
  `contains` の存在検証は merged 空間で。

## 現時点の方針

**tag と concern の役割を分離する。** tag は「アーキテクチャ上の意味（内在的分類）」という既存の
役割のまま open set として正式化し（Part A、新構文ゼロ）、横断的関心事は専用 construct `concern`
（Part B、experimental）が引き受ける。ポリシーの適用範囲は concern の集合として第一級化し
（ADR-832 の refine — 832 自身の再検討条項に基づく）、ルール内容は prose + link のまま維持する。
両 Part は同一の設計として確定し、実装順のみ A → B とする。

### 実装の指針

1. Part A: spec 節 + `tag-possible-typo` + 四分法ガイド + changeset（Part A の 1–4）。
2. Part B: `concern` 文法（parser / AST / `concernIndex` / resolver merge / fmt）→ overlay 表示
   （app selector + renderer）→ legend 掲出 → 診断。実装 Issue を #2065 から分割起票する。
3. AT: `docs/acceptance/2065-tags-and-concerns.md`。目視観点:
   - user-defined 分類 tag + style + legend の 3 点セットが app で意図どおり見えること
   - `[extenal]` の typo hint が出て、style セレクタ or legend ref で消えること
   - concern overlay が Group-by: team / boundary と**同時に**視認できること（排他でないことの目視）
   - `requires_auth` concern で認証境界が drill をまたいで読めること
4. ADR 昇格: 実装完了後 `docs/adr/2065-tags-and-concerns.md`（`refines: [ADR-832]`）として昇格し、
   本 doc を削除。ADR-832 側は書き換えない（refine は非破壊 — 832 の中核決定は存続）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（bare tag 受理は不変。追加は info 診断と新 construct のみ）。
- ドキュメント: `tags-annotations.md`+ja、`syntax.md`+ja（concern 節）、`diagnostics.md`+ja、
  notation cookbook、roadmap（concern を experimental watch に登録）。
- examples: 分類 tag + concern の feature-sample を検討。

## 未解決の問い / 決めないこと

- **(B1) concern の member kind をハード制限するか** — ガイド推奨（コンポーネント / データ要素 /
  usecase）に留めるか、domain / resource を診断で弾くか。
- **(B2) `contains` の曖昧 id の扱い** — #2088 と共通解（qualified 参照 or 曖昧時診断）。concern
  実装時点で #2088 が未決なら、当面は top-level boundary と同じ「全宣言 id 受理」で出荷し、
  addressing は #2088 に委ねる。
- **(B3) overlay の操作面** — app の concern selector の UI（複数 concern の同時表示・色割り当て）は
  実装 Issue で詰める。
- 決めないこと: `excludes` / owner / 伝播規則の実装（構文の置き場のみ確保）。ルール言語（恒久的に
  入れない — ADR-832 維持）。annotation への宣言機構の逆輸入。boundary の変更。`user.role` の
  存続可否（ADR-832 が別 Issue と定めた論点のまま）。旧案だった `tag` 宣言構文（registry）は
  concern が register を持ち去った後の残余価値が薄く、起こすとしても別 Issue。
