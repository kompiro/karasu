---
type: product
---

# AT: export SVG を compile の debounce の後ろで組み立てる（#2758）

- **日付**: 2026-09-07
- **関連 Issue**: [#2758](https://github.com/kompiro/karasu/issues/2758)（親: [#2757](https://github.com/kompiro/karasu/issues/2757) slice A）
- **Related TPLs**: [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（export はスクリーンと同じ表示条件を運ぶ。debounce するのはコンテンツだけで、displayMode / theme / groupBy / facets は live のまま）
- **対象ファイル**:
  - `packages/app/src/hooks/useViewSvg.ts`（5 つの export builder と live entity view を、落ち着いた content で呼ぶ）
  - `packages/app/src/hooks/useDebouncedValue.ts`（新規: 値が `delayMs` のあいだ変わらなかったときだけ返す汎用 hook）
  - `packages/app/src/hooks/useDebouncedCompile.ts`（`DEBOUNCE_MS` を export し、可視ビューの compile と同じ窓を共有する）
  - `packages/app/src/components/PreviewColumn.tsx`（消費側: Export アクションと All layers iframe。変更なし）

> `useViewSvg` は `buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllLayersSvgOrg` / `buildDrillDownSvgOrg` / `buildAllViewsSvg` を `fileContent` で key した `useMemo` の中で走らせていた。`handleEditorChange` は編集のたびに `UPDATE_FILE_CONTENT` を dispatch するので、1 打鍵ごとにモデル全体が main thread 上で 3 回描かれていた（Dify モデルで約 3 秒）。可視ビューの compile は `useDebouncedCompile` で 300 ms debounce されているが、export builder は素通しだった。builder に渡す content（`.krs` と `.krs.style` の組）を同じ 300 ms 窓で落ち着いた値に置き換え、窓が明けるまでは前回の export を保つ。新しい編集が来たら pending の build は捨てられ、古い編集が新しい編集の上に落ちることはない（#1534 の規則）。

## 受け入れ条件

### AC-1: 入力ごとに builder が走らない

- [x] TC-A: マウント直後の export SVG は遅延なく得られる（最初の値は debounce しない）。5 つの builder はマウントでちょうど 1 回ずつ走る

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export builders run behind the compile debounce (#2758) › returns the export SVGs immediately on mount: the first value is not delayed (TC-A)

- [x] TC-C: 50 ms 間隔の 8 回の連続編集のあいだ、5 つの builder は 1 度も呼ばれず出力も動かない。窓が明けると各 builder がちょうど 1 回、最後の編集内容で走り、出力はちょうど 1 回だけ変わる

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export builders run behind the compile debounce (#2758) › runs each export builder at most once per window across a burst of edits (TC-C)

### AC-2: 落ち着いた内容と export が一致する（stale export なし）

- [x] TC-B: A → B → C と窓の内側で編集すると、窓が明けるまでは A の export のまま。明けた後の `allViewsSvg` は C を直接 `buildAllViewsSvg` した結果と一致し、B は 1 度も build されない

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export builders run behind the compile debounce (#2758) › keeps the previous export while typing, then settles on the last edit; the intermediate edit is never built (TC-B)

- [x] TC-E: live entity view も同じ落ち着いた content を消費する。`renderEntityView` は窓の内側で呼ばれず、明けた後に 1 回走って新しい entity が現れる（スクリーンと export が同じ編集を指す）

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export builders run behind the compile debounce (#2758) › feeds the live entity view the same settled content, so the screen and the exports stay in step (TC-E)

### AC-3: 非コンテンツ入力は窓を待たずに届く（TPL-219）

- [x] TC-D: displayMode の切り替えはタイマーを進めなくても export に反映され、その内容は icon mode で直接 build した結果と一致する

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > export builders run behind the compile debounce (#2758) › applies a display-mode flip without waiting for the window (TPL-219 parity) (TC-D)

- [x] groupBy（team / boundary）と facet の切り替えが従来どおり export と entity view に届く（既存テストが変更なしで通る）

  > ✅ Automated — `packages/app/src/hooks/useViewSvg.test.tsx` › useViewSvg > groupBy threading to export SVGs (#1879) › reactively re-renders the export SVGs when groupBy flips ／ reactively re-renders the live entity view when groupBy flips (#1983)

### AC-4: `useDebouncedValue` の契約

- [x] 最初の値は即時に返り、timer も残らない。変更は `delayMs` のあいだ変わらなかったときだけ反映され、変更のたびに窓が仕切り直される（burst の途中の値は 1 度も返らない）

  > ✅ Automated — `packages/app/src/hooks/useDebouncedValue.test.tsx` › useDebouncedValue › returns the first value immediately, with no delay on mount (TC-1) ／ holds the previous value until the new one has stayed unchanged for delayMs (TC-2) ／ restarts the window on every change, so only the last value of a burst lands (TC-3)

- [x] 窓の内側で入力が settled 値に戻るとそのまま保たれ timer も残らない。object の identity は変わるまで保たれる。unmount で pending timer が消える（古い値が新しい値の上に落ちない: #1534 の規則）

  > ✅ Automated — `packages/app/src/hooks/useDebouncedValue.test.tsx` › useDebouncedValue › keeps the settled value, with no timer left, when the input returns to it inside the window (TC-4) ／ preserves the identity of an object value until it changes (TC-5) ／ clears the pending timer on unmount, so a stale value cannot land afterwards (TC-6)

### 手動確認

- [ ] M-1: [https://karasu.kompiro.dev/](https://karasu.kompiro.dev/) に 10k 行規模の大きなモデル（#2757 の計測に使った、reverse した Dify モデル `/workspaces/dify/index.krs` が基準）を貼り、連続してタイプする。エディタが入力に追随し、打鍵ごとに固まらない
- [ ] M-2: 入力を止めて 1 秒ほど待ってから Export → All diagrams を実行すると、ダウンロードされた SVG が今画面に出ている図と同じ内容になっている（最後の編集が反映され、途中の編集の残骸がない）
- [ ] M-3: All layers を開いたまま編集すると、入力中はパネルが前回の内容を保ち、止めて窓が明けると最新の内容に置き換わる

> 未チェック項目について:
>
> - M-1 〜 M-3 は main thread の体感（追随するか）と、ダウンロードされた実ファイルの内容が対象で、jsdom では判定できない。実機で再実行する前提の項目

## 意図的に対象外

- Export クリック時 / All layers を開いたときに遅延 build する案（コストをゼロにできる）。debounce で足りるかを見てから判断する follow-up として #2758 に記されている
- core 側の per-level コスト（#2759 / #2760 / #2761）

## 検証方法

```
cd packages/app && pnpm vitest run src/hooks/useViewSvg.test.tsx src/hooks/useDebouncedValue.test.tsx
```
