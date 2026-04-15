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

export interface RunnerPreset {
  languages: string[];
  command: string;
}

export type RenderedCodeRenderer = "prism" | "codemirror";

export type RenderedCodeDarkTheme = "one-dark" | "dracula" | "nord" | "tokyo-night" | "github-dark";

export type RenderedCodeLightTheme = "github-light" | "quietlight" | "xcode";

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
  timeoutMs: number;
  maxOutputBytes: number;
  autoClearOutput: boolean;
  persistLatestOutput: boolean;
  extraPathEntries: string[];
  renderedCodeRenderer: RenderedCodeRenderer;
  renderedCodeDarkTheme: RenderedCodeDarkTheme;
  renderedCodeLightTheme: RenderedCodeLightTheme;
  runnerPresets: RunnerPreset[];
}

export interface PersistedData {
  settings?: Partial<RunnerSettings> & { executorPresets?: Record<string, string> };
  outputs?: Record<string, RunState>;
}
