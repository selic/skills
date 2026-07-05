---
name: release-mcp-version
description: Cut and publish a NEW version of an MCP server that already has its distribution pipeline set up — lockstep version bump across package.json/server.json/manifest.json, land on main, tag, and let CI publish to npm + the official MCP registry + a GitHub release (.mcpb) + a container image. Use when asked to release/ship/publish a new version, cut a release, or "bump and publish" an MCP server. For FIRST-TIME distribution setup use publish-mcp-server instead. Triggers on: "release a new version", "publish vX.Y.Z", "cut a release", "bump the version and publish", "ship the new version".
argument-hint: "[patch|minor|major|X.Y.Z]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Release a new MCP-server version

Incremental-release runbook for a repo that **already** has the distribution
pipeline in place (npm package, `server.json`, optional `manifest.json`, a
tag-triggered `release.yml`, and — if containerised — a `docker-publish.yml`).
Publish-only: npm + the official MCP registry + a GitHub release. Container
redeploy is the optional appendix, not part of a normal release.

Auto-detect the target from the repo in the cwd: read `package.json` for `name`,
`mcpName`, and the current `version`.

**Bundled resource:** `bump.mjs` sits next to this file — invoke it as
`node "<skill-dir>/bump.mjs" …`, where `<skill-dir>` is wherever this skill lives
(`~/.claude/skills/release-mcp-version/`, or as a plugin
`$CLAUDE_PLUGIN_ROOT/skills/release-mcp-version/`). The lockstep/online validator
is `check.mjs` from the companion **publish-mcp-server** skill.

## ⚠️ Steps that need the user's explicit go-ahead

The harness will (correctly) block these; do **not** retry silently — pause and ask:

1. **Landing on `main`** — a direct push to the default branch, or merging a PR you
   authored yourself. Ask the user to confirm, or have them merge in the GitHub UI.
2. **(Appendix only)** a production container redeploy.

Everything else runs unattended, except the registry device-flow, where you surface
a code + URL and the user approves in a browser.

## Phase 0 — preflight

- Confirm the cwd is the intended repo (`node -p "require('./package.json').name"`).
- Working tree clean (`git status --short`); on `main` or the release branch/PR.
- Green locally: `npm ci && npm run build && npm test`.
- Choose the semver bump from what changed: **patch** (fixes), **minor** (additive,
  backward-compatible), **major** (breaking). On `0.x`, treat breaking as a minor.
- Confirm the npm token is in **THIS repo's** Actions secrets — it's per-repo:
  `gh api repos/<owner>/<repo>/actions/secrets --jq '.secrets[].name'` should list
  `NPM_TOKEN`. A token in another repo does **not** apply and can't be copied (secrets
  are write-only). If missing: `gh secret set NPM_TOKEN --repo <owner>/<repo>` (paste at
  the prompt), or plan to `npm publish` by hand.

## Phase 1 — bump the version (lockstep)

The version must match in every place the pipeline reads it: `package.json`,
`server.json` (top-level **and** `packages[0].version`), and `manifest.json`.

```bash
node "<skill-dir>/bump.mjs" <patch|minor|major|X.Y.Z>
node "<publish-mcp-server skill-dir>/check.mjs"      # confirms lockstep + packaging
git add -A && git commit -m "Release vX.Y.Z"
```

`bump.mjs` edits all locations, skips a missing `manifest.json`, and refuses a downgrade.

## Phase 2 — land on `main`  ⚠️ (authorization gate)

- Direct on `main`: `git push origin main` — **ask first** (default-branch push).
- Via a PR: `gh pr merge <n> --merge --delete-branch` — **ask first** (self-merge is
  blocked). Or the user clicks Merge; then `git checkout main && git pull`.

## Phase 3 — tag & push → CI publishes

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

The tag **push** (not `git tag` alone) fires:
- `release.yml` → build/test → `npm publish --provenance` (uses `NPM_TOKEN`; no-ops if the
  version is already live or the token is unset) → `.mcpb` bundle → GitHub release.
- `docker-publish.yml` (if present) → container image (`:X.Y.Z`, `:X.Y`, `:latest` from main).

Watch: `gh run watch "$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status --compact`.
Confirm the "Publish to npm" step's conclusion is `success` (not skipped) via
`gh run view <id> --json jobs`.

## Phase 4 — MCP registry (device-flow)

The `mcp-publisher` login token expires in well under an hour — log in **immediately**
before publishing. Run login in the background, read its output, and give the user the
code + URL; it completes when they authorize.

```bash
mcp-publisher login github     # → "enter code XXXX-XXXX at https://github.com/login/device"
mcp-publisher publish          # reads ./server.json
```

## Phase 5 — verify

```bash
node "<publish-mcp-server skill-dir>/check.mjs" --online   # npm + registry + tag all current
gh release view vX.Y.Z --json assets                       # .mcpb attached
(cd /tmp && npx -y <pkg>@X.Y.Z --help)                     # from OUTSIDE the repo
```

## Gotchas (each cost real time once)

- `NPM_TOKEN` is **per-repo and write-only** — a token in another repo doesn't count
  and can't be read/copied; add it to the repo you're releasing.
- The `mcp-publisher` login token dies fast — always log in right before `publish`.
- Run the `npx` smoke test from **outside** the repo (`npx -y <name>` inside the repo
  resolves the local package and fails).
- A release fires on tag **push**, not `git tag`. A tag on a commit predating the
  workflow file runs nothing.
- If `git tag vX.Y.Z` says "already exists" it aborts a chained `&& git push` — push the
  existing tag explicitly.

---

## Appendix — container redeploy (optional, not a normal release step)

If the server runs as a container pulled from a registry (e.g. an Azure App Service
or any host), the image is already built by `docker-publish.yml`; redeploy = repoint
the tag and restart. ⚠️ Production change — get an explicit go-ahead. Prefer enabling
the host's continuous-deployment webhook so a tag push auto-rolls; otherwise repoint +
restart by hand.

Azure App Service example (fill in your own coordinates):

```bash
SUB=<subscription-id>; RG=<resource-group>; APP=<app-name>
az webapp config container show --subscription $SUB -g $RG -n $APP \
  --query "[?name=='DOCKER_CUSTOM_IMAGE_NAME'].value" -o tsv          # current image:tag
az webapp config container set  --subscription $SUB -g $RG -n $APP \
  --container-image-name <registry>/<owner>/<repo>:latest             # or :X.Y.Z to pin
az webapp restart --subscription $SUB -g $RG -n $APP
# then poll https://<host>/health until "version" == X.Y.Z
```

`az` may need `brew reinstall azure-cli` then `az login --use-device-code` (surface the
code like the registry flow). Rollback: rerun `container set` with the previous tag.
