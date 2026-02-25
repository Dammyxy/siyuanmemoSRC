import { getBlockKramdown, sql } from '@/core/siyuan/api';
import { createLogger } from '@/utils/logger';

const logger = createLogger('XiuyuanConceptLocator');

export type LocatedConceptType = 'block-ref' | 'heading' | 'document';

export interface LocatedConcept {
  conceptId: string;
  conceptType: LocatedConceptType;
}

async function getParentId(blockId: string): Promise<string | null> {
  const query = `
    SELECT parent_id
    FROM blocks
    WHERE id = '${blockId}'
    LIMIT 1
  `;
  const result = await sql(query);
  if (!result || result.length === 0 || !result[0]?.parent_id) {
    return null;
  }
  return result[0].parent_id;
}

async function getBlockType(blockId: string): Promise<string | null> {
  const query = `
    SELECT type
    FROM blocks
    WHERE id = '${blockId}'
    LIMIT 1
  `;
  const result = await sql(query);
  if (!result || result.length === 0) {
    return null;
  }
  return result[0].type ?? null;
}

async function hasListItemParent(blockId: string): Promise<boolean> {
  let currentId = blockId;
  const maxDepth = 10;

  for (let depth = 0; depth < maxDepth; depth++) {
    const parentId = await getParentId(currentId);
    if (!parentId) {
      break;
    }

    const parentType = await getBlockType(parentId);
    if (parentType === 'i') {
      logger.debug(`Found list item parent at depth ${depth}:`, parentId);
      return true;
    }

    if (parentType === 'd') {
      logger.debug('Reached document block without finding list parent');
      break;
    }

    currentId = parentId;
  }

  return false;
}

async function findConceptInListParent(blockId: string): Promise<LocatedConcept | null> {
  let currentId = blockId;
  const maxDepth = 4;

  for (let depth = 0; depth < maxDepth; depth++) {
    const parentId = await getParentId(currentId);
    if (!parentId) {
      break;
    }

    logger.debug(`Checking parent at depth ${depth}:`, parentId);

    const { kramdown: parentContent } = await getBlockKramdown(parentId);
    if (parentContent) {
      const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
      const matches = [...parentContent.matchAll(refPattern)];
      logger.debug(`Found ${matches.length} block references at depth ${depth}`);

      for (const match of matches) {
        const refId = match[1];
        const refType = await getBlockType(refId);

        if (!refType) {
          logger.debug(`Block reference target not found: ${refId}`);
          continue;
        }

        if (refType !== 'd') {
          logger.debug(`Block reference is not a document block, skipping: ${refId}`);
          continue;
        }

        logger.debug(`Found document block reference at depth ${depth}: ${refId}`);
        return { conceptId: refId, conceptType: 'block-ref' };
      }
    }

    currentId = parentId;
  }

  return null;
}

async function findConceptWithoutListParent(blockId: string): Promise<LocatedConcept | null> {
  let currentId = blockId;
  let firstHeadingId: string | null = null;
  let documentId: string | null = null;
  const maxDepth = 20;

  for (let depth = 0; depth < maxDepth; depth++) {
    const parentId = await getParentId(currentId);
    if (!parentId) {
      break;
    }

    const parentQuery = `
      SELECT type, content
      FROM blocks
      WHERE id = '${parentId}'
      LIMIT 1
    `;
    const parentResult = await sql(parentQuery);

    if (parentResult && parentResult.length > 0) {
      const parentType = parentResult[0].type;
      const parentContent = parentResult[0].content;

      if (parentType === 'h' && !firstHeadingId) {
        firstHeadingId = parentId;
        logger.debug(`Found first heading block: ${parentId}`, parentContent);
      }

      if (parentType === 'd') {
        documentId = parentId;
        logger.debug(`Found document block: ${parentId}`);
        break;
      }
    }

    currentId = parentId;
  }

  if (firstHeadingId) {
    logger.debug(`Using heading block as concept: ${firstHeadingId}`);
    return { conceptId: firstHeadingId, conceptType: 'heading' };
  }

  if (documentId) {
    logger.debug(`Using document block as concept: ${documentId}`);
    return { conceptId: documentId, conceptType: 'document' };
  }

  return null;
}

export async function findConceptByUpwardSearch(blockId: string): Promise<LocatedConcept | null> {
  const listParent = await hasListItemParent(blockId);
  logger.debug('Has list item parent:', listParent);

  if (listParent) {
    const conceptFromRef = await findConceptInListParent(blockId);
    if (conceptFromRef) {
      return conceptFromRef;
    }
    logger.debug('No block reference found, fallback to heading/document');
  }

  const concept = await findConceptWithoutListParent(blockId);
  if (concept) {
    return concept;
  }

  logger.warn('No concept found');
  return null;
}
