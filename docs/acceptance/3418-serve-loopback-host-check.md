---
type: product
---

# AT: karasu serve は loopback で待ち受け、ローカルでない `Host` の `/api/*` を拒否する（#3418）

- **日付**: 2026-11-01
- **関連 Issue**: [#3418](https://github.com/kompiro/karasu/issues/3418)
- **Related TPLs**: [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
- **対象ファイル**: `packages/cli/src/serve.ts`、`packages/cli/src/serve-host.ts`、`packages/cli/src/serve-command.ts`

> `karasu serve` は host を渡さずに listen していたので、同じネットワークの誰でも `/api/*` で配信ディレクトリの
> `.krs` / `.krs.style` を読めた。また DNS rebinding で向け直されたページは同一 origin になり、CORS では止まらなかった。
> 既定で `127.0.0.1` だけで待ち受け、`/api/*` は `Host` が IP literal・`localhost`・`*.localhost`・`--allowed-host` の
> 名前のときだけ答える。

## 受け入れ条件

### AC-1: 既定で loopback だけで待ち受け、表示 URL は変わらない

- [x] AT-A: host を渡さない `serve()` は `127.0.0.1` で待ち受ける

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `listens on 127.0.0.1 when no host is given`
  >
  > ✅ Automated — `packages/cli/src/index.test.ts` › `CLI program` › `serve defaults dir to '.' and port to 3000`

- [x] AT-B: 既定では `Preview : http://localhost:<port>` を表示し、警告を出さない。既存の `localhost` 経由の到達（e2e）はそのまま通る

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `prints http://localhost and warns about nothing by default`
  >
  > ✅ Automated — `packages/cli/src/serve.e2e.test.ts` › `AT-0032 karasu serve — startup banner (TC-01)` › `writes the karasu serve banner with the resolved directory and preview URL`

### AC-2: `--host` で待ち受け先を変えられ、loopback 以外では警告する

- [x] AT-C: `--host` と `--allowed-host` が `serve()` に渡り、`--allowed-host` は小文字化と末尾 `.` の除去をされる

  > ✅ Automated — `packages/cli/src/index.test.ts` › `CLI program` › `serve passes --host and the normalized --allowed-host names`

- [x] AT-D: `--host 0.0.0.0` で `Listening : 0.0.0.0:<port>` の行と、配信ディレクトリが読めることの警告を出す。`::1` では `http://[::1]:<port>` を表示し、IPv4-mapped の `::ffff:127.0.0.1` は loopback として警告しない

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `warns that the directory is readable when listening on 0.0.0.0`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `prints http://[::1] when listening on ::1`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `treats the IPv4-mapped ::ffff:127.0.0.1 as loopback`
  >
  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `listenBanner` › `adds a Listening line for the wildcard addresses`

- [x] AT-E: IPv4 で待ち受けて `localhost` を表示するとき、`[::1]:<port>` に別のプロセスがいれば警告する

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `warns when [::1] on the same port is taken while listening on 127.0.0.1`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `warns when [::1] on the same port is taken while listening on 0.0.0.0`

- [x] AT-F: 待ち受けに失敗すると（使用中の port など）、メッセージを出して exit 1 になる

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `serve listen address and banner (#3418)` › `emits a failed listen as the server's error event`
  >
  > ✅ Automated — `packages/cli/src/index.test.ts` › `CLI program` › `serve exits 1 with a message when the server cannot listen`

### AC-3: `/api/*` はローカルでない `Host` を 403 で拒否する

- [x] AT-G: `Host: evil.example:<port>` の `/api/files`・`/api/file/index`・`/api/project`・`/api/default`・`/api/watch` が 403 になり、`/` と `/render` は 403 にならない

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `refuses /api/files with 403 for another domain's Host`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `does not refuse /`

- [x] AT-H: request target で偽装しても 403 になる（absolute-form の `http://localhost:<port>/api/files`、`//x/api/files`）

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `refuses an absolute-form target with another domain's Host`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `refuses a // target with another domain's Host`

- [x] AT-I: `Host` の無い HTTP/1.0 request と、空の `Host:` の HTTP/1.1 request が 403 になる

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `refuses an HTTP/1.0 request without Host, and an empty Host`

- [x] AT-J: `localhost`・`*.localhost`・IP literal（IPv6 を含む）は通り、path・fragment・userinfo・percent-encoding・`\`・TAB を含む値と、`localhost` に似た別ドメインは拒否する

  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `isAllowedHost` › `passes "localhost:3000"`
  >
  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `isAllowedHost` › `refuses a path`

### AC-4: `--allowed-host` の名前を通す

- [x] AT-K: `--allowed-host` の名前は完全一致で、`.example.com` は自身とサブドメインに一致し、`badexample.com` には一致しない

  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `isAllowedHost` › `passes an --allowed-host name exactly, with or without a port`
  >
  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `isAllowedHost` › `passes a .name entry's own name and its subdomains, but not a lookalike`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `Host check on /api/* (#3418)` › `answers a name passed as --allowed-host`

- [x] AT-L: port・scheme・path を含む `--allowed-host` はエラーで exit 1 になる

  > ✅ Automated — `packages/cli/src/index.test.ts` › `CLI program` › `serve rejects --allowed-host "foo.app.github.dev:443" with exit 1`
  >
  > ✅ Automated — `packages/cli/src/serve-host.test.ts` › `normalizeAllowedHost` › `rejects "foo.app.github.dev:443"`

## 手動確認

N/A — 自動テストですべて覆っている（別のマシンから開けないことは preview でもローカルの checkout でも確かめられないので AT にしない）
