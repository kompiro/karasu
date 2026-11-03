---
id: TPL-2254
title: "再実行される記録は、記録より長生きするアドレスを指す"
status: active
date: 2026-08-02
applicable_to:
  - "受け入れテストの手動確認手順に「どこを開くか」を書くとき"
  - "長期保存されるドキュメントに URL・コマンド・環境を書くとき"
  - "PR 作業中に見えているもの（preview URL・作業ブランチ・ローカルサーバ）を記録に写すとき"
known_consumers: []
discovered_from:
  - issue: "#2254"
  - issue: "#2259"
  - issue: "#3169"
  - issue: "#3271"
  - root_cause_file: "docs/acceptance/0999-legend-in-use-fallback.md"
  - root_cause_file: "docs/acceptance/1821-layer-toggle-external-infra.md"
related_to:
  - TPL-1032
  - TPL-2253
topic: testing
scope:
  packages: []
---

# TPL-2254: 再実行される記録は、記録より長生きするアドレスを指す

## 観点

手動確認の手順に書く到達先は、**その記録が読まれ続ける期間より寿命の長いアドレス**でなければならない。

受け入れテストの `🧑 Manual` 項目は一度チェックして終わりではなく、後から何度でも再実行される（だからチェックボックスは常に未チェックで置かれる）。ところが手順を書く瞬間、著者の目の前にあるのは**その PR でしか存在しないもの** — ブランチ名入りの preview URL、手元で起動中の dev サーバ、作業ブランチのパス — であり、それをそのまま書き写すと、**書いた瞬間だけ正しく、マージした瞬間に嘘になる**記録ができる。

判定は「今これで確認できるか」ではなく **「1 年後にこの行を読んだ人が到達できるか」** で書く。だから手動確認の記録には URL を書かず、何を開いて何を見るか（入力と期待結果）を書く。確かめる場所は、その領域を変える PR の preview かローカルの checkout で、preview の URL は PR 本文の欄が持つ。

