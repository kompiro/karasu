import { describe, expect, it } from "vitest";
import {
  WELCOME_DISMISSED_KEY,
  hasDeepLink,
  isWelcomeDismissed,
  markWelcomeDismissed,
  shouldShowWelcome,
} from "./welcome-gate.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
};

const plain = { search: "", hash: "" };

describe("hasDeepLink", () => {
  it.each([
    ["?example=org&lang=en", ""],
    ["?krs=system-root", ""],
    ["", "#krs-org-root"],
    ["", "#krs-system-Shop.Payment?file=%2Fprojects%2Fa%2Findex.krs"],
  ])("treats search %j / hash %j as a link that asked for a place", (search, hash) => {
    expect(hasDeepLink({ search, hash })).toBe(true);
  });

  it.each([
    ["", ""],
    ["?mode=memory", ""],
    ["", "#section"],
  ])("does not treat search %j / hash %j as one", (search, hash) => {
    expect(hasDeepLink({ search, hash })).toBe(false);
  });
});

describe("shouldShowWelcome", () => {
  it("greets a boot that seeded the defaults, with no link and no earlier choice", () => {
    expect(
      shouldShowWelcome({ seededDefaults: true, location: plain, storage: memoryStorage() }),
    ).toBe(true);
  });

  it("does not greet a returning visitor whose projects were already there", () => {
    expect(
      shouldShowWelcome({ seededDefaults: false, location: plain, storage: memoryStorage() }),
    ).toBe(false);
  });

  it("does not greet a visitor who arrived through a deep link", () => {
    expect(
      shouldShowWelcome({
        seededDefaults: true,
        location: { search: "?example=org", hash: "" },
        storage: memoryStorage(),
      }),
    ).toBe(false);
  });

  it("does not greet again once the visitor chose, even on a fresh project list", () => {
    const storage = memoryStorage();
    markWelcomeDismissed(storage);
    expect(storage.getItem(WELCOME_DISMISSED_KEY)).toBe("1");
    expect(shouldShowWelcome({ seededDefaults: true, location: plain, storage })).toBe(false);
  });
});

describe("storage that throws (private windows, blocked site data)", () => {
  it("reads as not dismissed, and marking it does not throw", () => {
    expect(isWelcomeDismissed(throwingStorage)).toBe(false);
    expect(() => markWelcomeDismissed(throwingStorage)).not.toThrow();
  });
});
