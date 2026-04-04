import type { FileSystemProvider } from "./types.js";
import type {
  Diagnostic,
  KrsFile,
  SystemNode,
  KrsNode,
  DeployBlock,
  OrganizationBlock,
  ImportDeclaration,
} from "../types/ast.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { resolvePath } from "./path-utils.js";
import type { StyleSheet } from "../types/style.js";

export interface ResolvedProject {
  /** マージ済みの KrsFile（全ファイルの system / deploy を統合） */
  krsFile: KrsFile;
  /** 解決済みのスタイルシート群（cascade 順） */
  styleSheets: StyleSheet[];
  /** 解決中に発生した diagnostic */
  diagnostics: Diagnostic[];
}

/**
 * ImportResolver — @import と import { } from / import "..." を再帰的に解決する。
 *
 * 2 パス構成:
 *   Pass 1: 全ファイルをパースして Map<filePath, KrsFile> に収集（循環検出）
 *   Pass 2: resolveKrsFromMap でエントリから再帰的にマージ
 *           - ワイルドカード import: 同名 system/deploy/org をマージ（重複 ID は error）
 *           - Named import: 指定 ID のノードのみをマージ（既存動作）
 */
export class ImportResolver {
  private visitedKrs = new Set<string>();
  private visitedStyles = new Set<string>();
  private diagnostics: Diagnostic[] = [];

  constructor(private fs: FileSystemProvider) {}

  /**
   * エントリ .krs ファイルから再帰的にすべての import を解決し、
   * マージ済みの KrsFile とスタイルシートを返す。
   */
  async resolve(entryPath: string): Promise<ResolvedProject> {
    this.visitedKrs.clear();
    this.visitedStyles.clear();
    this.diagnostics = [];

    // Pass 1: 全ファイルをロード（循環検出・ファイル不在の報告）
    const fileMap = await this.loadFileMap(entryPath);

    // Pass 2: エントリから再帰的にマージ（Pass 1 とは別の visited セット）
    const mergeVisited = new Set<string>();
    const krsFile = this.resolveKrsFromMap(fileMap, entryPath, mergeVisited);

    const styleSheets = await this.resolveStyles(entryPath, krsFile.styleImports);

    return {
      krsFile,
      styleSheets,
      diagnostics: this.diagnostics,
    };
  }

  // ─── Pass 1: ファイルロード ────────────────────────────────────────────────

  private async loadFileMap(entryPath: string): Promise<Map<string, KrsFile>> {
    const fileMap = new Map<string, KrsFile>();
    await this.loadFileRecursive(entryPath, fileMap);
    return fileMap;
  }

  private async loadFileRecursive(filePath: string, fileMap: Map<string, KrsFile>): Promise<void> {
    if (this.visitedKrs.has(filePath)) {
      this.diagnostics.push({
        severity: "warning",
        message: `Circular import detected: ${filePath}`,
      });
      return;
    }
    this.visitedKrs.add(filePath);

    let source: string;
    try {
      source = await this.fs.readFile(filePath);
    } catch {
      this.diagnostics.push({
        severity: "error",
        message: `File not found: ${filePath}`,
      });
      return;
    }

    const parseResult = Parser.parse(source);
    this.diagnostics.push(...parseResult.diagnostics);
    fileMap.set(filePath, parseResult.value);

    for (const nodeImport of parseResult.value.nodeImports) {
      if (nodeImport.path === "") continue;
      const importPath = resolvePath(filePath, nodeImport.path);
      await this.loadFileRecursive(importPath, fileMap);
    }
  }

  // ─── Pass 2: 再帰マージ ───────────────────────────────────────────────────

