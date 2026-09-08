---
type: product
---

# AT: export SVG を必要になったときだけ組み立てる（#2758）

- **日付**: 2026-09-08
- **関連 Issue**: [#2758](https://github.com/kompiro/karasu/issues/2758)（親: [#2757](https://github.com/kompiro/karasu/issues/2757) slice A）
- **Related TPLs**: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（export はスクリーンと同じ表示条件を運ぶ。遅延するのはコンテンツだけで、displayMode / theme / groupBy / facets は live のまま）
- **対象ファイル**:
  - `packages/app/src/hooks/useViewSvg.ts`（export bundle は getter で要求時に組み立てる。All layers の SVG はパネルが開いている間だけ組み立てる）
  - `packages/app/src/hooks/useDebouncedValue.ts`（新規: 値が `delayMs` のあいだ変わらなかったときだけ返す汎用 hook）
  - `packages/app/src/hooks/useDebouncedCompile.ts`（`DEBOUNCE_MS` を export し、可視ビューの compile と同じ窓を共有する）
  - `packages/app/src/state/preview-context.tsx` / `packages/app/src/hooks/usePreviewContextValue.ts` / `packages/app/src/state/active-view-data.ts`（context は SVG 文字列でなく getter と `exportBundlesAvailable` を運ぶ）
  - `packages/app/src/components/PreviewColumn.tsx` / `PreviewViewControls.tsx`（消費側: Export アクションはクリック時に getter を呼ぶ。有効/無効は「組み立てられるか」で決める）

> `useViewSvg` は `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllLayersSvgOrg` / `buildDrillDownSvgOrg` / `buildAllViewsSvg` を `fileContent` で key した `useMemo` の中で走らせていた。`handleEditorChange` は編集のたびに `UPDATE_FILE_CONTENT` を dispatch するので、1 打鍵ごとにモデル全体が main thread 上で 3 回描かれていた。最初の版は builder に渡す content を 300 ms の debounce で落ち着かせたが、ブラウザ実測（Dify モデル、dev build）では 1 bundle が数秒かかるため、入力が 300 ms 途切れるたびに数秒止まった（#2776 のレビュー指摘）。そこで bundle は **要求時に組み立てる**: hook は getter を返し、export のクリックが自分の bundle を 1 回だけ組み立てる。画面に出ている All layers パネルの SVG だけは、パネルが開いている間、落ち着いた content から組み立て直す。content の debounce は残し、All layers と live entity view が可視ビューの compile と同じ編集を指すようにする。

## 受け入れ条件

### AC-1: 入力で export bundle が組み立てられない

- [x] TC-A: マウントでも、8 回の連続編集の途中でも、窓が明けた後でも、5 つの export builder は 1 度も走らない。`exportAvailable` は content があれば true、All layers の SVG はパネルが閉じていれば undefined

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › builds nothing on mount and nothing while typing: a getter is the only trigger (TC-A)

- [x] TC-B: getter を呼ぶと、その bundle だけが 1 回組み立てられ、2 回目の呼び出しは同じ結果を返す（他の bundle は走らない）

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › a getter builds its own bundle once and hands the same result back afterwards (TC-B)

### AC-2: 落ち着いた内容と export が一致する（stale export なし）

- [x] TC-C: A → B → C と窓の内側で編集すると、窓が明けるまで getter は A の export を返す。明けた後の `getAllViewsSvg()` は C を直接 `buildAllViewsSvg` した結果と一致し、B は 1 度も build されない

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › serves the settled edit: the previous export while typing, the last edit after the window, never the intermediate one (TC-C)

- [x] TC-E: All layers の SVG はパネルが開いた時点で組み立てられ、開いたまま編集すると窓が明けた後に最後の編集で 1 回だけ組み立て直され、閉じると undefined に戻る

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › builds the All-layers SVG only while the panel is open, from the settled content (TC-E)

- [x] TC-F: live entity view も同じ落ち着いた content を消費する。`renderEntityView` は窓の内側で呼ばれず、明けた後に 1 回走って新しい entity が現れる

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › feeds the live entity view the settled content, so the screen and the exports stay in step (TC-F)

### AC-3: 非コンテンツ入力は窓を待たずに届く（TPL-219）

- [x] TC-D: displayMode の切り替えはタイマーを進めなくても getter の結果に反映され、その内容は icon mode で直接 build した結果と一致する

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export bundles are built on demand, from settled content (#2758) › applies a display-mode flip without waiting for the window (TPL-219 parity) (TC-D)

- [x] groupBy（team / boundary）と facet の切り替えが従来どおり export と entity view に届く（既存テストが getter 経由で通る）

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > groupBy threading to export SVGs (#1879) › reactively re-renders the export SVGs when groupBy flips ／ reactively re-renders the live entity view when groupBy flips (#1983)

### AC-4: export の UI はクリック時に組み立てる

- [x] Export Drill-down / Export All Diagrams / Open all views は、クリック時に getter を呼んだ結果を渡す。有効/無効は `exportBundlesAvailable`（落ち着いた content があり parse error がない）で決まり、All layers のトグルも同じ条件で有効になる

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › Export Drill-down SVG calls onExportSvg with -drilldown suffix ／ Export All Diagrams SVG calls onExportSvg with all-diagrams.svg filename ／ Export All Diagrams SVG is disabled when no export bundle can be built ／ Show All Layers button is disabled when no export bundle can be built; `packages/app/src/state/active-view-data.test.ts` › selectActiveViewData

### AC-5: `useDebouncedValue` の契約

- [x] 最初の値は即時に返り、timer も残らない。変更は `delayMs` のあいだ変わらなかったときだけ反映され、変更のたびに窓が仕切り直される（burst の途中の値は 1 度も返らない）

  > ✅ Automated — `packages/app/src/hooks/useDebouncedValue.test.tsx` › useDebouncedValue › returns the first value immediately, with no delay on mount (TC-1) ／ holds the previous value until the new one has stayed unchanged for delayMs (TC-2) ／ restarts the window on every change, so only the last value of a burst lands (TC-3)

- [x] 窓の内側で入力が settled 値に戻るとそのまま保たれ timer も残らない。object の identity は変わるまで保たれる。unmount で pending timer が消える（古い値が新しい値の上に落ちない: #1534 の規則）

  > ✅ Automated — `packages/app/src/hooks/useDebouncedValue.test.tsx` › useDebouncedValue › keeps the settled value, with no timer left, when the input returns to it inside the window (TC-4) ／ preserves the identity of an object value until it changes (TC-5) ／ clears the pending timer on unmount, so a stale value cannot land afterwards (TC-6)

### 手動確認

- [ ] M-1: [https://karasu.kompiro.dev/](https://karasu.kompiro.dev/) に 10k 行規模の大きなモデル（#2757 の計測に使った、reverse した Dify モデル `/workspaces/dify/index.krs` が基準）を貼り、連続してタイプする。エディタが入力に追随し、打鍵ごとに固まらない
- [ ] M-2: 入力を止めて 1 秒ほど待ってから Export → All diagrams を実行すると、クリック時に bundle が組み立てられ（大きなモデルでは数秒）、ダウンロードされた SVG が今画面に出ている図と同じ内容になっている（最後の編集が反映され、途中の編集の残骸がない）
- [ ] M-3: All layers を開いた時点で SVG が組み立てられて表示される。開いたまま編集すると、入力中はパネルが前回の内容を保ち、止めて窓が明けると最新の内容に置き換わる。閉じている間は編集しても組み立てが走らない（打鍵が止まらない）

> 未チェック項目について:
>
> - M-1 〜 M-3 は main thread の体感（追随するか）と、ダウンロードされた実ファイルの内容が対象で、jsdom では判定できない。実機で再実行する前提の項目

## 意図的に対象外

- Web Worker で bundle を組み立てて export クリック時の数秒の停止も消す案。クリックは利用者の操作なので今回は対象外
- core 側の per-level コスト（#2759 / #2760 / #2761）

## 検証方法

```
cd packages/app && pnpm vitest run src/hooks/useViewSvg.test.tsx src/hooks/useDebouncedValue.test.tsx
```
