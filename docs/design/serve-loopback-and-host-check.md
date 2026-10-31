# `karasu serve` を loopback で listen し、ローカルでない `Host` を拒否する

- **日付**: 2026-10-31
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3418](https://github.com/kompiro/karasu/issues/3418)（[#3283](https://github.com/kompiro/karasu/issues/3283) の提案から分離）
  - 前提 Issue: [#3426](https://github.com/kompiro/karasu/issues/3426)（`/render` の SSRF 対策が redirect と名前解決後のアドレスを見ていない）
  - 関連 ADR: [ADR-123](../adr/123-github-markdown-render-service.md)（`/render` を公開ホストしうるものとして置いた）、[ADR-3017](../adr/3017-serve-app-shipping.md)、[ADR-3258](../adr/3258-serve-import-resolution.md)
  - 関連 TPL: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - コード: `packages/cli/src/serve.ts`、`packages/cli/src/render-endpoint.ts`、`packages/cli/src/index.ts`、`packages/cli/src/agent-surface.json`

## 背景・課題

`karasu serve` は `server.listen(port)` を host なしで呼ぶので、すべてのインターフェースで listen する。
port に届く人は誰でも `/api/file/:name`、`/api/files`、`/api/project`、`/api/watch`、`/api/default` を呼べ、
配信ディレクトリの `.krs` / `.krs.style` を読める。

#3283 で symlink 越しの脱出を塞ぎ、`/api/*` から `Access-Control-Allow-Origin: *` を外した。これで他のページが
cross-origin で API を読むことは止まった。残っている経路は 3 つある。

- **ネットワーク**: 同じネットワークの別マシンが API を直接呼べる。本 Design Doc の bind で止める。
- **DNS rebinding**: 攻撃者のドメインを `127.0.0.1` に向け直すと、ブラウザから見て同一 origin になり、CORS では守れない。
  このときブラウザが送る `Host` は攻撃者のドメインなので、`Host` を見れば止められる。本 Design Doc の `Host` 検査で止める。
- **`/render` 経由の SSRF**: `/render?src=` は redirect を検査せずに辿り、`isSafeUrl()` は hostname の文字列しか見ない。
  外部 URL から `http://127.0.0.1:<port>/api/file/...` へ redirect させると、karasu が自分の `/api/*` を取りに行く。
  この request は IP literal の `Host` を持つので bind でも `Host` 検査でも止まらず、`/render` の応答には
  `Access-Control-Allow-Origin: *` が付いているので任意のページから読める（loopback に解決される名前を `src` に直接渡す形は、
  `Host` がその名前になるので `Host` 検査で止まる）。これは #3426 で直し、本 Design Doc の実装より先に入れる。
  #3426 は loopback / private だけでなく、このマシン自身のアドレス（`os.networkInterfaces()`。`--host 0.0.0.0` のときの
  public IP や CGNAT の `100.64.0.0/10` を含む）への fetch も拒否する必要がある。

## 現状（インベントリ）

| 観点               | 現状                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bind               | `server.listen(port)`。Node は `::`（IPv6 が無ければ `0.0.0.0`）で listen し、全インターフェースに開く                                                                                                                                                                                      |
| 起動時の表示       | `Preview   : http://localhost:<port>` 固定                                                                                                                                                                                                                                                  |
| CLI                | `serve [dir]` と `-p, --port`（既定 `3000`）だけ                                                                                                                                                                                                                                            |
| `/render`          | `src` か `code` を受けて SVG を返す。`src` は `isSafeUrl()` で hostname の文字列を見るだけで、redirect は `redirect: "follow"` で検査せずに辿る（ADR-123 §3 の「リダイレクト先も検証」が未実装、#3426）。応答に `Access-Control-Allow-Origin: *` を付ける                                   |
| `/api/*`           | 配信ディレクトリの中身を返す。守るべき資産はここにある                                                                                                                                                                                                                                      |
| app の静的ファイル | 公開 npm パッケージの build と同じもの。秘密は含まない                                                                                                                                                                                                                                      |
| handler の URL     | `new URL(req.url, \`http://localhost:${port}\`)`。`url.hostname` は base の `localhost` か、request target が決める値（absolute-form や `//x/api/files`）で、どちらも `Host` ヘッダの代わりにはならない。router は `url.pathname` で分岐する（`//x/api/files` の pathname は `/api/files`） |
| 呼び出し側         | `serve.e2e.test.ts` は `http.request({ host: "localhost" })`、Playwright の serve project は `http://localhost:<port>` で到達する                                                                                                                                                           |
| Node               | `engines.node >= 22.12`。Node 20 以降の HTTP client は `autoSelectFamily` が既定で、`localhost` の IPv6 / IPv4 を両方試す。HTTP server は `requireHostHeader: true` が既定で、`Host` の無い HTTP/1.1 request に 400 を返す（空の `Host:` は handler に届く）                                |
| app の保存値       | theme、locale、パネル幅、API key（`packages/app/src/utils/api-key-storage.ts`）を `localStorage` に持つ。origin ごとなので、`localhost:<port>` と `127.0.0.1:<port>` では別になる                                                                                                           |

## 制約・前提

- 既定でローカル開発者が困らないこと。表示される URL と、手で打つ `http://localhost:<port>` の両方が開けること
- `docker run -p` や LAN 共有のように、全インターフェースで listen したい使い方は明示のオプションで残す
- Codespaces の port forwarding や reverse proxy のように、ローカルでない名前で届く使い方も明示のオプションで残す
- CLI は `0.10.0`（1.0 前）。既定の bind を変えるのは `minor` の挙動変更として扱う
- `/render` の SSRF 対策そのもの（#3426）と、公開ホストの運用（レート制限、render 専用デプロイ）は範囲外

## 決めること 1: 既定の bind 先

### 案A: `127.0.0.1`

IPv4 loopback だけで listen する。

**メリット**

- `http://127.0.0.1:<port>` も `http://localhost:<port>` も開ける。ブラウザ、curl、Node 22 の HTTP client は `localhost` を
  `::1` で試して駄目なら `127.0.0.1` に落ちる
- 1 つの `listen` で済む

**デメリット**

- IPv6 だけの環境では開けない（`--host ::1` で逃げられる）
- 別のプロセスが `[::1]:<port>` だけで listen していると、`127.0.0.1:<port>` の bind は `EADDRINUSE` にならずに成功し、
  `http://localhost:<port>` はそちらを開く。起動時に `[::1]:<port>` へ接続を試し、繋がったら警告する（決めること 2）

### 案B: `localhost`

`listen(port, "localhost")`。Node は名前解決の最初の 1 アドレスだけで listen する。

**メリット**

- Vite と同じ既定で、説明しやすい

**デメリット**

- 環境によって `::1` だけで listen し、そのとき `http://127.0.0.1:<port>` が開けない。どちらになるかが OS の設定で変わる

### 案C: `127.0.0.1` と `::1` の両方

HTTP server を 2 つ立て、同じ handler を渡す。

**メリット**

- どちらの loopback でも 1 回目で繋がり、port shadowing も起きない

**デメリット**

- `::1` が無い環境（IPv6 を切った container など）で `EADDRNOTAVAIL` を握りつぶす分岐が要る
- `serve()` が `Server` を 1 つ返す今の API（テストが `listening` と `address()` を使う）を変える必要がある
- 得るものは案A のフォールバック 1 回分と、表示 URL で避けられる shadowing だけ

**案A を採る。** どちらの URL でも開け、listen が 1 つのままで済む。案B は環境によって片方の URL が開けなくなり、
案C は得るものに比べて API と分岐が増える。既定は CLI だけでなく `serve()` 自身に持たせ、host を渡さない呼び出し
（テストなど）が全インターフェースで listen しないようにする。

## 決めること 2: `--host <addr>` と表示する URL

`--host <addr>` を足し、`listen(port, host)` にそのまま渡す。既定は `127.0.0.1`。

- `--host 0.0.0.0` で全 IPv4 インターフェースに、`--host ::` で（IPv6 がある環境の）全インターフェースに listen する。
  今の `listen(port)` は IPv6 が無ければ `0.0.0.0` に落ちるが、明示した `::` は落ちずに失敗する。
  `docker run -p` では container の中で全インターフェースに listen する必要があるので、`0.0.0.0` を案内する
- loopback 以外で listen したときは、起動時に stderr へ警告を出す: 配信ディレクトリの `.krs` / `.krs.style` が、
  このアドレスに届く誰からでも読めること。loopback の判定は listen した後の `server.address()` で行い、
  `127.0.0.0/8`、`::1`、IPv4-mapped の `::ffff:127.0.0.0/104` を loopback とする
- 表示する URL: `127.0.0.1` で listen したとき（既定）は今と同じ `Preview : http://localhost:<port>`。app は theme や API key を
  `localStorage` に持ち、origin が変わると引き継がれないので、既定の URL は変えない。それ以外は `server.address()` から作り、
  IPv6 は `[...]` で囲む。`0.0.0.0` / `::` のときは `Preview : http://localhost:<port>` に `Listening : 0.0.0.0:<port>`
  （`::` なら `[::]:<port>`）の行を足す
- 既定の bind のとき、listen の後に `[::1]:<port>` へ接続を試す。繋がったら、`http://localhost:<port>` が別のプロセスを
  開きうることと、`http://127.0.0.1:<port>` を使うか port を変えることを stderr に警告する（案A の port shadowing）
- listen の失敗（`EADDRINUSE`、存在しないアドレスの `EADDRNOTAVAIL`、解決できない名前の `ENOTFOUND` など）は、
  今は未処理の `error` で落ちる。`--host` で起きやすくなるので、CLI がメッセージを出して exit 1 にする。`serve()` は
  テストからプロセス内で呼ばれるので、`process.exit` は `serve()` ではなく `index.ts` に置き、`serve()` は error を返すだけにする
- `--host` は listen 先だけを決め、`Host` の許可には関わらない。名前を渡しても、その名前が解決される 1 アドレスで
  listen するだけで、`localhost` からは届かなくなる。ローカルでない名前を許すのは `--allowed-host`（決めること 3）

## 決めること 3: `Host` ヘッダの検査

### 検査の範囲

`Host` 検査が止めるのは **ブラウザ経由の DNS rebinding だけ** である。ローカルのプロセスが自分に送る request
（`/render` の fetch など）は loopback の `Host` を持つので通る。その経路は #3426 が `/render` 側で塞ぐ。

### 許可する `Host`

`/api/*`（pathname が `/api/` で始まるもの）への request は、`Host` の hostname が次のどれかでなければ 403 で拒否する。

1. **IP literal**（`127.0.0.1`、`[::1]`、`192.168.1.5` など）
2. `localhost` と `*.localhost`
3. `--allowed-host <name>` で渡した名前。繰り返し指定できる。`.example.com` のように先頭が `.` の値は、その名前と
   サブドメインを許す（Vite の `server.allowedHosts` と同じ形。`badexample.com` は一致しない）。値は CLI が受け取った時点で
   小文字にし、末尾の `.` を 1 つ外す。port・scheme・path を含む値（`foo.app.github.dev:443`、`https://...`）は
   黙って一致しなくなるので、エラーにして exit 1 にする

port は見ない。

IP literal を通してよいのは、DNS rebinding が名前を必要とするからである。攻撃者のページの origin は攻撃者のドメインで、
ブラウザが送る `Host` もそのドメインになる。ページが `Host` を書き換えることはできない（forbidden header）。
`Host` が IP literal の request は、そのアドレスを直接開いた人か、ネットワークから直接呼んだ人のもので、
後者は bind で止める範囲である。これで `--host 0.0.0.0` で LAN の別マシンから `http://192.168.1.5:3000` を
開く使い方も、追加の設定なしに動く。

`*.localhost` を通してよいのは、`.localhost` が public DNS に委譲されていない名前だからである（RFC 6761）。
Chrome と Firefox は名前解決せずに loopback に向けるが、RFC は SHOULD で、Safari やシステムの resolver に任せる環境もある。
残るのは resolver 自体が攻撃者の手にある場合で、それは本 Design Doc の範囲外とする。

### `Host` の読み方

- `req.headers.host` を読む。handler の `url`（`http://localhost:${port}` を base にしたもの）の `hostname` は使わない。
  base の `localhost` か request target が決める値（absolute-form の `GET http://localhost/api/files` に `Host: evil`、
  `GET //localhost/api/files`）になり、検査が黙って素通しになる
- 検査するかどうかは router と同じ `url.pathname` で決める。`req.url` の文字列の prefix で決めると、`//x/api/files` のように
  router が `/api/files` として答える request を見落とす
- `new URL("http://" + host)` を try/catch で包んで hostname を取り、解析できない値は拒否する。URL は path・query・fragment・
  userinfo を持つ値（`localhost/evil`、`localhost#x`）や percent-encoding（`l%6fcalhost`）からも hostname を取り出すので、
  `host` に `/`・`?`・`#`・`@`・`%` が含まれる値は解析の前に拒否する。hostname は URL が小文字にする。末尾の `.` は 1 つだけ外す
  （`localhost.`、`app.localhost.`）。IPv6 は `[...]` を外してから `node:net` の `isIP` で判定する
- `Host` が無いか空の request は拒否する。`Host` の無い HTTP/1.1 は Node が先に 400 を返すので、handler の 403 に届くのは
  `Host` の無い HTTP/1.0 と、空の `Host:` である

### 検査を `/api/*` に限る

守る資産は配信ディレクトリの中身で、それを返すのは `/api/*` だけである。app の静的ファイルは npm で公開している build
そのもので、`/render` は #3426 の後は loopback・private・このマシン自身のアドレスに届かない。

### 却下: 全 path に検査をかける

app の静的ファイルや `/render` を rebinding で読まれても、公開済みのものか、攻撃者が自分で渡した入力の SVG しか
返らない。`/render` まで止めると、名前でホストした `/render`（ADR-123）が `--allowed-host` を渡さないかぎり 403 になる。
`/render` 経由で `/api/*` に届く経路は `Host` 検査では止まらない（上の「検査の範囲」）ので、全 path にかけても
その経路の対策にはならない。得るものが無く、`/render` の使い方を狭めるだけなので採らない。

### 却下: `--host` に渡した名前を許可する名前として兼ねる

`--host` は listen 先で、名前を渡すとその名前が解決されるアドレスだけで listen する（`localhost` からは届かなくなる）。
Codespaces の port forwarding（`*.app.github.dev`）や ngrok のように、ローカルのアドレスに解決されない名前は listen できず
（`EADDRNOTAVAIL`）、`/api/*` に届く手段が無くなる。listen 先と許可する名前は別の問いなので、オプションも分ける。

## 決めること 4: `/render` を公開ホストする場合（ADR-123）

`--host` で loopback 以外に listen すると、`/render` と一緒に `/api/*` も、その作業ディレクトリについて開く。
`Host` 検査は rebinding を止めるもので、IP literal や `--allowed-host` の名前で直接来た request は通す。

**render 専用のモードは今は足さない。** 公開ホストはまだ存在せず（ADR-123 は範囲外としている）、
足すとしても公開する側の要件（レート制限、キャッシュ、デプロイ先）と一緒に決めることになる。
それまでは、loopback 以外で listen したときの警告で「配信ディレクトリが読める」ことを伝える。
公開ホストを作るときは、空のディレクトリを配信するか、`/api/*` を持たない render 専用のモードを足すかをその時点で決める。

## 現時点の方針

既定の bind を `127.0.0.1` にし（案A）、`--host <addr>` で変えられるようにする。既定のときに表示する URL は
今と同じ `http://localhost:<port>` で、それ以外は実際に listen したアドレスから作る。`/api/*` は `Host` が IP literal、`localhost` / `*.localhost`、`--allowed-host` の名前のどれかのときだけ答え、
それ以外は 403。`/render` の公開ホスト用のモードは足さず、loopback 以外で listen したときに警告する。
`/render` 経由で `/api/*` に届く経路は #3426 で先に塞ぐ（このマシン自身のアドレスへの fetch の拒否を含む）。

### 実装の指針

1. `serve.ts`
   - `serve(dir, port, appDistDir?)` に listen 先と許可する名前を渡せるようにする（options object に寄せる。既存の呼び出しは
     テストと `index.ts` だけ）。host の既定 `127.0.0.1` は `serve()` が持つ
   - `isAllowedHost(hostHeader, allowedHosts)` を export して単体テストできる形にする（上の「`Host` の読み方」）
   - router と同じ `url.pathname` が `/api/` で始まる request について、分岐の前で `req.headers.host` を検査し、外れたら
     `403` と `text/plain` の短いメッセージ
   - listen の失敗は `serve()` の呼び出し側に返す（`process.exit` は `index.ts`）
   - loopback 以外のときの警告、表示 URL、既定の bind のときの `[::1]:<port>` の shadowing 検査
2. `index.ts`: `--host <addr>`（既定 `127.0.0.1`）と、繰り返し指定できる `--allowed-host <name>`（既存の `collect` を使い、
   小文字化・末尾 `.` の除去・port などを含む値のエラー）。listen の失敗でメッセージと exit 1。`agent-surface.json` を更新し、
   help text のテストを通す
3. テスト（`serve.test.ts` / `serve.e2e.test.ts`、exit を見るものは CLI を subprocess で起動する）
   - `serve()` を host なしで呼ぶと `127.0.0.1` で listen する（`server.address()`）
   - `Host: evil.example:<port>` の `/api/files`、`/api/file/index`、`/api/project`、`/api/default`、`/api/watch` が 403。
     `/` と `/render` は 403 にならない
   - request target で偽装する形が 403: absolute-form の `GET http://localhost:<port>/api/files` に `Host: evil.example`、
     `GET //x/api/files` に `Host: evil.example`
   - `isAllowedHost` の表: `localhost:<port>`、`LOCALHOST:<port>`、`localhost.:<port>`、`127.0.0.1:<port>`、`[::1]:<port>`、`[::1]`、
     `app.localhost:<port>`、`192.168.1.5:<port>` は通る。`evil.example`、`localhost.evil.example`、`evil-localhost`、空文字、
     `localhost/evil`、`localhost#x`、`l%6fcalhost`、解析できない値は拒否する。`--allowed-host` の完全一致、`.example.com` 形式、
     `badexample.com` が `.example.com` に一致しないこと
   - `Host` なしの HTTP/1.0 request と、空の `Host:` の HTTP/1.1 request が 403
   - 表示 URL: 既定で `http://localhost:<port>`。`--host ::1` で `http://[::1]:<port>`（`::1` で listen できない環境では skip）。
     `--host 0.0.0.0` で警告と `Listening` 行。`--host ::ffff:127.0.0.1` で警告が出ない
   - 既定の bind で `[::1]:<port>` に別の server がいると警告が出る（`::1` で listen できない環境では skip）
   - CLI: 使用中の port への listen がメッセージと exit 1 になる。port を含む `--allowed-host` がエラーになる
   - 既存の e2e（`localhost` で到達し、表示 URL に `http://localhost:` を期待する）がそのまま通ること
4. docs: `docs/tools/cli.md` / `cli.ja.md` の options 表に `--host` と `--allowed-host`、全インターフェースで
   listen する例（`docker run -p` / LAN）と警告の説明、Codespaces などの forwarded name で `--allowed-host` が要ること。
   `docs/tools/app.md` / `app.ja.md` と AT-0032 は `http://localhost:3000` を示すだけで、既定の表示 URL を変えないので変更しない
5. TPL-168 の「想定される失敗モード」に DNS rebinding（CORS では止まらない、`Host` で止める。`Host` は `req.headers.host` から読む）を足し、
   `discovered_from` に #3418 を足す
6. changeset: `karasu` minor（既定の bind が変わる。LAN から開いていた人は `--host 0.0.0.0`、forwarded name で開いていた人は
   `--allowed-host` が要る）
7. AT: `docs/acceptance/` に serve の bind と `Host` 検査の AT を足す。TC は自動化できるもの（上の 3）を e2e に紐付け、
   別マシンから開けないことの確認は preview では確かめられないので AT にしない
8. ADR 昇格: 実装完了後に `docs/adr/3418-serve-loopback-and-host-check.md` として昇格し、本 Design Doc を同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: LAN の別マシンや container の外から `karasu serve` を開いていた人は `--host 0.0.0.0` を、
  Codespaces の forwarded URL や reverse proxy 越しに開いていた人は `--allowed-host <name>` を足す必要がある。
  changeset の本文と CLI docs に書く
- `localhost` / `127.0.0.1` で開いている人（大多数）には変化が無い。表示 URL も origin も変わらないので、app の `localStorage`
  （theme、API key など）もそのまま使える
- `[::1]:<port>` で別の server が動いている人には、起動時に shadowing の警告が出る
- VS Code 拡張は `serve` を使わない（webview に直接描画する）ので影響なし
- karasu-author skill は `karasu serve .` を案内するだけで、bind や URL に触れないので変更なし
- Playwright の serve project と `serve.e2e.test.ts` は `localhost` で到達し、Node 22 の client が `127.0.0.1` に落ちるので変更なし

## 未解決の問い / 決めないこと

- `/render` の公開ホスト用モード（決めること 4）。公開ホストを作るときに決める
- `--allowed-host` で全部を許す値（Vite の `allowedHosts: true` 相当）。要望が来たら別 Issue
- 環境変数（`KARASU_HOST` など）での指定。今は CLI オプションだけにする
