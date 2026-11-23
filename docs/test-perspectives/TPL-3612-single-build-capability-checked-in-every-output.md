---
id: TPL-3612
title: "共有コードから作る複数のビルドのうち 1 つにだけ載せる機能は、全ビルドの成果物で有無を検査する"
status: active
date: 2026-11-05
applicable_to:
  - "同じパッケージのソースから、入口（entry）や設定の違う複数のビルドを作る構成"
  - "外部への送信・計測・第三者スクリプトなど、特定の配布面にだけ載せ、他の面には載せないと約束している機能"
  - "ある面の文書（privacy policy・data handling など）が「この機能を持たない」と書いている構成"
known_consumers:
  - app
discovered_from:
  - issue: "#3612"
  - root_cause_adr: "ADR-1996"
  - root_cause_file: "docs/policy/nest-privacy.md"
related_to:
  - TPL-1001
  - TPL-1296
topic: build
scope:
  packages:
    - app
    - nest
    - cli
    - vscode
---

# TPL-3612: 共有コードから作る複数のビルドのうち 1 つにだけ載せる機能は、全ビルドの成果物で有無を検査する

## 観点

`packages/app` のソースからは、Pages の SPA（`index.html`）、`karasu serve` 用（serve entry）、
VS Code の webview、karasu-nest のギャラリー viewer（`viewer.html`）の 4 つのビルドが作られる。
このうち 1 つにだけ載せる機能（例: 匿名の利用状況の送信、#3612）は、**入口のコードを読んで
「ここでしか登録していない」と確かめるだけでは足りない**。共有モジュールが副作用で登録する、
別の入口が同じモジュールを import する、tree shaking が効かず残る、といった経路で、
意図しないビルドに入りうる。

有無は **各ビルドの成果物** に対して検査する。載せる面には「ある」、載せない面には「ない」を
両方向で確かめる。載せない面の文書（`docs/policy/nest-privacy.md` の「トラッキング目的の
スクリプトを持たない」など）が約束を書いているときは、その約束がこの検査の根拠になる。

成果物の検査で分かるのは「どのビルドに入っているか」までである。**同じ成果物や同じ入口が
複数の場所で動く**なら、実行時の判定も要る。`packages/app/dist`（Pages の成果物）は monorepo の
`karasu serve` と CI の Playwright の E2E でも動き、`vite dev` は同じ入口をソースから動かす。

## 想定される失敗モード

- 共有コンポーネント（`ProjectModeApp` などの app shell）の中で送信を初期化し、同じ shell を使う serve や viewer のビルドにも送信が入る
- 送信先の URL や SDK が viewer のバンドルに入り、nest のギャラリーが「トラッキングを持たない」という文書と食い違う
- `karasu serve` や VS Code でローカルのモデルを開いただけで、外部へリクエストが飛ぶ（CSP で止まっても、止まったことに誰も気づかない）
- 入口のコードの unit test は通るが、実際のバンドルには残っている（dead code が tree shaking されない、動的 import が別 chunk で残る）
- 載せる面のほうで、ビルド設定の変更で機能が黙って消える（片方向だけ検査していると気づかない）
- 成果物の検査は通るが、同じ成果物や同じ入口を手元で動かしたとき（monorepo の `karasu serve`、`vite dev`、E2E）に本番の送信先へ送る
- 機能のために依存のグローバルな仕組みを有効にし（OpenTelemetry の `register()` など）、同じグローバルを見る別のライブラリ（Chat の `@anthropic-ai/sdk`）まで動き出す

## チェックリスト

- [ ] 機能を載せるビルドと載せないビルドをビルド設定（`vite*.config.ts`）から列挙し、各ビルドの成果物（`dist/`・`dist-serve/`・`dist-vscode-webview/`・`dist-viewer/`）で、載せる面には目印があり、載せない面には無いことを両方向で検査しているか
- [ ] 目印は minify で消えず、ふつうの CI のビルドでも現れるもの（bundle 時のモジュール id）を、向きごとに使い分けているか。載せる面では出力にコードが残っていること（出力の chunk の `modules` で `renderedLength` が 0 より大きいこと）を見る。モジュールのグラフ（`getModuleIds()`）にあるだけでは、tree shaking でコードが消えても「ある」と判定されるからである。載せない面では、より厳しくグラフに無いこと（`getModuleIds()`）を見てよい。ビルド時にしか渡さない値（送信先の URL）を目印にするなら、その値を渡したビルドで検査しているか
- [ ] 機能の初期化が入口（`main.tsx` など）だけにあり、共有のコードは何もしない既定の継ぎ目だけを使い、依存のグローバルな登録（OpenTelemetry の `register()` など）を使っていないか
- [ ] 同じ成果物や同じ入口が載せない場所でも動くなら、実行時の判定（origin、ビルド時にだけ渡す設定）で止め、その場所を実際に動かして外へのリクエストが起きないことをネットワークで確かめているか（E2E / AT）
- [ ] 載せない面の文書が約束を書いているなら、その文書から検査へのリンクがあるか

## 既知の対処パターン

- 初期化を入口ファイルだけに置き、共有コードには何もしない既定の実装を持つ継ぎ目だけを見せる。入口が実装を継ぎ目に明示的に渡す。OpenTelemetry なら `register()` や `trace.setGlobalTracerProvider` を呼ばない（グローバルを見る別のライブラリまで span を作り出す）
- bundle 時に `generateBundle` で検査する。載せないビルドは `this.getModuleIds()` を見て、機能のモジュールを import しているだけで build を落とす（コードが tree shaking で消えても、共有のコードが import していること自体を止める）。`vite.serve.config.ts` の `rejectMonaco` が同じ形。載せるビルドは、グラフにあるだけでは足りないので、出力の chunk の `modules` で機能のモジュールの `renderedLength` が 0 より大きいことを確かめる
- ビルド後の成果物を文字列（送信先の host など）で走査するテストを置く。`packages/app/src/viewer/build-config.test.ts` は viewer と app の出力先の分離を設定から検査しており、成果物の中身の検査はその隣に置ける

## 関連テスト

- まだ無い。#3612 の実装 PR で、各ビルドの成果物を走査するテストとして着地させる
- 参考: `packages/app/src/viewer/build-config.test.ts`（viewer のビルドが app の Pages 出力と分かれていることを設定から検査する）、`packages/app/src/viewer/vscode/build-config.test.ts`（VS Code の webview のビルドを検査する）、`packages/app/src/serve-build-config.test.ts`（serve の入口の差し替えを検査する）

## 関連 TPL

- [TPL-1001](TPL-1001-display-mode-cross-surface.md): 表示の切り替えを **すべての描画面で点検する** 観点。本 TPL は逆に、機能を **1 つの面にだけ** 置き、他の面に無いことを確かめる
- [TPL-1296](TPL-1296-spec-doc-reference-data-sync.md): 文書とデータの同期。本 TPL では「この面は機能を持たない」という文書の約束を、成果物の検査で縛る
