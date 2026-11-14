/**
 * A `.wasm` import, as wrangler bundles it: the module itself, compiled at
 * bundle time. Only `share-raster.ts` imports one (resvg, ADR-1805).
 */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
