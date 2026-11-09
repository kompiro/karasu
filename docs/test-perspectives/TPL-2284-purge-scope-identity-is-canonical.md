---
id: TPL-2284
title: "削除範囲を決める識別子は、綴りの揺れが別スコープにならないよう canonical 化する"
status: active
date: 2026-08-02
applicable_to:
  - "prefix / 名前空間 / パーティションキーで一括削除する store（KV・S3・Redis・ファイルツリー）"
  - "「この主体のデータを全部消す」を約束する経路（アンインストール・退会・purge API・GDPR 削除請求）"
  - "外部から来た識別子（webhook payload / route param / header）をそのまま鍵の一部にする箇所"
known_consumers:
  - karasu-nest-krs-cache
discovered_from:
  - issue: "#2284"
related_to:
  - TPL-168
  - TPL-1032
topic: project
scope:
  packages:
    - nest
---

# TPL-2284: 削除範囲を決める識別子は、綴りの揺れが別スコープにならないよう canonical 化する

## 観点

prefix で一括削除する store では、**識別子の綴りが 1 通りであることが削除の完全性そのもの**である。同じ主体を指す 2 つの綴り（`42` と `"042"`、`Kompiro` と `kompiro`、末尾スラッシュの有無）が別の prefix を作れば、purge は片方しか消さない。しかも**残った側は purge の戻り値にも例外にも現れない**ため、呼び出し側からは成功に見える。

これは入力バリデーション（[TPL-168](TPL-168-trust-boundary-input-validation.md)）の一種に見えるが、失敗の向きが逆である。TPL-168 は「不正な入力を通すな」で、検出は拒否として現れる。こちらは**正当な入力を 2 通りに割ってしまう**話で、どの入力も単体では正しく、拒否も例外も起きない。テストで「不正値を弾く」ことだけ確認しても、この欠陥は残る。

「削除できたか」を後から観測する手段が無いことが、この観点を独立させる理由である。書き込みの取りこぼしは次の読み取りで気づくが、削除の取りこぼしは**誰も読まなくなったデータが残る**という形をとる。気づく契機が構造的に存在しない。

## 想定される失敗モード

- webhook payload が `installation.id` を数値で、route param が同じ id を文字列で渡し、`"042"` と `42` が別 prefix になる。アンインストール後もそのインストールのデータが残る
- 大文字小文字を区別しないドメイン名（GitHub の owner / repo、メールアドレスのローカル部を除く部分）をそのまま鍵にし、`Foo/Bar` で書いて `foo/bar` で消す
- prefix に末尾セパレータが無く、`4` の purge が `42` のデータまで消す（逆向きの事故 — こちらは**消しすぎ**で、気づくのは早いが被害は大きい）
- 鍵のセパレータ（`/`）を含みうる値を検証せずに埋め込み、ある主体のデータが別の主体の prefix の内側に着地する
- purge が「0 件削除」を成功として返し、実は prefix が違っていただけだった

## チェックリスト

prefix / 名前空間で一括削除する store を足す・変えるときに確認する:

- [ ] 削除範囲を決める識別子の **canonical 形を 1 か所で定義**し、書き込みと削除の**両方**がそこを通っているか（別々に正規化していると片方だけ直る） [guard: `packages/nest/src/store/gallery-key-contract.test.ts`, `packages/nest/src/store/gallery-keys.test.ts`]
- [ ] 同じ主体の**異なる綴りが同じ鍵になる**ことを test で固定したか。「不正値を弾く」テストだけでは足りない [guard: `packages/nest/src/store/gallery-keys.test.ts`]
- [ ] prefix に**セパレータを含めた**か。`4` が `42` を巻き込まないこと、`kara` が `karasu` を巻き込まないことを両方向で test したか
- [ ] 識別子にセパレータ文字が入りうるなら**拒否**しているか（エスケープではなく拒否 — エスケープは往復の対称性を要求し、片側だけ直る事故を生む） [guard: `packages/nest/src/store/gallery-keys.test.ts`]
- [ ] 削除が**何件消したかを返す**か。呼び出し側がログに残せないと、purge が走ったことすら後から言えない [guard: `packages/nest/src/store/gallery-purge-coverage.test.ts`]
- [ ] 一覧が eventually consistent な store（Cloudflare KV・S3）では、purge を**冪等かつ再実行可能**として設計したか。1 回の呼び出しで完全性を主張していないか
- [ ] 鍵の layout に**バージョン成分**があるか。layout を変えるとき、旧 layout を prefix で消せる [guard: `packages/nest/src/store/gallery-key-contract.test.ts`]

