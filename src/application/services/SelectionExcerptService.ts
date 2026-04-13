import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type {
  ProgressiveExcerptCreationResult,
  ProgressiveExcerptInput,
  ProgressiveExcerptSourceMaterializationResult,
} from '@/application/services/ProgressiveReadingService';
import { ProgressiveReadingService } from '@/application/services/ProgressiveReadingService';

export class SelectionExcerptService {
  constructor(private readonly progressiveService: ProgressiveReadingService) {}

  async materializeExcerptSource(
    snapshot: ProgressiveExcerptSelectionSnapshot,
  ): Promise<ProgressiveExcerptSourceMaterializationResult> {
    return this.progressiveService.materializeExcerptSource(snapshot);
  }

  async createFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    return this.progressiveService.createExcerptFromSelection(input);
  }

  async updateSourceBlockDom(blockId: string, dom: string): Promise<void> {
    await this.progressiveService.updateSourceBlockDom(blockId, dom);
  }
}
