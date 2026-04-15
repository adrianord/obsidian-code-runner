import type { RunnableBlock } from "./types";

const STANDARD_FENCE = /^```([A-Za-z0-9_+#.-]+)\s*$/;
const FRONTMATTER_BOUNDARY = /^---\s*$/;

export function parseCodeFence(line: string): string | null {
  const match = line.trim().match(STANDARD_FENCE);
  return match?.[1] ?? null;
}

export function hasCodeRunnerFrontmatter(text: string): boolean {
  const lines = text.split("\n");
  if (!FRONTMATTER_BOUNDARY.test(lines[0] ?? "")) {
    return false;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (FRONTMATTER_BOUNDARY.test(line)) {
      return false;
    }

    const normalized = line.trim().toLowerCase();
    if (normalized === "code-runner: true" || normalized === "coderunner: true") {
      return true;
    }
  }

  return false;
}

export function findRunnableBlocks(text: string, sourcePath: string): RunnableBlock[] {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let cursor = 0;

  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }

  const blocks: RunnableBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lang = parseCodeFence(lines[index] ?? "");
    if (!lang) {
      continue;
    }

    let endLine = index + 1;
    while (endLine < lines.length && !(lines[endLine] ?? "").trim().startsWith("```")) {
      endLine += 1;
    }

    const codeLines = lines.slice(index + 1, Math.min(endLine, lines.length));
    const code = codeLines.join("\n");
    const from = offsets[index] ?? 0;
    const closingLineIndex = Math.min(endLine, lines.length - 1);
    const to = (offsets[closingLineIndex] ?? cursor) + (lines[closingLineIndex]?.length ?? 0);

    blocks.push({
      id: createBlockId(sourcePath, index + 1, code),
      sourcePath,
      lang,
      code,
      startLine: index,
      endLine,
      from,
      to
    });

    index = endLine;
  }

  return blocks;
}

export function findBlockAtLine(text: string, sourcePath: string, line: number): RunnableBlock | null {
  return findRunnableBlocks(text, sourcePath).find((block) => line >= block.startLine && line <= block.endLine) ?? null;
}

export function getFenceLanguageFromLine(text: string, lineNumber: number): string | null {
  const line = text.split("\n")[lineNumber] ?? "";
  return parseCodeFence(line);
}

function createBlockId(sourcePath: string, startLine: number, code: string): string {
  let hash = 5381;
  const input = `${sourcePath}:${startLine}:${code}`;

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }

  return `${sourcePath}:${startLine}:${Math.abs(hash >>> 0).toString(36)}`;
}
