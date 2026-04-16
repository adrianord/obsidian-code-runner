# Code Runner

Lightweight notebook-style code execution for Obsidian Live Preview.

This plugin lets you mark a note as runnable, execute fenced code blocks inline, and view output directly under each block.

## What It Does

- Runs code blocks directly inside Obsidian
- Shows output inline below the block
- Supports standard fenced code blocks like `python`, `js`, `bash`, and any other language you configure
- Works with Live Preview and Reading view
- Lets you configure runners visually instead of editing raw JSON
- Supports extra `PATH` entries for tools installed outside Obsidian's default environment

## Current Defaults

- Rendered code uses `CodeMirror`
- Default dark theme: `GitHub Dark`
- Default light theme: `GitHub Light`
- Built-in runner presets:
  - `js` -> `node {{file}}`
  - `python` -> `python3 {{file}}`
  - `bash, sh` -> `/bin/bash {{file}}`

## Desktop Only

This plugin is desktop-only. It depends on local process execution and does not support Obsidian mobile.

## How To Use

### 1. Enable a Note for Code Runner

Add this frontmatter to the note:

```yaml
---
code-runner: true
---
```

The plugin accepts both keys:

- `code-runner`
- `coderunner`

It also accepts boolean and quoted string values:

```yaml
code-runner: true
code-runner: "true"
code-runner: 'true'
coderunner: true
coderunner: "true"
coderunner: 'true'
```

### 2. Add a Standard Fenced Code Block

Example:

````md
```python
print("hello, world")
```
````

If the language is configured in the plugin settings, the block becomes runnable.

### 3. Run the Block

Use the inline controls above the block:

- `Run`
- `Stop`
- `Clear`
- collapse output

Output appears directly below the block.

## Runner Configuration

Open the plugin settings and use the `Runners` section.

Each runner row has:

- `Languages`: comma-separated fence names
- `Command`: command template to execute

Use `{{file}}` where the temporary snippet file should be inserted.

Examples:

- Languages: `js, javascript`
  Command: `node {{file}}`
- Languages: `ts, typescript`
  Command: `npx ts-node {{file}}`
- Languages: `go`
  Command: `go run {{file}}`

You can map multiple languages to the same command in one row.

## PATH Configuration

Some tools work in your terminal but not inside Obsidian because the app may not inherit the same shell `PATH`.

Use `Environment PATH` in the plugin settings to add extra directories. Add one directory per line.

Examples:

- `/usr/local/bin`
- `/opt/homebrew/bin`
- a custom toolchain directory

These entries are prepended to the process `PATH` when running code blocks.

## Commands

The plugin also registers command palette actions:

- `Run current runnable block`
- `Stop current runnable block`
- `Clear current runnable block output`

These work when your cursor is inside a runnable block.

## Rendered Code Themes

When `Rendered code renderer` is set to `CodeMirror`, the plugin can use separate themes for dark mode and light mode.

Dark themes:

- `One Dark`
- `Dracula`
- `Nord`
- `Tokyo Night`
- `GitHub Dark`

Light themes:

- `GitHub Light`
- `Quiet Light`
- `Xcode`

The plugin automatically switches between the selected dark and light theme based on Obsidian's current mode.

## Development

Install dependencies:

```bash
npm install
```

Build once:

```bash
npm run build
```

Watch build:

```bash
npm run dev
```

## Notes

- A block is only treated as runnable when the note has Code Runner frontmatter enabled.
- If a language is added in settings, it becomes runnable without reloading the plugin.
- If a command cannot be found, check the runner command and your `Environment PATH` settings.
