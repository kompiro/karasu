import { describe, it, expect } from "vitest";
import type { Warning, WarningKind } from "@karasu-tools/core";
import { renderWarning, type TranslateFn } from "./render-warning.js";
import { translate } from "./translate.js";
import type { Locale } from "./locale.js";

// One sample `Warning` per `WarningKind`. The `Record<WarningKind, Warning>`
// type forces this map to stay exhaustive: adding a new kind to the union
// without a sample here is a compile error, and dropping any branch from
// the formatter switch (or forgetting to add one) is caught by the
// per-kind tests below.
const SAMPLES: Record<WarningKind, Warning> = {
  "domain-dispersal": {
    kind: "domain-dispersal",
    params: { domainId: "Orders", services: ["ServiceA", "ServiceB"] },
  },
  "style-conflict": {
    kind: "style-conflict",
    params: { selector: ".node", sheetIndices: [0, 1] },
  },
  "missing-runtime": { kind: "missing-runtime", params: { nodeId: "ApiUnit" } },
  "missing-realizes": { kind: "missing-realizes", params: { nodeId: "ApiUnit" } },
  "unresolved-realizes": {
    kind: "unresolved-realizes",
    params: { deployNodeId: "ApiUnit", deployBlockId: "Prod", target: "MissingSvc" },
  },
  "invalid-owns": {
    kind: "invalid-owns",
    params: { teamId: "Platform", ownedId: "MissingSvc" },
  },
  "deprecated-team-property": {
    kind: "deprecated-team-property",
    params: { nodeId: "OrderService", ownerTeamId: "Platform" },
  },
  "unassigned-domain": {
    kind: "unassigned-domain",
    params: { domainId: "Orders", label: "Orders Domain" },
  },
  "unassigned-service": {
    kind: "unassigned-service",
    params: { serviceId: "OrderService" },
  },
  "unassigned-client": {
    kind: "unassigned-client",
    params: { clientId: "WebApp" },
  },
  "unresolved-handles": {
    kind: "unresolved-handles",
    params: { nodeId: "WebApp", nodeKind: "client", domainId: "Orders" },
  },
  "unassigned-database": {
    kind: "unassigned-database",
    params: { databaseId: "OrderDB" },
  },
  "unassigned-queue": { kind: "unassigned-queue", params: { queueId: "EventBus" } },
  "unassigned-storage": { kind: "unassigned-storage", params: { storageId: "Assets" } },
  "unassigned-usecase": { kind: "unassigned-usecase", params: { usecaseId: "PlaceOrder" } },
  "cross-system-ref-implicit-external": {
    kind: "cross-system-ref-implicit-external",
    params: {
      ref: "Other.Svc",
      sourceSystemId: "Mine",
      sourceNodeId: "Caller",
      targetSystemId: "Other",
    },
  },
  "cross-system-ref-unresolved": {
    kind: "cross-system-ref-unresolved",
    params: { ref: "Missing.Svc" },
  },
  "cyclic-dependency": {
    kind: "cyclic-dependency",
    params: { cyclePath: ["A", "B", "A"] },
  },
  "delivers-target-not-client": {
    kind: "delivers-target-not-client",
    params: { serviceId: "BFF", targetId: "OrderService" },
  },
  "client-capability-duplicate": {
    kind: "client-capability-duplicate",
    params: { clientId: "WebApp", name: "camera" },
  },
  "legend-ref-unresolved": {
    kind: "legend-ref-unresolved",
    params: { target: "@missing", legendTitle: "Tags" },
  },
  "style-column-invalid-value": {
    kind: "style-column-invalid-value",
    params: { nodeId: "OrderService", value: "centre" },
  },
  "style-column-ignored-non-system-view": {
    kind: "style-column-ignored-non-system-view",
    params: { nodeId: "OrderUnit", viewType: "deploy" },
  },
  "style-invalid-enum-value": {
    kind: "style-invalid-enum-value",
    params: { property: "direction", value: "dwon", allowed: ["auto", "up", "down"] },
  },
  "style-invalid-hex-color": {
    kind: "style-invalid-hex-color",
    params: { property: "color", value: "#zzzz" },
  },
  "style-missing-length-unit": {
    kind: "style-missing-length-unit",
    params: { property: "stroke-width", value: "1.5", allowedUnits: ["px"] },
  },
  "style-invalid-length-unit": {
    kind: "style-invalid-length-unit",
    params: { property: "stroke-width", value: "1.5em", unit: "em", allowedUnits: ["px"] },
  },
  "style-out-of-range": {
    kind: "style-out-of-range",
    params: { property: "opacity", value: 1.5, min: 0, max: 1 },
  },
  "style-unknown-property": {
    kind: "style-unknown-property",
    params: { property: "color2" },
  },
};

