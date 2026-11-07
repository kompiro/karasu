/**
 * Which project the first-run tour opened (#3597), so Restart Guided Tour…
 * goes back into that copy of the sample instead of opening another. Matching
 * by name would also pick a project the visitor created under the same name,
 * or the Track architecture evolution copy. Kept like the Welcome flag
 * (`welcome-gate.ts`): localStorage, and a storage that throws reads as no
 * record.
 */

export const TOUR_PROJECT_KEY = "karasu-first-run-tour-project";

export function readTourProjectId(storage?: Pick<Storage, "getItem">): string | null {
  try {
    return (storage ?? localStorage).getItem(TOUR_PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Best effort: without storage, a restart opens a new copy of the sample. */
export function writeTourProjectId(id: string, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(TOUR_PROJECT_KEY, id);
  } catch {
    // Nothing to fall back to.
  }
}
