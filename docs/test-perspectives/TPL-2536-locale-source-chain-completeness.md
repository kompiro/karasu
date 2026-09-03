---
id: TPL-2536
title: "環境から生タグを取り出す consumer は、その環境が定める優先順位の鎖を全部辿る — 一番有名な 1 本だけを読まない"
status: active
date: 2026-09-02
applicable_to:
  - "新しい consumer（CLI・エディタ拡張・サーバー・ライブラリ）に locale 解決を実装するとき"
  - "既存 consumer の locale 解決元を変更するとき（環境変数・ブラウザ API・初期化パラメータ）"
  - "locale 以外でも、ホスト環境が「複数の情報源 + 優先順位」で 1 つの設定を表現しているものを読むとき（proxy 設定・color 制御・config 探索パス）"
  - "consumer の出力文字列を assert するテストを書くとき（その出力が ambient な環境に依存していないか）"
known_consumers:
  - cli
  - app
  - lsp
  - vscode
discovered_from:
  - issue: "#2536"
  - root_cause_adr: "ADR-1417"
related_to:
  - TPL-1417
  - TPL-1001
topic: cli
scope:
  packages:
    - cli
    - i18n
    - app
    - lsp
    - vscode
---

# TPL-2536: locale の取り出しは情報源の鎖を全部辿る

## 観点

karasu は locale 解決を意図的に 2 層に割っている（[ADR-1417](../adr/1417-lsp-cli-i18n.md)、
#2081）。**生タグ → `Locale` の正規化**は `@karasu-tools/i18n` の `resolveLocaleTag` が
単独で所有し、`lint:locale-normalization` が複製を禁じる。一方、**環境から生タグを
取り出す部分**は consumer ごとの実装に残る。情報源が環境ごとに違うので当然の分割だが、
その結果**取り出し側だけが単一情報源の保護も機械チェックも持たない**。

このとき起きるのが本観点の失敗である。ホスト環境が「複数の変数・API に優先順位を
付けて 1 つの設定を表す」形を採っているのに、consumer が**その鎖の一番有名な 1 本
だけを読む**。読めている変数があるぶん動いて見えるので、抜けた 1 本を設定している
ユーザーにだけ「設定したのに効かない」として現れる。

正規化が単一情報源であることは、この失敗を一切防がない。`resolveLocaleTag` は
渡されたタグを正しく判定するだけで、**渡されなかったタグについては何も言えない**。

## 想定される失敗モード

実際に #2536 で起きた事故: `resolveCliLocale` が `LC_ALL || LANG` を読んでいた。
POSIX の message catalog の優先順位は `LC_ALL` > `LC_MESSAGES` > `LANG` で、
`LC_MESSAGES` が抜けていた。`LANG=en_US.UTF-8 LC_MESSAGES=ja_JP.UTF-8`（数値・日付は
英語書式、プログラムメッセージは日本語）は標準的な分割で、`LC_ALL` はまさに
`LC_MESSAGES` にこの役割を与えるため意図的に未設定にされる。結果、そう設定した
ユーザーの `karasu render` が英語の警告を出し続けた。

一般化すると次が起きる:

- 鎖の中間リンクだけが抜ける。両端（一番強い override と一番有名な既定）は読めて
  いるのでテストも通り、レビューでも気づかれない
- 抜けたリンクを使うのは「その環境の作法に沿って丁寧に設定したユーザー」なので、
  設定に無頓着なユーザーほど問題に遭遇せず、報告が遅れる
- consumer ごとに実装が独立しているため、1 箇所直しても他の consumer には伝播しない
  （#2536 は CLI を直したが、app の `resolveLocale()` は `localStorage` →
  `navigator.language` の 2 段で、`navigator.languages`（ブラウザの順序付き選好
  リスト）は見ていない。これは ADR-34 で選ばれた設計であって bug ではないが、
  「鎖の全部を辿ったか」を問う対象ではある）

