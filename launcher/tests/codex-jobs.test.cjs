const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeJobsState, readCodexJobs } = require("../electron/codex-jobs.cjs");

test("Codex job list puts active jobs first and preserves bounded work summaries", () => {
  const now = Date.parse("2026-09-08T10:00:00.000Z");
  const snapshot = normalizeJobsState({
    jobs: {
      done: {
        id: "done", status: "completed", cwd: "D:\\work\\done", model: "gpt-5.6-luna",
        workSummary: "Completed task", createdAt: "2026-09-08T09:00:00.000Z",
        startedAt: "2026-09-08T09:01:00.000Z", finishedAt: "2026-09-08T09:02:00.000Z",
      },
      running: {
        id: "running", status: "running", cwd: "D:\\work\\live", model: "gpt-5.6-luna",
        workSummary: "修复 P02 状态徽章", createdAt: "2026-09-08T09:55:00.000Z",
        startedAt: "2026-09-08T09:56:00.000Z", pid: 1234, attempts: 1,
      },
    },
  }, { now });

  assert.equal(snapshot.activeCount, 1);
  assert.equal(snapshot.active[0].id, "running");
  assert.equal(snapshot.active[0].workSummary, "修复 P02 状态徽章");
  assert.equal(snapshot.active[0].durationMs, 4 * 60_000);
  assert.equal(snapshot.active[0].pid, 1234);
  assert.equal(snapshot.recent[0].id, "done");
  assert.equal(snapshot.recent[0].durationMs, 60_000);
});

test("Codex job reader tolerates missing state and old jobs without work summaries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-web-codex-jobs-"));
  try {
    assert.deepEqual(readCodexJobs(root, { now: 0 }), {
      activeCount: 0,
      active: [],
      recent: [],
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
    fs.mkdirSync(path.join(root, "standalone"), { recursive: true });
    fs.writeFileSync(path.join(root, "standalone", "state.json"), JSON.stringify({
      jobs: {
        legacy: {
          id: "legacy", status: "completed", cwd: "C:\\legacy", model: "gpt-5.6-luna",
          createdAt: "2026-09-08T09:00:00.000Z", startedAt: "2026-09-08T09:00:01.000Z",
          finishedAt: "2026-09-08T09:00:02.000Z",
        },
      },
    }));
    const snapshot = readCodexJobs(root, { now: Date.parse("2026-09-08T10:00:00.000Z") });
    assert.equal(snapshot.recent[0].workSummary, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
