import { Result, err, ok } from '@/types/result';
import { CreateListTemplateCardsCommand } from '../../commands/xiuyuan/CreateListTemplateCardsCommand';
import { isErr } from '@/types/result';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import { parseCueAndAnswer } from '@/core/xiuyuan/parseCueAndAnswer';
import type { CdfDirectPathSegment } from '@/core/card/common/application/cdfDirectScene';
import { normalizeCdfDirectLabel } from '@/core/card/common/application/cdfDirectScene';
import { createLogger } from '@/utils/logger';
import { finalizeXiuyuanCreation } from './shared/FinalizeXiuyuanCreation';

const logger = createLogger('CreateListTemplateCardsUseCase');

type ListTemplateMode = 'split-v2' | 'summary-v1';

type ChildContentRow = {
  id: string;
  parent_id?: string;
  content?: string;
};

type ChildListItemRow = {
  id: string;
  parent_id?: string;
};

type BlockIdRow = {
  id?: string;
};

type BlockTypeRow = {
  type?: string;
};

type ListTemplateChildData = {
  listItemId: string;
  paragraphId: string;
  cue: string;
  answer: string;
  content: string;
  index: number;
  source?: string;
  directPath?: CdfDirectPathSegment[];
};

export interface ListTemplateCardsCreationPayload {
  mode: ListTemplateMode;
  parentBlockId: string;
  parentParagraphId: string;
  totalChildren: number;
  created: Array<{
    childBlockId: string;
    xiuyuanId: string;
    cardIds: string[];
  }>;
  skippedChildBlockIds: string[];
}

function quoteSqlValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function getExistingXiuyuanId(attrs: Record<string, string> | undefined): string | undefined {
  if (!attrs) {
    return undefined;
  }
  return attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
}

function buildListMetaBase(command: CreateListTemplateCardsCommand): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    listKind: command.listKind || 'default',
  };

  if (command.conceptBlockId) {
    meta.conceptBlockId = command.conceptBlockId;
  }

  return meta;
}

