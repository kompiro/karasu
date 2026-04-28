import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  compileDeployDiff,
  type Warning,
  type Diagnostic,
  type FileSystemProvider,
  type NodeMetadata,
  type DeployBlockInfo,
  type DisplayMode,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { computeViewResultFingerprint } from "./result-fingerprint.js";

interface DeployViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

const DEBOUNCE_MS = 300;

export function useDeployView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  selectedDeployBlockId: string | null = null,
  displayMode?: DisplayMode,
  compareEntryPath: string | null = null,
  compareFs: FileSystemProvider | null = null,
): DeployViewState & { recompile: () => void } {
  const [state, setState] = useState<DeployViewState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    deployBlocks: [],
  });

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const lastResultFingerprint = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  const emptyStateLabels = useEmptyStateLabels();

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:deploy:${selectedDeployBlockId ?? ""}:cmp=${compareEntryPath ?? ""}`;

    timerRef.current = setTimeout(async () => {
      try {
        if (compareEntryPath) {
          // Diff-mode: render compareEntryPath (before) → entryPath (after).
          // Need a baseline compileProject result for nodeMetadata / deployBlocks
          // used by surrounding UI (block selector, NodeDetailPanel).
          const [base, diff] = await Promise.all([
            compileProject(entryPath, fs, {
              diagramType: "deploy",
              selectedDeployId: selectedDeployBlockId ?? undefined,
              displayMode,
              emptyStateLabels,
            }),
            compileDeployDiff({
              beforeEntryPath: compareEntryPath,
              afterEntryPath: entryPath,
              fs: compareFs ?? fs,
              selectedDeployId: selectedDeployBlockId ?? undefined,
              displayMode,
              emptyStateLabels,
            }),
          ]);
          if (base.diagramType !== "deploy") return;
          const hasErrors = diff.diagnostics.some((d) => d.severity === "error");
          if (hasErrors) {
            const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
            setState({
              svg: svgToShow,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              deployBlocks: base.deployBlocks,
            });
          } else {
            const fingerprint = computeViewResultFingerprint({
              svg: diff.svg,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
            });
            if (fingerprint === lastResultFingerprint.current) return;
            lastValidSvg.current = diff.svg;
            lastValidSvgKey.current = currentKey;
            lastResultFingerprint.current = fingerprint;
            setState({
              svg: diff.svg,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              deployBlocks: base.deployBlocks,
            });
          }
          return;
        }

        const result = await compileProject(entryPath, fs, {
          diagramType: "deploy",
          selectedDeployId: selectedDeployBlockId ?? undefined,
          displayMode,
          emptyStateLabels,
        });
        if (result.diagramType !== "deploy") return;
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
          setState({
            svg: svgToShow,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            deployBlocks: result.deployBlocks,
          });
        } else {
          const fingerprint = computeViewResultFingerprint({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
          });
          if (fingerprint === lastResultFingerprint.current) return;
          lastValidSvg.current = result.svg;
          lastValidSvgKey.current = currentKey;
          lastResultFingerprint.current = fingerprint;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            deployBlocks: result.deployBlocks,
          });
        }
      } catch {
        setState((prev) => ({
          ...prev,
          diagnostics: [
            {
              severity: "error",
              code: "app-project-compile-error",
              params: {},
            },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // recompileCounter.current is intentionally read on each render to bump on demand
  }, [
    entryPath,
    fs,
    selectedDeployBlockId,
    displayMode,
    compareEntryPath,
    compareFs,
    emptyStateLabels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    recompileCounter.current,
  ]);

  return { ...state, recompile };
}
