import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LunaJobManager } from "../src/standalone/luna-jobs";
import { LunaStateStore } from "../src/standalone/state-store";
import type { LunaJob } from "../src/standalone/types";

async function eventually(check: () => boolean, timeoutMs = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition timed out");
    await Bun.sleep(20);
  }
}

test("active Luna jobs can run longer than timeoutMs while stdout activity continues", async () => {
  const root = mkdtempSync(join(tmpdir(), "webgpt-idle-timeout-active-"));
  let manager: LunaJobManager | undefined;
  try {
    manager = new LunaJobManager(
      new LunaStateStore(join(root, "state.json")),
      (_command, _args, cwd) => {
        const script = [
          "process.stdin.resume();",
          "console.log(JSON.stringify({type:'thread.started',thread_id:'luna-idle-active-thread'}));",
          "let count=0;",
          "const timer=setInterval(()=>{",
          "count+=1;",
          "console.log(JSON.stringify({type:'item.started',item:{type:'agent_message',sequence:count}}));",
          "if(count===5){",
          "clearInterval(timer);",
          "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'done'}}));",
          "console.log(JSON.stringify({type:'turn.completed'}));",
          "}",
          "},400);",
        ].join("");
        return spawn(process.execPath, ["-e", script], { cwd, stdio: ["pipe", "pipe", "pipe"] });
      },
      join(root, "logs"),
      process.execPath,
    );

    const job = manager.start({
      webSessionId: "conversation-idle-active",
      prompt: "keep working while active",
      cwd: root,
      timeoutMs: 1_000,
    });

    await eventually(() => manager?.get(job.id).status === "completed");
    const completed = manager.get(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.eventCount).toBeGreaterThanOrEqual(8);
    expect(completed.lastActivityAt).toBeDefined();
    expect(Date.parse(completed.lastActivityAt!)).toBeGreaterThan(Date.parse(completed.startedAt!));
  } finally {
    manager?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test("silent Luna jobs time out only after the inactivity window expires", async () => {
  const root = mkdtempSync(join(tmpdir(), "webgpt-idle-timeout-silent-"));
  let manager: LunaJobManager | undefined;
  try {
    manager = new LunaJobManager(
      new LunaStateStore(join(root, "state.json")),
      (_command, _args, cwd) => {
        const script = [
          "process.stdin.resume();",
          "console.log(JSON.stringify({type:'thread.started',thread_id:'luna-idle-silent-thread'}));",
          "setInterval(()=>{},1000);",
        ].join("");
        return spawn(process.execPath, ["-e", script], { cwd, stdio: ["pipe", "pipe", "pipe"] });
      },
      join(root, "logs"),
      process.execPath,
    );

    const job = manager.start({
      webSessionId: "conversation-idle-silent",
      prompt: "become silent",
      cwd: root,
      timeoutMs: 1_000,
    });

    await eventually(() => manager?.get(job.id).status === "timed_out");
    const timedOut = manager.get(job.id);
    expect(timedOut.status).toBe("timed_out");
    expect(timedOut.terminalEvent).toBe("timeout");
    expect(timedOut.lastActivityAt).toBeDefined();
    expect(timedOut.eventCount).toBeGreaterThanOrEqual(1);
  } finally {
    manager?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test("stderr activity also refreshes the Luna inactivity timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "webgpt-idle-timeout-stderr-"));
  let manager: LunaJobManager | undefined;
  try {
    manager = new LunaJobManager(
      new LunaStateStore(join(root, "state.json")),
      (_command, _args, cwd) => {
        const script = [
          "process.stdin.resume();",
          "let count=0;",
          "const timer=setInterval(()=>{",
          "count+=1;",
          "process.stderr.write('heartbeat-'+count+'\\n');",
          "if(count===5){",
          "clearInterval(timer);",
          "console.log(JSON.stringify({type:'turn.completed'}));",
          "}",
          "},400);",
        ].join("");
        return spawn(process.execPath, ["-e", script], { cwd, stdio: ["pipe", "pipe", "pipe"] });
      },
      join(root, "logs"),
      process.execPath,
    );

    const job = manager.start({
      webSessionId: "conversation-idle-stderr",
      prompt: "report progress on stderr",
      cwd: root,
      timeoutMs: 1_000,
    });

    await eventually(() => manager?.get(job.id).status === "completed");
    const completed = manager.get(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.lastActivityAt).toBeDefined();
    expect(Date.parse(completed.lastActivityAt!)).toBeGreaterThan(Date.parse(completed.startedAt!));
  } finally {
    manager?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

test("codexluna_status exposes the persisted last activity timestamp", async () => {
  const root = mkdtempSync(join(tmpdir(), "webgpt-idle-status-"));
  const statePath = join(root, "state.json");
  const lastActivityAt = "2026-09-11T01:23:45.678Z";
  const job: LunaJob = {
    id: "11111111-1111-4111-8111-111111111111",
    webSessionId: "conversation-idle-status",
    promptChars: 4,
    cwd: root,
    model: "gpt-5.6-luna",
    reasoning: "low",
    fast: true,
    sandbox: "workspace-write",
    timeoutMs: 900_000,
    status: "completed",
    createdAt: "2026-09-11T01:20:00.000Z",
    startedAt: "2026-09-11T01:20:01.000Z",
    lastActivityAt,
    finishedAt: "2026-09-11T01:24:00.000Z",
    terminalEvent: "turn.completed",
    finalMessage: "done",
    mutationSeen: false,
    eventCount: 3,
    attempts: 1,
    logPath: join(root, "status-job.jsonl"),
  };
  new LunaStateStore(statePath).putJob(job);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/cli.ts", "mcp", "--state-path", statePath],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "idle-timeout-status-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: "codexluna_status",
      arguments: { job_id: job.id },
    });
    expect(response.isError).not.toBe(true);
    const structured = response.structuredContent as { last_activity_at: string | null };
    expect(structured.last_activity_at).toBe(lastActivityAt);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});
