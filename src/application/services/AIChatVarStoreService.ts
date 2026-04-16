import type { AIChatVarEntry } from '@/types/ai';

function createVarId(): string {
  return `var-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function previewValue(value: unknown, limit = 240): string {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value || '');
    }
  }
  const normalized = text.trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

export class AIChatVarStoreService {
  private readonly vars = new Map<string, AIChatVarEntry>();

  list(): AIChatVarEntry[] {
    return Array.from(this.vars.values()).map((entry) => ({ ...entry }));
  }

  read(idOrName: string): AIChatVarEntry | null {
    const normalized = String(idOrName || '').trim();
    if (!normalized) {
      return null;
    }
    const direct = this.vars.get(normalized);
    if (direct) {
      return { ...direct };
    }
    const byName = this.list().find((entry) => entry.name === normalized);
    return byName ? { ...byName } : null;
  }

  write(name: string, value: unknown, description = ''): AIChatVarEntry {
    const normalizedName = String(name || '').trim() || `结果 ${this.vars.size + 1}`;
    const existing = this.list().find((entry) => entry.name === normalizedName);
    const now = Date.now();
    const entry: AIChatVarEntry = {
      id: existing?.id || createVarId(),
      name: normalizedName,
      description: String(description || '').trim(),
      value,
      preview: previewValue(value),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.vars.set(entry.id, entry);
    return { ...entry };
  }

  replace(entries: AIChatVarEntry[]): void {
    this.vars.clear();
    for (const entry of entries || []) {
      if (!entry?.id) {
        continue;
      }
      this.vars.set(entry.id, { ...entry });
    }
  }

  clear(): void {
    this.vars.clear();
  }
}
