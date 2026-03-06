export type CardType = 'topic' | 'item';
export type NativeFlashcardKind = 'mark' | 'list' | 'heading' | 'superBlock';

export type DetectionMode = 'basic' | 'extended';

export type AnswerSyntaxReason =
  | 'mark-equals'
  | 'separator-colon'
  | 'cloze-latex-numbered'
  | 'cloze-double-brace'
  | 'siyuan-mark-span'
  | 'separator-semicolon'
  | 'direction-symbol';

export function detectAnswerSyntaxReasons(
  markdown: string,
  content: string,
  mode: DetectionMode = 'extended'
): AnswerSyntaxReason[] {
  const reasons: AnswerSyntaxReason[] = [];
  const markdownText = String(markdown || '');
  const contentText = String(content || '');

  if (/==([^=]+)==/.test(markdownText) || /==([^=]+)==/.test(contentText)) {
    reasons.push('mark-equals');
  }

  if (/::/.test(contentText)) {
    reasons.push('separator-colon');
  }

  if (/\\cloze\{c\d+\}\{/.test(markdownText) || /\\cloze\{c\d+\}\{/.test(contentText)) {
    reasons.push('cloze-latex-numbered');
  }

  if (mode === 'basic') {
    return reasons;
  }

  if (/\{\{.+?\}\}/.test(contentText)) {
    reasons.push('cloze-double-brace');
  }

  if (/<span data-type="mark">/.test(markdownText) || /<span data-type="mark">/.test(contentText)) {
    reasons.push('siyuan-mark-span');
  }

  if (/;;/.test(contentText)) {
    reasons.push('separator-semicolon');
  }

  if (/>>/.test(contentText) || /<</.test(contentText) || /<>/.test(contentText)) {
    reasons.push('direction-symbol');
  }

  return reasons;
}

export function detectAnswerSyntax(
  markdown: string,
  content: string,
  mode: DetectionMode = 'extended'
): AnswerSyntaxReason | null {
  return detectAnswerSyntaxReasons(markdown, content, mode)[0] || null;
}

export function detectNativeFlashcardKindsFromSyntaxReasons(reasons: AnswerSyntaxReason[]): NativeFlashcardKind[] {
  const kinds = new Set<NativeFlashcardKind>();

  for (const reason of reasons) {
    if (reason === 'mark-equals' || reason === 'siyuan-mark-span') {
      kinds.add('mark');
    }
  }

  return Array.from(kinds);
}

export function detectStructureFlashcardKinds(params: {
  blockType: string | null;
  hasListChildren: boolean;
  hasAnyChildren: boolean;
}): NativeFlashcardKind[] {
  const kinds: NativeFlashcardKind[] = [];
  const { blockType, hasListChildren, hasAnyChildren } = params;

  if (blockType === 'h') {
    kinds.push('heading');
  }

  if (blockType === 'i' && hasListChildren) {
    kinds.push('list');
  }

  if (blockType === 's' && hasAnyChildren) {
    kinds.push('superBlock');
  }

  return kinds;
}

export function detectTypeByStructure(params: {
  blockType: string | null;
  hasListChildren: boolean;
  hasAnyChildren: boolean;
}): CardType {
  return detectStructureFlashcardKinds(params).length > 0 ? 'item' : 'topic';
}
