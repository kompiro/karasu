// Global check wired through vitest `setupFiles` (vitest.config.ts): every app
// test that renders UI also checks the roles and button labels of what it
// rendered (TPL-1399 items 2 and 3). See a11y-sweep.ts for what is checked.
import { afterEach, beforeEach } from "vitest";
import { startA11ySweep, stopA11ySweep } from "./a11y-sweep.js";

beforeEach(() => {
  startA11ySweep();
});

afterEach(() => {
  const found = stopA11ySweep();
  if (found.length === 0) return;
  const lines = found.map((p) => `  [${p.rule}] ${p.element}: ${p.message}`).join("\n");
  throw new Error(`Rendered UI breaks an ARIA rule (TPL-1399 items 2 and 3):\n${lines}`);
});
