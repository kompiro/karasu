# karasu-skills

Agent skills for [karasu](https://github.com/kompiro/karasu), the text-based
architecture modeling tool. The package is laid out as a Claude Code plugin
(plugin name `karasu`).

| Skill                  | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `karasu-author`        | Builds and updates a model of your own system through conversation, layer by layer  |
| `reverse-architecture` | Reverse-engineers a repository into a karasu model (`.krs`) at uniform domain depth |

The skills drive the karasu CLI, so install it too:

```sh
npm i -g karasu
```

## Install in Claude Code

```text
/plugin marketplace add kompiro/karasu
/plugin install karasu@karasu
```

The marketplace entry installs this npm package. Plugins from third-party
marketplaces do not update automatically by default; update the plugin from
the `/plugin` menu to pick up a new release.

## Install in other agents

The karasu CLI ships this package and copies the skills for you:

```sh
npx karasu skill install --dir <the directory your agent reads skills from>
```

Without `--dir` they go to `.claude/skills/`. See `karasu skill --help`.

## Version check

Each skill starts with a Step 0 that compares `karasu --version` with the CLI
version the skill was written for, and asks you to update karasu when it is
older. A newer karasu is fine. It then reads `karasu capabilities --json` and
switches to the replacement of any command the CLI has renamed since.

## License

Apache-2.0
