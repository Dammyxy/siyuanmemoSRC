/**
 * CardTypeDetectionService
 *
 * Collects syntax/structure signals for Topic vs Item classification and
 * delegates the final decision to a pure policy.
 */

import { sql } from '@/core/siyuan/api';
import { batchQueryWithConcurrency } from '@/utils/batchQuery';
import { createLogger } from '@/utils/logger';
import {
  detectAnswerSyntaxReasons,
  detectNativeFlashcardKindsFromSyntaxReasons,
  detectStructureFlashcardKinds,
  type AnswerSyntaxReason,
  type CardType,
  type NativeFlashcardKind,
} from '@/core/card-type/detectionRules';
import { resolveTopicItemCardType, type TopicItemDetectionConfig } from '@/core/card-type/topicItemPolicy';
import { DEFAULT_SETTINGS } from '@/types/settings';

const logger = createLogger('CardTypeDetectionService');

type BlockRow = {
  type?: string;
  markdown?: string;
  content?: string;
};

export interface CardTypeDetectionInput {
  blockId: string;
  blockType?: string | null;
  markdown?: string | null;
  content?: string | null;
  hasListChildren?: boolean;
  hasAnyChildren?: boolean;
}

export interface CardTypeDetectionResult {
  cardType: CardType;
  matchedFlashcardKinds: NativeFlashcardKind[];
  matchedSyntaxReasons: AnswerSyntaxReason[];
}

export interface CardTypeDetectionServiceOptions {
  resolveFlashcardConfig?: () => Partial<TopicItemDetectionConfig> | undefined;
}

export type { CardType } from '@/core/card-type/detectionRules';

export class CardTypeDetectionService {
  constructor(private readonly options: CardTypeDetectionServiceOptions = {}) {}

  async detectCardType(blockId: string): Promise<CardType> {
    const result = await this.detectCardTypeDetails({ blockId });
    return result.cardType;
  }

  async detectCardTypeDetails(input: CardTypeDetectionInput): Promise<CardTypeDetectionResult> {
    try {
      const row = await this.loadBlockRow(input);
      if (!row) {
        logger.debug(`Block ${input.blockId}: topic (block not found)`);
        return {
          cardType: 'topic',
          matchedFlashcardKinds: [],
          matchedSyntaxReasons: [],
        };
      }

      const blockType = typeof input.blockType === 'string' ? input.blockType : String(row.type || '');
      const markdown = typeof input.markdown === 'string' ? input.markdown : String(row.markdown || '');
      const content = typeof input.content === 'string' ? input.content : String(row.content || '');
      const hasListChildren = typeof input.hasListChildren === 'boolean'
        ? input.hasListChildren
        : blockType === 'i'
          ? await this.checkHasChildren(input.blockId, ['i', 'l'])
          : false;
      const hasAnyChildren = typeof input.hasAnyChildren === 'boolean'
        ? input.hasAnyChildren
        : blockType === 's'
          ? await this.checkHasChildren(input.blockId)
          : false;

      const matchedSyntaxReasons = detectAnswerSyntaxReasons(markdown, content, 'extended');
      const matchedFlashcardKinds = Array.from(new Set([
        ...detectNativeFlashcardKindsFromSyntaxReasons(matchedSyntaxReasons),
        ...detectStructureFlashcardKinds({
          blockType,
          hasListChildren,
          hasAnyChildren,
        }),
      ]));

      const result = resolveTopicItemCardType({
        blockType,
        syntaxReasons: matchedSyntaxReasons,
        matchedFlashcardKinds,
        flashcardConfig: this.resolveFlashcardConfig(),
      });

      logger.debug(`Block ${input.blockId}: ${result.cardType}`, {
        blockType,
        matchedFlashcardKinds,
        matchedSyntaxReasons,
      });

      return {
        cardType: result.cardType,
        matchedFlashcardKinds: result.matchedFlashcardKinds,
        matchedSyntaxReasons,
      };
    } catch (err) {
      logger.error(`Detection error for ${input.blockId}:`, err);
      return {
        cardType: 'topic',
        matchedFlashcardKinds: [],
        matchedSyntaxReasons: [],
      };
    }
  }

  async batchDetectCardTypes(blockIds: string[]): Promise<Map<string, CardType>> {
    const typeMap = new Map<string, CardType>();

    const results = await batchQueryWithConcurrency(
      blockIds,
      { batchSize: 100, maxConcurrency: 3 },
      async (batch) => {
        const rows = await Promise.all(
          batch.map(async (blockId) => ({
            blockId,
            type: await this.detectCardType(blockId),
          }))
        );
        return rows;
      }
    );

    for (const { blockId, type } of results) {
      typeMap.set(blockId, type);
    }

    logger.debug(`Detected ${typeMap.size} card types`);
    return typeMap;
  }

  private resolveFlashcardConfig(): TopicItemDetectionConfig {
    const defaults = DEFAULT_SETTINGS.quickCard.flashcard;
    const resolved = this.options.resolveFlashcardConfig?.();
    return {
      mark: resolved?.mark ?? defaults.mark,
      list: resolved?.list ?? defaults.list,
      heading: resolved?.heading ?? defaults.heading,
      superBlock: resolved?.superBlock ?? defaults.superBlock,
    };
  }

  private async loadBlockRow(input: CardTypeDetectionInput): Promise<BlockRow | null> {
    if (
      typeof input.blockType === 'string'
      && input.markdown !== undefined
      && input.content !== undefined
    ) {
      return {
        type: input.blockType,
        markdown: input.markdown,
        content: input.content,
      };
    }

    const rows = await sql(`
      SELECT type, markdown, content FROM blocks
      WHERE id = '${input.blockId}'
      LIMIT 1
    `) as BlockRow[];

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  private async checkHasChildren(blockId: string, childTypes?: string[]): Promise<boolean> {
    try {
      let typeFilter = '';
      if (childTypes && childTypes.length > 0) {
        const typeList = childTypes.map((t) => `'${t}'`).join(', ');
        typeFilter = `AND type IN (${typeList})`;
      }

      const childBlocks = await sql(`
        SELECT id, type
        FROM blocks
        WHERE parent_id = '${blockId}'
        AND type != 'd'
        ${typeFilter}
        LIMIT 1
      `);

      return Boolean(childBlocks && childBlocks.length > 0);
    } catch (err) {
      logger.error(`Failed to check children for ${blockId}:`, err);
      return false;
    }
  }
}
