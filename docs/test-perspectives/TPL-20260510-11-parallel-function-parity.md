---
id: TPL-20260510-11
title: "並列に存在する関数ファミリは parameter parity を保つ"
status: active
date: 2026-05-10
applicable_to:
  - "ビュー種別ごとに複製される関数群（compileProject vs compileProjectOrgView, drill-down vs multi-level, system view vs deploy view vs org view ...）"
  - "API 対称性のために宣言した optional parameter が、各関数で実際に挙動に反映されているか"
known_consumers:
  - drill-down-svg
  - multi-level-svg
  - compile-project
  - compile-project-org-view
related_to:
  - TPL-20260510-06
discovered_from:
  - issue: "#219"
  - issue: "#160"
  - issue: "#1273"
  - root_cause_file: "packages/core/src/renderer/drill-down-svg.ts"
  - root_cause_file: "packages/core/src/index.ts:480"
topic: build
scope:
  packages:
    - core
---

# TPL-20260510-11: 並列に存在する関数ファミリは parameter parity を保つ

## 観点

karasu には「ビューごとに分かれた似た形の関数群」が複数ある。例:

- `compileProject` / `compileProjectOrgView`（system view と org view の compile pipeline）
- `buildDrillDownSvg` / `buildFullViewSvg` / `buildExportSvg` / それぞれの `*Org` 版
- `useSystemView` / `useDeployView` / `useOrgView` の hook 群

これらは **シグネチャが似ているが内部実装は独立している** ことが多い。片方の関数に新しい parameter（`displayMode`, `styleSource`, `systemSheetCount` など）を渡せるよう拡張したとき、**もう一方は古いまま** になりがち。型として optional なら呼び出し側はコンパイルが通るので、**「渡しているのに無視されている」** タイプの silent failure になる。

#219 では `buildDrillDownSvg` 系が `styleSource` を受け取りつつ内部で使っていなかった（API 対称性のためだけに宣言）。#160 では `compileProjectOrgView` が `analyze()` に `systemSheetCount` を渡し忘れていた（system view の compile では渡している）。どちらも同じ「parallel implementation の drift」パターン。

## 想定される失敗モード

- 呼び出し側は parameter を渡しているのに、**特定の view / mode でだけ反映されない**
- 「system view では効くのに org view では効かない」「export SVG には反映されるが drill-down では反映されない」のような **view 種別依存の挙動差** が観測される
- TypeScript の型は通るので、PR レビューでも気づきにくい
- `analyze()` のような共通 helper を呼ぶ関数群で、**system sheet 数のような cross-cutting な情報** を渡し忘れると、warning の精度が view ごとに違うという形で表面化する

## チェックリスト

並列関数ファミリのいずれかを変更するとき、以下を確認する:

- [ ] 同じ family に属する **兄弟関数の一覧** が把握できているか（grep で関数名 / シグネチャの近さから機械的に洗い出す）
- [ ] 追加・変更した parameter が、兄弟関数すべてで **実際に内部の振る舞いに繋がっている** か（型シグネチャだけでなく実装本体を見る）
- [ ] 共通 helper（`buildStyles`, `analyze`, `buildExportSvg` など）に同じ引数を同じ意図で渡しているか（一方だけ default 値で呼んでいないか）
- [ ] family 共通の振る舞いを **共通ヘルパに抽出** できないか（重複させ続ける限り drift は再発する）
- [ ] family 横断の test（同じ入力を全 view 種別で compile し、振る舞いの一致を assert）が 1 件でもあるか

## 既知の対処パターン

- **共通 helper への抽出** が最も確実。`buildStyles(displayMode, styleSource)` のような小さな関数に切り出して、family 全員に呼ばせる。今回 #219 の修正もこの形（drill-down と multi-level が同じ `buildStyles` を共有）
- 兄弟関数の差分を検出する単体テストを置く: 同じ入力で family 全員を呼び出し、共通すべき出力プロパティ（warning 数 / sheet 数 / scale など）が一致することを assert する
- どうしても family 内で振る舞いを分岐させる必要がある場合、その差は **コメントまたは Design Doc で明記** する。default で「全員揃える」、明示で「揃えない理由を残す」という方針

## 関連テスト

- `packages/core/src/renderer/drill-down-svg.test.ts`
- `packages/core/src/renderer/multi-level-svg.test.ts`
- `packages/core/src/index.test.ts` — `compileProject` / `compileProjectOrgView` 周辺
- `packages/core/src/svg-builder-family-parity.test.ts` — SVG builder family の family-wide parity meta-test。`SVG_BUILDER_FAMILY` に登録された全 builder を共通 fixture + 共通 styleSource / displayMode で呼び出し、出力に probe color が現れること（styleSource threading）と icon ↔ shape の出力が異なること（displayMode threading）を assert する（gap GB11-1 / #1273）
