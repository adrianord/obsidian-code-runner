import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemAdapter, Notice } from "obsidian";
import type CodeRunnerPlugin from "./main";
import type { RunnableBlock, RunState } from "./types";
import { createIdleState, OutputStateStore } from "./state";

interface ActiveRun {
  process: ChildProcess;
  tempDir: string;
  timeoutId: number | null;
}

export class ExecutionManager {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(
    private readonly plugin: CodeRunnerPlugin,
    private readonly store: OutputStateStore
  ) {}

  isRunning(blockId: string): boolean {
    return this.activeRuns.has(blockId);
  }

  async runBlock(block: RunnableBlock): Promise<void> {
    const commandTemplate = this.plugin.settings.executorPresets[block.lang];
    if (!commandTemplate) {
      this.store.set(block.id, errorState(`No executor preset configured for '${block.lang}'.`));
      return;
    }

    await this.stopBlock(block.id, false);

    const tempDir = await mkdtemp(join(tmpdir(), "obsidian-code-runner-"));
    const tempFile = join(tempDir, `snippet.${block.lang}`);
    await writeFile(tempFile, block.code, "utf8");

    const command = commandTemplate.split("{{file}}").join(quoteForShell(tempFile));
    const process = spawn(command, {
      cwd: this.getWorkingDirectory(),
      shell: true
    });

    const activeRun: ActiveRun = {
      process,
      tempDir,
      timeoutId: null
    };
    this.activeRuns.set(block.id, activeRun);
    this.plugin.requestRefresh();

    const state: RunState = {
      status: "running",
      chunks: [],
      truncated: false,
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      exitCode: null,
      errorMessage: null
    };

    this.store.set(block.id, state);

    const appendChunk = (text: string, isStderr: boolean): void => {
      if (!text) {
        return;
      }

      const current = this.store.get(block.id);
      const maxBytes = this.plugin.settings.maxOutputBytes;
      const usedBytes = current.chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.text), 0);
      const remaining = Math.max(0, maxBytes - usedBytes);
      const nextText = trimToBytes(text, remaining);
      const truncated = nextText.length < text.length || current.truncated;

      const nextState: RunState = {
        ...current,
        chunks: nextText ? [...current.chunks, { text: nextText, isStderr }] : current.chunks,
        truncated
      };

      this.store.set(block.id, nextState);
    };

    process.stdout?.on("data", (data: Buffer | string) => appendChunk(String(data), false));
    process.stderr?.on("data", (data: Buffer | string) => appendChunk(String(data), true));

    process.on("error", async (error) => {
      this.store.set(block.id, errorState(error.message, this.store.get(block.id)));
      await this.cleanup(block.id);
    });

    process.on("close", async (exitCode) => {
      const current = this.store.get(block.id);
      const endedAt = Date.now();
      const status = current.status === "stopped"
        ? "stopped"
        : current.status === "error" && current.errorMessage
          ? "error"
          : exitCode === 0
            ? "success"
            : "error";

      this.store.set(block.id, {
        ...current,
        status,
        exitCode,
        endedAt,
        durationMs: current.startedAt ? endedAt - current.startedAt : null
      });
      await this.cleanup(block.id);
      void this.plugin.persistOutputs();
    });

    const timeoutMs = this.plugin.settings.timeoutMs;
    activeRun.timeoutId = window.setTimeout(() => {
      void this.stopBlock(block.id, false, `Timed out after ${timeoutMs}ms.`);
    }, timeoutMs);

    void this.plugin.persistOutputs();
  }

  async stopBlock(blockId: string, userInitiated = true, message = "Stopped."): Promise<void> {
    const activeRun = this.activeRuns.get(blockId);
    if (!activeRun) {
      return;
    }

    activeRun.process.kill();

    const current = this.store.get(blockId);
    this.store.set(blockId, {
      ...current,
      status: userInitiated ? "stopped" : "error",
      errorMessage: message,
      endedAt: Date.now(),
      durationMs: current.startedAt ? Date.now() - current.startedAt : null
    });

    await this.cleanup(blockId);
    void this.plugin.persistOutputs();
  }

  async clearBlock(blockId: string): Promise<void> {
    await this.stopBlock(blockId, true);
    this.store.clear(blockId);
    void this.plugin.persistOutputs();
  }

  async cleanupAll(): Promise<void> {
    await Promise.all(Array.from(this.activeRuns.keys()).map((blockId) => this.stopBlock(blockId, true)));
  }

  private async cleanup(blockId: string): Promise<void> {
    const activeRun = this.activeRuns.get(blockId);
    if (!activeRun) {
      return;
    }

    if (activeRun.timeoutId !== null) {
      window.clearTimeout(activeRun.timeoutId);
    }

    this.activeRuns.delete(blockId);
    this.plugin.requestRefresh();
    await rm(activeRun.tempDir, { recursive: true, force: true });
  }

  private getWorkingDirectory(): string | undefined {
    const adapter = this.plugin.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }

    return undefined;
  }
}

function quoteForShell(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function trimToBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  let result = value;
  while (Buffer.byteLength(result) > maxBytes) {
    result = result.slice(0, -1);
  }
  return result;
}

function errorState(message: string, previous: RunState = createIdleState()): RunState {
  return {
    ...previous,
    status: "error",
    endedAt: Date.now(),
    durationMs: previous.startedAt ? Date.now() - previous.startedAt : null,
    errorMessage: message
  };
}
