import { CardType, type FSRSCard } from '@/types/card';
import { isConceptCard } from '@/core/xiuyuan/cardMeta';
import type { ReviewMenuItem } from './reviewMoreMenuItems';
import type { ReviewConceptRoamTarget } from './reviewConceptRoam';

type ReviewTranslate = (key: string, fallback: string) => string;

type ReviewNeuralEntryActionServiceLike = {
  startTemporaryCurrentBlockRoam?: (input: {
    blockId: string;
    seedBlockId?: string | null;
    conceptBlockId?: string | null;
    sourceReviewCardId?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  startTemporaryConceptRoam?: (input: {
    conceptBlockId: string;
    conceptCardId?: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  establishStation?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
  establishStationAndStartRoam?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
  makeConceptOnly?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
  makeConceptAndAddToQueue?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
  makeConceptAndStartRoam?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
  addExistingConceptToQueue?: (blockId: string) => Promise<{ ok: boolean; message?: string }>;
};

export type ReviewNeuralEntryMenuRunAction = (
  label: string,
  action: () => Promise<{ ok: boolean; message?: string } | undefined>,
) => void;

export type BuildReviewNeuralEntryMenuItemsInput = {
  t: ReviewTranslate;
  currentCard: FSRSCard | null | undefined;
  currentBlockId: string;
  currentCardId: string;
  conceptTargets: ReviewConceptRoamTarget[];
  entryActionService: ReviewNeuralEntryActionServiceLike | null | undefined;
  runAction: ReviewNeuralEntryMenuRunAction;
};

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function isConceptReviewCard(card: FSRSCard | null | undefined): boolean {
  if (!card) {
    return false;
  }
  const metaMarker = typeof card.meta?.cardTypeMarker === 'string' ? card.meta.cardTypeMarker : '';
  return card.type === CardType.Concept
    || card.type === 'concept'
    || card.cardTypeMarker === 'concept'
    || metaMarker === 'concept'
    || isConceptCard(card);
}

function buildConceptTemporaryItem(
  input: BuildReviewNeuralEntryMenuItemsInput,
): ReviewMenuItem | null {
  const { t, conceptTargets, entryActionService, runAction } = input;
  if (!entryActionService?.startTemporaryConceptRoam || conceptTargets.length === 0) {
    return null;
  }

  const runConcept = (target: ReviewConceptRoamTarget) => runAction(
    t('temporaryRoamFromConcept', '从概念临时漫游'),
    () => entryActionService.startTemporaryConceptRoam?.({
      conceptBlockId: target.focusBlockId,
    }),
  );

  if (conceptTargets.length === 1) {
    return {
      id: 'temporary-concept-roam',
      icon: 'iconGraph',
      label: t('temporaryRoamFromConcept', '从概念临时漫游'),
      click: () => runConcept(conceptTargets[0]),
    };
  }

  return {
    id: 'temporary-concept-roam',
    icon: 'iconGraph',
    label: t('temporaryRoamFromConcept', '从概念临时漫游'),
    submenu: conceptTargets.map((target) => ({
      id: `temporary-concept-roam-${target.focusBlockId}`,
      icon: 'iconGraph',
      label: target.label || target.focusBlockId,
      click: () => runConcept(target),
    })),
  };
}

function group(label: string, submenu: Array<ReviewMenuItem | null>): ReviewMenuItem | null {
  const items = submenu.filter((item): item is ReviewMenuItem => Boolean(item));
  if (items.length === 0) {
    return null;
  }
  return { label, submenu: items };
}

export function buildReviewNeuralEntryMenuItems(input: BuildReviewNeuralEntryMenuItemsInput): ReviewMenuItem[] {
  const { t, currentCard, currentBlockId, currentCardId, conceptTargets, entryActionService, runAction } = input;
  const blockId = normalizeId(currentBlockId);
  if (!blockId || !entryActionService) {
    return [];
  }

  const isConcept = isConceptReviewCard(currentCard);
  const currentBlockSeedTarget = !isConcept && conceptTargets.length === 1
    ? normalizeId(conceptTargets[0].focusBlockId)
    : '';
  const temporaryItems: Array<ReviewMenuItem | null> = [
    isConcept || !entryActionService.startTemporaryCurrentBlockRoam
      ? null
      : {
          id: 'temporary-current-block-roam',
          icon: 'iconGraph',
          label: t('temporaryRoamFromCurrentBlock', '从当前块临时漫游'),
          click: () => runAction(
            t('temporaryRoamFromCurrentBlock', '从当前块临时漫游'),
            () => entryActionService.startTemporaryCurrentBlockRoam?.({
              blockId,
              sourceReviewCardId: currentCardId || null,
              seedBlockId: currentBlockSeedTarget || null,
              conceptBlockId: currentBlockSeedTarget || null,
            }),
          ),
        },
    buildConceptTemporaryItem(input),
  ];

  const startItems: Array<ReviewMenuItem | null> = isConcept
    ? [
        entryActionService.makeConceptAndStartRoam
          ? {
              id: 'concept-card-and-roam',
              icon: 'iconPlay',
              label: t('addConceptToNeuralQueueAndRoam', '加入神经漫游当前航线并立即漫游'),
              click: () => runAction(
                t('addConceptToNeuralQueueAndRoam', '加入神经漫游当前航线并立即漫游'),
                () => entryActionService.makeConceptAndStartRoam?.(blockId),
              ),
            }
          : null,
      ]
    : [
        entryActionService.establishStationAndStartRoam
          ? {
              id: 'station-and-roam',
              icon: 'iconPlay',
              label: t('establishStationAndStartRoam', '建立为空间站并立即漫游'),
              click: () => runAction(
                t('establishStationAndStartRoam', '建立为空间站并立即漫游'),
                () => entryActionService.establishStationAndStartRoam?.(blockId),
              ),
            }
          : null,
        entryActionService.makeConceptAndStartRoam
          ? {
              id: 'make-concept-and-roam',
              icon: 'iconPlay',
              label: t('makeConceptCardAndRoam', '制作为概念卡并立即漫游'),
              click: () => runAction(
                t('makeConceptCardAndRoam', '制作为概念卡并立即漫游'),
                () => entryActionService.makeConceptAndStartRoam?.(blockId),
              ),
            }
          : null,
      ];

  const establishItems: Array<ReviewMenuItem | null> = isConcept
    ? [
        entryActionService.addExistingConceptToQueue
          ? {
              id: 'add-existing-concept-to-queue',
              icon: 'iconRiffCard',
              label: t('addToNeuralRoamQueue', '加入神经漫游当前航线'),
              click: () => runAction(
                t('addToNeuralRoamQueue', '加入神经漫游当前航线'),
                () => entryActionService.addExistingConceptToQueue?.(blockId),
              ),
            }
          : null,
      ]
    : [
        entryActionService.establishStation
          ? {
              id: 'establish-station',
              icon: 'iconPin',
              label: t('establishStation', '建立为空间站'),
              click: () => runAction(
                t('establishStation', '建立为空间站'),
                () => entryActionService.establishStation?.(blockId),
              ),
            }
          : null,
        entryActionService.makeConceptOnly
          ? {
              id: 'make-concept',
              icon: 'iconRiffCard',
              label: t('makeConceptCard', '制作为概念卡'),
              click: () => runAction(
                t('makeConceptCard', '制作为概念卡'),
                () => entryActionService.makeConceptOnly?.(blockId),
              ),
            }
          : null,
        entryActionService.makeConceptAndAddToQueue
          ? {
              id: 'make-concept-and-add-to-queue',
              icon: 'iconRiffCard',
              label: t('makeConceptCardAndAddToQueue', '制作为概念卡并加入当前航线'),
              click: () => runAction(
                t('makeConceptCardAndAddToQueue', '制作为概念卡并加入当前航线'),
                () => entryActionService.makeConceptAndAddToQueue?.(blockId),
              ),
            }
          : null,
      ];

  return [
    group(t('temporaryRoamGroup', '临时漫游'), temporaryItems),
    group(t('establishAndRoamGroup', '建立并漫游'), startItems),
    group(t('establishGroup', '建立'), establishItems),
  ].filter((item): item is ReviewMenuItem => Boolean(item));
}
