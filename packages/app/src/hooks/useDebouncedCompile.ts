import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import type { Diagnostic } from "@karasu-tools/core";

const DEBOUNCE_MS = 300;

/**
 * Normalized result of one compile, produced by a view hook's `compile`
 * callback so the shared scaffold can apply the common publish logic.
 */
export interface CompileOutcome<TState> {
  /** Diagnostics — used to detect whether the compile errored. */
  diagnostics: readonly Diagnostic[];
  /** Rendered SVG — the subject of the keep-stale-on-error and fingerprint logic. */
  svg: string;
  /**
   * Fingerprint over the user-visible result. The caller computes it (so it can
   * decide whether to fold `nodeMetadata` in), letting the scaffold stay
   * view-agnostic. When it matches the last published fingerprint and the
   * previous publish was not an error, the scaffold skips the re-render.
   */
  fingerprint: string;
  /**
   * Build the view state on the error path. Receives the SVG to show (the last
   * valid SVG for this key, or "" when the key changed) and the previous state
   * (some views keep prior fields like warnings on error). Fresh diagnostics
   * are the caller's responsibility to include.
   */
  errorState: (svgToShow: string, prev: TState) => TState;
  /** Build the view state on success. */
  okState: () => TState;
}

interface DebouncedCompileArgs<TState> {
  /** Whether a compile should run (e.g. entryPath and fs are both set). */
  active: boolean;
  /**
   * Stable identity of the current compile target (entryPath + view + selection
   * + compare). Used to decide whether a kept-stale SVG still applies.
   */
  currentKey: string;
  initialState: TState;
  /**
   * Run the compile. Resolves to a {@link CompileOutcome}, or `null` to skip
   * publishing (e.g. the result's diagramType doesn't match this view).
   * Throws on compile failure — the scaffold routes that through `onError`.
   */
  compile: () => Promise<CompileOutcome<TState> | null>;
  /** Build the error-diagnostic state when `compile` throws. */
  onError: (prev: TState) => TState;
  /**
   * Effect dependency list — the inputs that should restart the debounce
   * (entryPath, fs, view key, displayMode, theme, compare, i18n labels, …).
   * `recompile()` is wired in by the hook itself.
   */
  deps: DependencyList;
}

/**
 * Shared debounce-compile-publish scaffold for the diagram view hooks
 * (`useSystemView` / `useDeployView` / `useOrgView`), which previously each
 * hand-rolled the identical machinery (#1540): a 300 ms debounce, a
 * keep-the-last-valid-SVG-on-error cache keyed by the compile target, a
 * fingerprint dedup that skips no-op re-renders, a `hadErrors` flag that forces
 * a re-render after an error→recovery even when the fingerprint is unchanged,
 * an imperative `recompile()`, and a compile-failure catch.
 *
 * Unifying them here also fixes two latent issues the copies had:
 * - **#1534** — the awaited compile is now cancelled when its inputs change
 *   mid-flight, so a slow compile for a previous entry/view can no longer
 *   publish stale results over a newer one.
 * - **#1540 / useDeployView** — `useDeployView` lacked the `hadErrors` guard, so
 *   an error that recovered to byte-identical pre-error content stayed stuck on
 *   the error state (fingerprint matched the pre-error fingerprint). The shared
 *   scaffold applies the guard to every view.
 *
 * `compile` / `currentKey` / `onError` are read through refs (always the latest
 * closure), so callers pass them fresh each render; the effect restarts only
 * when `deps` change, matching the previous per-hook behavior.
 */
export function useDebouncedCompile<TState>(
  args: DebouncedCompileArgs<TState>,
): TState & { recompile: () => void } {
  const { active, currentKey, initialState, compile, onError, deps } = args;

  const [state, setState] = useState<TState>(initialState);

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const lastResultFingerprint = useRef<string | null>(null);
  const hadErrors = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  // Latest closures, read inside the debounced callback.
  const compileRef = useRef(compile);
  compileRef.current = compile;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!active) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    // Captured at effect-setup time (matches the prior per-hook behavior of
    // computing the key when the effect runs, then using it in the timeout).
    const key = currentKeyRef.current;
    let cancelled = false;

    timerRef.current = setTimeout(async () => {
      try {
        const outcome = await compileRef.current();
        // #1534: inputs changed (or unmounted) while the compile was in flight —
        // drop this result so it can't overwrite a newer compile's state.
        if (cancelled) return;
        if (!outcome) return;

        const hasErrors = outcome.diagnostics.some((d) => d.severity === "error");
        if (hasErrors) {
          hadErrors.current = true;
          const svgToShow = lastValidSvgKey.current === key ? lastValidSvg.current : "";
          setState((prev) => outcome.errorState(svgToShow, prev));
        } else {
          if (outcome.fingerprint === lastResultFingerprint.current && !hadErrors.current) return;
          hadErrors.current = false;
          lastValidSvg.current = outcome.svg;
          lastValidSvgKey.current = key;
          lastResultFingerprint.current = outcome.fingerprint;
          setState(outcome.okState());
        }
      } catch {
        if (cancelled) return;
        hadErrors.current = true;
        setState((prev) => onErrorRef.current(prev));
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [...deps, recompileCounter.current]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return { ...state, recompile };
}
