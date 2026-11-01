# `/render?src=` の SSRF 対策を、解決後のアドレスとリダイレクトの各ホップで行う

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3426](https://github.com/kompiro/karasu/issues/3426)
  - 後続: [#3418](https://github.com/kompiro/karasu/issues/3418)（`serve` の loopback bind と `Host` 検査。本件が先に入る）
  - 関連 ADR: [ADR-123](../adr/123-github-markdown-render-service.md)（`/render` と SSRF 対策の決定）
  - 関連 Design Doc: [serve-loopback-and-host-check.md](serve-loopback-and-host-check.md)
  - 関連 TPL: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - コード: `packages/cli/src/render-endpoint.ts`、`packages/cli/src/serve.ts`

## 背景・課題

`karasu serve` の `/render?src=<url>` は、サーバー側で `src` を fetch して SVG を返す。ADR-123 §3 は、loopback と
private への接続を禁止し、**リダイレクト先も同じ制約で検証する（最大 5 回）** と決めた。実装は後半を持たず、前半も文字列の
検査に留まっている。

- `handleRender` は `fetch(params.src, { redirect: "follow" })` を呼ぶ。`isSafeUrl()` を通るのは最初の URL だけで、
  リダイレクト先は検査されない
- `isSafeUrl()` は書かれた hostname を見るだけで、名前が解決されるアドレスを見ない。`127.0.0.1.nip.io` のように loopback に
  解決される名前、`localhost.`（末尾のドット）、IPv6 の private / link-local（`fc00::/7`、`fe80::/10`）、IPv4-mapped の
  `[::ffff:127.0.0.1]`（`new URL` で `[::ffff:7f00:1]` になる）を通す

`/render` は `Access-Control-Allow-Origin: *` を返すので、任意の web ページが `karasu serve` に自分自身の
`/api/file/<name>`（や同じマシンの別サービス）を fetch させ、描画結果を cross-origin で読める。karasu が自分に送る request は
loopback の `Host` を持つので、#3418 の bind と `Host` 検査ではこの経路を止められない。

#3418 の Design Doc のレビューで、もう 1 つ経路が見つかった（#3426 のコメント）。`--host 0.0.0.0` で listen したとき、
`src` にこのマシンの public / CGNAT（`100.64.0.0/10`）のアドレスを渡すと、karasu は自分の `/api/*` を読む。その request の
`Host` は IP literal なので、#3418 の `Host` 検査を通る。

## 現状（インベントリ）

| 観点       | 現状                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入口の検査 | `parseRenderParams` が `isSafeUrl(src)` を呼び、落ちたら 400。scheme は `http:` / `https:` のみ。`localhost`、`::1`、IPv4 の `127/8`、`10/8`、`172.16/12`、`192.168/16`、`169.254/16`、`0/8` を文字列で拒否する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| fetch      | global `fetch`（Node 内蔵の undici）。`redirect: "follow"`、`AbortSignal.timeout(10_000)`、`User-Agent: karasu-render/1.0`。本文の大きさに上限は無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 失敗時     | fetch の例外と non-2xx は 502                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 応答       | 200 で `image/svg+xml`、`Access-Control-Allow-Origin: *`、`Cache-Control: public, max-age=60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 依存       | CLI の `dependencies` は `chokidar`、`commander`、`karasu-skills`、`yaml`。`undici` は jsdom 経由の dev の間接依存で、CLI は持たない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Node       | `engines.node >= 22.12`。`http.request` の `lookup` option は `autoSelectFamily` の既定で `{ all: true }` 付きで呼ばれ、宛先が IP literal のときは呼ばれない。`net.BlockList` は IPv4 の subnet を IPv4-mapped の IPv6 にも当てる（Node 24.18 で確認。CI は Node 24 だけで走り、22.x では確かめていない）。`BlockList.check(addr)` の family の既定は `"ipv4"` で、IPv6 を渡すと例外を出さずに `false` を返す。`http.globalAgent` は `keepAlive: true` で、再利用した socket には `lookup` が呼ばれない。`NODE_USE_ENV_PROXY=1`（または `--use-env-proxy`）のとき、`globalAgent` 経由の `http.request` は `HTTP_PROXY` の proxy に送られ、`lookup` は呼ばれない。`agent: false` ならどちらも起きない（3 つとも Node 24.18 で確認） |
| テスト     | `render-endpoint.test.ts` が `isSafeUrl` の表と、`fetch` を `vi.stubGlobal` で差し替えた `handleRender` を持つ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 制約・前提

- ADR-123 の契約（`src` は任意の公開 URL、400 / 502 / 422 の使い分け、`code` と `view`）は保ったまま拡張する。足すのは
  userinfo を持つ URL の拒否と、同時実行の上限を超えたときの 503 の 2 つで、changeset と昇格する ADR に書く
- CLI に production 依存を足さない。足すなら Dependency & license impact と bundling の判断が要る
- `https:` の証明書検証と SNI は、URL の hostname のまま行われること
- 公開ホストの運用（レート制限、キャッシュ）と、`src` の Content-Type 検証（ADR-123 の残課題）は範囲外
- `serve` の bind と `Host` 検査は #3418 で扱う。本件は `/render` の外向きの接続だけを扱う

## 決めること 1: 解決後のアドレスをどこで確かめるか

DNS rebinding を避けるには、確かめたアドレスにそのまま接続する必要がある。先に `dns.lookup` で確かめてから URL を
fetch すると、接続のときにもう一度引かれ、その間に答えを変えられる。

### 案A: `node:http` / `node:https` の `request` に `lookup` を渡す（採用）

`http.request(url, { lookup })` の `lookup` は、接続に使うアドレスを返す関数である。ここで `dns.lookup(hostname, { all: true })`
を呼び、返った全アドレスを確かめ、1 つでも禁止範囲なら error を返す。通ったアドレスがそのまま接続に使われるので、確認と接続の
間に隙間が無い。hostname は URL のままなので、`https:` の SNI と証明書検証も変わらない。

宛先が IP literal のとき `lookup` は呼ばれないので、hop ごとに URL の hostname が IP literal なら同じ禁止範囲で直接確かめる。
`url.hostname` は IPv6 を `[::ffff:7f00:1]` のように括弧付きで持ち、`net.isIP("[::1]")` は 0 を返すので、判定の前に括弧を外す。
外し忘れると family が `"ipv4"` に落ち、`BlockList.check` は読めない値に `false` を返すので、検査が素通りする（fail open）。
そこで判定は、IP として読めない値を禁止として扱う（fail closed）。hop を IP literal と名前のどちらとして扱うかの分岐も、
括弧の扱いで割れないようにする。`[` で始まる hostname は無条件に IP literal の側に回す。名前の側に回すと、`http.request` が
自分で括弧を外して `lookup` を呼ばずに接続するので、検査が丸ごと飛ぶ。

`request` には **`agent: false`** を渡し、hop ごとに新しい socket を張る。共有の `http.globalAgent` を使うと、keep-alive で
再利用した socket には `lookup` が呼ばれず、`NODE_USE_ENV_PROXY=1` の環境では request が proxy に送られて `lookup` が一度も
呼ばれない（proxy が内向きの名前を解決して取りに行く）。`agent: false` はどちらも起こさないので、「すべての hop で、接続する
アドレスを確かめる」が文字どおり成り立つ。

**メリット**

- 依存を足さない。Node の標準 API だけで、確認と接続が同じアドレスになる
- `lookup` の呼ばれ方（`all: true`）を含め、挙動を手元で確かめられる

**デメリット**

- `fetch` が持っていたもの（リダイレクト、圧縮の展開、`AbortSignal`、本文の読み出し）を自分で書く。リダイレクトは
  どのみち手で追う必要があり（決めること 2）、圧縮は今の `fetch` が展開しているので互換のために残す。`Accept-Encoding` は
  `gzip, deflate, br` を送り、応答の `Content-Encoding` が `gzip` / `deflate` / `br` なら `node:zlib` で展開する。上限
  （決めること 5）は **展開した後** の大きさにかけ、超えた時点で展開を止める（zip bomb で上限をすり抜けさせない）。それ以外の
  `Content-Encoding` は 502
- proxy の環境変数を見ない。proxy を通らないと外に出られない環境では `src` が使えなくなる（`?code=` は使える）。proxy 越しに
  させると解決後のアドレスを確かめられないので、これは意図した縮退とする

### 案B: `undici` を依存に足し、`Agent({ connect: { lookup } })` を `fetch` の `dispatcher` に渡す（却下）

#3426 の本文が例に挙げた形。`fetch` のまま使える。ただし CLI に production 依存を 1 つ足し、Node 内蔵の undici と npm の
undici の版の組み合わせを気にし続けることになる。案A で同じことが標準 API でできるので採らない。

### 案C: 先に `dns.lookup` で確かめ、IP に書き換えた URL を fetch する（却下）

確認したアドレスに接続できるが、`https:` では SNI と証明書検証が IP に対して行われて失敗する。`Host` も自分で付け直す
ことになる。採らない。

### 案D: `redirect: "follow"` のまま、`response.url` を後から確かめる（却下）

request はもう送られている。読み出しを捨てても、内向きのサービスに副作用のある request を送らせる経路は残る。採らない。

## 決めること 2: リダイレクトを手で追う

`redirect` を自分で扱う。3xx（301、302、303、307、308）で `Location` があれば、現在の URL を base に解決し、次の hop として
入口と同じ検査（scheme、userinfo、IP literal、`lookup`）を通してから接続する。リダイレクトは最大 5 回（ADR-123 §3。request は
最初の 1 回と合わせて最大 6 回）で、6 回目のリダイレクトを受けたら 502。
`Location` が無い 3xx、`http:` / `https:` 以外への 3xx も 502。

URL に userinfo（`http://user:pass@host/`）があると `http.request` は `Authorization: Basic` を送るので、どの hop でも
`username` か `password` を持つ URL は拒否する。これで method は常に `GET`、送るヘッダは `Host`、`Connection: close`
（`agent: false` が付ける）、`User-Agent`、`Accept-Encoding` と後述の印だけになり、hop をまたいで落とすべき認証情報は無い。

**状態コード:** 呼び出し側が渡した `src` そのものが通らないとき（scheme、userinfo、IP literal、最初の hop の解決後のアドレス）は
400 にする。リダイレクトの後で起きた失敗（リダイレクト先が禁止範囲、hop の上限、`Location` の無い 3xx、本文の上限）は upstream の
振る舞いなので 502 にする。ADR-123 の「パラメータの誤りは 400、fetch の失敗は 502」をこの線で読む。同時実行の上限（決めること 5）を超えたときは 503 にする。

## 決めること 3: 禁止するアドレス

`net.BlockList` に次の範囲を入れる。判定の前に括弧を外し、`net.isIP` が 0 なら禁止とする。IPv4-mapped の IPv6
（`::ffff:0:0/96`。`::ffff:7f00:1` のような 16 進の形も）は IPv4 に直してから、`check(addr, net.isIP(addr) === 6 ? "ipv6" : "ipv4")` で family を明示して確かめる。IPv4-mapped を
`BlockList` 自身に任せないのは、その挙動を確かめたのが Node 24 だけで、`engines` が許す 22.x を CI が走らせないからである。

| 範囲                                            | 理由                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `0.0.0.0/8`、`::/128`                           | unspecified。`0.0.0.0` への接続は多くの OS で loopback に届く |
| `127.0.0.0/8`、`::1/128`                        | loopback                                                      |
| `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` | private（RFC 1918）                                           |
| `100.64.0.0/10`                                 | CGNAT（RFC 6598）。Tailscale などの VPN もここを使う          |
| `169.254.0.0/16`、`fe80::/10`                   | link-local。cloud の metadata（`169.254.169.254`）を含む      |
| `fc00::/7`                                      | IPv6 の unique local（AWS の `fd00:ec2::254` を含む）         |
| `192.0.0.0/24`、`198.18.0.0/15`                 | IETF の予約と benchmark 用                                    |
| `224.0.0.0/4`、`240.0.0.0/4`、`ff00::/8`        | multicast、reserved、broadcast                                |

加えて、**このマシンが今持つアドレス**（`os.networkInterfaces()` の全アドレス）を禁止する。interface は起動後に変わりうるので、
hop ごとに読む。文字列で比べると `::ffff:192.168.1.5` や省略しない IPv6 の書き方が一致しないので、同じ正規化をしてから
hop ごとに作る `BlockList` に `addAddress` で入れて判定する。これで `--host 0.0.0.0` のときの public アドレス経由の自己 fetch を止める。

入口の `isSafeUrl()` は、同期で落とせるものを先に 400 にするために残す。IP literal は同じ禁止範囲で判定し、名前は
`localhost` と `*.localhost`（末尾の `.` をすべて外して。`localhost..` も）を拒否する。それ以外の名前は解決しないと分からないので、hop の検査に任せる。

## 決めること 4: 自分への fetch を印で止める

アドレスで止められない経路が残る。自宅のルーターなどの hairpin NAT では、karasu はルーターの public アドレス（このマシンの
interface には無い）へ接続し、ルーターがそれを karasu 自身へ転送する。別のマシンの reverse proxy が karasu へ転送する場合も
同じである。

そこで `/render` の外向きの request に印のヘッダ（`X-Karasu-Render: 1`）を付け、`serve` はこのヘッダを持つ request を
**path によらず** 403 にする。印を付けるのは karasu で、`src` やリダイレクト先を書いた攻撃者は外せない。アドレスの禁止と
独立に効くので、hairpin NAT や転送のように経路が見えないときも、karasu が自分の `/api/*` を読む経路が閉じる。

全 path にかけるのは、`/api/*` だけに絞ると 2 つの穴が残るからである。1 つは判定の仕方で、`req.url` の文字列の prefix で
`/api/` を見ると、`//x/api/file/index` のように router が `/api/file/index` として答える request を見落とす。もう 1 つは
`/render` 自身で、`src` に karasu 自身の `/render?src=...` を書くと、1 段ごとに最大 10 秒 request を抱えたまま入れ子にできる。
このヘッダを正当に送るものは無いので、全 path で拒否すれば判定の仕方を気にする必要もなくなる。

外の server にこのヘッダが見えるのは、`User-Agent: karasu-render/1.0` で karasu だと既に分かるのと同じ程度の情報なので
問題にしない。

残る経路として受け入れるもの: hairpin NAT はルーター自身の WAN 側の管理画面や、port forward した LAN の別サービスにも届く。
ルーターが送信元を LAN のアドレスに書き換えることも多く、アドレスの禁止も効かない。攻撃者のページが中身を読めるのは、
`/render` が `Access-Control-Allow-Origin: *` 付きの 200 を返すとき、つまり届いた本文がエラー無く `.krs` として compile
できたときだけである。422 / 502 にはこのヘッダが付かない。HTML・JSON・`KEY=value` のような本文は compile のエラーになって 422 を
返し、SVG にも中身は出ない（Node 24.18 で、HTML の管理画面・JSON・テキストに埋めた文字列が `buildAllViewsSvg` / `compile` の
SVG に出ないことを確認）。

したがって、読めるのは「hairpin NAT の port forward の先で、`.krs` を返すサービス」に限られる。karasu の `serve` は、この版から
印を持つ request を拒否するので、自分自身も同じ LAN の別の `serve` も読めない。残るのは、`.krs` を配る別のサービス
（git の web UI、ファイル共有など）を router が port forward していて、そのサービスが印を見ない場合で、これを本件で受け入れる
残りの危険とする。それ以外（管理画面などへ request を送らせるだけの blind SSRF）も、アドレスで止められないので受け入れる。

### 却下: 印を付けず、アドレスの禁止だけで済ませる

hairpin NAT と転送の経路は、karasu から見えるのが public アドレスなので止まらない。#3418 の後は既定の bind が loopback になり
この経路は `--host 0.0.0.0` のときだけになるが、今の `serve` は全インターフェースで listen しているので、今も開いている。

## 決めること 5: 本文・時間・同時実行の上限

- **本文:** 256 KiB で打ち切って 502 にする。`.krs` は数十 KB までで、上限が無いと 1 つの `src` でメモリを使い切らせられる
  （TPL-168 の「巨大入力」）。続く `compile` は同期で event loop を止めるので、`?code=`（header の上限で 16 KiB 程度）と
  桁が離れすぎない値にする
- **時間:** 今と同じ 10 秒を、全 hop で 1 つの `AbortSignal` で持つ。ただし `dns.lookup` は libuv の threadpool（既定 4 本）で
  `getaddrinfo` を走らせ、中断できない。signal が切れても応答を返すだけで、遅い DNS の問い合わせは thread を握ったまま残る
- **同時実行:** そのため、同時に処理する `src` の fetch を 2 件までにし、超えた request は 503 にする。上限を threadpool の
  本数（4）と同じにすると、遅い問い合わせ 4 件で thread が埋まる（Node 24.18 で threadpool の 4 本を `pbkdf2` で塞ぐと `fs.stat` が約 230 ms 待ち、3 本までなら待たなかった）。
  2 件なら、攻撃者のページが応答の遅い名前を大量に `src` に渡しても、threadpool を使う `serve` の `fs`（`realpath`、`readFile`、
  chokidar）に thread が 2 本残る。枠は応答を返したときではなく、**応答を返し、かつ進行中の `dns.lookup` の callback が返った
  とき** に空ける。応答だけで空けると、10 秒で切った後も問い合わせが thread を握ったまま次の枠が埋まり、上限が thread の数を
  縛らない。`?code=` は fetch しないので数えない

## 現時点の方針

案A を採る。`/render` の `src` は、`node:http` / `node:https` の `request` に禁止範囲を確かめる `lookup` を渡して取りに行く。
リダイレクトは手で最大 5 回まで追い、hop ごとに同じ検査をする。IP として読めない値は禁止として扱う。本文は 256 KiB、
同時実行は 2 件までにし、枠は DNS の問い合わせが返るまで空けない。禁止範囲は loopback・private・link-local・CGNAT・予約範囲と、
このマシン自身のアドレスである。共有の agent は使わず（`agent: false`）、proxy の環境変数と keep-alive の socket を通さない。
さらに外向きの request に `X-Karasu-Render: 1` を付け、`serve` はそれを持つ request を path によらず拒否する。

### 実装の指針

1. `packages/cli/src/render-fetch.ts`（新規）:
   - `normalizeAddress(address)`: 括弧を外し、IPv4-mapped を IPv4 に直す。単体で export してテストする
   - `isBlockedAddress(address)`: `normalizeAddress` の後で `net.isIP` が 0 なら禁止。family を明示して、
     `net.BlockList` の禁止範囲と、`os.networkInterfaces()` のアドレスを同じ正規化で `addAddress` した `BlockList` で判定する
   - `guardedLookup`: `dns.lookup(hostname, { ...options, all: true })` の結果を全部確かめ、1 つでも禁止なら error、
     通れば呼び出し側の `options.all` に合わせて返す
   - `fetchSrc(url, { signal })`: hop のループ。scheme と userinfo の拒否、IP literal の判定、`agent: false` と `lookup` 付きの
     `request`、リダイレクトの追跡（最大 5）、256 KiB の上限、`User-Agent`・`Accept-Encoding: gzip, deflate, br`・`X-Karasu-Render: 1` の付与、`Content-Encoding` の展開（上限は展開後）。
     結果は `{ ok: true, text } | { ok: false, status, reason, message }`。status は決めること 2 の線で 400 か 502、`reason` は
     `"blocked-address"`、`"too-many-redirects"`、`"too-large"` などの機械で見分けられる値で、テストはこれで拒否の理由を確かめる
   - 同時実行の上限（2 件、超えたら 503）。枠を取るのは `handleRender` の `src` の分岐で、空けるのは応答を返したことと、
     `guardedLookup` が呼んだ `dns.lookup` の callback が返ったことの両方が揃ったとき。`fetchSrc` は進行中の lookup の
     完了を知らせる Promise を返し、`handleRender` はそれを待ってから枠を空ける
   - テストのために resolver（`dns.lookup` の代わり）、interface の一覧、禁止範囲の判定を差し替えられるようにする
2. `render-endpoint.ts`: `fetch` を `fetchSrc` に替える。`isSafeUrl` は userinfo を拒否し、IP literal を `isBlockedAddress` で
   判定し、`localhost` / `*.localhost`（末尾の `.` をすべて外す）を拒否する形にする
3. `serve.ts`: `x-karasu-render` を持つ request を、routing の前に path によらず 403 にする
4. テスト（`render-endpoint.test.ts` / `render-fetch.test.ts`）。実 server の置き方:
   - 「公開」に見せる server は `127.0.0.1` で動かし、テストの判定はそこだけを許す（禁止範囲から `127.0.0.1/32` だけを外し、
     interface の一覧も `127.0.0.1` を含まないものに差し替える。`lo` が `127.0.0.1` と `::1` を持つので一覧も替える必要がある）
   - 拒否を確かめる宛先には、届いた request を数える server を `127.0.0.2` に立てて向け、request が 0 件であることと
     `reason: "blocked-address"` の両方を確かめる。`127.0.0.2` に listen できない環境（macOS など）では `reason` だけを確かめる。
     到達できないアドレス（`10.0.0.1` など）だけで確かめると、接続を試みて失敗しても 502 になり、検査が壊れていても通ってしまう
   - 「このマシン自身のアドレス」の判定を確かめるときは、差し替える interface のアドレスを **どの禁止範囲にも入らない値**
     （`198.51.100.7` など。TEST-NET-2 は表に無い）にする。`127.0.0.2` や private のアドレスを使うと範囲の判定で先に落ち、
     interface の判定を消してもテストが通る。対照として、同じアドレスを interface の一覧から外すと `reason` が
     `"blocked-address"` でなくなる（接続の失敗になる）ことも確かめる

   ケース:
   - `isBlockedAddress` の表: 上の各範囲の境界の内と外、`::1` と `fd00::1`（family を明示しないと素通りする形）、
     `[::1]` と `[::ffff:7f00:1]`（括弧付き）、`not-an-ip` と `127.0.0.1.`（読めない値は禁止）、
     `::ffff:127.0.0.1`、`::ffff:7f00:1`、interface のアドレス（`198.51.100.7`）とその IPv4-mapped の形、省略しない IPv6 の書き方
   - `normalizeAddress` の表: `[::1]` → `::1`、`::ffff:7f00:1` → `127.0.0.1`、`::ffff:127.0.0.1` → `127.0.0.1`。Node 24 の
     `BlockList` は IPv4-mapped を自分で判定するので、CI（Node 24）では `isBlockedAddress` の表だけでは正規化の欠落を検出できない
   - `isSafeUrl`: `localhost.`、`localhost..`、`app.localhost`、`0x7f.1`、`2130706433`、`[::ffff:127.0.0.1]`、`[fc00::1]`、`[fe80::1]`、
     `100.64.0.1`、`http://user:pass@example.com/`
   - loopback に解決される名前（実際の判定のまま、resolver で `127.0.0.1` を返す）が接続前に 400 で拒否され、server に
     request が届かないこと。resolver が公開アドレスと private アドレスを混ぜて返したときも拒否されること
   - `src` そのものがこのマシン自身のアドレス（interface に差し替えた `198.51.100.7`）のとき 400 と `reason: "blocked-address"`
   - 公開に見せた server が、`127.0.0.2` に解決される名前と `[::ffff:127.0.0.2]` へ 302 すると 502 と
     `reason: "blocked-address"` で拒否され、数える server に request が届かないこと。`198.51.100.7`（このマシン自身）への 302 も
     同じ `reason` の 502
   - 5 回のリダイレクトは通り、6 回目で 502。`Location` の無い 3xx、`file:` への 3xx、userinfo を持つ URL への 3xx も 502
   - 256 KiB を超える本文が 502（`reason: "too-large"`）。gzip と br で圧縮した `.krs` は展開して 200、展開すると 256 KiB を超える
     小さな gzip（zip bomb）は展開を途中で止めて 502、`Content-Encoding: compress` は 502
   - 同時に 3 件目の `src` が来たら 503（resolver を止めて 2 件を抱えさせる）。止めた resolver の request が 10 秒の上限で
     502 を返した後も、resolver が返るまでは 3 件目が 503 のままであること（枠が応答だけで空かない）。時間はテストの中で短く差し替える
   - proxy: 子プロセスを `NODE_USE_ENV_PROXY=1` と、数える proxy を指す `HTTP_PROXY` 付きで起こし、`fetchSrc` を読み込む
     小さな fixture（`tsx` で TS のまま読む）から private に解決される名前を取りに行かせる。proxy に request が届かず拒否されること。
     `NODE_USE_ENV_PROXY` が無い Node（22 の初期の版）では意味が無いので、`process.allowedNodeEnvironmentFlags.has("--use-env-proxy")`
     が偽なら skip する
   - 同じ名前への 2 回目の request でも resolver が呼ばれること（keep-alive で素通りしない）
   - `serve.test.ts`: `X-Karasu-Render: 1` 付きの `/api/files`、`//x/api/files`、`/render?code=...`、app の静的ファイルが
     すべて 403。付いていなければ今どおり答える
   - 既存の `handleRender` のテストは `fetch` の stub を `fetchSrc` の差し替えに置き換える

5. TPL-168: 「想定される失敗モード」の SSRF に「リダイレクト先と解決後のアドレスを確かめない」「自分自身への fetch」を足し、
   `discovered_from` に #3426 と `packages/cli/src/render-endpoint.ts` を足す
6. changeset: `karasu` patch（security fix。`src` が内向きのアドレスに届かなくなる）
7. AT: 手で確かめる項目は無い（すべて自動テストで閉じる）ので追加しない
8. ADR 昇格: 実装完了後に `docs/adr/3426-render-src-ssrf-guard.md` として昇格し、本 Design Doc を同じ PR で削除する。
   ADR-123 の本文は変えず、新 ADR の frontmatter に `related_to: [ADR-123]` を置く

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `/render?src=` で LAN 内や同じマシンの server の `.krs` を描いていた人は描けなくなる。
  ADR-123 が最初から禁止していた使い方で、`?code=` で代わりに渡せる。changeset に書く
- `serve` は `X-Karasu-Render` を持つ request を拒否するが、app も e2e もこのヘッダを送らないので影響なし
- proxy を通らないと外に出られない環境では `src` が使えなくなる（決めること 1）。changeset に書く
- #3418 の Design Doc が前提にしていた「#3426 の後は `/render` が loopback・private・このマシン自身のアドレスに届かない」が
  これで成り立つ。印のヘッダは #3418 の範囲には入らない

## 未解決の問い / 決めないこと

- NAT64（`64:ff9b::/96`）に埋め込まれた IPv4 は判定しない。IPv6 だけのネットワークで公開サーバーに届く正当な経路でもあり、
  gateway が自分の内側へ転送する構成は本件の範囲外とする
- proxy 越しの `src`（proxy の環境変数を見て、proxy 側で解決後のアドレスを確かめてもらう）は扱わない。要望が来たら別 Issue
- `src` の host を allowlist（`raw.githubusercontent.com` など）に絞る案は、ADR-123 が任意の公開 URL を受けると決めたので
  採らない。公開ホストを作るときに改めて決める
