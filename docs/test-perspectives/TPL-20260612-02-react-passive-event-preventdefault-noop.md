---
id: TPL-20260612-02
title: "React の synthetic onWheel / onTouchMove では preventDefault が no-op になる"
status: active
date: 2026-06-12
applicable_to:
  - "ズーム / パン / カスタムスクロールなどで onWheel / onTouchMove / onTouchStart の中で e.preventDefault() を呼び、ページや祖先要素のスクロールを抑止しようとする UI"
  - "React の合成イベント（onWheel/onTouchStart/onTouchMove）でブラウザの default action を止めたい全ての箇所"
known_consumers:
  - preview-pane
related_to:
  - TPL-20260510-09
discovered_from:
  - issue: "#1537"
  - root_cause_file: "packages/app/src/components/PreviewPane.tsx"
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260612-02: React の synthetic onWheel / onTouchMove では preventDefault が no-op になる

## 観点

React 17 以降、ルートに委譲される `wheel` / `touchstart` / `touchmove` リスナーは **passive** として登録される。そのため `onWheel` / `onTouchMove` ハンドラ内で `e.preventDefault()` を呼んでも **default action は止まらず**、コンソールに `Unable to preventDefault inside passive event listener invocation` が出るだけになる。

結果として「プレビューをズームしている間はページ／祖先要素をスクロールさせない」のような意図が **静かに失敗** する。ハンドラ自体（ズーム計算）は動くため、テストや目視で「ズームは効いている」ことだけ確認すると見落とす。#1537 では `overflow: auto` な祖先（org ツリーペイン）の上でホイールズームするとページが一緒にスクロールしていた。

## 想定される失敗モード

- ホイールでズームすると、同時に背後のページ／スクロールコンテナもスクロールする
- ピンチ／スワイプ操作でカスタムジェスチャを実装したつもりが、ブラウザの既定スクロール／ズームも併発する
- 「ハンドラは呼ばれているのに preventDefault だけ効いていない」ため、ロジックのテストはパスするのに UX 不具合だけ残る
- マウス／タッチ実機でしか再現せず、合成イベントの単体テストでは気付けない
- **（native へ移行した副作用）** これまで子要素が React の `onWheel={(e)=>e.stopPropagation()}` で祖先のズーム／パンを抑止していた場合、祖先を native リスナーに変えると **その stopPropagation が効かなくなる**。React synthetic の stopPropagation は React のルート委譲（`.preview-container` より上）で動くため、`.preview-container` に張った native リスナーが bubble 経路で **先に** 発火してしまう。結果、子のスクロール領域（`overflow-y:auto` な detail panel 等）がスクロールせず、代わりに図がズームする（#1537 のレビューで検出）

## チェックリスト

スクロール／ズーム／ジェスチャ系の UI を実装するとき、以下を確認する:

- [ ] `preventDefault()` を呼びたい `wheel` / `touchstart` / `touchmove` は、`useEffect` 内で `el.addEventListener(type, handler, { passive: false })` として **ネイティブ非 passive** で登録しているか（React の `onWheel=` 属性に頼っていないか）
- [ ] そのネイティブリスナーに **cleanup（`removeEventListener`）** があるか
- [ ] テストで `cancelable: true` のネイティブイベントを `dispatchEvent` し、`event.defaultPrevented === true` を assert しているか（ハンドラの副作用だけでなく preventDefault が効いていることを直接検証する）
- [ ] unmount 後にイベントを投げて `defaultPrevented` が `false` のまま（＝リスナーが外れている）ことを確認しているか
- [ ] その native リスナーの子に、これまで React synthetic の `onWheel`/`onTouchMove` で `stopPropagation` してジェスチャを **opt-out** していた要素はないか。あるなら、native ハンドラ側で opt-out 属性（例 `data-wheel-zoom-ignore`）を `e.target.closest(...)` で見て早期 return しているか。子のスクロール領域上で「スクロールせずズームする」回帰のテストがあるか

## 既知の対処パターン

- `ref` で対象要素を取り、`useEffect` で `addEventListener("wheel", handler, { passive: false })` を張り、return で `removeEventListener` する。これが React 17+ で preventDefault を効かせる正攻法
- `onScroll` は preventDefault しても意味がない（スクロールは既に起きた後の通知）。抑止したいなら `wheel` / `touchmove` 段階で止める
- 「ハンドラが呼ばれること」と「default action が止まること」は別物。テストは後者（`defaultPrevented`）まで踏み込む
- 子要素にジェスチャを **opt-out** させたいときは、React synthetic の `stopPropagation` ではなく **DOM 属性**（例 `data-wheel-zoom-ignore`）でマークし、native 祖先ハンドラの先頭で `if ((e.target as Element)?.closest("[data-...]")) return;` する。synthetic と native はイベントシステムが別なので、片方の stopPropagation はもう片方を止められない

## 派生元 spec

なし（retrospective TPL — #1537 の bug 修正から抽出）。`docs/concepts*.md` / `docs/spec/` には passive listener の規定はないため back-ref なし。

## 関連テスト

- `packages/app/src/components/PreviewPane.test.tsx`（`wheel zoom (#1537)` describe ブロック）
