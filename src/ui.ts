import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { nord } from "@uiw/codemirror-theme-nord";
import { quietlight } from "@uiw/codemirror-theme-quietlight";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { xcodeLight } from "@uiw/codemirror-theme-xcode";
import { MarkdownRenderChild, loadPrism, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type CodeRunnerPlugin from "./main";
import type { RenderedCodeDarkTheme, RenderedCodeLightTheme, RunnableBlock } from "./types";

export function attachRenderedBlockUI(
  plugin: CodeRunnerPlugin,
  container: HTMLElement,
  block: RunnableBlock,
  source: string,
  context: MarkdownPostProcessorContext
): void {
  if (container.classList.contains("code-runner-container")) {
    return;
  }

  const toolbarSlot = createDiv({ cls: "code-runner-toolbar-slot" });
  const codeSlot = createDiv({ cls: "code-runner-code" });
  const outputSlot = createDiv({ cls: "code-runner-output-slot" });

  container.empty();
  container.addClass("code-runner-container");
  container.setAttr("contenteditable", "false");
  toolbarSlot.setAttr("contenteditable", "false");
  codeSlot.setAttr("contenteditable", "false");
  outputSlot.setAttr("contenteditable", "false");

  shieldEditorInteractions(container);
  shieldEditorInteractions(toolbarSlot);
  shieldEditorInteractions(outputSlot);
  bindCodeSlotNavigation(plugin, codeSlot, block);

  let destroyCodeBlock = renderCodeBlock(plugin, codeSlot, block.lang, source);
  let lastRenderer = plugin.settings.renderedCodeRenderer;
  let lastDarkTheme = plugin.settings.renderedCodeDarkTheme;
  let lastLightTheme = plugin.settings.renderedCodeLightTheme;
  let lastDarkMode = plugin.app.isDarkMode();

  container.append(toolbarSlot, codeSlot, outputSlot);

  const rerender = (): void => {
    const rendererChanged = plugin.settings.renderedCodeRenderer !== lastRenderer;
    const darkThemeChanged = plugin.settings.renderedCodeDarkTheme !== lastDarkTheme;
    const lightThemeChanged = plugin.settings.renderedCodeLightTheme !== lastLightTheme;
    const darkModeChanged = plugin.app.isDarkMode() !== lastDarkMode;

    if (rendererChanged || darkThemeChanged || lightThemeChanged || darkModeChanged) {
      destroyCodeBlock();
      destroyCodeBlock = renderCodeBlock(plugin, codeSlot, block.lang, source);
      lastRenderer = plugin.settings.renderedCodeRenderer;
      lastDarkTheme = plugin.settings.renderedCodeDarkTheme;
      lastLightTheme = plugin.settings.renderedCodeLightTheme;
      lastDarkMode = plugin.app.isDarkMode();
    }

    syncRenderedBlock(plugin, block, toolbarSlot, outputSlot);
  };

  rerender();
  context.addChild(new RenderedBlockChild(container, plugin, rerender, () => destroyCodeBlock()));
}

export function renderPlainCodeBlock(container: HTMLElement, language: string, source: string): void {
  container.empty();
  const inner = container.createDiv({ cls: "code-runner-code-inner" });
  const lineNumbers = inner.createDiv({ cls: "code-runner-line-numbers" });
  const lineCount = Math.max(1, source.split("\n").length);

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    lineNumbers.createSpan({ text: String(lineNumber) });
  }

  const pre = inner.createEl("pre");
  const code = pre.createEl("code", { text: source });
  code.addClass(`language-${language}`);
  pre.addClass(`language-${language}`);
  lineNumbers.setAttr("contenteditable", "false");
  pre.setAttr("contenteditable", "false");
  code.setAttr("contenteditable", "false");
  void highlightCodeBlock(code);
}

function renderCodeBlock(plugin: CodeRunnerPlugin, container: HTMLElement, language: string, source: string): () => void {
  if (plugin.settings.renderedCodeRenderer === "codemirror") {
    const languageExtension = getLanguageExtension(language);
    if (languageExtension) {
      const theme = plugin.app.isDarkMode()
        ? plugin.settings.renderedCodeDarkTheme
        : plugin.settings.renderedCodeLightTheme;
      return renderCodeMirrorBlock(container, source, languageExtension, theme);
    }
  }

  renderPlainCodeBlock(container, language, source);
  return () => {};
}

