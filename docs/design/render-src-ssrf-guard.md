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

| 観点       | 現状                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 入口の検査 | `parseRenderParams` が `isSafeUrl(src)` を呼び、落ちたら 400。scheme は `http:` / `https:` のみ。`localhost`、`::1`、IPv4 の `127/8`、`10/8`、`172.16/12`、`192.168/16`、`169.254/16`、`0/8` を文字列で拒否する                                        |
| fetch      | global `fetch`（Node 内蔵の undici）。`redirect: "follow"`、`AbortSignal.timeout(10_000)`、`User-Agent: karasu-render/1.0`。本文の大きさに上限は無い                                                                                                   |
| 失敗時     | fetch の例外と non-2xx は 502                                                                                                                                                                                                                          |
| 応答       | 200 で `image/svg+xml`、`Access-Control-Allow-Origin: *`、`Cache-Control: public, max-age=60`                                                                                                                                                          |
| 依存       | CLI の `dependencies` は `chokidar`、`commander`、`karasu-skills`、`yaml`。`undici` は jsdom 経由の dev の間接依存で、CLI は持たない                                                                                                                   |
| Node       | `engines.node >= 22.12`。`http.request` の `lookup` option は `autoSelectFamily` の既定で `{ all: true }` 付きで呼ばれ、宛先が IP literal のときは呼ばれない。`net.BlockList` は IPv4 の subnet を IPv4-mapped の IPv6 にも当てる（Node 24.18 で確認） |
| テスト     | `render-endpoint.test.ts` が `isSafeUrl` の表と、`fetch` を `vi.stubGlobal` で差し替えた `handleRender` を持つ                                                                                                                                         |

## 制約・前提

- ADR-123 の契約（`src` は任意の公開 URL、400 / 502 / 422 の使い分け、`code` と `view`）は変えない
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

**メリット**

- 依存を足さない。Node の標準 API だけで、確認と接続が同じアドレスになる
- `lookup` の呼ばれ方（`all: true`）を含め、挙動を手元で確かめられる

**デメリット**

- `fetch` が持っていたもの（リダイレクト、圧縮の展開、`AbortSignal`、本文の読み出し）を自分で書く。リダイレクトは
  どのみち手で追う必要があり（決めること 2）、圧縮は `Accept-Encoding` を送らなければ identity で返る

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
入口と同じ検査（scheme、IP literal、`lookup`）を通してから接続する。hop は最大 5 回（ADR-123 §3）で、超えたら 502。
`Location` が無い 3xx、`http:` / `https:` 以外への 3xx も 502。

method は常に `GET` で、送るヘッダは `User-Agent` と後述の印だけなので、hop をまたいで落とすべき認証情報は無い。

## 決めること 3: 禁止するアドレス

`net.BlockList` に次の範囲を入れる。IPv4-mapped の IPv6（`::ffff:0:0/96`）は IPv4 の規則で判定される。

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
hop ごとに読む。これで `--host 0.0.0.0` のときの public アドレス経由の自己 fetch を止める。

入口の `isSafeUrl()` は、同期で落とせるものを先に 400 にするために残す。IP literal は同じ禁止範囲で判定し、名前は
`localhost` と `*.localhost`（末尾の `.` を外して）を拒否する。それ以外の名前は解決しないと分からないので、hop の検査に任せる。

## 決めること 4: 自分への fetch を印で止める

アドレスで止められない経路が残る。自宅のルーターなどの hairpin NAT では、karasu はルーターの public アドレス（このマシンの
interface には無い）へ接続し、ルーターがそれを karasu 自身へ転送する。別のマシンの reverse proxy が karasu へ転送する場合も
同じである。

そこで `/render` の外向きの request に印のヘッダ（`X-Karasu-Render: 1`）を付け、`serve` は `/api/*` への request がこの
ヘッダを持っていたら 403 を返す。印を付けるのは karasu で、`src` やリダイレクト先を書いた攻撃者は外せない。アドレスの禁止と
独立に効くので、hairpin NAT や転送のように経路が見えないときも、karasu が自分の `/api/*` を読む経路が閉じる。

外の server にこのヘッダが見えるのは、`User-Agent: karasu-render/1.0` で karasu だと既に分かるのと同じ程度の情報なので
問題にしない。

### 却下: 印を付けず、アドレスの禁止だけで済ませる

hairpin NAT と転送の経路は、karasu から見えるのが public アドレスなので止まらない。#3418 の後は既定の bind が loopback になり
この経路は `--host 0.0.0.0` のときだけになるが、今の `serve` は全インターフェースで listen しているので、今も開いている。