## 既知の対処パターン

- **canonical 化を鍵生成モジュールに閉じ込める** — `cacheKey` / `installationPrefix` / `repoPrefix` が同じ正規化関数を共有していれば、書き込みと削除がずれない。呼び出し側に「小文字で渡してください」と要求する設計は必ず破られる
- **綴りの等価性をテストで固定する** — `expect(key({id: "042"})).toBe(key({id: 42}))` の形。実装を読まずに意図が読める
- **prefix には必ず末尾セパレータ** — 巻き込み事故はこれ 1 つで消える
- **削除数を返す** — 完全性は証明できなくても、走ったことは記録できる
- **1 回の purge で完全性を主張しない** — eventually consistent な一覧では、purge 中に着地した書き込みが見えないことがある。削除経路は再実行できる形にしておく

## 関連テスト

- `packages/nest/src/store/gallery-keys.test.ts` — `account id normalisation` の「collapses leading zeros, so one account cannot own two prefixes」
  （`"042"` と `"42"` が同じ id になる）と「refuses anything that is not a positive integer」（`42/43` のようなセパレータ入りを拒否）。
  `key layout` の「ends the sweepable prefixes with a slash, so 42 cannot reach 420」が末尾セパレータを、各 prefix の `v1` がバージョン成分を固定する
- `packages/nest/src/store/gallery-purge-coverage.test.ts` — `account purge coverage` の「touches nothing belonging to an account whose id merely extends it」
  （`GalleryStore.purgeAccount` 経由で 42 の purge が 420 を巻き込まない）と「counts what it deleted in every category」
- `packages/nest/src/store/gallery-keys.test.ts`: 「every key builder」。鍵か prefix を返す export（型から導出）はすべて `BUILDERS` に
  引数の種類つきで載せないとコンパイルが通らず、種類ごとの契約（同じ主体の綴りが同じ鍵になる・`/` と `-` を含む値を拒む）を全ビルダーの
  全引数に当てる。新しい種類の識別子は契約を書かないと宣言できない（どの綴りを同一とみなすかはそこでレビューする）
- `packages/nest/src/store/gallery-key-contract.test.ts`: `KVNamespaceLike` がビルダーの作った brand 付きの鍵しか受け取らないこと
  （書き込みも削除も canonical 化を通る）と、`KeySpaceDefinition` がバージョンの無い prefix を拒むことを `@ts-expect-error` で固定する
- `packages/nest/src/store/gallery-purge-coverage.test.ts`: 「can run again on a purged account, and reports nothing the second time」。
  全空間で 2 回目の purge が例外を出さず 0 を返すこと。eventually consistent な一覧の下で purge が完全性を主張しないことまでは
  確かめていない（`AccountStore.purgeAccount` は削除後に読み直さない）ので、6 つ目の項目は印なし
- `packages/nest/src/store/sweep.test.ts` — `purgeByPrefix`。削除件数を返すこと、eventually consistent な一覧で再出現した鍵を 1 回だけ数えること、
  削除が効かないときに成功を返さず prefix を名指して失敗すること

## 由来

karasu-nest の生成済み `.krs` キャッシュ（[#2284](https://github.com/kompiro/karasu/issues/2284)）は、[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6 の「uninstall = purge」を成立させるために installation id を prefix の最外に置く鍵 layout を採った。レビューで、`installationId` が `number | string` を受けるのに `"042"` を `42` へ畳んでいないことが指摘された — webhook payload と route param という 2 つの経路が同じ id を別の綴りで渡しうる設計だったため、片方の綴りで書かれたデータが purge の射程外に残りうる状態だった。

bug としては顕在化していない（この TPL は proactive）。同 PR で正規化と等価性テストを入れて閉じたが、**この失敗は「拒否テストが全部通っている」状態と両立する**ため、観点として独立させておく価値がある。
