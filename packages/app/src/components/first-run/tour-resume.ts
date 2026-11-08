import type { Project } from "@karasu-tools/core";
import { buildHash } from "../../hooks/history-hash.js";
import { getProjectIdFromPath } from "../../hooks/useProjectNavigation.js";
import type { TourProgress } from "./tour-progress.js";
import { TOURS, type TourId } from "./tour-steps.js";

/**
 * What the boot does with a recorded tour (#3598): resume it, leave the record
 * for a later boot, or delete it.
 */
export type TourResume =
  | { kind: "resume"; tour: TourId; projectId: string; root: string; step: number }
  | { kind: "keep" }
  | { kind: "discard" };

export const KEEP_TOUR: TourResume = { kind: "keep" };
const DISCARD_TOUR: TourResume = { kind: "discard" };

/**
 * Whether this boot resumes the recorded tour (#3598), from the URL the app
 * was opened with. A link from outside (a gallery example, a `?krs=` or `#s=`
 * link, someone's `#krs-…` permalink, another project's path) is followed and
 * the record kept: the boot's project alone does not decide, since the last
 * project is the tour's after a tour. The tour resumes on its own project's
 * path, whatever the hash (the app writes `#krs-…` itself), or on a bare URL
 * that opens the last project when that is the tour's. `hasDeepLink` is not
 * used for this: it reads the app's own hash as a link from outside.
 *
 * A record that is missing or unreadable, or whose project is gone, is
 * discarded.
 */
export function decideTourResume({
  entry,
  record,
  projects,
  lastProjectId,
}: {
  entry: Pick<Location, "pathname" | "search" | "hash">;
  record: TourProgress | null;
  projects: readonly Project[];
  lastProjectId: string | null;
}): TourResume {
  const project = record && projects.find((p) => p.id === record.projectId);
  if (!record || !project) return DISCARD_TOUR;

  const params = new URLSearchParams(entry.search);
  if (params.has("example") || params.has("krs") || entry.hash.startsWith("#s=")) return KEEP_TOUR;
  const pathId = getProjectIdFromPath(entry.pathname);
  const resumes =
    pathId !== null
      ? pathId === project.id
      : entry.search === "" && entry.hash === "" && lastProjectId === project.id;
  return resumes
    ? {
        kind: "resume",
        tour: record.tour,
        projectId: project.id,
        root: project.rootPath,
        step: record.step,
      }
    : KEEP_TOUR;
}

/**
 * The hash a resumed step opens with: its scene's file and view, undrilled.
 * The hash restoration then lands the scene's file and view itself, and the
 * scene adds only what the URL does not carry (the diff and the node to keep
 * in view), so resuming adds no history entry (TPL-1842).
 */
export function tourStepHash(root: string, tour: TourId, step: number): string {
  const { scene } = TOURS[tour].steps[step];
  return buildHash(scene.view, [], { file: `${root}/${scene.file}` });
}
