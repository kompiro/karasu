---
name: karasu-author
description: >
  Build and evolve a karasu architecture model (.krs) of the user's own system
  through conversation: interview one layer at a time, write the .krs, and
  validate every change with the karasu CLI. Trigger when the user says:
  "karasu でモデルを書きたい", "自分のシステムを .krs で残したい",
  ".krs を一緒に書いて", "アーキテクチャを karasu で記録", "model my system in
  karasu", "help me write a .krs", "record my architecture in karasu", or
  similar phrases asking to author or update a .krs model of a system they
  work on.
metadata:
  karasu-version: "{{KARASU_MIN_VERSION}}"
---

# Karasu Author Skill

Help the user **record their own system** as a karasu model (`.krs`), and keep
it up to date as the system changes. You interview the user one layer at a
time, write the answers into `.krs`, and validate every change with the
karasu CLI.

This is the *record* side. To map a system nobody has described yet from its
source code alone, use the `reverse-architecture` skill instead; this skill
starts from what the user knows and only reads the code to avoid asking
questions the code already answers.

## Step 0: Check the karasu CLI

Do this before anything else, and before touching any `.krs`.

1. **Pick one way to call the CLI** and use it for every command in this skill.
   If the project's `package.json` lists `karasu` in `dependencies` or
   `devDependencies`, use `npx --no-install karasu` (a bare `karasu` does not
   see a project-local install). Otherwise use `karasu`. Below, `karasu` means
   the command you picked.
2. **Compare versions.** This skill was written for karasu
   `{{KARASU_MIN_VERSION}}` or later. If that is not a version number but a
   template marker in double braces, you are running the unreleased copy inside
   the karasu repository: skip to item 4.
3. Run `karasu --version` and compare the first line's version with the one
   above (semver).
   - **Command not found, or older:** stop and tell the user: "This skill needs
     karasu {{KARASU_MIN_VERSION}} or later. Please update karasu, then ask
     again." Match the advice to how the CLI is installed, so the update does not
     move it: `npm i -g karasu@latest` for a global `karasu`;
     `npm i karasu@latest` when the project lists it in `dependencies`;
     `npm i -D karasu@latest` when it is in `devDependencies`.
     Do not suggest `npx karasu@latest`: it runs once and does not change what
     `karasu` resolves to afterwards.
   - **Same or newer:** continue without comment.
4. **Check the commands this skill uses.** Run `karasu capabilities --json` once.
   This skill calls `check`, `fmt`, `render`, `serve`, `append`, `insert`,
   `apply`, `remove` and `translate`. For each one listed under `deprecations`,
   use its `replacement` from then on, and tell the user once that this skill
   is older than their karasu and can be updated. If the CLI prints a line
   starting `karasu: deprecated:` or `karasu: removed:` while you work, do the
   same with the name it gives.

## What travels with this skill

`reference/` beside this file holds byte-identical copies of the karasu docs,
because the user's repository does not contain them:

| `reference/…` | Read it for |
| --- | --- |
| `syntax.md` | The `.krs` grammar. Read it before writing anything. |
| `notation-cookbook.md` | Idiomatic shapes for common situations, so you do not invent your own |
| `tags-annotations.md` | When something is a tag, an annotation, a boundary or a facet, and `@draft` |
| `diagnostics.md` | What each code `karasu check` prints means, and how to fix it |

Read `syntax.md` and `notation-cookbook.md` at the start of the session. Look
things up in the other two when you need them.

## Principles

- **The `.krs` file is the state.** Re-read it before each change; do not rely
  on what the conversation says the model contains.
- **Read before you ask.** If the repository is open to you, answer from the
  code what the code can answer: the services and their names (directories,
  `docker-compose.yml`, k8s manifests, package names), the datastores, the
  external APIs a service calls, the tables a usecase touches. Ask the user only
  what the code cannot tell you: intent, ownership, which boundaries are real,
  what a usecase is for. Say what you found and ask the user to confirm or
  correct it.
- **One layer per round.** Each round covers one layer of the model (below),
  ends with a valid file, and shows the user what changed. Do not jump ahead to
  usecases while the services are still unsettled.
- **Never invent structure.** Do not create empty domains, guessed usecases or
  a physical layer nobody described. Leave a layer out until the user or the
  code supplies it. Mark something the user is unsure of with `@draft` (see
  `tags-annotations.md`).
