import type { CreateListTemplateCardsCommand } from '@/application/commands/xiuyuan/CreateListTemplateCardsCommand';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';

type AIFlashcardXiuyuanService = Pick<XiuyuanApplicationService, 'createFromBlocks' | 'createListTemplateCards'>;

export interface AIFlashcardXiuyuanWriteRuntimeDeps {
  getXiuyuanApplicationService: () => Promise<AIFlashcardXiuyuanService>;
}

export class AIFlashcardXiuyuanWriteRuntime {
  constructor(private readonly deps: AIFlashcardXiuyuanWriteRuntimeDeps) {}

  async getService(): Promise<AIFlashcardXiuyuanService> {
    return this.deps.getXiuyuanApplicationService();
  }

  async createFromBlocks(command: CreateXiuyuanFromBlocksCommand) {
    const service = await this.getService();
    return service.createFromBlocks(command);
  }

  async createListTemplateCards(command: CreateListTemplateCardsCommand) {
    const service = await this.getService();
    return service.createListTemplateCards(command);
  }
}
