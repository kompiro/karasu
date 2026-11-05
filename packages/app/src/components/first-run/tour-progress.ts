import { SERVICE_SPLIT_TOUR } from "./tour-steps.js";

/**
 * How far the visitor got in the first-run tour (#3598), so a reload or a
 * return from the share link resumes the same step. Written when the tour
 * starts or moves, removed when it ends. Kept apart from the tour's project
 * (`tour-project.ts`), which outlives the tour as Restart Guided Tour…'s way
 * back. Like the Welcome flag, a storage that throws reads as no record, and
 * a value of another shape, version or tour reads as none too (TPL-1530).
 */

export const TOUR_PROGRESS_KEY = "karasu-first-run-tour";

export interface TourProgress {
  projectId: string;
  /** Index into `SERVICE_SPLIT_TOUR`. */
  step: number;
}

interface StoredTourProgress extends TourProgress {
  v: 1;
  /** Which guide this is, apart from the ones still to come (#3600, #3601). */
  tour: "service-split";
}

function isStoredTourProgress(value: unknown): value is StoredTourProgress {
  if (typeof value !== "object" || value === null) return false;
  const { v, tour, projectId, step } = value as Record<string, unknown>;
  return (
    v === 1 &&
    tour === "service-split" &&
    typeof projectId === "string" &&
    projectId !== "" &&
    Number.isInteger(step) &&
    (step as number) >= 0 &&
    (step as number) < SERVICE_SPLIT_TOUR.length
  );
}

export function readTourProgress(storage?: Pick<Storage, "getItem">): TourProgress | null {
  try {
    const raw = (storage ?? localStorage).getItem(TOUR_PROGRESS_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isStoredTourProgress(value) ? { projectId: value.projectId, step: value.step } : null;
  } catch {
    return null;
  }
}

/** Best effort: without storage, a reload ends the tour as it did before #3598. */
export function writeTourProgress(
  { projectId, step }: TourProgress,
  storage?: Pick<Storage, "setItem">,
): void {
  const record: StoredTourProgress = { v: 1, tour: "service-split", projectId, step };
  try {
    (storage ?? localStorage).setItem(TOUR_PROGRESS_KEY, JSON.stringify(record));
  } catch {
    // Nothing to fall back to.
  }
}

/** Best effort: a record left behind can resume a tour that ended, which is accepted. */
export function clearTourProgress(storage?: Pick<Storage, "removeItem">): void {
  try {
    (storage ?? localStorage).removeItem(TOUR_PROGRESS_KEY);
  } catch {
    // Nothing to fall back to.
  }
}
