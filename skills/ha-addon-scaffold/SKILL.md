---
name: ha-addon-scaffold
description: "Scaffold a production-ready Home Assistant add-on: config.yaml with UI options schema, multi-arch Dockerfile + build.yaml, s6-overlay services, Ingress web UI wiring, GHCR CI, DOCS/CHANGELOG, and an add-on repository.yaml. Use when creating a new Home Assistant add-on, adding an add-on to a repository, or setting up HA add-on CI/CD. Triggers on: home assistant add-on, hass.io addon, scaffold ha addon, ingress addon, addon repository."
argument-hint: "[addon slug and one-line purpose]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Home Assistant add-on scaffold

You generate a complete, installable Home Assistant add-on that follows the
Supervisor add-on spec and ships as a multi-arch GHCR image. Prefer editing an
existing add-on repo over creating files from scratch when one is present.

## Phase 0 — Gather intent

From `$ARGUMENTS` (or by asking, max 3 questions) establish:

- **slug** — lowercase, `[a-z0-9_]+`, unique in the repo (e.g. `parkingcam`).
- **purpose** — one sentence for `description`.
- **runtime** — Python / Node / shell? Long-running service or one-shot?
- **needs** — camera/entity access? MQTT discovery? Ingress web UI? Bundled model/asset?
- **arch** — default `aarch64` + `amd64`; add `armv7`/`armhf`/`i386` only if asked.

Do not ask about anything you can infer. If it's an existing repo, read
`repository.yaml` and a sibling add-on first to match conventions.

## Phase 1 — Repository layout

An add-on **repository** (what users add by URL) looks like:

```
<repo>/
├── repository.yaml          # name, url, maintainer
├── README.md                # how to add the repo + what the add-ons do
├── LICENSE
├── .github/workflows/       # builder.yaml (GHCR), lint.yaml
└── <slug>/                  # one directory per add-on
    ├── config.yaml          # add-on manifest (the contract with Supervisor)
    ├── build.yaml           # base images per arch + OCI labels
    ├── Dockerfile
    ├── DOCS.md              # shown in the add-on's Documentation tab
    ├── CHANGELOG.md         # Keep a Changelog + SemVer
    ├── translations/en.yaml # config option labels/descriptions
    └── rootfs/              # overlaid onto the image (s6 services, app code)
```

`repository.yaml`:

```yaml
name: <Nice Name> Add-ons
url: https://github.com/<owner>/<repo>
maintainer: <Name> <email>
```

## Phase 2 — `config.yaml` (the manifest)

This is the highest-leverage file — it defines the whole UI. Key rules:

- `version` is a **string** (`"1.0.0"`) and must match `CHANGELOG.md` + the CI tag.
- `image: ghcr.io/<owner>/{arch}-<slug>` — `{arch}` is substituted by the builder.
- Expose **every** tunable via `options` (defaults) + `schema` (validation). Use
  real validators: `int(min,max)`, `float(min,max)`, `list(a|b|c)`, `match(^regex$)`,
  trailing `?` for optional, `str`/`bool`/`password`.
- Request only the access you use: `hassio_api`, `homeassistant_api`, `auth_api`,
  `map: ["config:rw", "share:rw"]`, `ports:` (map to `null` to keep optional).
- Web UI → `ingress: true` + `ingress_port: <n>` + `panel_icon`/`panel_title`.
- `startup: application`, `boot: auto`, `init: false` for a normal service add-on.

Mirror the option keys 1:1 in `translations/en.yaml` so the UI shows labels, not
raw keys.

## Phase 3 — Image: `build.yaml` + `Dockerfile`

- `build.yaml` sets `build_from` per arch to the official
  `ghcr.io/home-assistant/{arch}-base-debian:bookworm` (or `-base:` for Alpine),
  and OCI `labels` (title, description, source, licenses).
- `Dockerfile` starts `ARG BUILD_FROM` / `FROM ${BUILD_FROM}`, installs deps,
  `COPY rootfs /`, and ends with `CMD [ "/init" ]` (s6-overlay entrypoint).
- Bundle large assets (models, weights) under `rootfs/opt/<slug>/…` and commit
  them explicitly; keep training/dev artifacts out via `.gitignore`.

## Phase 4 — Process supervision (s6-overlay)

Under `rootfs/etc/`:

- `cont-init.d/00-bootstrap` — one-shot setup (render config from options via
  `bashio::config`, migrate old paths). Executable, `#!/usr/bin/with-contenv bashio`.
- `services.d/<name>/run` — one per long-running process (app + web UI get
  separate, independently supervised services). Executable.

Read options with `bashio::config 'key'`; log with `bashio::log.info`.

## Phase 5 — CI (`.github/workflows/`)

- `builder.yaml` — on `push` to `main` (path-filtered to the add-on) **and on tag
  push**, build multi-arch with `home-assistant/builder` and push to GHCR.
  ⚠️ The tag trigger must be `on.push.tags: ["v*"]` — there is **no** `push_tags`
  event; a top-level `push_tags:` key is silently ignored and tag releases won't build.
  Grant `permissions: { contents: read, packages: write }`.
- `lint.yaml` — run `home-assistant/actions` `hassfest`/add-on lint on PRs.

## Phase 6 — Docs + release checklist

- `DOCS.md` — install steps, every config option, first-run setup, troubleshooting.
- `README.md` (repo root) — how to add the repository URL to the Supervisor, and
  a one-paragraph pitch per add-on. Note that add-ons are **not** distributed via
  HACS (HACS is integrations/cards) — users add the repo URL directly.
- Before calling it publishable, verify:
  - [ ] repo is **public**
  - [ ] GHCR package `ghcr.io/<owner>/<arch>-<slug>` is **public** (else installs fail)
  - [ ] `version` matches across `config.yaml`, `CHANGELOG.md`, and the release tag
  - [ ] LICENSE holder is correct (GitHub detects a clean SPDX license)

## Output

Write real files (not a description of them). After scaffolding, print the exact
install instructions and the remaining manual gates (make public, GHCR visibility).
