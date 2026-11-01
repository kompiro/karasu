---
id: ADR-3426
title: "`/render?src=` の SSRF 対策を、解決後のアドレスとリダイレクトの各ホップで行う"
status: accepted
date: 2026-11-01
topic: cli
related_to: [ADR-123]
scope:
  packages: [cli]
  concerns: [security]
assumptions:
  - "symbol: packages/cli/src/render-fetch.ts :: fetchSrc"
  - "symbol: packages/cli/src/render-fetch.ts :: guardedLookup"
  - "symbol: packages/cli/src/render-fetch.ts :: isBlockedAddress"
  - "symbol: packages/cli/src/render-fetch.ts :: normalizeAddress"
  - "symbol: packages/cli/src/render-endpoint.ts :: SrcFetchLimiter"
  - "grep: packages/cli/src/render-fetch.ts :: agent: false"
  - 'grep: packages/cli/src/render-fetch.ts :: RENDER_MARKER_HEADER = "x-karasu-render"'
  - "grep: packages/cli/src/serve.ts :: req.headers\\[RENDER_MARKER_HEADER\\]"
---

# ADR-3426: `/render?src=` の SSRF 対策を、解決後のアドレスとリダイレクトの各ホップで行う

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3426](https://github.com/kompiro/karasu/issues/3426)。Design Doc PR #3479、実装 PR #3500
  - 後続: [#3418](https://github.com/kompiro/karasu/issues/3418)（`serve` の loopback bind と `Host` 検査。本件を前提にする）
  - 関連 ADR: [ADR-123](123-github-markdown-render-service.md)（`/render` と SSRF 対策の決定。本 ADR はその §3 を実装として具体化する）
  - TPL: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - コード: `packages/cli/src/render-fetch.ts`、`packages/cli/src/render-endpoint.ts`、`packages/cli/src/serve.ts`

## 背景

`karasu serve` の `/render?src=<url>` は、サーバー側で `src` を fetch して SVG を返す。ADR-123 §3 は loopback と private への
接続を禁止し、リダイレクト先も同じ制約で検証する（最大 5 回）と決めた。実装は後半を持たず、前半も文字列の検査だった。

- `fetch(src, { redirect: "follow" })` で、リダイレクト先は検査されなかった
- `isSafeUrl()` は書かれた hostname だけを見た。loopback に解決される名前（`127.0.0.1.nip.io`）、`localhost.`、IPv6 の
  private / link-local、IPv4-mapped の `[::ffff:127.0.0.1]` を通した
- `/render` は `Access-Control-Allow-Origin: *` を返すので、任意の web ページが `serve` に自分自身の `/api/file/<name>` を
  fetch させ、描画結果を読めた。karasu が自分に送る request は loopback の `Host` を持つので、#3418 の `Host` 検査では止まらない
- `--host 0.0.0.0` のとき、このマシンの public / CGNAT のアドレスを `src` に渡すと自分の `/api/*` を読めた（#3418 の
  Design Doc のレビューで発見）

## 決定

`src` の取得を `node:http` / `node:https` の `request` に `agent: false` と禁止範囲を確かめる `lookup` を渡す形に替え、
リダイレクトを手で追って hop ごとに同じ検査をし、外向きの request に印のヘッダを付けて `serve` がそれを持つ request を拒否する。

### 接続先の確かめ方

- `lookup` の中で `dns.lookup(hostname, { all: true })` を呼び、返った全アドレスを確かめ、1 つでも禁止なら接続しない。
  確かめたアドレスがそのまま接続に使われるので DNS rebinding の隙間が無く、hostname は URL のままなので `https:` の SNI と
  証明書検証も変わらない
- `lookup` は IP literal では呼ばれないので、hop ごとに hostname が IP literal なら直接確かめる。`[` で始まる hostname は
  無条件に IP literal として扱う（名前として扱うと `http.request` が括弧を外して `lookup` を呼ばずに接続する）
- `agent: false` で hop ごとに新しい socket を張る。共有の agent は keep-alive で再利用した socket に `lookup` を呼ばず、
  `NODE_USE_ENV_PROXY=1` では request を proxy に送って `lookup` を一度も呼ばない
- 禁止を伝えるメッセージにはホスト名だけを書き、解決したアドレスは書かない。書くと `/render` が内部の DNS を引く道具になる

### 禁止するアドレス

`net.BlockList` に次の範囲を入れる。判定の前に括弧と zone id を外し、IPv4-mapped の IPv6 を IPv4 に直し、family を明示して
`check` する（`BlockList.check` の family の既定は `"ipv4"` で、IPv6 には例外を出さずに `false` を返す）。IP として読めない値は
禁止として扱う（fail closed）。

| 範囲                                            | 理由                                      |
| ----------------------------------------------- | ----------------------------------------- |
| `0.0.0.0/8`、`::/128`                           | unspecified。多くの OS で loopback に届く |
| `127.0.0.0/8`、`::1/128`                        | loopback                                  |
| `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` | private（RFC 1918）                       |
| `100.64.0.0/10`                                 | CGNAT（RFC 6598）、Tailscale など         |
| `169.254.0.0/16`、`fe80::/10`                   | link-local、cloud の metadata             |
| `fc00::/7`                                      | IPv6 の unique local                      |
| `192.0.0.0/24`、`198.18.0.0/15`                 | IETF の予約と benchmark 用                |
| `224.0.0.0/4`、`240.0.0.0/4`、`ff00::/8`        | multicast、reserved、broadcast            |

加えて、このマシンが今持つアドレス（`os.networkInterfaces()`。判定のたびに読む）を禁止する。global IPv6 のアドレスは、
アドレスそのものではなく on-link prefix（`cidr`）ごと禁止する。同じ LAN の機器は同じ prefix の global IPv6 を持ち、
上の表のどの範囲にも入らないからである（Design Doc には無く、実装のレビューで足した）。

入口の `isSafeUrl()` は同期で落とせるものを先に 400 にする。userinfo、禁止範囲の IP literal、`localhost` / `*.localhost`
（末尾の `.` をすべて外して）を拒否する。それ以外の名前は hop の検査に任せる。

### リダイレクトと状態コード

- 3xx（301、302、303、307、308）の `Location` を現在の URL を base に解決し、scheme・userinfo・IP literal・`lookup` の
  検査を通してから接続する。リダイレクトは最大 5 回（request は最大 6 回）で、6 回目のリダイレクトを受けたら 502
- `Location` の無い 3xx と `http:` / `https:` 以外への 3xx は 502
- userinfo を持つ URL はどの hop でも拒否する（`http.request` が `Authorization: Basic` を送るため）。送るヘッダは `Host`、
  `Connection: close`、`User-Agent`、`Accept-Encoding`、印のヘッダだけになる
- 捨てる応答（リダイレクト、non-2xx、展開できない encoding）は本文を読まずに socket を切る
- 呼び出し側が渡した `src` そのものが通らないとき（scheme、userinfo、IP literal、最初の hop の解決後のアドレス）は 400、
  リダイレクトの後の失敗と upstream の失敗は 502、同時実行の上限を超えたら 503。ADR-123 の「パラメータの誤りは 400、
  fetch の失敗は 502」をこの線で読む。ADR-123 の契約に足したのは userinfo の拒否と 503 の 2 つ

### 自分への fetch を印で止める

`/render` の外向きの request に `X-Karasu-Render: 1` を付け、`serve` はこのヘッダを持つ request を routing の前に、
path によらず 403 にする。hairpin NAT や別のマシンの reverse proxy を経た自己 fetch は、karasu から見える接続先が public
アドレスなのでアドレスの禁止では止まらない。印は karasu が付けるので、`src` を書いた攻撃者には外せない。

全 path にかけるのは、`/api/*` だけに絞ると `//x/api/file/index`（router は `/api/file/index` として答える）を `req.url` の
prefix 判定が見落とし、`/render` 自身への入れ子（1 段ごとに最大 10 秒 request を抱える）も残るからである。

### 上限

- **本文:** 256 KiB。展開した後の大きさ（zip bomb）と、圧縮されたままのバイト数（展開すると何も出ない空の gzip member の
  連続）の両方にかける。後者は Design Doc に無く、実装のレビューで足した。`Content-Encoding` が `gzip` / `deflate` / `br`
  なら `node:zlib` で展開し（`fetch` が展開していたので互換のため残す）、それ以外は 502
- **時間:** 全 hop で 1 つの `AbortSignal`、10 秒
- **同時実行:** `src` の fetch は同時に 2 件まで、超えたら 503。`dns.lookup` は libuv の threadpool（既定 4 本）で走り
  中断できないので、枠は応答を返し、かつ進行中の `dns.lookup` の callback が返ったときに空ける。4 本を塞がれると `serve` の
  `fs`（`realpath`、`readFile`、chokidar）が待たされる（threadpool の 4 本を塞ぐと `fs.stat` が約 230 ms 待ち、3 本までなら
  待たなかった。Node 24.18）。`?code=` は fetch しないので数えない

## 理由

- 確認と接続が同じアドレスになる形を、production 依存を足さずに Node の標準 API だけで作れる
- `agent: false` で、keep-alive と proxy の環境変数という 2 つの素通りを構造で無くせる。「すべての hop で、接続する
  アドレスを確かめる」が文字どおり成り立つ
- アドレスで見分けられない経路（hairpin NAT、転送）は、受け側の印の検査で閉じる。アドレスの禁止とは独立に効く
- 同時実行の上限を、応答ではなく lookup の完了に結びつけることで、中断できない DNS の問い合わせが threadpool を埋める
  ことを防ぐ

## 受け入れる残りの危険

- hairpin NAT はルーターの WAN 側の管理画面や、port forward した LAN の別サービスにも届き、ルーターが送信元を書き換えると
  アドレスの禁止も効かない。攻撃者のページが中身を読めるのは、`/render` が `Access-Control-Allow-Origin: *` 付きの 200 を
  返すとき、つまり届いた本文がエラー無く `.krs` として compile できたときだけである（HTML・JSON・テキストは 422 になり、
  SVG にも中身は出ないことを確認した）。読めるのは、port forward の先で `.krs` を配り、印を見ないサービスに限られる。
  それ以外は request を送らせるだけの blind SSRF として受け入れる
- 禁止の理由（ブロックされた名前か、`ENOTFOUND` か）の違いから、内部の名前が存在するかは分かる。400 / 502 には CORS の
  ヘッダが付かないので、cross-origin のページはこの本文を読めない
- NAT64（`64:ff9b::/96`）、6to4（`2002::/16`）、Teredo、IPv4-compatible（`::/96`）、`fec0::/10` は判定しない。NAT64 は
  IPv6 だけのネットワークで公開サーバーに届く正当な経路でもあり、残りは公開アドレスか経路の無いアドレスである
- proxy を通らないと外に出られない環境では `src` が使えない（`?code=` は使える）。proxy 越しにすると解決後のアドレスを
  確かめられないので、意図した縮退とする

## 却下した案

- **`undici` を依存に足し、`Agent({ connect: { lookup } })` を `fetch` の `dispatcher` に渡す**: `fetch` のまま使えるが、
  CLI に production 依存が 1 つ増え、Node 内蔵の undici と npm の undici の版の組み合わせを気にし続けることになる。
  標準 API で同じことができる
- **先に `dns.lookup` で確かめ、IP に書き換えた URL を fetch する**: `https:` で SNI と証明書検証が IP に対して行われて
  失敗する。`Host` も付け直すことになる
- **`redirect: "follow"` のまま `response.url` を後から確かめる**: request はもう送られている。内向きのサービスに
  副作用のある request を送らせる経路が残る
- **印を付けず、アドレスの禁止だけで済ませる**: hairpin NAT と転送の経路は、karasu から見える接続先が public アドレスなので
  止まらない
- **`src` の host を allowlist（`raw.githubusercontent.com` など）に絞る**: ADR-123 が任意の公開 URL を受けると決めたので
  採らない。公開ホストを作るときに改めて決める