export class CreateListTemplateCardsUseCase {
  private readonly siyuanApi: XiuyuanSiyuanPort;
  private readonly eventBus: EventBus;

  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository,
    private readonly templateRegistry: Map<string, ICardTemplate>,
    ports: { siyuanApi: XiuyuanSiyuanPort; eventBus?: EventBus }
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.eventBus = ports.eventBus ?? new EventBus(false);
  }

  async execute(command: CreateListTemplateCardsCommand): Promise<Result<ListTemplateCardsCreationPayload>> {
    try {
      const mode: ListTemplateMode = command.creationMode || 'split-v2';

      const parentAttrs = await this.siyuanApi.getBlockAttrs(command.parentBlockId);
      if (parentAttrs && (parentAttrs['custom-xiuyuan-id'] || parentAttrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = parentAttrs['custom-xiuyuan-id'] || parentAttrs['custom-fsrs-xiuyuan-id'];
        logger.info(`Parent block ${command.parentBlockId} already has legacy Xiuyuan: ${existingXiuyuanId}`);
        return err(new Error('Legacy list-template card already exists on parent block; creation aborted'));
      }

      const template = this.templateRegistry.get(command.templateId);
      if (!template) {
        return err(new Error(`Template not found: ${command.templateId}`));
      }
      if (!template.cardRules || template.cardRules.length === 0) {
        return err(new Error('Template has no card rules'));
      }

      if (!command.childBlockIds || command.childBlockIds.length < 2) {
        return err(new Error(`At least 2 child list items are required (current: ${command.childBlockIds?.length || 0})`));
      }

      const safeParentBlockId = command.parentBlockId.replace(/'/g, "''");
      const paragraphResult = await this.siyuanApi.sql<BlockIdRow>(`
        SELECT id
        FROM blocks
        WHERE parent_id = '${safeParentBlockId}'
          AND type = 'p'
        LIMIT 1
      `);
      if (!paragraphResult || paragraphResult.length === 0 || typeof paragraphResult[0]?.id !== 'string') {
        return err(new Error('Parent list item has no paragraph block'));
      }
      const parentParagraphId = paragraphResult[0].id;

      const inClause = command.childBlockIds.map(quoteSqlValue).join(',');
      const childParagraphRowsResult = await this.siyuanApi.sql<ChildContentRow>(`
        SELECT id, parent_id, content
        FROM blocks
        WHERE parent_id IN (${inClause})
          AND type = 'p'
        ORDER BY parent_id ASC, sort ASC, id ASC
      `);
      if (!childParagraphRowsResult || childParagraphRowsResult.length === 0) {
        return err(new Error('Failed to fetch child paragraph content'));
      }

      const childParagraphByListItemId = new Map<string, ChildContentRow>();
      for (const row of childParagraphRowsResult) {
        if (typeof row.parent_id !== 'string' || typeof row.id !== 'string') {
          continue;
        }
        if (!childParagraphByListItemId.has(row.parent_id)) {
          childParagraphByListItemId.set(row.parent_id, row);
        }
      }

      const childrenData: ListTemplateChildData[] = [];

      for (let index = 0; index < command.childBlockIds.length; index++) {
        const childListItemId = command.childBlockIds[index];
        const row = childParagraphByListItemId.get(childListItemId);
        if (!row) {
          return err(new Error(`Missing direct paragraph for child list item: ${childListItemId}`));
        }

        const paragraphContent = typeof row.content === 'string' ? row.content : '';
        const parsed = parseCueAndAnswer(paragraphContent);
        childrenData.push({
          listItemId: childListItemId,
          paragraphId: row.id,
          cue: parsed.cue,
          answer: parsed.answer,
          content: paragraphContent,
          index,
        });
      }

      const templateIdResult = TemplateId.create(command.templateId);
      if (isErr(templateIdResult)) {
        return err(this.toError(templateIdResult.error, 'Invalid template ID'));
      }

      const priorityResult = Priority.create(command.priority || 50);
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      if (mode === 'summary-v1') {
        return this.createSummaryModePayload({
          command,
          templateId: templateIdResult.value,
          priority,
          parentParagraphId,
          childrenData,
        });
      }

      return this.createSplitModePayload({
        command,
        templateId: templateIdResult.value,
        priority,
        parentParagraphId,
        childrenData,
      });
    } catch (error) {
      logger.error('Failed:', error);
      return err(this.toError(error, 'CreateListTemplateCardsUseCase failed'));
    }
  }

  private async createSplitModePayload(params: {
    command: CreateListTemplateCardsCommand;
    templateId: TemplateId;
    priority: Priority;
    parentParagraphId: string;
    childrenData: ListTemplateChildData[];
  }): Promise<Result<ListTemplateCardsCreationPayload>> {
    const { command, templateId, priority, parentParagraphId, childrenData } = params;
    const groupId = `lt_${command.parentBlockId}`;
    const created: ListTemplateCardsCreationPayload['created'] = [];
    const skippedChildBlockIds: string[] = [];
    const listMetaBase = buildListMetaBase(command);
    const sharedDirectPath = await this.buildSharedDirectPath(command, parentParagraphId);

    for (const childData of childrenData) {
      const [paragraphAttrs, listItemAttrs] = await Promise.all([
        this.siyuanApi.getBlockAttrs(childData.paragraphId),
        this.siyuanApi.getBlockAttrs(childData.listItemId),
      ]);
      const existingChildXiuyuanId = getExistingXiuyuanId(paragraphAttrs) || getExistingXiuyuanId(listItemAttrs);
      if (existingChildXiuyuanId) {
        skippedChildBlockIds.push(childData.listItemId);
        continue;
      }

      const xiuyuanIdResult = XiuyuanId.create(`xy_${childData.paragraphId}`);
      if (isErr(xiuyuanIdResult)) {
        return err(this.toError(xiuyuanIdResult.error, 'Invalid Xiuyuan ID'));
      }

      const blockIdResults = [childData.paragraphId, parentParagraphId].map((id) => BlockId.create(id));
      const blockIds: BlockId[] = [];
      for (const blockIdResult of blockIdResults) {
        if (isErr(blockIdResult)) {
          return err(this.toError(blockIdResult.error, 'Invalid block ID'));
        }
        blockIds.push(blockIdResult.value);
      }

      const faceResult = CardFace.create({
        question: parentParagraphId,
        answer: childData.content,
        questionBlockId: parentParagraphId,
        answerBlockId: childData.paragraphId,
      });
      if (isErr(faceResult)) {
        return err(this.toError(faceResult.error, 'Failed to create list-template face'));
      }

      const xiuyuanResult = Xiuyuan.create({
        id: xiuyuanIdResult.value,
        blockIDs: blockIds,
        templateID: templateId,
        faces: [faceResult.value],
        priority,
        meta: {
          schedulerType: 'fsrs-v6',
          ...(command.cardType ? { cardType: command.cardType } : {}),
          listTemplate: {
            mode: 'split-v2',
            groupId,
            parentBlockId: command.parentBlockId,
            parentParagraphId,
            currentIndex: childData.index,
            childrenData: childrenData.map((child) => ({
              id: child.paragraphId,
              cue: child.cue,
              answer: child.answer,
              index: child.index,
              source: child.content,
              ...(sharedDirectPath ? { directPath: sharedDirectPath } : {}),
            })),
            ...listMetaBase,
          },
        },
      });
      if (isErr(xiuyuanResult)) {
        return err(this.toError(xiuyuanResult.error, 'Failed to create Xiuyuan aggregate'));
      }

      const xiuyuan = xiuyuanResult.value;
      const creationResult = await finalizeXiuyuanCreation({
        xiuyuan,
        xiuyuanRepository: this.xiuyuanRepository,
        eventBus: this.eventBus,
        logger,
        siyuanApi: this.siyuanApi,
        riff: {
            deckId: command.deckId,
            blockIds: [childData.paragraphId],
            source: 'list-template-creation',
            context: {
              blockId: childData.paragraphId,
              representativeBlockId: childData.paragraphId,
              parentBlockId: command.parentBlockId,
              parentParagraphId,
              currentIndex: childData.index,
            mode: 'split-v2',
          },
        },
      });

      if (isErr(creationResult)) {
        return err(this.toError(creationResult.error, 'Failed to finalize split list-template Xiuyuan'));
      }

      created.push({
        childBlockId: childData.listItemId,
        xiuyuanId: creationResult.value.xiuyuan.id,
        cardIds: creationResult.value.cards.map((card) => card.id),
      });
    }

    return ok({
      mode: 'split-v2',
      parentBlockId: command.parentBlockId,
      parentParagraphId,
      totalChildren: childrenData.length,
      created,
      skippedChildBlockIds,
    });
  }

  private async createSummaryModePayload(params: {
    command: CreateListTemplateCardsCommand;
    templateId: TemplateId;
    priority: Priority;
    parentParagraphId: string;
    childrenData: ListTemplateChildData[];
  }): Promise<Result<ListTemplateCardsCreationPayload>> {
    const { command, templateId, priority, parentParagraphId, childrenData } = params;
    const listMetaBase = buildListMetaBase(command);
    const sharedDirectPath = await this.buildSharedDirectPath(command, parentParagraphId);

    const skippedChildBlockIds: string[] = [];
    let representative: ListTemplateChildData | null = null;

    for (const child of childrenData) {
      const [paragraphAttrs, listItemAttrs] = await Promise.all([
        this.siyuanApi.getBlockAttrs(child.paragraphId),
        this.siyuanApi.getBlockAttrs(child.listItemId),
      ]);
      const existingXiuyuanId = getExistingXiuyuanId(paragraphAttrs) || getExistingXiuyuanId(listItemAttrs);
      if (existingXiuyuanId) {
        skippedChildBlockIds.push(child.listItemId);
        continue;
      }
      if (!representative) {
        representative = child;
      }
    }

    if (!representative) {
      return ok({
        mode: 'summary-v1',
        parentBlockId: command.parentBlockId,
        parentParagraphId,
        totalChildren: childrenData.length,
        created: [],
        skippedChildBlockIds: [...command.childBlockIds],
      });
    }

    const summaryCue = childrenData
      .map((child) => child.cue.trim())
      .filter((cue) => cue.length > 0)
      .join('，');

    const summaryAnswer = childrenData
      .map((child) => child.answer.trim())
      .filter((answer) => answer.length > 0)
      .join('\n');

    const sharedParentRows = await this.siyuanApi.sql<ChildListItemRow>(`
      SELECT id, parent_id
      FROM blocks
      WHERE id IN (${command.childBlockIds.map(quoteSqlValue).join(',')})
        AND type = 'i'
    `);
    const sharedParents = new Set(
      sharedParentRows
        .map((row) => row.parent_id)
        .filter((parentId): parentId is string => typeof parentId === 'string' && parentId.length > 0)
    );

    let summaryAnswerBlockId: string | null = null;
    if (sharedParents.size === 1) {
      const onlySharedParentId = Array.from(sharedParents)[0];
      const safeOnlySharedParentId = onlySharedParentId.replace(/'/g, "''");
      const sharedParentTypeRows = await this.siyuanApi.sql<BlockTypeRow>(`
        SELECT type
        FROM blocks
        WHERE id = '${safeOnlySharedParentId}'
        LIMIT 1
      `);
      if (sharedParentTypeRows && sharedParentTypeRows.length > 0 && sharedParentTypeRows[0]?.type === 'l') {
        summaryAnswerBlockId = onlySharedParentId;
      }
    }

    if (!summaryAnswerBlockId) {
      const safeParentBlockId = command.parentBlockId.replace(/'/g, "''");
      const directContainerRows = await this.siyuanApi.sql<BlockIdRow>(`
        SELECT id
        FROM blocks
        WHERE parent_id = '${safeParentBlockId}'
          AND type = 'l'
        ORDER BY sort ASC, id ASC
        LIMIT 1
      `);
      if (directContainerRows && directContainerRows.length > 0 && typeof directContainerRows[0]?.id === 'string') {
        summaryAnswerBlockId = directContainerRows[0].id as string;
      }
    }

    if (!summaryAnswerBlockId) {
      summaryAnswerBlockId = representative.paragraphId;
    }

    const summaryTargetAttrs = await this.siyuanApi.getBlockAttrs(summaryAnswerBlockId);
    const existingSummaryXiuyuanId = getExistingXiuyuanId(summaryTargetAttrs);
    if (existingSummaryXiuyuanId) {
      return ok({
        mode: 'summary-v1',
        parentBlockId: command.parentBlockId,
        parentParagraphId,
        totalChildren: childrenData.length,
        created: [],
        skippedChildBlockIds: [...command.childBlockIds],
      });
    }

    const xiuyuanIdResult = XiuyuanId.create(`xy_${summaryAnswerBlockId}`);
    if (isErr(xiuyuanIdResult)) {
      return err(this.toError(xiuyuanIdResult.error, 'Invalid Xiuyuan ID'));
    }

    const blockIdResults = [summaryAnswerBlockId, parentParagraphId].map((id) => BlockId.create(id));
    const blockIds: BlockId[] = [];
    for (const blockIdResult of blockIdResults) {
      if (isErr(blockIdResult)) {
        return err(this.toError(blockIdResult.error, 'Invalid block ID'));
      }
      blockIds.push(blockIdResult.value);
    }

    const faceResult = CardFace.create({
      question: parentParagraphId,
      answer: summaryAnswer,
      questionBlockId: parentParagraphId,
      answerBlockId: summaryAnswerBlockId,
    });
    if (isErr(faceResult)) {
      return err(this.toError(faceResult.error, 'Failed to create summary list-template face'));
    }

    const xiuyuanResult = Xiuyuan.create({
      id: xiuyuanIdResult.value,
      blockIDs: blockIds,
      templateID: templateId,
      faces: [faceResult.value],
      priority,
      meta: {
        schedulerType: 'fsrs-v6',
        ...(command.cardType ? { cardType: command.cardType } : {}),
        listTemplate: {
          mode: 'summary-v1',
          groupId: `lt_summary_${command.parentBlockId}`,
          parentBlockId: command.parentBlockId,
          parentParagraphId,
          currentIndex: 0,
          childrenData: [
            {
              id: summaryAnswerBlockId,
              cue: summaryCue,
              answer: summaryAnswer,
              index: 0,
              source: summaryAnswer,
              ...(sharedDirectPath ? { directPath: sharedDirectPath } : {}),
            },
          ],
          sourceChildIds: childrenData.map((child) => child.listItemId),
          ...listMetaBase,
        },
      },
    });
    if (isErr(xiuyuanResult)) {
      return err(this.toError(xiuyuanResult.error, 'Failed to create summary Xiuyuan aggregate'));
    }

    const creationResult = await finalizeXiuyuanCreation({
      xiuyuan: xiuyuanResult.value,
      xiuyuanRepository: this.xiuyuanRepository,
      eventBus: this.eventBus,
      logger,
      siyuanApi: this.siyuanApi,
      riff: {
        deckId: command.deckId,
        blockIds: [summaryAnswerBlockId],
        source: 'list-template-creation',
        context: {
          blockId: summaryAnswerBlockId,
          representativeBlockId: summaryAnswerBlockId,
          parentBlockId: command.parentBlockId,
          parentParagraphId,
          mode: 'summary-v1',
        },
      },
    });

    if (isErr(creationResult)) {
      return err(this.toError(creationResult.error, 'Failed to finalize summary list-template Xiuyuan'));
    }

    return ok({
      mode: 'summary-v1',
      parentBlockId: command.parentBlockId,
      parentParagraphId,
      totalChildren: childrenData.length,
      created: [
        {
          childBlockId: representative.listItemId,
          xiuyuanId: creationResult.value.xiuyuan.id,
          cardIds: creationResult.value.cards.map((card) => card.id),
        },
      ],
      skippedChildBlockIds,
    });
  }

  private toError(error: unknown, defaultMessage: string): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string' && error.length > 0) {
      return new Error(error);
    }
    return new Error(defaultMessage);
  }

  private async buildSharedDirectPath(
    command: CreateListTemplateCardsCommand,
    parentParagraphId: string,
  ): Promise<CdfDirectPathSegment[] | undefined> {
    const path: CdfDirectPathSegment[] = [];

    if (command.listKind === 'descriptor-multiline') {
      const conceptSourceId = command.conceptBlockId?.trim();
      const conceptLabel = await this.loadDirectPathLabel(conceptSourceId);
      if (conceptLabel) {
        path.push({
          kind: 'concept',
          label: conceptLabel,
          ...(conceptSourceId ? { blockId: conceptSourceId } : {}),
        });
      }

      const groupLabel = await this.loadDirectPathLabel(parentParagraphId);
      if (groupLabel) {
        path.push({
          kind: 'group',
          label: groupLabel,
          blockId: parentParagraphId,
        });
      }
    } else if (command.listKind === 'concept-multiline') {
      const conceptSourceId = (command.conceptBlockId || parentParagraphId).trim();
      const conceptLabel = await this.loadDirectPathLabel(conceptSourceId);
      if (conceptLabel) {
        path.push({
          kind: 'concept',
          label: conceptLabel,
          blockId: conceptSourceId,
        });
      }
    }

    return path.length > 0 ? path : undefined;
  }

  private async loadDirectPathLabel(blockId?: string): Promise<string> {
    if (!blockId) {
      return '';
    }

    try {
      const { kramdown } = await this.siyuanApi.getBlockKramdown(blockId);
      return normalizeCdfDirectLabel(String(kramdown || ''));
    } catch (error) {
      logger.warn('[CreateListTemplateCardsUseCase] Failed to load direct-path label:', {
        blockId,
        error,
      });
      return '';
    }
  }
}
