# Reverse-engineering a repository into karasu with an AI agent

> **English** (this file) · [日本語](reverse-engineering-with-ai.ja.md)

You don't have to write a `.krs` from scratch to understand an unfamiliar system.
The `reverse-architecture` skill has your coding agent read a repository and build
a karasu model of it, with the karasu CLI doing the extraction and validation that
should not be left to judgment.

Two skills cover the two reasons to model a system:

| You want to | Use |
| --- | --- |
| **Read** a system you don't know: a new job, an OSS project, an inherited codebase | `reverse-architecture` (this guide) |
| **Record** a system you work on, including decisions the code can't show | `karasu-author`, which interviews you one layer at a time |

The reverse runs in your own agent session. The karasu CLI works on your machine and
calls no model, so your code goes only where your agent already sends it. The model
it produces is yours to share or not: see
[View and share the result](#view-and-share-the-result) for what each kind of link
exposes.

The skill needs an agent that can read a repository, run commands and start
subagents. If yours can't, use the
[one-shot prompt](#without-a-coding-agent-a-one-shot-prompt) instead. It gives you
a rougher overview.

## Install

The skill drives the karasu CLI, so install both.

```bash
npm i -g karasu
```

In Claude Code, install the plugin, which updates from the `/plugin` menu:

```text
/plugin marketplace add kompiro/karasu
/plugin install karasu@karasu
```

For other agents, copy the skill into the directory your agent reads skills from:

```bash
npx karasu skill install reverse-architecture --dir .agents/skills
```

The skill carries its own copy of the syntax reference, the
[notation cookbook](notation-cookbook.md), the tag and annotation reference and the
diagnostics reference, so it works in any repository. It starts by comparing the
CLI's version with the one it was written for and asks you to update karasu if the
CLI is older. See [`karasu skill`](../tools/cli.md#karasu-skill-install-the-agent-skills)
for the install options.

## Run it

Open your agent in the repository and ask in your own words:

```text
Reverse-engineer this repository into a karasu model.
```

On a large repository, expect the agent to confirm the number of domains with you
before it starts the subagents. That number largely decides the cost, so this is the
moment to check it (see [Cost and time](#cost-and-time)).

## What the skill does

A single agent recovers the top level of a system well, then runs out of attention
inside the domains. The skill gives each domain its own subagent, and it splits the
work so judgment stays with the agents and everything mechanical goes to the CLI.

| Phase | What happens | Who |
| --- | --- | --- |
| 1. Scout | Extracts the physical layer with `karasu translate`, finds the bounded contexts and assigns their ids | Agent and CLI |
| 2. Deep-dive | One subagent per domain reads only that domain's source and writes its usecases, entities and resources | Subagents, in batches of about five |
| 3. Synthesis | Merges the fragments, then adds cross-domain relations, domain edges, team ownership and observed groupings | Agent |
| 4. Validate and repair | Measures depth with `karasu coverage`, draws with `karasu render`, re-dives thin domains with `karasu subtree` | CLI finds, agent repairs |

Three rules shape the result:

- **The physical layer is extracted, not invented.** `karasu translate` reads
  Docker Compose, Kubernetes, OpenAPI, SQL DDL and `wrangler.toml`. The agent models
  infrastructure by hand only when no adapter covers the manifest.
- **Domains split at bounded contexts.** `Loan`, `Hold` and `Checkout` become one
  `Lending` domain, not three. Directories are hints, and team ownership never
  decides a split.
- **The model says where it guessed.** When a seam can't be settled, the node is
  marked `@draft`, and the subagent for that domain is asked to settle it with
  evidence from the source.

## What you get

- **`index.krs`**, the source of truth for everything below. It is plain text you
  can edit by hand, with no dependency on the agent that wrote it.
- **The logical layer**: `system` / `service` / `domain`, with `usecase`, `entity`
  and `resource` inside each domain, and edges between domains.
- **The physical layer**: `deploy` units and the `database` / `queue` / `storage`
  blocks they use.
- **Overlays that leave the domain split unchanged**: `organization` and `team` from
  `CODEOWNERS`, `boundary` for groupings the repository really has, and `facet` for
  sets defined outside the architecture, such as "holds personal data".
- **`@draft` marks** on the seams nobody has confirmed.
- **Notes from the run**: a coverage report, the seams that stayed `@draft`, the
  seams that were settled and on what evidence, notation gaps, and what the run
  could not establish.

Ask for the notes as files if your agent only summarizes them in chat. They are the
fastest way into a review.

## Cost and time

The fan-out is the expensive part, and it scales with the number of domains and the
size of each domain's source. These figures come from measurements during the skill's
development:

| Repository | Domains | Output tokens | Time |
| --- | --- | --- | --- |
| 85 files | 3 | about 318k for the whole run | about 12 minutes |
| about 7,800 files | 19 | at least 2.1-2.8M | not measured |

The second total is 19 domains at the measured 110-145k per domain subagent, so it
leaves out the scout, synthesis and repairs. Input tokens come on top of both rows.

Budget for this before you start, especially on a metered plan. A usage limit that
hits mid-run stops the subagents running at that moment. Finished batches keep their
results on disk, so you can ask the agent to continue with the remaining domains.

## Review the result

A clean render does not mean the model is right, and treating it as ground truth is
the main way to misuse it. It is a map to check against the code. In this order:

1. **Read the `@draft` marks and the settled seams first.** They are where the
   judgment calls are. Once you have confirmed a seam, delete its `@draft`: that
   deletion is the review. A model with no `@draft` at all is making a strong claim
   about itself and is worth doubting.
2. **Open each service's drill-down.** Domains with no edges between them, above a
   rich entity layer, usually mean a synthesis step was skipped rather than that the
   domains are independent. Ask the agent why.
3. **Run the measurements yourself.**

   ```bash
   karasu check index.krs     # fails on errors; read the warnings too
   karasu coverage index.krs  # how deep each domain went, and what the merge lost
   ```

   `check` exits 0 on warnings, but a warning about a reference to something
   undeclared is usually what the merge dropped. `coverage` flags thin domains
   relative to the others, so a domain that really owns one table can be flagged and
   still be correct. The notes should say so when that is the case.

Some gaps are invisible to these commands. `coverage` does not measure the overlays
or count domain edges, and a relation to `Domain.Entity` where that entity does not
exist is dropped from the entity view with no diagnostic. The skill has the agent
write a small script to catch those relations, so check that it ran.

When the system changes later, or you want to record decisions the code can't show,
continue from this model with `karasu-author`.

## View and share the result

Preview it locally with drill-down, with no account or upload:

```bash
karasu serve .
```

To hand it to someone, `karasu render index.krs -o architecture.svg` writes a single
SVG with every view. The app's **Share** button offers two links, and anyone who has
either one can read the whole model:

| Link | Reaches the server | Preview card when pasted |
| --- | --- | --- |
| **Private link** (copied by default) | No | No |
| **Link with preview** | Yes, and may appear in logs | Yes |

For a model of a private system, use the SVG file or the private link.

The forms that go through the server have a ceiling of 8,000 encoded characters,
roughly 15 KB of flattened `.krs`. A reverse with several domains is likely to pass
it, and a large run can pass it many times over. Above the ceiling the app doesn't
offer the link with preview, which leaves the SVG file and the private link. A very
long private link may not survive some chat tools. Two more forms have the same
ceiling:

- **A public repository's own URL.** Commit the model as `index.krs` or `karasu.krs`
  at the repository root, and `https://karasu.kompiro.dev/<owner>/<repo>` opens it.
  Above the ceiling this returns an error that names the size and what to do about
  it. Private repositories are not supported. See
  [ADR permalinks](adr-permalinks.md#repo-backed-permalinks--pin-to-a-commit-sha) for
  pinning a link to a commit.
- **An image.** `https://karasu.kompiro.dev/render?s=<payload>&view=system` returns
  an SVG, where `<payload>` is the encoded value from a Share URL. It reaches the
  server, like the link with preview. Use `view=deploy` or `view=org` for the other
  views, and add `&format=png` (for example `&format=png&width=1200`) for a PNG. Above
  the ceiling the URL may be too long to be accepted.

## Without a coding agent: a one-shot prompt

You can get a rough overview from any LLM chat by giving it the grammar and the
project's key files. It sees far less than a repository-aware agent and has no CLI to
check its work, and the results are uneven. From reversing a few OSS projects (Dify,
Kubernetes, n8n) this way:

| View | Quality | Use it for |
| --- | --- | --- |
| `system`, top level (services, infra) | **strong** | "what are the moving parts and how do they talk" |
| `deploy` (from `docker-compose` / manifests) | **strong** | "what runs where, which container realizes what" |
| `system`, deep `domain` decomposition | weak | a starting point at best; verify by hand |
| `org` (teams) | weak unless governance is explicit (e.g. k8s) | rarely worth it from code alone |

Steer the model toward the **strong** views.

### Step 1: give the model the syntax

Add the [syntax reference](../spec/syntax.md) to a Claude Project or Custom GPT as
knowledge, or paste it into the chat. Add the
[notation cookbook](notation-cookbook.md) as well: it shows worked idioms (a KV store,
a shared datastore, an external dependency), so the model picks karasu-idiomatic
shapes instead of inventing them.

### Step 2: give the model the project

You rarely need the whole repository. Give it what reveals structure:

- the `README`, the top-level directory layout, and the service or package names,
- `docker-compose.yml`, Kubernetes manifests or a `Procfile`, for the `deploy` view,
- the API entry points and the main datastores.

### Step 3: prompt

```text
You are an architecture analyst. Using the karasu .krs syntax I gave you,
produce ONE self-contained .krs file for the project <NAME>.

Scope:
- A `system` block with the top-level services, clients, users, and shared
  infra (databases / queues / storage) and the edges between them.
- A `deploy` block derived from its docker-compose / manifests: one unit per
  container/image, using `realizes` to link back to the system nodes.

Rules:
- Use short English identifiers for node IDs and put display text in `label`.
- Prefer breadth at the top level over deep `domain` nesting. Only add a
  `domain` when the grouping is obvious from the code.
- Only model what you can see in the code.
- Keep it to one file (no `import`). Output only the .krs, no prose.
```

Paste the output into the [web app](https://karasu.kompiro.dev/) to see it, then
re-prompt to fix obvious mistakes or edit the `.krs` directly.

## See also

- [`reverse-architecture` SKILL.md](../../packages/skills/skills/reverse-architecture/SKILL.md): the full instructions the agent follows
- [Onboarding guide](02-onboarding.md): read an existing system down into diagrams by hand, with `translate`
- [Using the CLI](../tools/cli.md): the commands the skill runs
- [Tags & annotations](../spec/tags-annotations.md): `@draft`, `facet` and `boundary`
- [Syntax reference](../spec/syntax.md): the `.krs` grammar