本番 URL を到達先にするのは誤りである（[#3169](https://github.com/kompiro/karasu/issues/3169)）。本番 URL は長生きするが、本番で確かめる手順はマージ後にしか実行できず、マージを止められない。受け入れテストとして機能しない（[ADR-3169](../adr/3169-at-manual-items-before-merge.md)）。

## 想定される失敗モード

- ブランチ名入りの preview URL がマージ後に 404 になる。記録は残るが手順は実行不能で、しかも**壊れていることが読むまで分からない**（リンク切れは CI が見ていない）
- ローカル起動コマンドが、確認したいだけの人に checkout・install・ビルドを要求する。実際には PR の preview を開けば済む
- **到達先を本番 URL にして、マージ後にしか実行できない手順になる。** 寿命は長いが、マージを止める検査として働かない。実際には preview で確かめられる項目ばかりで、読む側が「本番」を「preview」と読み替えて使っていた（#3169）
- **記録が、削除されると分かっているファイルを指す。** AT が `docs/design/` を指すと、ADR 昇格が Design Doc を消した瞬間に切れる。URL の腐り方と違い、これは偶発ではなく**規約が保証する**破れである
- 再実行されないまま放置され、「未チェックの項目」として永久に残る。手順が実行不能だと気付かれず、単に優先度が低いと読まれる
- 手順に書かれたコマンドが後でリネームされても、誰も走らせていないので気付かれない（`pnpm dev` の綴りが 4 通りに分かれていた）
- **記録がソースファイルのパスを名指しし、そのファイルが移動・削除される。** URL と違い repo の中で完結しているのに、リンク切れとして目に見えない。#2604 が `packages/nest` の半分を消したとき、8 件の記録が消えたファイルを指したまま CI は全部緑だった（[#2648](https://github.com/kompiro/karasu/issues/2648)）

## チェックリスト

手動確認の手順を書く / 直すときに確認する:

- [ ] 手順に URL を書かず、入力（埋めた `.krs` など）と期待結果だけで実行できるか。その PR の preview かローカルの checkout で、マージ前に確かめられるか
- [ ] 指しているファイルは、この記録より長生きするか — `docs/design/` は昇格時に削除されるので代わりに Issue と ADR を指す。`packages/…` / `scripts/…` は機械で照合される（AT と設計ドキュメントは `pnpm run lint:record-source-paths`、TPL は `pnpm run tpl:validate`。不在が正しいならどちらでも、その行の上に理由付きで宣言する）
- [ ] ブランチ名・PR 番号・セッション固有のパスが URL に含まれていないか
- [ ] AT の手順にローカル dev サーバの起動コマンドを書いていないか（確かめる場所はその PR の preview かローカルの checkout で、手順はそこで開く入力と期待結果だけにする）
- [ ] preview URL を記録に焼き付けず、PR 本文の Preview URL 欄に置いたか
- [ ] 本番にしか現れない項目（デプロイ設定、OAuth など）を AT に置かず、実装 PR を作る前に別の Issue に起こしたか

## 既知の対処パターン

- **手順は入力と期待結果で書き、到達先は PR が持つ**: `.claude/rules/acceptance.md`「手動項目は、マージ前に確かめられるものだけ」「手動項目には入力と期待結果を書き、URL は書かない」。AT を編集すると自動で読み込まれる。以前は本番 URL を単一の到達先にしていたが、マージ後にしか実行できない手順になるので改めた（ADR-3169）
- **preview は PR の欄に置き、記録には残さない** — PR テンプレートの `## Preview URL` 欄が preview の正しい住所。AT に写すと寿命が合わない
- **AT からは Issue を指す** — Issue は削除されず design PR と実装 PR の両方へ辿れる。ADR があれば併記する。強制は `pnpm at:check-coverage`（`scripts/acceptance/design-refs.ts`）で、`docs/acceptance/**` から `docs/design/` への参照を finding として落とす
- **ソースパスは機械で照合する** — ディレクトリごとに担当が 1 つずつ決まっている。
  `pnpm run lint:record-source-paths` が `docs/{acceptance,design}` を、
  `pnpm run tpl:validate`（`@kompiro/tpl-tools` の `--source-prefix`）が
  `docs/test-perspectives` を、それぞれコードスパン単位で working tree と突き合わせる。
  marker の綴りは両者で同一なので、記録が repo 間を移動しても意味が保たれる。
  不在が正しい場合（履歴・例示・設計がこれから作るファイル）は、その行の上に
  `<!-- absent-path-next-line: <理由> -->` で宣言する。宣言は逆向きにも検査され、パスが
  実在するようになると落ちる — 実装済みの設計ドキュメントが ADR 昇格の時期を自ら告げる。
  `docs/adr/**` は対象外（本文は当時の記録 — ADR-706）
- **本番にしか確認手段がない項目は AT から外す**: 本番にしか現れないもの（デプロイ設定、OAuth、カスタムドメイン）は、マージを止める検査にならない。AT ではなく、実装 PR を作る前に別の Issue に起こして消化する（ADR-3271）。docs-site も [#2260](https://github.com/kompiro/karasu/issues/2260) で PR preview を得たので、記録の手順は app と同じく preview で実行できる（URL は PR 本文の欄に置く）

## 関連テスト

- `scripts/lint/record-source-paths.ts` — `pnpm run lint:record-source-paths` の本体。`docs/{acceptance,design}` の
  コードスパンに書かれた `packages/…` / `scripts/…` のパスを working tree と突き合わせ、不在なら落とす
  （チェックリスト 2 項目目のソースパス側）
- `scripts/lint/record-source-paths.test.ts` — 上記 lint の単体テスト。パスとして拾う範囲（`sourcePathsInLine`）、
  `absent-path-next-line` marker の読み取り（`absentPathReason`）、frontmatter と fenced code を読まないこと（`checkMarkdown`）

## 由来

45 件の AT が `pnpm --filter @karasu-tools/app dev` などローカル dev サーバの起動を指示しており、うち 3 件は**既に腐ったブランチ名入り preview URL**（`https://fix-legend-human-annotation.karasu.pages.dev` 等）を代替として併記していた（[#2254](https://github.com/kompiro/karasu/issues/2254)）。いずれも「書いた PR の中では正しかった」もので、記録の寿命とアドレスの寿命が合っていないという 1 つの原因の別々の現れ方である。

同じ原因の 3 つ目の現れ方が [#2259](https://github.com/kompiro/karasu/issues/2259) の後で見つかった。AT から `docs/design/` への 46 参照のうち **39 が既に解決しない**アドレスを指しており、うち 1 件（`1821-layer-toggle-external-infra.md`）は main に残った壊れた markdown リンクだった。preview URL と違い削除は規約が保証しているので、これは「腐りうる」ではなく「必ず腐る」参照である。
