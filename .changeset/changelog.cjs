// Custom changeset changelog formatter.
//
// The default `@changesets/cli/changelog` prefixes each entry with the commit
// that ADDED the changeset file. When a changeset is authored in the same PR
// that makes the change, that is the real commit. But for changesets that are
// *backfilled* after the fact (added in a later commit), the default points at
// the backfill commit, not the change — e.g. all seven core changesets added
// in #1754 would otherwise show the same `f82d848` hash.
//
// So:
//   - A changeset authored normally (in the PR that makes the change) keeps the
//     default behavior: we prepend `changeset.commit`, which is the real commit.
//   - A *backfilled* changeset overrides that by leading its summary with the
//     correct short hash (`<hash>: …`); when a leading hash is already present
//     we do NOT prepend `changeset.commit` (which would be the wrong/backfill
//     commit), so the manual hash wins.

// Implements `@changesets/types` ChangelogFunctions ({ getReleaseLine,
// getDependencyReleaseLine }). The type-import annotation is intentionally
// omitted so this file needs no devDependency (knip flags an unlisted
// `@changesets/types` otherwise).

// A summary "overrides" the auto hash when its first line already starts with a
// `<7-40 hex>: ` prefix (the convention a backfilled changeset uses).
const LEADING_HASH = /^[0-9a-f]{7,40}: /;

const changelogFunctions = {
  getReleaseLine: async (changeset) => {
    const [firstLine, ...futureLines] = changeset.summary
      .split("\n")
      .map((l) => l.trimEnd());

    const prefix =
      changeset.commit && !LEADING_HASH.test(firstLine)
        ? `${changeset.commit.slice(0, 7)}: `
        : "";

    let line = `- ${prefix}${firstLine}`;
    if (futureLines.length > 0) {
      line += `\n${futureLines.map((l) => `  ${l}`).join("\n")}`;
    }
    return line;
  },

  getDependencyReleaseLine: async (_changesets, dependenciesUpdated) => {
    if (dependenciesUpdated.length === 0) return "";
    const deps = dependenciesUpdated.map(
      (dep) => `  - ${dep.name}@${dep.newVersion}`,
    );
    return ["- Updated dependencies:", ...deps].join("\n");
  },
};

module.exports = changelogFunctions;
