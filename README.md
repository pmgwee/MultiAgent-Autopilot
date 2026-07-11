# 🤖 Multiagent Automation — a self-driving phase pipeline for Claude Code

> **TL;DR** — You describe the requirements **once**. A top-tier model interviews you, locks a charter, and writes a self-defending plan. A cheaper CLI model (your cc-switch provider, e.g. GLM) implements every brief **headless** while the top-tier session verifies each one — re-running builds, walking the real UI in a browser, reviewing like a senior engineer. You come back to a finished phase and a step-by-step UAT runbook.
> **You appear exactly twice: the requirements interview, and the final manual setup + review.**

Adapted from [pinjun99/Sildenafil_coding](https://github.com/pinjun99/Sildenafil_coding) (orchestrator · advisor · handoff, MIT) — the three patterns fused into one pipeline and wired to a two-subscription setup (Anthropic top-tier + a cc-switch side model).

---

## 🎯 Who this is for

| You are… | This solves… |
|---|---|
| A solo builder running Claude Code desktop (top-tier model) + a cheaper coding model in the CLI | Babysitting two windows, copy-pasting prompts between them all day |
| Someone whose "v1" keeps landing as a prototype, not production | Every phase — including the first scaffold — is gated by the same Definition of Done |
| Someone who finds the bugs only during their own manual UAT | The pipeline walks the UI itself (browser, console, network, mobile, dark mode) before you ever look |
| Someone tired of ad-hoc, non-standard testing docs | Every phase ends with a runbook in one fixed, guide-to-guide format |

**Requires:** Claude Code ≥ 2.x (desktop + CLI) · Node ≥ 22.5 · [cc-switch](https://github.com/farion1231/cc-switch) with your second provider configured · git.

---

## 📦 What's inside

| Piece | Job |
|---|---|
| `skills/phase-kickstart` | Interrogates requirements across 8 domains → `PROJECT-CHARTER.md` → a `handoff/` plan (manifest · contracts · numbered briefs · STATE journal). All architecture is decided here; executors never choose. |
| `skills/phase-autopilot` | The unattended loop: spawns the CLI model per brief, vets its diff ("reports are leads, not facts"), re-runs verification itself, browser-walks each brief's UAT NOTES, rules on deviations (`ADVISOR.md`), runs the final review. Resumable from the manifest's `NEXT:` line — any session, any day. |
| `skills/uat-runbook` | Turns what genuinely needs a human (bots, webhooks, secrets, deploy clicks) into a TL;DR → Prerequisites → Localhost UAT → Production → Troubleshooting runbook with TC checkboxes. |
| `scripts/autopilot/glm-run.mjs` | The bridge: reads your side model's env from cc-switch **per-process** (never flips your global switch), pipes the prompt via **stdin** (Windows-safe), and **fails loud — exit 3 — if the answering model isn't the one you expect** (`MODEL_VERIFIED`). |

## 🔁 The flow

```
requirements ─► /phase-kickstart   (you answer questions ONCE → charter + handoff plan)
                       │
                       ▼
               /phase-autopilot    (walk away)
               ┌─────────────────────────────────┐
               │ per brief:                      │
               │   CLI model implements headless │
               │   top-tier vets diff, re-runs   │
               │   verification, browser gate    │
               │   fix → respawn once → absorb   │
               │ final review (top-tier only)    │
               └─────────────────────────────────┘
                       │
                       ▼
               /uat-runbook  →  you: manual prereqs + final look + deploy
```

The two models never share chat memory — **the repo is the shared memory** (charter, `handoff/`, `STATE.md`, `CLAUDE.md`). That's exactly what makes the pipeline resumable, auditable, and crash-proof.

---

## 🧰 Install (5 minutes, once per project)

- [ ] **1. Clone this repo**

```bash
git clone https://github.com/pmgwee/multiagent-automation
```

- [ ] **2. Copy the skills into your project** (or into `~/.claude/skills/` once, for every project)

```bash
cp -r multiagent-automation/skills/* <your-project>/.claude/skills/
```

- [ ] **3. Copy the runner**

```bash
mkdir -p <your-project>/scripts/autopilot
cp multiagent-automation/scripts/autopilot/glm-run.mjs <your-project>/scripts/autopilot/
```

- [ ] **4. Probe the wiring** (from the project root)

```bash
node scripts/autopilot/glm-run.mjs --probe
```

✅ **Expected:** `MODEL_VERIFIED=true` and your side model's id (e.g. `glm-5.2`). Anything else → Troubleshooting below.

> 💡 Different side model? `--provider "<regex>"` selects any cc-switch entry by name/URL.

---

## ▶️ Use

**Step 1 · Kickstart — stay at the keyboard (the ONE stage that needs you)**
In Claude Code desktop: `/phase-kickstart` + your requirements/rubrics/success criteria.
✅ **Expected:** rounds of pointed questions → `docs/charter/PROJECT-CHARTER.md` + a `handoff/` plan whose manifest ends with `NEXT: execute brief 01`.

**Step 2 · Autopilot — walk away**
`/phase-autopilot`
✅ **Expected:** briefs execute one by one; the tree stays clean; every commit reads `handoff: brief NN <state>`; UI briefs get browser-walked with screenshot evidence.

**Step 3 · Come back**
Open `docs/runbooks/<phase>-runbook.md`, do the checkboxes (the only human-required steps), final look, deploy.

**Resume anytime, any session, any machine:** run `/phase-autopilot` again — it reads the `NEXT:` line. Nothing lives in chat memory.

---

## 🧯 Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `MODEL_VERIFIED=false` (exit 3) | cc-switch provider renamed/changed → adjust `--provider` regex, probe again |
| `FATAL: no cc-switch provider…` | Side model missing from cc-switch, or it has no auth token stored |
| Autopilot refuses to start | Dirty git tree — commit/stash your own work first; the pipeline never builds on debris |
| Loop paused: `awaiting-user — quota` | Side model's subscription exhausted → just rerun `/phase-autopilot` later |
| Same brief failing repeatedly | By design: respawned once, then absorbed by the top-tier session; two absorbs in one phase = your briefs are sliced too big — re-plan |

## 🔐 Notes

- `glm-run.mjs` never prints or logs your auth token.
- Headless briefs run with permissions bypassed **inside your repo** — keep everything under git; each brief lands exactly one attributable commit, so anything is revertible.
- Skills are plain markdown: edit them, they're yours. Project-specific rules belong in each project's `CLAUDE.md` (the executor protocol treats that file as binding).

## License

MIT — see [LICENSE](LICENSE). Portions adapted from [pinjun99/Sildenafil_coding](https://github.com/pinjun99/Sildenafil_coding) (MIT).
