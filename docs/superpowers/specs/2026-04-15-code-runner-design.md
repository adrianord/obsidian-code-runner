# Code Runner Plugin Design

## Summary

Build an Obsidian plugin that provides lightweight notebook-style code execution for explicit runnable code fences. The plugin should feel close to JupyMD in Live Preview while staying simpler and more local-first than Jupyter Notebook.

Version 1 focuses on desktop-only local shell execution, explicit runnable blocks, inline output directly below each block, and a predictable execution model with strong user control.

## Goals

- Support notebook-like execution directly inside Obsidian Live Preview.
- Keep the authoring model explicit so runnable blocks are easy to identify and reason about.
- Render output inline under each block so notes read top-to-bottom like lightweight computational documents.
- Use local interpreters and shell commands rather than Jupyter kernels.
- Keep the plugin small and maintainable by limiting v1 scope.

## Non-Goals

- Jupyter kernel integration.
- Rich notebook outputs such as charts, tables, HTML, or widget rendering.
- Writing execution output back into note Markdown.
- Cross-cell dependency management or shared notebook runtime state beyond what a single process naturally provides.
- Mobile execution support.

## User Model

Users opt into execution by writing explicit runnable fenced code blocks.

Example:

````md
```runner js
console.log("hello")
```
````

The first token after `runner` selects an executor preset defined in plugin settings. For example, `js` can map to `node {{file}}` and `python` can map to `python3 {{file}}`.

Regular Markdown code fences remain unchanged and non-runnable.

## Core UX

### Live Preview

Each runnable block in Live Preview renders with:

- A small toolbar attached to the block.
- `Run` action.
- `Stop` action while the block is running.
- Status indicator: idle, running, success, or error.
- Inline output region directly below the block.
- Output actions such as clear and collapse.

Execution behavior:

- Running a block executes only that block.
- Output streams into the inline output region as the process runs.
- Stdout and stderr appear in a single ordered stream, with stderr styled differently.
- The final output footer shows exit code and duration.
- Re-running a block can optionally clear prior output first based on settings.

### Reading View

Reading view should recognize runnable blocks and render a lighter version of the same experience:

- Block label and language.
- Run action when execution is enabled.
- Latest available output if one exists in plugin state.

Reading view does not need feature parity with Live Preview in v1. Live Preview is the primary experience.

## Syntax

Supported v1 syntax:

