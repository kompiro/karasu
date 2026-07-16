import { zipSync, strToU8 } from "fflate";
import type { FileSystemProvider } from "@karasu-tools/core";
import { triggerBlobDownload } from "./trigger-download.js";

async function collectFiles(
  fs: FileSystemProvider,
  dir: string,
  rootPath: string,
  files: Record<string, Uint8Array>,
): Promise<void> {
  const entries = await fs.readDir(dir);
  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.kind === "file") {
      const content = await fs.readFile(fullPath);
      const relativePath = fullPath.slice(rootPath.length + 1);
      files[relativePath] = strToU8(content);
    } else {
      await collectFiles(fs, fullPath, rootPath, files);
    }
  }
}

export async function exportProjectAsZip(
  fs: FileSystemProvider,
  rootPath: string,
  projectName: string,
): Promise<void> {
  const collected: Record<string, Uint8Array> = {};
  await collectFiles(fs, rootPath, rootPath, collected);

  const files: Record<string, Uint8Array> = {};
  for (const [relativePath, data] of Object.entries(collected)) {
    files[`${projectName}/${relativePath}`] = data;
  }

  const zipped = zipSync(files);
  triggerBlobDownload(new Uint8Array(zipped), "application/zip", `${projectName}.zip`);
}
