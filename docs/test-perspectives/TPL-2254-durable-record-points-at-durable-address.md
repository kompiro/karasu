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

判定は「今これで確認できるか」ではなく **「1 年後にこの行を読んだ人が到達できるか」** で書く。到達できるのは通常、本番にデプロイされた URL である。

## 想定される失敗モード

- ブランチ名入りの preview URL がマージ後に 404 になる。記録は残るが手順は実行不能で、しかも**壊れていることが読むまで分からない**（リンク切れは CI が見ていない）
- ローカル起動コマンドが、確認したいだけの人に checkout・install・ビルドを要求する。実際には本番を開けば済む
- **記録が、削除されると分かっているファイルを指す。** AT が `docs/design/` を指すと、ADR 昇格が Design Doc を消した瞬間に切れる。URL の腐り方と違い、これは偶発ではなく**規約が保証する**破れである
- 再実行されないまま放置され、「未チェックの項目」として永久に残る。手順が実行不能だと気付かれず、単に優先度が低いと読まれる
- 手順に書かれたコマンドが後でリネームされても、誰も走らせていないので気付かれない（`pnpm dev` の綴りが 4 通りに分かれていた）
- **記録がソースファイルのパスを名指しし、そのファイルが移動・削除される。** URL と違い repo の中で完結しているのに、リンク切れとして目に見えない。#2604 が `packages/nest` の半分を消したとき、8 件の記録が消えたファイルを指したまま CI は全部緑だった（[#2648](https://github.com/kompiro/karasu/issues/2648)）

## チェックリスト

手動確認の手順を書く / 直すときに確認する:

- [ ] 到達先はデプロイ済みの本番 URL か（app なら `karasu.kompiro.dev`、docs なら公開ドキュメントサイト）
- [ ] 指しているファイルは、この記録より長生きするか（`docs/design/` は昇格時に削除される — 代わりに Issue と ADR を指す）
- [ ] コードスパンで名指しした `packages/…` / `scripts/…` のパスは、いま実在するか（`pnpm run lint:record-source-paths`）。不在が正しいなら、その行の上に理由付きで宣言したか
- [ ] ブランチ名・PR 番号・セッション固有のパスが URL に含まれていないか
- [ ] ローカル起動コマンドを書いていないか。書くなら「本番では確認できない理由」を併記したか
- [ ] その機能が**まだ本番に出ていない**場合、記録に preview URL を焼き付けるのではなく、PR 本文の Preview URL 欄に置いたか
- [ ] 本番に出ていない期間の確認手段しかない項目は、マージ後に再確認する前提だと明示したか

## 既知の対処パターン

- **本番 URL を単一の到達先にする** — `.claude/rules/acceptance.md`「手動項目の到達先は本番 URL」に app / docs-site の正典 URL を表で置く。AT を編集すると自動で読み込まれる
- **preview は PR の欄に置き、記録には残さない** — PR テンプレートの `## Preview URL` 欄が preview の正しい住所。AT に写すと寿命が合わない
- **AT からは Issue を指す** — Issue は削除されず design PR と実装 PR の両方へ辿れる。ADR があれば併記する。強制は `pnpm at:check-coverage`（`scripts/acceptance/design-refs.ts`）で、`docs/acceptance/**` から `docs/design/` への参照を finding として落とす
- **ソースパスは機械で照合する** — `pnpm run lint:record-source-paths` が
  `docs/{acceptance,test-perspectives,design}` のコードスパンを working tree と突き合わせる。
  不在が正しい場合（履歴・例示・設計がこれから作るファイル）は、その行の上に
  `<!-- absent-path-next-line: <理由> -->` で宣言する。宣言は逆向きにも検査され、パスが
  実在するようになると落ちる — 実装済みの設計ドキュメントが ADR 昇格の時期を自ら告げる。
  `docs/adr/**` は対象外（本文は当時の記録 — ADR-706）
- **確認手段が本番にしかない構造を認める** — 到達できる先が本番だけなら「マージ後に確認する」ことを隠さずに書く。preview がある前提で書くと、実行できない手順になる。逆に preview が後から用意されても、この観点の結論は変わらない — docs-site は [#2260](https://github.com/kompiro/karasu/issues/2260) で PR preview を得たが、その URL はやはりブランチと一緒に消えるので、記録の到達先は公開ドキュメントサイトのままである（preview は PR 本文の欄に置く）

## 由来

45 件の AT が `pnpm --filter @karasu-tools/app dev` などローカル dev サーバの起動を指示しており、うち 3 件は**既に腐ったブランチ名入り preview URL**（`https://fix-legend-human-annotation.karasu.pages.dev` 等）を代替として併記していた（[#2254](https://github.com/kompiro/karasu/issues/2254)）。いずれも「書いた PR の中では正しかった」もので、記録の寿命とアドレスの寿命が合っていないという 1 つの原因の別々の現れ方である。

同じ原因の 3 つ目の現れ方が [#2259](https://github.com/kompiro/karasu/issues/2259) の後で見つかった。AT から `docs/design/` への 46 参照のうち **39 が既に解決しない**アドレスを指しており、うち 1 件（`1821-layer-toggle-external-infra.md`）は main に残った壊れた markdown リンクだった。preview URL と違い削除は規約が保証しているので、これは「腐りうる」ではなく「必ず腐る」参照である。
