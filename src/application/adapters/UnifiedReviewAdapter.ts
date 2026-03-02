import type { IAdapter, AdapterContext, ReviewUIState, ReviewCardKind } from '@/ui/review/v2/types';
import type { FSRSCard } from '@/types/card';
import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueStats } from '@/core/queue/types';
import { isXiuyuanCard } from '@/core/xiuyuan/cardMeta';
import { createLogger } from '@/utils/logger';

const logger = createLogger('UnifiedReviewAdapter');

type RatingValue = 1 | 2 | 3 | 4;
type NextDuesMap = Partial<Record<RatingValue, string>>;

type UnifiedReviewItem = FSRSCard & {
    blockID?: string;
    cardID?: string;
    deckID?: string;
    deckId?: string;
    nextDues?: NextDuesMap;
};

type QueueWithType = {
    getType: () => string;
};

const ANSWER_TEMPLATE_IDS = new Set<string>([
    'builtin-list-item',
    'builtin-basic-qa',
    'builtin-bidirectional',
]);

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
    return i18n?.[key] || fallback;
}

function hasQueueType(queue: unknown): queue is QueueWithType {
    return typeof queue === 'object'
        && queue !== null
        && 'getType' in queue
        && typeof (queue as QueueWithType).getType === 'function';
}

function resolveBlockId(item: UnifiedReviewItem): string {
    return item.blockID ?? item.blockId ?? item.id ?? item.cardID ?? '';
}

function resolveCardId(item: UnifiedReviewItem): string {
    return item.cardID ?? item.id ?? '';
}

function resolveDeckId(item: UnifiedReviewItem): string {
    return item.deckID ?? item.deckId ?? '';
}

function getNextDue(item: UnifiedReviewItem, rating: RatingValue): string {
    return item.nextDues?.[rating] ?? '';
}

function normalizeCardType(type: unknown): ReviewCardKind {
    const value = String(type ?? 'item');
    if (value === 'topic') return 'topic';
    if (value === 'concept') return 'concept';
    if (value === 'descriptor') return 'descriptor';
    if (value === 'cloze') return 'cloze';
    return 'item';
}

function resolveContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
    if (card.type === 'descriptor' && isXiuyuanCard(card)) {
        const descriptorId = card.meta.fieldMapping?.descriptor;
        if (descriptorId) {
            logger.debug('Descriptor card uses descriptor field for content block', { descriptorId });
            return descriptorId;
        }

        if (fallbackBlockId) {
            logger.debug('Descriptor card uses representative block for content block', { fallbackBlockId });
            return fallbackBlockId;
        }

        if (card.meta.frontBlockIDs.length > 1) {
            const descriptorFromFrontBlocks = card.meta.frontBlockIDs[1];
            logger.debug('Descriptor card falls back to second front block for content block', {
                descriptorFromFrontBlocks,
            });
            return descriptorFromFrontBlocks;
        }

        if (card.meta.frontBlockIDs.length > 0) {
            const fallbackFrontBlockId = card.meta.frontBlockIDs[0];
            logger.warn('Descriptor card falls back to first front block for content block', {
                fallbackFrontBlockId,
            });
            return fallbackFrontBlockId;
        }

        logger.warn('Descriptor card has no resolvable content block ID', {
            cardId: card.id,
        });
        return '';
    }

    if (isXiuyuanCard(card) && card.meta.frontBlockIDs.length > 0) {
        return card.meta.frontBlockIDs[0];
    }

    return fallbackBlockId;
}

function resolveAnswerBlockId(card: UnifiedReviewItem): string {
    if (!isXiuyuanCard(card)) {
        return '';
    }

    const templateID = card.meta.templateID;
    const backBlockIDs = card.meta.backBlockIDs;
    if (ANSWER_TEMPLATE_IDS.has(templateID) && backBlockIDs.length > 0) {
        return backBlockIDs[0];
    }

    return '';
}

function normalizeStats(stats: QueueStats | undefined): { size: number; label: string } {
    if (!stats) {
        return { size: 0, label: '' };
    }
    return {
        size: stats.size,
        label: stats.label ?? '',
    };
}

export class UnifiedReviewAdapter implements IAdapter<UnifiedReviewItem> {
    private readonly i18n?: Record<string, string>;

    constructor(options?: { i18n?: Record<string, string> }) {
        this.i18n = options?.i18n;
    }

