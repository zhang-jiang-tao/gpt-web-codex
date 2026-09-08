import { useEffect, useState } from "react";
import type {
  CodexJobItem,
  CodexJobsSnapshot,
  CodexOverview,
  CodexQuotaWindow,
  DoctorReport,
  Language,
  LauncherSnapshot,
  LauncherState,
  LogRecord,
  OperationState,
  Surface,
} from "./types";

const api = window.codexWebLauncher;

const text = {
  en: {
    dashboard: "Overview", jobs: "Codex jobs", mcp: "MCP", activity: "Activity", settings: "Settings",
    title: "Pure MCP launcher", subtitle: "ChatGPT runs in your normal browser. This app only keeps the local Luna MCP tunnel healthy.",
    ready: "Runtime ready", setup: "Setup required", connector: "Connector", runtime: "Local runtime",
    noBrowser: "No embedded browser", noBrowserDetail: "No ChatGPT login, browser profile, debugging port, or conversation UI is created.",
    openChat: "Open ChatGPT", verify: "Run diagnostics", reconnect: "Reconnect saved tunnel",
    configure: "Configure tunnel", tunnelId: "Tunnel ID", runtimeKey: "Runtime key", replace: "Replace saved credentials",
    connect: "Connect MCP", logs: "Recent runtime events", openLogs: "Open log folder", clearError: "Dismiss",
    keepRunning: "Keep MCP running when this window closes", language: "Language", status: "Status",
    proxy: "Network proxy", useProxy: "Use custom proxy", proxyUrl: "Proxy URL", saveProxy: "Save proxy settings",
    proxyHint: "Applied to MCP runtime and tunnel-client processes on the next connect/restart. When disabled, system environment proxy variables are inherited.",
    codexModel: "Codex model", defaultModel: "Default model", saveModel: "Save model",
    modelHint: "Available models come from the local Codex CLI. The saved default applies after the next MCP reconnect/restart; an existing conversation keeps its bound model when restored unless a model is explicitly supplied.",
    quota: "Codex usage", refreshQuota: "Refresh", quotaUnavailable: "Usage data unavailable",
    remaining: "remaining", resets: "Resets", credits: "Credits", unlimited: "Unlimited", plan: "Plan",
    connectorHint: "Create or enable this connector in ChatGPT with Tunnel transport and Authentication None.",
    jobsTitle: "Codex jobs", jobsSubtitle: "Active and recent Luna executions started by GPT Web Codex.",
    activeJobs: "Active", recentJobs: "Recent", noActiveJobs: "No Codex jobs are running.",
    noRecentJobs: "No recent Codex jobs.", work: "Work", workspace: "Workspace", model: "Model",
    duration: "Duration", pid: "PID", legacyWork: "Work summary was not recorded by this older job.",
    queued: "Queued", running: "Running", completed: "Completed", failed: "Failed", timed_out: "Timed out", cancelled: "Cancelled",
    refresh: "Refresh", checking: "Working…",
  },
  "zh-CN": {
    dashboard: "概览", jobs: "Codex 任务", mcp: "MCP", activity: "活动", settings: "设置",
    title: "纯 MCP 启动器", subtitle: "ChatGPT 在你的正常浏览器中运行。本程序只负责保持本机 Luna MCP 隧道可用。",
    ready: "运行时已就绪", setup: "需要配置", connector: "连接器", runtime: "本地运行时",
    noBrowser: "没有内嵌浏览器", noBrowserDetail: "不会创建 ChatGPT 登录状态、浏览器配置、调试端口或会话界面。",
    openChat: "打开 ChatGPT", verify: "运行诊断", reconnect: "使用已保存隧道重新连接",
    configure: "配置隧道", tunnelId: "隧道 ID", runtimeKey: "运行时密钥", replace: "替换已保存的凭据",
    connect: "连接 MCP", logs: "最近运行事件", openLogs: "打开日志目录", clearError: "关闭",
    keepRunning: "关闭窗口后继续运行 MCP", language: "语言", status: "状态",
    proxy: "网络代理", useProxy: "使用自定义代理", proxyUrl: "代理地址", saveProxy: "保存代理设置",
    proxyHint: "下一次连接/重启时应用到 MCP Runtime 和 tunnel-client；关闭时继续继承系统环境代理变量。",
    codexModel: "Codex 模型", defaultModel: "默认模型", saveModel: "保存模型",
    modelHint: "可选模型来自本机 Codex CLI。保存后在下一次 MCP 重连/重启时作为默认模型；已有会话恢复时会保留已绑定模型，除非显式指定新模型。",
    quota: "Codex 额度", refreshQuota: "刷新", quotaUnavailable: "额度数据不可用",
    remaining: "剩余", resets: "重置", credits: "Credits", unlimited: "无限", plan: "套餐",
    connectorHint: "在 ChatGPT 中创建或启用此连接器，连接方式选择隧道，身份验证选择无。",
    jobsTitle: "Codex 任务", jobsSubtitle: "显示 GPT Web Codex 启动的正在运行和最近 Luna 任务。",
    activeJobs: "正在运行", recentJobs: "最近任务", noActiveJobs: "当前没有正在运行的 Codex 任务。",
    noRecentJobs: "暂无最近任务。", work: "工作", workspace: "工作区", model: "模型",
    duration: "运行时间", pid: "PID", legacyWork: "该历史任务创建于功能加入前，未记录工作摘要。",
    queued: "排队中", running: "运行中", completed: "已完成", failed: "失败", timed_out: "超时", cancelled: "已取消",
    refresh: "刷新", checking: "处理中…",
  },
} as const;

