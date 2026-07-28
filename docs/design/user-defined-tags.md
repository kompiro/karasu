# user-defined tag の第一級化 — 横断的関心事の「boundary でも annotation でもない第三の道」

- **日付**: 2026-07-28
- **ステータス**: 検討中
- **Issue**: [#2065](https://github.com/kompiro/karasu/issues/2065)
- **PR**: (この PR)
- **関連**:
  - 引き金 Issue: [#2065](https://github.com/kompiro/karasu/issues/2065)（#2036 / boundary cross-layer 議論からの分離）。実測エビデンス: [#2079](https://github.com/kompiro/karasu/issues/2079)（friction 3 — usecase の多値 facet は boundary の 1:1 では表現不能 → 本設計へ回送）
  - 関連 ADR: [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（横断的関心事とタイポ検出を本 Issue へ carve-out した当事者）、[ADR-1974](../adr/1974-boundary-declaration-syntax.md) / [ADR-1858](../adr/1858-system-view-group-by-team.md)（タグを**グルーピング識別子として**却下 — 多値だから。本設計はその同じ性質を根拠に採る）、[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)（v1.0 freeze — 追加的変更の条件）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（新 notation は experimental で着地）、[ADR-999](../adr/999-legend-in-use-fallback.md)（legend の user-defined tag フォールバック — 凡例側は解決済み）
  - 関連 TPL: [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（**本件の核心** — 受理語彙の正当な状態は「効果を持つ / unknown 警告 / open set と文書化」の 3 つで、`[pci]` の現状「受理・無効果・未文書」は禁止された第 4 状態）、[TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（fact-vs-style register）、[TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（builtin タグ表と宣言レジストリを併置する場合の drift 柵）
  - コード: `packages/core/src/parser/parser.ts:1578`（`parseTags` — 無検証の文字列収集）、`packages/core/src/builtins/reference-data.ts:262`（builtin `TagInfo` 17 種 — docs/UI ミラーのみで検証非関与）、`packages/core/src/resolver/warnings.ts:213`（`detectAnnotationPossibleTypos` — 本設計が鏡写しにする機構）、`packages/core/src/resolver/style-resolver.ts:433`（タグセレクタ照合 — 任意タグで既に動作）

## 背景・課題

PCI スコープ・データレジデンシ・trust zone のような**横断的関心事**は、包含ツリーと直交する
per-element の architectural attribute であり、メンバは異なる深さに散在する。`boundary` は
同一キャンバスの peer を囲む view-level グルーピング軸なので、この用途には構造的に不適
（cross-depth boundary は view ごとに断片化 — [ADR-2036](../adr/2036-scoped-boundary-declaration.md) が
「tag の領分」として本 Issue に回送済み）。`@...` annotation は lifecycle/state であり別概念。
残る受け皿は **tag `[...]`** だが、karasu には user-defined tag の第一級機構が無い。

現状の具体的な症状（probe 実測、2026-07-28、main `05fa294d`）:

- `service Orders [pci]` は**全 kind で診断ゼロで受理**され、**何の効果も持たない**。
  spec の記述は「`client` では list 外のタグも許され ordinary user-defined tags として振る舞う」
  という 1 文のみ（`tags-annotations.md:32`、backing ADR なし）で、実挙動（全 kind で許容）とすら
  一致していない。これは [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
  が禁ずる「受理・無効果・open set 文書化なし」の**第 4 状態**そのもの。
- 一方で **styling は既に完全に到達可能**: `.krs.style` の `[pci] { background-color: … }` は
  宣言ゼロで `[pci]` 付きノードに適用される（セレクタ照合は任意タグで generic、実測で確認）。
- **legend も解決済み**: `ref [pci]` は builtin 塗りが無くても実使用があれば中立 swatch で
  凡例に出る（[ADR-999](../adr/999-legend-in-use-fallback.md) が将来の user-defined semantic tag を
  明示的に先回り）。
- annotation 側には typo 対策（`annotation-possible-typo` info + 「style セレクタが在れば意図的
  user-defined とみなし抑制」）があるが、**tag 側には無い**。`[extenal]`（`[external]` の typo）は
  黙って inert な別タグになる。

つまりギャップは描画でもスタイルでも凡例でもなく、**(a) 語彙の正当化**（open set の明文化 or
宣言機構）、**(b) typo 検出**、**(c) 発見可能性 / 概観**（「`[pci]` が付いた要素の一覧」）の 3 点に
限定される。

## 現状（インベントリ）

| 観点 | 現状 | 出典 |
| --- | --- | --- |
| parse | `parseTags()` は `[...]` を無検証で `tags: string[]` に収集。kind 制限なし | `parser.ts:1578-1593` |
| builtin 語彙 | `REFERENCE_DATA.tags` に 17 種（external / index / async / sync / human / ai / client form-factor 7 種 / shape 4 種）。**docs・Reference UI のミラー専用**で parser/validator は不参照 | `builtins/reference-data.ts:262-447` |
| 診断 | tag の unknown / typo / kind 不適合の診断は**一切なし**。`[pci]` は全 kind で診断ゼロ（probe 実測） | `types/warnings.ts` |
| styling | タグセレクタは任意タグで generic に照合（specificity +10）。user-defined タグの塗りは今日動く（probe 実測） | `style-resolver.ts:433-434` |
| legend | `ref [tag]` は使用実績 or style セレクタ存在で解決、builtin 塗りなしは中立 swatch フォールバック | ADR-999、`legend/usage.ts` |
| annotation の対応物 | `annotation-possible-typo`（info、edit distance ≤1/≤2、**style `@name` セレクタ存在で抑制**） | `resolver/warnings.ts:213-241` |
| style セレクタ index | `indexStyleSelectors()` は `tags: Set<string>` を**既に構築**（legend 解決用）。typo 抑制への転用が可能 | `resolver/warnings.ts:96-110` |
| spec | tag に annotation のような「open set」節が**無い**。user-defined への言及は client 限定の 1 文のみ | `tags-annotations.md:32` |
| 概観 | NodeDetailPanel はタグを生文字列表示。全モデル横断の「このタグの付いた要素一覧」は無い | `NodeDetailPanel.tsx:242-267` |

## 制約・前提

- **v1.0 freeze（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）**: tag/annotation のセマンティクスは
  v1.0-stable。**undeclared な bare `[foo]` は今日と同一に parse され続けなければならない**
  （新診断の追加・既存解釈を変えない新構文は v1.x additive として許容）。
- **promotion gate（[ADR-1820](../adr/1820-notation-promotion-gate.md)）**: 新しい宣言構文は
  experimental で着地し、stable 昇格は corpus 実証待ち。**#2065 自体は設計議論からの派生であり、
  #2079 の friction 3 以外に「宣言構文が無くて困った」corpus 実証はまだ無い**。
- **annotation の先例**: annotation は意図的に「registry なし・open set・typo は hint」で設計
  されている。tag に registry を入れるなら、この先例からの逸脱理由を明示する必要がある。
- **多値性は tag の本質**: [ADR-1974](../adr/1974-boundary-declaration-syntax.md) /
  [ADR-1858](../adr/1858-system-view-group-by-team.md) はタグを「多値だから開閉グルーピングの
  単一値識別子になれない」と**却下**した。本設計はその同じ多値性を**採用理由**にする
  （1 ノードが `[pci]` と `[eu-only]` を同時に持てる）。設計はこの性質を損なってはならない。
- **fact-vs-style register（TPL-20260514-08）**: 横断的関心事は architectural fact なので宣言は
  `.krs` 側。`.krs.style` は見た目のみ（現行の「style セレクタ存在 = 意図的宣言とみなす」は
  この境界上の既存慣行として扱う）。
- out of scope: `@...` annotation の変更、`boundary` の変更、タグの kind 制限（今日無制限で
  受理している挙動の縮小は breaking）。

## 検討した選択肢

### 案 A: annotation モデルの鏡写し（open set の明文化 + typo hint、新構文ゼロ）

tag を annotation と同じ「open set」として正式化する。

1. **spec**: `tags-annotations.md` に「タグの open set」節を新設 — builtin 集合の外のタグは
   全 kind で許容される user-defined tag であり、効果は `.krs.style` のタグセレクタと legend
   （ADR-999）で与える、と明文化。client 限定の 1 文（`:32`）を置換。
   → TPL-20260610-01 の第 4 状態が**状態 (3)（open set と文書化）に解消**される。
2. **`tag-possible-typo`（info）**: `detectAnnotationPossibleTypos` の鏡写し。builtin 17 種への
   near-miss（`[extenal]` 等）を hint。**`indexStyleSelectors().tags`（構築済み）に載っている名前は
   意図的 user-defined とみなし抑制** — annotation と同一の register・同一の抑制規則。
   さらに legend `ref [tag]` の存在も抑制条件に加える（意味を文書化した証跡として）。
3. **概観（Q3）は既存機構で賄う**: legend（`ref [pci] "PCI scope"`）が「このモデルにこの concern が
   ある」の文書化を担い、styling が視覚化を担う。全要素列挙は本案では作らない。

**メリット**

- 新構文ゼロ。v1.x additive（診断 1 個 + spec 節）で freeze・gate と無摩擦。
- annotation との**対称性**が完成する（open set / typo hint / style-selector-as-intent が両者で一致）。
  ユーザーの学習コストが最小。
- 今日すでに動く部分（styling・legend）の上に正当化だけを足すので、実装が薄い（推定: warnings.ts
  1 関数 + テスト + spec 2 ファイル + diagnostics 2 ファイル）。

**デメリット**

- **発見可能性は解決しない**: `[pci]` の意味・付与済み要素の一覧は、legend を書かない限りどこにも
  現れない。
- typo 検出は builtin near-miss に限られる。**user-defined 同士の typo**（`[pci]` vs `[pcl]`）は
  検出できない（宣言が無いので「正」の集合が無い）。
- ADR-2036 が期待した「boundary id の typo 検出を tag 機構が吸収」は実現しない（レジストリが
  無いので吸収先が無い）。

### 案 B: `tag` 宣言構文（registry、experimental）

top-level に宣言構文を追加し、宣言されたタグを第一級にする。

```krs
tag pci {
  label "PCI scope"
  description "Cardholder data environment (CDE) — PCI DSS audit boundary"
}

system Shop {
  service Billing [pci]
  database CardVault [pci]
}
```

- 宣言は**任意**（bare `[foo]` は今日どおり受理 — freeze 遵守）。
- 宣言済みタグ集合 + builtin 17 種を「正」として `tag-possible-typo` を判定
  （user-defined 同士の typo も検出可能になる）。
- 宣言の label/description は Reference パネル・NodeDetailPanel・legend 自動シードに供給。
- `organization` / top-level `boundary` と同じ宣言族の形（id + label ブロック）で、語彙の学習
  コストは低い。experimental で着地（ADR-1820）。

**メリット**

- Q1（宣言・検証・発見可能性）に正面から答える。宣言があれば typo 検出が閉じる。
- ADR-2036 の「boundary typo 検出の吸収」に将来接続できる（宣言レジストリという受け皿ができる）。
- 概観（Q3）の土台になる（宣言済みタグ → 付与要素の列挙が定義できる）。

**デメリット**

- **annotation の先例（registry なし）からの逸脱**。同じ「open set + hint」ファミリで tag だけ
  registry を持つ非対称が生まれ、「annotation にも宣言が欲しい」が誘発される可能性。
- **corpus 実証がまだ無い**新構文。ADR-1820 の規律では「証拠が無ければ据え置き」が既定。
  boundary は #2036 の correctness bug + #2079 の実測が揃ってから動いた — tag 宣言には
  まだそれに相当する実利用の pain の記録が無い。
- 実装面が広い（parser / AST / KrsFile / import-resolver merge / formatter round-trip / fmt 網羅性
  ガードは top-level 配列由来なので新配列はカバーされるが、diagnostics・i18n・Reference・app と
  波及。TPL-20260510-02 / 20260519-02 の柵も必要）。

### 案 C: 段階案 — 案 A を今出荷し、案 B は evidence-gated で設計だけ確定（推奨）

案 A と案 B は排他ではなく**段階**である。案 A は案 B の前提（open set の正当化・typo hint の
register・style-selector-as-intent の慣行）をすべて共有し、案 B が後から乗っても無駄にならない。

- **Stage 1（今）= 案 A**: spec の open set 明文化 + `tag-possible-typo` + 三分法ガイド（下記）。
  `[pci]` は「文書化された正当な書き方」になり、styling / legend で今日から使える。
- **Stage 2（evidence-gated）= 案 B**: `tag` 宣言構文。トリガは corpus / dogfood での実測
  （「タグの意味をどこに書けばいいか分からない」「タグ一覧が欲しい」「user-defined typo を踏んだ」
  の実報告）。roadmap の watch item に signal を登録して観察する — boundary で機能した
  regime（#2079 → scoped 宣言）の再適用。
- **三分法の文書化（Q4、両 Stage 共通）**: 「boundary = 同一ビュー内の peer グルーピング /
  annotation = lifecycle・state / user-defined tag = 直交する architectural attribute」を
  `tags-annotations.md`（正典）+ `docs/guide/` の記法クックブック（how-to）に明記し、
  PCI 例で boundary が不適な理由（断片化）まで書く。

**メリット**

- TPL-20260610-01 違反（現に存在する仕様の穴）を**今**塞ぎつつ、新構文は gate の規律どおり
  証拠待ちにできる。「観察期間に拡張設計を膨らませない」（boundary の教訓）と整合。
- Stage 1 は annotation 対称で完結しており、Stage 2 が永久に来なくても健全な状態。

**デメリット**

- Q3（概観）が Stage 2 まで宙に浮く（legend で部分代替）。
- 2 段に分けること自体の管理コスト（watch item の追加・Stage 2 判断の再訪）。

## 比較

| 観点 | 案 A（open set + hint） | 案 B（宣言構文） | 案 C（段階） |
| --- | --- | --- | --- |
| TPL-20260610-01 の解消 | 状態 (3) で解消 | 状態 (1)/(3) 併用で解消 | Stage 1 で即解消 |
| 新構文 / freeze | なし / v1.x additive | あり / experimental | Stage 1 なし・Stage 2 gate 準拠 |
| annotation との対称性 | 完全対称 | 非対称（tag のみ registry） | Stage 1 対称、Stage 2 は逸脱を明示 |
| user-defined 同士の typo | 不可 | 可 | Stage 2 で可 |
| 発見可能性 / 概観 | legend 頼み | 宣言が土台 | Stage 2 で土台 |
| ADR-2036 の typo 吸収期待 | 応えない | 応えうる | Stage 2 で応えうる |
| 実装コスト | 小 | 大 | 小 → （証拠が来たら）大 |
| gate 規律との整合 | 対象外（構文なし） | 証拠なき新構文 | 整合（据え置き既定） |

## Related TPLs

- [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md) —
  受理語彙の 3 状態規律。本設計の Stage 1 はこの TPL の違反状態を解消する実装であり、spec の
  open set 節から back-ref する。
- [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) —
  `tag-possible-typo` は annotation 同様 info（事実の示唆であり誤りの断定ではない）。
- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) —
  Stage 2 で宣言レジストリと builtin 表を併置する場合、union ベースの parity 柵が必要。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — Stage 2 の
  `tag` ブロックは fmt round-trip 対象（top-level 配列由来ガード + round-trip テスト）。

## 現時点の方針

**案 C（段階案）を採用する** — TPL-20260610-01 の第 4 状態は現に存在する仕様の穴であり、
新構文なしで今すぐ塞げる（Stage 1）。一方 `tag` 宣言構文は「証拠が無ければ据え置き」
（ADR-1820）の既定に従い、Stage 2 として設計輪郭だけ本 doc に固定して、corpus / dogfood の
実測が signal を出すまで実装しない。boundary で機能した観察 regime（#2079 の実測 → 構造的解決）
をそのまま再適用する。

### 実装の指針（Stage 1）

1. **spec**: `docs/spec/tags-annotations.md`（+ ja）に「User-defined tags（open set）」節を新設。
   client 限定の 1 文（`:32`）を全 kind の記述に置換。効果面（style セレクタ / legend ADR-999）と
   三分法（boundary / annotation / tag の使い分け表 — PCI 例つき）を含める。
   TPL-20260610-01 への `> Related TPLs:` back-ref + TPL 側「派生元 spec」を同 PR で。
2. **`tag-possible-typo`（info）**: `resolver/warnings.ts` に `detectTagPossibleTypos()` を追加 —
   builtin 17 種（`REFERENCE_DATA.tags`）への near-miss、`indexStyleSelectors().tags` と
   legend ref 済みタグは抑制。`WarningKind` / render-warning / i18n en+ja /
   `docs/spec/diagnostics.md`+ja（catalog テストが強制）。
3. **guide**: `docs/guide/` の記法クックブックに「横断的関心事の書き方」を追加
   （`[pci]` + style + legend の 3 点セット、boundary を使わない理由）。
4. **roadmap**: watch item「user-defined tag 宣言構文（Stage 2 candidate）」を追加 — signal =
   タグ意味の置き場所への不満・タグ一覧要望・user-defined typo の実測。
5. changeset: core+karasu minor（新診断）。
6. AT: `docs/acceptance/2065-user-defined-tags.md`。目視観点のみ:
   - `[pci]` + `[pci]` セレクタ + legend `ref [pci]` の 3 点セットが app で意図どおり見えること
   - `[extenal]` の typo hint が出て、style セレクタを書くと消えること
7. ADR 昇格: Stage 1 実装完了後 `docs/adr/2065-user-defined-tags.md` として昇格し、本 doc は
   Stage 2 の輪郭を ADR の「決めないこと」に畳んだうえで削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（bare tag の受理は不変。追加は info 診断 1 種のみで、style セレクタ
  済みの意図的タグは発火しない）。
- ドキュメント更新: `docs/spec/tags-annotations.md`+ja、`docs/spec/diagnostics.md`+ja、
  `docs/guide/`、`docs/roadmap.md`。
- テスト・examples への影響: examples に user-defined tag の feature-sample を 1 本追加検討
  （Stage 1 の 3 点セットのデモ）。

## 未解決の問い / 決めないこと

- **(1) Stage 2 のトリガ条件の精度** — 「corpus / dogfood の実報告」で足りるか、#2079 のような
  定量観測（モデル規模・発生頻度）まで要求するか。
- **(2) typo hint の抑制条件に legend ref を含めるか** — annotation の先例は style セレクタのみ。
  legend `ref [tag]` も「意図の証跡」に数えるのは自然だが、annotation との対称性を崩す
  （annotation 側には legend ref が無いので実害はないが、規則の記述が非対称になる）。
- **(3) 概観（Q3）の Stage 1 での扱い** — legend で足りるとするか、app の NodeDetailPanel に
  「同じタグを持つ要素」リンク程度の軽い導線を Stage 1 に含めるか。
- **(4) `[cache]` 等の役割タグ watch item との合流** — roadmap 既存の `[cache]` watch
  （role tag、experimental）を Stage 2 の宣言構文設計に合流させるか、独立のまま観察するか。
- 決めないこと: annotation への宣言機構の逆輸入（本設計の範囲外。Stage 2 が実現し、かつ
  annotation 側にも同じ pain が実測されたときに別 Issue で検討する）。タグの kind 制限
  （縮小は breaking、非目標）。
