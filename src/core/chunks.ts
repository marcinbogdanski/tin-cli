export type Chunk = {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
};

export function chunkByLines(content: string, maxLines: number = 80, overlapLines: number = 20): Chunk[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const endExclusive = Math.min(lines.length, start + maxLines);
    const chunkLines = lines.slice(start, endExclusive);
    const text = chunkLines.join("\n").trim();

    if (text.length > 0) {
      chunks.push({
        index: chunks.length,
        startLine: start + 1,
        endLine: endExclusive,
        text
      });
    }

    if (endExclusive === lines.length) {
      break;
    }

    start = Math.max(endExclusive - overlapLines, start + 1);
  }

  return chunks;
}
