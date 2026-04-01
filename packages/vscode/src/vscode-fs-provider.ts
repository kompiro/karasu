import * as vscode from "vscode";
import type { DirEntry, FileSystemProvider } from "@karasu/core";

/**
 * Bridges vscode.workspace.fs to the core FileSystemProvider interface,
 * enabling compileProject() to resolve @import declarations in the editor.
 */
export class VsCodeFileSystemProvider implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    return Buffer.from(bytes).toString("utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(content, "utf-8"));
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
    return entries.map(([name, type]) => ({
      name,
      kind: type === vscode.FileType.Directory ? ("directory" as const) : ("file" as const),
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path));
      return true;
    } catch {
      return false;
    }
  }

  async delete(path: string): Promise<void> {
    await vscode.workspace.fs.delete(vscode.Uri.file(path));
  }

  async mkdir(path: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path));
  }
}
