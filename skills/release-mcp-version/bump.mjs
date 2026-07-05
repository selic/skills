#!/usr/bin/env node
/**
 * Lockstep version bump for an MCP-server repo.
 *
 * Bumps the version in every place the release machinery expects it to match:
 *   - package.json            "version"
 *   - server.json             "version"  AND  packages[0].version
 *   - manifest.json           "version"
 *
 * Files that don't exist are skipped (a server without an MCPB bundle has no
 * manifest.json). Formatting/indentation is preserved by editing the raw text
 * of the specific "version" lines rather than re-serialising. Refuses to move
 * to an equal or lower version. Leaves lockstep VALIDATION to the publisher
 * checker (~/.claude/skills/publish-mcp-server/check.mjs).
 *
 * Usage (from the repo root):
 *   node ~/.claude/skills/release-mcp-version/bump.mjs <newVersion|patch|minor|major>
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function die(msg) {
  console.error(`bump: ${msg}`);
  process.exit(1);
}

function parse(v) {
  const m = SEMVER.exec(v);
  if (!m) die(`not a plain x.y.z version: "${v}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function nextVersion(current, arg) {
  if (SEMVER.test(arg)) return arg;
  const [maj, min, pat] = parse(current);
  if (arg === "major") return `${maj + 1}.0.0`;
  if (arg === "minor") return `${maj}.${min + 1}.0`;
  if (arg === "patch") return `${maj}.${min}.${pat + 1}`;
  die(`argument must be x.y.z or one of patch|minor|major (got "${arg}")`);
}

/**
 * Replace the first `count` occurrences of `"version": "<x.y.z>"` in a JSON
 * text with the new version. Returns { text, hits } or null if the file is
 * absent. Throws if the expected number of version lines isn't found.
 */
function bumpFile(file, current, next, count) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return null;
  const original = readFileSync(path, "utf8");
  const re = /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/g;
  let hits = 0;
  const text = original.replace(re, (whole, pre, ver, post) => {
    if (hits >= count) return whole;
    if (ver !== current) {
      die(`${file}: found version "${ver}" but expected "${current}" — versions already out of lockstep; reconcile by hand first.`);
    }
    hits += 1;
    return `${pre}${next}${post}`;
  });
  if (hits < count) {
    die(`${file}: expected ${count} "version" field(s) at ${current}, found ${hits}.`);
  }
  writeFileSync(path, text);
  return { file, hits };
}

const arg = process.argv[2];
if (!arg) die("usage: bump.mjs <newVersion|patch|minor|major>");

// Source of truth for the current version is package.json.
if (!existsSync(resolve(process.cwd(), "package.json"))) {
  die("no package.json in the current directory — run from the repo root.");
}
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
const current = pkg.version;
if (!current || !SEMVER.test(current)) die(`package.json has no plain x.y.z version (got "${current}").`);

const next = nextVersion(current, arg);
if (cmp(next, current) <= 0) die(`refusing to bump ${current} → ${next} (must be strictly higher).`);

// package.json: 1 version line. server.json: 2 (top-level + packages[0]). manifest.json: 1.
const results = [
  bumpFile("package.json", current, next, 1),
  bumpFile("server.json", current, next, 2),
  bumpFile("manifest.json", current, next, 1),
].filter(Boolean);

console.log(`Bumped ${current} → ${next}`);
for (const r of results) console.log(`  ${r.file} (${r.hits} field${r.hits > 1 ? "s" : ""})`);
const skipped = ["server.json", "manifest.json"].filter(
  (f) => !existsSync(resolve(process.cwd(), f))
);
for (const f of skipped) console.log(`  (skipped ${f} — not present)`);
console.log(`\nNext: validate lockstep →  node ~/.claude/skills/publish-mcp-server/check.mjs`);
