const fs = require("node:fs");
const path = require("node:path");

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const KNOWN_STATUSES = new Set(["queued", "running", "completed", "failed", "timed_out", "cancelled"]);

function safeString(value, max = 10_000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function durationMs(job, now = Date.now()) {
  const start = Date.parse(job.startedAt || job.createdAt || "");
  if (!Number.isFinite(start)) return null;
  const end = ACTIVE_STATUSES.has(job.status)
    ? now
    : Date.parse(job.finishedAt || "");
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function normalizeJob(job, now = Date.now()) {
  if (!job || typeof job !== "object") return null;
  const id = safeString(job.id, 200);
  const status = safeString(job.status, 32);
  const workspacePath = safeString(job.cwd, 16_384);
  if (!id || !status || !KNOWN_STATUSES.has(status) || !workspacePath) return null;
  return {
    id,
    status,
    workSummary: safeString(job.workSummary, 240),
    workspacePath,
    model: safeString(job.model, 200),
    reasoning: safeString(job.reasoning, 32),
    permissionMode: safeString(job.sandbox, 64),
    pid: Number.isInteger(job.pid) && job.pid > 0 ? job.pid : null,
    attempts: Number.isInteger(job.attempts) && job.attempts >= 0 ? job.attempts : 0,
    eventCount: Number.isInteger(job.eventCount) && job.eventCount >= 0 ? job.eventCount : 0,
    lastEventAt: safeString(job.lastEventAt, 64),
    terminalEvent: safeString(job.terminalEvent, 100),
    stderrTail: safeString(job.stderrTail, 2_000),
    createdAt: safeString(job.createdAt, 64),
    startedAt: safeString(job.startedAt, 64),
    finishedAt: safeString(job.finishedAt, 64),
    durationMs: durationMs(job, now),
    error: safeString(job.error, 2_000),
  };
}

function compareJobs(a, b) {
  const activeDelta = Number(ACTIVE_STATUSES.has(b.status)) - Number(ACTIVE_STATUSES.has(a.status));
  if (activeDelta) return activeDelta;
  const aTime = Date.parse(a.startedAt || a.createdAt || "") || 0;
  const bTime = Date.parse(b.startedAt || b.createdAt || "") || 0;
  return bTime - aTime;
}

function normalizeJobsState(parsed, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxRecent = Number.isInteger(options.maxRecent) ? Math.max(0, Math.min(200, options.maxRecent)) : 30;
  const jobs = parsed && typeof parsed === "object" && parsed.jobs && typeof parsed.jobs === "object"
    ? Object.values(parsed.jobs).map(job => normalizeJob(job, now)).filter(Boolean)
    : [];
  jobs.sort(compareJobs);
  const active = jobs.filter(job => ACTIVE_STATUSES.has(job.status));
  const recent = jobs.filter(job => !ACTIVE_STATUSES.has(job.status)).slice(0, maxRecent);
  return {
    activeCount: active.length,
    active,
    recent,
    updatedAt: new Date(now).toISOString(),
  };
}

function readCodexJobs(coreHome, options = {}) {
  const statePath = path.join(coreHome, "standalone", "state.json");
  if (!fs.existsSync(statePath)) return normalizeJobsState(null, options);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read Luna job state: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeJobsState(parsed, options);
}

module.exports = {
  normalizeJobsState,
  readCodexJobs,
};
