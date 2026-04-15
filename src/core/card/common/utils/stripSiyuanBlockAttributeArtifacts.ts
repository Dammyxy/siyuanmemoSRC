const ATTRIBUTE_ONLY_LINE_PATTERN = /^(?:[*+-]\s*)?\{:\s*[^}]*\}\s*$/u;
const TRAILING_ATTRIBUTE_TAIL_PATTERN = /\s+\{:\s*[^}]*\}\s*$/u;

export function stripSiyuanBlockAttributeArtifacts(kramdown: string): string {
  if (!kramdown) {
    return '';
  }

  return kramdown
    .split(/\r?\n/u)
    .filter((line) => !ATTRIBUTE_ONLY_LINE_PATTERN.test(line.trim()))
    .map((line) => line.replace(TRAILING_ATTRIBUTE_TAIL_PATTERN, ''))
    .join('\n')
    .trim();
}
