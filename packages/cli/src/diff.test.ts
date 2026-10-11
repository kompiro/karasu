import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { diff } from "./diff.js";

let tmpDir: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let stdout = "";
let stderr = "";

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-diff-test-"));
  stdout = "";
  stderr = "";
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code: number) => {
    throw new Error(`process.exit(${_code})`);
  }) as never);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

const SAME_KRS = `system Demo { service Api {} }\n`;
const ADDED_KRS = `system Demo { service Api {} service NewService {} }\n`;

describe("diff CLI — same content yields no-change SVG", () => {
  it("emits an SVG marked unchanged when before === after", async () => {
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    await writeFile(a, SAME_KRS);
    await writeFile(b, SAME_KRS);

    await diff(a, b, {});

    expect(stdout).toContain("<svg");
    expect(stdout).toContain("data-diff-state");
    // Element-level matches only (the inline <style> block also contains
    // the literal substring data-diff-state="added" / "removed" inside CSS
    // selectors, so naive substring matches would hit those false positives).
    expect(stdout).toMatch(/<g[^>]*data-diff-state="unchanged"/);
    expect(stdout).not.toMatch(/<g[^>]*data-diff-state="added"/);
    expect(stdout).not.toMatch(/<g[^>]*data-diff-state="removed"/);
  });

  it("embeds the diff stylesheet so standalone SVGs render with color", async () => {
    // Belt-and-suspenders for #1020 follow-up: the SVG must carry its own
    // diff styling, otherwise opening the file outside the app shows the
    // attributes but no visual treatment.
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    await writeFile(a, SAME_KRS);
    await writeFile(b, ADDED_KRS);

    await diff(a, b, {});

    expect(stdout).toContain("/* karasu-diff-style */");
    expect(stdout).toContain("#22c55e"); // added color
    expect(stdout).toContain("#ef4444"); // removed color
  });
});

describe("diff CLI — added node surfaces in SVG", () => {
  it('annotates the added node with data-diff-state="added"', async () => {
    const a = join(tmpDir, "old.krs");
    const b = join(tmpDir, "new.krs");
    await writeFile(a, SAME_KRS);
    await writeFile(b, ADDED_KRS);

    await diff(a, b, {});
    expect(stdout).toMatch(/<g[^>]*data-diff-state="added"/);
  });

  it("symmetrically annotates the removed node when sides flip", async () => {
    const a = join(tmpDir, "old.krs");
    const b = join(tmpDir, "new.krs");
    await writeFile(a, ADDED_KRS);
    await writeFile(b, SAME_KRS);

    await diff(a, b, {});
    expect(stdout).toMatch(/<g[^>]*data-diff-state="removed"/);
  });
});

describe("diff CLI — output handling", () => {
  it("writes to file when --output is supplied", async () => {
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    const out = join(tmpDir, "diff.svg");
    await writeFile(a, SAME_KRS);
    await writeFile(b, ADDED_KRS);

    await diff(a, b, { output: out });

    const written = await readFile(out, "utf-8");
    expect(written).toContain("<svg");
    expect(written).toMatch(/<g[^>]*data-diff-state="added"/);
    // Stdout stays clean when --output is set.
    expect(stdout).toBe("");
  });
});

describe("diff CLI — error paths", () => {
  it("rejects when both sides are stdin", async () => {
    await expect(diff("-", "-", {})).rejects.toThrow("process.exit(1)");
    expect(stderr).toContain("cannot use - for both sides");
  });

  it("exits 1 when before file does not exist", async () => {
    const b = join(tmpDir, "b.krs");
    await writeFile(b, SAME_KRS);
    await expect(diff(join(tmpDir, "missing.krs"), b, {})).rejects.toThrow("process.exit(1)");
    expect(stderr).toContain("before file not found");
  });

  it("exits 1 when after file does not exist", async () => {
    const a = join(tmpDir, "a.krs");
    await writeFile(a, SAME_KRS);
    await expect(diff(a, join(tmpDir, "missing.krs"), {})).rejects.toThrow("process.exit(1)");
    expect(stderr).toContain("after file not found");
  });
});

describe("diff CLI — view selection", () => {
  it("compiles a deploy-view diff", async () => {
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    const krs = `system Demo { service Api {} }
deploy Prod {
  oci ApiUnit { realizes Api }
}
`;
    await writeFile(a, krs);
    await writeFile(b, krs);

    await diff(a, b, { view: "deploy" });
    expect(stdout).toContain("<svg");
    // No diff state churn for identical input — but the SVG should render.
    expect(stdout).toContain("ApiUnit");
  });
});

