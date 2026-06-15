// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render as rtlRender, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { ReferencePanel } from "./ReferencePanel.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

const defaultProps = { isOpen: true, onClose: vi.fn<() => void>() };

beforeEach(() => {
  // Reset onClose mock between tests
  defaultProps.onClose = vi.fn<() => void>();
});

// Dialog/Tabs are shadcn (Radix) primitives: content is portalled to
// document.body (query via `screen`, not the render container) and tabs
// activate on the full pointer sequence (use `userEvent`). See
// `.claude/rules/testing.md`.

/** The portalled `.reference-tab-body` text content. */
function bodyText(): string {
  return document.querySelector(".reference-tab-body")?.textContent ?? "";
}

async function clickTab(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

describe("ReferencePanel", () => {
  it("renders no dialog when isOpen is false", () => {
    render(<ReferencePanel isOpen={false} onClose={vi.fn<() => void>()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog with the Syntax tab active by default", () => {
    render(<ReferencePanel {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(bodyText()).toContain("Node Kinds");
  });

  it("clicking a tab shows that tab's content", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await clickTab("Styles");
    expect(bodyText()).toContain("Style Properties");
    // Syntax-only content is gone
    expect(bodyText()).not.toContain("Node Kinds");
  });

  // Esc / outside-click close is owned by Radix's DismissableLayer and is not
  // reliably modelled in jsdom — verified manually. We fence the Close button
  // wiring instead (the X in DialogContent maps onOpenChange(false) → onClose).
  it("clicking the Close button calls onClose", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("Syntax tab shows system node kinds by default", () => {
    render(<ReferencePanel {...defaultProps} />);
    const body = bodyText();
    expect(body).toContain("system");
    expect(body).toContain("service");
  });

  it("Syntax tab documents resource operations (CRUD) and the optional edge id", () => {
    render(<ReferencePanel {...defaultProps} />);
    const body = bodyText();
    expect(body).toContain("Resource Operations");
    expect(body).toContain("operations create, read");
    expect(body).toContain("enqueue:create"); // verb-decoration
    expect(body).toContain("#criticalWrite"); // optional edge id in the Edge Syntax block
  });

  it("Syntax tab shows deploy unit kinds when activeView=deploy", () => {
    render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    const body = bodyText();
    expect(body).toContain("oci");
    expect(body).toContain("jar");
    expect(body).toContain("lambda");
  });

  it("Syntax tab shows org kinds when activeView=org", () => {
    render(<ReferencePanel {...defaultProps} activeView="org" />);
    const body = bodyText();
    expect(body).toContain("organization");
    expect(body).toContain("team");
    expect(body).toContain("member");
  });

  it("Tags tab shows tags list for system view", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await clickTab("Tags & Annotations");
    const body = bodyText();
    expect(body).toContain("external");
    expect(body).toContain("deprecated");
  });

  it("Tags tab shows unsupported message for deploy view", async () => {
    render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    await clickTab("Tags & Annotations");
    expect(document.querySelector(".reference-unsupported")).toBeTruthy();
  });

  it("Tags tab shows unsupported message for org view", async () => {
    render(<ReferencePanel {...defaultProps} activeView="org" />);
    await clickTab("Tags & Annotations");
    expect(document.querySelector(".reference-unsupported")).toBeTruthy();
  });

  it("Styles tab lists the edge / layout style properties from the spec", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await clickTab("Styles");
    const body = bodyText();
    for (const prop of ["direction", "label-position", "label-offset", "column"]) {
      expect(body).toContain(prop);
    }
  });

  it("Styles tab includes the edge#<id> selector (specificity 101) and a direction example", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await clickTab("Styles");
    const edgeIdRow = Array.from(document.querySelectorAll(".reference-table tr")).find(
      (tr) => tr.querySelector("td")?.textContent === "Edge ID",
    );
    expect(edgeIdRow?.textContent).toContain("edge#criticalWrite");
    expect(edgeIdRow?.textContent).toContain("101");
    expect(bodyText()).toContain("direction: down"); // layout-direction hint example
  });

  it("Styles tab shows deploy selector examples when activeView=deploy", async () => {
    render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    await clickTab("Styles");
    expect(bodyText()).toContain("deploy diagram selectors");
  });

  it("Styles tab shows org selector examples when activeView=org", async () => {
    render(<ReferencePanel {...defaultProps} activeView="org" />);
    await clickTab("Styles");
    expect(bodyText()).toContain("org diagram selectors");
  });

  it("Built-in Theme tab notes it applies to all diagram types", async () => {
    render(<ReferencePanel {...defaultProps} activeView="deploy" />);
    await clickTab("Built-in Theme");
    expect(bodyText()).toContain("all diagram types");
  });

  it("Samples tab shows system+deploy+org content", async () => {
    render(<ReferencePanel {...defaultProps} />);
    await clickTab("Samples");
    const body = bodyText();
    expect(body).toContain("system");
    expect(body).toContain("deploy");
    expect(body).toContain("organization");
  });

  it("Copy button shows 'Copied!' after click and reverts after 2 seconds", async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<ReferencePanel {...defaultProps} />);
    // Navigate to the tab with real timers (Radix Tabs + userEvent don't mix
    // with fake timers); the revert-after-2s logic is exercised under fake
    // timers below.
    await userEvent.click(screen.getByRole("tab", { name: "Built-in Theme" }));

    const copyBtn = document.querySelector(".reference-copy-btn")!;
    expect(copyBtn.textContent).toBe("Copy");

    vi.useFakeTimers();
    // The copy control is a plain shadcn Button (not Radix), so fireEvent is fine.
    fireEvent.click(copyBtn);
    await act(async () => {}); // flush the resolved clipboard promise
    expect(copyBtn.textContent).toBe("Copied!");

    act(() => vi.advanceTimersByTime(2000));
    expect(copyBtn.textContent).toBe("Copy");

    vi.useRealTimers();
  });
});
