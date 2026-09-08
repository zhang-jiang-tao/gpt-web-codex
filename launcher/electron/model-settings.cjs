const DEFAULT_CODEX_MODEL = "gpt-5.6-luna";
const DEFAULT_CODEX_REASONING = "low";
const CODEX_REASONING_LEVELS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

function normalizeModel(value) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model) return DEFAULT_CODEX_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) {
    throw new Error("Codex model must be a valid model slug");
  }
  return model;
}

function normalizeReasoning(value) {
  const reasoning = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!reasoning) return DEFAULT_CODEX_REASONING;
  if (!CODEX_REASONING_LEVELS.has(reasoning)) {
    throw new Error("Codex reasoning level is not supported");
  }
  return reasoning;
}

module.exports = {
  CODEX_REASONING_LEVELS,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING,
  normalizeModel,
  normalizeReasoning,
};
