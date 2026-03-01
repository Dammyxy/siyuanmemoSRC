export type CardType = 'topic' | 'item';

export type DetectionMode = 'basic' | 'extended';

export type AnswerSyntaxReason =
  | 'mark-equals'
  | 'separator-colon'
  | 'cloze-latex-numbered'
  | 'cloze-double-brace'
  | 'siyuan-mark-span'
  | 'separator-semicolon'
  | 'direction-symbol';

export function detectAnswerSyntax(
  markdown: string,
  content: string,
  mode: DetectionMode = 'extended'
): AnswerSyntaxReason | null {
  const markdownText = String(markdown || '');
  const contentText = String(content || '');

  if (/==([^=]+)==/.test(markdownText) || /==([^=]+)==/.test(contentText)) {
    return 'mark-equals';
  }

  if (/::/.test(contentText)) {
    return 'separator-colon';
  }

  if (/\\cloze\{c\d+\}\{/.test(markdownText) || /\\cloze\{c\d+\}\{/.test(contentText)) {
    return 'cloze-latex-numbered';
  }

  if (mode === 'basic') {
    return null;
  }

  if (/\{\{.+?\}\}/.test(contentText)) {
    return 'cloze-double-brace';
  }

  if (/<span data-type="mark">/.test(markdownText) || /<span data-type="mark">/.test(contentText)) {
    return 'siyuan-mark-span';
  }

  if (/;;/.test(contentText)) {
    return 'separator-semicolon';
  }

  if (/>>/.test(contentText) || /<</.test(contentText) || /<>/.test(contentText)) {
    return 'direction-symbol';
  }

  return null;
}

export function detectTypeByStructure(params: {
  blockType: string | null;
  hasListChildren: boolean;
  hasAnyChildren: boolean;
}): CardType {
  const { blockType, hasListChildren, hasAnyChildren } = params;

  if (blockType === 'h') {
    return 'item';
  }

  if (blockType === 'i') {
    return hasListChildren ? 'item' : 'topic';
  }

  if (blockType === 's') {
    return hasAnyChildren ? 'item' : 'topic';
  }

  return 'topic';
}
