import { App, PluginSettingTab, Setting } from "obsidian";
import type CodeRunnerPlugin from "./main";
import type { RunnerPreset, RunnerSettings } from "./types";

export const DEFAULT_SETTINGS: RunnerSettings = {
  timeoutMs: 30_000,
  maxOutputBytes: 64_000,
  autoClearOutput: true,
  persistLatestOutput: true,
  extraPathEntries: [],
  renderedCodeRenderer: "codemirror",
  renderedCodeDarkTheme: "github-dark",
  renderedCodeLightTheme: "github-light",
  runnerPresets: [
    { languages: ["js"], command: "node {{file}}" },
    { languages: ["python"], command: "python3 {{file}}" },
    { languages: ["bash", "sh"], command: "/bin/bash {{file}}" }
  ]
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

    const pathTitle = containerEl.createEl("h3", { text: "Environment PATH" });
    pathTitle.addClass("code-runner-settings-section-title");

    const pathSectionBody = containerEl.createDiv({ cls: "code-runner-settings-section-body" });

    const pathInfo = pathSectionBody.createEl("p", {
      text: "Extra PATH entries are prepended when running code blocks. Add one directory per line, for example /usr/local/bin or /opt/homebrew/bin."
    });
    pathInfo.addClass("setting-item-description");

    const pathField = pathSectionBody.createEl("textarea", {
      text: this.plugin.settings.extraPathEntries.join("\n")
    });
    pathField.rows = 4;
    pathField.style.width = "100%";

    pathField.addEventListener("change", async () => {
      this.plugin.settings.extraPathEntries = pathField.value
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      await this.plugin.savePluginData();
    });

    const runnersTitle = containerEl.createEl("h3", { text: "Runners" });
    runnersTitle.addClass("code-runner-settings-section-title");

    const runnersSectionBody = containerEl.createDiv({ cls: "code-runner-settings-section-body" });

    const runnersInfo = runnersSectionBody.createEl("p", {
      text: "Configure runnable languages and their commands. Add comma-separated languages to share one executable across multiple fence types. Use {{file}} where the temporary snippet file should be inserted."
    });
    runnersInfo.addClass("setting-item-description");

    const presetsContainer = runnersSectionBody.createDiv({ cls: "code-runner-settings-runners" });

    const renderRunnerPresets = (): void => {
      presetsContainer.empty();

      this.plugin.settings.runnerPresets.forEach((preset, index) => {
        const row = presetsContainer.createDiv({ cls: "code-runner-settings-runner-row" });

        const languagesInput = row.createEl("input", { type: "text" });
        languagesInput.placeholder = "js, ts, jsx";
        languagesInput.value = preset.languages.join(", ");
        languagesInput.addClass("code-runner-settings-runner-languages");

        const commandInput = row.createEl("input", { type: "text" });
        commandInput.placeholder = "node {{file}}";
        commandInput.value = preset.command;
        commandInput.addClass("code-runner-settings-runner-command");

        const removeButton = row.createEl("button", { text: "-" });
        removeButton.type = "button";
        removeButton.addClass("code-runner-settings-runner-button");
        removeButton.ariaLabel = "Remove runner";
        removeButton.title = "Remove runner";

        const updatePreset = async (): Promise<void> => {
          this.plugin.settings.runnerPresets[index] = normalizeRunnerPreset({
            languages: languagesInput.value.split(","),
            command: commandInput.value
          });
          this.plugin.ensureCodeBlockProcessors();
          await this.plugin.savePluginData();
          this.plugin.requestRefresh();
        };

        languagesInput.addEventListener("change", () => {
          void updatePreset();
        });
        commandInput.addEventListener("change", () => {
          void updatePreset();
        });
        removeButton.addEventListener("click", () => {
          this.plugin.settings.runnerPresets.splice(index, 1);
          void this.plugin.savePluginData();
          this.plugin.requestRefresh();
          renderRunnerPresets();
        });
      });
    };

    const addRunnerButton = runnersSectionBody.createEl("button", { text: "+" });
    addRunnerButton.type = "button";
    addRunnerButton.addClass("code-runner-settings-runner-button", "code-runner-settings-runner-add-button");
    addRunnerButton.ariaLabel = "Add runner";
    addRunnerButton.title = "Add runner";
    addRunnerButton.addEventListener("click", () => {
      this.plugin.settings.runnerPresets.push({ languages: [], command: "" });
      renderRunnerPresets();
    });

    renderRunnerPresets();
  }
}

function normalizeRunnerPreset(preset: RunnerPreset): RunnerPreset {
  return {
    languages: preset.languages.map((language) => language.trim()).filter(Boolean),
    command: preset.command.trim()
  };
}
