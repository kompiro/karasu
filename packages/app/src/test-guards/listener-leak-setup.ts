// Global check wired through vitest `setupFiles` (vitest.config.ts): every
// app test that mounts and unmounts a component also checks that the native
// listeners the component added to its DOM were removed (TPL-1537 item 2).
//
// Hooks registered in a setup file run their `afterEach` after the test
// file's own `afterEach(cleanup)` (vitest runs after-hooks in stack order),
// so the component has unmounted by the time this looks.
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

afterEach(() => {
  const leaked = leakedListeners();
  resetListenerTracking();
  if (leaked.length === 0) return;
  const lines = leaked.map((l) => `  "${l.type}" on ${l.element}`).join("\n");
  throw new Error(
    `Native listeners outlived their unmounted element (TPL-1537 item 2). ` +
      `Return a cleanup that calls removeEventListener from the effect that added them:\n${lines}`,
  );
});
