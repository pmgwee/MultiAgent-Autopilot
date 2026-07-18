#!/usr/bin/env node
/**
 * glm-run.mjs — headless GLM executor runner for the phase-autopilot skill
 * (part of MultiAgent-Autopilot).
 *
 * Spawns the user's GLM-backed Claude Code CLI (`claude -p`) with the GLM
 * provider env read from cc-switch (~/.cc-switch/cc-switch.db), injected
 * per-process only — the global cc-switch "current provider" is never
 * touched, so the desktop app and other terminals keep their own provider.
 *
 * The prompt travels via STDIN, never as a shell argument: Windows cmd-shell
 * argument concatenation mangles quoted prompts (verified 2026-07-11).
 *
 * Usage (always run from the project root):
 *   node scripts/autopilot/glm-run.mjs --probe
 *   node scripts/autopilot/glm-run.mjs --dry-run
 *   node scripts/autopilot/glm-run.mjs --prompt-file <path> [--loop N]
 *       [--log <path>] [--max-turns 200] [--timeout-min 45] [--safe]
 *       [--provider <regex>] [--expect-model <regex>] [--json]
 *
 * --dry-run: resolve the provider, print exactly what WOULD run (provider,
 * command, prompt source, current NEXT line) and exit 0. Spawns nothing,
 * spends nothing — the free wiring check to run before --probe.
 *
 * --loop N (default 1): after a verified successful run, re-read
 * handoff/00-MANIFEST.md; while its NEXT line still says "execute brief NN"
 * and fewer than N runs have happened, chain the next brief automatically
 * using the standard executor prompt. One orchestrator wake-up per batch
 * instead of per brief — this is what keeps top-tier desktop usage flat.
 * Any failed run, unverified model, or non-"execute brief" NEXT stops the
 * chain immediately. So does a STALL: a run that exits 0 but leaves NEXT on
 * the same brief it just ran — the executor "succeeded" without landing a
 * terminal state; chaining blind would re-run it forever. (--log applies to
 * the first run only; chained runs use timestamped log paths.)
 *
 * --expect-model <regex> (default "glm|zhipu"): what MODEL_VERIFIED checks
 * the answering model ids against. This pipeline is deliberately scoped to
 * GLM-routed executors — the flag exists to track renamed GLM/Zhipu ids,
 * not to add vendors.
 *
 * --json: additionally emit one machine-readable line per run
 * (RUN_JSON=<json>) and one per invocation (LOOP_JSON=<json>), so callers
 * can parse a single JSON object instead of scraping text lines.
 *
 * Output contract (the orchestrator parses these lines, per run):
 *   GLM_RUN exit=<n> duration_s=<n> turns=<n>
 *   MODEL_USED=<model ids>
 *   MODEL_VERIFIED=<true|false>      false => exit code 3
 *   LOG=<path>
 * plus, when a stall is detected:
 *   LOOP_STALLED brief=<NN> …          (treat that brief as failed vetting)
 * and once per invocation when --loop > 1 (or on a stall):
 *   LOOP_DONE runs=<k> next=<last NEXT line> [stalled=true]
 *
 * Exit codes: 0 ok · 2 usage/config error · 3 model-verification failed ·
 * otherwise the claude CLI's own exit code (of the failing run).
 *
 * Secrets: the auth token is read from cc-switch and passed only via the
 * child process env; it is never printed and never written to the log.
 *
 * Self-tests: scripts/autopilot/glm-run.test.mjs (pure logic only — spawns
 * nothing, spends nothing). Run from the repo root:
 *   node --test scripts/autopilot/glm-run.test.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Pure helpers — exported for glm-run.test.mjs; no side effects, no I/O.
// ---------------------------------------------------------------------------

/** Parse a manifest's text for its NEXT line. CRLF-safe (captures are trimmed). */
export function parseNextLine(txt) {
  const m = (txt || "").match(/^NEXT:\s*(.+)$/m);
  if (!m) return { nn: null, nextLine: "(no NEXT line)" };
  const line = m[1].trim();
  const b = line.match(/execute brief\s+0*(\d+)/i);
  return { nn: b ? String(b[1]).padStart(2, "0") : null, nextLine: line };
}

/** Extract the brief number a prompt targets ("Execute brief NN"), or null. */
export function briefFromPrompt(txt) {
  const m = (txt || "").match(/execute brief\s+0*(\d+)/i);
  return m ? String(m[1]).padStart(2, "0") : null;
}

/**
 * Filter + rank cc-switch provider rows: keep rows whose name or base URL
 * matches providerRe AND that carry an auth token; current provider first.
 * Malformed settings_config JSON never throws — the row is just skipped.
 */
export function providerCandidates(rows, providerRe) {
  return (rows || [])
    .map((r) => {
      let env = {};
      try {
        const cfg = JSON.parse(r.settings_config || "{}");
        env = cfg.env ?? {};
      } catch {}
      return { name: r.name, current: !!r.is_current, env };
    })
    .filter(
      (p) =>
        providerRe.test((p.env.ANTHROPIC_BASE_URL || "") + " " + p.name) &&
        p.env.ANTHROPIC_AUTH_TOKEN,
    )
    .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
}

