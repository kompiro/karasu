/**
 * The Workers entry point, and nothing else.
 *
 * Separate from `index.ts` because the two have incompatible rules about what
 * they may export. `index.ts` is the package's barrel: constants, types, pure
 * functions, whatever a test or a sibling package needs. A Workers entry module
 * may export **only** a default handler and classes the runtime binds (Durable
 * Objects, Workflows) — workerd rejects anything else at startup with
 * `Incorrect type for map entry '<name>': the provided value is not of type
 * 'function or ExportedHandler'`, and the deploy never comes up.
 *
 * That failure is invisible to everything except actually starting the runtime:
 * `tsc` is happy, the unit suite imports functions directly and never loads the
 * module the way workerd does, and a reviewer reading the barrel sees a
 * perfectly ordinary set of exports. `worker.test.ts` is the check that catches
 * it without a Workers runtime.
 *
 * There is no class export any more. #2590 removed the `[[workflows]]` binding
 * along with server-side generation, so the default handler is the whole
 * surface — which is what makes the rule above easy to keep from here on.
 */
import { handleRequest } from "./app.js";
import type { NestEnv, NestExecutionContext } from "./env.js";

export default {
  fetch(request: Request, env: NestEnv, ctx: NestExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
