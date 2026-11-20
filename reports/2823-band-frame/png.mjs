import { createRequire } from "node:module";
const sharp = createRequire(import.meta.url)("../../node_modules/.pnpm/sharp@0.35.5_@types+node@26.6.6/node_modules/sharp");
const [, , src, out, width] = process.argv;
await sharp(src, { density: 72, limitInputPixels: false }).resize({ width: +width }).flatten({ background: "#fff" }).png().toFile(out);
