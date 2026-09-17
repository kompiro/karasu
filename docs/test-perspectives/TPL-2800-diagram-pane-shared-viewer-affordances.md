---
id: TPL-2800
title: "図を描くペインは共有ビューアコンポーネントを通す — サブモードごとに操作系を落とさない"
status: active
date: 2026-09-11
applicable_to:
  - "既存ビューの中に「描く図を差し替えるサブモード」を追加するとき（entity view / org tree view / team dependencies のような boolean で切り替わる表示）"
  - "レンダリング済み SVG / HTML をアプリ側の DOM に流し込む描画面を新設するとき"
  - "ビューア操作（フィット・ズーム・パン・詳細パネル・診断バナー）を持つコンポーネントに、それを持たない兄弟描画面が並ぶとき"
known_consumers:
  - preview-pane
  - entity-view
  - org-tree-view
  - team-dependencies-view
discovered_from:
  - issue: "#2800"
  - issue: "#2799"
  - root_cause_file: "packages/app/src/components/PreviewColumn.tsx:299"
  - root_cause_file: "packages/app/src/components/PreviewPane.tsx:148"
related_to:
  - TPL-219
  - TPL-1983
  - TPL-1537
topic: app-ui
scope:
  packages:
    - app
---

# TPL-2800: 図を描くペインは共有ビューアコンポーネントを通す — サブモードごとに操作系を落とさない

## 観点

[TPL-219] は「オプションを全 call site に通す」漏れ、[TPL-1983] は「制限 gate の配置
非対称」を守る。本観点はその**ビューア側**: 同じ種類のコンテンツ（描かれた図）を出す
描画面が複数あるとき、**操作系を持つ経路と持たない経路が並存する**と、ユーザーから見て
同じ「図」なのに触れる操作が面ごとに違う、という形で壊れる。

操作系（フィット・ズーム・パン・詳細パネル・診断バナー）は 1 つのコンポーネントに
実装され、そのコンポーネントを**通った図だけ**がそれを得る。サブモードを
`dangerouslySetInnerHTML` で素の `<div>` に流し込むのは書くのが一番速いので、
サブモードが増えるたびにコピーされる。**追加したサブモードがどのコンポーネントを
通っているかは、機能のテスト（「entity が描かれているか」）では検出できない** —
描かれてはいるからである。

発見事例（#2800 / #2799）: entity view は `.preview-container` の外に置かれ、
`max-width/max-height: 100%` も `PreviewPane` の wheel リスナ（#1537 の修正）も
届いていなかった。Dify モデルの `IdentityAccess` の ER 図は 36,053px 幅で、
スクロールしかないペインでは全体を一度も見られない。さらに `isEntityViewOpen` が
ドリル間で sticky なため、同じトグル状態でもレベルによってズームできたりできなかったりし、
「時々おかしい」という形で報告された（原因の特定を遅らせる典型形）。

## 想定される失敗モード

- 同じ図なのにビューによってズーム・パン・フィットができない（ユーザーには「壊れている」ではなく
  「時々おかしい」と見える — ペイン選択が別の状態に gate されているため）
- レンダラが返した診断がアプリ側で受け取られず、サブモードだけ「古い図が黙って出る」
- 共有コンポーネント側の改善（ズーム、ホバー、詳細パネル、テーマ）がサブモードに波及せず、
  面ごとの差が時間とともに開く
- 新しいサブモードが直前のサブモードの素の `<div>` をコピーして生まれ、欠落が複製される

## チェックリスト

図を描く新しい描画面・サブモードを追加するとき:

- [ ] その面は共有ビューアコンポーネントを通っているか（アプリ内で
      `dangerouslySetInnerHTML` を検索し、新しい呼び出しが増えていないか確認する）
- [ ] レンダラが返す診断・警告を受け取って表示しているか（返り値を捨てていないか）
- [ ] ペインの構造そのものをテストで固定したか（「ノードが描かれている」ではなく
      「共有コンテナの中にあり、ペイン幅に収まり、ホイールで transform が変わる」）
- [ ] 修正前のコードでそのテストが落ちることを確認したか（構造のテストは
      通りやすく、実質何も守っていないことがある）

## 既知の対処パターン

