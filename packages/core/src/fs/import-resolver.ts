import type { FileSystemProvider, DirEntry } from "./types.js";
import type {
  Diagnostic,
  DiagnosticCode,
  KrsFile,
  SystemNode,
  KrsNode,
  ServiceNode,
  DeployBlock,
  OrganizationBlock,
  ImportDeclaration,
  ImportEntry,
} from "../types/ast.js";
import { createEmptyKrsFile } from "../types/ast.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import {
  validateOwnsReferences,
  validateContainsReferences,
  validateScopedContainsReferences,
  validateRealizesReferences,
  declaredNodePathsOnce,
  validatePhysicalRefs,
  validateFacetDeclarations,
  buildFacetIndex,
  buildOwnerIndex,
  buildBoundaryMembership,
  buildScopedBoundaryMembership,
  buildNodePathIndex,
} from "../parser/reference-validation.js";
import { resolvePath } from "./path-utils.js";
import {
  ambiguousNodePathCandidates,
  nodePathKey,
  resolveNodePathBySuffix,
} from "../parser/node-path.js";

/** One candidate chain of an imported file: the nodes, and their id path. */
interface ImportChain {
  path: string[];
  chain: KrsNode[];
}
import type { StyleSheet } from "../types/style.js";

/**
 * Diagnostics that are only decidable after the cross-file merge: reference
 * existence first (Issue #2032), and since #2221 the declaration-multiplicity
 * verdicts too (`duplicate-*`, `node-id-multiple-locations`). Their per-file
 * verdict is dropped during Pass 1 and re-derived against the merged model in
 * `resolve()`.
 *
 * Adding a code here carries a precondition: the rebuild only sees declarations
 * that reached `krsFile`. For a multiplicity verdict that means a collision
 * confined to a file only some of which is named-imported is dropped and not
 * re-derived — deliberately, since those declarations are not in the project's
 * model at all (the editor still reports them per file, the LSP parsing each
 * document on its own). A code whose verdict must survive for un-merged
 * declarations does not belong in this set.
 *
 * Still load-bearing after #2410, though for a narrower set of files: a file that
 * *has* imports now produces no verdict to drop, because the validators decline
 * to decide there. What this strip catches is the **import-less leaf** — a file
 * with no imports of its own whose `contains` / `owns` target is only satisfied
 * once the importing file's wildcard or `system` reopen adds the node. Its
 * per-file verdict is real and wrong, and only this strip removes it.
 */
