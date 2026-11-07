import type { ExampleProject, FileSystemProvider, Project } from "@karasu-tools/core";

/**
 * Whether every file of the bundled sample is in the project, unchanged (#3600).
 * A guide's text describes the sample, so it only fits a project that still
 * says what the sample says. A file that cannot be read counts as a difference.
 */
export async function projectMatchesExample(
  fs: Pick<FileSystemProvider, "readFile">,
  project: Pick<Project, "rootPath">,
  example: ExampleProject,
): Promise<boolean> {
  try {
    const contents = await Promise.all(
      example.files.map((file) => fs.readFile(`${project.rootPath}/${file.path}`)),
    );
    return contents.every((content, i) => content === example.files[i].content);
  } catch {
    return false;
  }
}
