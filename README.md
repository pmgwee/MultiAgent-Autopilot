 **English** | [简体中文](README.zh-CN.md)

# 🤖 MultiAgent Autopilot — a self-driving phase pipeline for Claude Code

> **TL;DR** — You describe the requirements **once**. A top-tier model interviews you, locks a charter, and writes a self-defending plan. A cheaper CLI model (your cc-switch provider, e.g. GLM) implements every brief **headless** — including proving its own UI work with screenshots — while the top-tier session vets diffs, re-runs verification, and reviews the evidence. You come back to a finished phase and a step-by-step UAT runbook.
> **You appear exactly twice: the requirements interview, and the final manual setup + review.**

Adapted from (orchestrator · advisor · handoff) — the three patterns fused into one pipeline and wired to a two-subscription setup (Anthropic top-tier + a cc-switch side model).

---

## 🎯 Who this is for

| You are… | This solves… |
|---|---|
| A solo builder running Claude Code desktop (top-tier model) + a cheaper coding model in the CLI | Babysitting two windows, copy-pasting prompts between them all day |
| Someone whose "v1" keeps landing as a prototype, not production | Every phase — including the first scaffold — is gated by the same Definition of Done |
| Someone who finds the bugs only during their own manual UAT | The executor proves every UI change with screenshots + console captures; the top-tier model signs off with one full browser pass per phase |
| Someone tired of ad-hoc, non-standard testing docs | Every phase ends with a runbook in one fixed, guide-to-guide format |

