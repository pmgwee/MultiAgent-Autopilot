# multiagent-automation — agent install guide

You are an AI coding agent installing the **multiagent-automation** skill
suite for your user. Follow the steps in order; ask the user before anything
ambiguous; report real command output, never assumed success.

## 0 · Confirm two choices with the user

1. **Install scope for the skills** — global `~/.claude/skills/` (works in
   every project; recommended) or project-only `<project>/.claude/skills/`?
2. **Which project gets the runner** — `scripts/autopilot/glm-run.mjs` must
   live **inside each project** that will run the pipeline (the headless
   executor session starts in that project's root, and its logs/commits
   belong to that repo).

## 1 · Check prerequisites (report anything missing, then stop)

- Claude Code ≥ 2.x — `claude --version`
- Node ≥ 22.5 — `node --version` (the runner uses `node:sqlite`)
- cc-switch with the side provider configured — the file
  `~/.cc-switch/cc-switch.db` exists
- git

## 2 · Get the code

```bash
git clone https://github.com/pmgwee/multiagent-automation
```

No git? Download and unzip:
`https://github.com/pmgwee/multiagent-automation/archive/refs/heads/main.zip`

## 3 · Copy files

- `skills/*` → the skills directory chosen in step 0 (create it if missing).
- `scripts/autopilot/glm-run.mjs` → `<project>/scripts/autopilot/glm-run.mjs`.

Use the copy method native to the OS (macOS/Linux: `cp -r`; Windows
PowerShell: `Copy-Item -Recurse`; or your own file tools).

## 4 · Verify the wiring

From the **project root**:

```bash
node scripts/autopilot/glm-run.mjs --probe
```

✅ Success = output contains `MODEL_VERIFIED=true` and a model id like
`glm-*`.

- Exit 2 `no cc-switch provider…` → the side model isn't configured in
  cc-switch (or has no auth token). Tell the user to set it up in cc-switch
  first, then re-probe.
- Exit 3 `MODEL_VERIFIED=false` → a different provider answered. Re-run with
  `--provider "<regex matching their provider name/URL>"`.

## 5 · Hand back to the user

Report: where the skills were installed, where the runner sits, the probe
output, and how to start:

- New project/phase: `/phase-kickstart` in **Claude Code desktop** (top-tier
  model) — the user must be present for the interview.
- Then `/phase-autopilot` — unattended from there.
- **Resuming after any stop, always: `/phase-autopilot` in Claude Code
  desktop.** The CLI side model is never prompted manually.

Cleanup: you may delete the cloned/unzipped folder after copying.