- ```` ```runner js ````
- ```` ```runner python ````
- ```` ```runner bash ````
- Any other `runner <lang>` form as long as a matching executor preset exists.

The plugin should not support complex frontmatter-like metadata inside the block in v1. The fence header stays intentionally minimal to reduce parsing and UI complexity.

## Persistence Model

Execution output is not written into the Markdown file.

Instead, the plugin stores recent block results in plugin-managed state keyed by note path plus block identity. This allows inline results to survive normal editor refreshes and note reopen events without polluting note contents.

Persistence scope for v1:

- Latest result only per block.
- Optional workspace/session persistence controlled by settings.
- No historical run log.

## Architecture

### Main Components

- `CodeRunnerPlugin`: plugin bootstrap, command registration, settings registration, and lifecycle hooks.
- `RunnerSettings`: typed settings model and defaults.
- `RunnableBlockParser`: finds `runner` fences and produces stable block descriptors.
- `ExecutionManager`: resolves executors, starts processes, streams events, tracks running state, and stops processes.
- `OutputStateStore`: stores latest block result and exposes updates to renderers.
- `LivePreviewDecorations`: CodeMirror integration for block toolbar, status, and inline output widgets.
- `ReadingViewRenderer`: Markdown post-processor for runnable blocks outside Live Preview.

### Execution Flow

1. The parser identifies runnable fences in the active note.
2. Live Preview decorations or Reading view rendering attach UI to each block.
3. User triggers `Run`.
4. The execution manager resolves the executor preset for the block language.
5. The block contents are written to a temporary file.
6. A local process is spawned using the configured command template.
7. Stdout and stderr stream back as ordered events.
8. Output state updates drive inline re-rendering.
9. Process completion records exit code, duration, and final status.
10. Stop, note close, or plugin unload cleans up any active process.

## Block Identity

Each runnable block needs a stable identity so output remains attached to the correct block across re-renders.

For v1, block identity should be derived from:

- Note path.
- Fence start position.
- A short hash of block contents.

This balances stability with implementation simplicity. If the block moves or changes meaningfully, treating it as a new block is acceptable in v1.

## Executor Model

Executors are configured by language preset in plugin settings.

Example presets:

- `js` -> `node {{file}}`
- `python` -> `python3 {{file}}`
- `bash` -> `/bin/bash {{file}}`
- `sh` -> `/bin/sh {{file}}`

Rules:

- Use temporary file execution by default.
- Support only `{{file}}` interpolation in v1.
- If a language has no configured preset, the block is shown as runnable syntax but cannot execute until configured.
- Commands are executed locally on the user's machine.

The plugin should not attempt arbitrary templating, variable expansion, notebook parameters, or shell abstraction beyond the configured command string.

## Output Model

Each run produces a result object with:

- Status.
- Combined ordered output event stream.
- Exit code.
- Start and end timestamps.
- Duration.
- Truncation metadata if output exceeds limits.

Rendering requirements:

- Preserve output ordering.
- Style stderr distinctly.
- Support collapse and clear actions.
- Show a truncation marker when the output limit is reached.
- Cap both in-memory and persisted output size.

Rich output rendering is out of scope in v1. All output is treated as plain text.

## Safety Model

Because runnable blocks execute local commands, the plugin must be explicit about trust and activation.

V1 safety requirements:

- Execution is disabled by default until explicitly enabled in settings.
- The plugin shows a confirmation or clear trust acknowledgement on first execution.
- Runnable blocks are visible even when execution is disabled, but their controls should indicate why they cannot run.
- Active processes are stopped on plugin unload.
- The settings UI clearly shows each language-to-command mapping.

Trusted folders, per-note trust, and more advanced policy controls are deferred until a later version.

## Settings

V1 settings should include:

- Enable code execution.
- Default execution timeout.
- Maximum stored output size.
- Executor preset mapping by language.
- Auto-clear output before rerun.
- Preserve latest output across note reopen.
- Display preferences for compact or labeled toolbar controls.

## Commands

V1 commands:

- Run current runnable block.
- Stop current runnable block.
- Clear current block output.

Optional if implementation remains straightforward:

- Run all runnable blocks in the current note sequentially.
- Clear all outputs in the current note.

Single-block execution is the primary workflow and should be implemented first.

## Platform Support

V1 supports Obsidian desktop only for execution.

Mobile behavior:

- Recognize runnable blocks visually.
- Do not expose execution controls, or expose them in a disabled state with a clear explanation.

## Error Handling

The plugin should handle the following cleanly:

- Missing executor preset for a language.
- Missing local interpreter binary.
- Process timeout.
- User-initiated stop.
- Temp file creation failure.
- Note edits or view transitions while execution is in progress.

Errors should appear inline in the output area rather than only through transient notices.

## Testing Strategy

### Automated

- Parser tests for runnable fence detection.
- Tests for block identity generation.
- Tests for executor preset resolution.
- Tests for output buffering, truncation, and status transitions.
- Tests for process lifecycle behavior, including stop and timeout.

### Manual

- Live Preview rendering and interaction inside Obsidian.
- Reading view rendering.
- Block behavior during edits.
- Plugin unload and note switch cleanup.
- Missing interpreter and command misconfiguration behavior.

## Implementation Priorities

Recommended build order:

1. Plugin scaffold and settings model.
2. Runnable block parsing.
3. Execution manager with temp-file execution.
4. Output state store.
5. Live Preview toolbar and output rendering.
6. Stop, timeout, and cleanup behavior.
7. Reading view renderer.
8. Commands and settings polish.
9. Tests and manual verification.

## Open Decisions Resolved For V1

- Execution target: local shell only.
- Runnable syntax: explicit custom fenced blocks.
- Output placement: inline below each block.
- Primary experience: Live Preview first.
- Output persistence: plugin state, not note contents.

## Deferred Future Enhancements

- Jupyter kernel integration.
- Rich media outputs.
- Persisting rendered output into the Markdown file.
- Per-folder or per-note trust policies.
- Shared execution sessions across related blocks.
- More advanced block metadata.
- Mobile execution support.
