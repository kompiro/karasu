---
type: acceptance-test
issue: "#1580"
feature: "Chat UI — organization queries across multi-file projects"
date: 2026-06-15
---

# AT-1580: Chat resolves ownership when the organization block lives in an imported file

## Overview

Verify that the AI chat can answer organization / ownership queries ("which team owns X?",
"who do I contact for X?") even when the `organization` block is declared in a file that is
**imported** by the open file — not in the open file itself. The chat now serializes the merged
organization graph (teams / `owns` / members / `link`s, with subteams) and a resolved per-node
owner into the model JSON it sends to the model, instead of relying on the current file's text.

Automated coverage: `packages/app/src/hooks/useChatSession/prompt.test.ts`
(`buildSystemPrompt — organization graph (multi-file ownership)`). The cases below require a live
API key and a human reading the AI's answer, so they are recorded here rather than automated.

## Prerequisites

- A valid Anthropic API key (`sk-ant-...`) stored via Settings
- A multi-file project whose entry `index.krs` **imports** a separate file that declares the
  `organization` block, e.g.:

  `org.krs`
  ```krs
  organization TechCorp {
    label "TechCorp Engineering"
    team "ec-team" {
      label "EC Team"
      owns ECommerce
      link "https://slack.example.com/ec" "EC Team Slack"
      member alice { label "Alice" slack "@alice" }
    }
  }
  ```

  `index.krs`
  ```krs
  import "org.krs"

  system ECPlatform {
    service ECommerce { label "EC Site" }
  }
  ```

---

## AC-1: "Which team owns X?" resolves from an imported org block

**Steps:**
1. Open the project at `index.krs` and set a valid API key in Settings
2. Open the **Chat** tab
3. Ask: `ECommerce のオーナーチームは？` (or `Which team owns ECommerce?`)

**Expected:**
- The AI answers with **EC Team** (`ec-team`), even though `index.krs` does not declare the
  organization — the ownership comes from the imported `org.krs`
- If the AI surfaces a contact, it uses the team `link` / member (`@alice`)

---

## AC-2: "Who do I contact for X?" returns the owning team's links/members

**Steps:**
1. From the same session, ask: `ECommerce の連絡先は？` (or `Who do I contact for ECommerce?`)

**Expected:**
- The AI returns the owning team's `link` (`EC Team Slack` / `https://slack.example.com/ec`)
  and/or its member contact (`@alice`)
- The answer does not claim the ownership is "unknown" or "not in this file"

---

## AC-3: Ownership still resolves when the open file is import-only

This is the strongest form of AC-1: the open file's text carries **no** structure or
ownership at all. Both the owned `service` and the `organization` block live in imported
files, and `index.krs` only re-opens the system as an empty shell (spec S3 — same-id
`system` blocks merge; see `examples/ja/multi-file-system/`).

**Fixture (three files):**

`system.krs` — the owned service lives here, not in the entry file:
```krs
system ECPlatform {
  service ECommerce { label "EC Site" }
}
```

`org.krs` — the organization block:
```krs
organization TechCorp {
  label "TechCorp Engineering"
  team "ec-team" {
    label "EC Team"
    owns ECommerce
    link "https://slack.example.com/ec" "EC Team Slack"
    member alice {
      label "Alice"
      slack "@alice"
    }
  }
}
```

`index.krs` — import-only + a minimal system reopen (no service, no org in the body):
```krs
import "system.krs"
import "org.krs"

system ECPlatform {
  label "EC Platform"
}
```

**Steps:**
1. Open **`index.krs`** (its body mentions neither `ECommerce`, `organization`, nor `owns`)
2. Click **↺ New Session** in the Chat tab
3. Ask: `ECommerce のオーナーは誰？` (or `Who owns ECommerce?`)

**Expected:**
- The AI resolves the owner to **EC Team** (`ec-team`) from the merged model graph (the
  serialized `organizations` section), even though the open file's text carries no ownership
  cue at all
- It does **not** answer "unknown" / "not in this file" — that would mean it is still reading
  the file body rather than the serialized graph (regression)
