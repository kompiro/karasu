# Reverse-engineering an existing project into karasu with an LLM

> **English**（this file） · [日本語](reverse-engineering-with-ai.ja.md)

You don't have to author a `.krs` from scratch. Hand an LLM (Claude / ChatGPT)
the karasu syntax reference, point it at an existing codebase, and ask it to
emit a `.krs` — then open the result in karasu to get a quick architecture
**overview** of an unfamiliar project.

karasu itself ships **no AI**. The reverse step runs in *your own* LLM session
(BYO), and karasu only renders the `.krs` it produces. This guide is the recipe.

## What this is good for (and what it isn't)

LLM-generated `.krs` is a **map, not a spec** — useful to grasp the shape of a
project fast, not a faithful model. From reversing several OSS projects
(Dify / Kubernetes / n8n), the signal is uneven:

| View | Quality | Use it for |
| --- | --- | --- |
| `system` — top level (services, infra) | **strong** | "what are the moving parts and how do they talk" |
| `deploy` (from `docker-compose` / manifests) | **strong** | "what runs where, which container realizes what" |
| `system` — deep `domain` decomposition | weak | a starting point at best; verify by hand |
| `org` (teams) | weak unless governance is explicit (e.g. k8s) | rarely worth it from code alone |

Steer the model toward the **strong** views and treat the output as an
approximation to refine, not ground truth.

## Recipe

### 1. Give the model the syntax

The model needs karasu's grammar. Use whichever fits your tool:

- **Claude Project / Custom GPT**: add [`docs/spec/syntax.md`](../spec/syntax.md)
  (and optionally [`docs/spec/style.md`](../spec/style.md)) as project knowledge.
- **One-shot chat**: paste the contents of `syntax.md`, or link it if your tool
  can fetch URLs.

### 2. Give the model the project

Feed it the signals that reveal structure — you rarely need the whole repo:

- the `README`, top-level directory layout, and service/package names,
- `docker-compose.yml` / Kubernetes manifests / `Procfile` (for the `deploy` view),
- API entry points and the main datastores.

A repo-aware coding agent can read these directly; otherwise paste the key files.

### 3. Prompt

A starting prompt (adjust the project name and emphasis):

```
You are an architecture analyst. Using the karasu .krs syntax I gave you,
produce ONE self-contained .krs file for the project <NAME>.

Scope:
- A `system` block with the top-level services, clients, users, and shared
  infra (databases / queues / storage) and the edges between them.
- A `deploy` block derived from its docker-compose / manifests: one unit per
  container/image, using `realizes` to link back to the system nodes.

Rules:
- Identifiers (node IDs) must be ASCII; put any Japanese/display text in `label`.
- Prefer breadth at the top level over deep `domain` nesting — only add a
  `domain` when the grouping is obvious from the code.
- Keep it to one file (no `import`). Output only the .krs, no prose.
```

Tips:
- If the model invents detail, tell it "only model what you can see in the code."
- ASCII IDs, Japanese labels: `service Order { label "注文サービス" }` is fine;
  `service 注文 { ... }` is **not** (IDs must be ASCII).

### 4. View and share the result

Open the generated `.krs` in the karasu web app or the VS Code extension to
preview it with drill-down. Then:

- **Share a link** — the app's **🔗 Share** button encodes the whole project
  (`.krs` + its `.krs.style`) into a URL you can send to anyone; opening it shows
  the diagram with no install.
- **Embed an image** — the hosted app exposes a `GET /render` endpoint that turns
  a share payload into a standalone image for a README or an OGP card:
  - `…/render?s=<payload>&view=system` → SVG (also `view=deploy` / `view=org`)
  - add `&format=png` for a PNG (e.g. `&format=png&width=1200`)

  The `<payload>` is the encoded value from a Share URL.

## Caveats

- **Verify before trusting.** The output is an AI approximation; check it against
  the code, especially domain boundaries and edges.
- **Iterate.** Re-prompt to fix obvious mistakes, or open the `.krs` in karasu and
  edit it directly — karasu is the source of truth, the LLM is just a fast first
  draft.

## See also

- [`docs/spec/syntax.md`](../spec/syntax.md) — the precise `.krs` grammar to give the model
- [`docs/spec/style.md`](../spec/style.md) — `.krs.style` reference (edge colors, themes)
- [Onboarding guide](02-onboarding.md) — reading an existing system down into diagrams (with `translate` for infra configs)
