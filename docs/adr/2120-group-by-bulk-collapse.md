---
id: ADR-2120
title: bulk collapse は描画済みフレームの集合で駆動し、Group-by 軸の増加に無改修で耐える
status: accepted
date: 2026-07-24
topic: app-ui
depends_on: [ADR-1858, ADR-1821]
related_to: [ADR-1872, ADR-1955, ADR-1974]
scope:
  packages: [app]
  concerns: []
assumptions:
  - "symbol: packages/app/src/hooks/useSystemView.ts :: useSystemView"
  - "grep: packages/app/src/hooks/useSystemView.ts :: data-collapse-group"
  - "symbol: packages/app/src/hooks/useSystemView.ts :: anyCollapsible"
  - "symbol: packages/app/src/state/preview-context.tsx :: groupByAxis"
  - "file: docs/acceptance/1872-group-collapse-all.md"
---

# ADR-2120: bulk collapse は描画済みフレームの集合で駆動し、Group-by 軸の増加に無改修で耐える

- **日付**: 2026-07-24
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1872](https://github.com/kompiro/karasu/issues/1872)（Group by team: Collapse all / Expand all control [P2a follow-up]）、親 [#1858](https://github.com/kompiro/karasu/issues/1858) / epic [#1817](https://github.com/kompiro/karasu/issues/1817)
  - 実装 PR: [#1891](https://github.com/kompiro/karasu/pull/1891)（設計 PR [#1887](https://github.com/kompiro/karasu/pull/1887)）
  - 設計（本 ADR に集約し削除）: `docs/design/group-by-bulk-collapse.md`
  - ADR: [ADR-1858](1858-system-view-group-by-team.md)（team 軸グループ化。決定 4 が bulk 操作を #1872 に委ねた）、[ADR-1821](1821-layer-toggles.md)（external / infra の category collapse — bulk トグルが横断するもう一方の軸）、[ADR-1872](1872-category-collapse-retarget-edges.md)（同じ Issue から出た姉妹決定。bulk 化で表面化した edge drop を re-target に揃えた）、[ADR-1955](1955-expand-all-services-in-place.md)（同じ「描画済み SVG から id 集合を得る」パターンの expansion 軸版）、[ADR-1974](1974-boundary-declaration-syntax.md)（P2b `boundary` 軸 — 本 ADR の拡張耐性を実地で検証した軸）
  - AT: [1872-group-collapse-all.md](../acceptance/1872-group-collapse-all.md)
  - TPL: [TPL-1094](../test-perspectives/TPL-1094-enum-member-addition.md)（列挙型メンバー追加時の網羅性 — 本 ADR の中心観点）、[TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)、[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)
  - follow-up: [#2119](https://github.com/kompiro/karasu/issues/2119)（セレクタの網羅強制 — 本 ADR が P2b に繰り越した B3。P2b は B3 なしで着地したため Issue 化した）

> 本 ADR は 2026-07-11 に設計し 07-13 に実装完了（[#1891](https://github.com/kompiro/karasu/pull/1891)）した決定を、2026-07-24 に遡って昇格させたものである。当時の昇格計画は「繰り越した防御（B2 / B3）を design doc に抱えたまま P2b まで残す」だったが、P2b（[ADR-1974](1974-boundary-declaration-syntax.md)）が着地して繰り越し先が確定したため、doc を畳んで ADR 化する。

## 背景

[ADR-1858](1858-system-view-group-by-team.md)（P2a）の system view「Group by: team」は各チームを境界フレームで囲み、フレーム単位で ⊖/⊕ 折り畳みできる。ただし操作は **1 フレームずつ**だった。P1 検証が示したのは「可読性を生むのは折り畳みであり、既定で畳んでおいて必要な所だけ開く運用が最も読みやすい」ことなので、その状態に一発で入る **Collapse all / Expand all** が要る（ADR-1858 決定 4 が #1872 として明示）。

機能自体は小さい。設計の主眼は別のところにあった — レビューで挙がった懸念、**「将来 Group-by の軸が team 以外に増えたとき、この bulk 操作が対応漏れを起こさないか」**である。当時 P2b（宣言構文、後の `boundary`）が検討中で、2 つ目の軸が来ることは分かっていた。素朴に `groupBy === "team"` へ機能を紐付けると、新軸を足したときに bulk collapse が**静かに効かなくなる**（[TPL-1094](../test-perspectives/TPL-1094-enum-member-addition.md) の「新メンバーが fallback 先で silent に誤動作する」失敗モード）。

したがって本 ADR が決めるのは bulk collapse の実装方式ではなく、**Group-by 軸の増加に対する結合の設計**である。

## 決定

**bulk collapse を「いま何の軸でグループ化しているか」ではなく「いま実際に描画されている折り畳み可能フレームの集合」で駆動する。** 具体的には `useSystemView` が描画済み SVG の `data-collapse-group` / `data-collapse-category` 属性値から id 集合を導出し、bulk トグルの対象・表示条件をその集合の非空性だけで決める。`groupBy` の値は一切参照しない。

### 決定 1 — id 集合の取得元は描画済み SVG（案 A1）

`useSystemView` が保持する `svg` 文字列を走査して `groupIds` / `categoryIds` を得る。属性値は renderer が XML エスケープするので raw id に decode する（`R&D` のような id 対策）。

この属性は**折り畳み状態に依らず付く**（畳んだ stub にも付く。そうでないと ⊕ で開けない）ため、集合は全畳み ↔ 全開きの**両方向で完全**になる。描画結果が単一の真実源なので、幻の group を畳む・実在するフレームを取り零す事故が構造的に起きない。core の変更はゼロ。

### 決定 2 — 駆動条件は「畳めるものがあるか」（案 B1）

bulk トグルの表示条件と対象を `anyCollapsible = groupIds.length > 0 || categoryIds.length > 0` で決める。「Group-by が team か」ではなく「今、折り畳めるフレームがあるか」で判定する。これにより**新しい軸を足しても bulk collapse は一切変更不要**で、フレームを描く軸なら自動的に有効になる。

### 決定 3 — ラベルの正直性: bulk トグルは 2 つの折り畳み軸を横断する

ボタンのラベルは「Collapse all / Expand all」であり、ユーザーには team フレームか external/infra カテゴリ帯かを区別する情報がない。**「all」を名乗る以上、ビュー内で畳めるものすべて**（group フレーム = ADR-1858 + category 帯 = [ADR-1821](1821-layer-toggles.md)）を対象にしないとラベルと挙動がずれる。したがって bulk トグルは `collapsedGroups` と `collapsedCategories` を両方セットし、`allCollapsed` は両軸が畳まれたときだけ true にする。

グループ化していないビュー（Group by: None・組織情報なし）でも external / infra 帯があればボタンを出す — category 折り畳みは組織情報に依存しないので、畳めるものがあるのに操作手段が無いのは不整合になる。

**per-axis の状態と個別 ⊖/⊕ コントロールは従来どおり直交**であり（ADR-1858 §3「機構は直交」は保たれる）、束ねるのは bulk トグル 1 つだけである。

### 決定 4 — 軸受け渡しの防御は P2b に繰り越す（案 B2 / B3）

`useSystemView` の core オプション受け渡しには当時 `groupBy === "team" ? … : undefined` という silent fallback が残っていた（新軸が `undefined` = グループ化なしに落ちる）。これを「`none` 以外は素通し」に反転する **B2**、およびセレクタの `<option>` 手書き列挙を `GroupByMode` キーの Record から生成して網羅を型で強制する **B3** は、**どちらも 2 つ目の軸が実在してはじめて意味を持つ**防御である。team 軸だけの時点では機能差を生まないため、#1872 の diff を最小に保ち、軸を実際に増やす P2b の PR に繰り越した（当時は該当行に申し送りコメントのみ残した）。

## 理由

- **拡張耐性の本体は決定 1 + 決定 2 に集約される。** 折り畳み machinery 自体（`collapsedGroups` の識別子）は元々軸非依存で、「node/stub id → 所属コンテナ id」という同じ形をとる。足りなかったのは「全 id をどこから得るか」だけであり、そこを描画結果に寄せるだけで軸非依存性が完成する。
- **属性への依存は新規の結合ではない。** `data-collapse-group` は既に `PreviewPane` のクリック委譲が依存している契約であり、bulk collapse がそれを共有しても結合面は増えない。
- **軸固有ロジックをセレクタ 1 箇所に閉じ込める**方向に寄せることで、新軸の作業を「`GroupByMode` に 1 メンバー追加 + セレクタに 1 行 + core union 拡張」に収斂させられる。
- **app のみの変更で済む。** `@karasu-tools/app` は changesets の `ignore` 対象なので changeset も不要。#1872 の「最小の実装で十分」という前提と釣り合う。

## 却下した案

- **案 A2: compile 結果から group id を core が明示的に公開する。** 文字列パースを避けた「正規の」データ経路に見えるが、`render()` は現状 svg 文字列しか返さず、`SystemCompileResult` まで新フィールドを貫通させる必要がある。しかも**軸非依存にするには結局「どの軸でも group id を集める」ロジックを core に書く**ことになり、app の SVG 走査を core へ移すだけになる。変更面が core に広がり changeset も要る。
- **`groupBy === "team"` に bulk collapse を紐付ける素朴な実装。** 最も短く書けるが、まさに [TPL-1094](../test-perspectives/TPL-1094-enum-member-addition.md) の失敗モードで、新軸で静かに機能が消える。本 ADR の主眼はこれを避けることにある。
- **bulk トグルを group フレームだけに限定する。** ラベルが「all」を名乗る以上、external / infra 帯を対象外にすると挙動とラベルがずれる（決定 3）。

## その後の検証（2026-07-24 時点）

本 ADR の中心的な主張は「新しい Group-by 軸が来ても bulk collapse は無改修で効く」という**反証可能な予測**であり、その後 P2b で実際に検証された。

- **予測は当たった。** [ADR-1974](1974-boundary-declaration-syntax.md) の `boundary` 軸が着地したとき、bulk collapse 側の変更は不要だった。決定 1 + 決定 2 の軸非依存性がそのまま効いている。
- **繰り越した B2 は P2b で実装され、さらに一般化された。** 当初案は `useSystemView` の 1 箇所を「`none` 以外は素通し」に反転するものだったが、[#2033](https://github.com/kompiro/karasu/issues/2033) で「export 面と entity view にも同じ per-site ハードコードが複製されており boundary 軸が黙って落ちる」ことが判明したため、変換点を `preview-context.tsx` の `groupByAxis()` 一関数に集約する形に強化された。B2 が予告した失敗モードが別surface で現実に起き、その修正が設計を一段先へ進めた形になる。
- **B3 は実装されなかった。** セレクタは今も `<option>` を手書き列挙している。加えて各軸が可用性ゲート（`hasTeamAxis` / `hasBoundaryAxis`）を持つようになったため、当初案の「`GroupByMode` をキーにした Record から生成」はそのままでは形が合わず、小さな再設計が要る。繰り越し先（P2b）が過ぎたので [#2119](https://github.com/kompiro/karasu/issues/2119) として Issue 化した。
