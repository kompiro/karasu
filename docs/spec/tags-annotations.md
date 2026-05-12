# Tags and Annotations Reference

> **English** (this file) · [日本語](tags-annotations.ja.md)

## Tags (`[...]`)

Tags declare **architectural meaning**. Styles change in response to tags.
A tag is a semantic declaration, not a direct appearance override. Visual control is handled in `.krs.style`.

<!-- gen:reference:tags — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Tag | Meaning | Effect on default rendering |
|-----|---------|-----------------------------|
| `[external]` | Outside the system boundary | Dashed border, gray-toned color |
| `[async]` | Asynchronous communication (for edges) | Dashed arrow |
| `[sync]` | Synchronous communication (for edges, default) | Solid arrow (default) |
| `[human]` | A human user | Used only on user nodes. No effect on default style |
| `[ai]` | An AI agent | Used only on user nodes. No effect on default style |
| `[mobile]` | Mobile native app (client) | Recognized form-factor tag for `client` nodes |
| `[web]` | Browser SPA (client) | Recognized form-factor tag for `client` nodes |
| `[desktop]` | Desktop app (client) | Recognized form-factor tag for `client` nodes |
| `[cli]` | Command-line tool / SDK (client) | Recognized form-factor tag for `client` nodes |
| `[device]` | IoT / dedicated terminal / KIOSK (client) | Recognized form-factor tag for `client` nodes |
| `[extension]` | Host-app plugin — Chrome / VS Code / Figma, etc. (client) | Recognized form-factor tag for `client` nodes |
| `[embed]` | Widget / SDK embedded in third-party sites (client) | Recognized form-factor tag for `client` nodes |
| `[table]` | Table-like resource (shape: cylinder) | Rendered as a cylinder shape |
| `[queue]` | Queue-like resource (shape: queue) | Rendered as a queue shape |
| `[api]` | API-like resource (shape: hexagon) | Rendered as a hexagon shape |
| `[storage]` | Storage-like resource (shape: cloud) | Rendered as a cloud shape |
<!-- /gen:reference:tags -->

> The seven `client` form-factor tags are **recognized** by karasu — future versions trigger kind-specific icons (Phase 2 of #823) and layout hints (Phase 6). Tags outside this list are still allowed on `client` and behave as ordinary user-defined tags.

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

<!-- gen:reference:annotations — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| Annotation | Meaning | Default rendering |
|------------|---------|-------------------|
| `@deprecated` | Slated for removal | ⚠ badge, node rendered semi-transparent |
| `@new` | Newly added | ✦ badge |
| `@experimental` | Experimental | ⚗ badge |
| `@migration_target` | Migration target | → badge |
<!-- /gen:reference:annotations -->

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

## Client capabilities

`capability <name>` declares a **device or browser capability** the client requests permission to use. See [`docs/spec/syntax.md`](./syntax.md#client-capability) for the syntax.

The identifier set is **open** — any kebab-case identifier is accepted, no warnings are emitted for names outside the recommended set, and authors can express domain-specific capabilities (industry devices, internal-only features) freely. The recommended set below covers the cases the validator and editor tooling expect to see most often.

### Recommended capability identifiers

| Group | Identifiers |
|-------|-------------|
| Web / browser | `camera`, `microphone`, `geolocation`, `notification`, `push`, `clipboard`, `webauthn`, `bluetooth`, `usb`, `midi`, `screen-wake-lock`, `accelerometer`, `gyroscope`, `storage-access` |
| Mobile (additional) | `contacts`, `calendar`, `photo-library`, `face-id`, `touch-id`, `background-processing`, `local-network`, `bluetooth-le-peripheral` |
| Desktop (additional) | `file-system-access`, `global-shortcuts`, `auto-launch`, `screen-recording` |
| IoT / device (additional) | `gpio`, `serial`, `zigbee`, `lora`, `nfc`, `rfid` |

### Naming conventions

- Use **kebab-case** (`screen-wake-lock`, `face-id`).
- Prefer the Web Permissions API / W3C name when one exists (`geolocation`, `notification`).
- Avoid OS-specific identifiers (`android.permission.CAMERA`); use the abstract feature name.
- For names outside the recommended set, attach a `description` so other readers understand what the capability covers.

### What `capability` is NOT

| Concept | Where it lives |
|---------|----------------|
| Operation-tied storage (`localStorage`, `indexedDB`, `keychain`) | `resource <storageKind> "<name>"` |
| HTTP session / authentication credentials | Separate vocabulary, tracked under #834 |
| Runtime authorization (RBAC permission bundles, license / feature flag gates) | Not modelled in karasu — see [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md). The `user.role` property is an actor-archetype label, not an authz primitive — see [ADR-20260511-04](../adr/20260511-04-user-role-keyword-clarification.md) |

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
| `[write]` | A synthesized usecase→resource edge whose target resource declares any of `create` / `update` / `delete` in its `operations` | `stroke-width: 2`, label `"W"` |
| `[read]` | A synthesized usecase→resource edge classified as read-only (no write verbs, or `operations` omitted) | `stroke-width: 1.5` (default), label `"R"` |

> `[implicit]` uses color (amber) to signal "derived," while the line style distinguishes sync from async.
> When both sync and async domain edges exist between the same service pair, they are derived as separate implicit edges, one per kind.
>
> `[write]` / `[read]` are auto-injected on synthesized usecase→resource edges only. **Do not write them by hand on explicit edges** — the resolver will accept them syntactically, but the semantics (write-dominates classification of the target resource's `operations`) only make sense for the synthesized edges. The width hierarchy is intentionally `read (1.5) < write (2) < cyclic (2.5)` so that cyclic remains the most attention-grabbing axis.

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