export function App() {
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [surface, setSurface] = useState<Surface>("dashboard");
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.snapshot().then((next) => {
      if (cancelled) return;
      setSnapshot(next);
      setLogs(next.logs);
      setOperation(next.operation);
    }).catch((cause) => setError(messageOf(cause)));
    const offState = api.onStateChanged((state) => setSnapshot((current) => current ? { ...current, state } : current));
    const offOperation = api.onOperation((next) => {
      setOperation(next);
      if (next.status === "failed") setError(next.message);
    });
    const offLog = api.onLog((record) => setLogs((current) => [...current.slice(-299), record]));
    const offUpdate = api.onUpdateState((update) => setSnapshot((current) => current ? { ...current, update } : current));
    return () => { cancelled = true; offState(); offOperation(); offLog(); offUpdate(); };
  }, []);

  if (!api) return <div className="pure-loading">Launcher IPC is unavailable.</div>;
  if (!snapshot) return <div className="pure-loading">Starting GPT Web Codex…</div>;
  const language = snapshot.state.language ?? "zh-CN";
  const copy = text[language];
  const busy = operation?.status === "running";
  const updateState = (state: LauncherState) => setSnapshot((current) => current ? { ...current, state } : current);

  return (
    <div className="pure-app">
      <header className="pure-titlebar">
        <div className="pure-brand-mark">G</div>
        <strong>GPT Web Codex</strong>
        <span className="pure-version">v{snapshot.version}</span>
        <div className="pure-window-actions">
          <button onClick={() => api.windowControl("minimize")}>—</button>
          <button onClick={() => api.windowControl("zoom")}>□</button>
          <button onClick={() => api.windowControl("close")}>×</button>
        </div>
      </header>
      <div className="pure-shell">
        <aside className="pure-sidebar">
          <div className="pure-sidebar-heading">MCP CONTROL</div>
          {(["dashboard", "jobs", "mcp", "activity", "settings"] as Surface[]).map((item) => (
            <button className={surface === item ? "active" : ""} key={item} onClick={() => setSurface(item)}>
              <span>{item === "dashboard" ? "◉" : item === "jobs" ? "▶" : item === "mcp" ? "⌘" : item === "activity" ? "≋" : "⚙"}</span>
              {copy[item]}
            </button>
          ))}
          <div className="pure-sidebar-foot">
            <span className={snapshot.mcpCredentialsConfigured ? "dot ready" : "dot"} />
            {snapshot.mcpCredentialsConfigured ? copy.ready : copy.setup}
          </div>
        </aside>
        <main className="pure-main">
          {surface === "dashboard" ? <Dashboard copy={copy} snapshot={snapshot} busy={busy} setError={setError} updateState={updateState} /> : null}
          {surface === "jobs" ? <JobsPanel copy={copy} /> : null}
          {surface === "mcp" ? <McpPanel copy={copy} snapshot={snapshot} busy={busy} setError={setError} updateState={updateState} /> : null}
          {surface === "activity" ? <Activity copy={copy} logs={logs} /> : null}
          {surface === "settings" ? <Settings copy={copy} language={language} snapshot={snapshot} setError={setError} updateState={updateState} /> : null}
        </main>
      </div>
      {operation ? <div className={`pure-operation ${operation.status}`}><span />{operation.message}</div> : null}
      {error ? <div className="pure-error"><span>{error}</span><button onClick={() => setError(null)}>{copy.clearError}</button></div> : null}
    </div>
  );
}

