# Linking an ADR to a karasu structure (permalink)

> **English**（this file） · [日本語](adr-permalinks.ja.md)

When you make an architecture decision, you record the resulting structure in an
in-repo `.krs` and write an ADR (Architecture Decision Record) that **links to
it** — so a reader of the decision can open the diagram it describes. This recipe
is the convention for writing that link so it stays **recoverable and auditable**,
not a dead opaque URL.

karasu's hosted app (**karasu-nest**) gives you the link: the **🔗 Share** button
encodes the whole project (`.krs` + its `.krs.style`) into a self-contained URL.
This guide answers *what form of that link to put in an ADR, and what to record
next to it.*

## The rule, in one line

**Record a short permalink to the structure (via taka) plus the in-repo `.krs`
`source` it came from.** The `.krs` in your repo is the source of truth; the
permalink is a convenience pointer; and the `source` keeps the ADR recoverable
even if the shortener later goes away.

## The `.krs` source is the record; the permalink is a pointer

The source of truth for any karasu structure is the **`.krs` in your repo** — not
a URL. An ADR permalink only gives a reader a one-click way to *see* that structure
rendered. So always record the **`source`** (the in-repo `.krs` path) next to the
link: then the ADR can be reconstructed from the repo no matter what happens to the
URL or the shortener. This is why `source` is required and the link alone is not
enough.

## Shorten the `/s?s=` share URL — not `#s=`

The Share button produces two URLs for the same project:

| URL form | Where the payload lives | Shorten / paste this? |
| --- | --- | --- |
| `https://karasu.kompiro.dev/#s=<payload>` | URL **fragment** (never sent to the server) | **No** — a fragment can't unfurl (the OGP crawler never sees it) |
| `https://karasu.kompiro.dev/s?s=<payload>` | URL **query** (server-visible) | **Yes** — this is what taka points to |

Shorten the **`/s?s=` (query)** form with taka (`https://taka.kompiro.dev/<slug>`,
a server-side 302). The destination behind a short link **must** be the query form,
because only the query form reaches the server, so it can render a per-share OGP
card (link preview) and survive being pasted into Slack / Discord / X. The `#s=`
fragment opens fine in a browser but unfurls to nothing — never shorten or paste it.

## Two forms of permalink

| Form | Good | Trade-off |
| --- | --- | --- |
| **taka short link** *(karasu's choice)* | clean and small enough for an ADR | the clickable link resolves *through* taka — so pair it with `source`, and if taka is ever gone you rebuild from the repo |
| **frozen `/s?s=` payload** | immutable, no shortener needed — the whole model is embedded in the URL | can run to **several KB** — too bulky to sit in an ADR |

karasu records the **taka short link + `source`** and does **not** inline the raw
payload. Reproducibility comes from the `source` `.krs` (as of the ADR's commit);
true ref-pinning of the source is tracked separately in
[#1828](https://github.com/kompiro/karasu/issues/1828).

> **Trust note.** The `/s?s=` snapshot behind a short link contains your diagram,
> and taka's datastore holds that destination. For a confidential structure,
> prefer **not shortening** (accepting a longer URL) or run **your own shortener** —
> the convention never forces you to hand the diagram to a third party.

## Pointing at one element (deep permalink)

For a [deep permalink](../spec/permalink.md) — a link that lands the reader drilled
into one element — name the element by its author-given `id`, e.g.
`system.krs#krs-system-payment-api` in the `source`. Identity is always the `id`,
never a `label`.

## Worked example

The `examples/en/feature-samples/minimal.krs` structure, shared:

- **Permalink** (paste in the ADR): `https://taka.kompiro.dev/<slug>` — a taka short link.
- **Resolves to** (the `/s?s=` snapshot taka 302s to):
  `https://karasu.kompiro.dev/s?s=bZBBasMwEEWv8tG2NIYus-iilO66Kt1pI9uDM0QeF42SEkKgh-gJc5KM7DgmEBBC8_X-12iObpvUrV1VoWfhPsSVCV6sfqd-EM0pZNI18oagdh1JM_YhcotCguVnl3H--4ceNFOPJ7xAKe25IbVCD9JUoeygtiNdjdnfSpbIimALdVCKLITfDQlYhxgyS4dE0lIqp3rXFaeX6yOfU684egFiqCnCu1n8GhnvCo-5F3ykQbIFTp7FNeuFB073prfQbB94rvKd5Zb__Iqbz7vx543NbYIXyrCFmgY0Y5boThc`
- **Source** (required — the record): `examples/en/feature-samples/minimal.krs`.

The short link is what a reader clicks; the `source` is what keeps the structure
recoverable if the short link ever breaks.

## Two layers: a portable convention (L1) and an adr-tools reference (L2)

Your ADRs live in **your** repo, under **your** conventions — karasu can't impose a
file layout or a frontmatter schema on them. A karasu user might keep ADRs with
adr-tools, Log4brains, or plain Markdown, each with its own idea of *where* a
reference belongs. So the convention is split into two layers: one that every user
can follow, and a stricter one for repos that opt into tooling.

- **L1 — the portable convention (everything above).** It constrains only *what to
  record*: a short permalink to the structure plus a **required `source`**. It says
  nothing about *where* in the ADR the link goes, so it works with any ADR tool and
  any layout. This is the baseline — follow it and your ADR link stays recoverable
  regardless of tooling.
- **L2 — the adr-tools reference implementation.** Repos that adopt
  [`@kompiro/adr-tools`](https://www.npmjs.com/package/@kompiro/adr-tools) get a
  stricter, machine-checkable form of L1: a `permalink:` frontmatter field (taka
  `short` + required `source`) and a generated body summary, validated by the tool.
  It fixes *where* the link lives and lets a linter enforce it. karasu's own
  `docs/adr/` uses L2 as dogfooding and as L1's reference implementation — see
  `.claude/rules/adr.md` for the frontmatter schema.

In short: **L1 is the rule (record a short link + `source`); L2 is one enforced way
to satisfy it.** If you don't use adr-tools, just apply L1 wherever your ADR format
keeps references — you get the same durability without the tooling. Validating the
L2 `permalink:` field (the `source` `.krs` exists, the `short` link resolves) is
tracked in [#1830](https://github.com/kompiro/karasu/issues/1830).

> Related TPLs: [TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)
> — an ADR permalink is a pointer, not the record; always record the in-repo `.krs`
> `source` so the structure survives the shortener or URL form going away.

## See also

- [`docs/spec/permalink.md`](../spec/permalink.md) — the deep-permalink anchor grammar (`#krs-<view>-<id>`)
- [Reverse-engineering with an LLM](reverse-engineering-with-ai.md) — generate a `.krs`, then Share / `/render` it
- [Communicating Diagrams](05-communicating-diagrams.md) — the Share button, `/render` embeds, and CI freshness