function syncRenderedBlock(
  plugin: CodeRunnerPlugin,
  block: RunnableBlock,
  toolbarSlot: HTMLElement,
  outputSlot: HTMLElement
): void {
  toolbarSlot.empty();
  outputSlot.empty();
  toolbarSlot.append(renderToolbar(plugin, block));
  const output = renderOutput(plugin, block);
  if (output) {
    outputSlot.append(output);
  }
}

export function renderToolbar(plugin: CodeRunnerPlugin, block: RunnableBlock): HTMLElement {
  const toolbar = createDiv({ cls: "code-runner-top-bar" });
  const actions = createDiv({ cls: "code-runner-actions" });
  const runActionGroup = createDiv({ cls: "code-runner-run-action-group" });

  const state = plugin.outputStore.get(block.id);
  const isRunning = plugin.executionManager.isRunning(block.id);
  const canRun = !!plugin.getExecutorCommand(block.lang);
  const hasOutput = state.chunks.length > 0 || !!state.errorMessage;

  const runButton = createIconButton(isRunning ? "square" : "play", isRunning ? "Stop block" : "Run block");
  runButton.disabled = !isRunning && !canRun;
  runButton.addEventListener("click", () => {
    if (isRunning) {
      void plugin.executionManager.stopBlock(block.id, true);
      return;
    }

    void plugin.runBlock(block);
  });

  const collapseButton = createIconButton(plugin.isCollapsed(block.id) ? "chevron-right" : "chevron-down", "Toggle output");
  collapseButton.disabled = !hasOutput;
  collapseButton.addEventListener("click", () => {
    plugin.toggleCollapsed(block.id);
  });

  const clearButton = createIconButton("trash-2", "Clear output");
  clearButton.disabled = !hasOutput;
  clearButton.addEventListener("click", () => {
    void plugin.executionManager.clearBlock(block.id);
  });

  runActionGroup.append(runButton, collapseButton);
  actions.append(runActionGroup, clearButton);

  const label = createDiv({ cls: "code-runner-lang-label", text: formatLanguageLabel(block.lang) });
  toolbar.append(actions, label);
  return toolbar;
}

export function renderOutput(plugin: CodeRunnerPlugin, block: RunnableBlock): HTMLElement | null {
  const state = plugin.outputStore.get(block.id);
  const hasVisibleOutput = state.chunks.length > 0 || !!state.errorMessage;
  if (!hasVisibleOutput) {
    return null;
  }

  const wrapper = createDiv({ cls: "code-runner-output" });
  if (plugin.isCollapsed(block.id)) {
    wrapper.addClass("is-collapsed");
    return wrapper;
  }

  const pre = wrapper.createEl("pre", { cls: "code-runner-output-content" });
  if (state.chunks.length === 0 && state.errorMessage) {
    pre.createSpan({ text: state.errorMessage, cls: "is-stderr" });
  } else {
    state.chunks.forEach((chunk) => {
      const span = pre.createSpan({ text: chunk.text });
      if (chunk.isStderr) {
        span.addClass("is-stderr");
      }
    });
  }

  const footer = wrapper.createDiv({ cls: "code-runner-output-footer" });
  footer.createSpan({ text: formatFooterLeft(state) });
  footer.createSpan({ text: state.truncated ? "Output truncated" : formatFooterRight(state) });
  return wrapper;
}

class RenderedBlockChild extends MarkdownRenderChild {
  private readonly unsubscribe: () => void;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: CodeRunnerPlugin,
    private readonly rerender: () => void,
    private readonly destroyCodeBlockRef: () => void
  ) {
    super(containerEl);
    this.unsubscribe = this.plugin.onOutputChange(this.rerender);
  }

  onunload(): void {
    this.unsubscribe();
    this.destroyCodeBlockRef();
  }
}

function createIconButton(icon: string, ariaLabel: string): HTMLButtonElement {
  const button = createEl("button", { cls: "code-runner-icon-button" });
  setIcon(button, icon);
  button.ariaLabel = ariaLabel;
  button.type = "button";
  button.setAttr("contenteditable", "false");
  shieldEditorInteractions(button);
  return button;
}

function shieldEditorInteractions(element: HTMLElement): void {
  const stop = (event: Event): void => {
    event.stopPropagation();
  };

  const stopAndPrevent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener("mousedown", stopAndPrevent);
  element.addEventListener("mouseup", stop);
  element.addEventListener("click", stop);
}

