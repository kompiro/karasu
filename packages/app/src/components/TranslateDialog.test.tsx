// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { TranslateDialog } from "./TranslateDialog.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** Sets the source textarea content. */
function typeSource(text: string) {
  fireEvent.change(screen.getByLabelText("Source content"), { target: { value: text } });
}

function clickTranslate() {
  fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
}

describe("TranslateDialog", () => {
  it("renders nothing while closed", () => {
    render(<TranslateDialog open={false} onClose={() => {}} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("translates a docker-compose file into a deploy block", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("services:\n  order-service:\n    image: order-service:1.0.0\n");
    clickTranslate();

    const output = (await screen.findByLabelText("Generated .krs")) as HTMLTextAreaElement;
    expect(output.value).toContain('deploy "compose" {');
    expect(output.value).toContain('oci "order-service" {');
    // kebab-case name resolves to a PascalCase service via the naming heuristic.
    expect(output.value).toContain("realizes OrderService");
  });

  it("surfaces warnings for an unresolved realizes", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("services:\n  app:\n    image: app:1.0.0\n");
    clickTranslate();

    await screen.findByLabelText("Generated .krs");
    expect(screen.getByText(/Could not resolve realizes for "app"/)).not.toBeNull();
  });

  it("shows an error and does not crash on invalid input", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("{ invalid yaml: [");
    clickTranslate();

    expect(await screen.findByText(/Failed to parse docker-compose file/)).not.toBeNull();
    expect(screen.queryByLabelText("Generated .krs")).toBeNull();
  });

  it("translates an OpenAPI spec wrapped in a system block", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "openapi" } });
    typeSource("openapi: 3.0.0\ninfo:\n  title: Orders\npaths:\n  /orders:\n    get: {}\n");
    fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Orders" } });
    clickTranslate();

    const output = (await screen.findByLabelText("Generated .krs")) as HTMLTextAreaElement;
    expect(output.value.startsWith("system Orders {")).toBe(true);
    expect(output.value).toContain("service Orders {");
  });

  it("copies the generated .krs to the clipboard", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("services:\n  api:\n    image: api:1.0.0\n");
    clickTranslate();
    await screen.findByLabelText("Generated .krs");

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('deploy "compose" {');
    vi.unstubAllGlobals();
  });

  it("clears a stale result when the input changes", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("services:\n  api:\n    image: api:1.0.0\n");
    clickTranslate();
    await screen.findByLabelText("Generated .krs");

    typeSource("services:\n  api:\n    image: api:2.0.0\n");
    expect(screen.queryByLabelText("Generated .krs")).toBeNull();
  });
});
