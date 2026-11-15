// Global check wired through vitest `setupFiles` (vitest.config.ts): every
// app test that mounts and unmounts a component also checks that the native
// listeners the component added to its DOM were removed (TPL-1537 item 2).
//
// The check unmounts what is still mounted first (RTL's `cleanup()` is
// idempotent), so it does not depend on the hook order or on the test file
// registering its own `afterEach(cleanup)`.
import { afterEach, beforeEach } from "vitest";
import {
  installListenerTracking,
  leakedListeners,
  resetListenerTracking,
} from "./listener-leak.js";

installListenerTracking();

beforeEach(() => {
  resetListenerTracking();
});

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
  const leaked = leakedListeners();
  resetListenerTracking();
  if (leaked.length === 0) return;
  const lines = leaked.map((l) => `  "${l.type}" on ${l.element}`).join("\n");
  throw new Error(
    `Native listeners outlived their unmounted element (TPL-1537 item 2). ` +
      `Return a cleanup that calls removeEventListener from the effect that added them:\n${lines}`,
  );
});
