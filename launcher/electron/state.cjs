const fs = require("node:fs");
const { writePrivateFileAtomic } = require("./atomic-file.cjs");
const { DEFAULT_PROXY_URL, normalizeProxyUrl } = require("./proxy-env.cjs");
const { DEFAULT_CODEX_MODEL, normalizeModel } = require("./model-settings.cjs");
const DEFAULT_STATE = Object.freeze({
  version: 1,
  language: null,
  keepRunningOnClose: true,
  proxyEnabled: false,
  proxyUrl: DEFAULT_PROXY_URL,
  defaultModel: DEFAULT_CODEX_MODEL,
  mcpGuideStep: 0,
});

function readState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || parsed.version !== 1) return { ...DEFAULT_STATE };
    const state = {
      ...DEFAULT_STATE,
      language: parsed.language,
      keepRunningOnClose: parsed.keepRunningOnClose,
      proxyEnabled: parsed.proxyEnabled,
      proxyUrl: parsed.proxyUrl,
      defaultModel: parsed.defaultModel,
      mcpGuideStep: parsed.mcpGuideStep,
      ...(parsed.coreSetupComplete === undefined ? {} : { coreSetupComplete: parsed.coreSetupComplete }),
      ...(parsed.mcpSetupComplete === undefined ? {} : { mcpSetupComplete: parsed.mcpSetupComplete }),
      ...(parsed.mcpRuntimeInstalled === undefined ? {} : { mcpRuntimeInstalled: parsed.mcpRuntimeInstalled }),
    };
    if (state.language !== null && state.language !== "en" && state.language !== "zh-CN") {
      state.language = DEFAULT_STATE.language;
    }
    for (const key of ["keepRunningOnClose", "proxyEnabled"]) {
      if (typeof state[key] !== "boolean") state[key] = DEFAULT_STATE[key];
    }
    try {
      state.proxyUrl = normalizeProxyUrl(state.proxyUrl);
    } catch {
      state.proxyUrl = DEFAULT_STATE.proxyUrl;
    }
    try {
      state.defaultModel = normalizeModel(state.defaultModel);
    } catch {
      state.defaultModel = DEFAULT_STATE.defaultModel;
    }
    if (!Number.isInteger(state.mcpGuideStep) || state.mcpGuideStep < 0 || state.mcpGuideStep > 2) {
      state.mcpGuideStep = DEFAULT_STATE.mcpGuideStep;
    }
    for (const key of [
      "coreSetupComplete",
      "mcpSetupComplete",
      "mcpRuntimeInstalled",
    ]) {
      if (state[key] !== undefined && typeof state[key] !== "boolean") delete state[key];
    }
    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(filePath, state) {
  writePrivateFileAtomic(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function createStateStore(filePath) {
  let state = readState(filePath);
  // Rewrite once on load so retired routing/autostart keys do not linger in
  // persisted launcher state after the standalone migration.
  writeState(filePath, state);
  return {
    read() {
      return structuredClone(state);
    },
    update(patch) {
      const next = { ...state, ...patch, version: 1 };
      writeState(filePath, next);
      state = next;
      return structuredClone(next);
    },
  };
}

module.exports = {
  createStateStore,
};
