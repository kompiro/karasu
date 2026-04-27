# Tags and Annotations Reference

> **English** (this file) · [日本語](tags-annotations.ja.md)

## Tags (`[...]`)

Tags declare **architectural meaning**. Styles change in response to tags.
A tag is a semantic declaration, not a direct appearance override. Visual control is handled in `.krs.style`.

| Tag | Meaning | Effect on default rendering |
|-----|---------|---------------------------|
| `[external]` | Outside the system boundary | Dashed border, gray-toned color |
| `[async]` | Asynchronous communication (for edges) | Dashed arrow |
| `[sync]` | Synchronous communication (for edges) | Solid arrow (default) |
| `[human]` | A human user | Used only on user nodes. No effect on default style |
| `[ai]` | An AI agent | Used only on user nodes. No effect on default style |
| `[mobile]` | Mobile native app form factor | Used only on `client` nodes |
| `[web]` | SPA on our own origin | Used only on `client` nodes |
| `[desktop]` | Desktop app form factor | Used only on `client` nodes |
| `[cli]` | Command-line tool / SDK | Used only on `client` nodes |
| `[device]` | IoT / dedicated terminal / KIOSK | Used only on `client` nodes |
| `[extension]` | Plugin in another application's host | Used only on `client` nodes |
| `[embed]` | Embedded widget / SDK in third-party site | Used only on `client` nodes |

### Example

```
service Payment "Payment Service" [external]
ECommerce --> Inventory "Sync inventory" [async]
user Customer "Customer" [human]
user AIAgent "Order Automation Agent" [ai]
```

---

## Annotations (`@...`)

Annotations are metadata expressing **lifecycle and state**. They are a separate concept from tags.

| Annotation | Meaning | Default rendering |
|------------|---------|-------------------|
| `@deprecated` | Scheduled for removal | ⚠ badge, node rendered semi-transparent |
| `@new` | Newly added | ✦ badge |
| `@experimental` | Experimental | ⚗ badge |
| `@migration_target` | Migration target | → badge |

### Example

Multiple annotations can be applied. Tags and annotations can be combined.

```
service Legacy "Legacy System" [external] @deprecated @migration_target
service NewAPI "New API"                  @new @experimental
```

#### Domain coexistence during migration

When `@deprecated` or `@migration_target` is applied to a `domain`, duplicate `domain` IDs within the same system are tolerated (modeling a migration period).
The domain carrying `@migration_target` becomes the preferred navigation target.

```krs
system OrderSystem {
  service LegacyService {
    domain Contract @deprecated {   // migration source — scheduled for removal
      -> Billing
    }
  }
  service NewService {
    domain Contract @migration_target {  // migration target — preferred navigation
      -> Billing
    }
  }
}
```

> Duplication is tolerated as long as at least one side carries `@deprecated` alone, or `@migration_target` alone.
> If neither annotation is present, the duplicate remains an error.

---

## Difference between tags and annotations

| | Tag | Annotation |
|---|-----|-----------|
| What it expresses | Architectural position / role | Lifecycle / development state |
| Example | `[external]` (outside the boundary) | `@deprecated` (scheduled for removal) |
| Style impact | Controlled by tag selectors in `.krs.style` | Controlled by annotation selectors in `.krs.style` |

---

## System-assigned tags

The following tags are not written by users in `.krs` files; they are automatically assigned by the tool.
They can be referenced and overridden via tag selectors in `.krs.style`.

### Automatic tags on edges

| Tag | Assignment condition | Default style |
|-----|---------------------|---------------|
| `[implicit]` | An implicit service-level edge derived from domain edges | Amber (`#F59E0B`). Line style follows the `kind` of the source domain edge (`[async]` = dashed, `[sync]` = solid) |
| `[async]` | An edge declared with `-->` | Dashed |
| `[sync]` | An edge declared with `->` | Solid |
| `[cyclic]` | Detected as part of a cyclic dependency | Red (`#EF4444`) solid |

> `[implicit]` uses color (amber) to signal "derived," while the line style distinguishes sync from async.
> When both sync and async domain edges exist between the same service pair, they are derived as separate implicit edges, one per kind.

### Customization example

```krs.style
edge[implicit] {
  color: purple;
  border-style: dotted;
}
```

---

## Team contact convention (`team` + `link`)

To support organizational queries in the AI chat ("who is the owner team of this service?", "I want to contact the affected teams"), add `team` and `link` properties to `service` or `domain` nodes.

```krs
service ECommerce {
  label "EC Site"
  team "EC Team"
  link "https://slack.com/archives/C..." "EC Team Slack"
  link "https://notion.so/..."          "Team page"
}
```

### `team` property

Specify the team name as a string. The AI uses this value when answering organizational queries.

```krs
service Payment {
  team "Fintech Team"
}
```

### `link` property (team contact)

Add contact URLs in the form `link "<url>" "<label>"`.
When the label contains any of the following keywords, the AI recognizes the link as a team contact:

| Keyword examples | Purpose |
|-----------------|---------|
| `Slack` | Slack channel |
| `Teams` | Microsoft Teams channel |
| `Team page` | Team page on Notion, Confluence, etc. |
| `Runbook` | On-call / operations runbook |

### Usage example (AI chat queries)

When the model contains the information above, queries like the following become possible in the Chat tab:

```
Q: "Which teams depend on the Order service?"
A: - Fintech Team (Payment service)
     → https://slack.com/... (Fintech Team Slack)
   - Platform Team (Notification service)
     → https://slack.com/... (Platform Team Slack)

Q: "Who should I meet first during onboarding?"
A: ECommerce (most edges): EC Team
     → https://notion.so/... (Team page)
```
