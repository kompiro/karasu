import { describe, it, expect } from "vitest";
import { SerialQueue } from "./serial-queue.js";

describe("SerialQueue", () => {
  it("runs tasks one at a time even when started concurrently", async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;

    const task = (name: string) =>
      queue.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        await Promise.resolve();
        log.push(name);
        active -= 1;
      });

    await Promise.all([task("a"), task("b"), task("c")]);

    expect(maxActive).toBe(1); // never two tasks in flight at once
    expect(log).toEqual(["a", "b", "c"]); // preserves enqueue order
  });

  it("propagates a task rejection to its own caller", async () => {
    const queue = new SerialQueue();
    await expect(queue.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("does not let one rejection poison later tasks", async () => {
    const queue = new SerialQueue();
    const failing = queue.run(async () => {
      throw new Error("first fails");
    });
    const ok = queue.run(async () => "second ok");

    await expect(failing).rejects.toThrow("first fails");
    await expect(ok).resolves.toBe("second ok");
  });

  it("returns the task's resolved value", async () => {
    const queue = new SerialQueue();
    await expect(queue.run(async () => 42)).resolves.toBe(42);
  });
});
