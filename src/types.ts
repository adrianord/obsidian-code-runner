export interface RunnableBlock {
  id: string;
  sourcePath: string;
  lang: string;
  code: string;
  startLine: number;
  endLine: number;
  from: number;
  to: number;
}

export interface OutputChunk {
  text: string;
  isStderr: boolean;
}

export type RunStatus = "idle" | "running" | "success" | "error" | "stopped";

export interface RunState {
  status: RunStatus;
  chunks: OutputChunk[];
  truncated: boolean;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  exitCode: number | null;
  errorMessage: string | null;
}

export interface RunnerSettings {
  executionEnabled: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  autoClearOutput: boolean;
  persistLatestOutput: boolean;
  executorPresets: Record<string, string>;
}

export interface PersistedData {
  settings?: Partial<RunnerSettings>;
  outputs?: Record<string, RunState>;
}
