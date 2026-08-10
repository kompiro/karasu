---
id: ADR-2419
title: PoC の生成物は gitignore された `reports/` に出力し、spike ブランチでのみコミットする
status: accepted
date: 2026-08-10
topic: build
authors: [kompiro]
related_to:
  - ADR-1085
assumptions:
  - "file: reports/README.md"
  - "file: scripts/report/index.ts"
  - "grep: .gitignore :: reports/\\*"
  - "grep: knip.json :: scripts/report/index.ts"
---

# ADR-2419: PoC の生成物は gitignore された `reports/` に出力し、spike ブランチでのみコミットする

- **日付**: 2026-08-10
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2419](https://github.com/kompiro/karasu/issues/2419)、実装 PR [#2430](https://github.com/kompiro/karasu/pull/2430)
  - 動機となった PoC: [#2366](https://github.com/kompiro/karasu/issues/2366) の node legibility バッチ、[#2417](https://github.com/kompiro/karasu/pull/2417)（Phase 4 の設計 PR）
  - [ADR-1085](1085-agent-worktree-coexistence.md)（作業ディレクトリの置き場を repo 内に規約化した先例）
  - 規約本体: `reports/README.md`、`docs/process.md`「PoC のレポートは `reports/` に生成する」節

## 背景

PoC の成果物（before/after 比較 HTML、計測サマリ、スクリーンショット）には置き場がなかった。「分析レポートは main にマージしない」という運用ルールだけがあり、その帰結としてレポートは repo の外（`/workspaces/karasu-*.html`）に書かれていた。#2366 のバッチで 2 本のレポートを作った結果、この回避策が 3 つのコストを持つことがはっきりした。

- **ブランチに紐づかない。** レポートはある spike ブランチの状態を説明しているのに、ブランチを消すとアンカーを失う。Issue や PR に残ったパスは 1 台のマシンにしか存在しないファイルを指す。
- **消える。** devcontainer は随時作り直される。バッチ中にセッション temp ディレクトリが 2 度消え、生成スクリプトを手で作り直した。
- **毎回書き直す。** SVG ペアの HTML 組み立て、data URI 埋め込み、Playwright スクリーンショットを PoC ごとに再実装していた。

一方で、元のルールが守っていたもの（生成物が mainline の PR に混ざらない）は正しい。レポートは結論ではなく証拠であり、レビュー対象でもリリース対象でもない。

## 決定

`reports/` を repo 直下に置き、**`reports/*` を gitignore して `reports/README.md` だけを追跡する**。PoC は `reports/<topic>/` に生成物と生成スクリプトを書く。`spike/**` ブランチに限り `git add -f` でレポートをコミットしてよく、spike ブランチと一緒に生き死にする。共通のスキャフォールディング（HTML シェル、before/after ペア、`.krs` → SVG、Chromium スクリーンショット）は `scripts/report/` に置き、`pnpm report:demo` が動く実例を兼ねる。

## 理由

- **既定の安全性は変わらない。** gitignore されているので、生成物が mainline の PR に混ざる経路が機械的に閉じている（`scripts/report/gitignore.test.ts` が `git check-ignore` で常時検証する）。禁止ルールを人の注意で守る形から、既定で成立する形になった。
- **spike が自分の証拠を持てる。** spike ブランチはマージされないので、そこでコミットしたレポートが main に届くことはない。`git add -f` を許すことで「レポートがブランチと一緒に消える」— これは失われる状態ではなく、望ましい寿命。spike preview URL の扱い（`docs/process.md`）と同じ考え方。
- **結論と証拠を分ける。** 長生きする結論は design doc / ADR / Issue に書き、`docs/` から `reports/` は参照しない。参照しないので、レポートが消えてもドキュメントは壊れない。
- **スキャフォールディングは `scripts/` に置くしかない。** `reports/` 配下はすべて gitignore されるため、ライブラリを置くと追跡されず、typecheck・lint・vitest・knip のどのカバレッジにも乗らない。`scripts/report/` なら既存の CI がそのまま効く。knip からは消費側（gitignore 配下の generator）が見えないので、`scripts/report/index.ts` を entry として宣言する。

## 却下した案

- **repo 外に置き続ける（現状維持）。** ブランチとの紐づけ喪失・devcontainer 再構築での消失という背景の 2 点がそのまま残る。
- **`docs/` 配下に置く。** 証拠と結論が同じ場所に混ざり、`docs/` のリンクがブランチと一緒に消えるファイルを指しうる。`docs/qa/` `docs/review/` が gitignore されている前例のとおり、生成物と `docs/` は分ける。
- **`reports/` を追跡して普通にコミットする。** 数百 KB の HTML がレビュー差分に載り、リポジトリに恒久的に積み上がる。証拠は再生成できるので、履歴に残す価値がコストに見合わない。
- **スキャフォールディングを `reports/lib/` に置く（Issue の原案）。** gitignore の対象なので追跡されず、ライブラリとして成立しない。`!reports/lib/**` の例外を足す案は、「`reports/` 配下は追跡しない」という判定条件を 1 つに保てなくなるため採らない。
- **spike preview で `reports/` を配信する（Issue の提案 2）。** 発想としては有効だが、実際に欲しがる PoC が出るまでは投機的なので今回は入れない。必要になった時点で `spike-preview.yml` に deploy artifact へのコピーを足せば済む。
