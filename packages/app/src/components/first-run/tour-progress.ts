import { TOURS, isTourId, type TourId } from "./tour-steps.js";

/**
 * How far the visitor got in the first-run tour (#3598), so a reload or a
 * return from the share link resumes the same step. Written when the tour
 * starts or moves, removed when it ends. Kept apart from the tour's project
 * (`tour-project.ts`), which outlives the tour as Restart Guided Tour…'s way
 * back. Like the Welcome flag, a storage that throws reads as no record, and
 * a value of another shape or version, of a guide this build does not have, or
 * past that guide's last step reads as none too (TPL-1530).
 */

export const TOUR_PROGRESS_KEY = "karasu-first-run-tour";

export interface TourProgress {
  tour: TourId;
  projectId: string;
  /** Index into the guide's steps. */
  step: number;
}

interface StoredTourProgress extends TourProgress {
  v: 1;
}

function isStoredTourProgress(value: unknown): value is StoredTourProgress {
  if (typeof value !== "object" || value === null) return false;
  const { v, tour, projectId, step } = value as Record<string, unknown>;
  return (
    v === 1 &&
    isTourId(tour) &&
    typeof projectId === "string" &&
    projectId !== "" &&
    Number.isInteger(step) &&
    (step as number) >= 0 &&
    (step as number) < TOURS[tour].steps.length
  );
}

export function readTourProgress(storage?: Pick<Storage, "getItem">): TourProgress | null {
  try {
    const raw = (storage ?? localStorage).getItem(TOUR_PROGRESS_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isStoredTourProgress(value)) return null;
    return { tour: value.tour, projectId: value.projectId, step: value.step };
  } catch {
    return null;
  }
}

/** Best effort: without storage, a reload ends the tour as it did before #3598. */
export function writeTourProgress(
  { tour, projectId, step }: TourProgress,
  storage?: Pick<Storage, "setItem">,
): void {
  const record: StoredTourProgress = { v: 1, tour, projectId, step };
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
