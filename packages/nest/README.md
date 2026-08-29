# @karasu-tools/nest

karasu-nest: the hosted service that reads a repository through a GitHub App,
reverse-engineers it into `.krs` server-side, and serves the result.

This is **a separate Cloudflare Worker from the Pages app**, and that separation
is the point ([ADR-1990](../../docs/adr/1990-karasu-nest-pivot-server-reverse.md)
decision 5). This deploy holds state, the GitHub App private key and the webhook
endpoint; none of them may move into the static app deploy. The app's existing
surfaces (inline `#s=` share, `/render`, `/s`, the repo-backed permalink) are
untouched and are not routed through here.

## What it is not

`karasu.kompiro.dev/<owner>/<repo>` is **not** this service. That surface
resolves a `.krs` already committed to the repo and nothing else; on a miss it
shows a signpost. The two faces are not wired together at runtime, and meet only
at the repo, when nest opens a pull request with what it generated
([ADR-2249](../../docs/adr/2249-permalink-generation-seam.md)).

## Layout

| Module                   | Responsibility                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| `src/index.ts`           | Workers entry. Thin on purpose, so the suite never needs a Workers runtime |
| `src/app.ts`             | Route table and the single failure boundary                                |
| `src/router.ts`          | Literal and `:param` path matching, 404 vs 405                             |
| `src/http.ts`            | Response helpers. Everything defaults to `no-store`                        |
| `src/env.ts`             | Bindings and secrets, plus the guard that refuses rather than degrades     |
| `src/log.ts`             | The only `console` call site. Nothing repo-derived is logged               |
| `src/auth/`              | Submitter sign-in: the OAuth round trip, and the session cookie            |
| `src/store/gallery-*.ts` | The gallery's keys, account-first so deletion is one sweep                 |

## Submitter sign-in

The gallery authenticates the **submitter**, not their authority over any
repository ([#2586](https://github.com/kompiro/karasu/issues/2586)). A
submission is not repository-bound, so there is nothing to prove control of;
what a login buys is a handle that can be held responsible and suspended.
Anonymous submission was rejected for the absence of exactly that.

No scopes are requested. `GET /user` returns the numeric id and the login for a
token with no scope at all, and those two fields are the whole account record.

To wire it up on a deploy:

1. Register the credentials. Either a **dedicated OAuth App** or this GitHub
   App's own user-to-server credentials will do -- the flow is identical and
   the code cannot tell them apart.
   [#2590](https://github.com/kompiro/karasu/issues/2590) removes the App
   itself, so a dedicated OAuth App is the form that survives.
2. Set the callback to `<origin>/auth/callback`.
3. `wrangler secret put GITHUB_OAUTH_CLIENT_ID` and
   `wrangler secret put GITHUB_OAUTH_CLIENT_SECRET`.
4. Set `NEST_PUBLIC_ORIGIN` to the origin this deploy answers on. It is not
   derived from the request: it decides the `redirect_uri` and the `Origin`
   every state-changing request is checked against, and both stop meaning
   anything if a `Host` header can pick them.

## Conventions this package holds itself to

- **Nothing derived from repository contents leaves the process** except the
  generated `.krs` itself: not in an error body, not in a log line, not in a
  cached response. The `no-store` default and the failure boundary in `app.ts`
  are the enforcement points.
- **A missing binding is a refusal, not a degradation.** `requireBinding` throws
  and the boundary answers 503 naming the binding.
- **No runtime dependencies.** This is the one deploy holding the App private
  key, so every added package is supply-chain surface on the worst possible
  target. The router exists instead of a framework for that reason.

## Development

```
pnpm --filter @karasu-tools/nest test
pnpm --filter @karasu-tools/nest typecheck
```

## Deploy

`wrangler.toml` lives in this directory and is deployed by
`.github/workflows/nest-deploy.yml`, which runs wrangler with
`workingDirectory: packages/nest` so the repo-root Pages config is not picked
up. The workflow is `workflow_dispatch` only: the service holds no consent copy
yet ([#1996](https://github.com/kompiro/karasu/issues/1996)), and ADR-1990
decision 6 forbids pointing it at other people's private repositories until it
does.

One KV namespace is bound as `KRS_CACHE`; the cache and the directory share it
and are separated by key prefix, because a purge has to see both. Secrets are
set with `wrangler secret put` and never appear in the repository. `GET
/healthz` reports which of them the running deploy actually has, as booleans.
