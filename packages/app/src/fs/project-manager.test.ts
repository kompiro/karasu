import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryFileSystemProvider } from "@karasu/core";
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

      const style = await fs.readFile(`${project.rootPath}/default.krs.style`);
      expect(style).toContain("user");
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