const MERGED_SPACE_REFERENCE_CODES = new Set<DiagnosticCode>([
  "contains-target-not-found",
  "owns-target-not-found",
  // Ambiguity is decided against the same declared-node space as existence,
  // so it is import-coupled for the same reason (#2088 / ADR-2410).
  "owns-target-ambiguous",
  "contains-target-ambiguous",
  "realizes-target-ambiguous",
  // Co-ownership became a merged-model verdict when ownerIndex moved to the
  // rebuild pattern (#2548): two files each owning the same node is a fact no
  // single file can see, and the entry file's per-file infos would otherwise
  // double the rebuild's (same shape as duplicate-boundary-assignment below).
  "duplicate-owner-assignment",
  // The physical dot-notation refs (#2078). Shared infra is *canonically*
  // declared in a dedicated file every slice imports (§S4.5), so a per-file
  // verdict would warn on the recommended layout: every `resource ArticleDB.x`
  // in `reader.krs` would look unresolved because the block lives in
  // `infra.krs`. Suppressed per file, re-derived against the merged tree below.
  "unresolved-resource-ref",
  "unresolved-table-ref",
  // `facet` declarations merge across files, so uniqueness is a property of the
  // merged namespace. Suppressed per file and re-derived below — otherwise a
  // duplicate split across two files would go unreported, and a duplicate inside
  // one file would be reported twice (#2065 Part B).
  "duplicate-facet-id",
  // Multi-membership is a property of the merged declarations for the same
  // reason, and fails in the more dangerous direction: two files each listing
  // one boundary for the same node is a fact no single file can see, so a
  // per-file verdict does not over-report — it reports nothing at all
  // (#2221, TPL-2221).
  "duplicate-boundary-assignment",
  // Same reasoning, reachable since #2246: a reopened `system` (or infra block)
  // carries its scoped `boundary` blocks across, so two files can now declare
  // the same id in one scope. Neither file sees the collision alone.
  "duplicate-boundary-id",
  // Which ids are declared at more than one path is a merged-model fact for the
  // same reason (#2596): `system Legacy { service Search }` in one file and
  // `system Next { service Search }` in another collide in a way neither file
  // can see, so the per-file verdict reported nothing at all while the index
  // silently kept whichever file merged first. Re-derived below together with
  // the index it explains.
  "node-id-multiple-locations",
]);

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
  /** Pass 1: 現在ロード中スタック（push on enter / pop on exit）— 真の循環検出に使う */
  private loadingKrs = new Set<string>();
  /** Pass 1: 読み込み完了 memo — DAG 再到達で warning を出さないために使う */
  private loadedKrs = new Set<string>();
  private visitedStyles = new Set<string>();
  private diagnostics: Diagnostic[] = [];
  /**
   * Which declarations each named-import stub stands for, so a second arrival
   * can tell "the same block, imported again" from "another file reopened
   * this block" (see `noteChainReopen`).
   */
  private chainOrigins = new WeakMap<KrsNode, Set<KrsNode>>();
  /** ディレクトリ import の展開結果キャッシュ（Pass 1 で構築、Pass 2 で参照） */
  private dirExpansions = new Map<string, string[]>();
  /** Pass 2: ファイル単位の解決済み KrsFile cache（DAG 経由の同一ファイル到達で再利用） */
  private resolvedCache = new Map<string, KrsFile>();
  /** Pass 2: 現在解決中スタック — resolveKrsFromMap の真の循環防止に使う */
  private resolvingKrs = new Set<string>();

  constructor(private fs: FileSystemProvider) {}

  /**
   * エントリ .krs ファイルから再帰的にすべての import を解決し、
   * マージ済みの KrsFile とスタイルシートを返す。
   */
  async resolve(entryPath: string): Promise<ResolvedProject> {
    this.loadingKrs.clear();
    this.loadedKrs.clear();
    this.visitedStyles.clear();
    this.diagnostics = [];
    this.dirExpansions.clear();
    this.resolvedCache.clear();
    this.resolvingKrs.clear();

    // Pass 1: 全ファイルをロード（循環検出・ファイル不在の報告）
    const fileMap = await this.loadFileMap(entryPath);

    // Pass 2: エントリから再帰的にマージ
    const krsFile = this.resolveKrsFromMap(fileMap, entryPath);

    // The bare-id navigation index is rebuilt from the merged tree rather than
    // unioned per file (#2596). The union could only ever answer within one
    // file: `node-id-multiple-locations` went silent across files, the winner
    // fell to whichever file merged first (so a cross-file `@migration_target`
    // lost to the `@deprecated` node it was replacing), and a named import
    // never carried an entry at all, leaving nodes that are in the merged tree
    // unreachable by bare-id permalink. One derivation for the index and its
    // diagnostic, as with ownership and boundary membership below (TPL-2221).
    //
    // Built here, before the checks below rather than beside them, so the
    // window where `krsFile.nodePathIndex` is an empty Map closes with the
    // merge. An empty index fails open — `.get(id)` is `undefined`, which reads
    // as "no such node" — so a future check that consults it while it is still
    // empty would silently resolve nothing rather than throw. That is exactly
    // how `owns` broke in #2082.
    const mergedNodePaths = buildNodePathIndex(krsFile);
    krsFile.nodePathIndex = mergedNodePaths.membership;
    this.diagnostics.push(...mergedNodePaths.diagnostics);

    // Reference-existence re-validation against the merged id-space. The
    // per-file pass suppressed these codes (see loadFileRecursive) because a
    // `contains` / `owns` target may be declared in a different file; only the
    // merged model can decide whether it truly exists (Issue #2032). Each
    // validator derives its valid-target set from the merged file it is handed
    // and carries its own guards, so single-file projects behave identically.
    //
    // That derivation is the point: `owns` used to read `krsFile.nodePathIndex`,
    // a per-file build that only travels across a wildcard import —
    // `mergeNamedImport` carries the node but not its index entry. So a
    // named-imported target was missing from the very space the check consulted
    // and warned, while the same declaration reached through `import "…"`
    // resolved. Re-deriving here was already right; the space it re-derived
    // against was not (#2082, TPL-2032).
    // One declared-path walk shared by the checks below, as in the Parser.
    const declaredPaths = declaredNodePathsOnce(krsFile);
    this.diagnostics.push(...validateOwnsReferences(krsFile, declaredPaths));
    if (krsFile.boundaries.length > 0) {
      this.diagnostics.push(...validateContainsReferences(krsFile, declaredPaths));
    }
    // Scoped boundaries (#2036) share the `contains-target-not-found` code, so
    // their per-file verdict was suppressed above too. Re-derive here or they
    // vanish entirely: cross-file `system` reopen can add the very child a
    // scoped `contains` names, so only the merged tree can decide.
    this.diagnostics.push(...validateScopedContainsReferences(krsFile));
    // Ambiguity for realizes path refs (#2088 slice C), decided on the merged
    // model like every reference check above.
    this.diagnostics.push(...validateRealizesReferences(krsFile, declaredPaths));
    // Physical dot-notation refs decide only here, for the same reason: the
    // `database` block a slice references usually lives in the infra file it
    // imports (#2078).
    this.diagnostics.push(...validatePhysicalRefs(krsFile));
    // Facet membership is rebuilt from the merged tree rather than merged
    // per file, so it cannot drift between merge paths (#2065 Part B).
    krsFile.facetIndex = buildFacetIndex([
      ...krsFile.systems,
      ...krsFile.services,
      ...krsFile.clients,
      ...krsFile.domains,
      ...krsFile.databases,
      ...krsFile.queues,
      ...krsFile.storages,
    ]);
    // Ownership is rebuilt from the merged declarations rather than unioned
    // per file (#2548): the index is path-keyed, and a path declared in one
    // file can only resolve against nodes another file contributes — a
    // per-file union cannot see either. The rebuild also makes cross-file
    // co-ownership visible (`duplicate-owner-assignment`), which the old
    // silent last-wins union never reported (TPL-2221).
    const mergedOwnership = buildOwnerIndex(krsFile);
    krsFile.ownerIndex = mergedOwnership.membership;
    this.diagnostics.push(...mergedOwnership.diagnostics);
    // Boundary membership is rebuilt from the merged declarations rather than
    // unioned per file, so the index and the diagnostic come from one derivation
    // (#2221). Both diagnostics the rebuild produces are merged-model verdicts:
    // multi-membership (#2221) and, since a reopened scope can now collect
    // blocks from two files, `duplicate-boundary-id` (#2246).
    const mergedMembership = buildBoundaryMembership(krsFile);
    krsFile.boundaryMembership = mergedMembership.membership;
    const mergedScoped = buildScopedBoundaryMembership([
      ...krsFile.systems,
      ...krsFile.services,
      ...krsFile.clients,
      ...krsFile.domains,
      ...krsFile.databases,
      ...krsFile.queues,
      ...krsFile.storages,
    ]);
    krsFile.scopedBoundaryMembership = mergedScoped.membership;
    this.diagnostics.push(...mergedMembership.diagnostics, ...mergedScoped.diagnostics);
    // `facet` declarations from every file share one flat namespace, so the
    // duplicate check only makes sense here (#2065 Part B). Unlike the reference
    // checks above, the per-file verdict was suppressed to avoid *under*-
    // reporting, not over-reporting: two files each declaring `facet pii` is a
    // duplicate no single file can see.
    this.diagnostics.push(...validateFacetDeclarations(krsFile.facets));

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
    // 真の循環: 現在ロード中のファイルに戻ってきた場合のみ警告（S5）
    if (this.loadingKrs.has(filePath)) {
      this.diagnostics.push({
        severity: "warning",
        code: "circular-import",
        params: { filePath },
      });
      return;
    }
    // DAG 再到達: 既にロード済みなら黙って早期 return（warning なし）
    if (this.loadedKrs.has(filePath)) {
      return;
    }
    this.loadingKrs.add(filePath);

    let source: string;
    try {
      source = await this.fs.readFile(filePath);
    } catch {
      this.diagnostics.push({
        severity: "error",
        code: "file-not-found",
        params: { filePath },
      });
      this.loadingKrs.delete(filePath);
      return;
    }

    const parseResult = Parser.parse(source);
    // Reference-existence diagnostics (`contains-target-not-found` /
    // `owns-target-not-found`) are re-derived against the merged id-space
    // after Pass 2, so drop the per-file verdict here — a member/owned id
    // declared in another file would otherwise falsely warn (Issue #2032).
    this.diagnostics.push(
      ...parseResult.diagnostics.filter((d) => !MERGED_SPACE_REFERENCE_CODES.has(d.code)),
    );
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

    this.loadingKrs.delete(filePath);
    this.loadedKrs.add(filePath);
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
   *
   * 解決結果は filePath 単位で memoize される（S2 / S5）。同じファイルが DAG 経由で
   * 複数経路から到達されても、解決処理は 1 度だけ行われ、その結果が共有される。
   * 真の循環（resolveKrsFromMap の入れ子で自分自身に戻ってきた場合）のみ空 KrsFile
   * を返して無限再帰を断つ。
   */
  private resolveKrsFromMap(fileMap: Map<string, KrsFile>, filePath: string): KrsFile {
    const cached = this.resolvedCache.get(filePath);
    if (cached) return cached;

    const mergedFile: KrsFile = createEmptyKrsFile();

    // 真の循環: 既に解決中なら空を返す（Pass 1 で circular-import 警告は出ている）
    if (this.resolvingKrs.has(filePath)) return mergedFile;
    this.resolvingKrs.add(filePath);

    const file = fileMap.get(filePath);
    if (!file) {
      this.resolvingKrs.delete(filePath);
      return mergedFile;
    }

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
    mergedFile.boundaries.push(...(file.boundaries ?? []));
    mergedFile.facets.push(...(file.facets ?? []));
    mergedFile.legends.push(...(file.legends ?? []));
    // ownerIndex is not merged here since #2548 (path-keyed): `resolve()`
    // rebuilds it from the merged declarations, exactly like boundary
    // membership below — a per-file union cannot resolve a path against nodes
    // another file contributes. What travels is `organizations` above.
    // Boundary membership is not merged here: `resolve()` rebuilds it from the
    // merged declarations, so the index and its diagnostic have one derivation
    // and cannot disagree (#2221). What has to travel is the declarations
    // themselves, which `boundaries` above and the wildcard merge below carry.
    // `facetIndex` is deliberately NOT merged entry-by-entry here. It is a pure
    // derivation of the `facets` properties on the merged tree, so `resolve()`
    // rebuilds it once at the end instead — one derivation rather than one per
    // merge path (TPL-1032). That also makes it immune to a merge path
    // forgetting to carry it: `boundaries` / `boundaryIndex`, which do merge by
    // hand here, are silently dropped by `mergeWildcardResolved`.
    // `nodePathIndex` is not unioned here since #2596, for the same reason as
    // `ownerIndex` above: `resolve()` rebuilds it from the merged tree. The
    // first-wins union it replaces decided cross-file collisions by merge order,
    // and it carried an entry only from this site (the file's own parse index)
    // and from `mergeWildcardResolved` — never from `mergeNamedImport`, which is
    // why a named-imported node was in the tree and absent from the index.
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
    // service-outside-system 警告は同じファイルに対して 1 回だけ出す（DAG 経由でも重複させない）
    const warnedServiceOutsideSystem = new Set<string>();

    for (const nodeImport of file.nodeImports) {
      if (nodeImport.path === "") continue;

      if (nodeImport.path.endsWith("/")) {
        // ディレクトリ import: Pass 1 で展開済みのファイルを順番にマージ
        const dirPath = resolvePath(filePath, nodeImport.path);
        const expandedFiles = this.dirExpansions.get(dirPath) ?? [];
        for (const krsFilePath of expandedFiles) {
          const resolvedImported = this.resolveKrsFromMap(fileMap, krsFilePath);
          this.mergeWildcardResolved(mergedFile, resolvedImported);
        }
        continue;
      }

      const importPath = resolvePath(filePath, nodeImport.path);
      const rawImported = fileMap.get(importPath);
      if (!rawImported) continue;

      // Case B 警告: ワイルドカードで取り込むファイルに top-level service がある場合
      const isWildcard = nodeImport.ids.length === 0;
      if (isWildcard && !warnedServiceOutsideSystem.has(importPath)) {
        warnedServiceOutsideSystem.add(importPath);
        for (const service of rawImported.services) {
          this.diagnostics.push({
            severity: "warning",
            code: "service-outside-system",
            params: { serviceId: service.id },
            loc: nodeImport.loc,
          });
        }
      }

      // import 先を再帰解決（cache で重複処理を防ぐ）
      const resolvedImported = this.resolveKrsFromMap(fileMap, importPath);

      if (isWildcard) {
        // ワイルドカード: 全ブロックをマージ（DAG 再到達時は同一インスタンスを重複登録しない）
        this.mergeWildcardResolved(mergedFile, resolvedImported);
      } else {
        // Named: 指定 ID のノードのみをマージ
        this.mergeNamedImport(mergedFile, resolvedImported, nodeImport);
      }
    }

    this.resolvingKrs.delete(filePath);
    this.resolvedCache.set(filePath, mergedFile);
    return mergedFile;
  }

  // ─── Wildcard merge ───────────────────────────────────────────────────────

  /**
   * resolveKrsFromMap で解決済みの KrsFile を mergedFile にマージする。
   * 同名の system / deploy / organization は children / nodes / teams をマージし、
   * 重複 ID は error diagnostic を出す。
   */
  private mergeWildcardResolved(mergedFile: KrsFile, resolved: KrsFile): void {
    if (mergedFile === resolved) return;
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

    // services（Case B 警告は resolveKrsFromMap 側で発行済み）。
    // DAG 経由で同じ resolved を 2 回 merge してもインスタンス重複させない。
    for (const service of resolved.services) {
      if (!mergedFile.services.includes(service)) {
        mergedFile.services.push(service);
      }
    }

    // S2: top-level infra blocks (database / queue / storage) propagate
    // through whole-file import. Identity dedup handles DAG re-arrival —
    // a database declared once in infra.krs reached via three different
    // import chains does not get triplicated. Two distinct declarations
    // with the same id are union-merged (S3-shaped: shared infra is
    // visualized but not prescribed — info diagnostic, not error).
    this.mergeTopLevelInfra(mergedFile.databases, resolved.databases, "database");
    this.mergeTopLevelInfra(mergedFile.queues, resolved.queues, "queue");
    this.mergeTopLevelInfra(mergedFile.storages, resolved.storages, "storage");
    for (const client of resolved.clients) {
      if (!mergedFile.clients.includes(client)) {
        mergedFile.clients.push(client);
      }
    }
    for (const domain of resolved.domains) {
      if (!mergedFile.domains.includes(domain)) {
        mergedFile.domains.push(domain);
      }
    }
    for (const legend of resolved.legends) {
      if (!mergedFile.legends.includes(legend)) {
        mergedFile.legends.push(legend);
      }
    }
    // Facet declarations propagate through whole-file import like every other
    // top-level block (TPL-2169): a project that keeps its `facet`
    // vocabulary in one file and imports it wholesale is the expected layout,
    // and without this the references in the importing file would all warn.
    for (const facet of resolved.facets) {
      if (!mergedFile.facets.includes(facet)) {
        mergedFile.facets.push(facet);
      }
    }

    // Top-level `boundary` blocks travel with the file, like `legend` and
    // `organization` above: a boundary declared in an imported file frames the
    // importing model too. Without this the block parses and vanishes — nothing
    // reaches `boundaries` (labels, the Group-by gate) or the membership index
    // (TPL-1503), even though `contains` is a by-reference relation that crosses
    // files by design (#2178). Identity dedup handles DAG re-arrival.
    for (const boundary of resolved.boundaries) {
      if (!mergedFile.boundaries.includes(boundary)) {
        mergedFile.boundaries.push(boundary);
      }
    }
    // ownerIndex deliberately not unioned (#2548), and `nodePathIndex` not
    // since #2596 — see the comment in `resolveKrsFromMap` where the file's own
    // index used to be unioned; `resolve()` rebuilds both from the merged model.
    for (const [nodeId, filePath] of resolved.nodeFileIndex) {
      if (!mergedFile.nodeFileIndex.has(nodeId)) {
        mergedFile.nodeFileIndex.set(nodeId, filePath);
      }
    }
    for (const styleImport of resolved.styleImports) {
      if (!mergedFile.styleImports.includes(styleImport)) {
        mergedFile.styleImports.push(styleImport);
      }
    }
  }

  private isInfraKind(kind: string): kind is "database" | "queue" | "storage" {
    return kind === "database" || kind === "queue" || kind === "storage";
  }

  /**
   * Same-id infra reopen: merge `table` (or other leaf) children by id.
   * The infra body is intentionally flat — declaring
   * `database UserDB { table users }` in two files leaves one merged
   * node with a single `users` child. Identity-identical re-arrival
   * (DAG hit) dedups silently. A same-`(id, kind)` collision between
   * **different instances** emits an `infra-leaf-redeclared-silently`
   * info diagnostic so the dropped declaration's existence is at least
   * surfaced — silent loss of information would be debug-hostile.
   */
  private mergeInfraBody(target: KrsNode & { id: string; kind: string }, source: KrsNode): void {
    if (target === source) return;
    this.mergeScopedBoundaries(target, source);
    for (const child of source.children) {
      if (target.children.includes(child)) continue;
      const dup = target.children.find((c) => c.id === child.id && c.kind === child.kind);
      if (dup) {
        this.reportInfraLeafCollision(target, child);
        continue;
      }
      target.children.push(child);
    }
  }

  /**
   * Wildcard merge of a top-level infra list (`databases` / `queues` /
   * `storages`). Same-id reopens are union-merged with an
   * `infra-redeclared-across-files` info diagnostic; DAG re-arrival
   * (same instance) is dedup'd silently.
   */
  private mergeTopLevelInfra<T extends KrsNode & { id: string }>(
    targetList: T[],
    sourceList: T[],
    kind: "database" | "queue" | "storage",
  ): void {
    for (const incoming of sourceList) {
      if (targetList.includes(incoming)) continue;
      const idConflict = targetList.find((n) => n.id === incoming.id);
      if (idConflict) {
        this.diagnostics.push({
          severity: "info",
          code: "infra-redeclared-across-files",
          params: { blockId: incoming.id, blockKind: kind },
        });
        this.mergeInfraBody(idConflict, incoming);
      } else {
        targetList.push(incoming);
      }
    }
  }

  /**
   * Carry a reopened node's scoped `boundary` blocks (#2036) into the node that
   * survives the merge.
   *
   * A `system` (and a same-id infra block) may be reopened in another file, and
   * only the merged node is ever drawn — so a boundary declared on the incoming
   * copy is lost unless it is moved across. It parsed, it resolved a label, and
   * it framed nothing: the accepted-but-inert state TPL-1503 forbids (#2246).
   *
   * Same-id blocks are kept rather than deduped here. Two files declaring the
   * same boundary id in one scope is a duplicate only the merged model can see,
   * and `buildScopedBoundaryMembership` is what reports it (`duplicate-boundary-id`)
   * when the resolver rebuilds membership — dropping one here would silence it.
   */
  private mergeScopedBoundaries(target: KrsNode, source: KrsNode): void {
    if (source.boundaries === undefined || source.boundaries.length === 0) return;
    const carried = (target.boundaries ??= []);
    for (const boundary of source.boundaries) {
      // Identity dedup only: the same block re-arriving through a DAG path.
      if (!carried.includes(boundary)) carried.push(boundary);
    }
  }

  private mergeSystemIntoExisting(target: SystemNode, source: SystemNode): void {
    if (target === source) return;
    this.mergeScopedBoundaries(target, source);
    this.reconcileLabel(target, source, "system");
    this.reconcileDescription(
      target.properties as { description?: string },
      source.properties as { description?: string },
      target.id,
      "system",
    );
    for (const child of source.children) {
      // 同一インスタンス: DAG 経由で同じノードに到達した場合（cache hit）— 黙って dedup
      if (target.children.includes(child)) continue;
      const idConflict = target.children.find((c) => c.id === child.id);
      if (idConflict) {
        if (this.isInfraKind(child.kind) && idConflict.kind === child.kind) {
          // 同名 infra (database / queue / storage) の再オープンは union merge。
          // 「shared infra」は karasu が可視化はするが prescribe しない事実なので
          // info severity で surface（design doc: karasu-position-on-style-prescriptions）。
          this.diagnostics.push({
            severity: "info",
            code: "infra-redeclared-across-files",
            params: {
              blockId: child.id,
              blockKind: child.kind as "database" | "queue" | "storage",
            },
          });
          this.mergeInfraBody(idConflict, child);
        } else {
          this.diagnostics.push({
            severity: "error",
            code: "duplicate-node-in-system",
            params: { nodeId: child.id, systemId: target.id },
          });
        }
      } else {
        target.children.push(child);
      }
    }
    for (const edge of source.edges) {
      if (target.edges.includes(edge)) continue;
      const edgeExists = target.edges.some(
        (e) => e.from === edge.from && e.to === edge.to && e.label === edge.label,
      );
      if (!edgeExists) {
        target.edges.push(edge);
      }
    }
  }

  private mergeDeployIntoExisting(target: DeployBlock, source: DeployBlock): void {
    if (target === source) return;
    this.reconcileLabel(target, source, "deploy");
    for (const node of source.nodes) {
      if (target.nodes.includes(node)) continue;
      const idConflict = target.nodes.find((n) => n.id === node.id);
      if (idConflict) {
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
    if (target === source) return;
    this.reconcileLabel(target, source, "organization");
    this.reconcileDescription(
      target.properties as { description?: string },
      source.properties as { description?: string },
      target.id,
      "organization",
    );
    for (const team of source.teams) {
      if (target.teams.includes(team)) continue;
      const idConflict = target.teams.find((t) => t.id === team.id);
      if (idConflict) {
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

  /**
   * S3: import グラフの root に近い側が勝つ。
   * - target が未設定 → source の値で埋める
   * - 両方が non-empty で異なる → target を維持して `system-property-conflict` warning
   */
  private reconcileLabel(
    target: { id: string; label?: string },
    source: { id: string; label?: string },
    blockKind: "system" | "deploy" | "organization",
  ): void {
    const t = target.label?.trim() ?? "";
    const s = source.label?.trim() ?? "";
    if (!t && s) {
      target.label = source.label;
      return;
    }
    if (t && s && t !== s) {
      this.diagnostics.push({
        severity: "warning",
        code: "system-property-conflict",
        params: {
          blockId: target.id,
          blockKind,
          property: "label",
          chosen: t,
          ignored: s,
        },
      });
    }
  }

  private reconcileDescription(
    target: { description?: string },
    source: { description?: string },
    blockId: string,
    blockKind: "system" | "deploy" | "organization",
  ): void {
    const t = target.description?.trim() ?? "";
    const s = source.description?.trim() ?? "";
    if (!t && s) {
      target.description = source.description;
      return;
    }
    if (t && s && t !== s) {
      this.diagnostics.push({
        severity: "warning",
        code: "system-property-conflict",
        params: {
          blockId,
          blockKind,
          property: "description",
          chosen: t,
          ignored: s,
        },
      });
    }
  }

  // ─── Named import（既存ロジック） ─────────────────────────────────────────

  private mergeNamedImport(
    mergedFile: KrsFile,
    importedFile: KrsFile,
    nodeImport: ImportDeclaration,
  ): void {
    // The candidate chains are a property of the imported file, not of the
    // entry, so one walk serves the whole statement: rebuilding it per entry
    // made `import { A.B, C.D, … }` cost O(entries × nodes in the file), on a
    // shape generated models produce routinely. Lazy, so a statement of bare
    // ids never walks at all.
    const chains = this.importChainsOnce(importedFile);
    for (const entry of nodeImport.ids) {
      if (entry.path.length === 1) {
        this.resolveBareIdImport(mergedFile, importedFile, entry, nodeImport);
      } else {
        this.resolveMultiSegmentImport(mergedFile, chains, entry, nodeImport);
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
    entry: ImportEntry,
    nodeImport: ImportDeclaration,
  ): void {
    const id = entry.path[0];
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
        // The entry's range, not the statement's: `import { A, B }` where only
        // `B` is missing must underline `B` (#2582 review).
        loc: entry.loc,
      });
    }
  }

  /**
   * Every node chain in an imported file, `[root, …, node]`, with its id
   * path — the candidate pool a multi-segment entry resolves against.
   *
   * Built at most once per import statement: it is a property of the file,
   * not of the entry, and the walk is O(nodes in the file).
   */
  private importChainsOnce(importedFile: KrsFile): () => ImportChain[] {
    let cached: ImportChain[] | undefined;
    return () => {
      if (cached) return cached;
      const candidates: ImportChain[] = [];
      const walk = (node: KrsNode, prefix: readonly KrsNode[]): void => {
        const chain = [...prefix, node];
        candidates.push({ path: chain.map((n) => n.id), chain });
        for (const child of node.children) walk(child, chain);
      };
      for (const roots of this.topLevelHomes(importedFile).values()) {
        for (const root of roots) walk(root, []);
      }
      cached = candidates;
      return cached;
    };
  }

  /**
   * Resolve a multi-segment path (`import { Sys.Svc.Dom }`, Issue #927) by
   * the shared suffix rule (#2088 slice D2): the ref matches every node in
   * the imported file whose full path ends with it, so a root-anchored path
   * keeps resolving to the node it always did, and a relative suffix
   * (`import { Checkout.Payment }`) becomes legal. Roots are no longer
   * limited to systems — a chain under a top-level service / client / domain
   * / infra bucket materializes into that bucket the same way.
   *
   * Every match is imported — the same broadcast semantics a bare-id import
   * has always had — and a multi-match that is not uniform in (kind, depth)
   * additionally draws `import-target-ambiguous` (warning; the import still
   * happens, the warning narrates, exactly like the `owns` family).
   *
   * On zero matches, `import-path-not-found`'s `failedAt` is the leftmost
   * segment that eliminated every candidate under right-to-left narrowing —
   * the suffix analogue of the old walk's first unmatched segment — with
   * `lastResolvedId` naming the segment that still had candidates.
   *
   * On success each leaf is merged with its full subtree, materializing
   * minimal stubs of intermediate ancestors (id + label + properties only)
   * when they don't already exist, mirroring how a targeted bare-id import
   * behaves today. A chain rooted at an infra block joins the S4.5 reopen
   * protocol on the way in — see {@link noteChainReopen}.
   */
  private resolveMultiSegmentImport(
    mergedFile: KrsFile,
    chains: () => ImportChain[],
    entry: ImportEntry,
    nodeImport: ImportDeclaration,
  ): void {
    const path = entry.path;
    const candidates = chains();

    const matches = resolveNodePathBySuffix(path, candidates);

    if (matches.length === 0) {
      // Narrow right-to-left and report the segment that emptied the pool.
      let pool = candidates.filter((c) => c.path[c.path.length - 1] === path[path.length - 1]);
      let failedAt = path.length - 1;
      let lastResolvedId: string | undefined;
      if (pool.length > 0) {
        for (let i = path.length - 2; i >= 0; i--) {
          const narrowed = pool.filter((c) => {
            const offset = c.path.length - (path.length - i);
            return offset >= 0 && c.path[offset] === path[i];
          });
          if (narrowed.length === 0) {
            failedAt = i;
            lastResolvedId = path[i + 1];
            break;
          }
          pool = narrowed;
        }
      }
      this.diagnostics.push({
        severity: "error",
        code: "import-path-not-found",
        params: {
          path,
          failedAt,
          importPath: nodeImport.path,
          ...(lastResolvedId !== undefined ? { lastResolvedId } : {}),
        },
        // The entry's range, not the statement's (#2582 review).
        loc: entry.loc,
      });
      return;
    }

    const ambiguous = ambiguousNodePathCandidates(
      matches.map((m) => ({
        kind: m.chain[m.chain.length - 1].kind,
        path: m.path,
        chain: m.chain,
      })),
    );
    if (ambiguous !== undefined) {
      this.diagnostics.push({
        severity: "warning",
        code: "import-target-ambiguous",
        // `nodePathKey`, not a local join: it is the canonical encoding for
        // diagnostic params, and the `owns` family's `ambiguityParams` reads
        // the same helper, so the two cannot drift.
        params: {
          path: nodePathKey(path),
          candidates: ambiguous.map((m) => ({ kind: m.kind, path: nodePathKey(m.path) })),
        },
        loc: entry.loc,
      });
    }

    for (const match of matches) {
      this.materializeChain(mergedFile, match.chain);
    }
  }

  /**
   * Materialize one resolved chain `[root, …, leaf]` in `mergedFile`,
   * preserving nodes already imported by other statements: the root becomes
   * (or reuses) a shallow stub in its home — `systems` for a system root,
   * the matching top-level bucket otherwise — intermediate ancestors become
   * minimal stubs, and the leaf is pushed with its full subtree (idempotent
   * across multiple imports).
   */
  private materializeChain(mergedFile: KrsFile, chain: KrsNode[]): void {
    const root = chain[0];
    const leaf = chain[chain.length - 1];
    const home = this.topLevelHomes(mergedFile).get(root.kind);
    if (home === undefined) return;

    let target = home.find((n) => n.id === root.id);
    if (!target) {
      target = this.chainStub(root);
      home.push(target);
    } else {
      this.noteChainReopen(target, root);
    }

    let parent: KrsNode = target;
    let parentChildren: KrsNode[] = target.children;
    for (const ancestor of chain.slice(1, -1)) {
      let existing = parentChildren.find((c) => c.id === ancestor.id);
      if (!existing) {
        existing = this.chainStub(ancestor);
        parentChildren.push(existing);
      } else {
        this.noteChainReopen(existing, ancestor);
      }
      parent = existing;
      parentChildren = existing.children;
    }

    // Identity first, then `(id, kind)`: the same declaration arriving twice
    // (two entries of one statement, a DAG re-arrival) is a dedup, while two
    // declarations sharing a name are a collision the infra rule reports
    // rather than swallows — the same order `mergeInfraBody` reads them in.
    if (parentChildren.includes(leaf)) return;
    const dup = parentChildren.find((c) => c.id === leaf.id && c.kind === leaf.kind);
    if (dup) {
      this.reportInfraLeafCollision(parent, leaf);
      return;
    }
    parentChildren.push(leaf);
  }

  /**
   * The top-level list each root kind lives in. One enumeration, read by the
   * chain walk (which roots are candidates) and by materialization (where a
   * root lands), so a future top-level kind cannot reach one and miss the
   * other (TPL-1720).
   */
  private topLevelHomes(file: KrsFile): Map<string, KrsNode[]> {
    return new Map<string, KrsNode[]>([
      ["system", file.systems as KrsNode[]],
      ["service", file.services as KrsNode[]],
      ["client", file.clients as KrsNode[]],
      ["domain", file.domains as KrsNode[]],
      ["database", file.databases as KrsNode[]],
      ["queue", file.queues as KrsNode[]],
      ["storage", file.storages as KrsNode[]],
    ]);
  }

  /**
   * Shallow stub of a chain node: identity and metadata, but no children or
   * edges, so a later import into the same root adds to it instead of
   * dragging in siblings the author did not name. The declaration it stands
   * for is recorded — see {@link noteChainReopen}.
   */
  private chainStub(source: KrsNode): KrsNode {
    const stub = { ...source, children: [], edges: [] } as KrsNode;
    this.chainOriginsOf(stub).add(source);
    return stub;
  }

  private chainOriginsOf(node: KrsNode): Set<KrsNode> {
    let origins = this.chainOrigins.get(node);
    if (!origins) {
      origins = new Set<KrsNode>();
      this.chainOrigins.set(node, origins);
    }
    return origins;
  }

  /**
   * A chain arriving at a node that is already in the merged file.
   *
   * Silent when it is the same declaration — a second entry of one import
   * statement, or a DAG re-arrival. A *different* declaration of an infra
   * block is the cross-file reopen `mergeTopLevelInfra` reports, and it has
   * to report the same way here: named imports reach infra roots since #2576,
   * and merging two declarations without a word is the silent loss #1391 was
   * written to stop. `mergeTopLevelInfra` can compare instances directly
   * because it pushes the source node itself; a chain root is a stub, so the
   * declarations it stands for are tracked here.
   */
  private noteChainReopen(existing: KrsNode, source: KrsNode): void {
    if (existing === source) return;
    const origins = this.chainOriginsOf(existing);
    if (origins.has(source)) return;
    origins.add(source);
    const kind = source.kind;
    if (existing.kind !== kind || !this.isInfraKind(kind)) return;
    this.diagnostics.push({
      severity: "info",
      code: "infra-redeclared-across-files",
      params: { blockId: source.id, blockKind: kind },
    });
  }

  /**
   * A same-`(id, kind)` infra leaf arriving from a different declaration.
   * Shared by {@link mergeInfraBody} and the chain materialization above so
   * both merge paths surface the dropped declaration identically (#1391).
   */
  private reportInfraLeafCollision(parent: KrsNode, child: KrsNode): void {
    const infraKind = parent.kind;
    if (!this.isInfraKind(infraKind)) return;
    if (child.kind !== "table" && child.kind !== "queue-item" && child.kind !== "bucket") return;
    this.diagnostics.push({
      severity: "info",
      code: "infra-leaf-redeclared-silently",
      params: {
        leafId: child.id,
        leafKind: child.kind,
        infraId: parent.id,
        infraKind,
      },
      loc: child.loc,
    });
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
