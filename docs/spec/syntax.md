# .krs Syntax Reference

> **English** (this file) · [日本語](syntax.ja.md)

## File structure

```
@import "default.krs.style"
@import "theme/dark.krs.style"   // multiple allowed; later ones take precedence

// Domains not yet assigned to a service (top-level)
domain Payment { label "Payment" }

system ECPlatform {
  label "EC Platform"
  // service, user, and edge declarations
}
```

---

## Overview of concepts

karasu explicitly separates **logical structure** and **physical structure**.

### Logical structure (what / why)

| Keyword | Meaning | May contain |
|---------|---------|-------------|
| `system` | A container showing relationships between owned/external services and clients | `service`, `user`, `client` |
| `service` | An independent unit of business functionality | `domain` |
| `domain` | A business-concern boundary (top-level or inside a service) | `usecase` |
| `usecase` | A business operation inside a domain | `resource` |
| `resource` | What a usecase operates on (tables, external APIs, files, etc.) | — |
| `user` | A user of the system (human or AI agent) | — |
| `client` | Software we ship that acts on behalf of an end user (mobile / web / desktop / CLI / device / extension / embed). See recognized form-factor tag table below | — |

#### `client` form-factor tags (recognized)

karasu's tag system is intentionally open — any tag is accepted and styles react via selectors. For `client` specifically, **seven names are recognized** as form-factor classifications. Future versions will respond to them with kind-specific icons (Phase 2) and layout hints. Tags outside this list still parse and behave as ordinary user-defined tags; they simply do not trigger karasu's built-in form-factor treatment.

| Tag | Form factor |
|-----|-------------|
| `[mobile]` | iOS / Android native app |
| `[web]` | SPA running on the vendor's own origin |
| `[desktop]` | Desktop app (Electron, native) |
| `[cli]` | Command-line tool / SDK shipped to users |
| `[device]` | IoT / dedicated terminal / KIOSK |
| `[extension]` | Plugin / extension hosted by another application (browser extension, IDE extension, design-tool plugin) |
| `[embed]` | Widget / SDK embedded into third-party web content (Stripe Checkout, Intercom, etc.) |

Recommended: pick at most one form-factor tag per client. Combining unrelated form factors (e.g. `[mobile] [desktop]`) is parseable but conveys no additional architectural meaning.

`client` is reserved for software the project itself ships. Third-party browsers / IDEs / AI agents that consume the system are modeled as `user` (typically `[human]` or `[ai]`), not `client`.

### Organizational structure (who owns what) — rendered as a separate diagram

An independent axis from logical/physical, describing the **ownership** of services and domains.
`organization` is the root, with nested `team` declarations. Each team lists the nodes it owns via `owns` and may contain `member` entries.

| Keyword | Meaning | May contain |
|---------|---------|-------------|
| `organization` | Root of an organization. Multiple declarations allowed | `team` |
| `team` | A team with responsibility. May be nested | `team`, `member`, `owns` |
| `member` | An individual belonging to a team | — |

### Physical structure (how) — rendered as a separate diagram

Deployment units are declared inside a `deploy` block using a kind keyword.
All properties are optional. When omitted, a warning is emitted rather than an error.

| Keyword | Description | Properties |
|---------|-------------|------------|
| `war` | WAR / EAR (Servlet / EJB container) | `runtime`, `realizes` |
| `jar` | Executable JAR (Spring Boot, etc.) | `runtime`, `realizes` |
| `oci` | Container image | `image` (optional), `runtime`, `realizes` |
| `lambda` | AWS Lambda | `runtime`, `realizes` |
| `function` | Azure Functions / Google Cloud Functions | `runtime`, `realizes` |
| `assets` | Static files / SPA (CDN distribution) | `runtime`, `realizes` |
| `job` | Batch processing. Omit `schedule` for one-shot, specify for recurring | `runtime`, `schedule` (optional), `realizes` |
| `artifact` | Any kind not covered above (escape hatch) | `type` (optional), `runtime`, `realizes` |

---

## Node declaration

```
<kind> <id> [<tags>] @<annotation> [{ <properties> <child-nodes> }]
```

`id` is required. Tags, annotations, and the body block are optional.

---

## Property block

Properties are written inside the body block `{ }`. Properties come before child nodes and edges.

| Property | Syntax | Applicable kinds | Description |
|----------|--------|-----------------|-------------|
| `label` | `label "<display-name>"` | All | Display name on the diagram. Defaults to the id when omitted |
| `description` | `description "<text>"` | All | Description text (use `"""..."""` for multi-line) |
| `role` | `role "<role-name>"` | user | Business role |
| `team` | `team "<team-name>"` | service, domain | Owner team |
| `link` | `link "<URL>" "<label>"` | All | Link to related documentation (multiple allowed). Label is optional |

