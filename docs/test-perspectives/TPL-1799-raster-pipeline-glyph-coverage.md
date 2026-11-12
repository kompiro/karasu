---
id: TPL-1799
title: "別ランタイムで再ラスタライズする経路は、ソースが出力しうる全グリフ/リソースをカバーする"
status: active
date: 2026-06-26
applicable_to:
  - "ブラウザ用に作った成果物（SVG 等）を、ヘッドレス/別ランタイムで再レンダリングする経路（PNG ラスタライズ、OGP 画像生成、PDF 化）"
  - "レンダラーが出力する装飾グリフ（絵文字マーカー・記号バッジ・アイコン）を、自前でフォント/アセットを供給するパイプラインに通す機能"
known_consumers:
  - karasu-nest-render-png
  - svg-renderer
discovered_from:
  - issue: "#1799"
  - root_cause_file: "functions/render.ts:FONT_PATHS"
related_to:
  - TPL-1001
  - TPL-219
  - TPL-1024
topic: renderer
scope:
  packages:
    - app
    - core
---

# TPL-1799: 別ランタイムで再ラスタライズする経路は、ソースが出力しうる全グリフ/リソースをカバーする

## 観点

ブラウザ向けに生成した成果物（karasu では SVG）を、**別のランタイムが自前のリソースを供給して再レンダリングする経路**（Workers の resvg-wasm による PNG 化など）では、その経路が **ソースの出力しうるグリフ集合の全体** をカバーしなければならない。よくあるケース（Latin・CJK 本文）だけを供給すると、頻度の低いグリフ（装飾用の絵文字マーカー・記号バッジ）が **豆腐（□）** に化ける。

ブラウザは OS のフォントスタックで暗黙にフォールバックするため、SVG をブラウザで見ている限りこの欠落は見えない。**ヘッドレスのラスタライザは暗黙のフォールバックを持たない** — 与えたフォント buffer がカバレッジの全てになる。「ブラウザで正しく見える」は「ラスタ経路でも正しく出る」を意味しない。

これはフォントに限らず一般化できる: 別ランタイムへ成果物を移す経路は、**ソース側が生成しうる全要素**（フォントグリフ・参照アセット・CSS 機能・外部リソース）を列挙し、その経路が供給できるか確認する。供給できないものは graceful に縮退するか、欠落として検知する。

## 想定される失敗モード

- レンダラーが装飾に絵文字（`👥` 所有チーム / `📦` リソース / `🔗` リンク / `🔐` 外部 / `⚠` `✦` `⚗` アノテーションバッジ）を inline テキストで出すが、ラスタ経路に Latin + CJK フォントしか積んでおらず、PNG で全絵文字が豆腐化（#1799 そのもの）。
- ブラウザ確認だけで「描画 OK」と判断し、ラスタ経路の欠落を見逃す。SVG エンドポイントのテストは通るが PNG は壊れている。
- 後日レンダラーに **新しい絵文字マーカー** を追加したとき、ラスタ経路のフォントカバレッジ拡張を忘れ、その新マーカーだけ豆腐化する（subset フォントだと特に再発しやすい）。
- CSS の `:target` / アニメーション / Web フォント等、ブラウザでしか効かない機能に依存した SVG を静的ラスタライズし、空白や崩れになる（同経路の既知の罠。AT-I の all-views→system フォールバックが対応例）。

## チェックリスト

別ランタイムで再ラスタライズする経路を追加/変更するとき:

- [ ] ソース側レンダラーが出力しうる **非 ASCII グリフを全列挙**したか（絵文字・記号バッジ・アイコン。`grep -rnP '[\x{2190}-\x{1FAFF}]'` 等で機械的に洗い出す）
- [ ] その全グリフを、ラスタ経路に供給するフォント/アセットがカバーしているか（カバーするフォントをフル同梱するか、subset なら全コードポイントを含めたか）
- [ ] **ブラウザ確認だけで済ませず**、ラスタ経路（resvg-wasm 等）で実際に描画して豆腐が無いか目視・自動検証したか [guard: `scripts/ci/raster-input.test.ts`]
- [ ] ブラウザ専用機能（CSS `:target` / Web フォント / アニメーション）に依存していないか。依存するなら静的経路で縮退させたか [guard: `scripts/ci/raster-input.test.ts`]
- [ ] レンダラーに新グリフを足す変更は、ラスタ経路のカバレッジ拡張も同 PR で行う運用になっているか [judgment]

