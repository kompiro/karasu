// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CommandProvider, useCommandRegistry } from "./command-context.js";
import { useCommand } from "./use-command.js";
import type { Command } from "./command-types.js";

afterEach(cleanup);

/** Registers a command for the lifetime of its mount. */
function CommandHost({ command }: { command: Command }) {
  useCommand(command);
  return null;
}

/** Captures the registry so a test can call `getCommands()` after render. */
function RegistryProbe({ sink }: { sink: { registry: ReturnType<typeof useCommandRegistry> } }) {
  sink.registry = useCommandRegistry();
  return null;
}

describe("CommandRegistry.getCommands", () => {
  it("returns every registered command", () => {
    const sink = {} as { registry: ReturnType<typeof useCommandRegistry> };
    render(
      <CommandProvider>
        <RegistryProbe sink={sink} />
        <CommandHost command={{ id: "test.a", title: "A", run: () => {} }} />
        <CommandHost command={{ id: "test.b", title: "B", run: () => {} }} />
      </CommandProvider>,
    );
    expect(sink.registry.getCommands().map((c) => c.id)).toEqual(["test.a", "test.b"]);
  });

  it("drops a command once its component unmounts", () => {
    const sink = {} as { registry: ReturnType<typeof useCommandRegistry> };
    function Tree({ showB }: { showB: boolean }) {
      return (
        <CommandProvider>
          <RegistryProbe sink={sink} />
          <CommandHost command={{ id: "test.a", title: "A", run: () => {} }} />
          {showB && <CommandHost command={{ id: "test.b", title: "B", run: () => {} }} />}
        </CommandProvider>
      );
    }
    const { rerender } = render(<Tree showB />);
    expect(sink.registry.getCommands().map((c) => c.id)).toEqual(["test.a", "test.b"]);
    rerender(<Tree showB={false} />);
    expect(sink.registry.getCommands().map((c) => c.id)).toEqual(["test.a"]);
  });

  it("returns an empty array when nothing is registered", () => {
    const sink = {} as { registry: ReturnType<typeof useCommandRegistry> };
    render(
      <CommandProvider>
        <RegistryProbe sink={sink} />
      </CommandProvider>,
    );
    expect(sink.registry.getCommands()).toEqual([]);
  });
});

describe("CommandRegistry.register keybinding collisions (TPL-1419)", () => {
  function captureRegistry() {
    const sink = {} as { registry: ReturnType<typeof useCommandRegistry> };
    render(
      <CommandProvider>
        <RegistryProbe sink={sink} />
      </CommandProvider>,
    );
    return sink.registry;
  }

  it("refuses a second live command bound to the same chord", () => {
    const registry = captureRegistry();
    registry.register({ id: "test.a", title: "A", keybinding: "mod+b", run: () => {} });
    expect(() =>
      registry.register({ id: "test.b", title: "B", keybinding: "mod+b", run: () => {} }),
    ).toThrow('Keybinding "mod+b" of command "test.b" is already held by "test.a"');
  });

  it("accepts the chord again once its holder unregisters", () => {
    const registry = captureRegistry();
    const unregister = registry.register({
      id: "test.a",
      title: "A",
      keybinding: "mod+b",
      run: () => {},
    });
    unregister();
    registry.register({ id: "test.b", title: "B", keybinding: "mod+b", run: () => {} });
    expect(registry.resolveChord("mod+b")?.id).toBe("test.b");
  });

  it("treats re-registering the same id as a replacement", () => {
    const registry = captureRegistry();
    registry.register({ id: "test.a", title: "A", keybinding: "mod+b", run: () => {} });
    registry.register({ id: "test.a", title: "A2", keybinding: "mod+b", run: () => {} });
    expect(registry.getCommands().map((c) => c.title)).toEqual(["A2"]);
  });

  it("lets palette-only commands coexist", () => {
    const registry = captureRegistry();
    registry.register({ id: "test.a", title: "A", run: () => {} });
    registry.register({ id: "test.b", title: "B", run: () => {} });
    expect(registry.getCommands()).toHaveLength(2);
  });
});
