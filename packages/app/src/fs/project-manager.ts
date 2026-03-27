import type { FileSystemProvider, Project } from "@karasu/core";

const META_PATH = "/meta/projects.json";

const DEFAULT_KRS = `system MyProject "My Project" {
  user User "User" [human] {
    description "A user of the system"
  }
  service App "Application" {
    description "Main application"
  }
  User -> App "uses"
}

deploy Production "Production" {
  oci appContainer "app-container" {
    runtime "Docker"
    realizes App
  }
}

organization Team "Team" {
  team dev "Development" {
    owns App
    member alice "Alice" {
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
  async createProject(name: string): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      rootPath: `/projects/${id}`,
      createdAt: now,
      updatedAt: now,
    };

    // プロジェクトディレクトリとデフォルトファイルを作成
    await this.fs.mkdir(project.rootPath);
    await this.fs.writeFile(`${project.rootPath}/index.krs`, DEFAULT_KRS);

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
