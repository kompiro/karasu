// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { LocaleProvider } from "../i18n/index.js";
import type { NodeMetadata } from "@karasu-tools/core";
import { clearRegistry, registerBuiltinShapes, loadAndRegisterIcon } from "@karasu-tools/core";

function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

// Minimal icon SVG with krs-pictogram for testing pictogram rendering
const MINIMAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
  <g class="krs-pictogram" transform="translate(6, 4)">
    <rect width="20" height="20" fill="{{color}}"/>
  </g>
  <text class="krs-label" x="30" y="19" text-anchor="start"/>
  <text class="krs-description" x="8" y="44" text-anchor="start"/>
</svg>`;

// Plain SVG without krs-pictogram group
const PLAIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="red"/>
</svg>`;

afterEach(cleanup);

// Reset icon registry before each test so icon registration state is predictable
beforeEach(() => {
  clearRegistry();
  registerBuiltinShapes();
});

function baseMetadata(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    kind: "service",
    label: "My Service",
    description: "",
    links: [],
    tags: [],
    annotations: [],
    hasChildren: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<NodeMetadata> = {}) {
  return {
    nodeId: "test-node",
    metadata: baseMetadata(overrides),
    anchorX: 0,
    anchorY: 0,
    onClose: vi.fn<() => void>(),
  };
}

describe("NodeDetailPanel", () => {
  it("renders markdown description as HTML", () => {
    const { container } = render(
      <NodeDetailPanel {...baseProps({ description: "**bold text**" })} />,
    );
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold text");
  });

  // Regression guards for marked v18 parser changes (trailing-blank trim on
  // block tokens, GFM table newline handling, heading/definition newline
  // handling, indented code block blank-line handling). See ADR #773.
  it("renders GFM tables without swallowing trailing newlines", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n\nafter";
    const { container } = render(<NodeDetailPanel {...baseProps({ description: md })} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("td")?.textContent).toBe("1");
    expect(container.querySelector(".node-detail-description")?.textContent).toContain("after");
  });

  it("renders headings followed by blank lines", () => {
    const md = "# heading\n\n\nbody paragraph";
    const { container } = render(<NodeDetailPanel {...baseProps({ description: md })} />);
    expect(container.querySelector("h1")?.textContent).toBe("heading");
    expect(container.querySelector("p")?.textContent).toBe("body paragraph");
  });

  it("renders indented code blocks with embedded blank lines", () => {
    const md = "    line one\n\n    line three\n";
    const { container } = render(<NodeDetailPanel {...baseProps({ description: md })} />);
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("line one");
    expect(code?.textContent).toContain("line three");
  });

  it("sanitizes XSS in description — <script> tag is removed", () => {
    const { container } = render(
      <NodeDetailPanel {...baseProps({ description: "<script>alert(1)</script>safe text" })} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".node-detail-description")?.textContent).toContain("safe text");
  });

  it("click inside the panel does not propagate to parent", () => {
    const outerClick = vi.fn<() => void>();
    const { container } = render(
      <div onClick={outerClick}>
        <NodeDetailPanel {...baseProps()} />
      </div>,
    );
    fireEvent.click(container.querySelector(".node-detail-panel")!);
    expect(outerClick).not.toHaveBeenCalled();
  });

  it("clicking the Close button calls onClose", () => {
    const props = baseProps();
    const { getByRole } = render(<NodeDetailPanel {...props} />);
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("renders deploy navigation button when hasDeployContainer is true", () => {
    const onNavigateToDeploy = vi.fn<() => void>();
    const onClose = vi.fn<() => void>();
    const { getByText } = render(
      <NodeDetailPanel
        {...baseProps({ hasDeployContainer: true })}
        onClose={onClose}
        onNavigateToDeploy={onNavigateToDeploy}
      />,
    );
    const btn = getByText(/View in Deploy diagram/);
    fireEvent.click(btn);
    expect(onNavigateToDeploy).toHaveBeenCalledWith("test-node");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render deploy button when hasDeployContainer is false", () => {
    const { queryByText } = render(
      <NodeDetailPanel {...baseProps({ hasDeployContainer: false })} />,
    );
    expect(queryByText(/View in Deploy diagram/)).toBeNull();
  });

  it("renders org navigation button when team is set and onNavigateToOrg is provided", () => {
    const onNavigateToOrg = vi.fn<() => void>();
    const onClose = vi.fn<() => void>();
    const { getByText } = render(
      <NodeDetailPanel
        {...baseProps({ team: "ec-team" })}
        onClose={onClose}
        onNavigateToOrg={onNavigateToOrg}
      />,
    );
    const btn = getByText(/ec-team/);
    fireEvent.click(btn);
    expect(onNavigateToOrg).toHaveBeenCalledWith("ec-team");
    expect(onClose).toHaveBeenCalled();
  });

  it("link section title is '🔗 Links'", () => {
    const dummyLoc = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 30, offset: 29 },
    };
    const { getByText } = render(
      <NodeDetailPanel
        {...baseProps({ links: [{ url: "https://example.com", loc: dummyLoc }] })}
      />,
    );
    expect(getByText("🔗 Links")).not.toBeNull();
  });

  // Defense in depth for #1525: the parser drops unsafe links, but if one ever
  // reaches the panel (older compiled metadata, future bypass) it must not be
  // rendered as a clickable href — React does not block javascript: URLs.
  it("does not render a link whose URL has a disallowed scheme (#1525)", () => {
    const dummyLoc = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 30, offset: 29 },
    };
    const { container, queryByText, getByText } = render(
      <NodeDetailPanel
        {...baseProps({
          links: [
            { url: "https://example.com", label: "safe", loc: dummyLoc },
            { url: "javascript:alert(1)", label: "evil", loc: dummyLoc },
          ],
        })}
      />,
    );
    expect(getByText(/safe/)).not.toBeNull();
    expect(queryByText(/evil/)).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("javascript:"))).toBe(false);
  });

  it("renders 'Jump to editor' button when onJumpToEditor is provided", () => {
    const onJumpToEditor = vi.fn<() => void>();
    const { getByText } = render(
      <NodeDetailPanel {...baseProps()} onJumpToEditor={onJumpToEditor} />,
    );
    expect(getByText(/Jump to editor/)).not.toBeNull();
  });

  it("does not render 'Jump to editor' button when onJumpToEditor is not provided", () => {
    const { queryByText } = render(<NodeDetailPanel {...baseProps()} />);
    expect(queryByText(/Jump to editor/)).toBeNull();
  });

  it("clicking 'Jump to editor' calls onJumpToEditor", () => {
    const onJumpToEditor = vi.fn<() => void>();
    const { getByText } = render(
      <NodeDetailPanel {...baseProps()} onJumpToEditor={onJumpToEditor} />,
    );
    fireEvent.click(getByText(/Jump to editor/));
    expect(onJumpToEditor).toHaveBeenCalledOnce();
  });
});

