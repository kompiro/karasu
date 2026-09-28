# karasu-skills

Agent skills for [karasu](https://github.com/kompiro/karasu), the text-based
architecture modeling tool. The package is laid out as a Claude Code plugin
(plugin name `karasu`).

| Skill                  | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
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

## Version check

Each skill starts with a Step 0 that compares `karasu --version` with the CLI
version the skill was written for, and asks you to update karasu when it is
older. A newer karasu is fine.

## License

Apache-2.0
