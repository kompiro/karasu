/**
 * Serializes async tasks so their read-modify-write sequences run one at a time
 * (#1531). Every OPFS-backed JSON index (project metadata, snapshot index) does
 * `read → mutate → write`; running two concurrently lets the later write
 * clobber the earlier one and silently drop records. Chaining each task after
 * the previous makes the whole sequence atomic relative to the others.
 *
 * A rejected task propagates its rejection to its own caller but does not poison
 * later tasks — the internal chain always continues.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    // Run `task` after the previous settles, whether it fulfilled or rejected.
    const result = this.tail.then(task, task);
    // Keep the chain alive (and pre-handled, so a fire-and-forget caller doesn't
    // raise an unhandled rejection) regardless of this task's outcome.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
