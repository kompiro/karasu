import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const mockServe = vi.fn<(...args: unknown[]) => EventEmitter>();
const mockRender = vi.fn<() => void>();
vi.mock("./serve.js", () => ({ serve: mockServe }));
vi.mock("./render.js", () => ({ render: mockRender }));

const { program } = await import("./index.js");

describe("CLI program", () => {
  beforeEach(() => {
    mockServe.mockReset();
    mockServe.mockImplementation(() => new EventEmitter());
    mockRender.mockReset();
  });

  it("is named 'karasu'", () => {
    expect(program.name()).toBe("karasu");
  });

  it("has a 'serve' command", () => {
    const cmd = program.commands.find((c) => c.name() === "serve");
    expect(cmd).toBeDefined();
  });

  const defaults = { host: "127.0.0.1", allowedHosts: [] };

  it("serve defaults dir to '.' and port to 3000", async () => {
    await program.parseAsync(["node", "karasu", "serve"]);
    expect(mockServe).toHaveBeenCalledWith(".", 3000, defaults);
  });

  it("serve passes an explicit directory", async () => {
    await program.parseAsync(["node", "karasu", "serve", "./arch"]);
    expect(mockServe).toHaveBeenCalledWith("./arch", 3000, defaults);
  });

  it("serve parses --port as a number", async () => {
    await program.parseAsync(["node", "karasu", "serve", "./arch", "--port", "4000"]);
    expect(mockServe).toHaveBeenCalledWith("./arch", 4000, defaults);
  });

  it("serve parses -p shorthand", async () => {
    await program.parseAsync(["node", "karasu", "serve", "-p", "8080"]);
    expect(mockServe).toHaveBeenCalledWith(".", 8080, defaults);
  });

  // #3418: loopback by default, --host to widen, --allowed-host for forwarded names.
  it("serve passes --host and the normalized --allowed-host names", async () => {
    await program.parseAsync([
      "node",
      "karasu",
      "serve",
      "--host",
      "0.0.0.0",
      "--allowed-host",
      "Foo.App.GitHub.Dev.",
      "--allowed-host",
      ".example.com",
    ]);
    expect(mockServe).toHaveBeenCalledWith(".", 3000, {
      host: "0.0.0.0",
      allowedHosts: ["foo.app.github.dev", ".example.com"],
    });
  });

  it("serve exits 1 with a message when the server cannot listen", async () => {
    const server = new EventEmitter();
    mockServe.mockImplementation(() => server);
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      await program.parseAsync(["node", "karasu", "serve", "--host", "127.0.0.1", "-p", "3000"]);
      server.emit("error", Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" }));
      expect(exit).toHaveBeenCalledWith(1);
      expect(stderr.join("")).toContain("cannot listen on 127.0.0.1:3000: listen EADDRINUSE");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each(["foo.app.github.dev:443", "https://foo.app.github.dev", "foo/bar", ""])(
    "serve rejects --allowed-host %j with exit 1",
    async (value) => {
      const stderr: string[] = [];
      vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
      });
      vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
      try {
        await expect(
          program.parseAsync(["node", "karasu", "serve", "--allowed-host", value]),
        ).rejects.toThrow("process.exit(1)");
        expect(stderr.join("")).toContain("--allowed-host");
        expect(mockServe).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it("has a 'render' command", () => {
    const cmd = program.commands.find((c) => c.name() === "render");
    expect(cmd).toBeDefined();
  });

  it("render passes file to render()", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: undefined,
      view: undefined,
      format: "svg",
      theme: "dark",
    });
  });

  it("render passes --output option", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--output", "out.svg"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: "out.svg",
      view: undefined,
      format: "svg",
      theme: "dark",
    });
  });

  it("render passes -o shorthand", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "-o", "out.svg"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: "out.svg",
      view: undefined,
      format: "svg",
      theme: "dark",
    });
  });

  it("render passes --view option", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--view", "deploy"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: undefined,
      view: "deploy",
      format: "svg",
      theme: "dark",
    });
  });

  it("render passes --format drawio option", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--format", "drawio"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: undefined,
      view: undefined,
      format: "drawio",
      theme: "dark",
    });
  });

  it("render passes --theme light option (Issue #1479)", async () => {
    await program.parseAsync(["node", "karasu", "render", "index.krs", "--theme", "light"]);
    expect(mockRender).toHaveBeenCalledWith("index.krs", {
      output: undefined,
      view: undefined,
      format: "svg",
      theme: "light",
    });
  });
});
