import { InvalidArgumentError, type Command } from "commander";
import { serve } from "./serve.js";
import { DEFAULT_HOST, normalizeAllowedHost } from "./serve-host.js";

/** Commander parser for the repeatable `--allowed-host`: normalize, or reject the value. */
function collectAllowedHost(value: string, prev?: string[]): string[] {
  try {
    return [...(prev ?? []), normalizeAllowedHost(value)];
  } catch (err) {
    throw new InvalidArgumentError((err as Error).message);
  }
}

/** Options and action of `serve [dir]`, registered in `index.ts` with the other commands. */
export function configureServeCommand(command: Command): void {
  command
    .description("Serve .krs files from a local directory with live preview")
    .option("-p, --port <number>", "Port to listen on", "3000")
    .option(
      "--host <addr>",
      "Address to listen on (0.0.0.0 for every IPv4 interface, e.g. inside docker run -p)",
      DEFAULT_HOST,
    )
    .option(
      "--allowed-host <name>",
      "Also answer /api/* when the Host header names <name>, e.g. a forwarded port's name " +
        "(repeatable; .example.com also matches its subdomains). Not access control.",
      collectAllowedHost,
    )
    .action(
      (
        dir: string | undefined,
        options: { port: string; host: string; allowedHost?: string[] },
      ) => {
        const port = parseInt(options.port, 10);
        const server = serve(dir ?? ".", port, {
          host: options.host,
          allowedHosts: options.allowedHost ?? [],
        });
        server.once("error", (err) => {
          process.stderr.write(
            `karasu serve: cannot listen on ${options.host}:${port}: ${err.message}\n`,
          );
          process.exit(1);
        });
      },
    );
}