  /**
   * fileMap を参照し、filePath のファイルを完全解決した KrsFile を返す。
   * 自身のコンテンツ + 全 import を再帰的にマージした結果。
   */
  private resolveKrsFromMap(
    fileMap: Map<string, KrsFile>,
    filePath: string,
    visited: Set<string>,
  ): KrsFile {
    const mergedFile: KrsFile = {
      styleImports: [],
      nodeImports: [],
      systems: [],
      services: [],
      domains: [],
      deploys: [],
      organizations: [],
      ownerIndex: new Map(),
      nodePathIndex: new Map(),
    };

    if (visited.has(filePath)) return mergedFile;
    visited.add(filePath);

    const file = fileMap.get(filePath);
    if (!file) return mergedFile;

    // 自身のコンテンツをマージ
    mergedFile.styleImports.push(...file.styleImports);
    mergedFile.systems.push(...file.systems);
    mergedFile.services.push(...file.services);
    mergedFile.domains.push(...file.domains);
    mergedFile.deploys.push(...file.deploys);
    mergedFile.organizations.push(...file.organizations);
    for (const [ownedId, teamId] of file.ownerIndex) {
      mergedFile.ownerIndex.set(ownedId, teamId);
    }
    for (const [nodeId, path] of file.nodePathIndex) {
      if (!mergedFile.nodePathIndex.has(nodeId)) {
        mergedFile.nodePathIndex.set(nodeId, path);
      }
    }

    // import を処理
    for (const nodeImport of file.nodeImports) {
      if (nodeImport.path === "") continue;
      const importPath = resolvePath(filePath, nodeImport.path);
      const rawImported = fileMap.get(importPath);
      if (!rawImported) continue;

      // Case B 警告: ワイルドカードかつ未処理のファイルに top-level service がある場合
      const isWildcard = nodeImport.ids.length === 0;
      if (isWildcard && !visited.has(importPath)) {
        for (const service of rawImported.services) {
          this.diagnostics.push({
            severity: "warning",
            message: `"${service.id}" is declared outside any system block — system membership is ambiguous`,
            loc: nodeImport.loc,
          });
        }
      }

      // import 先を再帰解決（visited を共有することで重複ロードを防ぐ）
      const resolvedImported = this.resolveKrsFromMap(fileMap, importPath, visited);

      if (isWildcard) {
        // ワイルドカード: 全ブロックをマージ（同名 → dedup）
        this.mergeWildcardResolved(mergedFile, resolvedImported);
      } else {
        // Named: 指定 ID のノードのみをマージ
        this.mergeNamedImport(mergedFile, resolvedImported, nodeImport);
      }
    }

    return mergedFile;
  }

  // ─── Wildcard merge ───────────────────────────────────────────────────────

  /**
   * resolveKrsFromMap で解決済みの KrsFile を mergedFile にマージする。
   * 同名の system / deploy / organization は children / nodes / teams をマージし、
   * 重複 ID は error diagnostic を出す。
   */
  private mergeWildcardResolved(mergedFile: KrsFile, resolved: KrsFile): void {
    for (const system of resolved.systems) {
      const existing = mergedFile.systems.find((s) => s.id === system.id);
      if (existing) {
        this.mergeSystemIntoExisting(existing, system);
      } else {
        mergedFile.systems.push(system);
      }
    }

    for (const deploy of resolved.deploys) {
      const existing = mergedFile.deploys.find((d) => d.id === deploy.id);
      if (existing) {
        this.mergeDeployIntoExisting(existing, deploy);
      } else {
        mergedFile.deploys.push(deploy);
      }
    }

    for (const org of resolved.organizations) {
      const existing = mergedFile.organizations.find((o) => o.id === org.id);
      if (existing) {
        this.mergeOrgIntoExisting(existing, org);
      } else {
        mergedFile.organizations.push(org);
      }
    }

    // services（Case B 警告は resolveKrsFromMap 側で発行済み）
    for (const service of resolved.services) {
      mergedFile.services.push(service);
    }

    for (const [ownedId, teamId] of resolved.ownerIndex) {
      mergedFile.ownerIndex.set(ownedId, teamId);
    }
    for (const [nodeId, path] of resolved.nodePathIndex) {
      if (!mergedFile.nodePathIndex.has(nodeId)) {
        mergedFile.nodePathIndex.set(nodeId, path);
      }
    }
    mergedFile.styleImports.push(...resolved.styleImports);
  }

  private mergeSystemIntoExisting(target: SystemNode, source: SystemNode): void {
    for (const child of source.children) {
      const alreadyExists = target.children.some((c) => c.id === child.id);
      if (alreadyExists) {
        this.diagnostics.push({
          severity: "error",
          message: `Duplicate node ID "${child.id}" in system "${target.id}"`,
        });
      } else {
        target.children.push(child);
      }
    }
    for (const edge of source.edges) {
      const edgeExists = target.edges.some((e) => e.from === edge.from && e.to === edge.to);
      if (!edgeExists) {
        target.edges.push(edge);
      }
    }
  }

