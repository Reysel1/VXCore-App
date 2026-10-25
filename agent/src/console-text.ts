export function consoleText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\\/g, '/')
    .replace(/;/g, ',')
    .trim();
}
