import type { FileSystemProvider } from "./types.js";
import type { Diagnostic, KrsFile } from "../types/ast.js";
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
 * ImportResolver — @import と import { } from を再帰的に解決する。
 *
 * Phase 1 では各ファイルを個別にパースし、AST レベルでマージする。
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

    const krsFile = await this.resolveKrs(entryPath);
    const styleSheets = await this.resolveStyles(entryPath, krsFile.styleImports);

    return {
      krsFile,
      styleSheets,
      diagnostics: this.diagnostics,
    };
  }

  /**
   * .krs ファイルを再帰的に解決し、マージ済みの KrsFile を返す。
   */
  private async resolveKrs(filePath: string): Promise<KrsFile> {
    const mergedFile: KrsFile = {
      styleImports: [],
      nodeImports: [],
      systems: [],
      services: [],
      deploys: [],
    };

    if (this.visitedKrs.has(filePath)) {
      this.diagnostics.push({
        severity: "warning",
        message: `Circular import detected: ${filePath}`,
      });
      return mergedFile;
    }
    this.visitedKrs.add(filePath);

    // ファイル読み込み
    let source: string;
    try {
      source = await this.fs.readFile(filePath);
    } catch {
      this.diagnostics.push({
        severity: "error",
        message: `File not found: ${filePath}`,
      });
      return mergedFile;
    }

    // パース
    const parseResult = Parser.parse(source);
    this.diagnostics.push(...parseResult.diagnostics);

    const file = parseResult.value;
    mergedFile.styleImports.push(...file.styleImports);
    mergedFile.systems.push(...file.systems);
    mergedFile.services.push(...file.services);
    mergedFile.deploys.push(...file.deploys);

    // import { X } from "other.krs" を解決
    for (const nodeImport of file.nodeImports) {
      const importPath = resolvePath(filePath, nodeImport.path);
      const importedFile = await this.resolveKrs(importPath);

      // import された ids に対応するノードを探してマージ
      for (const id of nodeImport.ids) {
        let found = false;
        for (const system of importedFile.systems) {
          // system 直下の子ノード（service, user）から id でマッチ
          const matchingChildren = system.children.filter((child) => child.id === id);
          if (matchingChildren.length > 0) {
            // マージ先の system を探す（既にある system にマージ）
            // system が無ければ import 元の system 構造ごと持ってくる
            for (const matchedChild of matchingChildren) {
              this.mergeNodeIntoSystems(mergedFile.systems, system, matchedChild);
            }
            found = true;
          }

          // system 自体が id にマッチする場合
          if (system.id === id || system.label === id) {
            mergedFile.systems.push(system);
            found = true;
          }
        }

        // deploy からも探す
        for (const deploy of importedFile.deploys) {
          const matchingNodes = deploy.nodes.filter((n) => n.id === id);
          if (matchingNodes.length > 0) {
            found = true;
            // deploy ブロックにマージ
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

      // import したファイルのスタイル import もマージ
      mergedFile.styleImports.push(...importedFile.styleImports);
    }

    return mergedFile;
  }

  /**
   * import されたノードを既存の system にマージする。
   * 同名の system が存在すればその children にマージし、
   * なければ新しい system は追加しない（ノード単独では意味をなさないため）。
   */
  private mergeNodeIntoSystems(
    systems: import("../types/ast.js").SystemNode[],
    sourceSystem: import("../types/ast.js").KrsNode,
    node: import("../types/ast.js").KrsNode,
  ): void {
    // 同名の system を探す
    const targetSystem = systems.find(
      (s) => s.label === sourceSystem.label || s.id === sourceSystem.id,
    );
    if (targetSystem) {
      // 重複チェック
      const alreadyExists = targetSystem.children.some(
        (c) => c.id === node.id && c.kind === node.kind,
      );
      if (!alreadyExists) {
        targetSystem.children.push(node);
      }
      // エッジもマージ（node に関連するもの）
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

  /**
   * スタイルファイルを再帰的に解決する。
   * @param basePath スタイル import を含む .krs ファイルのパス
   * @param styleImports @import で指定されたパスの配列
   */
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

  /**
   * 単一のスタイルファイルを解決する（循環参照検出付き）。
   */
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
        severity: "error",
        message: `Style file not found: ${filePath}`,
      });
      return null;
    }

    const parseResult = StyleParser.parse(source);
    this.diagnostics.push(...parseResult.diagnostics);

    return parseResult.value;
  }
}
