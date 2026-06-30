import { FileTree } from "@karasu-tools/app";

// In-memory FileSystemProvider mock — readDir resolves immediately so the tree
// populates before capture. Only root-level entries load on mount (dirs stay
// collapsed), which is what the sidebar shows at rest.
const entries: Record<string, { name: string; kind: "file" | "directory" }[]> = {
  "/project": [
    { name: "deploy", kind: "directory" },
    { name: "index.krs", kind: "file" },
    { name: "payments.krs", kind: "file" },
    { name: "catalog.krs", kind: "file" },
    { name: "theme.krs.style", kind: "file" },
    { name: "README.md", kind: "file" },
  ],
  "/project/deploy": [{ name: "system.krs", kind: "file" }],
};

const fs = {
  readFile: () => Promise.resolve(""),
  writeFile: () => Promise.resolve(),
  readDir: (p: string) => Promise.resolve(entries[p] ?? []),
  exists: () => Promise.resolve(true),
  delete: () => Promise.resolve(),
  mkdir: () => Promise.resolve(),
};

export const ProjectFiles = () => (
  <div
    style={{
      background: "var(--bg-base)",
      padding: 0,
      fontFamily: "var(--font-ui)",
      color: "var(--text-primary)",
      width: 240,
      height: 320,
    }}
  >
    <FileTree
      rootPath="/project"
      fs={fs as any}
      currentFilePath="/project/index.krs"
      onSelectFile={() => {}}
    />
  </div>
);
