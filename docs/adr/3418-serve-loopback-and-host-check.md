---
id: ADR-3418
title: "`karasu serve` を loopback で listen し、ローカルでない `Host` の `/api/*` を拒否する"
status: accepted
date: 2026-11-01
topic: cli
depends_on: [ADR-3426]
related_to: [ADR-123, ADR-3017, ADR-3258]
scope:
  packages: [cli]
  concerns: [security]
assumptions:
  - 'grep: packages/cli/src/serve-host.ts :: DEFAULT_HOST = "127.0.0.1"'
  - "symbol: packages/cli/src/serve-host.ts :: isAllowedHost"
  - "symbol: packages/cli/src/serve-host.ts :: normalizeAllowedHost"
  - "symbol: packages/cli/src/serve-host.ts :: isLoopbackAddress"
  - "grep: packages/cli/src/serve-host.ts :: http://localhost:\\$\\{port\\}"
  - "grep: packages/cli/src/serve.ts :: another process is listening on \\[::1\\]"
  - "grep: packages/cli/src/serve.ts :: isAllowedHost\\(req\\.headers\\.host"
  - "grep: packages/cli/src/serve-command.ts :: --allowed-host <name>"
  - "grep: packages/cli/src/serve-command.ts :: --host <addr>"
---

# ADR-3418: `karasu serve` を loopback で listen し、ローカルでない `Host` の `/api/*` を拒否する

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3418](https://github.com/kompiro/karasu/issues/3418)（[#3283](https://github.com/kompiro/karasu/issues/3283) の提案から分離）。Design Doc PR #3433、実装 PR #3530
  - 前提: [ADR-3426](3426-render-src-ssrf-guard.md)（`/render?src=` が自分の `/api/*` を取りに行く経路を先に塞いだ）
  - 関連 ADR: [ADR-123](123-github-markdown-render-service.md)（`/render` を公開ホストしうるものとして置いた）、[ADR-3017](3017-serve-app-shipping.md)、[ADR-3258](3258-serve-import-resolution.md)
  - TPL: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - AT: [AT-3418](../acceptance/3418-serve-loopback-host-check.md)
  - コード: `packages/cli/src/serve.ts`、`packages/cli/src/serve-host.ts`、`packages/cli/src/serve-command.ts`

## 背景

`karasu serve` は `server.listen(port)` を host なしで呼んでいたので、すべてのインターフェースで listen していた。port に
届く人は誰でも `/api/file/:name`、`/api/files`、`/api/project`、`/api/watch`、`/api/default` を呼べ、配信ディレクトリの
`.krs` / `.krs.style` を読めた。

#3283 で symlink 越しの脱出を塞ぎ、`/api/*` から `Access-Control-Allow-Origin: *` を外した。これで他のページが
cross-origin で API を読むことは止まったが、経路が 3 つ残っていた。

- **ネットワーク**: 同じネットワークの別マシンが API を直接呼べる
- **DNS rebinding**: 攻撃者のドメインを `127.0.0.1` に向け直すと、ブラウザから見て同一 origin になり、CORS では守れない。
  このときブラウザが送る `Host` は攻撃者のドメインのままである
- **`/render` 経由の SSRF**: `/render?src=` から自分の `/api/*` を取りに行かせる。この request は loopback の `Host` を持つので
  bind でも `Host` 検査でも止まらない。ADR-3426 で先に塞いだ

守るべき資産は `/api/*` が返す配信ディレクトリの中身だけである。app の静的ファイルは公開 npm パッケージの build そのもので、
`/render` は ADR-3426 の後は loopback・private・このマシン自身のアドレスに届かない。

## 決定

`serve` は既定で `127.0.0.1` だけで listen し、`--host <addr>` で listen 先を変えられるようにする。`/api/*` は `Host` ヘッダが
IP literal、`localhost` / `*.localhost`、`--allowed-host <name>` で渡した名前のどれかのときだけ答え、それ以外は 403 にする。

### bind と表示

- 既定の `127.0.0.1` は CLI だけでなく `serve()` 自身が持つ。host を渡さない呼び出し（テストなど）も全インターフェースで
  listen しない
- `--host` は `listen(port, host)` にそのまま渡す。`docker run -p` や LAN 共有には `--host 0.0.0.0` を案内する
- 表示 URL は、`127.0.0.1`（既定）と `0.0.0.0` / `::` では今までどおり `Preview : http://localhost:<port>`。app は theme・locale・
  パネル幅を `localStorage` に、API key を既定で `sessionStorage` に持ち、どちらも origin ごとなので既定の URL は変えない。
  `0.0.0.0` / `::` では `Listening : 0.0.0.0:<port>`（`[::]:<port>`）の行を足す。それ以外は `server.address()` から作り、
  IPv6 は `[...]` で囲む
- listen した後の `server.address()` が loopback（`127.0.0.0/8`、`::1`、`::ffff:127.0.0.0/104`）でなければ、配信ディレクトリが
  そのアドレスに届く誰からでも読めることを stderr に警告する
- IPv4 で listen して `localhost` を表示するとき（`127.0.0.1`、`0.0.0.0`）は、`[::1]:<port>` に接続を試す。繋がれば、
  `http://localhost:<port>` が別のプロセスを開きうることを警告する。IPv4 の bind は `[::1]:<port>` が使われていても成功し、
  クライアントは `localhost` を `::1` から試すため
- listen の失敗（`EADDRINUSE`・`EADDRNOTAVAIL`・`ENOTFOUND` など）は `serve()` が返す `Server` の `error` event に出し、
  CLI（`serve-command.ts`）が `karasu serve: cannot listen on <host>:<port>: ...` を出して exit 1 にする。`serve()` はテストから
  プロセス内で呼ばれるので `process.exit` を持たない。listen した後の `error`（accept の `EMFILE` など）は listen の失敗として
  報告せず、それ自身のメッセージで exit 1 にする
- file watcher は listen に成功してから起動する。listen に失敗したとき watcher を残さないため

### `Host` 検査

- 検査は `Host` ヘッダが止めるもの、つまり **ブラウザ経由の DNS rebinding だけ**を対象にする。アクセス制御ではない。
  ブラウザ以外は好きな `Host` を送れ、reverse proxy や port forwarding 越しでは karasu から見た接続は loopback から来る。
  proxy や forwarding で開くときに誰が届くかは、proxy 側の認証・認可で決める
- 対象は router と同じ `url.pathname` が `/api/` で始まる request。`req.url` の文字列の prefix で決めると、router が `/api/files`
  として答える `//x/api/files` を見落とす
- 読むのは `req.headers.host`。base URL で解いた `url.hostname` は使わない。absolute-form の target や `//localhost/...` が
  決める値になり、検査が黙って素通しになる
- 形を先に allowlist で確かめる: 名前か IPv4（英数字・`-`・`_`・`.`）、または `[...]` で囲んだ IPv6 に、任意の `:<数字>` が
  続くもの。それ以外（path・query・fragment・userinfo・percent-encoding・`\`・空白）は拒否する。`new URL("http://" + host)` は
  `localhost/evil` や `evil@localhost` からも `localhost` を取り出すので使わない。形を通った値は小文字にし、末尾の `.` を 1 つ外す。
  IPv6 は `[...]` の中を `node:net` の `isIP` で判定する。`_` は docker compose のサービス名を proxy がそのまま `Host` に渡す
  場合のために認める（`_` を足しても IP literal にはならず、`.localhost` で終わる値は元から許す `*.localhost` の範囲なので、
  rebinding に使える名前は増えない）
- `Host` が無い（HTTP/1.0）か空の request は拒否する。`Host` の無い HTTP/1.1 は Node が先に 400 を返す
- 許可するのは次の 3 つ。port は見ない
  1. **IP literal**。DNS rebinding は名前を必要とし、ページは `Host` を書き換えられない（forbidden header）。IP literal の
     `Host` はそのアドレスを直接開いた人か、ネットワークから直接呼んだ人のもので、後者は bind で止める範囲である。
     これで `--host 0.0.0.0` で LAN から `http://192.168.1.5:3000` を開く使い方が追加の設定なしに動く
  2. `localhost` と `*.localhost`。`.localhost` は public DNS に委譲されない（RFC 6761）。resolver 自体が攻撃者の手にある場合は
     範囲外とする
  3. `--allowed-host <name>`（繰り返し指定できる）。`.example.com` の形はその名前とサブドメインに一致し、`badexample.com` には
     一致しない（Vite の `server.allowedHosts` と同じ形）。CLI が受け取った時点で小文字にし、末尾の `.` を 1 つ外す。
     port・scheme・path を含む値は黙って一致しなくなるのでエラーにして exit 1 にする。`.` で始まる値は 2 ラベル以上を求め、
     `.dev` のように TLD ごと許す値を拒否する。`.co.uk` のような広い suffix を許すかは利用者の判断に残す

## 理由

- `127.0.0.1` なら `http://127.0.0.1:<port>` も `http://localhost:<port>` も開け（クライアントは `::1` から `127.0.0.1` に落ちる）、
  listen が 1 つのままで済む
- 表示 URL と origin を変えないので、`localhost` で開いている大多数の利用者には変化が無く、app の保存値もそのまま使える
- `Host` を見れば、CORS では止まらない DNS rebinding を、ブラウザが偽れない値で止められる
- 検査を `/api/*` に限るのは、守る資産がそこにしか無く、`/render` を名前で公開ホストする使い方（ADR-123）を狭めないため
- `--host` と `--allowed-host` を分けるのは、listen 先と許可する名前が別の問いだから。Codespaces の forwarded port
  （`*.app.github.dev`）や ngrok の名前はローカルのアドレスに解決されず、listen 先には使えない

## 却下した案

- **既定の bind を `localhost` にする**: Node は名前解決の最初の 1 アドレスだけで listen し、環境によって `::1` だけになって
  `http://127.0.0.1:<port>` が開けなくなる。どちらになるかが OS の設定で変わる
- **`127.0.0.1` と `::1` の両方で listen する**: HTTP server を 2 つ立て、`::1` が無い環境の `EADDRNOTAVAIL` を握りつぶす
  分岐が要り、`serve()` が `Server` を 1 つ返す API も変わる。得るものはフォールバック 1 回分と、警告で知らせられる shadowing だけ
- **全 path に `Host` 検査をかける**: app の静的ファイルは公開済みで、`/render` は攻撃者が自分で渡した入力の SVG しか返さない。
  `/render` まで止めると名前でホストした `/render` が `--allowed-host` 無しで 403 になる。`/render` 経由で `/api/*` に届く経路は
  `Host` 検査では止まらない（ADR-3426 で塞ぐ）ので、全 path にかけてもその対策にならない
- **`--host` に渡した名前を許可する名前として兼ねる**: ローカルのアドレスに解決されない名前（forwarded port や ngrok）は
  listen できず（`EADDRNOTAVAIL`）、`/api/*` に届く手段が無くなる
- **`/render` 専用のモードを今足す**: 公開ホストはまだ存在せず（ADR-123 も範囲外としている）、足すなら公開側の要件
  （レート制限、キャッシュ、デプロイ先）と一緒に決める。それまでは loopback 以外で listen したときの警告で、配信ディレクトリが
  読めることを伝える。公開ホストを作るときに、空のディレクトリを配信するか `/api/*` を持たない render 専用モードを足すかを決める

## 影響

- LAN の別マシンやコンテナの外から開いていた人は `--host 0.0.0.0` が要る。Codespaces の forwarded URL や reverse proxy 越しに
  開いていた人は、karasu に届く `Host` が IP literal・`localhost`・`*.localhost` のどれでもないときだけ、その名前の
  `--allowed-host` が要る（`Host` を `127.0.0.1:3000` に書き換える proxy なら要らず、`karasu:3000` のような upstream の DNS 名に
  書き換えるなら `--allowed-host karasu`）。changeset（`karasu` minor）と `docs/tools/cli.md` / `cli.ja.md` に書いた
- `serve` のコマンド定義は、`index.ts` の行数上限に収めるため `serve-command.ts` の `configureServeCommand` に移した。
  `index.ts` は `.command("serve [dir]")` の登録だけを持つ（`skill-cli-refs` が `index.ts` の `.command(...)` からコマンド一覧を読むため）
- IPv6 だけの環境では既定の `127.0.0.1` で開けないので `--host ::1` を使う。明示した `--host ::` は、IPv6 の無い環境で
  `0.0.0.0` に落ちずに失敗する（今までの `listen(port)` は落ちていた）
- VS Code 拡張は `serve` を使わないので影響しない。Playwright の serve project と `serve.e2e.test.ts` は `localhost` で到達し続け、
  既定の bind で `localhost` が開けることを確かめている

## 決めないこと

- `/render` の公開ホスト用モード（上の却下した案）。公開ホストを作るときに決める
- `--allowed-host` で全部を許す値（Vite の `allowedHosts: true` 相当）。要望が来たら別 Issue
- 環境変数（`KARASU_HOST` など）での指定。今は CLI オプションだけにする
