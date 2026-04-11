import { zipSync, strToU8 } from "fflate";
import type { FileSystemProvider } from "@karasu-tools/core";

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
      const zipPath = fullPath.slice(rootPath.length + 1);
      files[zipPath] = strToU8(content);
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
  const files: Record<string, Uint8Array> = {};
  await collectFiles(fs, rootPath, rootPath, files);

  const zipped = zipSync(files);
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
