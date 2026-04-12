import type {
  ProgressiveExcerptCreationResult,
  ProgressiveExcerptInput,
} from '@/application/services/ProgressiveReadingService';
import { ProgressiveReadingService } from '@/application/services/ProgressiveReadingService';

export class SelectionExcerptService {
  constructor(private readonly progressiveService: ProgressiveReadingService) {}

  async createFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptCreationResult> {
    return this.progressiveService.createExcerptFromSelection(input);
  }

  async updateSourceBlockDom(blockId: string, dom: string): Promise<void> {
    await this.progressiveService.updateSourceBlockDom(blockId, dom);
  }
}
