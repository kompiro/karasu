import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRender = vi.fn<() => void>();
const mockDiff = vi.fn<() => void>();
vi.mock("./render.js", () => ({ render: mockRender }));
vi.mock("./diff.js", () => ({ diff: mockDiff }));

const { program } = await import("./index.js");

/**
 * AT-0057 §7 (and siblings): unknown-option-value rejection contract.
 *
 * The validation lives inside the commander actions in `index.ts` (render
 * `--format` / `--theme`, diff `--view`) and is reachable only through
 * `program.parseAsync`. `process.exit` is mocked to throw (the `fmt.test.ts`
 * mockExit pattern) so the action stops at the rejection point instead of
 * falling through into the command implementation; render/diff are mocked so
 * a validation regression fails via `not.toHaveBeenCalled()` rather than by
 * running the real command. TPL-20260510-17 (validate at the trust boundary).
 */
describe("CLI arg validation (AT-0057 §7)", () => {
  let stderr: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockRender.mockReset();
    mockDiff.mockReset();
    stderr = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("render rejects unknown --format with exit 1", async () => {
    await expect(
      program.parseAsync(["node", "karasu", "render", "index.krs", "--format", "xyz"]),
    ).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr.join("")).toContain('unknown --format "xyz"');
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("render rejects unknown --theme with exit 1", async () => {
    await expect(
      program.parseAsync(["node", "karasu", "render", "index.krs", "--theme", "sepia"]),
    ).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr.join("")).toContain('unknown --theme "sepia"');
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("diff rejects unknown --view with exit 1", async () => {
    await expect(
      program.parseAsync(["node", "karasu", "diff", "before.krs", "after.krs", "--view", "xyz"]),
    ).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr.join("")).toContain('unknown --view "xyz"');
    expect(mockDiff).not.toHaveBeenCalled();
  });
});
