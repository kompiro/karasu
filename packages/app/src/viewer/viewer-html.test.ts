import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.resolve(__dirname, "../../viewer.html"), "utf8");

/** The inline storage shim, exactly as shipped in viewer.html. */
function storageShimSource(): string {
  const match = /<script data-storage-shim>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error("viewer.html has no <script data-storage-shim>");
  return match[1];
}

/** A window whose Storage throws on access, as in an opaque-origin document. */
function opaqueWindow(): Record<string, unknown> {
  const win: Record<string, unknown> = {};
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(win, name, {
      configurable: true,
      get() {
        throw new DOMException("The document is sandboxed", "SecurityError");
      },
    });
  }
  return win;
}

function runShim(win: Record<string, unknown>) {
  new Function("window", storageShimSource())(win);
}

describe("viewer.html storage shim (#2997)", () => {
  it("runs before the bundle", () => {
    expect(html.indexOf("data-storage-shim")).toBeLessThan(html.indexOf('type="module"'));
  });

  it("replaces throwing Storage with a working in-memory one", () => {
    const win = opaqueWindow();
    runShim(win);
    for (const name of ["localStorage", "sessionStorage"]) {
      const storage = win[name] as Storage;
      expect(storage.getItem("karasu-theme")).toBeNull();
      storage.setItem("karasu-theme", "light");
      storage.setItem("n", 1 as unknown as string);
      expect(storage.getItem("karasu-theme")).toBe("light");
      expect(storage.getItem("n")).toBe("1");
      // Keys are stringified on every method, as the real Storage does.
      storage.setItem(7 as unknown as string, "seven");
      expect(storage.getItem("7")).toBe("seven");
      storage.removeItem(7 as unknown as string);
      expect(storage.getItem("7")).toBeNull();
      expect(storage.length).toBe(2);
      expect(storage.key(0)).toBe("karasu-theme");
      expect(storage.key(5)).toBeNull();
      storage.removeItem("n");
      expect(storage.length).toBe(1);
      storage.clear();
      expect(storage.length).toBe(0);
    }
    // The two are separate stores.
    (win.localStorage as Storage).setItem("k", "v");
    expect((win.sessionStorage as Storage).getItem("k")).toBeNull();
  });

  it("leaves working Storage alone", () => {
    const real = { length: 0 };
    const win: Record<string, unknown> = { localStorage: real, sessionStorage: real };
    runShim(win);
    expect(win.localStorage).toBe(real);
    expect(win.sessionStorage).toBe(real);
  });
});
