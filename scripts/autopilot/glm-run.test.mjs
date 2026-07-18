// Self-tests for glm-run.mjs's pure helpers. No spawning, no tokens, no I/O.
// Run from the repo root:  node --test scripts/autopilot/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNextLine,
  briefFromPrompt,
  providerCandidates,
  verifyModels,
  standardPrompt,
  extractUsage,
  sumUsage,
} from "./glm-run.mjs";

// ---------------------------------------------------------------- parseNextLine

test("parseNextLine: plain NEXT line", () => {
  const r = parseNextLine("goal\nNEXT: execute brief 03\n");
  assert.equal(r.nn, "03");
  assert.equal(r.nextLine, "execute brief 03");
});

test("parseNextLine: CRLF manifest (Windows) — no \\r leaks into the capture", () => {
  const r = parseNextLine("handoff-plan v1\r\nNEXT: execute brief 03\r\n");
  assert.equal(r.nn, "03");
  assert.equal(r.nextLine, "execute brief 03");
});

test("parseNextLine: unpadded brief number is normalized to two digits", () => {
  assert.equal(parseNextLine("NEXT: execute brief 7").nn, "07");
});

test("parseNextLine: non-executable NEXT (ruling / awaiting-user) → nn null, line kept", () => {
  const r = parseNextLine("NEXT: ruling required — resume on a top-tier model");
  assert.equal(r.nn, null);
  assert.equal(r.nextLine, "ruling required — resume on a top-tier model");
});

test("parseNextLine: missing NEXT line", () => {
  const r = parseNextLine("# a manifest with no next pointer\n");
  assert.equal(r.nn, null);
  assert.equal(r.nextLine, "(no NEXT line)");
});

test("parseNextLine: NEXT in the middle of a realistic manifest", () => {
  const manifest = [
    "handoff-plan v1",
    "PLAN REVISION: 2",
    "| 01 | stubs | - | done | abc123 |",
    "NEXT: execute brief 02",
    "",
  ].join("\n");
  assert.equal(parseNextLine(manifest).nn, "02");
});

test("parseNextLine: null/empty input never throws", () => {
  assert.equal(parseNextLine(null).nn, null);
  assert.equal(parseNextLine("").nn, null);
});

// -------------------------------------------------------------- briefFromPrompt

test("briefFromPrompt: round-trips with standardPrompt", () => {
  assert.equal(briefFromPrompt(standardPrompt("04")), "04");
});

test("briefFromPrompt: probe / custom prompts → null", () => {
  assert.equal(briefFromPrompt("Reply with exactly one line: PROBE_OK"), null);
  assert.equal(briefFromPrompt(""), null);
  assert.equal(briefFromPrompt(null), null);
});

// ----------------------------------------------------------------- verifyModels

const EXPECT = /glm|zhipu/i;

test("verifyModels: empty model list is NOT verified", () => {
  assert.equal(verifyModels([], EXPECT), false);
});

test("verifyModels: all-GLM ids verify", () => {
  assert.equal(verifyModels(["glm-5.2"], EXPECT), true);
  assert.equal(verifyModels(["GLM-4.6", "zhipu-embedding"], EXPECT), true);
});

test("verifyModels: any foreign id fails the whole run", () => {
  assert.equal(verifyModels(["glm-5.2", "claude-sonnet-5"], EXPECT), false);
  assert.equal(verifyModels(["claude-opus-4-8"], EXPECT), false);
});

// ----------------------------------------------------------- providerCandidates

const PROVIDER_RE = /bigmodel|z\.ai|zhipu|glm/i;
const row = (name, current, env) => ({
  name,
  is_current: current ? 1 : 0,
  settings_config: JSON.stringify({ env }),
});

test("providerCandidates: matches by base URL, requires an auth token", () => {
  const rows = [
    row("anthropic", true, { ANTHROPIC_AUTH_TOKEN: "a" }), // name+URL don't match
    row("side-model", false, {
      ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: "t",
    }),
    row("glm-no-token", false, { ANTHROPIC_BASE_URL: "https://open.bigmodel.cn" }), // no token
  ];
  const c = providerCandidates(rows, PROVIDER_RE);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, "side-model");
});

