# Linking an ADR to a karasu structure (permalink)

> **English**（this file） · [日本語](adr-permalinks.ja.md)

When you make an architecture decision, you record the resulting structure in an
in-repo `.krs` and write an ADR (Architecture Decision Record) that **links to
it** — so a reader of the decision can open the diagram it describes. This recipe
is the convention for writing that link so it stays **reproducible and
auditable**, not a dead opaque URL.

karasu's hosted app (**karasu-nest**) already gives you the link: the **🔗 Share**
button encodes the whole project (`.krs` + its `.krs.style`) into a self-contained
URL. The only question this guide answers is *what form of that URL to put in an
ADR, and what to put next to it.*

## The rule, in one line

**Record the self-contained `/s?s=<payload>` URL as the canonical link.** A
shortened URL (taka or any shortener) is an optional, replaceable *alias* — never
the source of truth.

## Why the `/s?s=` payload is canonical

The Share button produces two URLs for the same project:

| URL form | Where the payload lives | Use it in an ADR? |
| --- | --- | --- |
| `https://karasu.kompiro.dev/#s=<payload>` | URL **fragment** (never sent to the server) | **No** — a fragment can't unfurl (the OGP crawler never sees it) |
| `https://karasu.kompiro.dev/s?s=<payload>` | URL **query** (server-visible) | **Yes** — this is the canonical link |

The `<payload>` is the project **frozen into the URL** — a deflate-compressed,
self-contained snapshot of the `.krs`. That immutability is exactly what an ADR
wants: an ADR is a *point-in-time* record, so it should point at the structure
**as of the decision**, not the living version that may have drifted since.

Use the **`/s?s=` (query)** form, not `#s=` (fragment): only the query form
reaches the server, so it can render a per-share OGP card (link preview) and
survives being pasted into Slack / Discord / X. The fragment form opens fine in a
browser but unfurls to nothing.

## Shortening is optional — and replaceable

A `/s?s=` URL is long (a few hundred characters to a few KB). You can shorten it
for readability with **taka** (`https://taka.kompiro.dev/<slug>`) or any other
shortener — it issues a server-side 302 to the `/s?s=` destination.

Treat the short URL as a **display alias, not the canonical link**:

- The short URL is **opaque** — `https://taka.kompiro.dev/TkrZQG` tells a future
  reader nothing about what it points to, and if the shortener's record is
  deleted or expires, the ADR has lost the structure with no way to detect it.
- The `/s?s=` payload, by contrast, **is** the structure — decode it and you get
  the `.krs` back. So as long as the ADR keeps the payload, the link survives the
  shortener disappearing.

So: keep the `/s?s=` payload as the canonical record; add a short URL only as a
convenience. **Not shortening at all** (pasting the long URL) is a perfectly valid
choice too.

> **Trust note.** The `/s?s=` payload contains your diagram. Shortening it means
> the shortener (taka's datastore, or whichever service you use) now holds a URL
> that embeds that diagram. For a confidential structure, prefer **not
> shortening**, or run **your own shortener** — the convention never forces you to
> hand the diagram to a third party.

## Optionally: a path back to the living source

The payload is a frozen snapshot. To also leave a trail back to the **living**
`.krs` (the source of truth in your repo), add the in-repo path next to the link:

- `source: examples/payments/system.krs` — the file the structure came from.
- For a [deep permalink](../spec/permalink.md) (a link that lands the reader
  drilled into one element), name the element by its author-given `id`, e.g.
  `system.krs#krs-system-payment-api`. Identity is always the `id`, never a
  `label`.

This is optional traceability — the payload alone already makes the link
reproducible.

## Worked example

The `examples/en/feature-samples/minimal.krs` structure, shared:

- **Canonical** (paste this in the ADR):
  `https://karasu.kompiro.dev/s?s=bZBBasMwEEWv8tG2NIYus-iilO66Kt1pI9uDM0QeF42SEkKgh-gJc5KM7DgmEBBC8_X-12iObpvUrV1VoWfhPsSVCV6sfqd-EM0pZNI18oagdh1JM_YhcotCguVnl3H--4ceNFOPJ7xAKe25IbVCD9JUoeygtiNdjdnfSpbIimALdVCKLITfDQlYhxgyS4dE0lIqp3rXFaeX6yOfU684egFiqCnCu1n8GhnvCo-5F3ykQbIFTp7FNeuFB073prfQbB94rvKd5Zb__Iqbz7vx543NbYIXyrCFmgY0Y5boThc`
- **Short alias** (optional, for readability): `https://taka.kompiro.dev/<slug>`
- **Source** (optional traceability): `examples/en/feature-samples/minimal.krs`

The payload **is** the structure — decode it and the `.krs` comes back — so the
canonical link survives even if the short alias is never created or later breaks.

## If your repo uses `@kompiro/adr-tools`

The above is the **portable** convention: it constrains only *what to write*, so
it works with any ADR tool (adr-tools / Log4brains / plain Markdown / none) and
any file layout. It does **not** dictate *where* in the ADR the link lives.

Repos that adopt [`@kompiro/adr-tools`](https://www.npmjs.com/package/@kompiro/adr-tools)
get a stricter, machine-checkable form: a `permalink:` frontmatter field (with the
`/s?s=` payload as the canonical value) plus a generated body summary. karasu's own
`docs/adr/` uses it as the reference implementation — see `.claude/rules/adr.md`
for the frontmatter schema. Validating the `permalink:` field (decoding the
payload, checking the optional `source` exists, checking the optional `short`
resolves) is tracked in
[#1830](https://github.com/kompiro/karasu/issues/1830).

> Related TPLs: [TPL-20260630-02](../test-perspectives/TPL-20260630-02-adr-permalink-payload-is-canonical.md)
> — the canonical ADR permalink is the self-contained `/s?s=` payload; a shortener
> (taka etc.) is an optional alias and must never become a required dependency.

## See also

- [`docs/spec/permalink.md`](../spec/permalink.md) — the deep-permalink anchor grammar (`#krs-<view>-<id>`)
- [Reverse-engineering with an LLM](reverse-engineering-with-ai.md) — generate a `.krs`, then Share / `/render` it
- [Communicating Diagrams](05-communicating-diagrams.md) — the Share button, `/render` embeds, and CI freshness
