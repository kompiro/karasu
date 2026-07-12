# Group-by 軸の拡張に強い bulk collapse（Collapse all / Expand all）

- **日付**: 2026-07-11
- **ステータス**: 検討中
- **Issue**: #1872
- **PR**: [#1887](https://github.com/kompiro/karasu/pull/1887)
- **関連**:
  - 引き金 Issue: [#1872](https://github.com/kompiro/karasu/issues/1872)（Group by team: Collapse all / Expand all control [P2a follow-up]）
  - 親 Issue: [#1858](https://github.com/kompiro/karasu/issues/1858) / epic [#1817](https://github.com/kompiro/karasu/issues/1817)（comprehension）
  - 関連 ADR: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（team 軸グループ化。決定 4「既定は展開、全折り畳みへは『すべて畳む』で到達、bulk 操作は #1872 で追加」）
  - 親 Design Doc: [system-view-grouping.md](system-view-grouping.md)（P2b の宣言構文 `group` が **2 つ目の Group-by 軸**になりうる — 本 doc の拡張性はこれを見据える）
  - 関連 TPL: [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（列挙型メンバー追加時の網羅性を型で強制）, [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（user-facing surface の docs 同期）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置時の端点保持）
  - コード: `packages/app/src/hooks/useSystemView.ts`, `packages/app/src/state/preview-context.tsx`, `packages/app/src/components/PreviewColumn.tsx`, `packages/core/src/renderer/svg-renderer.ts`

## 背景・課題

system view の「Group by: team」（#1858 / ADR-20260711-03）は、各チームを境界フレームで囲み、フレーム単位で ⊖/⊕ 折り畳みできる。ただし現状は **1 フレームずつ**しか操作できない。ADR の P1 検証が示したとおり、可読性を生むのは折り畳みであり「**既定で畳んでおき、必要な所だけ開く**」運用が最も読みやすい（全折り畳み = group 依存 DAG ビュー）。この運用に一発で入る **Collapse all / Expand all** の bulk 操作が要る（ADR 決定 4 が #1872 として明示）。

機能自体は小さい。しかし #1872 のレビューで挙がった懸念は「**将来 Group-by の軸が team 以外に増えたとき、この bulk 操作が対応漏れを起こさないか**」である。実際、親 Design Doc の P2b は宣言構文 `group { contains … }` を検討中で、これは `team` に続く **2 つ目の Group-by 軸**になる。素朴に `groupBy === "team"` へ機能を紐付けると、P2b 軸を足したときに bulk collapse が静かに効かなくなる（TPL-20260510-03 の「新メンバーが fallback 先で silent に誤動作する」失敗モードそのもの）。

したがって本 doc の主眼は **bulk collapse の実装方式ではなく、Group-by 軸の増加に対する結合の設計**にある。

## 現状（インベントリ）

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| Group-by 軸の型 | `type GroupByMode = "none" \| "team"` | `preview-context.tsx:17` |
| core 側の軸の型 | `groupBy?: "team"`（`"none"` は「省略」で表現） | `index.ts:400` / `svg-renderer.ts:134` / `layout.ts:775` |
| 折り畳み状態 | `collapsedGroups: ReadonlySet<string>` を `useSystemView` が保持、`toggleGroup(id)` で 1 件トグル | `useSystemView.ts:152-160` |
| core option への受け渡し | `groupBy === "team" ? "team" : undefined` / `groupBy === "team" ? collapsedGroups : undefined` | `useSystemView.ts:185-186` |
| セレクタ UI | `<option value="team">` を手書き列挙 | `PreviewColumn.tsx:288` |
| セレクタ表示条件 | `activeView === "system" && view.groupByAvailable` | `PreviewColumn.tsx:278` |
| フレームの折り畳みトグル（SVG 内） | 各グループコンテナに `data-collapse-group="<groupId>"` を付与（**展開・折り畳みどちらの状態でも**付く。折り畳んだ stub も ⊕ で展開する必要があるため） | `svg-renderer.ts:641` (`renderGroupControls`) |
| app のクリック委譲 | `target.closest("[data-collapse-group]")` → `onGroupToggle(groupId)` | `PreviewPane.tsx:304-311` |

**軸がハードコードされている箇所（新軸を足すと触る必要がある場所）**:

1. `preview-context.tsx:17` — `GroupByMode` union（起点）
2. `PreviewColumn.tsx:288` — `<option>` の手書き列挙（**軸ごとに増える。本質的に軸固有**）
3. `useSystemView.ts:185-186` — `groupBy === "team" ? … : undefined`（**silent fallback。新軸が `undefined` に落ちてグループ化されない**）
4. core `index.ts:400` / `svg-renderer.ts:134` / `layout.ts:775` — `groupBy?: "team"` union（app とは別に維持されており、2 つの語彙が drift しうる）

## 制約・前提

- **`collapsedGroups` の識別子は「軸に依らない node id / group id」**。team 軸では team id、P2b の group 軸では group id。どちらも「node/stub id → その所属コンテナ id」という同じ形をとる（ADR-20260711-03 は単一値の所属を前提にしている）。→ 折り畳み machinery 自体は既に軸非依存。
- **`data-collapse-group` の値集合 = 実際に描画されている折り畳み可能フレームの全体**。`renderGroupControls` がコンテナを走査して付けるので、どの軸が有効かに依らず「今そのフレームを畳める group id」がそのまま並ぶ。折り畳み済みの stub にも付く（そうでないと ⊕ で開けない）ので、**全畳み ↔ 全開きの両方向で完全な集合**が得られる。
- **out of scope**: P2b の宣言構文そのもの（親 doc）、Group-by 状態の URL/Share への符号化（#1838 follow-up）、team 以外の実軸の追加（本 doc は「増えても壊れない構造」を用意するだけで、実軸は足さない）。
- app（`@karasu-tools/app`）は changesets の `ignore` 対象。core を触らなければ changeset 不要。

## 検討した選択肢

論点は 2 つに分かれる: **(A) bulk collapse が「全 group id」をどこから得るか**、**(B) 軸の増加にどう耐えるか**。

### (A) 全 group id の取得元

#### 案 A1: 描画済み SVG の `data-collapse-group` を走査する

`useSystemView` が持つ `svg` 文字列を正規表現で走査し、`data-collapse-group="…"` の値集合を `groupIds` として得る。

**メリット**

- **軸非依存**。team でも P2b group でも「フレームを描く軸」なら自動的に集合が埋まる。bulk collapse は「どの軸か」を一切知らなくてよい。
- 描画結果が単一の真実源。`groupIds` が「実際に畳めるフレーム」と構造的に一致し、幻の group を畳む/取り零す事故が起きない。
- 折り畳み状態に依らず完全（stub にも属性が付くため）。
- core 変更ゼロ。

**デメリット**

- SVG 文字列のパース（正規表現）に依存する。属性名 `data-collapse-group` が renderer 側の暗黙契約になる（既に `PreviewPane` のクリック委譲が同じ契約に依存しているので、新規の結合ではない）。

#### 案 A2: compile 結果から group id を明示的に公開する

`render()` / `SystemCompileResult` に `groupIds: string[]`（あるいは `LayoutResult.containers` の group id）を通して返す。

**メリット**

- 文字列パースを避けた「正規の」データ経路。

**デメリット**

- core の `render()` は現状 svg 文字列しか返さない。`_compileFromPreparedInput` → `SystemCompileResult` まで新フィールドを貫通させる必要があり、**軸非依存にするには結局「どの軸でも group id を集める」ロジックを core に書く**ことになる（app の SVG 走査を core に移すだけ）。
- 変更面が core に広がり、changeset も必要になる。#1872 の「最小の実装で十分」という前提と釣り合わない。

### (B) 軸増加への耐性

#### 案 B1: bulk collapse を「フレームの有無」で駆動する（`groupBy === "team"` に紐付けない）

bulk collapse の表示条件と対象を **`groupIds.length > 0`** で決める。「Group-by が team か」ではなく「今、折り畳めるフレームがあるか」で判定する。

- Collapse all: `setCollapsedGroups(new Set(groupIds))`
- Expand all: `setCollapsedGroups(new Set())`

**メリット**

- 新軸を足しても bulk collapse は **一切変更不要**。フレームを描く軸なら自動で有効化される。
- (A1) と噛み合う（`groupIds` が軸非依存なので判定も軸非依存になる）。

**デメリット**

- 「team のときだけ出したい」等の軸固有 UX を将来入れるなら別途分岐が要る（現時点でそういう要求はない）。

#### 案 B2: silent fallback を「off センチネル基準」に反転する（`useSystemView.ts:185-186`）

現在の `groupBy === "team" ? x : undefined` は、新軸 `"group"` を足すと `undefined`（グループ化なし）に落ちる silent fallback（TPL-20260510-03）。これを **「`none` 以外なら通す」** に反転する:

```ts
// before（新軸が silent に無効化される）
groupBy: groupBy === "team" ? "team" : undefined,
collapsedGroups: groupBy === "team" ? collapsedGroups : undefined,

// after（none だけを無効化、それ以外の軸は素通し）
groupBy: groupBy === "none" ? undefined : groupBy,
collapsedGroups: groupBy === "none" ? undefined : collapsedGroups,
```

これには **app の `GroupByMode` と core の `groupBy` union を同期**させる必要がある（core が `"team"` 以外を受けられるようにする＝ P2b 実装時の作業）。本 doc では **app 側の分岐を反転しておく方針だけ確定**し、core union の拡張は P2b に委ねる。ただし今は core が `"team"` しか受けないため、当面は型を合わせる最小限（`groupBy === "none" ? undefined : "team"` に相当）に留め、コメントで「軸追加時はここを素通しに」と明示する。

**メリット**

- 新軸の追加漏れが「グループ化が静かに効かない」ではなく、少なくとも型か明示コメントで気づける。

**デメリット**

- core union の拡張が伴うまでは中途半端（app だけ反転しても core が受けない）。→ 実害が出るのは P2b 実装時なので、その時点で core union と一緒に仕上げる前提のコメントを残す。

#### 案 B3: 軸固有な残り 1 箇所（セレクタ `<option>`）を型で網羅強制する

`<option>` の列挙だけは本質的に軸固有（各軸の表示ラベルが要る）。ここを手書き `<option>` の羅列でなく **`GroupByMode` をキーにした配列/Record** から生成し、メンバー追加で型エラーになるようにする（TPL-20260510-03 の「union をキーにした Record」パターン）。

```ts
const GROUP_BY_OPTIONS: { value: GroupByMode; labelKey: MessageKey }[] = [
  { value: "none", labelKey: "preview.groupBy.none" },
  { value: "team", labelKey: "preview.groupBy.team" },
];
```

**メリット**

- 新軸を `GroupByMode` に足したとき、この配列の更新漏れ（＝セレクタに出ない）を型/レビューで捕まえやすくなる。

**デメリット**

- 完全な exhaustive 強制には `satisfies Record<GroupByMode, …>` 化などもう一段要る。#1872 の最小スコープでは「配列化 + コメント」まで。

## 比較

| 観点 | A1（SVG 走査） | A2（core 公開） |
| --- | --- | --- |
| 軸非依存 | ◎（描画が真実源） | ○（ただし core にロジック移動） |
| 変更面 | app のみ | core 貫通 + changeset |
| #1872 の「最小」 | ◎ | △ |

| 観点 | B1（フレーム有無で駆動） | B2（fallback 反転） | B3（option 網羅） |
| --- | --- | --- | --- |
| 新軸で bulk collapse が壊れない | ◎（変更不要） | ─（軸受け渡しの話） | ─（セレクタの話） |
| 追加漏れの検出 | ◎（構造的に不要） | ○（コメント/型） | ○（配列化） |
| 今 payが必要なコスト | 小 | 小（コメント）〜中（core は P2b） | 小 |

## 現時点の方針

**#1872 では (A1) + (B1) + (C) を実装する。(B2) / (B3) は「軸を実際に増やす」P2b と同時に支払う**（本 doc に手順を残し、繰り越す）。

- **bulk collapse は `data-collapse-group` 由来の `groupIds` で駆動する（A1 + B1）** — #1872 で実装。`useSystemView` が `svg` から `groupIds: string[]` を導出し、`allCollapsed` と `onCollapseAllToggle()`（全畳み ⇄ 全開き）を公開する。UI の表示・対象判定は `groupBy === "team"` を**参照しない**。これで P2b 軸を足しても bulk collapse は無改修で有効になる — **拡張耐性の本体はここ**であり、A1/B1 だけで「軸が増えても bulk collapse が壊れない」は達成される。
- **(C) label 正直性 — bulk collapse は 2 つの折り畳み軸をまたぐ**。ボタンのラベルは「Collapse all / Expand all」であり、ユーザーには team グループか external/infra カテゴリかを区別する情報がない。ラベルが「all」を名乗る以上、**ビュー内で畳めるものすべて**（team フレーム #1858 + external/infra カテゴリ帯 #1821）を対象にしないとラベルと挙動がずれる（レビュー指摘）。したがって `onCollapseAllToggle` は `collapsedGroups`（全 `groupIds`）と `collapsedCategories`（全 `data-collapse-category` = external/infra）を**両方**セットし、`allCollapsed` は両軸が畳まれたときだけ true にする。**per-axis の状態・個別 ⊖/⊕ コントロールは従来どおり直交**（ADR-20260711-03 §3）で、束ねるのは bulk トグル 1 つだけ — ADR §3 の「機構は直交」は保たれ、便宜操作だけが両軸を横断する。カテゴリ id も SVG（`data-collapse-category`）由来なので軸非依存性は保つ。**ボタンの表示も `groupBy` ではなく「畳めるものがあるか」（`anyCollapsible = groupIds.length>0 || categoryIds.length>0`）で判定する** — category 折り畳みは org 非依存なので、グループ化していないビューでも external/infra 帯があればボタンを出す（「all」を名乗る以上、畳めるものがあるのに操作手段が無いのは不整合、というレビュー指摘に沿う）。
- **(B2) off センチネル基準への反転 / (B3) セレクタの配列化は P2b に繰り越す**。理由: どちらも「2 つ目の Group-by 軸が実在してはじめて意味を持つ」防御であり、team 軸だけの現時点では機能差を生まない。#1872 の diff を最小に保ち、P2b で `GroupByMode` に軸を足す PR がこの 2 箇所を必ず通るようにする（下記「P2b への申し送り」）。ただし **silent fallback が存在する事実**を見失わないよう、#1872 では `useSystemView.ts` の該当行に **1 行のコメント**（「軸追加時は `none` 以外を素通しにし、core union を拡張すること。B2/B3 は本 doc 参照」）だけ残す。

軸固有ロジックを最終的に**セレクタ 1 箇所に閉じ込め**、それ以外（core への受け渡し・折り畳み machinery・bulk 操作）を**軸非依存 or off センチネル基準**にする、というのが本 doc の到達点。これは「新しい軸 = `GroupByMode` に 1 メンバー追加 + セレクタ配列に 1 行 + core union 拡張」に作業を収斂させ、TPL-20260510-03 の失敗モード（追加漏れが silent になる）を構造的に避ける。#1872 はそのうち「bulk collapse を軸非依存にする」部分を先行実装する。

### 実装の指針（#1872 でやること）

1. **`useSystemView.ts`**:
   - `svg` から `groupIds: string[]` を `useMemo`（`/data-collapse-group="([^"]+)"/g` を走査、重複排除）。属性値は renderer が XML エスケープするので raw id に **decode**（`&amp;`/`&lt;`/`&gt;`/`&quot;` を戻す。`R&D` 対策）。
   - `categoryIds: CategoryId[]` を `data-collapse-category` から同様に導出（external/infra のみ、特殊文字なしなので decode 不要）— (C) 用。
   - `allCollapsed = (groupIds.length>0 || categoryIds.length>0) && 全 groupIds ∈ collapsedGroups && 全 categoryIds ∈ collapsedCategories`。
   - `onCollapseAllToggle`: `allCollapsed` なら両 set を空に、そうでなければ `collapsedGroups=全 groupIds` / `collapsedCategories=全 categoryIds` をセット。
   - 返り値に `groupIds` / `allCollapsed` / `onCollapseAllToggle` を追加。
   - option 受け渡し行（`groupBy === "team" ? … : undefined`）には **申し送りコメントのみ**追加（反転自体は B2 = P2b）。
2. **配線**（`onGroupByChange` と同じ経路で 3 フィールドを貫通）: `useAppViews`（`SystemViewBundle`）→ `AppShell` system arg → `usePreviewContextValue`（param 型 + `systemView` mapping + memo deps）→ `preview-context.tsx`（`SystemPreviewData`）→ `active-view-data.ts`（`ActiveViewData` + system case）。
3. **`PreviewColumn.tsx`**: セレクタ直後に shadcn `Button`（`variant="actionable"`, `aria-pressed={allCollapsed}`, icon+text）を追加。表示条件は **`activeView === "system" && view.anyCollapsible`**（`groupBy` / `groupByAvailable` に紐付けない）。`anyCollapsible = groupIds.length>0 || categoryIds.length>0` なので、グループ化していない（Group by: None・org 無し）ビューでも external / infra 帯があればボタンが出る（category 折り畳みは org 非依存）。ラベルは `allCollapsed ? "⊕ Expand all" : "⊖ Collapse all"`。**`<option>` の手書き列挙はこの PR では触らない**（配列化 = B3 = P2b）。
4. **i18n**（`packages/i18n` en/ja/types）: `preview.groupBy.collapseAll` / `preview.groupBy.expandAll`。
5. **docs/tools**（TPL-20260623-01）: toolbar action の追加なので `docs/tools/app.md` + `app.ja.md` に Collapse all / Expand all を記載する（team フレーム + external/infra を畳む旨も明記）。Group-by セレクタ自体が未記載なら同 PR で最小の説明を backfill する。
6. **テスト**:
   - `useSystemView.test.tsx`: `setGroupBy("team")` 後に `groupIds` が SVG から埋まる / `onCollapseAllToggle` で全畳み → 再度で全開き / **external/infra カテゴリも畳まれる**（(C) 用）/ `R&D` の escape decode 回帰。
   - `PreviewColumn.test.tsx`: team 軸 + フレーム有りのときだけ表示 / ラベルと `aria-pressed` が状態で反転 / クリックでハンドラ発火。
7. AT: `docs/acceptance/1872-group-collapse-all.md`。TC:
   - `index.krs`（org モデル）を開き Group by → Team。
   - **Collapse all** 1 クリックで全チーム stub + external/infra 帯が畳まれ俯瞰ビューになる。
   - **Expand all** で両軸とも展開に戻る。
8. ADR 昇格: 実装完了後、本 doc は **P2b の防御（B2/B3）を未実装で保持する**ため、`docs/adr/` へ全面昇格はしない。bulk collapse（A1/B1）は ADR 決定 4 の実装なので **ADR-20260711-03 への軽い追記**で足り、本 doc は B2/B3 を抱えたまま P2b まで残す（親 doc の P2b/P2c と同じ「部分昇格」運用）。

### P2b への申し送り（軸を実際に増やす PR がやること）

`GroupByMode` に 2 つ目の軸（例 `"group"`）を足す PR は、以下を**同時に**行う（本 doc の B2/B3）:

- **(B2)** `useSystemView.ts` の option 受け渡しを `groupBy === "none" ? undefined : groupBy` に反転し、**core の `groupBy` union（`index.ts` / `svg-renderer.ts` / `layout.ts`）を新軸を受けられるよう拡張**する（app の `GroupByMode` と core union の同期 = TPL-20260623-02 と同型の target-set-sync）。
- **(B3)** `PreviewColumn.tsx` のセレクタを `GroupByMode` キーの配列/`satisfies Record<GroupByMode, …>` から生成する形へ置換し、メンバー追加漏れを型/レビューで捕まえる。
- bulk collapse（A1/B1）は**触らない**（軸非依存のため自動で新軸に効くことを AT で確認するだけ）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 追加のみ。既存の per-group ⊖/⊕・セレクタ挙動は不変。
- ドキュメント更新: `docs/tools/app.md` / `app.ja.md`（TPL-20260623-01）。
- テスト・examples への影響: なし（既存 examples で動作。新規 example 不要）。
- changeset: app のみの変更（core 不変）につき**不要**（`@karasu-tools/app` は changesets `ignore`）。

## Related TPLs

- [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) — 本 doc の中心。`GroupByMode` は複数箇所で消費されるリテラル union。軸追加時の追加漏れを silent にしないため、軸固有ロジックを最小化（selector 1 箇所）し、残りを軸非依存/off センチネル基準にする。**新規 TPL は起こさない**（本観点は既存 TPL が既にカバー。3-Yes の「既存 TPL 未掲載」を満たさない）。Group-by 軸は同 TPL の新しい代表インスタンス。
- [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md) — toolbar action 追加につき `docs/tools` 両ロケール反映（実装の指針 5）。
- [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) — bulk collapse は per-group collapse と同じ machinery を全 group に適用するだけ。全折り畳み時も全要素ちょうど一度配置 + 折り畳みエッジ端点保持の不変条件は core 側（#1865 / #1874）で担保済み。bulk 化で新たな回帰面は生まない。