## 決めること 5: 本文の上限と時間の上限

本文は 1 MiB で打ち切って 502 にする。`.krs` は数十 KB までで、上限が無いと 1 つの `src` でメモリを使い切らせられる
（TPL-168 の「巨大入力」）。時間の上限は今と同じ 10 秒を、全 hop と DNS を含む 1 つの `AbortSignal` で持つ。

## 現時点の方針

案A を採る。`/render` の `src` は、`node:http` / `node:https` の `request` に禁止範囲を確かめる `lookup` を渡して取りに行く。
リダイレクトは手で最大 5 回まで追い、hop ごとに同じ検査をする。禁止範囲は loopback・private・link-local・CGNAT・予約範囲と、
このマシン自身のアドレスである。さらに外向きの request に `X-Karasu-Render: 1` を付け、`/api/*` はそれを持つ request を拒否する。

### 実装の指針

1. `packages/cli/src/render-fetch.ts`（新規）:
   - `isBlockedAddress(address)`: `net.BlockList` の禁止範囲と `os.networkInterfaces()` のアドレスで判定する
   - `guardedLookup`: `dns.lookup(hostname, { ...options, all: true })` の結果を全部確かめ、1 つでも禁止なら error、
     通れば呼び出し側の `options.all` に合わせて返す
   - `fetchSrc(url, { signal })`: hop のループ。IP literal の判定、`lookup` 付きの `request`、3xx の追跡（最大 5）、
     1 MiB の上限、`X-Karasu-Render: 1` と `User-Agent` の付与。結果は `{ ok: true, text } | { ok: false, status, message }`
   - テストのために resolver（`dns.lookup` の代わり）、interface の一覧、禁止範囲の判定を差し替えられるようにする。
     テストの server は `127.0.0.1` で動くので、「公開」に見せる hop では判定から `127.0.0.0/8` だけを外し、
     拒否を確かめる宛先は resolver で別の範囲（`10.0.0.1` など）や差し替えた interface のアドレスに向ける
2. `render-endpoint.ts`: `fetch` を `fetchSrc` に替える。`isSafeUrl` は IP literal を `isBlockedAddress` で判定し、
   `localhost` / `*.localhost`（末尾の `.` を外す）を拒否する形にする。禁止範囲に当たった hop は 400、それ以外の失敗は今どおり 502
3. `serve.ts`: `/api/*` への request が `x-karasu-render` を持っていたら 403
4. テスト（`render-endpoint.test.ts` / `render-fetch.test.ts`。127.0.0.1 の実 server を使う）:
   - `isBlockedAddress` の表: 上の各範囲の境界の内と外、`::ffff:127.0.0.1`、`::ffff:7f00:1`、interface のアドレス
   - `isSafeUrl`: `localhost.`、`app.localhost`、`0x7f.1`、`2130706433`、`[::ffff:127.0.0.1]`、`[fc00::1]`、`[fe80::1]`、`100.64.0.1`
   - loopback に解決される名前（実際の判定のまま、resolver で `127.0.0.1` を返す）が接続前に拒否され、server に
     request が届かないこと。resolver が公開アドレスと private アドレスを混ぜて返したときも拒否されること
   - 公開に見せた server が、private に解決される名前、`[::ffff:10.0.0.1]`、差し替えた interface のアドレス
     （このマシン自身）へ 302 すると拒否され、リダイレクト先に接続しないこと
   - 6 回目の 3xx、`Location` の無い 3xx、`file:` への 3xx が 502
   - 1 MiB を超える本文が 502
   - `/api/files` が `X-Karasu-Render: 1` 付きで 403、付いていなければ今どおり 200（`serve.test.ts`）
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
- `/api/*` は `X-Karasu-Render` を持つ request を拒否するが、app も e2e もこのヘッダを送らないので影響なし
- #3418 の Design Doc が前提にしていた「#3426 の後は `/render` が loopback・private・このマシン自身のアドレスに届かない」が
  これで成り立つ。印のヘッダは #3418 の範囲には入らない

## 未解決の問い / 決めないこと

- NAT64（`64:ff9b::/96`）に埋め込まれた IPv4 は判定しない。IPv6 だけのネットワークで公開サーバーに届く正当な経路でもあり、
  gateway が自分の内側へ転送する構成は本件の範囲外とする
- HTTP proxy の環境変数（`HTTP_PROXY`）は今も `fetch` が見ておらず、`request` も見ないので、扱いは変わらない
- `src` の host を allowlist（`raw.githubusercontent.com` など）に絞る案は、ADR-123 が任意の公開 URL を受けると決めたので
  採らない。公開ホストを作るときに改めて決める
