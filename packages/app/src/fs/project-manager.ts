import type { FileSystemProvider, Project } from "@karasu/core";

const META_PATH = "/meta/projects.json";

const DEFAULT_KRS = `@import "default.krs.style"

system "New Project" {
  user User "User" {
    description "A user of the system"
  }
  service App "Application" {
    description "Main application"
  }
  User -> App "uses"
}
`;

const DEFAULT_STYLE = `user {
  background-color: #1D4ED8;
  color: #FFFFFF;
  border-color: #1E40AF;
  border-width: 2;
  shape: user;
  font-weight: bold;
  font-size: 13;
}

service {
  background-color: #0369A1;
  color: #FFFFFF;
  border-color: #075985;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

[external] {
  background-color: #1F2937;
  border-style: dashed;
}

domain {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

usecase {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

resource {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 2;
  font-size: 12;
}

edge {
  color: #94A3B8;
  stroke-width: 1.5;
  font-size: 11;
}

edge[async] {
  stroke-style: dashed;
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
    await this.fs.writeFile(`${project.rootPath}/default.krs.style`, DEFAULT_STYLE);

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
