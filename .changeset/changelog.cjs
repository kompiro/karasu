// Custom changeset changelog formatter.
//
// The default `@changesets/cli/changelog` prefixes each entry with the commit
// that ADDED the changeset file. When a changeset is authored in the same PR
// that makes the change, that is the real commit. But for changesets that are
// *backfilled* after the fact (added in a later commit), the default points at
// the backfill commit, not the change — e.g. all seven core changesets added
// in #1754 would otherwise show the same `f82d848` hash.
//
// So we drop the auto commit prefix and let each changeset summary carry its
// own accurate commit hash / PR reference. Changesets written normally (in the
// PR that makes the change) should keep citing their PR (`#1234`) in the
// summary; a backfilled changeset should additionally lead with the real short
// commit hash (`<hash>: …`).

/** @type {import('@changesets/types').ChangelogFunctions} */
const changelogFunctions = {
  getReleaseLine: async (changeset) => {
    const [firstLine, ...futureLines] = changeset.summary
      .split("\n")
      .map((l) => l.trimEnd());

    let line = `- ${firstLine}`;
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
