import { isTourId, type TourId } from "./tour-steps.js";

/**
 * Which guide was started last and in which project (#3597, #3600), so Restart
 * Guided Tour… redoes that guide in that copy of the sample instead of opening
 * another. Matching by name would also pick a project the visitor created
 * under the same name, or another guide's copy. Kept like the Welcome flag
 * (`welcome-gate.ts`): localStorage, and a storage that throws reads as no
 * record. A value not starting with `{` predates #3600, when only the Design
 * guide recorded its project, as a bare id.
 */

export const TOUR_PROJECT_KEY = "karasu-first-run-tour-project";

export interface TourProject {
  tour: TourId;
  projectId: string;
}

export function readTourProject(storage?: Pick<Storage, "getItem">): TourProject | null {
  try {
    const raw = (storage ?? localStorage).getItem(TOUR_PROJECT_KEY);
    if (!raw) return null;
    if (!raw.startsWith("{")) return { tour: "service-split", projectId: raw };
    const { tour, projectId } = JSON.parse(raw) as Record<string, unknown>;
    return isTourId(tour) && typeof projectId === "string" && projectId !== ""
      ? { tour, projectId }
      : null;
  } catch {
    return null;
  }
}

/** Best effort: without storage, a restart opens the Design guide in a new copy. */
export function writeTourProject(
  { tour, projectId }: TourProject,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? localStorage).setItem(TOUR_PROJECT_KEY, JSON.stringify({ tour, projectId }));
  } catch {
    // Nothing to fall back to.
  }
}
