---
id: TPL-3103
title: "配布物に入る文書のリンクは、配布物の中か絶対 URL を指す"
status: active
date: 2026-10-17
applicable_to:
  - "repo 内の文書をコピー・同梱して配布する仕組み（skill の reference、パッケージの README・docs）"
  - "repo のディレクトリ構成を前提にした相対リンクを持つ文書が、別の場所（インストール先・レジストリのページ）で読まれる経路"
  - "原本とコピーの一致を drift ガードで保証している同梱物"
known_consumers:
  - karasu-skills-reference
  - vscode-marketplace-readme
discovered_from:
  - issue: "#3103"
  - issue: "#1779"
  - root_cause_file: "scripts/lint/skill-reference-bundle-sync.ts"
related_to:
  - TPL-1681
  - TPL-2254
topic: build
scope:
  packages:
    - skills
    - vscode
---

# TPL-3103: 配布物に入る文書のリンクは、配布物の中か絶対 URL を指す

## 観点

repo の中で書いた文書の相対リンク（`../adr/…`、`../test-perspectives/…`）は、**repo のディレクトリ構成があるから解決する**。その文書をコピーして配布すると、読まれる場所（skill のインストール先、npm / Marketplace のページ）には構成が無く、リンクは黙って切れる。配布物に入る文書は、**読まれる場所でリンクが解決するか**で評価する。行き先が配布物の中にあればその中を指し、無ければ絶対 URL を指す。

発見事例（#3103）: skill に同梱した reference（`docs/spec/*.md` のコピー）は原本とバイト単位で一致させる drift ガードを持っていたため、179 本の相対リンクがすべてインストール先で切れていた。一致を保つガードがあると「コピーは正しい」と読めてしまうが、ガードは**原本と同じであること**しか見ておらず、**読まれる場所で使えること**は見ていない。同じ形は #1779 でも起きた（VS Code 拡張の README の相対パスの画像が、`vsce` が `repository.directory` を無視するため Marketplace で 404 になった）。

## 想定される失敗モード

- 同梱した文書の出典リンク（ADR・TPL）や関連文書へのリンクが、インストール先ですべて 404 になる。repo の中で開くと動くので、作者も CI も気づかない
- 原本とのバイト一致を drift ガードが要求しているため、コピー側だけ直すとガードが落ち、直せないまま残る（#3103 は #3102 のレビューで指摘されたが、その PR では直せなかった）
- README の画像やリンクが、レジストリのページでだけ壊れる（#1779）

## チェックリスト

repo の文書を配布物に入れる仕組みを追加・変更するとき:

- [ ] 配布物の中のリンクを、**読まれる場所（インストール先・レジストリ）の構成で**解決させて確かめたか。repo の中で開いて確かめるだけでは足りない
- [ ] 行き先が配布物に同梱されているリンクは同梱物を、されていないリンクは絶対 URL を指すか
- [ ] 原本との一致を保つ drift ガードがあるなら、そのガードはリンクの書き換えを込みで比べているか（書き換えを禁じる形になっていないか）
- [ ] リンクが解決することを、同梱物そのものを読むテストで固定したか（書き換え関数の単体テストだけでは、関数を通らない経路の漏れを見ない）

## 既知の対処パターン

- **コピーするときに書き換え、drift ガードは書き換えた原本と比べる**（#3103）。`skill-reference-bundle-sync.ts` の `bundledContent` が、同梱している原本を指すリンクを兄弟のコピーへ、それ以外を `https://github.com/kompiro/karasu/blob/main/<path>` へ書き換える。比較は文字列の一致のまま保てる
- **同梱物のリンクを実際に解決する柵を置く**。`skill-reference-bundle-sync.test.ts` の「links in the bundled copies」は、同梱物の全リンクが同梱ディレクトリの中か、repo に実在するファイルの GitHub URL を指すことを確かめる。書き換え前のコピーで落ちることを確認した
- **README の画像は絶対 URL で書く**（#1779）。レジストリが相対パスの基点を repo のサブディレクトリとして解釈しない

## 関連テスト

- `scripts/lint/skill-reference-bundle-sync.test.ts`（`bundledContent()` の単体テストと、同梱物のリンクを解決する柵）
