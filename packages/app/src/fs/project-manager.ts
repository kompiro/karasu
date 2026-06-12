import { isSafeRelativePath } from "@karasu-tools/core";
import type { FileSystemProvider, Project } from "@karasu-tools/core";

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

  /** メタデータファイルからプロジェクト一覧を読み込む */
  async listProjects(): Promise<Project[]> {
    try {
      const content = await this.fs.readFile(META_PATH);
      return JSON.parse(content) as Project[];
    } catch {
      return [];
    }
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

    // メタデータ更新
    const projects = await this.listProjects();
    projects.push(project);
    await this.saveProjects(projects);

    return project;
  }

  /** プロジェクトを削除する */
  async deleteProject(id: string): Promise<void> {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    // ディレクトリ削除
    await this.fs.delete(project.rootPath);

    // メタデータ更新
    const remaining = projects.filter((p) => p.id !== id);
    await this.saveProjects(remaining);
  }

  /** プロジェクトをリネームする */
  async renameProject(id: string, newName: string): Promise<Project> {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    project.name = newName;
    project.updatedAt = new Date().toISOString();
    await this.saveProjects(projects);

    return project;
  }

  /** ID でプロジェクトを取得する */
  async getProject(id: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === id) ?? null;
  }
}
