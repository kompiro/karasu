// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, fireEvent, cleanup, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { LocaleProvider } from "../i18n/index.js";
import { TranslateDialog } from "./TranslateDialog.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// TranslateDialog calls useTranslation, so every render needs a LocaleProvider.
// Default to English — the assertions below match the `en` strings.
function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

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

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn<() => void>();
    render(<TranslateDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("TranslateDialog — format-specific advanced options", () => {
  /** Open the <details> Advanced options panel. */
  function openAdvanced() {
    fireEvent.click(screen.getByText("Advanced options"));
  }

  it("shows karasu.map.yaml field for compose format (not logical format)", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    // compose is the default format
    openAdvanced();
    expect(screen.getByLabelText("karasu.map.yaml content")).not.toBeNull();
    expect(screen.queryByLabelText("Service name (overrides info.title)")).toBeNull();
    expect(screen.queryByLabelText("Database name")).toBeNull();
    expect(screen.queryByLabelText("Granularity")).toBeNull();
  });

  it("shows karasu.map.yaml field for k8s format (not logical format)", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "k8s" } });
    openAdvanced();
    expect(screen.getByLabelText("karasu.map.yaml content")).not.toBeNull();
    expect(screen.queryByLabelText("Granularity")).toBeNull();
  });

  it("hides karasu.map.yaml field and shows logical options for openapi format", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "openapi" } });
    openAdvanced();
    expect(screen.queryByLabelText("karasu.map.yaml content")).toBeNull();
    expect(screen.getByLabelText("Service name (overrides info.title)")).not.toBeNull();
    expect(screen.getByLabelText("Granularity")).not.toBeNull();
    expect(screen.queryByLabelText("Database name")).toBeNull();
  });

  it("hides karasu.map.yaml field and shows logical options for db format", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "db" } });
    openAdvanced();
    expect(screen.queryByLabelText("karasu.map.yaml content")).toBeNull();
    expect(screen.getByLabelText("Database name")).not.toBeNull();
    expect(screen.getByLabelText("Granularity")).not.toBeNull();
    expect(screen.queryByLabelText("Service name (overrides info.title)")).toBeNull();
  });

  it("shows emit-bindings and emit-crud-decoration checkboxes for openapi", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "openapi" } });
    openAdvanced();
    expect(screen.getByLabelText(/Emit usecase.*resource bindings/)).not.toBeNull();
    expect(screen.getByLabelText(/Decorate operations with/)).not.toBeNull();
  });

  it("shows emit-bindings and emit-crud-decoration checkboxes for db", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "db" } });
    openAdvanced();
    expect(screen.getByLabelText(/Emit usecase.*resource bindings/)).not.toBeNull();
    expect(screen.getByLabelText(/Decorate operations with/)).not.toBeNull();
  });

  it("hides emit-bindings and emit-crud-decoration for compose format", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    openAdvanced();
    expect(screen.queryByLabelText(/Emit usecase.*resource bindings/)).toBeNull();
    expect(screen.queryByLabelText(/Decorate operations with/)).toBeNull();
  });

  it("shows System name field only for logical formats (openapi)", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "openapi" } });
    openAdvanced();
    expect(screen.getByLabelText("System name")).not.toBeNull();
  });

  it("does not show System name field for compose format", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    openAdvanced();
    expect(screen.queryByLabelText("System name")).toBeNull();
  });

  it("clears stale result when format changes", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Source content"), {
      target: { value: "services:\n  api:\n    image: api:1.0.0\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    await screen.findByLabelText("Generated .krs");

    fireEvent.change(screen.getByLabelText("Input format"), { target: { value: "openapi" } });
    expect(screen.queryByLabelText("Generated .krs")).toBeNull();
  });
});

describe("TranslateDialog — karasu.map.yaml resolves realizes", () => {
  it("uses karasu.map.yaml content to resolve realizes for compose", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    // Open advanced options and paste the map file content
    fireEvent.click(screen.getByText("Advanced options"));
    fireEvent.change(screen.getByLabelText("karasu.map.yaml content"), {
      target: { value: "app: ECommerce\n" },
    });
    fireEvent.change(screen.getByLabelText("Source content"), {
      target: { value: "services:\n  app:\n    image: app:1.0.0\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));

    const output = (await screen.findByLabelText("Generated .krs")) as HTMLTextAreaElement;
    expect(output.value).toContain("realizes ECommerce");
    // No warnings because realizes was resolved
    expect(screen.queryByText(/Could not resolve realizes/)).toBeNull();
  });
});

describe("TranslateDialog — Download button", () => {
  it("shows Download button after a successful translation", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Source content"), {
      target: { value: "services:\n  api:\n    image: api:1.0.0\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    await screen.findByLabelText("Generated .krs");

    expect(screen.getByRole("button", { name: /Download/ })).not.toBeNull();
  });

  it("does not show Download button before translation", () => {
    render(<TranslateDialog open onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("triggers URL.createObjectURL when Download is clicked", async () => {
    // Stub URL APIs used by handleDownload
    const createObjectURL = vi.fn<(obj: object) => string>().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    render(<TranslateDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Source content"), {
      target: { value: "services:\n  order-service:\n    image: order-service:1.0.0\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    await screen.findByLabelText("Generated .krs");

    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    // revokeObjectURL is called after click to free the blob URL
    expect(revokeObjectURL).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});

describe("TranslateDialog — failure surfacing (#1538)", () => {
  it("surfaces an inline error when the clipboard write rejects", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TranslateDialog open onClose={() => {}} />);
    typeSource("services:\n  api:\n    image: api:1.0.0\n");
    clickTranslate();
    await screen.findByLabelText("Generated .krs");

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Couldn't copy to the clipboard/)).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("surfaces an inline error when the chosen file cannot be read", async () => {
    render(<TranslateDialog open onClose={() => {}} />);
    const fileInput = screen.getByLabelText("Load a file");
    const unreadable = {
      name: "broken.yaml",
      text: () => Promise.reject(new Error("read failed")),
    };
    fireEvent.change(fileInput, { target: { files: [unreadable] } });

    expect(await screen.findByText(/Couldn't read the selected file/)).not.toBeNull();
  });
});

describe("TranslateDialog — i18n", () => {
  it("renders English strings under the 'en' locale", () => {
    render(<TranslateDialog open onClose={() => {}} />, "en");
    expect(screen.getByText("⇄ Translate infra config to .krs")).not.toBeNull();
    expect(screen.getByRole("button", { name: "⇄ Translate" })).not.toBeNull();
    expect(screen.getByText("Advanced options")).not.toBeNull();
  });

  it("renders Japanese strings under the 'ja' locale", () => {
    render(<TranslateDialog open onClose={() => {}} />, "ja");
    expect(screen.getByText("⇄ インフラ設定を .krs に変換")).not.toBeNull();
    expect(screen.getByRole("button", { name: "⇄ 変換" })).not.toBeNull();
    expect(screen.getByText("詳細オプション")).not.toBeNull();
    // The localized aria-label is queryable.
    expect(screen.getByLabelText("変換元の内容")).not.toBeNull();
  });
});
