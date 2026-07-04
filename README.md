# selic/skills

Agent Skills for [Claude Code](https://code.claude.com), distilled from real MSP,
Home Assistant, and MCP work. Each skill is a self-contained `SKILL.md` that teaches
the agent a repeatable, opinionated procedure — the kind of thing I'd otherwise
re-explain every time.

## Skills

| Skill | What it does |
|-------|--------------|
| [`publish-mcp-server`](skills/publish-mcp-server/SKILL.md) | End-to-end MCP server distribution — npm packaging, the official MCP registry, Claude Desktop `.mcpb` bundle, tagged-release automation, and directory listings. Ships a `check.mjs` preflight validator. |
| [`ha-addon-scaffold`](skills/ha-addon-scaffold/SKILL.md) | Scaffold a production-ready Home Assistant add-on — `config.yaml` options schema, multi-arch image, s6 services, Ingress web UI, GHCR CI, docs. |
| [`mcp-server-review`](skills/mcp-server-review/SKILL.md) | Audit an MCP server's tool design — naming, descriptions/annotations, schema strictness, output token budgets, error handling, and permission safety. |

More landing here over time. See [`_template/SKILL.md`](_template/SKILL.md) for the
shape of a good skill.

## Install (as a Claude Code plugin)

This repo is also a plugin marketplace, so you get every skill with two commands:

```
/plugin marketplace add selic/skills
/plugin install selic-skills@selic
```

Update later with `/plugin marketplace update selic`.

## Use without the plugin system

Skills are just folders. Copy any one into your skills directory:

```bash
# project-scoped
cp -r skills/ha-addon-scaffold .claude/skills/
# or user-scoped (available in every project)
cp -r skills/ha-addon-scaffold ~/.claude/skills/
```

Claude Code loads it automatically; invoke it by name or let its `description`
triggers pull it in.

## Contributing your own

Copy [`_template/SKILL.md`](_template/SKILL.md) to `skills/<name>/SKILL.md`, write
the `description` as a precise trigger (it decides when the skill loads), and keep
the body imperative and focused. Only folders under `skills/` are loaded as skills.

## Author

Built by **Eugene Samotija** ([@selic](https://github.com/selic)) — [defency.net](https://defency.net).
More projects: [github.com/selic](https://github.com/selic) · [LinkedIn](https://www.linkedin.com/in/evghenii-samotiia)

## License

[MIT](LICENSE)
