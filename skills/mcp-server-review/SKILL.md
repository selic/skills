---
name: mcp-server-review
description: "Review an MCP (Model Context Protocol) server for tool-design quality: tool naming and granularity, description/annotation accuracy, input schema strictness, output token budgets, error handling, and role/permission safety. Produces a prioritized findings list, not a rewrite. Use when reviewing, auditing, or hardening an MCP server or its tool definitions. Triggers on: review my MCP server, audit MCP tools, MCP tool design, are my tool descriptions good, MCP server quality."
argument-hint: "[path to the MCP server, or a tool file]"
allowed-tools: Bash, Read, Glob, Grep
---

# MCP server review

You audit an MCP server the way a demanding agent-integrator would: the tools are
the API the model sees, so every name, description, and schema is a prompt. Find
the highest-leverage defects and report them; do not silently rewrite the server.

## Scope

Locate the tool surface first: `Grep` for tool registration
(`server.tool(`, `registerTool`, `@mcp.tool`, `tools/list` handlers) and read the
tool definitions + their handlers. Note the transport (stdio / streamable HTTP)
and whether there is auth/RBAC.

## Review dimensions

Go through each; for every issue capture **file:line → problem → concrete fix**.

### 1. Tool granularity & surface area
- Too many near-duplicate tools (model can't choose) vs one overloaded tool with a
  `mode` grab-bag. Prefer a small set of sharp, task-shaped tools.
- Missing the obvious workflow tool (e.g. a `search` that replaces 3 list calls).
- Destructive and read tools not clearly separated.

### 2. Names
- Verb-first, unambiguous, namespaced consistently (`itglue_list_documents`, not
  `getDocs`). A name should predict the effect without reading the description.

### 3. Descriptions & annotations
- The description must state **what it does, when to use it, and what it returns** —
  it is read by the model, not a human changelog.
- `readOnlyHint` / `destructiveHint` / `idempotentHint` must match reality. A
  destructive tool marked read-only is a safety bug.
- Undocumented API quirks the model must know (required filters, replace-vs-merge
  semantics) belong in the description.

### 4. Input schema strictness
- Every param typed and constrained (enums, min/max, formats) — loose `string`
  where an enum belongs makes the model guess.
- Required vs optional correct; sensible defaults; pagination params present on
  list tools.
- Reject invalid input with a clear message instead of forwarding garbage upstream.

### 5. Output shape & token budget
- List tools must return **summary fields**, not full records, and must paginate —
  a single call must not blow the client's context window. Provide a `get_*` for the
  full record.
- Return structured content where the SDK supports it, mirrored by readable text.
- Large/binary payloads referenced, not inlined.

### 6. Error handling
- Errors returned as tool results (`isError` text the model can read and recover
  from), never thrown to crash the session.
- Messages are actionable ("filter[x] is required") and never leak secrets — no
  tokens, API keys, or full auth headers in output or logs.

### 7. Auth, permissions, safety
- If tiered (read/write/destructive), disallowed tools should be **invisible** in
  `tools/list` **and** re-checked at call time (defense in depth).
- Rate-limit / quota behavior is surfaced, not a silent hang.
- Secrets come from env/config, never hardcoded; logs use labels/hashes.

## Output

A prioritized list, most severe first, grouped by dimension. Each finding:

```
[dimension] path:line
Problem: <one sentence>
Fix: <concrete change>
```

End with a 3-line summary: biggest risk, quickest win, and overall design verdict
(sharp / serviceable / needs-restructure). Offer to apply the top fixes only if
the user asks — review first, edit second.
