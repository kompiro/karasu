# `karasu serve` を loopback で listen し、ローカルでない `Host` を拒否する

- **日付**: 2026-10-31
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3418](https://github.com/kompiro/karasu/issues/3418)（[#3283](https://github.com/kompiro/karasu/issues/3283) の提案から分離）
  - 関連 ADR: [ADR-123](../adr/123-github-markdown-render-service.md)（`/render` を公開ホストしうるものとして置いた）、[ADR-3017](../adr/3017-serve-app-shipping.md)、[ADR-3258](../adr/3258-serve-import-resolution.md)
  - 関連 TPL: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - コード: `packages/cli/src/serve.ts`、`packages/cli/src/index.ts`、`packages/cli/src/agent-surface.json`

## 背景・課題

`karasu serve` は `server.listen(port)` を host なしで呼ぶので、すべてのインターフェースで listen する。
port に届く人は誰でも `/api/file/:name`、`/api/files`、`/api/project`、`/api/watch`、`/api/default` を呼べ、
配信ディレクトリの `.krs` / `.krs.style` を読める。

#3283 で symlink 越しの脱出を塞ぎ、`/api/*` から `Access-Control-Allow-Origin: *` を外した。これで他のページが
cross-origin で API を読むことは止まった。残っている経路は 2 つある。

- **ネットワーク**: 同じネットワークの別マシンが API を直接呼べる。
- **DNS rebinding**: 攻撃者のドメインを `127.0.0.1` に向け直すと、ブラウザから見て同一 origin になり、CORS では守れない。
  このときブラウザが送る `Host` は攻撃者のドメインなので、`Host` を見れば止められる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| bind | `server.listen(port)`。Node は `::`（IPv6 が無ければ `0.0.0.0`）で listen し、全インターフェースに開く |
| 起動時の表示 | `Preview   : http://localhost:<port>` 固定 |
| CLI | `serve [dir]` と `-p, --port`（既定 `3000`）だけ |
| `/render` | `src` か `code` を受けて SVG を返す。`src` は `isSafeUrl()` で SSRF を防ぐ。配信ディレクトリは読まない |
| `/api/*` | 配信ディレクトリの中身を返す。守るべき資産はここにある |
| app の静的ファイル | 公開 npm パッケージの build と同じもの。秘密は含まない |
| 呼び出し側 | `serve.e2e.test.ts` は `http.request({ host: "localhost" })`、Playwright の serve project は `http://localhost:<port>` で到達する |
| Node | `engines.node >= 22.12`。Node 20 以降の HTTP client は `autoSelectFamily` が既定で、`localhost` の IPv6 / IPv4 を両方試す |

## 制約・前提

- 既定でローカル開発者が困らないこと。表示される `http://localhost:<port>` と、手で打つ `http://127.0.0.1:<port>` の両方が開けること
- `docker run -p` や LAN 共有のように、全インターフェースで listen したい使い方は明示のオプションで残す
- CLI は `0.10.0`（1.0 前）。既定の bind を変えるのは `minor` の挙動変更として扱う
- 公開ホストの運用（レート制限、render 専用デプロイ）は ADR-123 と同じく範囲外

## 決めること 1: 既定の bind 先

### 案A: `127.0.0.1`

IPv4 loopback だけで listen する。

**メリット**

- `http://127.0.0.1:<port>` も `http://localhost:<port>` も開ける。ブラウザ、curl、Node 22 の HTTP client は `localhost` を
  `::1` で試して駄目なら `127.0.0.1` に落ちる
- 1 つの `listen` で済み、表示する URL も変えなくてよい

**デメリット**

- IPv6 だけの環境では開けない（`--host ::1` で逃げられる）
- `localhost` が `::1` を先に返す環境では、接続が 1 回 `::1` で失敗してから成立する（体感できる遅延ではない）

### 案B: `localhost`

`listen(port, "localhost")`。Node は名前解決の最初の 1 アドレスだけで listen する。

**メリット**

- Vite と同じ既定で、説明しやすい

**デメリット**

- 環境によって `::1` だけで listen し、そのとき `http://127.0.0.1:<port>` が開けない。どちらになるかが OS の設定で変わる

### 案C: `127.0.0.1` と `::1` の両方

HTTP server を 2 つ立て、同じ handler を渡す。

**メリット**

- どちらの loopback でも 1 回目で繋がる

**デメリット**

- `::1` が無い環境（IPv6 を切った container など）で `EADDRNOTAVAIL` を握りつぶす分岐が要る
- `serve()` が `Server` を 1 つ返す今の API（テストが `listening` と `address()` を使う）を変える必要がある
- 得るものは案A のフォールバック 1 回分だけ

**案A を採る。** どちらの URL でも開け、listen が 1 つのままで済む。案B は環境によって片方の URL が開けなくなり、
案C は得るものに比べて API と分岐が増える。

## 決めること 2: `--host <addr>`

`--host <addr>` を足し、`listen(port, host)` にそのまま渡す。既定は `127.0.0.1`。

- `--host 0.0.0.0`（または `::`）で今の挙動に戻せる。`docker run -p` では container の中で全インターフェースに
  listen する必要があるので、これを使う
- loopback 以外（`127.0.0.0/8`、`::1`、`localhost` 以外）で listen したときは、起動時に stderr へ警告を出す:
  配信ディレクトリの `.krs` / `.krs.style` が、このアドレスに届く誰からでも読めること
- 表示する URL: loopback のときは今と同じ `http://localhost:<port>`。それ以外は `--host` の値で URL を作り
  （`0.0.0.0` / `::` のときは `localhost` を表示する）、`Listening : <host>:<port>` の行を足す
- listen の失敗（`EADDRINUSE`、存在しないアドレスの `EADDRNOTAVAIL` など）は、今は未処理の `error` で落ちる。
  `--host` で起きやすくなるので、`error` を受けてメッセージを出し exit 1 にする
- `agent-surface.json`、help text、`docs/tools/cli.md` / `cli.ja.md` に足す

## 決めること 3: `Host` ヘッダの検査

`/api/*` への request は、`Host` が次のどれかでなければ 403 で拒否する。

1. **IP literal**（`127.0.0.1:3000`、`[::1]:3000`、`192.168.1.5:3000` など）
2. `localhost` と `*.localhost`
3. `--host` に名前を渡したときのその名前

port は見ない（どの port で listen していても、比べるのは hostname だけ）。`Host` が無い request も拒否する。

IP literal を通してよいのは、DNS rebinding が名前を必要とするからである。攻撃者のページの origin は攻撃者のドメインで、
ブラウザが送る `Host` もそのドメインになる。ページが `Host` を書き換えることはできない（forbidden header）。
`Host` が IP literal の request は、そのアドレスを直接開いた人か、ネットワークから直接呼んだ人のもので、
後者は bind で止める範囲である。これで `--host 0.0.0.0` で LAN の別マシンから `http://192.168.1.5:3000` を
開く使い方も、追加の設定なしに動く。`*.localhost` はブラウザが名前解決せずに loopback に向ける（RFC 6761）ので、
攻撃者が向け直せない。

検査を `/api/*` に限るのは、守る資産が配信ディレクトリの中身だからである。app の静的ファイルは npm で公開している build
そのもので、`/render` は配信ディレクトリを読まない。

### 却下: 全 path に検査をかける

app の静的ファイルや `/render` を rebinding で読まれても、公開済みのものか、攻撃者が自分で渡した入力の SVG しか
返らない。`/render` まで止めると、名前でホストした `/render`（ADR-123）が `--host` に名前を渡さないかぎり 403 になる。
得るものが無く、`/render` の使い方を狭めるだけなので採らない。

### 却下: 許可する名前を追加するオプション（`--allowed-host`）

mDNS 名（`mymac.local`）や reverse proxy 越しの名前で `/api/*` を開きたい場合に要る。今はそうした利用の報告が無く、
`--host` に名前を渡す方法と IP literal で LAN 共有は足りる。要望が来たら足す。

## 決めること 4: `/render` を公開ホストする場合（ADR-123）

`--host` で loopback 以外に listen すると、`/render` と一緒に `/api/*` も、その作業ディレクトリについて開く。
`Host` 検査は rebinding を止めるもので、IP literal や `--host` の名前で直接来た request は通す。

**render 専用のモードは今は足さない。** 公開ホストはまだ存在せず（ADR-123 は範囲外としている）、
足すとしても公開する側の要件（レート制限、キャッシュ、デプロイ先）と一緒に決めることになる。
それまでは、loopback 以外で listen したときの警告で「配信ディレクトリが読める」ことを伝える。
公開ホストを作るときは、空のディレクトリを配信するか、`/api/*` を持たない render 専用のモードを足すかをその時点で決める。

## 現時点の方針

既定の bind を `127.0.0.1` にし（案A）、`--host <addr>` で変えられるようにする。`/api/*` は `Host` が IP literal、
`localhost` / `*.localhost`、`--host` の名前のどれかのときだけ答え、それ以外は 403。`/render` の公開ホスト用のモードは
足さず、loopback 以外で listen したときに警告する。

### 実装の指針

1. `serve.ts`
   - `serve(dir, port, appDistDir?)` に listen 先を渡せるようにする（options object に寄せるか、引数を 1 つ足す。
     既存の呼び出しはテストと `index.ts` だけ）
   - `isAllowedHost(hostHeader, listenHost)` を export して単体テストできる形にする。IP literal 判定は `node:net` の `isIP`
     （`[...]` を外してから）
   - `/api/*` の分岐の前で検査し、外れたら `403` と `text/plain` の短いメッセージ
   - `server.on("error")` で listen の失敗を表示して exit 1
   - loopback 以外のときの警告と、表示する URL
2. `index.ts`: `--host <addr>`（既定 `127.0.0.1`）。`agent-surface.json` を更新し、help text のテストを通す
3. テスト（`serve.test.ts` / `serve.e2e.test.ts`）
   - 既定で `127.0.0.1` に listen する（`server.address()`）
   - `Host: evil.example:3000` の `/api/files` が 403、`/` と `/render` は 403 にならない
   - `Host: localhost:<port>`、`127.0.0.1:<port>`、`[::1]:<port>`、`app.localhost:<port>` は通る
   - `Host` なし（HTTP/1.0）が 403
   - `--host` に名前を渡すとその名前が通る
   - 既存の e2e（`localhost` で到達）がそのまま通ること
4. docs: `docs/tools/cli.md` / `cli.ja.md` の options 表に `--host`、全インターフェースで listen する例（`docker run -p` / LAN）と警告の説明
5. TPL-168 の「想定される失敗モード」に DNS rebinding（CORS では止まらない、`Host` で止める）を足し、`discovered_from` に #3418 を足す
6. changeset: `karasu` minor（既定の bind が変わる。LAN から開いていた人は `--host 0.0.0.0` が要る）
7. AT: `docs/acceptance/` に serve の bind と `Host` 検査の AT を足す。TC は自動化できるもの（上の 3）を e2e に紐付け、
   別マシンから開けないことの確認は preview では確かめられないので AT にしない
8. ADR 昇格: 実装完了後に `docs/adr/3418-serve-loopback-and-host-check.md` として昇格し、本 Design Doc を同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: LAN の別マシンや container の外から `karasu serve` を開いていた人は、`--host 0.0.0.0` を足す必要がある。
  changeset の本文と CLI docs に書く
- `localhost` / `127.0.0.1` で開いている人（大多数）には変化なし
- VS Code 拡張は `serve` を使わない（webview に直接描画する）ので影響なし
- karasu-author skill は `karasu serve .` を案内するだけで、bind に触れないので変更なし
- Playwright の serve project と `serve.e2e.test.ts` は `localhost` で到達し、Node 22 の client が `127.0.0.1` に落ちるので変更なし

## 未解決の問い / 決めないこと

- `--allowed-host` 相当（上の却下）。要望が来たら別 Issue
- `/render` の公開ホスト用モード（決めること 4）。公開ホストを作るときに決める
- 環境変数（`KARASU_HOST` など）での指定。今は CLI オプションだけにする