describe("NodeDetailPanel — pictogram icon", () => {
  it("renders inline SVG pictogram when icon with krs-pictogram is registered", () => {
    // Register "service" icon — KIND_TO_ICON_NAME["service"] = "service"
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).not.toBeNull();
  });

  it("rendered pictogram SVG has viewBox 0 0 20 20", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const svg = container.querySelector(".node-detail-icon svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 20 20");
  });

  it("rendered pictogram SVG has width and height of 18", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const svg = container.querySelector(".node-detail-icon svg");
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("height")).toBe("18");
  });

  it("pictogram contains the krs-pictogram path content (rect from MINIMAL_ICON_SVG)", () => {
    loadAndRegisterIcon("service", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("rect")).not.toBeNull();
  });

  it("falls back to '■' when icon has no krs-pictogram group", () => {
    // PLAIN_ICON_SVG has no <g class="krs-pictogram">, so pictogramBody is undefined
    loadAndRegisterIcon("service", PLAIN_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("■");
  });

  it("falls back to '■' when icon is not registered (no entry in registry)", () => {
    // No "service" icon registered → renderPictogram returns undefined
    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "service" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("■");
  });

  it("shows '🏗' emoji for 'system' kind (not in KIND_TO_ICON_NAME, uses KIND_FALLBACK_ICONS)", () => {
    // "system" has no entry in KIND_TO_ICON_NAME, so falls back to KIND_FALLBACK_ICONS["system"]
    const { container } = render(
      <NodeDetailPanel {...baseProps({ kind: "system" as NodeMetadata["kind"] })} />,
    );
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).toBeNull();
    expect(iconEl?.textContent).toBe("🏗");
  });

  it("renders user-card icon for 'user' kind (KIND_TO_ICON_NAME mapping)", () => {
    // KIND_TO_ICON_NAME["user"] = "user-card" — ensures correct mapping is used
    loadAndRegisterIcon("user-card", MINIMAL_ICON_SVG, true);

    const { container } = render(<NodeDetailPanel {...baseProps({ kind: "user" })} />);
    const iconEl = container.querySelector(".node-detail-icon");
    expect(iconEl?.querySelector("svg")).not.toBeNull();
  });

  describe("annotation diff section (Issue #738)", () => {
    it("renders +/- rows when annotationDiff is provided", () => {
      const { container } = render(
        <NodeDetailPanel
          {...baseProps()}
          annotationDiff={{ added: ["deprecated"], removed: ["experimental"] }}
        />,
      );
      const items = container.querySelectorAll(".node-detail-annotation-diff-list li");
      expect(items).toHaveLength(2);
      expect(items[0].getAttribute("data-diff-state")).toBe("added");
      expect(items[0].textContent).toContain("@deprecated");
      expect(items[1].getAttribute("data-diff-state")).toBe("removed");
      expect(items[1].textContent).toContain("@experimental");
    });

    it("omits the annotation diff section when both lists are empty", () => {
      const { container } = render(
        <NodeDetailPanel {...baseProps()} annotationDiff={{ added: [], removed: [] }} />,
      );
      expect(container.querySelector(".node-detail-annotation-diff")).toBeNull();
    });

    it("does not render the annotation diff section outside diff mode", () => {
      const { container } = render(<NodeDetailPanel {...baseProps()} />);
      expect(container.querySelector(".node-detail-annotation-diff")).toBeNull();
    });
  });

  describe("storage resources section (Issue #914)", () => {
    it("lists every client.resource entry in declaration order", () => {
      const { container } = render(
        <NodeDetailPanel
          {...baseProps({
            kind: "client",
            resources: [
              {
                storageKind: "localStorage",
                name: "preferences",
                loc: {
                  start: { line: 1, column: 1, offset: 0 },
                  end: { line: 1, column: 1, offset: 0 },
                },
              },
              {
                storageKind: "indexedDB",
                name: "outbox",
                loc: {
                  start: { line: 2, column: 1, offset: 0 },
                  end: { line: 2, column: 1, offset: 0 },
                },
              },
              {
                storageKind: "keychain",
                name: "session-key",
                loc: {
                  start: { line: 3, column: 1, offset: 0 },
                  end: { line: 3, column: 1, offset: 0 },
                },
              },
            ],
          })}
        />,
      );
      const items = container.querySelectorAll(".node-detail-resource-item");
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toContain("localStorage");
      expect(items[0].textContent).toContain("preferences");
      expect(items[1].textContent).toContain("indexedDB");
      expect(items[2].textContent).toContain("keychain");
    });

    it("omits the section when the client has no resources", () => {
      const { container } = render(
        <NodeDetailPanel {...baseProps({ kind: "client", resources: [] })} />,
      );
      expect(container.querySelector(".node-detail-resource-list")).toBeNull();
    });

    it("omits the section for non-client kinds even if resources is undefined", () => {
      const { container } = render(<NodeDetailPanel {...baseProps()} />);
      expect(container.querySelector(".node-detail-resource-list")).toBeNull();
    });
  });

  describe("capabilities section (#837)", () => {
    const loc = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    };

    it("uses label as the primary title when present, falling back to name", () => {
      const { container } = render(
        <NodeDetailPanel
          {...baseProps({
            kind: "client",
            capabilities: [
              { name: "notification", loc },
              {
                name: "camera",
                label: "QR scanning",
                description: "Used to scan QR codes",
                loc,
              },
              { name: "geolocation", description: "Continuous tracking", loc },
            ],
          })}
        />,
      );
      const items = container.querySelectorAll(".node-detail-capability-item");
      expect(items).toHaveLength(3);
      // notification: no label → name shown as title
      expect(items[0].querySelector(".node-detail-capability-title")?.textContent).toBe(
        "notification",
      );
      // camera: label replaces name
      expect(items[1].querySelector(".node-detail-capability-title")?.textContent).toBe(
        "QR scanning",
      );
      expect(items[1].textContent).not.toContain("camera");
      expect(items[1].querySelector(".node-detail-capability-description")?.textContent).toBe(
        "Used to scan QR codes",
      );
      // geolocation: no label, description present
      expect(items[2].querySelector(".node-detail-capability-title")?.textContent).toBe(
        "geolocation",
      );
      expect(items[2].querySelector(".node-detail-capability-description")?.textContent).toBe(
        "Continuous tracking",
      );
    });

    it("omits the section when the client has no capabilities", () => {
      const { container } = render(
        <NodeDetailPanel {...baseProps({ kind: "client", capabilities: [] })} />,
      );
      expect(container.querySelector(".node-detail-capability-list")).toBeNull();
    });

    it("omits the section for non-client kinds", () => {
      const { container } = render(<NodeDetailPanel {...baseProps()} />);
      expect(container.querySelector(".node-detail-capability-list")).toBeNull();
    });

    // Regression guard for #1032: reopening the panel on the same nodeId
    // after the source has been edited (and metadata recomputed) must
    // surface the new capabilities. A future refactor of the metadata
    // pipeline that memoizes on `nodeId` alone — rather than on metadata
    // identity — would silently re-introduce the staleness.
    // Mirrors useSystemView.test.tsx (#891) at the panel layer.
    it("refreshes capabilities when reopened on same node after metadata update (#1032)", () => {
      const propsWith = (caps: { name: string; loc: typeof loc }[]) => ({
        ...baseProps({ kind: "client", capabilities: caps }),
        // Keep nodeId stable across renders to exercise the same-node path.
        nodeId: "client-1",
      });
      const { container, rerender } = render(
        <NodeDetailPanel {...propsWith([{ name: "notification", loc }])} />,
      );
      let items = container.querySelectorAll(".node-detail-capability-item");
      expect(items).toHaveLength(1);
      expect(items[0].querySelector(".node-detail-capability-title")?.textContent).toBe(
        "notification",
      );

      // Same nodeId, recomputed metadata with an additional capability.
      // `rerender` from RTL replaces the entire tree, so re-wrap with
      // LocaleProvider explicitly here.
      rerender(
        <LocaleProvider initialLocale="en">
          <NodeDetailPanel
            {...propsWith([
              { name: "notification", loc },
              { name: "camera", loc },
            ])}
          />
        </LocaleProvider>,
      );
      items = container.querySelectorAll(".node-detail-capability-item");
      expect(items).toHaveLength(2);
      expect(items[1].querySelector(".node-detail-capability-title")?.textContent).toBe("camera");
    });
  });

  // #1595 — surface interpreted migration-intent params (until / from).
  describe("migration intent", () => {
    it("shows a machine-usable until value with its kind", () => {
      const { container } = render(
        <NodeDetailPanel
          {...baseProps({
            migrationIntent: {
              until: {
                kind: "machine",
                precision: "quarter",
                sortKey: "2026-07-01",
                raw: "2026-Q3",
              },
              untilAnnotation: "deprecated",
            },
          })}
        />,
      );
      const until = container.querySelector(".node-detail-migration-until");
      expect(until).not.toBeNull();
      expect(until?.getAttribute("data-until-kind")).toBe("machine");
      expect(until?.querySelector("code")?.textContent).toBe("2026-Q3");
    });

    it("shows an opaque until value verbatim and marks it opaque", () => {
      const { container } = render(
        <NodeDetailPanel
          {...baseProps({
            migrationIntent: {
              until: { kind: "opaque", raw: "sometime next year" },
              untilAnnotation: "deprecated",
            },
          })}
        />,
      );
      const until = container.querySelector(".node-detail-migration-until");
      expect(until?.getAttribute("data-until-kind")).toBe("opaque");
      expect(until?.querySelector("code")?.textContent).toBe("sometime next year");
    });

    it("shows the migration source (from)", () => {
      const { container } = render(
        <NodeDetailPanel {...baseProps({ migrationIntent: { from: "LegacyMonolith" } })} />,
      );
      const from = container.querySelector(".node-detail-migration-from");
      expect(from?.querySelector("code")?.textContent).toBe("LegacyMonolith");
    });

    it("renders no migration section when the node carries no intent", () => {
      const { container } = render(<NodeDetailPanel {...baseProps()} />);
      expect(container.querySelector(".node-detail-migration")).toBeNull();
    });
  });
});
