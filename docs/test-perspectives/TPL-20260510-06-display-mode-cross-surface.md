---
id: TPL-20260510-06
title: "表示モード / グローバルレンダリング切替は全描画面の点検と precedence 設計が必要"
status: active
date: 2026-05-10
applicable_to:
  - "displayMode のような描画全体に影響するグローバルなトグルを追加・変更する機能"
  - "テーマ・モード・スタイルカスケードに優先順位の差を持ち込む変更"
known_consumers:
  - svg-builder
  - layout
  - icon-theme
  - default-style
  - style-resolver
  - legend-footer
  - node-detail-panel
  - full-view-svg
  - export-svg
discovered_from:
  - issue: "#1001"
  - issue: "#279"
  - issue: "#132"
  - issue: "#183"
  - root_cause_file: "packages/core/src/renderer/svg-builder.ts:257"
  - root_cause_file: "packages/core/src/builtins/icon-theme.ts"
  - root_cause_file: "packages/core/src/resolver/style-resolver.ts"
  - root_cause_file: "packages/app/src/hooks/useViewSvg.ts"
related_to:
  - TPL-20260510-05
topic: renderer
scope:
  packages:
    - core
    - app
---

# TPL-20260510-06: 表示モード / グローバルレンダリング切替は全描画面の点検と precedence 設計が必要

## 観点

`displayMode = "icon" | "shape"` のような **描画全体に影響するグローバルなトグル** は、見かけ以上に多くの場所と接点を持つ。新しいモードを追加する、もしくは既存モードの挙動を変えるとき、以下のすべての面で「このモードが正しく扱われているか」を能動的に点検する必要がある。

1. **各描画面（surface）が個別にモードを認識しているか** — レイアウト本体だけでなく、legend / icon card frame / detail panel の icon / 各種 footer / マージンなど、SVG / DOM を生成するすべての関数が「このモードのとき何を描くか」を明示的に決めているか。**主描画と並列の代替描画パス**（Full View、export SVG、印刷用、画像書き出しなど）も同様に対象。これらは別 hook / 別関数で構築されるため、主描画の修正だけでは追従しない（#183: `useFullViewSvg` が `displayMode` を `buildExportSvg` に渡し忘れていた）
2. **スタイルカスケードでモード由来のプロパティが上書きされない設計になっているか** — モード固有のテーマ（icon-theme など）が「ユーザーが上書きできるレイヤー」より前に挿入されていると、ユーザー stylesheet（あるいは built-in stylesheet）が無自覚にモードを破壊する
3. **診断・警告系がモードを理解しているか** — モード由来の意図的な override を「style 衝突」と誤検知して false-positive な warning を出さないか
4. **同じデータの cross-surface 表示が一貫しているか** — 例: icon card に出る pictogram と NodeDetailPanel に出る kind icon が同じソースから来ているか（→ TPL-20260510-05 とも関連）

## 想定される失敗モード

- 新しい display mode を有効にすると **特定の描画面だけ** 旧モードのまま残る（legend が消える / 形が変わらない / 枠が描かれない）
- ユーザーの `.krs.style` で何気なく書いた `domain { shape: box; }` のような宣言が icon mode を破壊する（モードの意図に反した override が成立してしまう）
- スタイル resolver が「同じプロパティを別ソースが定義している」と検知して **意図的な override に false-positive warning** を出す
- icon card には正しい pictogram が出るのに、NodeDetailPanel ヘッダの icon が別系統から引かれていて **食い違う**

これらは個別には小さなバグに見えるが、根は同じ「グローバル・トグルが追加されたが、すべての描画面 / カスケード / 診断 / 共有データが追従していない」ことにある。

## チェックリスト

新しい display mode を追加するとき・既存モードの挙動を変えるとき、以下を確認する:

- [ ] モードを参照する描画面の一覧（legend / card frame / detail panel / footer / 各 builder / **Full View / export SVG など代替描画パス**）が洗い出されているか
- [ ] モード固有のテーマシート（`ICON_THEME_STYLE_SOURCE` など）が、ユーザー stylesheet より **後** に積まれる（= 高優先度になる）カスケード構成になっているか。または、モード支配下のプロパティが「ユーザーが上書きできない」と明示されているか
- [ ] スタイル resolver / 診断ロジックが「モード由来の意図的な override」を warning から除外しているか（false-positive チェック）
- [ ] 同じ kind / data に対する表示が、すべての surface（icon card / NodeDetailPanel / legend / tooltip / etc.）で **同一のソース** から引かれているか（→ TPL-05 のチェックリストとも合わせて確認）
- [ ] `.krs.style` でモードを破壊しようとする stylesheet を書いた fixture で、モードが正しく勝つことが回帰テストで担保されているか

## 既知の対処パターン

- カスケード順を `[builtinSheet, modeThemeSheet, ...userStyleSheets]` と素朴に定義してしまうと user sheet が mode を壊す。**モードによってロックすべきプロパティ（`shape` など）は resolver 側で明示的にユーザー sheet からの寄与を除外する** 設計が安全（#279 のアプローチ）
- 描画面の一覧化は、`displayMode` を消費している箇所を grep で抽出し、**「mode を見ていない描画関数 = 暗黙に shape mode を仮定している」** という前提でレビューする
- pictogram のような共有アセットは「id → 単一ソース」の解決関数を 1 つ持ち、各 surface はそれを呼ぶだけにする（複数経路で個別解決させない）
- 診断 / 警告は「同 selector / property の 2 つ以上のソース」だけを根拠に出さず、**そのソースの組合せが intentional cascade（builtin + mode theme）なのか accidental conflict なのか** を判定してから出す

## 関連テスト

- `packages/core/src/builtins/icon-theme.test.ts`
- `packages/core/src/builtins/default-style.test.ts`
- `packages/core/src/renderer/legend-footer.test.ts`
- `packages/app/src/hooks/useViewSvg.test.tsx` — Full View / All Layers regression fence for #183 (`displayMode` threading from the hook into `buildAllLayersSvg`)
- `packages/core/src/displaymode-meta.test.ts` — curated meta-test enumerating every public SVG-producing entry point that consumes `displayMode`. **Adding a new SVG-producing entry to the public API requires registering it in `DISPLAY_MODE_CONSUMERS`** so the next #183-style missed surface is caught at code review
- `packages/app/src/icon-source-consistency.test.tsx` — NodeDetailPanel と icon-card が同一 kind に対して同一 icon 名を参照していることを検査するクロス surface 整合テスト（Issue #132 §3 の回帰防止、Issue #1246）
