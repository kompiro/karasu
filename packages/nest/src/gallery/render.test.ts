import { describe, expect, it } from "vitest";
import { renderSubmission } from "./render.js";

const KRS = "system Shop {\n  service api\n}\n";
const params = (query = ""): URLSearchParams => new URLSearchParams(query);

describe("renderSubmission", () => {
  it("renders a diagram rather than returning the source", async () => {
    // A gallery whose entries are only readable as source is not a gallery.
    const result = renderSubmission(KRS, params());
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/svg+xml; charset=utf-8");
    expect(result.body).toMatch(/^<svg|<svg /);
    expect(result.body).not.toBe(KRS);
  });

  it("bundles every view when none is named", async () => {
    const bundled = renderSubmission(KRS, params());
    const one = renderSubmission(KRS, params("view=system"));
    expect(bundled.body.length).toBeGreaterThan(one.body.length);
  });

  it("renders a single named view", async () => {
    for (const view of ["system", "deploy", "org"]) {
      expect(renderSubmission(KRS, params(`view=${view}`)).status).toBe(200);
    }
  });

  it("refuses a view that is not one of ours", async () => {
    expect(renderSubmission(KRS, params("view=nonsense")).status).toBe(400);
  });

  it("accepts a theme and a display mode", async () => {
    expect(renderSubmission(KRS, params("theme=light")).status).toBe(200);
    expect(renderSubmission(KRS, params("displayMode=icon")).status).toBe(200);
  });

  it("answers 422 for a document that cannot be shown, not 500", async () => {
    // Ingest already checked this, so reaching the state means the compiler's
    // idea of an error moved under a stored document. That is "cannot be
    // shown", not "the server broke".
    expect(renderSubmission("system Shop {\n  service\n", params()).status).toBe(422);
  });

  it("does not cap the model at ADR-2259's inline-share ceiling", async () => {
    // That limit binds because `resolveRepoPermalink` folds a .krs back into a
    // `/s?s=` URL: what is capped is what fits in a URL. Nothing rides in a
    // URL on this path.
    const services = Array.from(
      { length: 400 },
      (_unused, index) => `  service service_number_${index}`,
    );
    const large = `system Big {\n${services.join("\n")}\n}\n`;
    expect(large.length).toBeGreaterThan(8000);
    expect(renderSubmission(large, params("view=system")).status).toBe(200);
  });
});
