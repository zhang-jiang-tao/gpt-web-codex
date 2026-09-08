const DEFAULT_CODEX_MODEL = "gpt-5.6-luna";

function normalizeModel(value) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model) return DEFAULT_CODEX_MODEL;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) {
    throw new Error("Codex model must be a valid model slug");
  }
  return model;
}

module.exports = {
  DEFAULT_CODEX_MODEL,
  normalizeModel,
};
