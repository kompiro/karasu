import { isSafeRelativePath } from "@karasu-tools/core";
import type { FileSystemProvider, Project } from "@karasu-tools/core";
import { SerialQueue } from "./serial-queue.js";

const META_PATH = "/meta/projects.json";

const DEFAULT_KRS = `system MyProject {
  label "My Project"
  user User [human] {
    label "User"
    description "A user of the system"
  }
  service App {
    label "Application"
    description "Main application"
  }
  User -> App "uses"
}

deploy Production {
  label "Production"
  oci appContainer {
    label "app-container"
    runtime "Docker"
    realizes App
  }
}

organization Team {
  label "Team"
  team dev {
    label "Development"
    owns App
    member alice {
      label "Alice"
      description "Tech lead"
    }
  }
}
`;

/**
 * ProjectManager — プロジェクトの CRUD を管理する。
 * メタデータは /meta/projects.json に格納される。
 */
export class ProjectManager {
  constructor(private fs: FileSystemProvider) {}

  /**
   * Serializes the metadata read-modify-write (#1531). Without it, two
   * concurrent mutations (a create during an import, or React StrictMode's
   * double bootstrap) let the later `saveProjects` clobber the earlier one and
   * silently drop projects.
   */
  private queue = new SerialQueue();

  /** メタデータファイルからプロジェクト一覧を読み込む */
  async listProjects(): Promise<Project[]> {
    // Distinguish "no metadata yet" (first run → empty list) from a real read /
    // parse failure (#1531). Swallowing the latter as `[]` would make the next
    // create/import overwrite the metadata file and wipe every other project.
    if (!(await this.fs.exists(META_PATH))) {
      return [];
    }
    const content = await this.fs.readFile(META_PATH);
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("Project metadata is corrupt: expected an array");
    }
    return parsed as Project[];
  }

  /** メタデータファイルにプロジェクト一覧を保存する */
  private async saveProjects(projects: Project[]): Promise<void> {
    await this.fs.writeFile(META_PATH, JSON.stringify(projects, null, 2));
  }

  /** 新規プロジェクトを作成する */
  async createProject(name: string, files?: { path: string; content: string }[]): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      rootPath: `/projects/${id}`,
      createdAt: now,
      updatedAt: now,
    };

    // プロジェクトディレクトリを作成
    await this.fs.mkdir(project.rootPath);

    // ファイルを書き込む（指定がなければデフォルト）
    const filesToWrite = files ?? [{ path: "index.krs", content: DEFAULT_KRS }];
    for (const file of filesToWrite) {
      // Write-boundary guard (#1526 / TPL-20260510-17): callers are expected to
      // pre-sanitize (the ZIP importer does), but every importer reaches this
      // write, and the in-memory provider's normalizePath collapses "..", so an
      // unvetted path could escape rootPath. Throw rather than silently skip —
      // an unsafe path reaching this layer is a caller bug or an attack.
      if (!isSafeRelativePath(file.path)) {
        throw new Error(`Unsafe project file path: "${file.path}"`);
      }
      await this.fs.writeFile(`${project.rootPath}/${file.path}`, file.content);
    }

    // メタデータの read-modify-write は直列化して lost update を防ぐ。
    try {
      await this.queue.run(async () => {
        const projects = await this.listProjects();
        projects.push(project);
        await this.saveProjects(projects);
      });
    } catch (err) {
      // The files are already on disk but the metadata commit failed (e.g.
      // listProjects threw on corrupt metadata). Roll back the now-orphaned
      // directory so a failed create leaves nothing behind.
      await this.fs.delete(project.rootPath).catch(() => {});
      throw err;
    }

    return project;
  }

  /** プロジェクトを削除する */
  async deleteProject(id: string): Promise<void> {
    await this.queue.run(async () => {
      const projects = await this.listProjects();
      const project = projects.find((p) => p.id === id);
      if (!project) {
        throw new Error(`Project not found: ${id}`);
      }
      await this.fs.delete(project.rootPath);
      const remaining = projects.filter((p) => p.id !== id);
      await this.saveProjects(remaining);
    });
  }

  /** プロジェクトをリネームする */
  async renameProject(id: string, newName: string): Promise<Project> {
    return this.queue.run(async () => {
      const projects = await this.listProjects();
      const project = projects.find((p) => p.id === id);
      if (!project) {
        throw new Error(`Project not found: ${id}`);
      }
      project.name = newName;
      project.updatedAt = new Date().toISOString();
      await this.saveProjects(projects);
      return project;
    });
  }

  /** ID でプロジェクトを取得する */
  async getProject(id: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === id) ?? null;
  }
}
