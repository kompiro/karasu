---
id: TPL-2789
title: "流し込んだ DOM に後から当てた状態は、流し込み直しと同じ契機で当て直す"
status: active
date: 2026-09-15
applicable_to:
  - "`dangerouslySetInnerHTML`（または `innerHTML` 代入）で流し込んだ部分木に、effect やイベントハンドラから class・属性・フォーカスなどを命令的に当てるコンポーネント"
  - "流し込む文字列が大きく（描画済み SVG など）、親の再レンダリングが流し込みと無関係な理由で頻繁に起きる描画面"
  - "state は正しいのに DOM の見た目だけが間欠的に食い違う E2E flake の調査"
known_consumers:
  - preview-pane
  - cross-navigation-highlight
discovered_from:
  - issue: "#2789"
  - issue: "#1171"
  - root_cause_file: "packages/app/src/components/PreviewPane.tsx:506"
related_to:
  - TPL-1171
  - TPL-2800
  - TPL-1053
topic: app-ui
scope:
  packages:
    - app
---

# TPL-2789: 流し込んだ DOM に後から当てた状態は、流し込み直しと同じ契機で当て直す

## 観点

描画済みの SVG / HTML を `dangerouslySetInnerHTML` で流し込み、その上にアプリ側の状態
（ハイライトの class など）を effect で当てる構成では、**DOM を作り直す契機**と
**状態を当て直す契機**が 2 つ存在する。この 2 つが一致していないと、片方だけが起きた
ときに状態が黙って消える。

React 19 は props を参照で比較し、`dangerouslySetInnerHTML` のオブジェクトが前回と
別物なら、中の文字列を比べずに `innerHTML` を代入し直す（React 18 は文字列を比べていた）。
JSX にインラインで `{{ __html: svg }}` と書くと、オブジェクトは毎レンダリング新しいので、
**無関係な理由の再レンダリングでも部分木が作り直される**。一方、状態を当てる effect は
依存（`[highlightedNodeId, svg]` など）が変わったときしか走らない。結果として
「作り直し」は毎回起き、「当て直し」は起きない。

発見事例（#2789）: Deploy のコンテナをクリックして System に移ると、実現先ノードに
`.karasu-highlighted` が付く。失敗した CI run の trace では、クリック直後のスナップショットに
class が付いており、約 12 秒後のスナップショットでは同じ SVG から class 属性ごと消えていた。
URL hash は `#krs-system-root:Web` のままで、state 上のハイライトは保たれていた。つまり
待ち方でも state 遷移でもなく、その間に届いた無関係な再レンダリングが SVG を流し込み直し、
effect が走らなかっただけである。runner が重く、再レンダリングがクリックとアサーションの
間に割り込んだ回だけ失敗した。

## 想定される失敗モード

- 状態（ハイライト・選択・展開など）が、一度付いてから数百ミリ秒〜数秒後に理由なく消える。
  次に図そのものが変わるまで戻らない
- E2E では「CI の負荷が高いときだけ落ちる」「再実行すると通る」flake として現れ、
  待機不足（TPL-1171）と誤診されやすい。timeout を伸ばしても直らない
- テストヘルパーが症状に合わせて回避する（「再レンダリングで作り直されるので要素を取り直す」）。
  回避がコメントで正当化されると、欠陥が仕様として読まれる
- 逆向きの隠れ依存: 状態を「消す」操作のテストが、実はその操作に伴う再レンダリングの消去で
  通っている。#2789 では背景クリックでハイライトが消えることを E2E が確かめていたが、背景クリックの
  経路は解除を呼んでおらず、mouseDown の再レンダリングが class を消していただけだった
  （URL hash には `:Web` が残っていた）。流し込みを直すとそのテストが落ちる
- 状態を当てていない描画面でも、大きな SVG を毎レンダリング parse し直す無駄として残る

## チェックリスト

流し込んだ DOM に命令的に状態を当てる実装・修正のとき:

- [ ] `{ __html }` オブジェクトの identity が、流し込む文字列にだけ依存しているか
      （`useMemo(() => ({ __html: svg }), [svg])`）。インラインのオブジェクトリテラルになっていないか
- [ ] 状態を当てる effect の依存に同じ文字列が入っていて、作り直しと当て直しが同じ値で動くか
- [ ] 「同じ値・新しいオブジェクトの props で再レンダリングする」テストを 1 回挟み、
      状態が残ることと、DOM ノードが同一であることの両方を assert したか
- [ ] 修正前のコードでそのテストが落ちることを確認したか
- [ ] 状態の付与・解除を E2E で確かめるとき、DOM だけでなく state を反映するもの（URL hash など）も
      assert したか。DOM だけの assert は、再レンダリングによる消去と本物の解除を区別できない
      （flake の調査では trace の URL と DOM スナップショットを突き合わせる）

## 既知の対処パターン

- `PreviewPane` は `svgHtml = useMemo(() => ({ __html: svg }), [svg])` を渡す（#2789）。
  これで `innerHTML` の代入は `svg` が変わったときだけ起き、ハイライトの effect も同じ
  コミットで走る。メモ化は性能のためではなく正しさのためなので、その旨をコメントに残す
- 図を描く面を共有コンポーネントに集める（TPL-2800）と、この対処が 1 箇所で済む。
  素の `<div>` に流し込む面が並存すると、同じ修正を面の数だけ入れる必要がある
- trace の取り出し: `gh run download <run-id> -n playwright-test-results` で `trace.zip` を得て、
  `0-trace.trace` の `frame-snapshot` を snapshotName（`after@call@N`）ごとに見ると、
  どの操作の前後で DOM が変わったかと、その時点の URL が分かる

## 関連テスト

- `packages/app/src/components/PreviewPane.test.tsx` ›
  `keeps .karasu-highlighted across a re-render that leaves the diagram unchanged (#2789)`
- `packages/app/src/components/PreviewPane.test.tsx` ›
  `calls onClearHighlight when the diagram background is clicked` /
  `keeps the highlight when the diagram background is dragged`
- `packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts` ›
  `Clicking a deploy container switches to System with the realizes target highlighted (AC-2.1, AC-2.2, AC-2.3)`
  （付与と解除の両方で URL hash も assert する）
