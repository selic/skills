#!/usr/bin/env node
/**
 * Preflight checker for publishing an MCP server.
 * Run from the repo root: node <path-to-this-skill>/check.mjs [--online]
 *
 * Validates the repo against every failure mode hit during a real
 * publish (mcp-itglue, July 2026): version lockstep, registry limits,
 * npm packaging fields, unpushed tags, secret hygiene.
 * --online adds npm/MCP-registry/tag-sync checks (network + git).
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const online = process.argv.includes("--online");
let failures = 0;

const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`); };
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
const section = (msg) => console.log(`\n${msg}`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

if (!existsSync("package.json")) {
  console.error("No package.json here — run from the repo root.");
  process.exit(1);
}
const pkg = readJson("package.json");
const version = pkg.version;

section(`package.json (${pkg.name}@${version})`);
pkg.bin ? ok("bin entry present") : bad("no \"bin\" — npx can't launch it");
if (pkg.bin) {
  const binPath = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
  // The built file may not exist yet; the shebang must be in the source entry.
  const srcEntry = existsSync("src/index.ts") ? "src/index.ts" : existsSync(binPath) ? binPath : null;
  if (srcEntry && readFileSync(srcEntry, "utf8").startsWith("#!/usr/bin/env node")) ok(`shebang in ${srcEntry}`);
  else bad(`no "#!/usr/bin/env node" shebang at top of ${srcEntry ?? binPath}`);
}
Array.isArray(pkg.files) && pkg.files.length ? ok(`files whitelist: ${pkg.files.join(", ")}`) : bad("no \"files\" whitelist — the tarball will include everything");
pkg.scripts?.prepublishOnly ? ok("prepublishOnly builds before publish") : bad("no prepublishOnly script — a stale dist/ can get published");
pkg.mcpName ? ok(`mcpName: ${pkg.mcpName}`) : bad("no \"mcpName\" — the MCP registry validates npm ownership through it");
if (pkg.mcpName && !/^io\.github\.[^/]+\/.+$/.test(pkg.mcpName)) bad("mcpName must look like io.github.<user>/<name> for GitHub-auth publishing");
pkg.repository ? ok("repository set") : bad("no repository field (npm provenance requires it)");
pkg.license ? ok(`license: ${pkg.license}`) : bad("no license");
pkg.engines?.node ? ok(`engines.node: ${pkg.engines.node}`) : warn("no engines.node");
(pkg.keywords ?? []).includes("mcp-server") ? ok("keyword mcp-server present") : warn("add \"mcp-server\" to keywords — directories filter on it");

section("server.json (MCP registry)");
if (!existsSync("server.json")) bad("server.json missing — required for mcp-publisher");
else {
  const srv = readJson("server.json");
  srv.$schema?.includes("modelcontextprotocol.io/schemas") ? ok("$schema set") : warn(`$schema is ${srv.$schema ?? "missing"}`);
  srv.version === version ? ok(`top-level version matches (${version})`) : bad(`server.json version ${srv.version} != package ${version}`);
  const p = srv.packages?.[0];
  if (!p) bad("no packages[] entry");
  else {
    p.version === version ? ok("packages[0].version matches") : bad(`packages[0].version ${p.version} != package ${version}`);
    p.identifier === pkg.name ? ok("packages[0].identifier matches npm name") : bad(`packages[0].identifier ${p.identifier} != ${pkg.name}`);
  }
  srv.name === pkg.mcpName ? ok("name matches package.json mcpName") : bad(`server.json name ${srv.name} != mcpName ${pkg.mcpName}`);
  (srv.description ?? "").length <= 100 ? ok(`description ${srv.description.length}/100 chars`) : bad(`description is ${srv.description.length} chars — registry rejects >100 with a 422`);
}

section("manifest.json (MCPB bundle)");
if (!existsSync("manifest.json")) warn("no manifest.json — skipping (no Claude Desktop bundle)");
else {
  const man = readJson("manifest.json");
  man.version === version ? ok(`version matches (${version})`) : bad(`manifest.json version ${man.version} != package ${version}`);
  man.user_config && Object.keys(man.user_config).length ? ok(`user_config: ${Object.keys(man.user_config).join(", ")}`) : warn("no user_config fields");
  // Desktop hosts pass unset optional user_config as EMPTY STRINGS.
  const src = existsSync("src/config.ts") ? readFileSync("src/config.ts", "utf8") : "";
  if (src.match(/env\.\w+\s*\?\?/)) warn("config uses `??` on env vars — empty strings from desktop hosts won't fall through to defaults (use `||`)");
  else if (src) ok("config env parsing tolerates empty strings");
}

section("hygiene");
const gi = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
gi.includes("*.mcpb") ? ok("*.mcpb gitignored") : warn("add *.mcpb to .gitignore — don't commit bundles");
gi.includes(".mcp.json") ? ok(".mcp.json gitignored") : warn("add .mcp.json to .gitignore — MCP clients write API keys into it");
try {
  const tracked = sh("git ls-files .mcp.json");
  if (tracked) bad(".mcp.json is TRACKED by git — it may contain an API key");
} catch { /* not a git repo */ }

if (online) {
  section("online checks");
  try {
    const published = sh(`npm view ${pkg.name} version 2>/dev/null`);
    published === version ? ok(`npm has ${published} (current)`) : warn(`npm has ${published}, local is ${version} — publish pending`);
  } catch { warn(`${pkg.name} not on npm yet (name is available if this is the first publish)`); }
  try {
    const reg = JSON.parse(sh(`curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=${pkg.mcpName}&version=latest"`));
    const entry = reg.servers?.[0]?.server;
    if (!entry) warn("not in the MCP registry yet — run mcp-publisher publish after npm publish");
    else entry.version === version ? ok(`MCP registry has ${entry.version} (current)`) : warn(`MCP registry has ${entry.version}, local is ${version} — re-run mcp-publisher publish`);
  } catch { warn("could not query MCP registry"); }
  try {
    const localTag = sh(`git tag -l v${version}`);
    const remoteTag = sh(`git ls-remote --tags origin v${version}`);
    if (localTag && !remoteTag) bad(`tag v${version} exists locally but was NEVER PUSHED — the release workflow only triggers on push`);
    else if (remoteTag) ok(`tag v${version} is on origin`);
    else warn(`no v${version} tag yet — tag after publishing`);
  } catch { warn("could not compare tags with origin"); }
}

console.log(failures ? `\n${failures} blocking issue(s).` : "\nAll blocking checks passed.");
process.exit(failures ? 1 : 0);
