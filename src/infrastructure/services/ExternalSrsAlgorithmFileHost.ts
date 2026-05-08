import type { ExternalSrsAlgorithmFileHost } from '@/application/services/external-srs/ExternalSrsAlgorithmRuntime';
import { getFile, getPluginDataPath } from '@/infrastructure/siyuan/api';

interface ReadDirEntry {
  name: string;
  isDir: boolean;
}

interface FileApiEnvelope {
  code?: number;
  data?: unknown;
}

function normalizeRelativePath(value: string): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

function entryIsDir(entry: Record<string, unknown>): boolean {
  return entry.isDir === true
    || entry.isdir === true
    || entry.isDir === 1
    || entry.isdir === 1
    || entry.type === 'dir'
    || entry.type === 'directory';
}

function normalizeReadDirEntries(value: unknown): ReadDirEntry[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? (Array.isArray((value as { files?: unknown }).files)
        ? (value as { files: unknown[] }).files
        : Array.isArray((value as { entries?: unknown }).entries)
          ? (value as { entries: unknown[] }).entries
          : [])
      : [];
  return source
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      name: String(entry.name || '').trim(),
      isDir: entryIsDir(entry),
    }))
    .filter((entry) => Boolean(entry.name));
}

export class SiyuanExternalSrsAlgorithmFileHost implements ExternalSrsAlgorithmFileHost {
  constructor(private readonly pluginName: string) {}

  async listManifestFiles(algorithmDirectory: string): Promise<string[]> {
    const directory = normalizeRelativePath(algorithmDirectory);
    if (!directory) {
      return [];
    }
    const entries = await this.readDir(directory);
    const manifestFiles: string[] = [];
    if (entries.some((entry) => entry.name === 'manifest.json' && !entry.isDir)) {
      manifestFiles.push(`${directory}/manifest.json`);
    }
    for (const entry of entries) {
      if (!entry.isDir) {
        continue;
      }
      const manifestPath = `${directory}/${entry.name}/manifest.json`;
      if (await this.fileExists(manifestPath)) {
        manifestFiles.push(manifestPath);
      }
    }
    return Array.from(new Set(manifestFiles)).sort();
  }

  async readText(filePath: string): Promise<string | null> {
    const normalized = normalizeRelativePath(filePath);
    if (!normalized) {
      return null;
    }
    return getFile(this.resolvePluginDataPath(normalized));
  }

  async fileExists(filePath: string): Promise<boolean> {
    return (await this.readText(filePath)) !== null;
  }

  resolveSibling(manifestPath: string, relativePath: string): string {
    const manifestParts = normalizeRelativePath(manifestPath).split('/');
    manifestParts.pop();
    return normalizeRelativePath([...manifestParts, normalizeRelativePath(relativePath)].join('/'));
  }

  private async readDir(directory: string): Promise<ReadDirEntry[]> {
    try {
      const response = await fetch('/api/file/readDir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.resolvePluginDataPath(directory) }),
      });
      if (!response.ok) {
        return [];
      }
      const envelope = await response.json() as FileApiEnvelope;
      if (envelope.code !== 0) {
        return [];
      }
      return normalizeReadDirEntries(envelope.data);
    } catch {
      return [];
    }
  }

  private resolvePluginDataPath(relativePath: string): string {
    return `${getPluginDataPath(this.pluginName)}/${normalizeRelativePath(relativePath)}`;
  }
}