describe("diff CLI — bundled all-views default (Issue #1025)", () => {
  it("emits a tabbed bundled SVG when --view is omitted", async () => {
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    const before = `system Demo { service Api {} }
deploy Prod {
  oci ApiUnit { realizes Api }
}
organization Org { team Squad {} }
`;
    const after = `system Demo { service Api {} service Billing {} }
deploy Prod {
  oci ApiUnit { realizes Api }
  lambda Mailer {}
}
organization Org { team Squad {} team Squad2 {} }
`;
    await writeFile(a, before);
    await writeFile(b, after);

    await diff(a, b, {});

    expect(stdout).toContain('id="krs-system-root"');
    expect(stdout).toContain('id="krs-deploy-root"');
    expect(stdout).toContain('id="krs-org-root"');
    expect(stdout).toContain("/* karasu-diff-style */");
  });

  it("omits deploy / org tabs when neither side has those blocks", async () => {
    const a = join(tmpDir, "a.krs");
    const b = join(tmpDir, "b.krs");
    await writeFile(a, `system Demo { service Api {} }`);
    await writeFile(b, `system Demo { service Api {} service Billing {} }`);

    await diff(a, b, {});

    expect(stdout).toContain('id="krs-system-root"');
    expect(stdout).not.toContain('id="krs-deploy-root"');
    expect(stdout).not.toContain('id="krs-org-root"');
  });
});

// #2879: `karasu diff` printed no resolver warnings on any path. It now prints
// the after model's warnings once, in `render`'s format, each naming the file
// it came from.
describe("diff CLI — after-side warnings (#2879)", () => {
  const BEFORE_KRS = `system Shop {\n  service Api {}\n}\ndomain Legacy {}\n`;
  const AFTER_KRS = `@import "./after.krs.style"\nsystem Shop {\n  service Api {}\n  service Web {}\n}\ndomain Orphan {}\n`;
  const AFTER_STYLE = `#Api { shape: url("nope"); }\n`;

  async function writeProject(): Promise<{ before: string; after: string }> {
    const before = join(tmpDir, "before.krs");
    const after = join(tmpDir, "after.krs");
    await writeFile(before, BEFORE_KRS);
    await writeFile(after, AFTER_KRS);
    await writeFile(join(tmpDir, "after.krs.style"), AFTER_STYLE);
    return { before, after };
  }

  const lines = (): string[] => stderr.split("\n").filter((l) => l.length > 0);

  it.each([
    ["the bundled default", {}],
    ["--view system", { view: "system" as const }],
    ["--view deploy", { view: "deploy" as const }],
    ["--view org", { view: "org" as const }],
  ])("prints after's warning, and not before's, on %s", async (_label, options) => {
    const { before, after } = await writeProject();
    await diff(before, after, options);

    const orphan = lines().filter((l) => l.includes('"Orphan"'));
    // Once, even on the bundled path that renders several views.
    expect(orphan).toEqual([
      `Warning: ${after}:6:1: Domain "Orphan" is not assigned to any service`,
    ]);
    expect(stderr).not.toContain('"Legacy"');
  });

  it("names an imported style sheet's own file, not the after entry", async () => {
    const { before, after } = await writeProject();
    await diff(before, after, { view: "system" });

    const icon = lines().find((l) => l.includes('url("nope")'));
    expect(icon).toMatch(/^Warning: \S*after\.krs\.style:1:\d+: /);
    expect(icon).not.toContain(`${after}:`);
  });

  it("prints an info-severity warning with an `Info:` prefix", async () => {
    const before = join(tmpDir, "before.krs");
    const after = join(tmpDir, "after.krs");
    await writeFile(before, `system S {\n  service A {}\n}\n`);
    await writeFile(
      after,
      `system S {\n  service A { domain Order {} }\n  service B { domain Order {} }\n}\n`,
    );
    await diff(before, after, {});

    const order = lines().filter((l) => l.includes('"Order"'));
    expect(order).toHaveLength(1);
    expect(order[0]).toMatch(/^Info: /);
  });

  it("does not fail the diff on warnings", async () => {
    const { before, after } = await writeProject();
    await diff(before, after, {});
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stdout).toContain("<svg");
  });
});
