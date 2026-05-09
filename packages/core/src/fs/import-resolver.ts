import type { FileSystemProvider, DirEntry } from "./types.js";
import type {
  Diagnostic,
  KrsFile,
  SystemNode,
  KrsNode,
  ServiceNode,
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
  /** ディレクトリ import の展開結果キャッシュ（Pass 1 で構築、Pass 2 で参照） */
  private dirExpansions = new Map<string, string[]>();

  constructor(private fs: FileSystemProvider) {}

  /**
   * エントリ .krs ファイルから再帰的にすべての import を解決し、
   * マージ済みの KrsFile とスタイルシートを返す。
   */
  async resolve(entryPath: string): Promise<ResolvedProject> {
    this.visitedKrs.clear();
    this.visitedStyles.clear();
    this.diagnostics = [];
    this.dirExpansions.clear();

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
        code: "circular-import",
        params: { filePath },
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
        code: "file-not-found",
        params: { filePath },
      });
      return;
    }

    const parseResult = Parser.parse(source);
    this.diagnostics.push(...parseResult.diagnostics);
    fileMap.set(filePath, parseResult.value);

    for (const nodeImport of parseResult.value.nodeImports) {
      if (nodeImport.path === "") continue;
      if (nodeImport.path.endsWith("/")) {
        // ディレクトリ import: 配下の .krs ファイルを展開してそれぞれロード
        // import 元ファイル自身は除外（同一ディレクトリから import した場合の自己参照を防ぐ）
        const dirPath = resolvePath(filePath, nodeImport.path);
        const allExpanded = await this.expandDirectoryKrsFiles(dirPath, nodeImport);
        const expanded = allExpanded.filter((p) => p !== filePath);
        this.dirExpansions.set(dirPath, expanded);
        for (const krsFilePath of expanded) {
          await this.loadFileRecursive(krsFilePath, fileMap);
        }
      } else {
        const importPath = resolvePath(filePath, nodeImport.path);
        await this.loadFileRecursive(importPath, fileMap);
      }
    }
  }

  /**
   * ディレクトリ内の .krs ファイルをアルファベット順で列挙する。
   * サブディレクトリは対象外（フラット展開のみ）。
   */
  private async expandDirectoryKrsFiles(
    dirPath: string,
    nodeImport: ImportDeclaration,
  ): Promise<string[]> {
    let entries: DirEntry[];
    try {
      entries = await this.fs.readDir(dirPath);
    } catch {
      this.diagnostics.push({
        severity: "error",
        code: "directory-not-found",
        params: { dirPath },
        loc: nodeImport.loc,
      });
      return [];
    }
    return entries
      .filter((e) => e.kind === "file" && e.name.endsWith(".krs"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => `${dirPath}/${e.name}`);
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
      clients: [],
      domains: [],
      databases: [],
      queues: [],
      storages: [],
      deploys: [],
      organizations: [],
      legends: [],
      ownerIndex: new Map(),
      nodePathIndex: new Map(),
      nodeFileIndex: new Map(),
    };

    if (visited.has(filePath)) return mergedFile;
    visited.add(filePath);

    const file = fileMap.get(filePath);
    if (!file) return mergedFile;

    // 自身のコンテンツをマージ
    mergedFile.styleImports.push(...file.styleImports);
    mergedFile.systems.push(...file.systems);
    mergedFile.services.push(...file.services);
    mergedFile.clients.push(...(file.clients ?? []));
    mergedFile.domains.push(...file.domains);
    mergedFile.databases.push(...(file.databases ?? []));
    mergedFile.queues.push(...(file.queues ?? []));
    mergedFile.storages.push(...(file.storages ?? []));
    mergedFile.deploys.push(...file.deploys);
    mergedFile.organizations.push(...file.organizations);
    mergedFile.legends.push(...(file.legends ?? []));
    for (const [ownedId, teamId] of file.ownerIndex) {
      mergedFile.ownerIndex.set(ownedId, teamId);
    }
    for (const [nodeId, path] of file.nodePathIndex) {
      if (!mergedFile.nodePathIndex.has(nodeId)) {
        mergedFile.nodePathIndex.set(nodeId, path);
      }
    }
    // Record definition file for all nodes defined in this file (full recursive walk)
    const indexNode = (node: KrsNode): void => {
      if (!mergedFile.nodeFileIndex.has(node.id)) {
        mergedFile.nodeFileIndex.set(node.id, filePath);
      }
      for (const child of node.children) {
        indexNode(child);
      }
    };
    for (const system of file.systems) {
      if (!mergedFile.nodeFileIndex.has(system.id)) {
        mergedFile.nodeFileIndex.set(system.id, filePath);
      }
      for (const child of system.children) {
        indexNode(child);
      }
    }
    for (const service of file.services) {
      if (!mergedFile.nodeFileIndex.has(service.id)) {
        mergedFile.nodeFileIndex.set(service.id, filePath);
      }
    }
    for (const client of file.clients ?? []) {
      if (!mergedFile.nodeFileIndex.has(client.id)) {
        mergedFile.nodeFileIndex.set(client.id, filePath);
      }
    }

    // import を処理
    for (const nodeImport of file.nodeImports) {
      if (nodeImport.path === "") continue;

      if (nodeImport.path.endsWith("/")) {
        // ディレクトリ import: Pass 1 で展開済みのファイルを順番にマージ
        const dirPath = resolvePath(filePath, nodeImport.path);
        const expandedFiles = this.dirExpansions.get(dirPath) ?? [];
        for (const krsFilePath of expandedFiles) {
          const resolvedImported = this.resolveKrsFromMap(fileMap, krsFilePath, visited);
          this.mergeWildcardResolved(mergedFile, resolvedImported);
        }
        continue;
      }

      const importPath = resolvePath(filePath, nodeImport.path);
      const rawImported = fileMap.get(importPath);
      if (!rawImported) continue;

      // Case B 警告: ワイルドカードかつ未処理のファイルに top-level service がある場合
      const isWildcard = nodeImport.ids.length === 0;
      if (isWildcard && !visited.has(importPath)) {
        for (const service of rawImported.services) {
          this.diagnostics.push({
            severity: "warning",
            code: "service-outside-system",
            params: { serviceId: service.id },
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
    for (const [nodeId, filePath] of resolved.nodeFileIndex) {
      if (!mergedFile.nodeFileIndex.has(nodeId)) {
        mergedFile.nodeFileIndex.set(nodeId, filePath);
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
          code: "duplicate-node-in-system",
          params: { nodeId: child.id, systemId: target.id },
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
          code: "duplicate-node-in-deploy",
          params: { nodeId: node.id, deployId: target.id },
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
          code: "duplicate-team-in-organization",
          params: { teamId: team.id, orgId: target.id },
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
    for (const idPath of nodeImport.ids) {
      if (idPath.length === 1) {
        this.resolveBareIdImport(mergedFile, importedFile, idPath[0], nodeImport);
      } else {
        this.resolveMultiSegmentImport(mergedFile, importedFile, idPath, nodeImport);
      }
    }

    mergedFile.styleImports.push(...importedFile.styleImports);
    for (const [nodeId, filePath] of importedFile.nodeFileIndex) {
      if (!mergedFile.nodeFileIndex.has(nodeId)) {
        mergedFile.nodeFileIndex.set(nodeId, filePath);
      }
    }
  }

  /**
   * Resolve a bare id (`import { Foo }`) — preserves the historical
   * single-id lookup against system ids, direct system children,
   * top-level services, and deploy nodes. Behavior is unchanged from
   * before path syntax existed.
   */
  private resolveBareIdImport(
    mergedFile: KrsFile,
    importedFile: KrsFile,
    id: string,
    nodeImport: ImportDeclaration,
  ): void {
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
        // トップレベル service を system の child として組み込む。
        // 優先順位:
        //   1. スタブ（body なし宣言）があれば: タグ・アノテーションを保持して定義で補完する
        //   2. スタブはないが system の edges で参照されていれば: child として追加する
        //   3. どちらでもなければ: トップレベル service としてそのままマージする
        let mergedIntoSystem = false;
        for (const system of mergedFile.systems) {
          const stubIndex = system.children.findIndex((c) => c.id === id && c.kind === "service");
          if (stubIndex >= 0) {
            // 1. スタブあり: タグ・アノテーションを保持して定義で補完する
            const stub = system.children[stubIndex] as ServiceNode;
            system.children[stubIndex] = {
              ...service,
              tags: stub.tags.length > 0 ? stub.tags : service.tags,
              annotations: stub.annotations.length > 0 ? stub.annotations : service.annotations,
            };
            mergedIntoSystem = true;
          } else if (system.edges.some((e) => e.from === id || e.to === id)) {
            // 2. スタブなし・edges で参照あり: child として追加する
            system.children.push(service);
            mergedIntoSystem = true;
          }
        }
        if (!mergedIntoSystem) {
          // 3. どの system にも属さない場合はトップレベル service としてそのままマージする
          mergedFile.services.push(service);
        }
        found = true;
      }
    }

    for (const deploy of importedFile.deploys) {
      const matchingNodes = deploy.nodes.filter((n) => n.id === id);
      if (matchingNodes.length > 0) {
        found = true;
        const existingDeploy = mergedFile.deploys.find((d) => d.id === deploy.id);
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
        code: "import-id-not-found",
        params: { id, path: nodeImport.path },
        loc: nodeImport.loc,
      });
    }
  }

  /**
   * Resolve a multi-segment path (`import { Sys.Svc.Dom }`) introduced by
   * Issue #927.
   *
   * Walks the path id-only (no kind whitelist) starting from a top-level
   * `system` in the imported file, descending into `children` for each
   * subsequent segment. Emits `import-path-not-found` with `failedAt` /
   * `lastResolvedId` when any segment cannot be matched.
   *
   * On success the leaf is merged into the appropriate system in
   * `mergedFile`, materializing minimal stubs of intermediate ancestors
   * (id + label + properties only) when they don't already exist. The
   * leaf itself is copied with its full subtree, mirroring how a
   * targeted bare-id import behaves today.
   */
  private resolveMultiSegmentImport(
    mergedFile: KrsFile,
    importedFile: KrsFile,
    path: string[],
    nodeImport: ImportDeclaration,
  ): void {
    // segment 0 must resolve to a top-level `system` in the imported file.
    // Top-level services / domains / deploy nodes are intentionally not
    // valid path roots — they have no meaningful nested ancestry.
    const rootSystem = importedFile.systems.find((s) => s.id === path[0]);
    if (!rootSystem) {
      this.diagnostics.push({
        severity: "error",
        code: "import-path-not-found",
        params: { path, failedAt: 0, importPath: nodeImport.path },
        loc: nodeImport.loc,
      });
      return;
    }

    // Walk path[1..] through `children`, recording ancestors so the merge
    // step can reproduce the chain in `mergedFile`.
    const ancestorsBetween: KrsNode[] = [];
    let cursor: KrsNode = rootSystem;
    for (let i = 1; i < path.length; i++) {
      const segment = path[i];
      const child: KrsNode | undefined = cursor.children.find((c) => c.id === segment);
      if (!child) {
        this.diagnostics.push({
          severity: "error",
          code: "import-path-not-found",
          params: {
            path,
            failedAt: i,
            importPath: nodeImport.path,
            lastResolvedId: cursor.id,
          },
          loc: nodeImport.loc,
        });
        return;
      }
      // The previous cursor becomes an ancestor between root and leaf.
      // (When i === 1 this is the rootSystem itself, but we handle the
      // root specially below to keep the merge target explicit.)
      if (i > 1) {
        ancestorsBetween.push(cursor);
      }
      cursor = child;
    }

    // Materialize the path in mergedFile.systems, preserving any nodes
    // already imported by other statements.
    let targetSystem = mergedFile.systems.find((s) => s.id === rootSystem.id);
    if (!targetSystem) {
      // Shallow stub: copy id / label / properties / loc but start with no
      // children or edges so other imports targeting the same system can
      // populate it.
      targetSystem = {
        ...rootSystem,
        children: [],
        edges: [],
      };
      mergedFile.systems.push(targetSystem);
    }

    let parentChildren: KrsNode[] = targetSystem.children;
    for (const ancestor of ancestorsBetween) {
      let existing = parentChildren.find((c) => c.id === ancestor.id);
      if (!existing) {
        // Minimal ancestor stub — id, label, kind, and metadata, but no
        // children or edges so we don't accidentally over-import sibling
        // nodes the user did not request.
        existing = {
          ...ancestor,
          children: [],
          edges: [],
        } as KrsNode;
        parentChildren.push(existing);
      }
      parentChildren = existing.children;
    }

    // Push the leaf as the final child if not already present (idempotent
    // across multiple imports).
    const alreadyPresent = parentChildren.some((c) => c.id === cursor.id && c.kind === cursor.kind);
    if (!alreadyPresent) {
      parentChildren.push(cursor);
    }
  }

  /**
   * import されたノードを既存の system にマージする。
   * 同名の system が存在すればその children にマージし、
   * なければ新しい system は追加しない（ノード単独では意味をなさないため）。
   */
  private mergeNodeIntoSystems(systems: SystemNode[], sourceSystem: KrsNode, node: KrsNode): void {
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
        code: "circular-style-import",
        params: { filePath },
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
        code: "style-file-not-found",
        params: { filePath },
      });
      return null;
    }

    const parseResult = StyleParser.parse(source, filePath);
    this.diagnostics.push(...parseResult.diagnostics);

    return parseResult.value;
  }
}