- サブモードは「別の DOM」ではなく「同じコンポーネントに別の SVG を渡す」として実装する。
  ペイン固有のマーカークラスが要るなら、共有コンポーネントに `className` を足して
  `preview-pane--<mode>` を載せる（#2800 の形）
- 共有コンポーネントに渡す周辺データは、そのビューが実際に持つものに限る。
  #2800 では system view の `nodeMetadata` を entity view に渡さず空マップにした
  — entity は system スライスから除外される一方、usecase view に昇格した
  `resource X` が entity の id を持つため、渡すと entity クリックに resource の
  詳細パネルが答えてしまう（面が違えば id 空間も違う）
- **素の `<div>` が持っていた操作は、共有コンポーネント側の prop として移す。**
  #2799 の org Tree View はペイン自身の `onClick` でチーム展開を受けていたので、
  `PreviewPane` に `onTeamToggle` を足し、`[data-team-id]` の分岐を末尾の
  `[data-node-id]` フォールバックより前に置いた（チームカードは両方の属性を持つ）。
  クリックの受け口が mouseup ディスパッチへ移る＝ドラッグ判定が挟まるので、
  移設そのものを守るテストを別に置く
- **同じ子スロットを分け合うペインには、モードごとに別の `key` を付ける。**
  `showA ? <PreviewPane/> : showB ? <PreviewPane/> : …` の分岐は React から見て
  同じ位置の同じ型なので、key が無いと 1 つのインスタンスが使い回され、ズーム・
  パン・開いた詳細パネルが別の図へ持ち越される。#2800 はレビューでこれに気づいて
  `key="entity-view"` / `key="diagram"` を足し、その前に切った #2799 のブランチが
  org の 2 ペインで同じ漏れを再現した。**テストはキーの無い同士の直接切替で書く** —
  key 付きのペインを経由する切替（grid → tree など）では再マウントが起きて漏れが
  隠れる（#2799 では Tree View → Dependencies）

## 到達状態

アプリ内で図を描く面は 2 経路だけで、どちらも理由が記録されている:

- **`PreviewPane`** — system / deploy / org の各ビューと、entity・org tree・
  team dependencies の 3 サブモード。#2799 のマージ時点で、サブモードが素の
  `<div>` に SVG を流し込む経路は無くなった
- **All Layers の `<iframe srcDoc>`** — 意図的な例外。全階層を縦積みした SVG 文書の
  ハッシュリンクを親ページの URL に漏らさず、表示とエクスポートを同じ文字列にする
  ために iframe で隔離している（[ADR-22](../adr/22-svg-export-two-phase.md)）

確認は両方の注入経路を検索する。`dangerouslySetInnerHTML` だけを検索すると
`srcDoc` の面を見落とす。残りのヒットは詳細パネル・アウトライン・チャットの
テキストとアイコン（pictogram）で、図ではない。

```
grep -rn "dangerouslySetInnerHTML\|srcDoc" packages/app/src --include=*.tsx
```

## 関連テスト

- `packages/e2e/fixtures/preview-pane.ts` — 上の構造フェンス（共有コンテナ・
  フィット・ホイールズーム・ドラッグパン）を 1 箇所にまとめた helper。新しい
  ペインはこれを呼べば同じ観点で守られる
- `packages/e2e/tests/at-2800-entity-view-pane-layout.spec.ts` — entity ペインの
  共有コンテナ・フィット・ホイールズーム、usecase ↔ entity でズームを持ち越さないこと
- `packages/app/src/components/PreviewColumn.test.tsx` › `Entity view sub-mode (#1907)`
  — 共有コンテナ経由のレンダリングと、entity view 自身の診断バナー
- `packages/e2e/tests/at-2799-org-tab-pane-layout.spec.ts` — org Tree View と
  Team Dependencies の共有コンテナ・フィット・ホイールズーム・ドラッグパン、
  Tree View → Dependencies でズームを持ち越さないこと、移設後もチームカードの
  クリックで展開できること
- `packages/app/src/components/PreviewColumn.test.tsx` ›
  `org tab panes go through the shared preview pane (#2799)` — 両ペインの構造、
  `onTeamToggle` の発火、org ビューの診断が両モードのバナーに出ること、
  2 サブモード間でズームを持ち越さないこと
