export type AIFlashcardInlineCardMode = 'quick' | 'bidirectional-single' | 'multi-cloze' | 'concept';
export type AIFlashcardCdfMode = 'concept-multiline' | 'descriptor-multiline';

export interface AIFlashcardInlineCardConfig {
  templateId: string;
  cardType: 'item' | 'cloze' | 'concept';
  creationMode: string;
}

export interface AIFlashcardCdfListConfig {
  templateId: 'builtin-list-concept-multiline' | 'builtin-list-descriptor-multiline';
  cardType: 'item' | 'descriptor';
  listKind: AIFlashcardCdfMode;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseClozeMarkers(content: string): Array<{ text: string; start: number; end: number; type: string }> {
  const markers: Array<{ text: string; start: number; end: number; type: string }> = [];
  const regex = /==([\s\S]+?)==/g;
  let match: RegExpExecArray | null = regex.exec(content);
  while (match) {
    const raw = match[1] || '';
    markers.push({
      text: raw,
      start: match.index,
      end: match.index + match[0].length,
      type: 'text',
    });
    match = regex.exec(content);
  }
  return markers;
}

export class AIFlashcardCardResolutionRuntime {
  resolveInlineCardConfig(modeInput: unknown): AIFlashcardInlineCardConfig {
    const mode = (normalizeString(modeInput) || 'quick') as AIFlashcardInlineCardMode;
    const config = {
      quick: { templateId: 'builtin-quick-card', cardType: 'item' as const, creationMode: 'ai-tool:quick-card' },
      'bidirectional-single': { templateId: 'builtin-bidirectional-single', cardType: 'item' as const, creationMode: 'ai-tool:bidirectional-single' },
      'multi-cloze': { templateId: 'builtin-multi-cloze', cardType: 'cloze' as const, creationMode: 'ai-tool:multi-cloze' },
      concept: { templateId: 'builtin-concept-simple', cardType: 'concept' as const, creationMode: 'ai-tool:concept-card' },
    }[mode];
    if (!config) {
      throw new Error(`不支持的 inline 模式：${mode}`);
    }
    return config;
  }

  resolveCdfMode(modeInput: unknown): AIFlashcardCdfMode {
    return normalizeString(modeInput) === 'descriptor-multiline'
      ? 'descriptor-multiline'
      : 'concept-multiline';
  }

  resolveCdfListConfig(modeInput: unknown): AIFlashcardCdfListConfig {
    const mode = this.resolveCdfMode(modeInput);
    return mode === 'descriptor-multiline'
      ? {
        templateId: 'builtin-list-descriptor-multiline',
        cardType: 'descriptor',
        listKind: mode,
      }
      : {
        templateId: 'builtin-list-concept-multiline',
        cardType: 'item',
        listKind: mode,
      };
  }

  resolveListCardType(cardTypeInput: unknown): 'item' | 'descriptor' {
    return normalizeString(cardTypeInput) === 'descriptor' ? 'descriptor' : 'item';
  }
}
