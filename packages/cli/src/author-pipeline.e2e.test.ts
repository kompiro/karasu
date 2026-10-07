import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { append } from "./append.js";
import { insert } from "./insert.js";
import { check } from "./check.js";
import { fmt } from "./fmt.js";
import { skillPath } from "./skill.js";

// The karasu-author skill's write → verify loop (#2912), run on the model and
// the `insert` example the skill itself teaches. If either stops working, the
// skill is teaching an agent something the CLI rejects.

const skillMd = readFileSync(join(skillPath("karasu-author"), "SKILL.md"), "utf8");

/** The skill's starter model: its one ```krs fence. */
function starterModel(): string {
  const fences = [...skillMd.matchAll(/^```krs\n([\s\S]*?)^```$/gm)];
  expect(fences).toHaveLength(1);
  return fences[0][1];
}

/** The skill's `karasu insert <parent> index.krs <<'EOF' … EOF` example. */
function insertExample(): { parent: string; body: string } {
  const m = skillMd.match(/^karasu insert (\S+) index\.krs <<'EOF'\n([\s\S]*?)^EOF$/m);
  if (!m) throw new Error("karasu-author SKILL.md lost its insert example");
  return { parent: m[1], body: m[2] };
}

function mockStdin(content: string): () => void {
  const emitter = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  emitter.setEncoding = vi.fn<typeof emitter.setEncoding>();
  const original = process.stdin;
  Object.defineProperty(process, "stdin", { value: emitter, writable: true });
  setTimeout(() => {
    emitter.emit("data", content);
    emitter.emit("end");
  }, 0);
  return () => Object.defineProperty(process, "stdin", { value: original, writable: true });
}

async function withStdin(content: string, run: () => Promise<void>): Promise<void> {
  const restore = mockStdin(content);
  try {
    await run();
  } finally {
    restore();
  }
}

describe("karasu-author: write, then check, then fmt", () => {
  let dir: string;
  let file: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderr: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "karasu-author-"));
    file = join(dir, "index.krs");
    writeFileSync(file, "", "utf8");
    stderr = "";
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("the starter model plus the insert example checks clean and formats", async () => {
    await withStdin(starterModel(), () => append(file));
    const { parent, body } = insertExample();
    await withStdin(body, () => insert(parent, file));

    await check(file);
    expect(stderr).toBe("");
    expect(exitSpy).not.toHaveBeenCalled();

    await fmt([file], {});
    await fmt([file], { check: true });
    expect(exitSpy).not.toHaveBeenCalled();

    const model = readFileSync(file, "utf8");
    expect(model).toContain("domain Catalog");
    expect(model).toContain("usecase BrowseProducts");
  });

  it("insert writes input that does not parse; check is what stops it", async () => {
    await withStdin(starterModel(), () => append(file));
    await withStdin('domain Broken { label: "x" }\n', () => insert("Storefront", file));
    expect(exitSpy).not.toHaveBeenCalled();

    await check(file);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("check rejects a model that parses but is not valid", async () => {
    await withStdin(starterModel(), () => append(file));
    await withStdin("service Payment {}\n", () => insert("Shop", file));

    await check(file);
    expect(stderr).toContain('Duplicate node id "Payment"');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
