import { InMemoryFileSystemProvider } from "@karasu-tools/core";

/**
 * The viewer's file system: one submitted `.krs`, nothing else (#2997).
 *
 * A single-file submission can still carry `@import "default.krs.style"` from
 * the project it was cut out of. The gallery's server-side renderer compiles
 * the text alone and never looks for that sheet; this provider matches it by
 * answering a missing `.krs.style` as an empty sheet, so the viewer shows no
 * "Style file not found" warning for a file the submitter could not include.
 * Any other missing file still fails as usual.
 */
export class SingleFileFileSystemProvider extends InMemoryFileSystemProvider {
  override async readFile(path: string): Promise<string> {
    if (path.endsWith(".krs.style") && !(await this.exists(path))) return "";
    return super.readFile(path);
  }
}
