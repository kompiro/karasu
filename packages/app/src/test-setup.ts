// Shared jsdom polyfills for the app test suite, wired via vitest `setupFiles`
// (see vitest.config.ts). jsdom omits several DOM APIs that our UI primitives
// rely on; stub them once here instead of per test file.
//
// setupFiles runs for EVERY test file, including pure-logic tests that use the
// node environment (no DOM globals) — so guard each stub on its global existing.

if (typeof Element !== "undefined") {
  // Radix primitives (DropdownMenu / Tabs / Dialog triggers, …) call these
  // pointer/scroll APIs that jsdom doesn't implement.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

// jsdom does not implement CSS.escape (used by selector-building code).
if (!globalThis.CSS) (globalThis as unknown as Record<string, unknown>).CSS = {};
CSS.escape ??= (value: string) => value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
