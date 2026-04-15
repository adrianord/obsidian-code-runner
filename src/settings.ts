import { App, PluginSettingTab, Setting } from "obsidian";
import type CodeRunnerPlugin from "./main";
import type { RunnerSettings } from "./types";

export const DEFAULT_SETTINGS: RunnerSettings = {
  timeoutMs: 30_000,
  maxOutputBytes: 64_000,
  autoClearOutput: true,
  persistLatestOutput: true,
  renderedCodeRenderer: "codemirror",
  renderedCodeDarkTheme: "github-dark",
  renderedCodeLightTheme: "github-light",
  executorPresets: {
    js: "node {{file}}",
    python: "python3 {{file}}",
    bash: "/bin/bash {{file}}",
    sh: "/bin/sh {{file}}"
  }
};

export class CodeRunnerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CodeRunnerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Execution timeout")
      .setDesc("Maximum runtime for a single block in milliseconds.")
      .addText((text) => text
        .setValue(String(this.plugin.settings.timeoutMs))
        .onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            this.plugin.settings.timeoutMs = parsed;
            await this.plugin.savePluginData();
          }
        }));

    new Setting(containerEl)
      .setName("Max output bytes")
      .setDesc("Truncate output after this many bytes.")
      .addText((text) => text
        .setValue(String(this.plugin.settings.maxOutputBytes))
        .onChange(async (value) => {
          const parsed = Number(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            this.plugin.settings.maxOutputBytes = parsed;
            await this.plugin.savePluginData();
          }
        }));

    new Setting(containerEl)
      .setName("Auto-clear before rerun")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoClearOutput)
        .onChange(async (value) => {
          this.plugin.settings.autoClearOutput = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Persist latest output")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.persistLatestOutput)
        .onChange(async (value) => {
          this.plugin.settings.persistLatestOutput = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Rendered code renderer")
      .setDesc("Choose how runnable code blocks are highlighted when rendered.")
      .addDropdown((dropdown) => dropdown
        .addOption("prism", "Prism (stable)")
        .addOption("codemirror", "CodeMirror")
        .setValue(this.plugin.settings.renderedCodeRenderer)
        .onChange(async (value) => {
          this.plugin.settings.renderedCodeRenderer = value as RunnerSettings["renderedCodeRenderer"];
          await this.plugin.savePluginData();
          this.plugin.requestRefresh();
        }));

    new Setting(containerEl)
      .setName("Rendered code dark theme")
      .setDesc("Theme for CodeMirror rendered code when Obsidian is in dark mode.")
      .addDropdown((dropdown) => dropdown
        .addOption("one-dark", "One Dark")
        .addOption("dracula", "Dracula")
        .addOption("nord", "Nord")
        .addOption("tokyo-night", "Tokyo Night")
        .addOption("github-dark", "GitHub Dark")
        .setValue(this.plugin.settings.renderedCodeDarkTheme)
        .onChange(async (value) => {
          this.plugin.settings.renderedCodeDarkTheme = value as RunnerSettings["renderedCodeDarkTheme"];
          await this.plugin.savePluginData();
          this.plugin.requestRefresh();
        }));

    new Setting(containerEl)
      .setName("Rendered code light theme")
      .setDesc("Theme for CodeMirror rendered code when Obsidian is in light mode.")
      .addDropdown((dropdown) => dropdown
        .addOption("github-light", "GitHub Light")
        .addOption("quietlight", "Quiet Light")
        .addOption("xcode", "Xcode")
        .setValue(this.plugin.settings.renderedCodeLightTheme)
        .onChange(async (value) => {
          this.plugin.settings.renderedCodeLightTheme = value as RunnerSettings["renderedCodeLightTheme"];
          await this.plugin.savePluginData();
          this.plugin.requestRefresh();
        }));

    const presetsInfo = containerEl.createEl("p", {
      text: "Executor presets are a JSON object mapping language names to shell commands. Use {{file}} where the temporary snippet file should be inserted."
    });
    presetsInfo.addClass("setting-item-description");

    const presetsField = containerEl.createEl("textarea", {
      text: JSON.stringify(this.plugin.settings.executorPresets, null, 2)
    });
    presetsField.rows = 8;
    presetsField.style.width = "100%";

    const presetsError = containerEl.createEl("p");
    presetsError.addClass("setting-item-description");

    presetsField.addEventListener("change", async () => {
      try {
        const parsed = JSON.parse(presetsField.value) as RunnerSettings["executorPresets"];
        this.plugin.settings.executorPresets = parsed;
        presetsError.setText("");
        this.plugin.ensureCodeBlockProcessors();
        await this.plugin.savePluginData();
        this.plugin.requestRefresh();
      } catch (error) {
        presetsError.setText(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}
