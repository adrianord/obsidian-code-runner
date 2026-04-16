import { Editor, MarkdownView, Notice, Plugin, type MarkdownPostProcessorContext } from "obsidian";
import { findBlockAtLine, findRunnableBlocks, hasCodeRunnerFrontmatter } from "./blocks";
import { ExecutionManager } from "./execution";
import { DEFAULT_SETTINGS, CodeRunnerSettingTab } from "./settings";
import { OutputStateStore } from "./state";
import type { PersistedData, RunnableBlock, RunnerSettings } from "./types";
import { attachRenderedBlockUI, renderPlainCodeBlock } from "./ui";

export default class CodeRunnerPlugin extends Plugin {
  settings: RunnerSettings = DEFAULT_SETTINGS;
  outputStore = new OutputStateStore();
  executionManager = new ExecutionManager(this, this.outputStore);
  private readonly refreshCallbacks = new Set<() => void>();
  private readonly collapsedBlocks = new Set<string>();
  private readonly registeredProcessorLanguages = new Set<string>();
  private persistTimeout: number | null = null;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.executionManager = new ExecutionManager(this, this.outputStore);

    this.ensureCodeBlockProcessors();

    this.addCommand({
      id: "run-current-runnable-block",
      name: "Run current runnable block",
      editorCallback: async (editor) => {
        const block = this.getCurrentBlock(editor);
        if (!block) {
          new Notice("Cursor is not inside a runnable block.");
          return;
        }

        await this.runBlock(block);
      }
    });

    this.addCommand({
      id: "stop-current-runnable-block",
      name: "Stop current runnable block",
      editorCallback: async (editor) => {
        const block = this.getCurrentBlock(editor);
        if (!block) {
          new Notice("Cursor is not inside a runnable block.");
          return;
        }

        await this.executionManager.stopBlock(block.id, true);
      }
    });

    this.addCommand({
      id: "clear-current-runnable-block-output",
      name: "Clear current runnable block output",
      editorCallback: async (editor) => {
        const block = this.getCurrentBlock(editor);
        if (!block) {
          new Notice("Cursor is not inside a runnable block.");
          return;
        }

        await this.executionManager.clearBlock(block.id);
      }
    });

