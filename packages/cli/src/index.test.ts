import { describe, it, expect, vi, beforeEach } from "vitest";

const mockServe = vi.fn();
vi.mock("./serve.js", () => ({ serve: mockServe }));

const { program } = await import("./index.js");

describe("CLI program", () => {
  beforeEach(() => {
    mockServe.mockReset();
  });

  it("is named 'karasu'", () => {
    expect(program.name()).toBe("karasu");
  });

  it("has a 'serve' command", () => {
    const cmd = program.commands.find((c) => c.name() === "serve");
    expect(cmd).toBeDefined();
  });

  it("serve defaults dir to '.' and port to 3000", async () => {
    await program.parseAsync(["node", "karasu", "serve"]);
    expect(mockServe).toHaveBeenCalledWith(".", 3000);
  });

  it("serve passes an explicit directory", async () => {
    await program.parseAsync(["node", "karasu", "serve", "./arch"]);
    expect(mockServe).toHaveBeenCalledWith("./arch", 3000);
  });

  it("serve parses --port as a number", async () => {
    await program.parseAsync(["node", "karasu", "serve", "./arch", "--port", "4000"]);
    expect(mockServe).toHaveBeenCalledWith("./arch", 4000);
  });

  it("serve parses -p shorthand", async () => {
    await program.parseAsync(["node", "karasu", "serve", "-p", "8080"]);
    expect(mockServe).toHaveBeenCalledWith(".", 8080);
  });
});