All properties are optional. `link` may appear multiple times within the same node.
Using a property on a kind that does not support it produces an error.

### user node example

```
user <id> [<human|ai>] {
  label "<display-name>"
  role "<role-name>"
  link "<URL>" "<label>"
}
```

- The tag `[human]` / `[ai]` distinguishes human users from AI agents.
- `role` describes the business role within the system.
- Properties and the body block `{ }` are optional.

### service / domain node example

```
service <id> {
  label "<display-name>"
  team "<team-name>"
  link "<URL>" "<label>"
  link "<URL>" "<label>"

  domain <domainId> {
    label "<domain-name>"
    team "<team-name>"
    ...
  }
}
```

---

## Writing logical diagrams

### system block

```
system ECPlatform {
  label "EC Platform"

  user Customer [human] {
    description "A general user who purchases products"
  }
  user Admin [human] {
    description "An operator who manages the system"
  }

  service ECommerce {
    label "EC Site"
    description "Product management and order processing"
  }
  service Payment [external] {
    label "Payment Service"
    description "Credit card payment processing"
  }
  service Inventory [external] {
    label "Inventory"
    description "Inventory data management"
  }

  Customer  ->  ECommerce "Place an order"
  ECommerce ->  Payment   "Process payment"
  ECommerce --> Inventory "Sync inventory"
}
```

### service block

The internals of a service are decomposed into domains.
If the same domain spans multiple services, the tool emits a warning (a design-problem signal).

```
service ECommerce {
  label "EC Site"
  domain Order {
    label "Orders"
    usecase PlaceOrder {
      label "Accept an order"
      resource OrderTable {
        label "Order table"
      }
      resource InventoryAPI [external] {
        label "Inventory API"
      }
    }
    usecase CancelOrder {
      label "Cancel an order"
    }
    usecase QueryOrder {
      label "Query order status"
    }
  }
  domain Purchasing {
    label "Purchasing"
    usecase OrderFromSupplier {
      label "Place an order with a supplier"
    }
    usecase CheckPurchaseStatus {
      label "Check purchase status"
    }
  }
}
```

### Top-level domain declaration

A `domain` can be declared at the top level of a file, not only inside a `service`.
Domains that do not belong to any service are treated as "unassigned" and displayed on the system view.
The compiler emits a warning for unassigned domains.

```
// Domains whose service assignment has not been decided yet
domain Payment { label "Payment" }
domain Inventory { label "Inventory" }

system ECPlatform {
  service ECommerce {
    // Domain assignment to be decided later
  }
}
```

Use cases:
- Listing domain concepts early in the design phase.
- Temporarily "parking" domains during a service reorganization.

### Edge declaration

```
<from_id> ->  <to_id> "<label>"   // sync (solid-line arrow)
<from_id> --> <to_id> "<label>"   // async (dashed-line arrow)
```

Edges can be written inside `system`, `service`, and `domain` blocks.

#### Edges inside a domain block

Declaring an edge inside a `domain` block expresses a dependency between domains.
`from_id` is the id of the declaring domain; `to_id` is the id of the dependency target.

```
service ECommerce {
  domain Contract { label "Contract" }
}

service BillingService {
  domain Billing {
    label "Billing"
    Billing -> Contract "Created from a contract"       // sync dependency
    Billing --> AuditLog "Record an audit log entry"    // async dependency
  }
}
```

**Intra-service domain edges**: rendered in the service view (drill-down into the service).

**Cross-service domain edges**: automatically derived and rendered as "implicit service-level edges" on the system view.
When multiple domain edges aggregate to the same service pair, the edge label reads `"N domain edges"`.

Implicit edges are automatically tagged with `[implicit]`. By default they are rendered as an amber dashed line.
If an explicit service-level edge already exists in the same direction, the implicit edge is not derived.

See [`docs/spec/tags-annotations.md`](tags-annotations.md) for the full list of available tags and styles.

---

## Writing physical diagrams

```
// deploy.krs
deploy "production" {

  war "order.war" {
    runtime  "Tomcat 9"
    realizes ECommerce
  }

  oci "inventory-service" {
    image    "inventory:2.1.0"
    runtime  "Node.js 20"
    realizes Inventory
  }

  assets "storefront" {
    runtime  "CloudFront / S3"
    realizes Frontend
  }

  job "data-migration" {          // no schedule → one-shot execution
    runtime  "Python 3.12"
    realizes Migration
  }

  job "monthly-billing" {         // with schedule → recurring execution
    schedule "0 0 1 * *"
    runtime  "Java 21"
    realizes Billing
  }

  artifact "legacy-settlement" {  // when no built-in kind fits
    type     "mainframe-batch"
    runtime  "COBOL / z/OS"
    realizes Settlement
  }
}
```