    this.addSettingTab(new CodeRunnerSettingTab(this.app, this));
    this.registerEvent(this.outputStore.on("change", () => this.requestRefresh()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.requestRefresh()));
  }

  async onunload(): Promise<void> {
    if (this.persistTimeout !== null) {
      window.clearTimeout(this.persistTimeout);
    }

    await this.executionManager.cleanupAll();
    await this.savePluginData();
  }

  getActiveSourcePath(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  focusSourceLine(sourcePath: string, line: number, ch = 0): boolean {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeFile?.path !== sourcePath || !activeView?.editor) {
      return false;
    }

    activeView.editor.setCursor({ line, ch });
    activeView.editor.focus();
    return true;
  }

  onOutputChange(callback: () => void): () => void {
    this.refreshCallbacks.add(callback);
    return () => this.refreshCallbacks.delete(callback);
  }

  requestRefresh(): void {
    this.refreshCallbacks.forEach((callback) => callback());
  }

  isCollapsed(blockId: string): boolean {
    return this.collapsedBlocks.has(blockId);
  }

  toggleCollapsed(blockId: string): void {
    if (this.collapsedBlocks.has(blockId)) {
      this.collapsedBlocks.delete(blockId);
    } else {
      this.collapsedBlocks.add(blockId);
    }

    this.requestRefresh();
  }

  async runBlock(block: RunnableBlock): Promise<void> {
    if (this.settings.autoClearOutput) {
      this.outputStore.clear(block.id);
    }

    await this.executionManager.runBlock(block);
  }

  async persistOutputs(): Promise<void> {
    if (!this.settings.persistLatestOutput) {
      return;
    }

    if (this.persistTimeout !== null) {
      window.clearTimeout(this.persistTimeout);
    }

    this.persistTimeout = window.setTimeout(() => {
      void this.savePluginData();
    }, 200);
  }

  async savePluginData(): Promise<void> {
    const data: PersistedData = {
      settings: this.settings,
      outputs: this.settings.persistLatestOutput ? this.outputStore.toJSON() : {}
    };
    await this.saveData(data);
  }

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as PersistedData | null;
    const runnerPresets = data?.settings?.runnerPresets?.map((preset) => ({
      languages: preset.languages.map((language) => language.trim()).filter(Boolean),
      command: preset.command.trim()
    })) ?? migrateExecutorPresets(data?.settings?.executorPresets);

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data?.settings,
      runnerPresets: runnerPresets.length > 0 ? runnerPresets : DEFAULT_SETTINGS.runnerPresets
    };
    this.outputStore = new OutputStateStore(data?.outputs ?? {});
  }

  ensureCodeBlockProcessors(): void {
    const languages = this.getConfiguredLanguages();
    for (const language of languages) {
      if (this.registeredProcessorLanguages.has(language)) {
        continue;
      }

      this.registerMarkdownCodeBlockProcessor(language, async (source, el, ctx) => {
        await this.renderRunnableCodeBlock(language, source, el, ctx);
      });
      this.registeredProcessorLanguages.add(language);
    }
  }

  private async renderRunnableCodeBlock(language: string, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    if (!this.getExecutorCommand(language)) {
      renderPlainCodeBlock(el, language, source);
      return;
    }

    const fileText = await this.getSourceText(ctx.sourcePath);
    if (!fileText || !hasCodeRunnerFrontmatter(fileText)) {
      renderPlainCodeBlock(el, language, source);
      return;
    }

    const sectionInfo = ctx.getSectionInfo(el);
    if (!sectionInfo) {
      return;
    }

    const block = findRunnableBlocks(fileText, ctx.sourcePath).find((candidate) => {
      return candidate.startLine === sectionInfo.lineStart && candidate.lang === language;
    });

    if (!block) {
      renderPlainCodeBlock(el, language, source);
      return;
    }

    attachRenderedBlockUI(this, el, block, source, ctx);
  }

  private async getSourceText(sourcePath: string): Promise<string | null> {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeFile?.path === sourcePath && activeView?.editor) {
      return activeView.editor.getValue();
    }

    const file = this.app.vault.getFileByPath(sourcePath);
    if (!file) {
      return null;
    }

    return this.app.vault.cachedRead(file);
  }

  private getCurrentBlock(editor: Editor): RunnableBlock | null {
    const sourcePath = this.getActiveSourcePath();
    if (!sourcePath) {
      return null;
    }

    const text = editor.getValue();
    if (!hasCodeRunnerFrontmatter(text)) {
      return null;
    }

    return findBlockAtLine(text, sourcePath, editor.getCursor().line);
  }

  getExecutorCommand(language: string): string | null {
    const normalizedLanguage = language.trim().toLowerCase();
    for (const preset of this.settings.runnerPresets) {
      if (!preset.command) {
        continue;
      }

      if (preset.languages.some((presetLanguage) => presetLanguage.toLowerCase() === normalizedLanguage)) {
        return preset.command;
      }
    }

    return null;
  }

  private getConfiguredLanguages(): string[] {
    const languages = new Set<string>();
    this.settings.runnerPresets.forEach((preset) => {
      preset.languages.forEach((language) => {
        const normalizedLanguage = language.trim().toLowerCase();
        if (normalizedLanguage) {
          languages.add(normalizedLanguage);
        }
      });
    });
    return Array.from(languages);
  }
}

function migrateExecutorPresets(executorPresets: Record<string, string> | undefined): RunnerSettings["runnerPresets"] {
  if (!executorPresets) {
    return [];
  }

  return Object.entries(executorPresets).map(([language, command]) => ({
    languages: [language],
    command
  }));
}
