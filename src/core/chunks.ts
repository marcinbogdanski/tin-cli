export type Chunk = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
};

export const HEURISTIC_CHARS_PER_TOKEN = 4;
export const DEFAULT_CHUNK_TOKENS = 400;
export const DEFAULT_CHUNK_OVERLAP_TOKENS = 80;

export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function chunkByHeuristicTokens(
  content: string,
  chunkTokens: number = DEFAULT_CHUNK_TOKENS,
  overlapTokens: number = DEFAULT_CHUNK_OVERLAP_TOKENS
): Chunk[] {
  const normalized = normalizeLineEndings(content);
  if (normalized.length === 0) {
    return [];
  }

  const size = Math.max(32, Math.floor(chunkTokens) * HEURISTIC_CHARS_PER_TOKEN);
  const overlapChars = Math.max(0, Math.floor(overlapTokens) * HEURISTIC_CHARS_PER_TOKEN);
  const overlap = Math.max(0, Math.min(overlapChars, size - 1));
  const lineStarts = computeLineStartOffsets(normalized);

  const chunks: Chunk[] = [];
  let startOffset = 0;

  while (startOffset < normalized.length) {
    const endOffset = Math.min(normalized.length, startOffset + size);
    const text = normalized.slice(startOffset, endOffset);

    if (text.trim().length > 0) {
      const startLine = lineNumberForOffset(lineStarts, startOffset);
      const endLine = lineNumberForOffset(lineStarts, Math.max(startOffset, endOffset - 1));
      chunks.push({
        index: chunks.length,
        startLine,
        endLine,
        text
      });
    }

    if (endOffset === normalized.length) {
      break;
    }

    startOffset = Math.max(endOffset - overlap, startOffset + 1);
  }

  return chunks;
}

function computeLineStartOffsets(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberForOffset(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  let best = 0;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    const value = lineStarts[mid] ?? 0;
    if (value <= offset) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best + 1;
}