/** MODEL_VERIFIED: at least one model answered, and every id matches expectRe. */
export function verifyModels(models, expectRe) {
  return models.length > 0 && models.every((m) => expectRe.test(m));
}

/** The standard chained-executor prompt for brief nn. */
export function standardPrompt(nn) {
  return [
    "Read .claude/skills/phase-autopilot/references/EXECUTOR-PROTOCOL.md and",
    "follow it exactly. Execute brief " + nn + " in handoff/ to exactly one",
    "terminal state, then stop. Do not touch any other brief.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main — everything below has side effects and only runs when executed
// directly (never on import, so the test file can import the helpers).
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const opt = (n, d) => {
    const i = argv.indexOf(n);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };

  const probe = flag("--probe");
  const dryRun = flag("--dry-run");
  const asJson = flag("--json");
  const promptFile = opt("--prompt-file", null);
  const promptInline = opt("--prompt", null);
  const maxTurns = Number(opt("--max-turns", probe ? "3" : "200"));
  const timeoutMs = Number(opt("--timeout-min", probe ? "5" : "45")) * 60_000;
  const safe = flag("--safe");
  const loopN = probe ? 1 : Math.max(1, Number(opt("--loop", "1")) || 1);
  const providerRe = new RegExp(opt("--provider", "bigmodel|z\\.ai|zhipu|glm"), "i");
  const expectRe = new RegExp(opt("--expect-model", "glm|zhipu"), "i");

  let initialPrompt;
  if (probe) initialPrompt = "Reply with exactly one line: PROBE_OK";
  else if (promptFile) initialPrompt = readFileSync(resolve(promptFile), "utf8");
  else if (promptInline) initialPrompt = promptInline;
  else if (dryRun) initialPrompt = "";
  else {
    console.error(
      "usage: glm-run.mjs --probe | --dry-run | --prompt-file <path> | --prompt <text>  [--loop N]",
    );
    process.exit(2);
  }

  // ---- read the GLM provider env from cc-switch (read-only) ----
  const DB = join(homedir(), ".cc-switch", "cc-switch.db");
  if (!existsSync(DB)) {
    console.error("FATAL: " + DB + " not found — is cc-switch installed?");
    process.exit(2);
  }

  let rows;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB, { readOnly: true });
    rows = db
      .prepare("select name, is_current, settings_config from providers where app_type='claude'")
      .all();
  } catch {
    const r = spawnSync(
      "sqlite3",
      ["-json", DB, "select name, is_current, settings_config from providers where app_type='claude';"],
      { encoding: "utf8", shell: true, timeout: 15_000 },
    );
    if (r.status !== 0 || !r.stdout.trim()) {
      console.error("FATAL: cannot read cc-switch.db (node:sqlite and sqlite3 CLI both failed)");
      process.exit(2);
    }
    rows = JSON.parse(r.stdout);
  }

  const provider = providerCandidates(rows, providerRe)[0] ?? null;
  if (!provider) {
    console.error(
      "FATAL: no cc-switch provider matching /" + providerRe.source + "/i that has an auth token",
    );
    process.exit(2);
  }

  const env = { ...process.env };
  for (const [k, v] of Object.entries(provider.env)) if (typeof v === "string") env[k] = v;
  delete env.CLAUDE_CODE_ENTRYPOINT; // don't look like a nested IDE session
  delete env.ANTHROPIC_API_KEY; // avoid auth-source conflicts with the injected token

  // ---- claude invocation (fixed literals only — safe to join) ----
  const args = ["-p", "--output-format", "json", "--max-turns", String(maxTurns)];
  if (!safe && !probe) args.push("--dangerously-skip-permissions");
  const cmd = ["claude", ...args].join(" ");

  function readManifestNext() {
    try {
      return parseNextLine(readFileSync(resolve("handoff/00-MANIFEST.md"), "utf8"));
    } catch {
      return { nn: null, nextLine: "(no handoff/00-MANIFEST.md)" };
    }
  }

  // ---- dry run: show the wiring, spawn nothing, spend nothing ----
  if (dryRun) {
    const info = {
      provider: provider.name,
      baseURL: provider.env.ANTHROPIC_BASE_URL || "-",
      tokenLen: (provider.env.ANTHROPIC_AUTH_TOKEN || "").length,
      cmd,
      loop: loopN,
      timeout_min: timeoutMs / 60_000,
      expect_model: expectRe.source,
      prompt_source: probe
        ? "(probe)"
        : promptFile
          ? resolve(promptFile)
          : promptInline
            ? "(inline)"
            : "(none)",
      prompt_brief: briefFromPrompt(initialPrompt) || "-",
      manifest_next: readManifestNext().nextLine,
    };
    console.log("DRY_RUN — nothing spawned, nothing spent");
    for (const [k, v] of Object.entries(info)) console.log("  " + k + "=" + v);
    if (asJson) console.log("DRYRUN_JSON=" + JSON.stringify(info));
    process.exit(0);
  }

  function runOnce(prompt, runIndex) {
    const t0 = Date.now();
    const run = spawnSync(cmd, {
      shell: true,
      input: prompt,
      encoding: "utf8",
      env,
      cwd: process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    let parsed = null;
    try {
      parsed = JSON.parse((run.stdout || "").trim());
    } catch {}
    const models = parsed ? Object.keys(parsed.modelUsage || {}) : [];
    const verified = verifyModels(models, expectRe);

    // ---- log (never contains the token) ----
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultLog = join("handoff", "logs", "glm-" + ts + ".log");
    const logPath = resolve(runIndex === 1 ? opt("--log", defaultLog) : defaultLog);
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(
      logPath,
      [
        "# glm-run " + ts + " (run " + runIndex + ")",
        "provider: " + provider.name,
        "baseURL: " + (provider.env.ANTHROPIC_BASE_URL || "-") +
          " | tokenLen: " + (provider.env.ANTHROPIC_AUTH_TOKEN || "").length,
        "cmd: " + cmd,
        "expectModel: /" + expectRe.source + "/i",
        "exit: " + run.status + " | duration_s: " + secs +
          " | timedOut: " + (run.error && run.error.code === "ETIMEDOUT" ? "yes" : "no"),
        "models: " + (models.join(", ") || "(none)"),
        "",
        "--- PROMPT ---",
        prompt,
        "",
        "--- RESULT ---",
        parsed ? String(parsed.result ?? "") : "(stdout was not JSON)",
        "",
        "--- RAW STDOUT (tail 20k) ---",
        (run.stdout || "").slice(-20_000),
        "",
        "--- STDERR (tail 10k) ---",
        (run.stderr || "").slice(-10_000),
        "",
      ].join("\n"),
      "utf8",
    );

    // ---- summary lines the orchestrator parses ----
    console.log("GLM_RUN exit=" + run.status + " duration_s=" + secs + " turns=" + (parsed ? parsed.num_turns : "-"));
    console.log("MODEL_USED=" + (models.join(",") || "(none)"));
    console.log("MODEL_VERIFIED=" + verified);
    if (run.error) console.log("SPAWN_ERROR=" + String(run.error).slice(0, 200));
    if (parsed && typeof parsed.result === "string") {
      console.log("RESULT_TAIL:");
      console.log(parsed.result.slice(-1500));
    } else {
      console.log("STDOUT_HEAD: " + (run.stdout || "").slice(0, 500));
      console.log("STDERR_HEAD: " + (run.stderr || "").slice(0, 500));
    }
    console.log("LOG=" + logPath);
    if (asJson) {
      console.log(
        "RUN_JSON=" +
          JSON.stringify({
            run: runIndex,
            exit: run.status,
            duration_s: Number(secs),
            turns: parsed ? (parsed.num_turns ?? null) : null,
            models,
            verified,
            log: logPath,
            spawn_error: run.error ? String(run.error).slice(0, 200) : null,
          }),
      );
    }

    return { status: run.status, verified };
  }

  let prompt = initialPrompt;
  let prevNN = briefFromPrompt(initialPrompt); // null for probe / custom prompts
  let runs = 0;
  let last = { status: 0, verified: true };
  let lastNext = "-";
  let stalled = false;
  while (runs < loopN) {
    last = runOnce(prompt, runs + 1);
    runs++;
    if (last.status !== 0 || !last.verified) break;
    const nb = readManifestNext();
    lastNext = nb.nextLine;
    // Stall guard: exit 0 but NEXT still names the brief that just ran —
    // the executor never landed a terminal state. Chaining would loop on it.
    if (nb.nn && prevNN && nb.nn === prevNN) {
      stalled = true;
      console.log(
        "LOOP_STALLED brief=" + nb.nn +
          " — run exited 0 but NEXT did not advance; stopping the chain (vet this brief as a failure)",
      );
      break;
    }
    if (runs >= loopN) break;
    if (!nb.nn) break; // NEXT no longer names a brief (review / re-plan / awaiting-user)
    console.log("LOOP_NEXT brief " + nb.nn);
    prevNN = nb.nn;
    prompt = standardPrompt(nb.nn);
  }
  if (loopN > 1 || stalled) {
    console.log(
      "LOOP_DONE runs=" + runs + " next=" + JSON.stringify(lastNext) + (stalled ? " stalled=true" : ""),
    );
  }
  if (asJson) {
    console.log(
      "LOOP_JSON=" +
        JSON.stringify({ runs, next: lastNext, stalled, exit: last.status, verified: last.verified }),
    );
  }

  if (last.status !== 0) process.exit(last.status ?? 1);
  if (!last.verified) process.exit(3);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
  } catch {
    return false;
  }
})();
if (isMain) await main();
