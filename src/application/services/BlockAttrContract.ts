const ATTR_PREFIX = 'custom-fsrs-';

export const ATTR_CARD_ID = `${ATTR_PREFIX}card-id`;
export const ATTR_PRIORITY = `${ATTR_PREFIX}priority`;
export const ATTR_SUSPENDED = `${ATTR_PREFIX}suspended`;
export const ATTR_IS_FLASHCARD = `${ATTR_PREFIX}flashcard`;
export const ATTR_RIFF_DECKS = 'custom-riff-decks';
export const ATTR_CARD_TYPE = `${ATTR_PREFIX}card-type`;
export const ATTR_A_FACTOR = `${ATTR_PREFIX}a-factor`;

export const ATTR_PROGRESSIVE_KIND = `${ATTR_PREFIX}reading-kind`;
export const ATTR_PROGRESSIVE_SESSION_ID = `${ATTR_PREFIX}reading-session-id`;
export const ATTR_PROGRESSIVE_MODE = `${ATTR_PREFIX}reading-mode`;
export const ATTR_PROGRESSIVE_SOURCE_DOC_ID = `${ATTR_PREFIX}reading-source-doc-id`;
export const ATTR_PROGRESSIVE_SOURCE_BLOCK_ID = `${ATTR_PREFIX}reading-source-block-id`;
export const ATTR_PROGRESSIVE_PIECE_INDEX = `${ATTR_PREFIX}reading-piece-index`;
export const ATTR_PROGRESSIVE_PIECE_COUNT = `${ATTR_PREFIX}reading-piece-count`;
export const ATTR_PROGRESSIVE_PIECE_STATE = `${ATTR_PREFIX}reading-piece-state`;
export const ATTR_PROGRESSIVE_WORKBENCH_ID = `${ATTR_PREFIX}reading-workbench-id`;
export const ATTR_PROGRESSIVE_PARENT_EXCERPT_ID = `${ATTR_PREFIX}reading-parent-excerpt-id`;
export const ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID = `${ATTR_PREFIX}reading-parent-topic-card-id`;
export const ATTR_PROGRESSIVE_STORAGE_MODE = `${ATTR_PREFIX}reading-storage-mode`;
export const ATTR_PROGRESSIVE_CREATION_RULE_ID = `${ATTR_PREFIX}reading-creation-rule-id`;
export const ATTR_PROGRESSIVE_ANSWER_FINGERPRINT = `${ATTR_PREFIX}reading-answer-fingerprint`;

const LEGACY_ATTR_PROGRESSIVE_KIND = `${ATTR_PREFIX}progressive-kind`;
const LEGACY_ATTR_PROGRESSIVE_SESSION_ID = `${ATTR_PREFIX}progressive-session-id`;
const LEGACY_ATTR_PROGRESSIVE_MODE = `${ATTR_PREFIX}progressive-mode`;
const LEGACY_ATTR_PROGRESSIVE_SOURCE_DOC_ID = `${ATTR_PREFIX}progressive-source-doc-id`;
const LEGACY_ATTR_PROGRESSIVE_SOURCE_BLOCK_ID = `${ATTR_PREFIX}progressive-source-block-id`;
const LEGACY_ATTR_PROGRESSIVE_PIECE_INDEX = `${ATTR_PREFIX}progressive-piece-index`;
const LEGACY_ATTR_PROGRESSIVE_PIECE_COUNT = `${ATTR_PREFIX}progressive-piece-count`;
const LEGACY_ATTR_PROGRESSIVE_PIECE_STATE = `${ATTR_PREFIX}progressive-piece-state`;
const LEGACY_ATTR_PROGRESSIVE_WORKBENCH_ID = `${ATTR_PREFIX}progressive-workbench-id`;
const LEGACY_ATTR_PROGRESSIVE_PARENT_EXCERPT_ID = `${ATTR_PREFIX}progressive-parent-excerpt-id`;
const LEGACY_ATTR_PROGRESSIVE_TRACE_KIND = `${ATTR_PREFIX}progressive-trace-kind`;

export function getLegacyProgressiveAttrName(attrName: string): string | null {
  switch (attrName) {
    case ATTR_PROGRESSIVE_KIND:
      return LEGACY_ATTR_PROGRESSIVE_KIND;
    case ATTR_PROGRESSIVE_SESSION_ID:
      return LEGACY_ATTR_PROGRESSIVE_SESSION_ID;
    case ATTR_PROGRESSIVE_MODE:
      return LEGACY_ATTR_PROGRESSIVE_MODE;
    case ATTR_PROGRESSIVE_SOURCE_DOC_ID:
      return LEGACY_ATTR_PROGRESSIVE_SOURCE_DOC_ID;
    case ATTR_PROGRESSIVE_SOURCE_BLOCK_ID:
      return LEGACY_ATTR_PROGRESSIVE_SOURCE_BLOCK_ID;
    case ATTR_PROGRESSIVE_PIECE_INDEX:
      return LEGACY_ATTR_PROGRESSIVE_PIECE_INDEX;
    case ATTR_PROGRESSIVE_PIECE_COUNT:
      return LEGACY_ATTR_PROGRESSIVE_PIECE_COUNT;
    case ATTR_PROGRESSIVE_PIECE_STATE:
      return LEGACY_ATTR_PROGRESSIVE_PIECE_STATE;
    case ATTR_PROGRESSIVE_WORKBENCH_ID:
      return LEGACY_ATTR_PROGRESSIVE_WORKBENCH_ID;
    case ATTR_PROGRESSIVE_PARENT_EXCERPT_ID:
      return LEGACY_ATTR_PROGRESSIVE_PARENT_EXCERPT_ID;
    case `${ATTR_PREFIX}reading-trace-kind`:
      return LEGACY_ATTR_PROGRESSIVE_TRACE_KIND;
    default:
      return null;
  }
}