function Dashboard({ copy, snapshot, busy, setError, updateState }: PanelProps) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [overview, setOverview] = useState<CodexOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const refreshOverview = async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try { setOverview(await api!.codexOverview()); }
    catch (cause) { setOverviewError(messageOf(cause)); }
    finally { setOverviewLoading(false); }
  };
  useEffect(() => { void refreshOverview(); }, []);
  const runDoctor = async () => {
    setError(null);
    try { const next = await api!.verifyMcp(); setReport(next); }
    catch (cause) { setError(messageOf(cause)); }
  };
  return (
    <section>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <div className="pure-status-grid">
        <StatusCard title={copy.runtime} value={snapshot.mcpCredentialsConfigured ? copy.ready : copy.setup} tone={snapshot.mcpCredentialsConfigured ? "ready" : "warn"} />
        <StatusCard title={copy.connector} value={snapshot.connectorName} tone="neutral" />
        <StatusCard title={copy.codexModel} value={snapshot.state.defaultModel} tone="neutral" />
      </div>
      <QuotaPanel copy={copy} overview={overview} loading={overviewLoading} error={overviewError} onRefresh={refreshOverview} />
      <div className="pure-card pure-callout">
        <div><h3>{copy.noBrowser}</h3><p>{copy.noBrowserDetail}</p></div>
        <div className="pure-actions">
          <button className="primary" onClick={() => void api!.openExternal(snapshot.urls.connectors)}>{copy.openChat}</button>
          <button disabled={busy} onClick={() => void runDoctor()}>{busy ? copy.checking : copy.verify}</button>
        </div>
      </div>
      {report ? <DoctorResults report={report} /> : null}
    </section>
  );
}

