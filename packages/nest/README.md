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

| Module          | Responsibility                                                             |
| --------------- | -------------------------------------------------------------------------- |
| `src/index.ts`  | Workers entry. Thin on purpose, so the suite never needs a Workers runtime |
| `src/app.ts`    | Route table and the single failure boundary                                |
| `src/router.ts` | Literal and `:param` path matching, 404 vs 405                             |
| `src/http.ts`   | Response helpers. Everything defaults to `no-store`                        |
| `src/env.ts`    | Bindings and secrets, plus the guard that refuses rather than degrades     |
| `src/log.ts`    | The only `console` call site. Nothing repo-derived is logged               |

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