    async toUIState(
        queue: IQueueStrategy<UnifiedReviewItem>,
        item: UnifiedReviewItem | null,
        context: AdapterContext
    ): Promise<ReviewUIState> {
        const queueType = hasQueueType(queue) ? queue.getType() : '';
        const isFilterGroup = queueType === 'filter-group';

        const toolbarWithFilterScope = (
            base: NonNullable<ReviewUIState['header']['toolbar']>
        ): NonNullable<ReviewUIState['header']['toolbar']> => {
            if (!isFilterGroup) {
                return base;
            }
            return [
                ...base,
                {
                    icon: '#iconFilter',
                    type: 'plan-review-scope',
                    label: t(this.i18n, 'planReviewScope', '规划复习范围'),
                    ariaLabel: t(this.i18n, 'planReviewScope', '规划复习范围'),
                },
            ];
        };

        if (!item) {
            return {
                header: {
                    title: t(this.i18n, 'reviewTitle', 'Review'),
                    stats: { current: 0, total: 0, label: '', queueName: '', newCards: 0, reviewCards: 0 },
                    breadcrumbs: [],
                    toolbar: toolbarWithFilterScope([
                        { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
                        { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
                    ]),
                },
                content: {
                    type: 'empty',
                    data: '',
                    id: '',
                },
                actions: {
                    showAnswer: false,
                    grades: [],
                    menu: [],
                },
                meta: {
                    transition: 'fade',
                    hasHiddenContent: false,
                },
                overlay: null,
            };
        }

        const stats = normalizeStats(await queue.getStats?.());
        const uiConfig = queue.getUIConfig(item);
        const blockId = resolveBlockId(item);
        const cardId = resolveCardId(item);
        const cardType = normalizeCardType(item.type);

        const isNeuralRoam = queueType === 'neural-roam';

        let toolbar: NonNullable<ReviewUIState['header']['toolbar']> = [
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
            { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
            { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', 'Open By') },
        ];
        if (isNeuralRoam) {
            toolbar.push(
                { icon: '#iconLock', type: 'lock-focus', ariaLabel: t(this.i18n, 'lockAsFocus', 'Start New Worldline') },
                { icon: '#iconList', type: 'neural-focuses', ariaLabel: t(this.i18n, 'neuralFocusMenu', 'Roam Seeds') },
                { icon: '#iconHistory', type: 'neural-history', ariaLabel: t(this.i18n, 'neuralHistoryMenu', 'Roam Path') }
            );
        }
        toolbar = toolbarWithFilterScope(toolbar);

        const contentBlockId = resolveContentBlockId(item, blockId);
        const answerBlockID = resolveAnswerBlockId(item);

        logger.debug('Building review UI state', {
            cardId,
            blockId,
            cardType,
            isXiuyuan: isXiuyuanCard(item),
            contentBlockId,
        });

        return {
            header: {
                title: t(this.i18n, 'reviewTitle', 'Review'),
                stats: {
                    current: stats.size,
                    total: stats.size,
                    label: stats.label,
                    queueName: t(this.i18n, 'unifiedQueue', 'Unified Queue'),
                    newCards: 0,
                    reviewCards: stats.size,
                    currentNewCards: 0,
                    currentReviewCards: stats.size,
                },
                breadcrumbs: [],
                toolbar,
            },
            content: {
                type: 'protyle',
                data: contentBlockId,
                id: contentBlockId,
                answerBlockID,
                card: item,
                isXiuyuanListTemplate: isXiuyuanCard(item) && item.meta.templateID === 'builtin-list-item',
                xiuyuanMeta: isXiuyuanCard(item) ? item.meta : null,
            },
            actions: {
                showAnswer: !context.showAnswer,
                grades: uiConfig.showRatingButtons ? [
                    { label: t(this.i18n, 'cardRatingAgain', 'Again'), value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '🙈', nextDue: getNextDue(item, 1) },
                    { label: t(this.i18n, 'cardRatingHard', 'Hard'), value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '😬', nextDue: getNextDue(item, 2) },
                    { label: t(this.i18n, 'cardRatingGood', 'Good'), value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '😊', nextDue: getNextDue(item, 3) },
                    { label: t(this.i18n, 'cardRatingEasy', 'Easy'), value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '🌈', nextDue: getNextDue(item, 4) },
                ] : [],
                menu: [],
                cardMeta: {
                    blockID: blockId,
                    cardID: cardId,
                    deckID: resolveDeckId(item),
                    reps: item.reps,
                    lapses: item.lapses,
                    state: item.state,
                    lastReview: item.lastReview,
                    isReviewCard: item.reps > 0,
                    type: cardType,
                    cardType,
                },
            },
            meta: {
                transition: 'slide-left',
                hasHiddenContent: !context.showAnswer,
                remainingSize: stats.size,
            },
            overlay: null,
        };
    }

    async fetchAuxiliaryData(item: UnifiedReviewItem | null): Promise<Partial<ReviewUIState>> {
        if (!item) {
            return {};
        }
        return {};
    }

    cleanup(): void {
        // No disposable resources.
    }
}
