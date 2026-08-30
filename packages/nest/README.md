# @karasu-tools/nest

karasu-nest: the hosted gallery. A submitter reverse-engineers their own
repository **in their own environment**, submits the resulting `.krs`, and this
service stores it, renders it and serves it by id.

**It does not read anyone's repository.** That was the pivot
[ADR-2578](../../docs/adr/2578-nest-retires-server-side-reverse.md) recorded:
the two problems server-side reverse was chosen to solve — private repositories
cannot be opened, and repositories rarely have a committed `.krs` — both stop
existing when the submitter brings the model, and the means cost $3.15 a run
plus a stack of data-processor obligations.

This is **a separate Cloudflare Worker from the Pages app**, and that separation
is the point (ADR-2578 decision 5). This deploy holds the store and the session;
neither may move into the static app deploy. The app's existing surfaces (inline
`#s=` share, `/render`, `/s`, the repo-backed permalink) are untouched and are
not routed through here.

## What it is not

`karasu.kompiro.dev/<owner>/<repo>` is **not** this service. That surface
resolves a `.krs` already committed to the repo and nothing else; on a miss it
shows a signpost. The gallery is a third face beside it, with its own id space,
so one address never resolves to two different things.

## Routes

| Route                                    |                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `GET /healthz`                           | Liveness, plus which bindings this deploy has (as booleans)             |
| `GET /auth/login` → `GET /auth/callback` | Submitter sign-in                                                       |
| `POST /auth/logout`                      | Revoke this session                                                     |
| `POST /api/submissions`                  | Submit a `.krs` (JSON, authenticated)                                   |
| `GET /g/<id>`                            | A submission, rendered. `?format=svg` / `?format=krs` for the raw forms |
| `GET /console`                           | Manage your own submissions                                             |

## Layout

| Module          | Responsibility                                             |
| --------------- | ---------------------------------------------------------- |
| `src/index.ts`  | Package barrel                                             |
| `src/worker.ts` | Workers entry. A default handler and nothing else          |
| `src/app.ts`    | Route table and the single failure boundary                |
| `src/router.ts` | Literal and `:param` path matching, 404 vs 405             |
| `src/http.ts`   | Response helpers. Everything defaults to `no-store`        |
| `src/env.ts`    | Bindings, plus the guard that refuses rather than degrades |
| `src/auth/`     | The OAuth round trip and the session cookie                |
| `src/store/`    | Accounts, sessions, submissions — keyed account-first      |
| `src/gallery/`  | Validation, rendering, and the HTML                        |
| `src/redact/`   | The structure-only scan, on ingress                        |

## Conventions this package holds itself to

- **A missing binding is a refusal, not a degradation.** `requireBinding` throws
  and the boundary in `app.ts` answers 503 naming the binding.
- **No runtime dependencies beyond `@karasu-tools/core`.** The router exists
  instead of a framework, and the console is server-rendered HTML with plain
  forms rather than a bundled front end.
- **No client script.** The console is same-origin with the session cookie, so
  any script served here would run with that session's authority.
- **The purge is a promise with a machine check.** Every KV prefix is
  account-first so deleting an account is one sweep, and
  `gallery-purge-coverage.test.ts` fails the build if a prefix escapes it
  (TPL-2226).

## Submitter sign-in

The gallery authenticates the **submitter**, not their authority over any
repository. A submission is not repository-bound, so there is nothing to prove
control of; what a login buys is a handle that can be held responsible and
suspended. Anonymous submission was rejected for the absence of exactly that.

No scopes are requested. `GET /user` returns the numeric id and the login for a
token with no scope at all, and those two fields are the whole account record.

To wire it up on a deploy:

1. Register a GitHub **OAuth App**.
2. Set its callback to `<origin>/auth/callback`.
3. `wrangler secret put GITHUB_OAUTH_CLIENT_ID` and
   `wrangler secret put GITHUB_OAUTH_CLIENT_SECRET`.
4. Set `NEST_PUBLIC_ORIGIN` to the origin this deploy answers on. It is not
   derived from the request: it decides the `redirect_uri` and the `Origin`
   every state-changing request is checked against, and both stop meaning
   anything if a `Host` header can pick them.

## Development

```
pnpm --filter @karasu-tools/nest test
pnpm --filter @karasu-tools/nest typecheck
```

## Deploy

`wrangler.toml` lives in this directory and is deployed by
`.github/workflows/nest-deploy.yml`, which runs wrangler with
`workingDirectory: packages/nest` so the repo-root Pages config is not picked
up. The workflow is `workflow_dispatch` only: a public submission surface needs
a ToS and a privacy policy before it is opened past its operator
([#2591](https://github.com/kompiro/karasu/issues/2591)).
