// Spike #2993: keep the stand-in server running so a person can try it.
//   node serve.mjs [port]   (default 4700)
// Open http://localhost:<port>/set-cookie first, then /g/dify/view or /g/small/view.
// The same pages without the CSP sandbox are served on port + 1, for comparison.
import { start } from "./server.mjs";
const port = Number(process.argv[2] ?? 4700);
await start(port, { sandbox: true, assetCors: true });
await start(port + 1, { sandbox: false, assetCors: true });
console.log(`sandboxed:   http://localhost:${port}/g/dify/view   (also /g/small/view, /set-cookie)`);
console.log(`no sandbox:  http://localhost:${port + 1}/g/dify/view`);
