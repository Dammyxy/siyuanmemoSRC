import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import { renderReviewMarkdown } from '@/core/card/common/application/reviewMarkdownRender';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { getBlockKramdown } from '@/core/siyuan/api';
import { createLogger } from '@/utils/logger';
import {
  resolveLuteRenderer,
  resolveSiyuanMemoPlugin,
} from '@/core/card/concept-definition/application/runtime';

const logger = createLogger('ConceptCardRenderService');

export interface ConceptCardViewModel extends BaseCardViewModel {
  conceptName: string;
  conceptBlockId: string;
  contentHtml: string;
}

interface ConceptCardInput {
  xiuyuanID?: string;
  meta?: {
    xiuyuanID?: string;
  };
}

interface XiuyuanLike {
  fieldMapping?: Record<string, unknown>;
  getMeta?: () => Record<string, unknown>;
  getFaces?: () => Array<{ questionBlockId?: string }>;
}

interface ConceptContentRow extends Record<string, unknown> {
  content?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class ConceptCardRenderService extends BaseCardRenderService {
  async prepareViewModel(blockId: string, card?: ConceptCardInput): Promise<ConceptCardViewModel> {
    logger.debug('[ConceptCardRenderService] prepareViewModel called with:', {
      blockId,
      hasCard: !!card,
      xiuyuanID: card?.xiuyuanID,
      metaXiuyuanID: card?.meta?.xiuyuanID,
    });

    const xiuyuanID = card?.xiuyuanID || card?.meta?.xiuyuanID;
    if (!xiuyuanID) {
      logger.error('[ConceptCardRenderService] No xiuyuanID found in card:', card);
      throw new Error('No xiuyuanID found in card');
    }

    const xiuyuan = await this.getXiuyuan(xiuyuanID);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanID}`);
    }

    const conceptBlockId = this.resolveConceptBlockId(xiuyuan);
    if (!conceptBlockId) {
      throw new Error('Missing concept block ID in field mapping');
    }

    const conceptName = await this.getConceptName(conceptBlockId);
    const { kramdown: contentKramdown } = await getBlockKramdown(conceptBlockId);
    if (!contentKramdown) {
      throw new Error(`Concept block has no content: ${conceptBlockId}`);
    }

    const contentHtml = this.renderMarkdown(contentKramdown);
    const breadcrumbs = await this.loadBreadcrumbs(conceptBlockId);

    return {
      blockId: conceptBlockId,
      conceptName,
      conceptBlockId,
      contentHtml,
      breadcrumbs,
      dependencyBlockIds: Array.from(new Set([
        conceptBlockId,
        ...breadcrumbs.map((item) => item.id),
      ].filter((value): value is string => typeof value === 'string' && value.length > 0))),
    };
  }

  private resolveConceptBlockId(xiuyuan: XiuyuanLike): string | null {
    const directMapping = isRecord(xiuyuan.fieldMapping) ? xiuyuan.fieldMapping : null;
    const directConcept = directMapping?.concept;
    if (typeof directConcept === 'string' && directConcept.length > 0) {
      return directConcept;
    }

    if (typeof xiuyuan.getMeta === 'function') {
      const meta = xiuyuan.getMeta();
      if (isRecord(meta.fieldMapping)) {
        const concept = meta.fieldMapping.concept;
        if (typeof concept === 'string' && concept.length > 0) {
          return concept;
        }
      }
    }

    if (typeof xiuyuan.getFaces === 'function') {
      const firstFace = xiuyuan.getFaces()[0];
      if (firstFace && typeof firstFace.questionBlockId === 'string' && firstFace.questionBlockId.length > 0) {
        return firstFace.questionBlockId;
      }
    }

    return null;
  }

  private async getXiuyuan(xiuyuanID: string): Promise<XiuyuanLike | null> {
    const plugin = resolveSiyuanMemoPlugin();
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const context = await plugin.getContext?.();
    const xiuyuanAppService = await context?.getXiuyuanApplicationService?.();
    if (!xiuyuanAppService || typeof xiuyuanAppService.getXiuyuan !== 'function') {
      throw new Error('XiuyuanApplicationService not available');
    }

    const rawResult = await xiuyuanAppService.getXiuyuan({ xiuyuanId: xiuyuanID });
    if (!isRecord(rawResult)) {
      return null;
    }

    const xiuyuan = rawResult.xiuyuan;
    return isRecord(xiuyuan) ? (xiuyuan as XiuyuanLike) : null;
  }

  private async getConceptName(blockId: string): Promise<string> {
    const { sql } = await import('@/core/siyuan/api');
    const result = await sql<ConceptContentRow>(`
      SELECT content
      FROM blocks
      WHERE id = '${blockId}'
    `);

    if (!result || result.length === 0) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const content = result[0]?.content;
    return typeof content === 'string' && content.length > 0 ? content : '未命名概念';
  }

  private renderMarkdown(kramdown: string): string {
    const rendered = renderReviewMarkdown(kramdown);
    if (rendered.html) {
      return rendered.html;
    }

    const lute = resolveLuteRenderer();
    if (!lute) {
      throw new Error('Lute not available');
    }
    return lute.Md2BlockDOM(kramdown);
  }
}
