# Changelog

The runner prints its version with `node scripts/autopilot/glm-run.mjs --version`.
Projects carry their own copy of the runner — if a project's `--version` is
older than this file's top entry, re-copy `scripts/autopilot/glm-run.mjs`
(and the skills) from this repo.

## 1.2.0 — 2026-07-18

- Runner: per-run token accounting — `TOKENS in= out= cache_read= cache_write=`
  line, token fields in `RUN_JSON`, batch totals in `LOOP_DONE` / `LOOP_JSON`,
  and an append-only ledger `handoff/logs/usage.jsonl` (one JSON line per run:
  tokens, models, brief, duration, runner version).
- Runner: `--usage` sums the ledger per brief + in total; `--version` prints
  the runner version. Note: `cost_usd` is the CLI's as-reported number priced
  against Anthropic tables — not a real GLM bill; read tokens, not dollars.
- phase-autopilot: the phase-close report now includes GLM token totals
  (`--usage`); desktop-side usage is pointed at `/usage` or `npx ccusage`.
- README (EN + zh-CN): new "Token visibility" section.

## 1.1.0 — 2026-07-18

- Renamed everywhere: multiagent-automation → MultiAgent-Autopilot (install
  links were previously broken).
- Runner: `LOOP_STALLED` chain guard (a run that exits 0 without advancing
  `NEXT:` stops the chain instead of re-running forever), `--dry-run` (free
  wiring check), `--json` (machine-readable `RUN_JSON`/`LOOP_JSON`),
  `--expect-model`, CRLF-safe `NEXT:` parsing; refactored into importable
  pure helpers guarded by an is-main check, with unit tests
  (`node --test scripts/autopilot/glm-run.test.mjs`).
- phase-autopilot: `LOOP_STALLED` vetting rule; fresh-context adversarial
  advisor subagent before rulings; `FINDINGS:` aggregation at phase close.
- Executor protocol: optional `FINDINGS:` channel for out-of-scope leads.
- phase-kickstart: release-readiness DoD gate (clean build/lint/typecheck,
  user-legible error paths, no secrets in the client bundle).

## 1.0.0

- Initial shape: `phase-kickstart` · `phase-autopilot` · `uat-runbook` skills
  plus the `glm-run.mjs` headless GLM runner (cc-switch per-process env,
  stdin prompt transport, `MODEL_VERIFIED` gate, `--loop N` batching).
