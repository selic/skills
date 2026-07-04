---
name: publish-mcp-server
description: Publish and distribute an MCP server — npm packaging, official MCP registry (mcp-publisher/server.json), Claude Desktop MCPB bundle, GitHub release automation, and directory listings (Glama, Docker MCP Catalog, Cline, awesome-mcp-servers). Use when asked to publish, release, distribute, or list an MCP server, or to prepare one for public distribution.
---

# Publish an MCP server

End-to-end distribution pipeline for a TypeScript/Node MCP server, distilled from
the real mcp-itglue release (July 2026). Work the phases in order — later phases
validate against earlier ones (the MCP registry checks npm; directories check both).

**Driver:** run the `check.mjs` bundled next to this skill, from the repo root —
`node "<skill-dir>/check.mjs" [--online]`, where `<skill-dir>` is wherever the skill
is installed (`~/.claude/skills/publish-mcp-server/`, `.claude/skills/publish-mcp-server/`,
or as a plugin `$CLAUDE_PLUGIN_ROOT/skills/publish-mcp-server/`). Run it before
starting (shows what's missing), after each phase, and with `--online` at the end
(verifies npm/registry/tag are in sync). Exit 1 = blocking issues.

## Phase 1 — npm packaging

package.json needs: `bin` (entry file with `#!/usr/bin/env node` shebang in the
*source*, tsc preserves it), `files: ["dist", "README.md", "LICENSE"]`,
`"prepublishOnly": "npm run build"`, `mcpName: "io.github.<user>/<name>"`,
`repository`/`homepage`/`bugs`, `license`, `engines`, and `mcp-server` in keywords.
Check name availability: `npm view <name>` → E404 means free.

Smoke-test the actual tarball, not the source tree:

```bash
npm pack --pack-destination /tmp
cd /tmp && npx -y ./<name>-<version>.tgz           # missing env vars → clean error, not a stack trace
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}\n' \
  | API_KEY_VAR=dummy npx -y ./<name>-<version>.tgz | head -1   # must return an initialize result
```

Publish: `npm login && npm publish`. **npm now requires 2FA on the account** — a bare
publish returns 403 `Two-factor authentication ... required` if 2FA isn't enabled
(classic automation tokens no longer exist; for CI use a granular token with
"Bypass 2FA" — 90-day max — or OIDC trusted publishing).

## Phase 2 — official MCP registry

`server.json` at repo root, schema `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`:
`name` = the `mcpName` value, `description` **≤100 chars** (422 otherwise), `version`
in TWO places (top level + `packages[0]`), npm package entry with `runtimeHint: "npx"`,
stdio transport, `environmentVariables` (mark keys `isSecret`).

Publish **after** npm is live (the registry fetches the tarball to verify `mcpName`):

```bash
brew install mcp-publisher
mcp-publisher login github     # device-code flow; authorizes io.github.<user>/*
mcp-publisher publish          # reads ./server.json
```

Verify: `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=<mcpName>&version=latest"`

## Phase 3 — Claude Desktop bundle (.mcpb)

`manifest.json` (`manifest_version: "0.3"`) with `server.mcp_config` (`command: node`,
`args: ["${__dirname}/dist/index.js"]`, env from `${user_config.*}`) and `user_config`
fields (`sensitive: true` for keys). Build via a staging script that copies
manifest + dist + package files and runs `npm ci --omit=dev` there, then
`npx -y @anthropic-ai/mcpb pack <stage> <name>.mcpb` — packing the repo root drags in
devDependencies. Gitignore `*.mcpb` and the staging dir.
Reference implementation: `scripts/bundle.mjs` in github.com/selic/mcp-itglue.

## Phase 4 — release automation

Workflow on `push: tags: ["v*"]`: build → test → npm publish → bundle → GitHub release
with the `.mcpb` attached (`softprops/action-gh-release@v2`, `permissions: contents: write`,
`id-token: write` for provenance). Make the npm-publish step skip when the version is
already live or `NPM_TOKEN` is unset — so manual publishing doesn't fail the release.
Reference: `.github/workflows/release.yml` in github.com/selic/mcp-itglue.

Release: bump version in **package.json + server.json (×2) + manifest.json** (the
checker enforces lockstep), merge, then `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Phase 5 — directories (optional, after the above)

- **Glama** — submit at glama.ai/mcp/servers (login required; ~400-char description
  limit in the form). Add `glama.json` to the repo root:
  `{"$schema": "https://glama.ai/mcp/schemas/server.json", "maintainers": ["<user>"]}`
- **awesome-mcp-servers** (punkpeye) — one line, alphabetical, in the right category;
  their bot **requires a Glama score badge** on the entry before merge. PR titles
  ending `🤖🤖🤖` opt into the agent fast-track (per their CONTRIBUTING).
- **Docker MCP Catalog** — PR to docker/mcp-registry: `servers/<name>/server.yaml`
  (copy `servers/grafana/server.yaml` as template; `run.command` must force
  `--transport stdio` if the image defaults to HTTP) **plus `tools.json`** — generate
  it from the live server's `tools/list` so their CI doesn't need credentials
  (missing tools.json is their most common PR blocker).
- **Cline marketplace** — issue on cline/mcp-marketplace; needs a **400×400 PNG logo**
  (commit to `assets/logo.png`, reference the raw URL) and an honest tick of
  "tested that Cline can set up the server from README alone" — actually run that
  test in Cline first. Prefill the issue form via URL query params (field ids:
  `repo-url`, `logo`, `additional-info`).
- **mcpservers.org / mcpmarket.com** — web forms, free tiers exist ($39/$29 paid tiers
  are optional). mcpmarket free queue is ~4–6 weeks.

## Gotchas (each one cost real time)

- `git tag` alone does nothing — the release workflow triggers on tag **push** only.
- A tag pointing at a commit *before* the workflow file existed runs nothing.
- The registry JWT from `mcp-publisher login github` expires in well under an hour —
  expect the device-code dance on every publish.
- server.json description >100 chars → 422 at publish time, not at authoring time.
- Desktop hosts (MCPB) pass unset optional `user_config` as **empty strings** — env
  parsing must use `||`-style fallbacks, not `??`, or an empty `BASE_URL` overrides
  the default. The checker greps for this.
- MCP clients (Cline, Claude Code) write `.mcp.json` **with the API key inside** into
  the repo dir during testing — gitignore it before it lands in a commit.
- `npm view <name>` on the freshly published package can lag a few seconds; registries
  and badge CDNs cache harder (minutes).
- `npx -y <name>` **from inside the repo** resolves the local package (same name) and
  fails with `command not found` — run the npx smoke test from any other directory.

## Verify (end state)

```bash
node "<skill-dir>/check.mjs" --online                         # all ✓ (see Driver above)
(cd /tmp && npx -y <name>@<version> --help)                   # from OUTSIDE the repo — see gotchas
gh release view v<version> --json assets                      # .mcpb attached
```