test("providerCandidates: matches by name alone", () => {
  const c = providerCandidates([row("My GLM", false, { ANTHROPIC_AUTH_TOKEN: "t" })], PROVIDER_RE);
  assert.equal(c.length, 1);
});

test("providerCandidates: the current provider ranks first", () => {
  const rows = [
    row("glm-old", false, { ANTHROPIC_AUTH_TOKEN: "t1" }),
    row("glm-current", true, { ANTHROPIC_AUTH_TOKEN: "t2" }),
  ];
  assert.equal(providerCandidates(rows, PROVIDER_RE)[0].name, "glm-current");
});

test("providerCandidates: malformed settings_config never throws, row is skipped", () => {
  const rows = [
    { name: "glm-broken", is_current: 1, settings_config: "{not json" },
    row("glm-ok", false, { ANTHROPIC_AUTH_TOKEN: "t" }),
  ];
  const c = providerCandidates(rows, PROVIDER_RE);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, "glm-ok");
});

test("providerCandidates: null/empty rows never throw", () => {
  assert.deepEqual(providerCandidates(null, PROVIDER_RE), []);
  assert.deepEqual(providerCandidates([], PROVIDER_RE), []);
});

// ---------------------------------------------------------------- extractUsage

test("extractUsage: sums modelUsage values (camelCase CLI shape)", () => {
  const u = extractUsage({
    modelUsage: {
      "glm-5.2": { inputTokens: 100, outputTokens: 40, cacheReadInputTokens: 900, cacheCreationInputTokens: 30 },
      "glm-4.6": { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    },
    total_cost_usd: 0.1234,
  });
  assert.deepEqual(u, { input: 110, output: 45, cacheRead: 900, cacheCreate: 30, costUsd: 0.1234 });
});

test("extractUsage: falls back to the top-level usage object (snake_case)", () => {
  const u = extractUsage({
    usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
  });
  assert.deepEqual(u, { input: 7, output: 3, cacheRead: 2, cacheCreate: 1, costUsd: null });
});

test("extractUsage: null / missing fields never throw, report zeros", () => {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, costUsd: null };
  assert.deepEqual(extractUsage(null), zero);
  assert.deepEqual(extractUsage({}), zero);
  assert.deepEqual(extractUsage({ modelUsage: { "glm-5.2": {} } }), zero);
});

// -------------------------------------------------------------------- sumUsage

test("sumUsage: grand totals + per-brief buckets", () => {
  const t = sumUsage([
    { brief: "01", input: 10, output: 5, cacheRead: 100, cacheCreate: 0, costUsd: 0.01 },
    { brief: "01", input: 20, output: 10, cacheRead: 0, cacheCreate: 0 },
    { brief: "02", input: 1, output: 1, cacheRead: 1, cacheCreate: 1, costUsd: 0.02 },
  ]);
  assert.equal(t.runs, 3);
  assert.equal(t.input, 31);
  assert.equal(t.output, 16);
  assert.equal(t.total, 149);
  assert.equal(t.perBrief["01"].runs, 2);
  assert.equal(t.perBrief["01"].total, 145);
  assert.equal(t.perBrief["02"].total, 4);
  assert.ok(Math.abs(t.costUsd - 0.03) < 1e-9);
});

test("sumUsage: probe entries, null briefs, and junk lines don't break totals", () => {
  const t = sumUsage([
    { brief: "probe", input: 5, output: 2, cacheRead: 0, cacheCreate: 0 },
    { brief: null, input: 1, output: 1, cacheRead: 0, cacheCreate: 0 },
    null,
    "junk",
  ]);
  assert.equal(t.runs, 2);
  assert.equal(t.total, 9);
  assert.equal(t.perBrief["probe"].runs, 1);
  assert.equal(t.perBrief["-"].runs, 1);
});
