import type { CardType, AnswerSyntaxReason, NativeFlashcardKind } from './detectionRules';

export interface TopicItemDetectionConfig {
  mark: boolean;
  list: boolean;
  heading: boolean;
  superBlock: boolean;
}

export interface TopicItemDetectionPolicyInput {
  blockType?: string | null;
  syntaxReasons?: AnswerSyntaxReason[];
  matchedFlashcardKinds?: NativeFlashcardKind[];
  flashcardConfig: TopicItemDetectionConfig;
}

export interface TopicItemDetectionPolicyResult {
  cardType: CardType;
  matchedFlashcardKinds: NativeFlashcardKind[];
  pluginSemanticReasons: AnswerSyntaxReason[];
}

const PLUGIN_SEMANTIC_REASONS = new Set<AnswerSyntaxReason>([
  'separator-colon',
  'separator-semicolon',
  'direction-symbol',
  'cloze-double-brace',
  'cloze-latex-numbered',
]);

function uniqueKinds(kinds: NativeFlashcardKind[]): NativeFlashcardKind[] {
  return Array.from(new Set(kinds));
}

export function resolveTopicItemCardType(
  input: TopicItemDetectionPolicyInput
): TopicItemDetectionPolicyResult {
  const blockType = input.blockType || '';
  const syntaxReasons = input.syntaxReasons || [];
  const matchedFlashcardKinds = uniqueKinds(input.matchedFlashcardKinds || []);
  const pluginSemanticReasons = syntaxReasons.filter((reason) => PLUGIN_SEMANTIC_REASONS.has(reason));

  if (blockType === 'd') {
    return {
      cardType: 'topic',
      matchedFlashcardKinds,
      pluginSemanticReasons,
    };
  }

  if (pluginSemanticReasons.length > 0) {
    return {
      cardType: 'item',
      matchedFlashcardKinds,
      pluginSemanticReasons,
    };
  }

  const enabledNativeKinds = matchedFlashcardKinds.filter((kind) => {
    switch (kind) {
      case 'mark':
        return input.flashcardConfig.mark;
      case 'list':
        return input.flashcardConfig.list;
      case 'heading':
        return input.flashcardConfig.heading;
      case 'superBlock':
        return input.flashcardConfig.superBlock;
      default:
        return false;
    }
  });

  return {
    cardType: enabledNativeKinds.length > 0 ? 'item' : 'topic',
    matchedFlashcardKinds,
    pluginSemanticReasons,
  };
}
