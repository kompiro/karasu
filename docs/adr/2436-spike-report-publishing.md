---
id: ADR-2436
title: spike の PoC レポートは private な Claude Artifact として publish する
status: accepted
date: 2026-08-19
topic: build
authors: [kompiro]
depends_on:
  - ADR-2419
related_to:
  - ADR-1961
assumptions:
  - "file: reports/README.md"
  - "symbol: scripts/report/html.ts :: reportFragment"
  - "grep: scripts/report/demo.ts :: artifact.html"
  - "file: docs/acceptance/spike-report-artifact-publishing.md"
---

# ADR-2436: spike の PoC レポートは private な Claude Artifact として publish する

- **日付**: 2026-08-19
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2436](https://github.com/kompiro/karasu/issues/2436)、設計 PR [#2497](https://github.com/kompiro/karasu/pull/2497)、実装 PR [#2568](https://github.com/kompiro/karasu/pull/2568)
  - [ADR-2419](2419-poc-report-directory.md)（`reports/` の規約。本 ADR はその「却下した案」の最後の 1 項目を再訪した結果）
  - [ADR-1961](1961-bare-permalink-route.md)（root catch-all の bare permalink ルート）、[TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)
  - 規約本体: `reports/README.md`「Reading a report」節、`docs/process.md`「PoC のレポートは `reports/` に生成する」節
  - 受け入れテスト: `docs/acceptance/spike-report-artifact-publishing.md`

## 背景

ADR-2419 以降、PoC は `reports/<topic>/index.html` にレポートを生成し、`spike/**` ブランチでは `git add -f` でコミットしてよい。一方 spike preview がデプロイするのは `packages/app/dist` だけなので、レポートはブランチには乗っているのに、読むには当人の手元で checkout するしかなかった。

Issue #2436 の当初案は、deploy 直前に `cp -r reports packages/app/dist/reports` を足して preview URL の配下で配信するというものだった。設計時にこれが見た目ほど安くないことが分かった。

karasu の Pages デプロイには root catch-all の Pages Function（`functions/[[path]].ts`）がある。ADR-1961 の bare permalink ルートで、`_routes.json` の `exclude` に載っていない**すべてのリクエストを静的アセットより先に**受け取り、permalink でないものを自分で差し戻す責任を負う。「未知のパスの既定」が SPA から resolver 側へ反転している（TPL-1961）。`reports/` を dist にコピーすると、その配下がこの反転の影響下に入る。

| リクエスト | catch-all の判定 | 結果 |
| --- | --- | --- |
| `/reports/<topic>/index.html` | パスが `.krs` で終わらないので parse 失敗（400）→ passthrough | レポートが出る。Worker 起動 1 回ぶんの遅延つき |
| `/reports/<topic>/` | 2 セグメントなので `<owner>/<repo>` 形として成立 → GitHub に問い合わせ → 404 | **signpost ページ**が出る |
| `/reports/<topic>/shot.png` 等 | 400 → passthrough | 表示はされるが、副リソース 1 件ごとに Worker が起動する |

ディレクトリ URL という最も自然な貼り方だけが壊れ、しかも壊れ方が 404 ではなく自信のある誤答になる。塞ぐには `routes.ts` の予約セグメントと `_routes.json` の `exclude` を増やす必要があり、この 2 つは preview 専用ではなく本番にもそのまま配られる。

そこで前提を 1 つ言語化した。**spike のレポートの読み手は、PoC を回した本人ひとりである。** spike ブランチは PR を持たないので、URL を渡す相手がそもそもいない。要件は「誰でも URL を踏めること」ではなく「本人がすぐ開けること」だった。

## 決定

レポートは **private な Claude Artifact として publish して読む**。`scripts/report/` は publish 用の形（`reportFragment()`。document の骨格を持たない HTML）を `index.html` と並べて毎回書き出し、`.github/workflows/spike-preview.yml` と本番のルーティング設定には一切触れない。

## 理由

- **読み手ひとりのために恒久設定を増やさない。** 配信経路を preview に相乗りさせる案は、`RESERVED_TOP_SEGMENTS` と `_routes.json` という本番にも配られる設定を、一時的な都合のために増やす。TPL-1961 が「腐る」と名指ししている類のリストで、spike という捨てる経路の都合をそこに染み出させる理由が無い。
- **前提がすでに満たされていた。** Artifact の publish 先は外部ホストへの通信を CSP で一切許さないが、それは `reports/README.md` が最初から課している「self-contained であれ」という規約そのもので、`reportPage()` の出力（インライン CSS、data URI 画像）はすでに満たしていた。repo 側の変更は `scripts/report/html.ts` の出力形式 1 点に閉じた。
- **証拠の拡散しにくさと、直接開ける利便性を両立する。** Actions artifact 案は「落とした人の手元で閉じる」点が優れていたが zip の展開が要り、preview 配信案はブラウザで開ける代わりに URL が引用されうる。Artifact は既定が private で、かつ URL を開けばそのまま読める。
- **コミットが読むための条件でなくなった。** 作業ツリーの中身をそのまま publish できるので、`git add -f` は「証拠をブランチと一緒に運ぶ」ための任意の操作に戻った。

## 受け入れたコスト

**ADR-2419 の「証拠はブランチと一緒に生き死にする」が、機械では守られなくなる。** Artifact は本人の claude.ai 配下に private で残り、spike ブランチを削除しても消えない。Actions artifact 案なら `retention-days` で期限を機械的に与えられたが、それを捨てた。

自動化はしない。後始末のために API 連携を足すと、片付けの対象が Cloudflare のデプロイと Artifact の 2 系統になり、cleanup job が守る不変条件が増える。代わりに `docs/process.md` と `reports/README.md` に「spike を畳むときは Artifact も消す」と書き、運用で受ける。`docs/` から Artifact URL を参照しないという線は `reports/` と同じく維持する（TPL-2254）。

## 却下した案

- **案1: dist にコピーし、`reports` を予約セグメントにする。** ディレクトリ URL も副リソースも正しく動く唯一の案だが、本番で `reports` という owner 名の bare permalink が永久に使えなくなり、spike の都合が app パッケージのルーティング定義に染み出す。**捨てたのではなく保留**で、外部の人にレポートを見せる必要が実際に出てきたら最有力の復帰候補になる。
- **案2: 既存の予約下（`/assets/reports/`）に置く。** 設定を触らずに済むが、`assets/` は Vite の content hash チャンク出力先であり、人手のディレクトリを混ぜると「そこに何が入るか」の判定条件が 2 つになる。
- **案3: Actions artifact としてアップロードする。** 設計時の初案で、変更が `spike-preview.yml` 1 ファイルに閉じ、寿命も `retention-days` で機械的に担保できる。ブラウザで直接開けず zip の展開が要る点だけが劣り、読み手ひとりという前提の下では Artifact 案がその弱点を持たずに同じ利点を出す。**これも保留**で、Claude セッションの外（CI 単独）でレポートを生成する必要が出てきたら復帰候補になる。
- **案4: 何もしない。** 完全形の URL を手で貼れば表示はできるが、ディレクトリ URL を貼った人が signpost ページを踏み、それが誤答だと気づけない。
