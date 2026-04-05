import type {
  ProgressiveExcerptInput,
  ProgressiveExcerptResult,
} from '@/application/services/ProgressiveReadingService';
import { ProgressiveReadingService } from '@/application/services/ProgressiveReadingService';

export class SelectionExcerptService {
  constructor(private readonly progressiveService: ProgressiveReadingService) {}

  async createFromSelection(input: ProgressiveExcerptInput): Promise<ProgressiveExcerptResult> {
    return this.progressiveService.createExcerptFromSelection(input);
  }
}
