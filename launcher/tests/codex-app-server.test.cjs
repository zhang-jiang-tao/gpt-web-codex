const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_CODEX_MODEL, normalizeModel } = require("../electron/model-settings.cjs");
const { normalizeCodexOverview } = require("../electron/codex-app-server.cjs");

test("Codex model setting accepts model slugs and rejects unsafe values", () => {
  assert.equal(normalizeModel(" gpt-5.6-sol "), "gpt-5.6-sol");
  assert.equal(normalizeModel(""), DEFAULT_CODEX_MODEL);
  assert.throws(() => normalizeModel("gpt-5.6-sol --danger"), /valid model slug/);
});

test("Codex overview prefers the codex rate-limit bucket and computes remaining quota", () => {
  const overview = normalizeCodexOverview({
    ordinaryUsageAllowed: true,
    rateLimits: {
      limitId: "legacy",
      primary: { usedPercent: 99, windowDurationMins: 60, resetsAt: 1 },
    },
    rateLimitsByLimitId: {
      codex: {
        limitId: "codex",
        planType: "plus",
        primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1_800_000_000 },
        secondary: { usedPercent: 43, windowDurationMins: 10080, resetsAt: 1_800_100_000 },
        credits: { hasCredits: true, unlimited: false, balance: "$12.34" },
      },
    },
    rateLimitResetCredits: { availableCount: 2 },
  }, {
    data: [
      { model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", description: "Frontier", hidden: false, isDefault: true },
      { model: "hidden-model", displayName: "Hidden", hidden: true },
    ],
  });

  assert.equal(overview.planType, "plus");
  assert.equal(overview.primary.remainingPercent, 72);
  assert.equal(overview.secondary.remainingPercent, 57);
  assert.equal(overview.credits.balance, "$12.34");
  assert.equal(overview.resetCreditsAvailable, 2);
  assert.deepEqual(overview.models.map(model => model.model), ["gpt-5.6-sol"]);
});

test("Codex overview tolerates accounts with only one reported quota window", () => {
  const overview = normalizeCodexOverview({
    rateLimits: {
      limitId: "codex",
      primary: { usedPercent: 31, windowDurationMins: 10080, resetsAt: 1_800_000_000 },
      secondary: null,
      planType: "plus",
    },
  }, { data: [] });
  assert.equal(overview.primary.windowDurationMins, 10080);
  assert.equal(overview.primary.remainingPercent, 69);
  assert.equal(overview.secondary, null);
});
