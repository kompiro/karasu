---
id: ADR-2075
title: 宣言スコープで描画できない edge endpoint を診断する — peer はノードインスタンス単位で数える
status: accepted
date: 2026-07-31
topic: resolver
depends_on:
  - ADR-1567
  - ADR-1386
  - ADR-1314
related_to:
  - ADR-2184
  - ADR-1870
  - ADR-681
scope:
  packages:
    - core
    - i18n
    - lsp
assumptions:
  - "symbol: packages/core/src/resolver/warnings.ts :: detectEdgeEndpointsNotAtScope"
  - "grep: packages/core/src/types/warnings.ts :: edge-endpoint-not-at-scope"
  - "symbol: packages/core/src/view/view-extract.ts :: extractRootSystemView"
  - "symbol: packages/core/src/view/unassigned-system.ts :: withUnassignedSystem"
  - "grep: docs/spec/syntax.md :: Endpoint scope"
  - "grep: docs/spec/diagnostics.md :: edge-endpoint-not-at-scope"
---

# ADR-2075: 宣言スコープで描画できない edge endpoint を診断する — peer はノードインスタンス単位で数える

- **日付**: 2026-07-31
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2075](https://github.com/kompiro/karasu/issues/2075)
  - 実装 PR: [#2219](https://github.com/kompiro/karasu/pull/2219)（Design Doc は [#2212](https://github.com/kompiro/karasu/pull/2212)）
  - 派生 Issue: [#2223](https://github.com/kompiro/karasu/issues/2223)（service-anchored edge がどのビューにも描画されない）
  - 統治 ADR: [ADR-1567](1567-rule-diagnostic-separation-and-catalog.md)（1 規則 ⊃ 複数診断・診断カタログ）, [ADR-1386](1386-style-prescription-stance.md)（register は事実か欠陥か）, [ADR-1314](1314-krs-spec-v1-freeze.md)（言語 v1.0 freeze）
  - 関連 TPL: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md), [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md), [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md), [TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md)
  - spec: `docs/spec/syntax.md` § Edge declaration — Endpoint scope

## 背景

`system` スコープに書いた `A -> B`（A, B は `service S` 配下の `domain`）は parse を通り、
循環依存チェッカーにも見えるのに、**どの view にも描画されず診断も出ない**。同じ間違いを
1 段下（`service` ブロック内）でやると `edge-source-mismatch`（error）で弾かれる。
つまり同じ規則違反が、置いた場所によって error / 完全な沈黙に分かれていた。

着手時に `extractView` / `extractEntityView` を全 view path で呼んで描画された edge を
列挙したところ、silent drop は system スコープ固有ではなく **6 配置**で起きていた
（system スコープの domain 参照 / service スコープから他 service の domain / domain スコープ
から usecase / system スコープから nested usecase / dotted 無しの cross-system service 参照 /
bare id の cross-domain entity 関連）。一方で実際に描画される配置も 2 つある
（cross-service を含む domain→domain、限定子付き entity 関連）。

生成モデル（reverse-architecture harness）は system スコープに domain 依存 edge を自然に
吐くため、この沈黙は生成モデルの fidelity を静かに下げていた。

## 決定

**authored edge の endpoint は、その edge を宣言したブロックの peer でなければならない**
という 1 本の規則に畳み、違反を `edge-endpoint-not-at-scope`（warning）で報告する。
**peer は id ではなくノードインスタンス単位**で数える。

判定式 — コンテナ C に宣言された edge の endpoint E について、以下のいずれにも
当たらないとき warning:

1. E が dotted（`.` を含む）→ skip（`cross-system-ref-*` / entity の限定子参照の領分）
2. E がモデル中に存在しない → skip（`unresolved-edge-endpoint` の領分）
3. E ∈ peers(C)
   - C が `system` → **その block 自身の**子 ∪ トップレベル orphan `domain`
   - それ以外 → `{C.id}` ∪ **C を宣言した親インスタンスの**子
4. C が `domain` かつ E が `domain` → skip（cross-service domain 依存は
   `deriveImplicitServiceEdges` が service 粒度に集約して描画する）

## 理由

- **配置による診断の割れを解消する**。narrow（system スコープのみ）に閉じると、
  probe が見つけた残り 5 配置は沈黙のままで、[ADR-2184](2184-unassigned-domain-placement-parity.md)
  / TPL-2184 の「同じモデリング状態を表す配置は同じ診断を出す」に正面から反する。
- **register は warning**。author が書いた edge がどの図にも出ていない = 実際の欠陥であり、
  流派判断ではない（ADR-1386 / TPL-1386）。
- **error ではなく warning**。endpoint の位置はファイル跨ぎ merge 後にしか判定できず、
  parser 段では別ファイル宣言と区別が付かない。§S6 の warn-don't-error に従う。
- **診断の追加なので v1.0 freeze に触れない**（ADR-1314）。構文は 1 文字も変えていない。
- **peer をインスタンス単位にするのは renderer と一致させるため**。`layout.ts` の
  multi-system 経路は、system の edge を「両端がその system 自身の id 集合にある」ときだけ
  描画する。id で union すると、実際には描画されない 2 つの drop を隠してしまう:
  - **同一ファイル内の同 id `system` ブロック 2 つ** — マージされるのは *import* 経由の
    再オープンのみ（`import-resolver.ts` は自ファイル分を無条件 push する）。
  - **同じ `domain` id が 2 service に分散**した形 — entity view はノード識別子で
    区別するため、別インスタンス配下への bare 参照は drop される。
- **orphan の扱いは経路の実測に従う**。トップレベル orphan のうち実際に system の frame に
  差し込まれるのは `domain` だけ（drawio exporter が `krsFile.domains` を渡す）。orphan の
  service / client は SVG 経路では `__unassigned__` 擬似 system に包まれる（ADR-681）ため、
  どこにも描画されず報告対象になる。
- **診断コードは entity 用に分けない**。規則は同一（宣言スコープで描画できない endpoint）で、
  ADR-1567 の「1 規則 ⊃ 複数診断」は*機構が異なる*ときの分割。ここは機構も同一で、
  fix の綴り（source への anchor / 限定子付き参照）だけが違うので、メッセージ variant で
  吸収する。コードは安定 API なので、後から分割はできても統合はできない。
- **LSP では抑制しない**（TPL-1522 の side を記録）。endpoint が別ファイル宣言なら単一
  ドキュメント文脈では解決せず、抑制済みの `unresolved-edge-endpoint` に落ちる。よって
  LSP は過小報告にしかならず、false positive を出さない。

## 却下した案

- **narrow（`system` スコープの edge だけを対象にする）** — Issue の再現ケースは閉じるが、
  probe が見つけた残り 4 配置は沈黙のまま。後から一般化すると同じ規則に対する診断コードが
  2 つに割れる。
- **診断ではなく描画できるようにする**（system スコープの domain→domain を re-anchor して
  暗黙 service edge のように描く） — spec の edge origin scope 規則（edge は source と
  co-located に置く）が正準形として既にあり、同じ関係に 2 つの綴りを与えることになる。
  言語仕様の追加なので v1.0 freeze にも触れる。6 配置のうち描画に落とせるのも一部だけ
  （`-> usecase` などは描画先の view が無い）。
- **peer 集合を id で union する** — 実装当初はこれを採ったが、code review で 2 つの
  false negative を出すことが判明して撤回した。採用の根拠にしていた「examples で false
  positive が 4 件出る」という観測は、impact scan がファイルを**連結**して merge を模した
  ことによる産物で、実際の import 経路の挙動ではなかった。cross-file 再オープンは
  マージ後 1 ノードになるため、インスタンス単位でも正しく動く。

## 未解決（別 Issue）

- `service S { S -> X }` という **service-anchored edge は対象を問わずどのビューにも
  描画されない**（[#2223](https://github.com/kompiro/karasu/issues/2223)）。spec は
  `service` ブロック内の edge を正規の記法として文書化しているため、「描画できるように
  する」か「診断して spec を狭める」かは v1.0 freeze の判断を伴う。本 ADR の検出器は
  兄弟宛てを at-scope のまま扱い（過小報告側）、判断は #2223 に委ねる。
- entity 関連の dotted 未解決参照（`-> D9.Nope` で D9 が無い）は無診断のまま。
  `cross-system-ref-unresolved` は system edge の dotted しか見ていない。
