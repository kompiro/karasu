import { expect as playwrightExpect } from "@playwright/test";

/**
 * The `expect` every spec uses: Playwright's, except that an auto-retrying
 * assertion may not wait longer than the default (TPL-1171).
 *
 * An assertion that passes only with a longer timeout is waiting on the wrong
 * thing: the state it checks is reached late because nothing waited for the
 * step before it, and on a slower runner it will be later still. A static scan
 * of the specs (`scripts/lint/e2e-spec-conventions.test.ts`) sees a literal
 * `{ timeout: 10_000 }` but not one held in a constant or built at run time;
 * this check runs on the value the matcher actually receives, so it sees both.
 *
 * Checked: the options of a matcher (`toBeVisible({ timeout })`), of
 * `expect(x, { timeout })`, `expect.soft`, `expect.poll` and
 * `expect.configure`. `0` means "no timeout" and counts as extended. Not
 * checked: `toPass`, which has no default to extend (it retries until the test
 * times out unless given a bound), and the value matchers, whose argument is
 * data rather than options. Specs import this through `fixtures/opfs.ts`,
 * `fixtures/serve.ts` or `fixtures/network.ts`, and helpers in `fixtures/`
 * import it directly; `.oxlintrc.json` forbids importing `expect` (or `test`)
 * from `@playwright/test` anywhere in `tests/` and `fixtures/` but this file.
 * A helper with a real reason to wait longer needs a per-line disable that
 * states the reason.
 */

/** Playwright's default assertion timeout; `playwright.config.ts` does not change it. */
export const DEFAULT_EXPECT_TIMEOUT_MS = 5000;

/** Matchers whose last argument is a value to compare, never an options object. */
const VALUE_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toContainEqual",
  "toHaveProperty",
  "toContain",
  "toPass",
]);

export class ExtendedTimeoutError extends Error {}

function check(where: string, options: unknown): void {
  if (typeof options !== "object" || options === null || !("timeout" in options)) return;
  const { timeout } = options as { timeout: unknown };
  if (timeout === undefined) return;
  if (typeof timeout === "number" && timeout > 0 && timeout <= DEFAULT_EXPECT_TIMEOUT_MS) return;
  throw new ExtendedTimeoutError(
    `${where} was given timeout ${String(timeout)}, which waits beyond the ${DEFAULT_EXPECT_TIMEOUT_MS}ms default (0 waits forever). ` +
      "An auto-retrying assertion that needs longer is waiting on the wrong thing: wait for the state " +
      "before it instead (TPL-1171).",
  );
}

/** Matchers (and their `.not` / `.resolves` / `.rejects`) that check their options first. */
function guardMatchers<T extends object>(matchers: T): T {
  return new Proxy(matchers, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop === "not" || prop === "resolves" || prop === "rejects") {
        return typeof value === "object" && value !== null ? guardMatchers(value) : value;
      }
      if (typeof value !== "function" || typeof prop !== "string" || VALUE_MATCHERS.has(prop)) {
        return value;
      }
      return (...args: unknown[]) => {
        check(prop, args.at(-1));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

type Expect = typeof playwrightExpect;

function guardExpect(base: Expect): Expect {
  const guarded = (actual: unknown, messageOrOptions?: unknown) => {
    check("expect()", messageOrOptions);
    return guardMatchers(base(actual, messageOrOptions as string));
  };
  return new Proxy(guarded as unknown as Expect, {
    get(_target, prop) {
      const value: unknown = Reflect.get(base, prop);
      // `expect.soft` is a whole expect of its own (`.poll`, `.configure`, ...),
      // so it is guarded as one rather than replaced by a bare call.
      if (prop === "soft") return guardExpect(value as Expect);
      if (prop === "poll") {
        return (actual: unknown, messageOrOptions?: unknown) => {
          check(`expect.${prop}()`, messageOrOptions);
          return guardMatchers(
            (value as (...a: unknown[]) => object).call(base, actual, messageOrOptions),
          );
        };
      }
      if (prop === "configure") {
        return (options: unknown) => {
          check("expect.configure()", options);
          return guardExpect((value as (o: unknown) => Expect).call(base, options));
        };
      }
      if (prop === "extend") {
        return (matchers: unknown) =>
          guardExpect((value as (m: unknown) => Expect).call(base, matchers));
      }
      return typeof value === "function" ? (value as () => unknown).bind(base) : value;
    },
  });
}

export const expect: Expect = guardExpect(playwrightExpect);
