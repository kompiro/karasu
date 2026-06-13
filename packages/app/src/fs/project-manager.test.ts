import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { ProjectManager } from "./project-manager";

describe("ProjectManager", () => {
  let fs: InMemoryFileSystemProvider;
  let pm: ProjectManager;

  beforeEach(() => {
    fs = new InMemoryFileSystemProvider();
    pm = new ProjectManager(fs);
  });

  describe("createProject", () => {
    it("creates a project with default files", async () => {
      const project = await pm.createProject("Test Project");

      expect(project.name).toBe("Test Project");
      expect(project.id).toBeTruthy();
      expect(project.rootPath).toBe(`/projects/${project.id}`);

      // デフォルトファイルが作成されている
      const indexKrs = await fs.readFile(`${project.rootPath}/index.krs`);
      expect(indexKrs).toContain("system");
      expect(indexKrs).not.toContain("@import");

      // ビルトインスタイルが暗黙適用されるため default.krs.style は作成されない
      expect(await fs.exists(`${project.rootPath}/default.krs.style`)).toBe(false);
    });

    it("creates a project with custom files", async () => {
      const files = [
        { path: "index.krs", content: "system Foo {}" },
        { path: "bar.krs", content: "service Bar {}" },
      ];
      const project = await pm.createProject("Custom Project", files);

      expect(project.name).toBe("Custom Project");

      const indexKrs = await fs.readFile(`${project.rootPath}/index.krs`);
      expect(indexKrs).toBe("system Foo {}");

      const barKrs = await fs.readFile(`${project.rootPath}/bar.krs`);
      expect(barKrs).toBe("service Bar {}");
    });

    // Write-boundary guard (#1526): even if a caller skips the ZIP importer's
    // sanitization, createProject must refuse paths that would escape the
    // project root (the in-memory provider's normalizePath collapses "..").
    it("rejects file paths that would escape the project root", async () => {
      await expect(
        pm.createProject("Evil", [{ path: "../../escape.krs", content: "system X {}" }]),
      ).rejects.toThrow(/unsafe project file path/i);
      // Nothing escaped to the parent of /projects/<id>/
      expect(await fs.exists("/escape.krs")).toBe(false);
      expect(await fs.exists("/projects/escape.krs")).toBe(false);
    });

    it("rejects absolute file paths", async () => {
      await expect(
        pm.createProject("Evil", [{ path: "/etc/evil.krs", content: "" }]),
      ).rejects.toThrow(/unsafe project file path/i);
    });

    it("adds project to metadata", async () => {
      await pm.createProject("Project A");
      await pm.createProject("Project B");

      const projects = await pm.listProjects();
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.name)).toEqual(["Project A", "Project B"]);
    });
  });

  describe("listProjects", () => {
    it("returns empty array when no projects exist", async () => {
      const projects = await pm.listProjects();
      expect(projects).toEqual([]);
    });

    // #1531: a corrupt/partial metadata file must NOT be swallowed as [], or the
    // next create/import would overwrite it and wipe every other project.
    it("throws on corrupt metadata instead of returning an empty list", async () => {
      await fs.writeFile("/meta/projects.json", "{ this is not json");
      await expect(pm.listProjects()).rejects.toThrow(SyntaxError);
    });

    it("throws when metadata is valid JSON but not an array", async () => {
      await fs.writeFile("/meta/projects.json", JSON.stringify({ not: "an array" }));
      await expect(pm.listProjects()).rejects.toThrow(/corrupt/i);
    });
  });

  // #1531 (review): if the metadata commit fails after the files are written,
  // createProject must roll back the directory rather than leak an orphan.
  describe("createProject rollback", () => {
    it("removes the project directory when the metadata commit fails", async () => {
      await fs.writeFile("/meta/projects.json", "{ corrupt");
      await expect(pm.createProject("Doomed")).rejects.toThrow(SyntaxError);
      const entries = await fs.readDir("/projects").catch(() => []);
      expect(entries).toHaveLength(0);
    });
  });

  describe("concurrent mutations (#1531)", () => {
    it("does not lose updates when creates race (serialized read-modify-write)", async () => {
      // Fire many creates without awaiting between them: each does a
      // read-modify-write of the metadata file. Without serialization the
      // later saveProjects clobbers the earlier ones.
      const created = await Promise.all(
        Array.from({ length: 8 }, (_, i) => pm.createProject(`P${i}`)),
      );
      const projects = await pm.listProjects();
      expect(projects).toHaveLength(8);
      expect(new Set(projects.map((p) => p.id))).toEqual(new Set(created.map((p) => p.id)));
    });

    it("does not drop the survivor when a create and a delete race", async () => {
      const keep = await pm.createProject("Keep");
      const [, doomed] = await Promise.all([
        pm.createProject("Another"),
        pm.createProject("Doomed"),
      ]);
      await Promise.all([pm.createProject("Late"), pm.deleteProject(doomed.id)]);

      const projects = await pm.listProjects();
      const names = projects.map((p) => p.name).sort();
      expect(names).toEqual(["Another", "Keep", "Late"]);
      expect(projects.some((p) => p.id === keep.id)).toBe(true);
    });
  });

  describe("deleteProject", () => {
    it("removes project and its files", async () => {
      const project = await pm.createProject("To Delete");
      await pm.deleteProject(project.id);

      const projects = await pm.listProjects();
      expect(projects).toHaveLength(0);

      // ファイルも削除されている
      expect(await fs.exists(project.rootPath)).toBe(false);
    });

    it("throws when project not found", async () => {
      await expect(pm.deleteProject("nonexistent")).rejects.toThrow("Project not found");
    });
  });

  describe("renameProject", () => {
    it("updates project name", async () => {
      const project = await pm.createProject("Old Name");
      const updated = await pm.renameProject(project.id, "New Name");

      expect(updated.name).toBe("New Name");
      expect(updated.id).toBe(project.id);

      // メタデータにも反映されている
      const found = await pm.getProject(project.id);
      expect(found?.name).toBe("New Name");
    });

    it("throws when project not found", async () => {
      await expect(pm.renameProject("nonexistent", "Name")).rejects.toThrow("Project not found");
    });
  });

  describe("getProject", () => {
    it("returns project by id", async () => {
      const project = await pm.createProject("Findable");
      const found = await pm.getProject(project.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("Findable");
    });

    it("returns null for non-existent id", async () => {
      const found = await pm.getProject("nonexistent");
      expect(found).toBeNull();
    });
  });
});
