import { Events } from "obsidian";
import type { RunState } from "./types";

const EMPTY_STATE: RunState = {
  status: "idle",
  chunks: [],
  truncated: false,
  startedAt: null,
  endedAt: null,
  durationMs: null,
  exitCode: null,
  errorMessage: null
};

export class OutputStateStore extends Events {
  private readonly outputs = new Map<string, RunState>();

  constructor(initialOutputs: Record<string, RunState> = {}) {
    super();
    Object.entries(initialOutputs).forEach(([key, value]) => {
      this.outputs.set(key, value);
    });
  }

  get(blockId: string): RunState {
    return this.outputs.get(blockId) ?? EMPTY_STATE;
  }

  set(blockId: string, next: RunState): void {
    this.outputs.set(blockId, next);
    this.trigger("change", blockId, next);
  }

  clear(blockId: string): void {
    this.outputs.delete(blockId);
    this.trigger("change", blockId, EMPTY_STATE);
  }

  toJSON(): Record<string, RunState> {
    return Object.fromEntries(this.outputs.entries());
  }
}

export function createIdleState(): RunState {
  return { ...EMPTY_STATE, chunks: [] };
}
