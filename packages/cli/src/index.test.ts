import { describe, it, expect, vi, beforeEach } from "vitest";

const mockServe = vi.fn();
const mockRender = vi.fn();
vi.mock("./serve.js", () => ({ serve: mockServe }));
vi.mock("./render.js", () => ({ render: mockRender }));

const { program } = await import("./index.js");

describe("CLI program", () => {
  beforeEach(() => {
    mockServe.mockReset();
    mockRender.mockReset();
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

  it("has a 'render' command", () => {
    const cmd = program.commands.find((c) => c.name() === "render");
    expect(cmd).toBeDefined();
  });

  it("render passes file to render()", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", { output: undefined, view: undefined });
  });

  it("render passes --output option", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--output", "out.svg"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", { output: "out.svg", view: undefined });
  });

  it("render passes -o shorthand", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "-o", "out.svg"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", { output: "out.svg", view: undefined });
  });

  it("render passes --view option", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--view", "deploy"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", { output: undefined, view: "deploy" });
  });
});
