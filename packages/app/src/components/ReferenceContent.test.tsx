// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render as rtlRender, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { ReferenceContent } from "./ReferenceContent.js";
import { ReferenceWindow } from "./ReferenceWindow.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

// The reference content renders inline now (it lives in a dedicated window, not
// a portalled Dialog). Tabs are shadcn (Radix) — activate via userEvent.
function bodyText(): string {
  return document.querySelector(".reference-tab-body")?.textContent ?? "";
}

async function clickTab(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

describe("ReferenceContent", () => {
  it("shows the Syntax tab with system node kinds by default", () => {
    render(<ReferenceContent />);
    const body = bodyText();
    expect(body).toContain("Node Kinds");
    expect(body).toContain("service");
  });

  it("clicking a tab shows that tab's content", async () => {
    render(<ReferenceContent />);
    await clickTab("Styles");
    expect(bodyText()).toContain("Style Properties");
    expect(bodyText()).not.toContain("Node Kinds");
  });

  it("Syntax tab documents resource operations (CRUD) and the optional edge id", () => {
    render(<ReferenceContent />);
    const body = bodyText();
    expect(body).toContain("Resource Operations");
    expect(body).toContain("operations create, read");
    expect(body).toContain("enqueue:create");
    expect(body).toContain("#criticalWrite");
  });

  it("Syntax tab shows deploy unit kinds when activeView=deploy", () => {
    render(<ReferenceContent activeView="deploy" />);
    const body = bodyText();
    expect(body).toContain("oci");
    expect(body).toContain("jar");
    expect(body).toContain("lambda");
  });

  it("Syntax tab shows org kinds when activeView=org", () => {
    render(<ReferenceContent activeView="org" />);
    const body = bodyText();
    expect(body).toContain("organization");
    expect(body).toContain("team");
    expect(body).toContain("member");
  });

  it("Tags tab shows tags list for system view", async () => {
    render(<ReferenceContent />);
    await clickTab("Tags & Annotations");
    const body = bodyText();
    expect(body).toContain("external");
    expect(body).toContain("deprecated");
  });

  it("Tags tab shows unsupported message for non-system views", async () => {
    render(<ReferenceContent activeView="deploy" />);
    await clickTab("Tags & Annotations");
    expect(document.querySelector(".reference-unsupported")).toBeTruthy();
  });

  it("Styles tab lists the edge / layout style properties from the spec", async () => {
    render(<ReferenceContent />);
    await clickTab("Styles");
    const body = bodyText();
    for (const prop of ["direction", "label-position", "label-offset", "column"]) {
      expect(body).toContain(prop);
    }
  });

  it("Styles tab includes the edge#<id> selector (specificity 101) and a direction example", async () => {
    render(<ReferenceContent />);
    await clickTab("Styles");
    const edgeIdRow = Array.from(document.querySelectorAll(".reference-table tr")).find(
      (tr) => tr.querySelector("td")?.textContent === "Edge ID",
    );
    expect(edgeIdRow?.textContent).toContain("edge#criticalWrite");
    expect(edgeIdRow?.textContent).toContain("101");
    expect(bodyText()).toContain("direction: down");
  });

  it("Styles tab shows deploy selector examples when activeView=deploy", async () => {
    render(<ReferenceContent activeView="deploy" />);
    await clickTab("Styles");
    expect(bodyText()).toContain("deploy diagram selectors");
  });

  it("Styles tab shows org selector examples when activeView=org", async () => {
    render(<ReferenceContent activeView="org" />);
    await clickTab("Styles");
    expect(bodyText()).toContain("org diagram selectors");
  });

  it("Samples tab shows the all-views Getting Started sample for the system view", async () => {
    render(<ReferenceContent />);
    await clickTab("Samples");
    const body = bodyText();
    expect(body).toContain("system");
    expect(body).toContain("deploy");
    expect(body).toContain("organization");
  });

  it("Samples tab follows the active view (deploy → deploy-only, org → org-only)", async () => {
    const deploy = render(<ReferenceContent activeView="deploy" />);
    await clickTab("Samples");
    let body = bodyText();
    expect(body).toContain("deploy-only/index.krs");
    expect(body).toContain("order-handler");
    expect(body).not.toContain("organization Acme");
    deploy.unmount();

    render(<ReferenceContent activeView="org" />);
    await clickTab("Samples");
    body = bodyText();
    expect(body).toContain("org-only/index.krs");
    expect(body).toContain("organization Acme");
    expect(body).not.toContain("deploy Production");
  });

  it("Copy button shows 'Copied!' after click and reverts after 2 seconds", async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<ReferenceContent />);
    await userEvent.click(screen.getByRole("tab", { name: "Built-in Theme" }));

    const copyBtn = document.querySelector(".reference-copy-btn")!;
    expect(copyBtn.textContent).toBe("Copy");

    vi.useFakeTimers();
    fireEvent.click(copyBtn);
    await act(async () => {});
    expect(copyBtn.textContent).toBe("Copied!");
    act(() => vi.advanceTimersByTime(2000));
    expect(copyBtn.textContent).toBe("Copy");
    vi.useRealTimers();
  });
});

describe("ReferenceWindow", () => {
  const originalSearch = window.location.search;
  beforeEach(() => {
    window.history.replaceState({}, "", "/?reference=1&view=org");
  });
  afterEach(() => window.history.replaceState({}, "", originalSearch || "/"));

  it("seeds the view selector from the `view` query param", () => {
    render(<ReferenceWindow />);
    const select = screen.getByLabelText("Diagram view") as HTMLSelectElement;
    expect(select.value).toBe("org");
    expect(bodyText()).toContain("organization");
  });

  it("switching the view selector updates the reference content", async () => {
    render(<ReferenceWindow />);
    const select = screen.getByLabelText("Diagram view");
    await userEvent.selectOptions(select, "deploy");
    expect(bodyText()).toContain("oci");
  });

  it("falls back to system for an unknown/absent view param", () => {
    window.history.replaceState({}, "", "/?reference=1&view=matrix");
    render(<ReferenceWindow />);
    expect((screen.getByLabelText("Diagram view") as HTMLSelectElement).value).toBe("system");
  });
});
