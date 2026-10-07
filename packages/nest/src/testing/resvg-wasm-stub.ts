/**
 * Stands in for `@resvg/resvg-wasm/index_bg.wasm` under vitest
 * (`vitest.config.ts`), which cannot load the real module.
 *
 * Every test that imports the router reaches `gallery/og-rasterize.ts`, and
 * through it this import, even when it never draws an image. Nothing here can
 * rasterize: the route tests replace `rasterizeOgPng` itself with `vi.mock`,
 * and `wrangler dev` is where the real module is exercised (#2995).
 */
const stub: WebAssembly.Module | undefined = undefined;
export default stub;
