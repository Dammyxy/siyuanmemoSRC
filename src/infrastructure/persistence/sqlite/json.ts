export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createStableId(prefix: string, parts: Array<string | number | null | undefined>): string {
  const raw = parts
    .map((part) => String(part ?? '').replace(/[^a-zA-Z0-9_.:-]/g, '_'))
    .join(':');
  return `${prefix}:${raw}`;
}