**Requires:** Claude Code ≥ 2.x (desktop + CLI) · Node ≥ 22.5 · [cc-switch](https://github.com/farion1231/cc-switch) with your GLM provider configured · git.

---

## 📦 What's inside

| Piece | Job |
|---|---|
| `skills/phase-kickstart` | Interrogates requirements across 8 domains → `PROJECT-CHARTER.md` → a `handoff/` plan (manifest · contracts · numbered briefs · STATE journal). All architecture is decided here; executors never choose. |
| `skills/phase-autopilot` | The unattended loop: spawns the CLI model in batches, vets its diffs ("reports are leads, not facts"), re-runs verification itself, reviews the executor's UI evidence, rules on deviations (`ADVISOR.md`), and does the one full hands-on browser pass at final review. Resumable from the manifest's `NEXT:` line — any session, any day. |
| `skills/uat-runbook` | Turns what genuinely needs a human (bots, webhooks, secrets, deploy clicks) into a TL;DR → Prerequisites → Localhost UAT → Production → Troubleshooting runbook with TC checkboxes. |
| `scripts/autopilot/glm-run.mjs` | The bridge between your two models: reads your GLM env from cc-switch **per-process** (never flips your global switch), pipes the prompt via **stdin** (Windows-safe), **fails loud — exit 3 — if the answering model isn't GLM** (`MODEL_VERIFIED`), chains up to N consecutive briefs with `--loop N` — **stopping the chain the moment a run fails to advance `NEXT:`** (`LOOP_STALLED`) — and ships `--dry-run` (free wiring check), `--json` (machine-readable results), a per-run **token ledger** (`--usage` sums it per brief), and its own unit tests. |

## 🔁 The flow

```
requirements ─► /phase-kickstart   (you answer questions ONCE → charter + handoff plan)
                       │
                       ▼
               /phase-autopilot    (walk away)
               ┌──────────────────────────────────────┐
               │ per batch (--loop 3):                │
               │   CLI model implements headless AND  │
               │   captures its own UI evidence       │
               │   (screenshots + console, Playwright)│
               │   top-tier vets diffs + evidence,    │
               │   re-runs verification               │
               │   fix → respawn once → absorb        │
               │ final review = the ONE full hands-on │
               │ browser pass (top-tier only)         │
               └──────────────────────────────────────┘
                       │
                       ▼
               /uat-runbook  →  you: manual prereqs + final look + deploy
```

The two models never share chat memory — **the repo is the shared memory** (charter, `handoff/`, `STATE.md`, `CLAUDE.md`). That's exactly what makes the pipeline resumable, auditable, and crash-proof.

---

## 🧰 Install

### Option A — let your agent install it (recommended, ~2 minutes)

Paste this one prompt into Claude Code (desktop or CLI — any agent with file + shell access):

```
Help me install the MultiAgent-Autopilot skills:
https://raw.githubusercontent.com/pmgwee/MultiAgent-Autopilot/main/docs/install.md
```

The agent reads the guide, asks you two questions (global or per-project skills? which project gets the runner?), copies everything, and probes the wiring.
✅ **Expected:** it ends by showing `MODEL_VERIFIED=true`.

### Option B — manual (5 minutes)

- [ ] **1. Get the code** — `git clone https://github.com/pmgwee/MultiAgent-Autopilot`, or **Code → Download ZIP** and unzip it.

- [ ] **2. Copy the skills** — global (all projects) or into one project's `.claude/skills/`:

```bash
# macOS / Linux / Git Bash — global:
cp -r MultiAgent-Autopilot/skills/* ~/.claude/skills/
```

```powershell
# Windows PowerShell — global:
Copy-Item -Recurse MultiAgent-Autopilot\skills\* "$env:USERPROFILE\.claude\skills\"
```

- [ ] **3. Copy the runner into EACH project that will use the pipeline** — the headless executor session starts in that project's root, and its logs/commits belong to that repo, so the runner lives inside the project:

```bash
# macOS / Linux / Git Bash:
mkdir -p <your-project>/scripts/autopilot
cp MultiAgent-Autopilot/scripts/autopilot/glm-run.mjs <your-project>/scripts/autopilot/
```

```powershell
# Windows PowerShell:
New-Item -ItemType Directory -Force <your-project>\scripts\autopilot
Copy-Item MultiAgent-Autopilot\scripts\autopilot\glm-run.mjs <your-project>\scripts\autopilot\
```

- [ ] **4. Dry-run the wiring** (free — resolves the provider and prints exactly what would run; spawns nothing, spends nothing):

```bash
node scripts/autopilot/glm-run.mjs --dry-run
```

✅ **Expected:** your GLM provider's name + base URL and a `tokenLen` > 0.

- [ ] **5. Probe the wiring** (one tiny GLM call, from the project root — any terminal):

```bash
node scripts/autopilot/glm-run.mjs --probe
```

✅ **Expected:** `MODEL_VERIFIED=true` and your side model's id (e.g. `glm-5.2`). Anything else → Troubleshooting below.

> 💡 Renamed your GLM entry in cc-switch? `--provider "<regex>"` selects it by name/URL; `--expect-model "<regex>"` tracks changed GLM model ids.

---

## ▶️ Use

**Step 1 · Kickstart — stay at the keyboard (the ONE stage that needs you)**
In **Claude Code desktop** on your strongest model: `/phase-kickstart` + your requirements/rubrics/success criteria.
✅ **Expected:** rounds of pointed questions → `docs/charter/PROJECT-CHARTER.md` + a `handoff/` plan whose manifest ends with `NEXT: execute brief 01`. When the plan is ready it **offers to start autopilot immediately** — say yes and walk away.

**Step 2 · Autopilot — hands off**
(If you didn't say yes above:) `/phase-autopilot`
✅ **Expected:** briefs execute in batches of ~3 — the desktop session spawns the CLI model itself; **you never type into the CLI/VS Code window again**. Every commit reads `handoff: brief NN <state>`; every UI brief leaves screenshot + console evidence in `handoff/evidence/`.

**Step 3 · Come back**
Open `docs/runbooks/<phase>-runbook.md`, do the checkboxes (the only human-required steps), final look, deploy.

---

## 💰 Protecting your top-tier quota

The desktop plan is the scarce resource; the pipeline is shaped so the genius only signs, never sweats:

| Burns the side model (GLM) | Burns the top-tier desktop plan |
|---|---|
| All implementation, all briefs | Kickstart interview + plan (one-shot) |
| Its own verification runs | Vetting diffs + re-running regression (minutes of CPU, few tokens) |
| **UI evidence: screenshots + console captures per UAT note (Playwright)** | Spot-checking 1–2 screenshots per brief |
| **Runbook draft** (the plan's second-to-last brief) | Runbook **verification** (every command checked against real code) + Notion publish |
| Chaining briefs (`--loop 3` — one desktop wake-up per batch, not per brief) | Rulings on deviations · **final review with the ONE full browser pass** |

---

## 📊 Token visibility — what did this phase actually burn?

**GLM side (the executor) — measured automatically, exactly.** Every run appends one JSON line to `handoff/logs/usage.jsonl` (tokens in/out, cache read/write, model ids, brief number, duration, runner version) and prints a `TOKENS in=… out=… cache_read=… cache_write=…` line. Nothing to configure. To sum a phase, from the project root:

```bash
node scripts/autopilot/glm-run.mjs --usage      # per-brief table + grand total (add --json for USAGE_JSON=)
```

The autopilot's phase-close report includes the same totals. One caveat: the ledger's `cost_usd` is the CLI's as-reported number priced against **Anthropic's** tables — routed through a GLM subscription it is **not** your real bill. Read tokens, not dollars.

**Desktop side (the orchestrator) — your Claude subscription.** A session cannot measure its own tokens, so the pipeline doesn't guess. Two accurate options:

- Claude Code desktop → `/usage` — your plan's live usage, or
- `npx ccusage` — reads your local `~/.claude/projects` session transcripts and reports exact tokens per day / model / session.

---

## 🎚️ Which desktop model do you pick, and when

> ### The one rule
> **A running session cannot switch its own model — your desktop model selection is what runs, start to finish.** The skill does **not** auto-downshift to a cheaper model and auto-recall your strongest one. It enforces a *floor*: a cheaper session that hits a ruling or the final review **pauses and asks you to switch up** (`NEXT: ruling required — resume on a top-tier model`) — it never switches for you. So **before every `/phase-autopilot`, glance at the model selector** — that's who runs the next stretch.

Your model choice therefore picks your operating mode:

| Mode | You do | Pauses | Quota burn | Use when |
|---|---|---|---|---|
| **A · All Fable 5** | Pick Fable, never switch | Zero (Fable rules + signs off inline) | Highest | **First run** — you want to watch it run start-to-finish without stopping |
| **B · All Opus 4.8** | Pick Opus, never switch | Zero (Opus is top-tier too — rules + signs off inline) | Moderate | **The set-and-forget default** — never touch the selector, full judgment throughout |
| **C · Sonnet loop + switch up to sign off** | Sonnet for the loop; switch to Fable/Opus when it pauses for a ruling / final review | One pause per ruling / final review | Lowest | Quota is tight |

**Final review is not Fable-only — Opus 4.8 qualifies as top-tier and can sign off inline.** "Needs top-tier" means Fable *or* Opus, not specifically Fable. Reserve the actual Fable for kickstart planning and the hardest rulings, where peak judgment caps the whole project's quality. Rulings are **rare** (only on deviations / lock-in questions, not per brief) and the final review is **once per phase** — so in a clean phase, Mode C may run the entire loop on Sonnet and only ask you to switch up **once**, at the very end.

**Which desktop model runs what** (the skill enforces the floor itself):

| Desktop model | Role | Why |
|---|---|---|
| Sonnet-class (Sonnet 5, default effort) | The routine loop: spawn · vet · evidence review | Cheapest subscription burn; near-Opus on coding/agentic per Anthropic's own docs; pauses itself when a ruling or final review is due |
| Opus-class (Opus 4.8) | Backup top tier: rules and signs off **inline**, zero pauses | The fallback when your strongest model's window is exhausted |
| Strongest (Fable-class) | Kickstart interview + plan · hardest rulings · final review | Where judgment quality caps the whole project |

Plus: prefer **fresh sessions at batch boundaries** — state is on disk, so a new session costs one manifest read instead of re-reading a long conversation.

### Recommended first-run walkthrough

1. **Kickstart — pick Fable 5**, run `/phase-kickstart`. One-shot, not a loop, thinking-heavy — it barely touches your limit, so use the strongest model for the interview and plan.
2. When the plan is ready it offers to start autopilot. **First run: stay on Fable (Mode A), say yes.** It runs straight through without pausing; you watch the pipeline's first real outing — format fit, GLM's protocol obedience, the Playwright evidence.
3. **If Fable hits its limit mid-run:** progress is already on disk (`handoff/` + the `NEXT:` line). Two choices —
   - Keep it simple and non-stop: switch to **Opus 4.8**, `/phase-autopilot` — it resumes and can sign off itself (Mode B).
   - Try the cheap mode: switch to **Sonnet 5**, `/phase-autopilot` — the loop runs on Sonnet and pauses at the final review for you to switch up (Mode C).
4. **From the second phase on:** you trust the pipeline — default to **Mode B (all Opus)** or **Mode C (Sonnet + switch up to sign off)**; no need to babysit on Fable anymore.

---

## ⏸️ Stopped mid-run? How to resume — read this once

> ### The one rule
> **Always resume in Claude Code DESKTOP (the top-tier side) with one command: `/phase-autopilot`.**
> Never prompt the CLI/GLM window manually — it's a stateless worker the pipeline spawns for you. All progress lives on disk in `handoff/` (not in any chat), so **any session, any day, any machine with the repo** continues exactly where it stopped.

| You stopped because… | What to do |
|---|---|
| Desktop (top-tier) usage limit hit | Switch to a cheaper desktop model and `/phase-autopilot` — it resumes on whatever you picked (see "Which desktop model do you pick, and when" above); if it's Sonnet-class it pauses and asks you to switch up for the ruling / final review |
| Side model (GLM) hit its usage limit | The loop pauses itself (`NEXT: awaiting-user — quota`) → when the cooldown ends: `/phase-autopilot` |
| You closed the laptop / app | Reopen desktop → `/phase-autopilot` |
| It died in the middle of a brief | Same command — autopilot detects the crashed run (an `in-progress` row + leftover changes), resets to the last good `handoff:` commit, and re-runs that brief |
| The kickstart interview got cut off | `/phase-kickstart` again — the charter is saved after every question round, so no answers are lost |

---

## 🧯 Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `MODEL_VERIFIED=false` (exit 3) | cc-switch provider renamed/changed → adjust `--provider` regex, probe again |
| `FATAL: no cc-switch provider…` | Side model missing from cc-switch, or it has no auth token stored |
| Autopilot refuses to start | Dirty git tree that is **your own** uncommitted work — commit/stash it first (crashed pipeline runs are recovered automatically; your work is never touched) |
| Loop paused: `awaiting-user — quota` | Side model's subscription exhausted → just rerun `/phase-autopilot` later |
| Same brief failing repeatedly | By design: respawned once, then absorbed by the top-tier session; two absorbs in one phase = your briefs are sliced too big — re-plan |
| Executor's first Playwright run is slow | One-time browser download per machine — expected, cached afterwards |
| `LOOP_STALLED` in the runner output | A run exited 0 but never advanced `NEXT:` — the executor drifted from the protocol → autopilot treats that brief as failed vetting and takes the failure ladder; nothing for you to do |

## 🔐 Notes

- `glm-run.mjs` never prints or logs your auth token.
- Headless briefs run with permissions bypassed **inside your repo** — keep everything under git; each brief lands exactly one attributable commit, so anything is revertible.
- UI evidence lives in `handoff/evidence/brief-NN/` (screenshots, console captures, the throwaway test scripts) — local artifacts, gitignored wherever `handoff/` is.
- **Scope is deliberate: two models, one wire.** This pipeline is built for exactly one setup — Claude top-tier in Claude Code desktop + a GLM-routed Claude Code CLI via cc-switch. `--provider` / `--expect-model` exist to track renamed GLM entries and future GLM model ids, not to add other vendors.
- The runner ships its own tests (pure logic — no tokens spent): `node --test scripts/autopilot/glm-run.test.mjs`. Run them after any edit to `glm-run.mjs`.
- Skills are plain markdown: edit them, they're yours. Project-specific rules belong in each project's `CLAUDE.md` (the executor protocol treats that file as binding).

## License

MIT — see [LICENSE](LICENSE). 
