---
id: TPL-20260520-01
title: "overlay/portal surface の重なり順はマジックナンバーではなく文書化された z-index スケールから選ぶ"
status: active
date: 2026-05-20
applicable_to:
  - "全画面を覆う overlay（dimming / backdrop layer）を伴う UI surface（modal dialog / slide-in panel / context menu / tooltip / dropdown menu）"
  - "外部ライブラリの portal primitive（shadcn / Radix）と既存の手書き overlay CSS が同一ドキュメントに共存する画面"
known_consumers:
  - shadcn-ui-primitives
  - command-palette
  - reference-panel
discovered_from:
  - issue: "#1468"
related_to:
  - TPL-20260516-01
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260520-01: overlay/portal surface の重なり順はマジックナンバーではなく文書化された z-index スケールから選ぶ

## 観点

overlay や portal を持つ UI surface（modal dialog・slide-in panel・context menu・tooltip・dropdown）の `z-index` は、**そのコンポーネント単独では正しさを判定できない**。`z-index` は同じ stacking context 内の **他の surface との相対値** でしか意味を持たないため、各 surface がローカルにマジックナンバー（`z-50`, `200`, `1000` …）を置くと、2 つの surface が同時に開いたときの重なり順が暗黙の偶然になる。

特に、別ライブラリの portal primitive（shadcn / Radix が `document.body` に portal する）と、リポジトリ既存の手書き overlay CSS が混在する画面では、両者の `z-index` が別々の流儀で決められているため衝突しやすい。新しい overlay surface を足すとき・既存 surface の `z-index` を触るときは、**リポジトリ全体で 1 か所に文書化された z-index スケール**（karasu では `app.css :root` の `--z-*` トークン群）を参照し、その surface がスケール上のどの層に属するかを意識的に選ぶ。

## 想定される失敗モード

- 新しい portal primitive を導入したが、そのライブラリ既定の `z-index`（shadcn の `z-50` 等）をそのまま使い、既存の手書き overlay（`z-index: 200` 〜 `1000`）の下に潜って見えなくなる（#1468: コマンドパレットが References パネルの dimming layer の裏に描画された）
- 1 つの surface の bug を「その surface の `z-index` だけ既存の最大値より上に上げる」で塞ぎ、同じライブラリの他の primitive（tooltip / dropdown）に同じ潜り込みが残る
- マジックナンバーが散在しているため、ある surface を別の surface の上に出したいだけなのに、どの値にすれば安全か（何より上で何より下か）がコードから読み取れない
- 機能テスト（クリックハンドラ・レンダリング結果）は緑のまま — 重なり順は computed stacking であり、jsdom の単体テストには映らない

## チェックリスト

新しい overlay/portal surface を足す、または既存 surface の `z-index` を触るとき:

- [ ] その surface の `z-index` を、リポジトリの z-index スケール（`app.css :root` の `--z-*` トークン）から選んだか。バレなマジックナンバーを新規に置いていないか
- [ ] スケールに当てはまる層が無い場合、新しいトークンを追加し、コメントで「何の上・何の下に居るべきか」を明記したか
- [ ] 外部ライブラリの portal primitive を導入したとき、そのライブラリ既定の `z-index` を rep の overlay スケールに合わせて上書きしたか（既定値をそのまま採用していないか）
- [ ] 重なり順を、computed stacking が見える層（E2E / `elementFromPoint`）で検証したか。単体テストの className assert だけで済ませていないか

## 既知の対処パターン

- z-index を `app.css :root` の `--z-*` カスタムプロパティとして 1 か所に集約し、低→高の順にコメント付きで並べる。各 overlay ルールは `var(--z-*)` を参照する（マジックナンバー禁止）
- shadcn / Radix primitive は Tailwind の arbitrary value（`z-[var(--z-dialog)]` 等）でトークンを参照させ、ライブラリ既定の `z-50` を上書きする
- portal 系メニュー（dropdown）・tooltip は dialog より上の層に置く — dialog 内から開くメニューが dialog に隠れないようにするため
- 重なり順の回帰は E2E で `document.elementFromPoint` を使い、「2 つの surface が重なる座標で手前に来るのはどちらか」を直接確認する（#1468 の AT-1468）

## 関連テスト

- `packages/e2e/tests/at-1468-command-palette-z-index.spec.ts` — References パネルを開いた状態でコマンドパレットを開き、両者が重なる座標でパレットが手前に来ることを `elementFromPoint` で検証
