export type Language = "en" | "zh-CN";
export type Surface = "dashboard" | "jobs" | "mcp" | "activity" | "settings";

export interface LauncherState {
  version: 1;
  language: Language | null;
  keepRunningOnClose: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
  defaultModel: string;
  coreSetupComplete?: boolean;
  mcpSetupComplete?: boolean;
  mcpRuntimeInstalled?: boolean;
  mcpGuideStep: number;
}

export interface LogRecord {
  at: string;
  level: "debug" | "info" | "warning" | "error";
  event: string;
  detail: Record<string, unknown>;
}

export interface DoctorCheck {
  id: string;
  status: "ok" | "warning" | "error";
  message: string;
  detail?: string;
}

export interface DoctorReport {
  ok: boolean;
  mode?: "browser-only" | "full";
  checks: DoctorCheck[];
}

export interface OperationState {
  name: string;
  status: "running" | "completed" | "failed";
  message: string;
}

export type UpdateState =
  | { status: "disabled" | "idle" | "checking" | "up-to-date" }
  | { status: "available" | "downloading" | "installing"; version: string }
  | { status: "error"; message: string };

export interface CodexQuotaWindow {
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface CodexModelOption {
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

export interface CodexOverview {
  planType: string | null;
  limitId: string | null;
  primary: CodexQuotaWindow | null;
  secondary: CodexQuotaWindow | null;
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  resetCreditsAvailable: number | null;
  ordinaryUsageAllowed: boolean | null;
  models: CodexModelOption[];
  warnings: string[];
}

export type CodexJobStatus = "queued" | "running" | "completed" | "failed" | "timed_out" | "cancelled";

export interface CodexJobItem {
  id: string;
  status: CodexJobStatus;
  workSummary: string | null;
  workspacePath: string;
  model: string | null;
  reasoning: string | null;
  permissionMode: string | null;
  pid: number | null;
  attempts: number;
  eventCount: number;
  lastEventAt: string | null;
  terminalEvent: string | null;
  stderrTail: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface CodexJobsSnapshot {
  activeCount: number;
  active: CodexJobItem[];
  recent: CodexJobItem[];
  updatedAt: string;
}

export interface LauncherSnapshot {
  state: LauncherState;
  connectorName: string;
  mcpCredentialsConfigured: boolean;
  logs: LogRecord[];
  urls: {
    connectors: string;
    tunnels: string;
    keys: string;
  };
  platform: string;
  packaged: boolean;
  version: string;
  operation: OperationState | null;
  update: UpdateState;
}

export interface LauncherApi {
  snapshot(): Promise<LauncherSnapshot>;
  setLanguage(language: Language): Promise<LauncherState>;
  openExternal(url: string): Promise<boolean>;
  verifyMcp(): Promise<DoctorReport>;
  doctor(): Promise<DoctorReport>;
  setupMcp(input: {
    tunnelId?: string;
    runtimeKey?: string;
    replace?: boolean;
  }): Promise<{ ok: boolean; stdout: string }>;
  setMcpStep(step: number): Promise<LauncherState>;
  setPreference(key: "keepRunningOnClose", value: boolean): Promise<LauncherState>;
  setProxySettings(input: { enabled: boolean; url: string }): Promise<LauncherState>;
  setDefaultModel(model: string): Promise<LauncherState>;
  codexOverview(): Promise<CodexOverview>;
  codexJobs(): Promise<CodexJobsSnapshot>;
  logs(limit?: number): Promise<LogRecord[]>;
  openLogs(): Promise<string>;
  installUpdate(): Promise<boolean>;
  windowState(): Promise<{ fullScreen: boolean; maximized: boolean }>;
  windowControl(action: "close" | "minimize" | "zoom"): void;
  onWindowStateChanged(listener: (state: { fullScreen: boolean; maximized: boolean }) => void): () => void;
  onStateChanged(listener: (state: LauncherState) => void): () => void;
  onOperation(listener: (state: OperationState) => void): () => void;
  onLog(listener: (record: LogRecord) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}

declare global {
  interface Window {
    codexWebLauncher?: LauncherApi;
  }
}
