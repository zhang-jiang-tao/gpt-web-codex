const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

function executableCandidates(env = process.env, platform = process.platform) {
  const explicit = env.WEBGPT_CODEX_EXECUTABLE?.trim();
  const appData = env.APPDATA?.trim();
  const npmNative = platform === "win32" && appData
    ? path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    )
    : null;
  return [explicit, npmNative].filter(Boolean);
}

function resolveCodexExecutable(env = process.env, platform = process.platform) {
  for (const candidate of executableCandidates(env, platform)) {
    if (fs.existsSync(candidate) && !candidate.toLowerCase().endsWith(".ps1")) return candidate;
  }
  const command = platform === "win32" ? "where.exe" : "which";
  const found = spawnSync(command, [platform === "win32" ? "codex.exe" : "codex"], {
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
  if (found.status === 0) {
    const candidate = found.stdout
      .split(/\r?\n/)
      .map(value => value.trim())
      .find(value => value && !value.toLowerCase().endsWith(".ps1"));
    if (candidate) return candidate;
  }
  throw new Error("Codex executable was not found");
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function normalizeWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = Number(value.usedPercent);
  if (!Number.isFinite(usedPercent)) return null;
  return {
    usedPercent: clampPercent(usedPercent),
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: Number.isFinite(Number(value.windowDurationMins))
      ? Number(value.windowDurationMins)
      : null,
    resetsAt: Number.isFinite(Number(value.resetsAt)) ? Number(value.resetsAt) : null,
  };
}

function selectCodexRateLimit(result) {
  if (!result || typeof result !== "object") return null;
  const byId = result.rateLimitsByLimitId;
  if (byId && typeof byId === "object" && byId.codex && typeof byId.codex === "object") {
    return byId.codex;
  }
  const fallback = result.rateLimits;
  return fallback && typeof fallback === "object" ? fallback : null;
}

function normalizeModels(result) {
  const data = Array.isArray(result?.data) ? result.data : [];
  return data
    .filter(model => model && typeof model === "object")
    .map(model => ({
      model: String(model.model || model.id || "").trim(),
      displayName: String(model.displayName || model.model || model.id || "").trim(),
      description: String(model.description || "").trim(),
      hidden: model.hidden === true,
      isDefault: model.isDefault === true,
    }))
    .filter(model => model.model)
    .sort((a, b) =>
      Number(b.isDefault) - Number(a.isDefault)
      || Number(a.hidden) - Number(b.hidden)
      || a.displayName.localeCompare(b.displayName));
}

function normalizeCodexOverview(rateLimitsResult, modelListResult) {
  const snapshot = selectCodexRateLimit(rateLimitsResult);
  const credits = snapshot?.credits && typeof snapshot.credits === "object"
    ? {
      hasCredits: snapshot.credits.hasCredits === true,
      unlimited: snapshot.credits.unlimited === true,
      balance: typeof snapshot.credits.balance === "string" ? snapshot.credits.balance : null,
    }
    : null;
  const resetCredits = rateLimitsResult?.rateLimitResetCredits;
  return {
    planType: typeof snapshot?.planType === "string" ? snapshot.planType : null,
    limitId: typeof snapshot?.limitId === "string" ? snapshot.limitId : null,
    primary: normalizeWindow(snapshot?.primary),
    secondary: normalizeWindow(snapshot?.secondary),
    credits,
    resetCreditsAvailable: Number.isFinite(Number(resetCredits?.availableCount))
      ? Number(resetCredits.availableCount)
      : null,
    ordinaryUsageAllowed: typeof rateLimitsResult?.ordinaryUsageAllowed === "boolean"
      ? rateLimitsResult.ordinaryUsageAllowed
      : null,
    models: normalizeModels(modelListResult),
  };
}

function appServerArgs() {
  return ["app-server", "--listen", "stdio://"];
}

function appServerRequest(executable, env, timeoutMs = 12_000, clientVersion = "unknown") {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, appServerArgs(), {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: os.homedir(),
    });
    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;
    let initializeDone = false;
    const results = {};
    const warnings = [];
    const timer = setTimeout(() => finish(new Error("Codex app-server request timed out")), timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
    }

    function finish(error, value) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    }

    function write(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function startReads() {
      write({ method: "account/rateLimits/read", id: 2 });
      write({ method: "model/list", id: 3, params: { limit: 100, includeHidden: true } });
    }

    function handleMessage(message) {
      if (!message || typeof message !== "object") return;
      if (message.id === 1) {
        if (message.error) return finish(new Error(message.error.message || "Codex app-server initialization failed"));
        initializeDone = true;
        write({ method: "initialized" });
        startReads();
        return;
      }
      if (message.id === 2) {
        if (message.error) warnings.push(`rate limits: ${message.error.message || "request failed"}`);
        else results.rateLimits = message.result;
      }
      if (message.id === 3) {
        if (message.error) warnings.push(`models: ${message.error.message || "request failed"}`);
        else results.models = message.result;
      }
      if ((Object.hasOwn(results, "rateLimits") || warnings.some(value => value.startsWith("rate limits:")))
        && (Object.hasOwn(results, "models") || warnings.some(value => value.startsWith("models:")))) {
        finish(null, { ...normalizeCodexOverview(results.rateLimits, results.models), warnings });
      }
    }

    child.once("error", error => finish(error));
    child.stdin.on("error", error => finish(error));
    child.stderr.on("data", chunk => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
    child.stdout.on("data", chunk => {
      stdoutBuffer += String(chunk);
      while (true) {
        const newline = stdoutBuffer.indexOf("\n");
        if (newline < 0) break;
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        try { handleMessage(JSON.parse(line)); } catch {}
      }
    });
    child.once("close", code => {
      if (settled) return;
      const phase = initializeDone ? "request" : "initialization";
      finish(new Error(`Codex app-server ${phase} exited with ${code ?? "unknown"}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });

    write({
      method: "initialize",
      id: 1,
      params: {
        clientInfo: { name: "gpt-web-codex-launcher", title: "GPT Web Codex", version: clientVersion },
        capabilities: null,
      },
    });
  });
}

async function readCodexOverview(options = {}) {
  const env = options.env ?? process.env;
  const executable = options.executable ?? resolveCodexExecutable(env);
  return appServerRequest(executable, env, options.timeoutMs, options.clientVersion);
}

module.exports = {
  appServerArgs,
  normalizeCodexOverview,
  readCodexOverview,
  resolveCodexExecutable,
};
