---
name: _template
description: "COPY ME. One paragraph: what the skill does, when to use it, what it produces. End with concrete trigger phrases so the model knows when to load it. Triggers on: <verb phrases a user would actually type>."
argument-hint: "[what the user should pass, if anything]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# <Skill name>

One or two sentences framing the role the model should adopt and the outcome it
owns. Write in the imperative — this file *is* the instructions.

## When to use / not use

- Use when: …
- Skip when: … (steer away from false triggers)

## Steps

1. **Gather intent** — what to read/ask before acting. Ask only what you can't infer.
2. **Do the work** — the actual procedure, in order.
3. **Verify** — how to confirm it worked (run it, test it, observe output).

## Output

State exactly what the skill should produce and in what form.

<!--
Tips for a good skill:
- The `description` is a prompt — it decides whether the skill loads. Be specific.
- Keep SKILL.md focused; put long reference material in sibling files and link them.
- Bundle resources next to SKILL.md (scripts, templates); reference with relative paths.
- To add a skill: copy this file to skills/<your-skill>/SKILL.md and edit. Only
  folders under skills/ are loaded, so this _template/ stays out of the way.
-->