**もう 1 つの失敗モード**として、consumer の出力を assert するテストが
**ambient な環境変数から解決された locale に依存する**ことがある。#2536 では
`packages/cli/src/i18n.ts` がモジュール読み込み時に一度だけ `process.env` から
translator を束ねるため、`LC_MESSAGES=ja_JP.UTF-8` を export している開発者の
クリーンチェックアウトで CLI の suite が 3 件落ちた。**取り出し先を増やすことは、
テストが暗黙に依存していた環境の面を増やすこと**でもある。

## チェックリスト

locale（あるいは同種の「複数情報源 + 優先順位」設定）の取り出しを書く / 触るときに確認する:

- [ ] ホスト環境の仕様が定める情報源を**列挙**したか。POSIX なら `LC_ALL` >
      `LC_MESSAGES` > `LANG`、ブラウザなら `navigator.languages` / `navigator.language`。
      「よく使われる 1 本」ではなく仕様の側から数える
- [ ] 読まないと決めた情報源について、**読まない理由をコード上に書いた**か。
      黙って落とすと、抜けなのか判断なのかが後から区別できない（例: CLI の
      `LANGUAGE` は POSIX 外・コロン区切りのリスト・`C` ロケール時は無視、と明記）
- [ ] 空文字を「未設定」として次のリンクへ落としているか。`LC_ALL=` は継承した
      override をシェルで打ち消す標準的な書き方なので、`??` ではなく `||` が要る。
      鎖の**すべての**リンクについて空文字のテストがあるか
- [ ] テストが開発者のシェル設定から独立しているか。解決関数には env オブジェクトを
      **注入**して呼び、その consumer の**出力**を assert する suite は設定で locale を
      pin する（`packages/cli/vitest.config.ts` の `env: { LC_ALL: "C" }`）
- [ ] ドキュメント側の記述（`docs/spec/i18n.md`、各 consumer の doc comment）が
      新しい鎖と一致しているか。#2536 では同じ列挙が 4 箇所に複製されていた

## 既知の対処パターン

- **鎖をそのまま式にする**: `env.LC_ALL || env.LC_MESSAGES || env.LANG`。優先順位が
  そのまま読める形にし、doc comment に「なぜこの順か」を書く。順序の根拠（POSIX の
  message catalog 規則）を書いておくと、次に触る人が並べ替えない
- **取り出しと正規化を分けたまま検証も分ける**: 判定表（どのタグが `ja` か）は
  `packages/i18n/src/locale.test.ts` が持つ。consumer 側のテストは
  **どの情報源から取るか**だけを assert し、判定を重複させない
  （`docs/spec/i18n.md` の「regression test」節）。#2536 の
  `packages/cli/src/i18n.test.ts` は precedence の勝敗と空文字の落ち方だけを見る
- **出力テストの locale を設定で pin する**: 解決関数がモジュール読み込み時に
  ambient な環境を読む設計なら、テストランナー側で最上位の変数を固定して
  suite を環境非依存にする。pin は「この suite の期待文字列は英語カタログのもの」
  という宣言でもある

## 関連テスト

- `packages/cli/src/i18n.test.ts` — `LC_ALL` / `LC_MESSAGES` / `LANG` の勝敗と、
  鎖の各リンクでの空文字 fallthrough（#2536 の回帰柵）
- `packages/i18n/src/locale.test.ts` — 正規化規則そのものの判定表。consumer 側の
  テストを追加するときは、この判定表と assert が重複していないかをここで確かめる
  （重複していたら、それは取り出しではなく正規化を検証している）
- `packages/cli/vitest.config.ts` — `env: { LC_ALL: "C" }`。CLI の出力を assert する
  suite が開発者のシェル設定で割れないようにする pin

## 派生元 spec

- [docs/spec/i18n.md 「翻訳テーブル（`@karasu-tools/i18n`）」](../spec/i18n.md#翻訳テーブルkarasu-toolsi18n) —
  「正規化は `resolveLocaleTag` の単独所有、取り出しは consumer ごと」という分割と、
  取り出し側が優先順位の鎖を全部辿る規定