- **Logical and physical stay separate.** `system` / `service` / `domain` /
  `usecase` describe what the system does; `deploy` describes how it runs and
  links to the logical side only through `realizes`.

## Procedure

### 1. Orient

- Look for an existing model: `index.krs` first, then any `*.krs` in the
  repository root or `docs/`. If there is one, run `karasu check <file>`, read
  the model, and summarize it to the user in a few lines (systems, services,
  how deep the domains go, what is missing).
- If there is none, create `index.krs` with one `system` block named after the
  product, and confirm the name with the user.
- If infrastructure files exist (`docker-compose.yml`, k8s manifests, an
  OpenAPI spec, SQL DDL), offer to lift them with `karasu translate --from
  compose|k8s|openapi|db <file>` instead of describing them by hand.

### 2. Interview, one layer at a time

Go top down. For each layer: say what you already know (from the model and the
code), ask what is missing, then write it.

| Layer | Ask about | Writes |
| --- | --- | --- |
| System boundary | Who uses the system (people, AI agents), which client apps they use, which outside systems it talks to | `user`, `client`, `service [external]`, edges between them |
| Services | The deployable units inside the boundary and what each is responsible for; how they call each other | `service`, edges (`->` sync, `-->` async) |
| Ownership | Which team owns which service | `organization` / `team` with `owns` |
| Domains | The bounded contexts inside each service (how the team splits the work, not one per directory) | `domain` |
| Usecases | What each domain does for its users or for other domains | `usecase` |
| Resources and entities | What each usecase reads and writes, with which operations; the business entities a domain keeps | `resource` with `operations`, `entity` |
| Physical | How each service runs and where the data lives | `deploy` units with `realizes`, `database` / `queue` / `storage` |

The user can stop at any layer. A model with services and no domains is a
useful model; a model with invented domains is not.

### 3. Write

Write the `.krs` yourself, following `reference/syntax.md` and the cookbook.
Edit the file with your own file-editing tools when you have them: a whole new
service or domain in one edit is fine.

The CLI can do the same edits by node, which helps when you cannot edit files
directly, or when replacing or removing a whole node:

- `karasu append <file>`: add the `.krs` read from stdin as a new top-level block
- `karasu insert <parent-id> <file>`: add it as the last child of a node
- `karasu apply <file>`: replace the node with the same id, else append
- `karasu remove <node-id> <file>`: remove a node

For example, adding a domain to the `Storefront` service of the model below:

```sh
karasu insert Storefront index.krs <<'EOF'
domain Catalog {
  label "Catalog"
  usecase BrowseProducts {
    label "Browse products"
  }
}
EOF
```

### 4. Verify after every write

Run, in this order:

1. `karasu check <entry file>` (the file that imports the others, usually
   `index.krs`). It prints every diagnostic with its location and exits `1` on
   any error. Fix every error before the next question; look the code up in
   `reference/diagnostics.md`. Warnings are worth reading out to the user: many
   are design signals (for example the same domain spanning two services).
2. `karasu fmt <file>` for each file you changed. Run it only after `check`
   passes: `fmt` refuses a file with parse errors without saying where they are.

Never use `karasu lint-style` to validate a `.krs` file; it checks `.krs.style`
files.

### 5. Show

At the end of a round, or when the user asks, show the result:

- `karasu render index.krs -o architecture.svg` writes every view to one SVG.
- `karasu serve .` starts a live preview that follows the file as you edit it.

Tell the user which view answers their question: the system view for the
boundary and services, a service's drill-down for its domains, the deploy view
for how it runs.

## A small model to start from

```krs
system Shop {
  label "Shop"

  user Customer [human] {
    description "Buys products"
  }

  service Storefront {
    label "Storefront"
    domain Order {
      label "Orders"
      usecase PlaceOrder {
        label "Place an order"
      }
    }
  }

  service Payment [external] {
    label "Payment provider"
  }

  Customer   -> Storefront "Place an order"
  Storefront -> Payment    "Charge the card"
}
```

## Deliverables

- A `.krs` model that passes `karasu check` and is formatted with `karasu fmt`.
- A short summary for the user at the end of the session: what the model now
  covers, what is marked `@draft`, and which layers are still open.