function JobsPanel({ copy }: { copy: Copy }) {
  const [jobs, setJobs] = useState<CodexJobsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshJobs = async () => {
    try {
      setJobs(await api!.codexJobs());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api!.codexJobs();
        if (!cancelled) {
          setJobs(next);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(messageOf(cause));
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <section>
      <PageHeader title={copy.jobsTitle} subtitle={copy.jobsSubtitle} />
      <div className="pure-jobs-head">
        <strong>{copy.activeJobs}: {jobs?.activeCount ?? 0}</strong>
        <button onClick={() => void refreshJobs()}>{copy.refresh}</button>
      </div>
      {error ? <div className="pure-card pure-jobs-error">{error}</div> : null}
      <JobTable copy={copy} title={copy.activeJobs} jobs={jobs?.active ?? []} empty={copy.noActiveJobs} />
      <JobTable copy={copy} title={copy.recentJobs} jobs={jobs?.recent ?? []} empty={copy.noRecentJobs} />
    </section>
  );
}

function JobTable({ copy, title, jobs, empty }: { copy: Copy; title: string; jobs: CodexJobItem[]; empty: string }) {
  return <div className="pure-card pure-jobs-card"><h3>{title}</h3>{jobs.length ? <div className="pure-job-table"><div className="pure-job-row pure-job-header"><span>{copy.status}</span><span>{copy.work}</span><span>{copy.workspace}</span><span>{copy.model}</span><span>{copy.duration}</span><span>{copy.pid}</span></div>{jobs.map((job) => <div className="pure-job-row" key={job.id}><span><span className={`pure-job-status ${job.status}`}>{jobStatusLabel(copy, job.status)}</span></span><span className="pure-job-work" title={job.workSummary ?? copy.legacyWork}>{job.workSummary ?? copy.legacyWork}</span><span className="pure-job-workspace" title={job.workspacePath}>{job.workspacePath}</span><span><strong>{job.model ?? "—"}</strong>{job.reasoning ? <small>{job.reasoning}</small> : null}</span><span>{formatDuration(job.durationMs)}</span><span>{job.pid ?? "—"}</span></div>)}</div> : <div className="pure-empty">{empty}</div>}</div>;
}

function McpPanel({ copy, snapshot, busy, setError, updateState }: PanelProps) {
  const [tunnelId, setTunnelId] = useState("");
  const [runtimeKey, setRuntimeKey] = useState("");
  const [replace, setReplace] = useState(false);
  const canReuse = snapshot.mcpCredentialsConfigured && !replace;
  const submit = async () => {
    setError(null);
    try {
      const input = canReuse ? {} : { tunnelId: tunnelId.trim(), runtimeKey, replace: true };
      await api!.setupMcp(input);
      const report = await api!.verifyMcp();
      updateState({ ...snapshot.state, coreSetupComplete: true, mcpRuntimeInstalled: true, mcpSetupComplete: report.ok });
      setRuntimeKey("");
    } catch (cause) { setError(messageOf(cause)); }
  };
  return (
    <section>
      <PageHeader title={copy.configure} subtitle={copy.connectorHint} />
      <div className="pure-card pure-form">
        <label>{copy.connector}<input value={snapshot.connectorName} readOnly /></label>
        {!canReuse ? <>
          <label>{copy.tunnelId}<input placeholder="tunnel_…" value={tunnelId} onChange={(event) => setTunnelId(event.target.value)} /></label>
          <label>{copy.runtimeKey}<input autoComplete="off" type="password" value={runtimeKey} onChange={(event) => setRuntimeKey(event.target.value)} /></label>
        </> : null}
        {snapshot.mcpCredentialsConfigured ? <label className="pure-check"><input checked={replace} type="checkbox" onChange={(event) => setReplace(event.target.checked)} />{copy.replace}</label> : null}
        <div className="pure-actions">
          <button onClick={() => void api!.openExternal(snapshot.urls.tunnels)}>OpenAI Tunnels</button>
          <button onClick={() => void api!.openExternal(snapshot.urls.keys)}>Runtime Keys</button>
          <button className="primary" disabled={busy || (!canReuse && (!tunnelId.trim() || runtimeKey.length < 20))} onClick={() => void submit()}>
            {busy ? copy.checking : canReuse ? copy.reconnect : copy.connect}
          </button>
        </div>
      </div>
    </section>
  );
}

function Activity({ copy, logs }: { copy: typeof text.en | typeof text["zh-CN"]; logs: LogRecord[] }) {
  return <section><PageHeader title={copy.logs} subtitle="MCP / Tunnel / Luna" /><div className="pure-log-list">{logs.length ? [...logs].reverse().map((log, index) => <div className={`pure-log ${log.level}`} key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString()}</time><strong>{log.event}</strong><code>{detail(log.detail)}</code></div>) : <div className="pure-empty">No runtime events.</div>}</div></section>;
}

function Settings({ copy, language, snapshot, setError, updateState }: { copy: typeof text.en | typeof text["zh-CN"]; language: Language; snapshot: LauncherSnapshot; setError: (value: string | null) => void; updateState: (state: LauncherState) => void }) {
  const [proxyEnabled, setProxyEnabled] = useState(snapshot.state.proxyEnabled);
  const [proxyUrl, setProxyUrl] = useState(snapshot.state.proxyUrl);
  const [defaultModel, setDefaultModel] = useState(snapshot.state.defaultModel);
  const [overview, setOverview] = useState<CodexOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  useEffect(() => {
    setProxyEnabled(snapshot.state.proxyEnabled);
    setProxyUrl(snapshot.state.proxyUrl);
    setDefaultModel(snapshot.state.defaultModel);
  }, [snapshot.state.proxyEnabled, snapshot.state.proxyUrl, snapshot.state.defaultModel]);
  useEffect(() => {
    let cancelled = false;
    void api!.codexOverview().then((value) => {
      if (!cancelled) setOverview(value);
    }).catch((cause) => {
      if (!cancelled) setOverviewError(messageOf(cause));
    });
    return () => { cancelled = true; };
  }, []);
  const changeLanguage = async (next: Language) => { try { updateState(await api!.setLanguage(next)); } catch (cause) { setError(messageOf(cause)); } };
  const setKeepRunning = async (value: boolean) => { try { updateState(await api!.setPreference("keepRunningOnClose", value)); } catch (cause) { setError(messageOf(cause)); } };
  const saveModel = async () => {
    setError(null);
    try { updateState(await api!.setDefaultModel(defaultModel)); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const saveProxy = async () => {
    setError(null);
    try { updateState(await api!.setProxySettings({ enabled: proxyEnabled, url: proxyUrl })); }
    catch (cause) { setError(messageOf(cause)); }
  };
  return <section><PageHeader title={copy.settings} subtitle="GPT Web Codex" /><div className="pure-card pure-settings"><label>{copy.language}<select value={language} onChange={(event) => void changeLanguage(event.target.value as Language)}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label><label className="pure-check"><input checked={snapshot.state.keepRunningOnClose} type="checkbox" onChange={(event) => void setKeepRunning(event.target.checked)} />{copy.keepRunning}</label><div className="pure-setting-group"><strong>{copy.codexModel}</strong><label>{copy.defaultModel}<input list="codex-model-options" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} /></label><datalist id="codex-model-options">{overview?.models.map((model) => <option key={model.model} value={model.model}>{model.displayName}</option>)}</datalist><small>{copy.modelHint}</small>{overviewError ? <small>{overviewError}</small> : null}<button onClick={() => void saveModel()}>{copy.saveModel}</button></div><div className="pure-setting-group"><strong>{copy.proxy}</strong><label className="pure-check"><input checked={proxyEnabled} type="checkbox" onChange={(event) => setProxyEnabled(event.target.checked)} />{copy.useProxy}</label><label>{copy.proxyUrl}<input placeholder="http://127.0.0.1:10808" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} /></label><small>{copy.proxyHint}</small><button onClick={() => void saveProxy()}>{copy.saveProxy}</button></div><button onClick={() => void api!.openLogs()}>{copy.openLogs}</button></div></section>;
}

type Copy = typeof text.en | typeof text["zh-CN"];
interface PanelProps { copy: Copy; snapshot: LauncherSnapshot; busy: boolean; setError: (value: string | null) => void; updateState: (state: LauncherState) => void; }
function PageHeader({ title, subtitle }: { title: string; subtitle: string }) { return <header className="pure-page-header"><h1>{title}</h1><p>{subtitle}</p></header>; }
function StatusCard({ title, value, tone }: { title: string; value: string; tone: string }) { return <div className={`pure-card pure-status ${tone}`}><span>{title}</span><strong>{value}</strong></div>; }
function DoctorResults({ report }: { report: DoctorReport }) { return <div className="pure-card pure-doctor">{report.checks.map((check) => <div key={check.id}><span className={`dot ${check.status === "ok" ? "ready" : check.status}`} /><div><strong>{check.message}</strong>{check.detail ? <small>{check.detail}</small> : null}</div></div>)}</div>; }
function QuotaPanel({ copy, overview, loading, error, onRefresh }: { copy: Copy; overview: CodexOverview | null; loading: boolean; error: string | null; onRefresh: () => Promise<void> }) {
  const windows = [overview?.primary, overview?.secondary].filter((value): value is CodexQuotaWindow => Boolean(value)).sort((a, b) => (a.windowDurationMins ?? 0) - (b.windowDurationMins ?? 0));
  return <div className="pure-card pure-quota"><div className="pure-quota-head"><div><h3>{copy.quota}</h3>{overview?.planType ? <small>{copy.plan}: {overview.planType}</small> : null}</div><button disabled={loading} onClick={() => void onRefresh()}>{loading ? copy.checking : copy.refreshQuota}</button></div>{error ? <div className="pure-quota-empty">{copy.quotaUnavailable}: {error}</div> : windows.length ? <div className="pure-quota-grid">{windows.map((window, index) => <div className="pure-quota-row" key={`${window.windowDurationMins ?? "unknown"}-${index}`}><div className="pure-quota-label"><strong>{quotaWindowLabel(window.windowDurationMins)}</strong><span>{window.remainingPercent}% {copy.remaining}</span></div><progress max={100} value={window.remainingPercent} /><small>{window.resetsAt ? `${copy.resets}: ${formatReset(window.resetsAt)}` : ""}</small></div>)}</div> : <div className="pure-quota-empty">{loading ? copy.checking : copy.quotaUnavailable}</div>}{overview?.credits?.hasCredits ? <div className="pure-quota-meta">{copy.credits}: {overview.credits.unlimited ? copy.unlimited : overview.credits.balance ?? "—"}{overview.resetCreditsAvailable !== null ? ` · Reset credits: ${overview.resetCreditsAvailable}` : ""}</div> : null}</div>;
}
function quotaWindowLabel(minutes: number | null) {
  if (minutes === 300) return "5h";
  if (minutes === 10_080) return "7d";
  if (!minutes) return "Limit";
  if (minutes % 1_440 === 0) return `${minutes / 1_440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
function formatReset(epochSeconds: number) { return new Date(epochSeconds * 1000).toLocaleString(); }
function formatDuration(value: number | null) {
  if (value === null) return "—";
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function jobStatusLabel(copy: Copy, status: CodexJobItem["status"]) { return copy[status]; }
function messageOf(value: unknown) { return value instanceof Error ? value.message : String(value); }
function detail(value: Record<string, unknown>) { const raw = JSON.stringify(value); return raw === "{}" ? "" : raw; }
