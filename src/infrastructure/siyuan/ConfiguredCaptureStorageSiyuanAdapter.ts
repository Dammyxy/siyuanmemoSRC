import type {
  ConfiguredCaptureDocInfo,
  ConfiguredCaptureNotebookSummary,
  ConfiguredCaptureStoragePort,
} from '@/application/ports/ConfiguredCaptureStoragePort';
import { AISiyuanAdapter } from '@/infrastructure/siyuan/AISiyuanAdapter';
import { getDocInfo, listNotebooks } from '@/infrastructure/siyuan/api';

export class ConfiguredCaptureStorageSiyuanAdapter extends AISiyuanAdapter implements ConfiguredCaptureStoragePort {
  async listNotebooks(): Promise<ConfiguredCaptureNotebookSummary[]> {
    return listNotebooks();
  }

  async getDocInfo(docId: string): Promise<ConfiguredCaptureDocInfo> {
    const result = await getDocInfo(docId);
    return {
      id: String(result.id || ''),
      box: String(result.box || ''),
      path: String(result.path || ''),
      hpath: String(result.hpath || ''),
      name: String(result.name || result.content || ''),
    };
  }
}