function bindCodeSlotNavigation(plugin: CodeRunnerPlugin, codeSlot: HTMLElement, block: RunnableBlock): void {
  codeSlot.addEventListener("mousedown", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const targetLine = getClickedSourceLine(codeSlot, block, event);
    plugin.focusSourceLine(block.sourcePath, targetLine);
  });

  codeSlot.addEventListener("click", (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

function getClickedSourceLine(codeSlot: HTMLElement, block: RunnableBlock, event: MouseEvent): number {
  const firstCodeLine = block.startLine + 1;
  const codeLineCount = Math.max(1, block.code.split("\n").length);
  const rect = codeSlot.getBoundingClientRect();
  if (rect.height <= 0) {
    return firstCodeLine;
  }

  const offsetY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  const ratio = rect.height === 0 ? 0 : offsetY / rect.height;
  const clickedLineOffset = Math.min(codeLineCount - 1, Math.floor(ratio * codeLineCount));
  return firstCodeLine + clickedLineOffset;
}

function formatLanguageLabel(lang: string): string {
  if (lang.length === 0) {
    return "Code";
  }

  return lang.length === 1 ? lang.toUpperCase() : lang.charAt(0).toUpperCase() + lang.slice(1);
}

function formatFooterLeft(state: ReturnType<CodeRunnerPlugin["outputStore"]["get"]>): string {
  return state.exitCode === null ? state.status : `Exit ${state.exitCode}`;
}

function formatFooterRight(state: ReturnType<CodeRunnerPlugin["outputStore"]["get"]>): string {
  return state.durationMs === null ? "" : `${state.durationMs}ms`;
}

async function highlightCodeBlock(code: HTMLElement): Promise<void> {
  try {
    const prism = await loadPrism();
    prism.highlightElement(code);
  } catch {
    // Fall back to plain text if Prism highlighting fails.
  }
}

function renderCodeMirrorBlock(
  container: HTMLElement,
  source: string,
  languageExtension: unknown,
  themeName: RenderedCodeDarkTheme | RenderedCodeLightTheme
): () => void {
  container.empty();
  const inner = container.createDiv({ cls: `code-runner-code-inner code-runner-code-cm code-runner-theme-${themeName}` });
  const lineNumbers = inner.createDiv({ cls: "code-runner-line-numbers" });
  const lineCount = Math.max(1, source.split("\n").length);

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    lineNumbers.createSpan({ text: String(lineNumber) });
  }

  const host = inner.createDiv({ cls: "code-runner-code-cm-host" });
  lineNumbers.setAttr("contenteditable", "false");
  host.setAttr("contenteditable", "false");

  const theme = getCodeMirrorTheme(themeName);
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": {
            backgroundColor: "transparent"
          },
          ".cm-editor": {
            backgroundColor: "transparent"
          },
          ".cm-scroller": {
            fontFamily: "var(--font-monospace)",
            lineHeight: "1.5"
          },
          ".cm-content": {
            padding: "0.85rem 1rem"
          },
          ".cm-line": {
            padding: "0"
          },
          ".cm-gutters": {
            display: "none"
          },
          ".cm-activeLine": {
            backgroundColor: "transparent"
          },
          ".cm-focused": {
            outline: "none"
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "transparent !important"
          },
          ".cm-cursor, .cm-dropCursor": {
            display: "none"
          }
        }),
        theme.extension,
        languageExtension as never
      ]
    }),
    parent: host
  });

  view.dom.addClass("code-runner-cm-editor");
  view.dom.setAttr("contenteditable", "false");

  return () => view.destroy();
}

function getLanguageExtension(language: string): unknown | null {
  switch (language.toLowerCase()) {
    case "python":
    case "py":
      return python();
    case "javascript":
    case "js":
      return javascript();
    case "typescript":
    case "ts":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "json":
      return javascript();
    case "bash":
    case "sh":
    case "shell":
      return StreamLanguage.define(shell);
    default:
      return null;
  }
}

function getCodeMirrorTheme(themeName: RenderedCodeDarkTheme | RenderedCodeLightTheme): { extension: Extension } {
  switch (themeName) {
    case "dracula":
      return { extension: dracula };
    case "nord":
      return { extension: nord };
    case "tokyo-night":
      return { extension: tokyoNight };
    case "github-dark":
      return { extension: githubDark };
    case "github-light":
      return { extension: githubLight };
    case "quietlight":
      return { extension: quietlight };
    case "xcode":
      return { extension: xcodeLight };
    case "one-dark":
    default:
      return { extension: oneDark };
  }
}