  private mergeDeployIntoExisting(target: DeployBlock, source: DeployBlock): void {
    for (const node of source.nodes) {
      const alreadyExists = target.nodes.some((n) => n.id === node.id);
      if (alreadyExists) {
        this.diagnostics.push({
          severity: "error",
          message: `Duplicate node ID "${node.id}" in deploy block "${target.id}"`,
        });
      } else {
        target.nodes.push(node);
      }
    }
  }

  private mergeOrgIntoExisting(target: OrganizationBlock, source: OrganizationBlock): void {
    for (const team of source.teams) {
      const alreadyExists = target.teams.some((t) => t.id === team.id);
      if (alreadyExists) {
        this.diagnostics.push({
          severity: "error",
          message: `Duplicate team ID "${team.id}" in organization "${target.id}"`,
        });
      } else {
        target.teams.push(team);
      }
    }
  }

  // ─── Named import（既存ロジック） ─────────────────────────────────────────

  private mergeNamedImport(
    mergedFile: KrsFile,
    importedFile: KrsFile,
    nodeImport: ImportDeclaration,
  ): void {
    for (const id of nodeImport.ids) {
      let found = false;

      for (const system of importedFile.systems) {
        const matchingChildren = system.children.filter((child) => child.id === id);
        if (matchingChildren.length > 0) {
          for (const matchedChild of matchingChildren) {
            this.mergeNodeIntoSystems(mergedFile.systems, system, matchedChild);
          }
          found = true;
        }

        if (system.id === id) {
          mergedFile.systems.push(system);
          found = true;
        }
      }

      for (const service of importedFile.services) {
        if (service.id === id) {
          mergedFile.services.push(service);
          found = true;
        }
      }

      for (const deploy of importedFile.deploys) {
        const matchingNodes = deploy.nodes.filter((n) => n.id === id);
        if (matchingNodes.length > 0) {
          found = true;
          const existingDeploy = mergedFile.deploys.find((d) => d.label === deploy.label);
          if (existingDeploy) {
            existingDeploy.nodes.push(...matchingNodes);
          } else {
            mergedFile.deploys.push({
              ...deploy,
              nodes: [...matchingNodes],
            });
          }
        }
      }

      if (!found) {
        this.diagnostics.push({
          severity: "error",
          message: `Imported identifier "${id}" not found in ${nodeImport.path}`,
          loc: nodeImport.loc,
        });
      }
    }

    mergedFile.styleImports.push(...importedFile.styleImports);
  }

  /**
   * import されたノードを既存の system にマージする。
   * 同名の system が存在すればその children にマージし、
   * なければ新しい system は追加しない（ノード単独では意味をなさないため）。
   */
  private mergeNodeIntoSystems(
    systems: SystemNode[],
    sourceSystem: KrsNode,
    node: KrsNode,
  ): void {
    const targetSystem = systems.find((s) => s.id === sourceSystem.id);
    if (targetSystem) {
      const alreadyExists = targetSystem.children.some(
        (c) => c.id === node.id && c.kind === node.kind,
      );
      if (!alreadyExists) {
        targetSystem.children.push(node);
      }
      for (const edge of sourceSystem.edges) {
        if (edge.from === node.id || edge.to === node.id) {
          const edgeExists = targetSystem.edges.some(
            (e) => e.from === edge.from && e.to === edge.to,
          );
          if (!edgeExists) {
            targetSystem.edges.push(edge);
          }
        }
      }
    }
  }

  // ─── Style resolution ─────────────────────────────────────────────────────

  private async resolveStyles(basePath: string, styleImports: string[]): Promise<StyleSheet[]> {
    const sheets: StyleSheet[] = [];

    for (const importPath of styleImports) {
      const resolvedPath = resolvePath(basePath, importPath);
      const sheet = await this.resolveStyleFile(resolvedPath);
      if (sheet) {
        sheets.push(sheet);
      }
    }

    return sheets;
  }

  private async resolveStyleFile(filePath: string): Promise<StyleSheet | null> {
    if (this.visitedStyles.has(filePath)) {
      this.diagnostics.push({
        severity: "warning",
        message: `Circular style import detected: ${filePath}`,
      });
      return null;
    }
    this.visitedStyles.add(filePath);

    let source: string;
    try {
      source = await this.fs.readFile(filePath);
    } catch {
      this.diagnostics.push({
        severity: "warning",
        message: `Style file not found: ${filePath}`,
      });
      return null;
    }

    const parseResult = StyleParser.parse(source);
    this.diagnostics.push(...parseResult.diagnostics);

    return parseResult.value;
  }
}
