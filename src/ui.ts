import { MarkdownRenderChild, loadPrism, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type CodeRunnerPlugin from "./main";
import type { RunnableBlock } from "./types";

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
  shieldEditorInteractions(codeSlot);
  shieldEditorInteractions(outputSlot);

  renderPlainCodeBlock(codeSlot, block.lang, source);
  container.append(toolbarSlot, codeSlot, outputSlot);

  const rerender = (): void => syncRenderedBlock(plugin, block, toolbarSlot, outputSlot);
  rerender();
  context.addChild(new RenderedBlockChild(container, plugin, rerender));
}

export function renderPlainCodeBlock(container: HTMLElement, language: string, source: string): void {
  container.empty();
  const pre = container.createEl("pre");
  const code = pre.createEl("code", { text: source });
  code.addClass(`language-${language}`);
  pre.addClass(`language-${language}`);
  pre.setAttr("contenteditable", "false");
  code.setAttr("contenteditable", "false");
  void highlightCodeBlock(code);
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
  const canRun = plugin.settings.executionEnabled && !!plugin.settings.executorPresets[block.lang];
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
    private readonly rerender: () => void
  ) {
    super(containerEl);
    this.unsubscribe = this.plugin.onOutputChange(this.rerender);
  }

  onunload(): void {
    this.unsubscribe();
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
