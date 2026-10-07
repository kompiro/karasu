/**
 * A `.wasm` import, as wrangler bundles it: the module itself, compiled at
 * bundle time. Only `gallery/og-rasterize.ts` imports one (resvg, #2995).
 */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
