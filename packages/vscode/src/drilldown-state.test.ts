import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbHtml,
  drillDown,
  emptyDrilldownState,
  escapeHtml,
  navigateTo,
} from "./drilldown-state.js";

// Fences the drill-down breadcrumb state transitions of the preview panel
// (AT-0036-drilldown TC-04/05/06 state logic). These are the pure host-side
// reducers extracted from preview-panel.ts — no webview behavior is stubbed
// or simulated here (rule 3 of .claude/rules/vscode-webview-tests.md);
// rendering/interaction stays with the ExTester WebView harness.

describe("drillDown", () => {
  it("appends nodeId and resolves the last label (AT-0036-drilldown TC-02/03 state math)", () => {
    const s1 = drillDown(emptyDrilldownState(), "OrderService", {
      label: "Order Service",
    });
    expect(s1.viewPath).toEqual(["OrderService"]);
    expect(s1.viewLabels).toEqual(["Order Service"]);

    // Drill one level deeper: the intermediate segment keeps its raw id as
    // the label (only the clicked node's label is resolved), the last
    // segment gets the resolved label.
    const s2 = drillDown(s1, "OrderManagement", { label: "Order Management" });
    expect(s2.viewPath).toEqual(["OrderService", "OrderManagement"]);
    expect(s2.viewLabels).toEqual(["OrderService", "Order Management"]);
  });

  it("falls back to the raw nodeId as label when the node has no metadata", () => {
    const next = drillDown(emptyDrilldownState(), "Unknown", undefined);
    expect(next.viewPath).toEqual(["Unknown"]);
    expect(next.viewLabels).toEqual(["Unknown"]);
  });

  it("uses meta.viewPath prefix when present (system ID prefix from the index)", () => {
    // A node in the metadata index carries its full drill-down path,
    // including the system ID as the first segment — it replaces the
    // current path instead of appending to it.
    const state = drillDown(emptyDrilldownState(), "OrderService", {
      label: "Order Service",
      viewPath: ["ECommerce", "OrderService"],
    });
    expect(state.viewPath).toEqual(["ECommerce", "OrderService"]);
    expect(state.viewLabels).toEqual(["ECommerce", "Order Service"]);
  });

  it("does not mutate the previous state (TC-05: state survives re-renders untouched)", () => {
    const before = drillDown(emptyDrilldownState(), "A", { label: "Node A" });
    const snapshotPath = [...before.viewPath];
    const snapshotLabels = [...before.viewLabels];

    drillDown(before, "B", { label: "Node B" });
    navigateTo(before, 0);

    expect(before.viewPath).toEqual(snapshotPath);
    expect(before.viewLabels).toEqual(snapshotLabels);
  });
});

describe("navigateTo", () => {
  const drilled = () => {
    const s1 = drillDown(emptyDrilldownState(), "Sys", { label: "System" });
    const s2 = drillDown(s1, "Svc", { label: "Service" });
    return drillDown(s2, "Dom", { label: "Domain" });
  };

  it("slices path and labels to [0, index)", () => {
    const next = navigateTo(drilled(), 2);
    expect(next.viewPath).toEqual(["Sys", "Svc"]);
    // After the deeper drill into Dom, the Svc segment's label reverted to
    // its raw id (intermediate segments use ids; see drillDown), so the
    // sliced labels are ids too.
    expect(next.viewLabels).toEqual(["Sys", "Svc"]);
  });

  it("index 0 (Root crumb) resets to the empty path (AT-0036-drilldown TC-04)", () => {
    const next = navigateTo(drilled(), 0);
    expect(next.viewPath).toEqual([]);
    expect(next.viewLabels).toEqual([]);
  });

  it("index == path length is a no-op (current position crumb)", () => {
    const state = drilled();
    const next = navigateTo(state, state.viewPath.length);
    expect(next.viewPath).toEqual(state.viewPath);
    expect(next.viewLabels).toEqual(state.viewLabels);
  });
});

describe("emptyDrilldownState", () => {
  it("switchView / switchViewAndHighlight reset to it (AT-0036-drilldown TC-06)", () => {
    // Both message handlers in preview-panel.ts assign a fresh
    // emptyDrilldownState() when the view switches.
    const reset = emptyDrilldownState();
    expect(reset.viewPath).toEqual([]);
    expect(reset.viewLabels).toEqual([]);
  });

  it("returns a fresh object each call (no shared mutable arrays)", () => {
    const a = emptyDrilldownState();
    const b = emptyDrilldownState();
    a.viewPath.push("X");
    expect(b.viewPath).toEqual([]);
  });
});

describe("buildBreadcrumbHtml", () => {
  it("renders only a non-clickable Root at the top level (AT-0036-drilldown TC-01 state math)", () => {
    const html = buildBreadcrumbHtml([]);
    expect(html).toContain(">Root</button>");
    expect(html).not.toContain("data-nav-index");
    expect(html).not.toContain(`<span class="sep">`);
  });

  it("prepends Root and the last segment is not clickable", () => {
    const html = buildBreadcrumbHtml(["ECommerce", "Order Service"]);

    // Root and intermediate segments are clickable with their navigateTo index.
    expect(html).toContain(`<button data-nav-index="0">Root</button>`);
    expect(html).toContain(`<button data-nav-index="1">ECommerce</button>`);

    // The last segment (current position) is styled, not clickable.
    expect(html).toContain(">Order Service</button>");
    expect(html).not.toContain(`data-nav-index="2"`);

    // Separators appear between segments (2 for 3 segments).
    expect(html.match(/<span class="sep">›<\/span>/g)).toHaveLength(2);
  });

  it("escapes HTML in labels", () => {
    const html = buildBreadcrumbHtml([`<img src="x">`]);
    expect(html).toContain("&lt;img src=&quot;x&quot;&gt;");
    expect(html).not.toContain("<img");
  });
});

describe("escapeHtml", () => {
  it('escapes & < > " and leaves other characters alone', () => {
    expect(escapeHtml(`a & b < c > d " e' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e' f");
  });
});