// Identifying fields that should appear verbatim in the rendered message,
// per WarningKind. The renderer is free to add surrounding prose, but the
// id/target the user needs to find in their source must be present.
const IDENTIFIERS: Record<WarningKind, string[]> = {
  "domain-dispersal": ["Orders"],
  "style-conflict": [".node"],
  "missing-runtime": ["ApiUnit"],
  "missing-realizes": ["ApiUnit"],
  "unresolved-realizes": ["ApiUnit", "MissingSvc"],
  "invalid-owns": ["Platform", "MissingSvc"],
  "deprecated-team-property": ["OrderService"],
  "unassigned-domain": ["Orders Domain"],
  "unassigned-service": ["OrderService"],
  "unassigned-client": ["WebApp"],
  "unresolved-handles": ["WebApp", "Orders"],
  "unassigned-database": ["OrderDB"],
  "unassigned-queue": ["EventBus"],
  "unassigned-storage": ["Assets"],
  "unassigned-usecase": ["PlaceOrder"],
  "cross-system-ref-implicit-external": ["Other.Svc"],
  "cross-system-ref-unresolved": ["Missing.Svc"],
  "cyclic-dependency": ["A", "B"],
  "delivers-target-not-client": ["BFF", "OrderService"],
  "client-capability-duplicate": ["WebApp", "camera"],
  "legend-ref-unresolved": ["@missing"],
  "style-column-invalid-value": ["OrderService", "centre"],
  "style-column-ignored-non-system-view": ["OrderUnit"],
  "style-invalid-enum-value": ["direction", "dwon"],
  "style-invalid-hex-color": ["color", "#zzzz"],
  "style-missing-length-unit": ["stroke-width", "1.5"],
  "style-invalid-length-unit": ["stroke-width", "em"],
  "style-out-of-range": ["opacity", "1.5"],
  "style-unknown-property": ["color2"],
};

const localeTranslator = (locale: Locale): TranslateFn =>
  ((key: Parameters<TranslateFn>[0], params?: unknown) =>
    translate(locale, key, params)) as TranslateFn;

const PLACEHOLDER = /\{\{[^}]+\}\}/;

describe("renderWarning — i18n coverage for every WarningKind", () => {
  const kinds = Object.keys(SAMPLES) as WarningKind[];

  for (const kind of kinds) {
    const sample = SAMPLES[kind];
    const identifiers = IDENTIFIERS[kind];

    describe(`kind: ${kind}`, () => {
      it("renders a non-empty en message with no unresolved placeholders", () => {
        const out = renderWarning(sample, localeTranslator("en"));
        expect(out.message.trim().length).toBeGreaterThan(0);
        expect(out.message).not.toMatch(PLACEHOLDER);
        for (const detail of out.details) {
          expect(detail.trim().length).toBeGreaterThan(0);
          expect(detail).not.toMatch(PLACEHOLDER);
        }
      });

      it("renders a non-empty ja message with no unresolved placeholders", () => {
        const out = renderWarning(sample, localeTranslator("ja"));
        expect(out.message.trim().length).toBeGreaterThan(0);
        expect(out.message).not.toMatch(PLACEHOLDER);
        for (const detail of out.details) {
          expect(detail.trim().length).toBeGreaterThan(0);
          expect(detail).not.toMatch(PLACEHOLDER);
        }
      });

      it("ja message differs from en (catches a missing ja translation falling through)", () => {
        const en = renderWarning(sample, localeTranslator("en")).message;
        const ja = renderWarning(sample, localeTranslator("ja")).message;
        expect(ja).not.toBe(en);
      });

      it("the rendered en message surfaces the identifying field(s)", () => {
        const out = renderWarning(sample, localeTranslator("en"));
        for (const id of identifiers) {
          expect(out.message).toContain(id);
        }
      });

      it("the rendered ja message surfaces the identifying field(s)", () => {
        const out = renderWarning(sample, localeTranslator("ja"));
        for (const id of identifiers) {
          expect(out.message).toContain(id);
        }
      });
    });
  }
});
