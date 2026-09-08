const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_CODEX_MODEL, DEFAULT_CODEX_REASONING, normalizeModel, normalizeReasoning } = require("../electron/model-settings.cjs");
const { appServerArgs, normalizeCodexOverview } = require("../electron/codex-app-server.cjs");

test("Codex overview uses the official stdio app-server transport", () => {
  assert.deepEqual(appServerArgs(), ["app-server", "--listen", "stdio://"]);
});

test("Codex model and reasoning settings are normalized", () => {
  assert.equal(normalizeModel(" gpt-5.6-sol "), "gpt-5.6-sol");
  assert.equal(normalizeModel(""), DEFAULT_CODEX_MODEL);
  assert.throws(() => normalizeModel("gpt-5.6-sol --danger"), /valid model slug/);
  assert.equal(normalizeReasoning(" XHIGH "), "xhigh");
  assert.equal(normalizeReasoning(""), DEFAULT_CODEX_REASONING);
  assert.throws(() => normalizeReasoning("impossible"), /not supported/);
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
      {
        model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", description: "Frontier",
        hidden: false, isDefault: true, defaultReasoningEffort: "high",
        supportedReasoningEfforts: [
          { reasoningEffort: "medium", description: "Balanced" },
          { reasoningEffort: "high", description: "Deep" },
        ],
      },
      {
        model: "hidden-model", displayName: "Hidden", hidden: true,
        defaultReasoningEffort: "xhigh",
        supportedReasoningEfforts: [{ reasoningEffort: "xhigh", description: "Extra deep" }],
      },
    ],
  });

  assert.equal(overview.planType, "plus");
  assert.equal(overview.primary.remainingPercent, 72);
  assert.equal(overview.secondary.remainingPercent, 57);
  assert.equal(overview.credits.balance, "$12.34");
  assert.equal(overview.resetCreditsAvailable, 2);
  assert.deepEqual(overview.models.map(model => model.model), ["gpt-5.6-sol", "hidden-model"]);
  assert.equal(overview.models[0].defaultReasoningEffort, "high");
  assert.deepEqual(overview.models[0].supportedReasoningEfforts.map(option => option.reasoningEffort), ["medium", "high"]);
  assert.equal(overview.models[1].hidden, true);
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