## 既知の対処パターン

- **フォントはフル同梱で将来堅牢に**: subset は新マーカー追加で再発しやすい。monochrome Noto Emoji（~2MB）をフル同梱して全絵文字をカバー（#1799）。resvg は与えた全 buffer をフォールバック走査するので、buffer 配列に積むだけで per-family 指定は不要。
- **Node + resvg-wasm で事前確認**: Workers にデプロイする前に、Node から同じフォント buffer でラスタライズして豆腐が無いか確認する（CI の vitest では Workers ランタイムを再現できないため）。
- **ブラウザ専用 SVG の縮退**: CSS `:target` タブ束ね SVG は静的ラスタで本体が空白になるため、PNG では単一 view にフォールバック（`functions/render.ts` の `view` 既定 = `system`）。

## 関連テスト

- `docs/acceptance/karasu-nest-render-png.md` — AT-C4（絵文字マーカーが豆腐にならない）/ AT-C5（Node 事前確認）
- `packages/app/src/render/share-render.test.ts` — SVG 経路の生成（ラスタ前段）
- `packages/app/src/render/png-font-coverage.test.ts` — `PNG raster font coverage (TPL-1799, #1799)`。
  同梱フォントの cmap の和集合がレンダラーの出す非 ASCII マーカー（バッジ・ghost バッジ・縮退タブ）を
  すべてカバーすることと、`BUNDLED_FONTS` が `functions/render.ts` の読み込むフォント集合と一致することを
  assert する。マーカーの列挙はテスト内の手書きリストなので、新グリフを足すときはここへの追加が要る
- `scripts/ci/raster-input.test.ts` — チェックリスト 3・4 のガード。ラスタライザ（`@resvg/*`・`sharp`・`canvas` など）を
  読み込むモジュールを `functions/` と全 workspace パッケージの `src` の import graph（madge）から導き、ラスタ経路の表と
  一致させる。表の各行は、その経路が何をラスタライズするかを決める関数（`functions/render.ts` は
  `sharePngSource`、nest の OGP 画像は `ogImageSource`。`rasterizeOgPng` はその戻り値の branded 型しか受け取らない）を
  呼ぶ。そのうえで Render equivalence と同じコーパス（examples の全 entry と AT の全 `krs` fence を
  `synthesizeSharePayload` で 1 つの payload にしたもの）を各経路の入口に通し、view 指定なし・各 view × light / dark ×
  shape / icon × OGP 枠の有無で、全モデルが描けること、出力の全文字（数値文字参照も展開）が経路のフォントの cmap の
  和集合に入ること、静的ラスタで落ちる要素・CSS（許可リスト外の要素と CSS プロパティ、`:` を含むセレクタ、at-rule、
  文書外への参照）が無いことを assert する。判定は出力に対して行うので、グリフの書き方（リテラル・エスケープ・
  `String.fromCodePoint`）を問わない。PNG の view 既定（`system`）を外すと all-views の `:target` で落ちる。
  - 3 をガードとする理由: 3 の「新しい箇所」はラスタ経路そのもの。新しい経路は表に載るまで落ち、載せればその入口に
    コーパス全体が通る。経路の発見は静的に解決できる import に限る（実行時に組み立てた specifier と、`functions/`・
    `packages/*/src` の外のファイルは見えない。後者は build と CI のスクリプトで、利用者に届く画像を描かない）
  - 1 をガードにしない理由: 1 の「新しい箇所」はグリフで、検査するのはコーパスが描いたものだけ。どのモデルも通らない
    分岐のグリフは、レンダラーが出しうるものの全列挙にならない。例: 縮退タブの `◇`（`degraded-tabs.ts`）は team /
    boundary でグループ化したときだけ描かれ、ラスタ経路はグループ化しない。同じ `◇` は `@planned` バッジとして
    ラスタ経路に来るので文字としては検査されるが、縮退タブの記号だけを別の文字に変えてもこのテストは落ちない