`realizes` corresponds to UML's Realization relationship. The arrow points from physical (concrete) to logical (abstract).

Multiple `realizes` entries can be listed to express that a single deployment unit realizes more than one service.
In that case, the same node is drawn inside each service's container on the deploy diagram.

```
oci "monolith" {
  image    "monolith:1.0.0"
  realizes OrderService
  realizes InventoryService
}
```

---

## Writing organization diagrams

An `organization` block declares the hierarchy of organizations, teams, and members.
It is rendered as a separate "Org view," independent of the logical and physical diagrams.

```
organization TechCorp {
  label "TechCorp Engineering"

  team "ec-team" {
    label "EC Team"
    description "Team responsible for developing and operating the EC site"

    owns ECommerce
    owns Order
    owns Catalog

    member alice {
      label "Alice Yamamoto"
      description "Tech lead of the EC team"
      slack "@alice"
      github "alice-yamamoto"
    }
    member bob {
      label "Bob Tanaka"
      slack "@bob"
      github "bob-tanaka"
    }
  }

  team "platform-team" {
    label "Platform Team"

    team "infra" {
      label "Infrastructure"
      owns Kubernetes
      member dave { label "Dave Suzuki" }
    }
    team "security" {
      label "Security"
    }
  }
}
```

### team node

- `owns <id>` declares a logical node (service / domain, etc.) that the team owns. The same `id` cannot be `owns`-ed by multiple teams; duplicates produce an error.
- Teams can be nested — placing child teams under a parent team expresses organizational hierarchy.
- Team IDs must be unique within the same organization. Duplicates produce an error.
- During parsing, an `ownerIndex` (`node id → team id`) is built so that a logical-diagram node can look up its owner team.

### member node

`member` is declared directly under a `team` to describe an individual.

| Property | Syntax | Description |
|----------|--------|-------------|
| `label` | `label "<display-name>"` | Display name on the diagram |
| `description` | `description "<text>"` | Description of the member |
| `slack` | `slack "<handle>"` | Slack handle |
| `github` | `github "<username>"` | GitHub username |

All properties are optional. `member` cannot be nested.

### How to specify a label

`organization`, `team`, and `member` all support both a positional argument (`team backend "Backend Team"`) and the property form (`team backend { label "Backend Team" }`).
When both are specified, the property form takes precedence.

---

## Drill-down and external file references

Write with inline nesting first, then extract into separate files as things grow.

```
// Inline nesting (basic form)
system ECPlatform {
  label "EC Platform"
  service ECommerce {
    label "EC Site"
    domain Order { label "Orders" }
  }
}

// After extracting to an external file
import { ECommerce } from "ecommerce.krs"

system ECPlatform {
  label "EC Platform"
  service ECommerce
  service Payment [external] {
    label "Payment Service"
  }
  ECommerce -> Payment "Process payment"
}
```

---

## @import scope

- Applies to the entire file (global scope).
- Must be written at the top of the file.
- When the same selector is defined in multiple files, the last one wins (a warning is emitted).

---

## Property requirement and omission rules

All properties are optional. When omitted, a warning is emitted rather than an error.
This policy exists to tolerate a "not yet decided" state while iterating on the design.

| Property | Behavior when omitted |
|----------|----------------------|
| `runtime` | `⚠ runtime is not specified` warning |
| `realizes` | `⚠ realizes is not specified` warning (directly tied to the raison d'être of the physical diagram) |
| `schedule` | Treated as one-shot execution (no warning) |
| `image` (oci only) | Optional. Displayed on the diagram when specified |
| `type` (artifact only) | Optional. Displayed on the diagram when specified |

---

## Domain ID uniqueness

If the same `domain id` appears in multiple `service` blocks within the same `system`, the tool emits an error.

```
✖ Error: Domain id "Order" must be unique within a system; found in multiple services
```

Domain edges (`Billing -> Contract`) are resolved by domain ID, so the reference target becomes ambiguous if the ID is not unique.
This constraint prevents duplicate domain IDs within the same system.

**Detection scope**: per `system` block.
The same `domain` name across different `system` blocks is treated as intentionally independent parallel modeling and does not produce an error.

**Detection key**: the `id` of the `domain`. The `label` (display name) is not used for detection.
